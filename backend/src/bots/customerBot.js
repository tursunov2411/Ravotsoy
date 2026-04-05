import {
  createSupabasePublicClient,
  createTelegramClient,
  formatAxiosError,
  readEnv,
} from "./shared.js";
import { createBooking } from "../services/bookingEngine.js";
import { notifyManagerAboutBooking, notifyManagerAboutProof } from "../services/managerNotifications.js";
import { submitBookingProof, upsertTelegramUser } from "../services/proofService.js";

const BUTTONS = {
  packages: "📦 Paketlar",
  availability: "📅 Bo‘sh sanalar",
  booking: "📝 Bron qilish",
  contact: "📞 Aloqa",
};
const CALLBACKS = {
  packagePrefix: "package_",
  datePrefix: "date_",
  confirm: "confirm_booking",
  cancel: "cancel_booking",
};
const MAX_TELEGRAM_CAPTION_LENGTH = 1024;
const MAIN_KEYBOARD = {
  keyboard: [
    [{ text: BUTTONS.packages }, { text: BUTTONS.availability }],
    [{ text: BUTTONS.booking }, { text: BUTTONS.contact }],
  ],
  resize_keyboard: true,
  one_time_keyboard: false,
};
const BOOKING_ID_PATTERN =
  /#?([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i;
const URL_PATTERN = /https?:\/\/\S+/i;
const userState = {};

function formatPrice(value) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("uz-UZ").format(Number.isFinite(amount) ? amount : 0);
}

function formatPackageCaption(item) {
  const caption = [
    item.name,
    "",
    item.description,
    "",
    `Narxi: ${formatPrice(item.base_price)} so'm`,
  ].join("\n");

  if (caption.length <= MAX_TELEGRAM_CAPTION_LENGTH) {
    return caption;
  }

  return `${caption.slice(0, MAX_TELEGRAM_CAPTION_LENGTH - 3)}...`;
}

function normalizeTelegramDisplay(value) {
  const trimmed = String(value ?? "").trim();

  if (!trimmed) {
    return "";
  }

  const normalized = trimmed
    .replace(/^https?:\/\/t\.me\//i, "")
    .replace(/^@/, "")
    .replace(/\/+$/, "");

  return normalized ? `@${normalized}` : trimmed;
}

function parseContactPeople(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = item && typeof item === "object" ? item : {};
      return {
        name: String(record.name ?? "").trim(),
        role: String(record.role ?? "").trim(),
        phone: String(record.phone ?? "").trim(),
        telegram: normalizeTelegramDisplay(record.telegram ?? ""),
      };
    })
    .filter((item) => item.name || item.role || item.phone || item.telegram);
}

function buildContactMessage(hotelName, contacts) {
  if (contacts.length === 0) {
    return `${hotelName}\n\nAloqa ma'lumotlari hozircha qo'shilmagan.`;
  }

  return [
    `${hotelName}`,
    "",
    ...contacts.flatMap((contact, index) => {
      const lines = [];
      const title = [contact.name, contact.role].filter(Boolean).join(" - ");

      if (title) {
        lines.push(title);
      }

      if (contact.phone) {
        lines.push(`Telefon: ${contact.phone}`);
      }

      if (contact.telegram) {
        lines.push(`Telegram: ${contact.telegram}`);
      }

      if (index < contacts.length - 1) {
        lines.push("");
      }

      return lines;
    }),
  ].join("\n").trim();
}

function isStartCommand(text) {
  return /^\/start(?:@\w+)?(?:\s|$)/i.test(text);
}

function getChatState(chatId) {
  return userState[chatId] ?? null;
}

function setChatState(chatId, step, data = {}) {
  userState[chatId] = { step, data };
  return userState[chatId];
}

function clearChatState(chatId) {
  delete userState[chatId];
}

function isPositiveInteger(value) {
  return /^[1-9]\d*$/.test(value);
}

function isValidDateInput(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidLink(value) {
  return /^https?:\/\/\S+$/i.test(String(value ?? "").trim());
}

function extractBookingId(value) {
  const match = String(value ?? "").match(BOOKING_ID_PATTERN);
  return match?.[1] ? String(match[1]) : "";
}

function extractProofLink(value) {
  const match = String(value ?? "").match(URL_PATTERN);
  return match?.[0] ? String(match[0]).trim() : "";
}

function buildTelegramName(user, fallback = "") {
  const parts = [user?.first_name, user?.last_name]
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);

  return parts.join(" ").trim() || fallback;
}

function buildPackageInlineKeyboard(packages) {
  return {
    inline_keyboard: packages.map((item) => [
      {
        text: item.name,
        callback_data: `${CALLBACKS.packagePrefix}${item.id}`,
      },
    ]),
  };
}

function buildBookingConfirmationKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "✅ Tasdiqlash", callback_data: CALLBACKS.confirm }],
      [{ text: "❌ Bekor qilish", callback_data: CALLBACKS.cancel }],
    ],
  };
}

function buildBookingSummary(data) {
  return [
    "Sizning ma'lumotlaringiz:",
    `Ism: ${data.name ?? ""}`,
    `Telefon: ${data.phone ?? ""}`,
    `Odamlar: ${data.guests ?? ""}`,
    `Paket: ${data.package_name ?? ""}`,
    `Sana: ${data.date_start ?? ""}`,
  ].join("\n");
}

function buildPaymentMessage(result) {
  const payment = result?.payment ?? {};
  const lines = [
    "✅ Bron yaratildi!",
    `Bron ID: ${result?.bookingId ?? ""}`,
    `To'lov summasi: ${formatPrice(result?.totalPrice ?? 0)} so'm`,
  ];

  if (payment.cardNumber) {
    lines.push(`Karta raqami: ${payment.cardNumber}`);
  }

  if (payment.cardHolder) {
    lines.push(`Karta egasi: ${payment.cardHolder}`);
  }

  if (payment.managerTelegram) {
    lines.push(`To'lov bo'yicha menejer: @${payment.managerTelegram}`);
  }

  if (payment.instructions) {
    lines.push("");
    lines.push(payment.instructions);
  }

  lines.push("");
  lines.push("💳 To'lovni yakunlash uchun chekni shu chatga foto, PDF yoki link ko'rinishida yuboring.");

  return lines.join("\n");
}

function chunkItems(items, size) {
  const rows = [];

  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }

  return rows;
}

function getLatestPhoto(message) {
  if (!Array.isArray(message?.photo) || message.photo.length === 0) {
    return null;
  }

  return message.photo[message.photo.length - 1];
}

export function createCustomerBot() {
  const telegram = createTelegramClient(readEnv("CUSTOMER_BOT_TOKEN", "BOT_TOKEN"));
  const publicSupabase = createSupabasePublicClient();

  async function fetchPackages() {
    const { data, error } = await publicSupabase
      .from("packages")
      .select("id, name, description, base_price, capacity, media(url)")
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    return (data ?? []).map((item) => ({
      id: String(item.id),
      name: String(item.name ?? ""),
      description: String(item.description ?? ""),
      base_price: Number(item.base_price ?? 0),
      capacity: Number(item.capacity ?? 1),
      imageUrl: Array.isArray(item.media)
        ? String(item.media.find((media) => String(media?.url ?? "").trim())?.url ?? "")
        : "",
    }));
  }

  async function fetchContacts() {
    const { data, error } = await publicSupabase
      .from("site_settings")
      .select("hotel_name, contact_people")
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return {
      hotelName: String(data?.hotel_name ?? "Ravotsoy dam olish maskani").trim() || "Ravotsoy dam olish maskani",
      contacts: parseContactPeople(data?.contact_people),
    };
  }

  async function syncTelegramUser(message, overrides = {}) {
    const telegramId = Number(message?.from?.id);

    if (!Number.isInteger(telegramId) || telegramId <= 0) {
      return null;
    }

    return upsertTelegramUser({
      telegramId,
      name: overrides.name ?? buildTelegramName(message?.from, message?.from?.username ?? ""),
      phone: overrides.phone,
      role: "customer",
    });
  }

  async function insertBooking(bookingData, updateAuthor) {
    const userId = await syncTelegramUser(updateAuthor, {
      name: bookingData.name,
      phone: bookingData.phone,
    });

    return createBooking({
      userId,
      package_id: bookingData.package_id,
      name: bookingData.name,
      phone: bookingData.phone,
      guests: bookingData.guests,
      date_start: bookingData.date_start,
      source: "telegram",
    });
  }

  async function getAvailableDates(packageId) {
    const { data, error } = await publicSupabase.rpc("get_available_booking_dates", {
      p_package_id: packageId,
      p_days: 7,
    });

    if (error) {
      throw error;
    }

    return (data ?? [])
      .map((item) => String(item.date_start ?? "").trim())
      .filter(Boolean);
  }

  async function downloadTelegramFile(fileId, fallbackName, contentType) {
    const fileResult = await telegram.getFile(fileId);
    const filePath = String(fileResult?.result?.file_path ?? "").trim();

    if (!filePath) {
      throw new Error("Telegram file path topilmadi");
    }

    const buffer = await telegram.downloadFile(filePath);
    const fileName = String(fallbackName ?? filePath.split("/").pop() ?? "proof");

    return {
      buffer,
      originalName: fileName,
      contentType: String(contentType ?? "").trim() || undefined,
    };
  }

  async function submitProof(chatId, message, bookingId, proofLink = "", file = null) {
    const context = await submitBookingProof({
      bookingId,
      proofLink,
      file,
    });

    const state = getChatState(chatId);

    if (state?.step === "proof" && state.data.booking_id === bookingId) {
      clearChatState(chatId);
    }

    await syncTelegramUser(message);
    await telegram.sendMessage(chatId, [
      "✅ To'lov cheki qabul qilindi.",
      `Bron ID: ${bookingId}`,
      "Menejer tasdiqlashini kuting.",
    ].join("\n"), {
      reply_markup: MAIN_KEYBOARD,
    });
    await notifyManagerAboutProof(context);
  }

  async function answerCallbackQuerySafe(callbackQueryId, text) {
    try {
      await telegram.answerCallbackQuery(callbackQueryId, text);
    } catch (error) {
      console.error(`Customer callback acknowledgement failed: ${formatAxiosError(error)}`);
    }
  }

  async function sendMainMenu(chatId) {
    clearChatState(chatId);
    await telegram.sendMessage(chatId, "Assalomu alaykum! Ravotsoy dam olish maskaniga xush kelibsiz.", {
      reply_markup: MAIN_KEYBOARD,
    });
  }

  async function sendPackages(chatId) {
    const packages = await fetchPackages();

    if (packages.length === 0) {
      await telegram.sendMessage(chatId, "Hozircha paketlar mavjud emas.", {
        reply_markup: MAIN_KEYBOARD,
      });
      return;
    }

    await telegram.sendMessage(chatId, "Mavjud paketlar:", {
      reply_markup: MAIN_KEYBOARD,
    });

    for (const item of packages) {
      const caption = formatPackageCaption(item);

      if (item.imageUrl) {
        await telegram.sendPhoto(chatId, item.imageUrl, caption);
        continue;
      }

      await telegram.sendMessage(chatId, caption);
    }
  }

  async function sendContacts(chatId) {
    const { hotelName, contacts } = await fetchContacts();
    await telegram.sendMessage(chatId, buildContactMessage(hotelName, contacts), {
      reply_markup: MAIN_KEYBOARD,
    });
  }

  async function sendAvailabilityGuidance(chatId) {
    await telegram.sendMessage(
      chatId,
      "Bo'sh sanalarni aniqlashtirish uchun operator bilan bog'laning. Aloqa ma'lumotlarini yuboryapman.",
      { reply_markup: MAIN_KEYBOARD },
    );
    await sendContacts(chatId);
  }

  async function startBookingConversation(chatId) {
    setChatState(chatId, "name", {});
    await telegram.sendMessage(chatId, "Ismingizni kiriting", {
      reply_markup: MAIN_KEYBOARD,
    });
  }

  async function promptPackageSelection(chatId, state) {
    const packages = await fetchPackages();

    if (packages.length === 0) {
      clearChatState(chatId);
      await telegram.sendMessage(chatId, "Hozircha tanlash uchun paketlar mavjud emas.", {
        reply_markup: MAIN_KEYBOARD,
      });
      return;
    }

    state.step = "package";
    state.data.packages = packages.map((item) => ({ id: item.id, name: item.name, capacity: item.capacity }));
    await telegram.sendMessage(chatId, "Paketni tanlang:", {
      reply_markup: buildPackageInlineKeyboard(packages),
    });
  }

  async function promptAvailableDates(chatId, state, introText = "Bo'sh sanani tanlang:") {
    const availableDates = await getAvailableDates(state.data.package_id);

    if (availableDates.length === 0) {
      clearChatState(chatId);
      await telegram.sendMessage(chatId, "❌ Hozircha bo‘sh sanalar yo'q. Iltimos keyinroq urinib ko'ring.", {
        reply_markup: MAIN_KEYBOARD,
      });
      return false;
    }

    state.step = "date";
    state.data.available_dates = availableDates;
    const inlineKeyboard = chunkItems(
      availableDates.map((date) => ({
        text: date,
        callback_data: `${CALLBACKS.datePrefix}${date}`,
      })),
      2,
    );

    await telegram.sendMessage(chatId, introText, {
      reply_markup: {
        inline_keyboard: inlineKeyboard,
      },
    });

    return true;
  }

  async function advanceBookingConversation(chatId, text) {
    const state = getChatState(chatId);

    if (!state) {
      return false;
    }

    if (state.step === "name") {
      state.data.name = text;
      state.step = "phone";
      await telegram.sendMessage(chatId, "Telefon raqamingizni kiriting", {
        reply_markup: MAIN_KEYBOARD,
      });
      return true;
    }

    if (state.step === "phone") {
      state.data.phone = text;
      state.step = "guests";
      await telegram.sendMessage(chatId, "Nechta odam?", {
        reply_markup: MAIN_KEYBOARD,
      });
      return true;
    }

    if (state.step === "guests") {
      if (!isPositiveInteger(text)) {
        await telegram.sendMessage(chatId, "Nechta odam? Raqam bilan kiriting.", {
          reply_markup: MAIN_KEYBOARD,
        });
        return true;
      }

      state.data.guests = Number.parseInt(text, 10);
      await promptPackageSelection(chatId, state);
      return true;
    }

    if (state.step === "package") {
      await telegram.sendMessage(chatId, "Paketni inline tugmalar orqali tanlang.", {
        reply_markup: MAIN_KEYBOARD,
      });
      return true;
    }

    if (state.step === "date") {
      await telegram.sendMessage(chatId, "Sanani inline tugmalar orqali tanlang.", {
        reply_markup: MAIN_KEYBOARD,
      });
      return true;
    }

    if (state.step === "confirm") {
      await telegram.sendMessage(chatId, "Tasdiqlash yoki bekor qilish tugmasini bosing.", {
        reply_markup: buildBookingConfirmationKeyboard(),
      });
      return true;
    }

    if (state.step === "proof") {
      await telegram.sendMessage(chatId, "Chekni foto, PDF yoki link ko'rinishida yuboring.", {
        reply_markup: MAIN_KEYBOARD,
      });
      return true;
    }

    return false;
  }

  async function handlePackageSelection(callbackQuery) {
    const callbackQueryId = callbackQuery?.id;
    const chatId = callbackQuery?.message?.chat?.id;
    const data = String(callbackQuery?.data ?? "");

    if (!callbackQueryId || !chatId || !data.startsWith(CALLBACKS.packagePrefix)) {
      return false;
    }

    const state = getChatState(chatId);

    if (!state || state.step !== "package") {
      await answerCallbackQuerySafe(callbackQueryId, "Bron jarayoni topilmadi.");
      await telegram.sendMessage(chatId, "Bron qilishni qaytadan boshlang.", {
        reply_markup: MAIN_KEYBOARD,
      });
      return true;
    }

    const packageId = data.slice(CALLBACKS.packagePrefix.length);
    const selectedPackage = (state.data.packages ?? []).find((item) => item.id === packageId);

    if (!selectedPackage) {
      await answerCallbackQuerySafe(callbackQueryId, "Paket topilmadi.");
      await promptPackageSelection(chatId, state);
      return true;
    }

    state.data.package_id = selectedPackage.id;
    state.data.package_name = selectedPackage.name;
    state.data.package_capacity = selectedPackage.capacity;
    delete state.data.packages;
    delete state.data.date_start;

    await answerCallbackQuerySafe(callbackQueryId, "Paket tanlandi.");
    await promptAvailableDates(chatId, state);
    return true;
  }

  async function handleDateSelection(callbackQuery) {
    const callbackQueryId = callbackQuery?.id;
    const chatId = callbackQuery?.message?.chat?.id;
    const data = String(callbackQuery?.data ?? "");

    if (!callbackQueryId || !chatId || !data.startsWith(CALLBACKS.datePrefix)) {
      return false;
    }

    const state = getChatState(chatId);

    if (!state || state.step !== "date") {
      await answerCallbackQuerySafe(callbackQueryId, "Sanani qaytadan tanlang.");
      await telegram.sendMessage(chatId, "Bron qilishni qaytadan boshlang.", {
        reply_markup: MAIN_KEYBOARD,
      });
      return true;
    }

    const selectedDate = data.slice(CALLBACKS.datePrefix.length);

    if (!isValidDateInput(selectedDate)) {
      await answerCallbackQuerySafe(callbackQueryId, "Sana noto'g'ri.");
      await promptAvailableDates(chatId, state);
      return true;
    }

    const availableDates = await getAvailableDates(state.data.package_id);

    if (!availableDates.includes(selectedDate)) {
      await answerCallbackQuerySafe(callbackQueryId, "Bu sana band.");
      await promptAvailableDates(chatId, state, "❌ Bu paket uchun joylar to‘lib bo'lgan. Boshqa sana tanlang.");
      return true;
    }

    state.data.available_dates = availableDates;
    state.data.date_start = selectedDate;
    state.step = "confirm";

    await answerCallbackQuerySafe(callbackQueryId, "Sana tanlandi.");
    await telegram.sendMessage(chatId, buildBookingSummary(state.data), {
      reply_markup: buildBookingConfirmationKeyboard(),
    });
    return true;
  }

  async function handleBookingDecision(callbackQuery) {
    const callbackQueryId = callbackQuery?.id;
    const chatId = callbackQuery?.message?.chat?.id;
    const data = String(callbackQuery?.data ?? "");

    if (!callbackQueryId || !chatId || (data !== CALLBACKS.confirm && data !== CALLBACKS.cancel)) {
      return false;
    }

    const state = getChatState(chatId);

    if (!state || state.step !== "confirm") {
      await answerCallbackQuerySafe(callbackQueryId, "Faol bron jarayoni yo'q.");
      await telegram.sendMessage(chatId, "Bron qilishni qaytadan boshlang.", {
        reply_markup: MAIN_KEYBOARD,
      });
      return true;
    }

    if (data === CALLBACKS.cancel) {
      clearChatState(chatId);
      await answerCallbackQuerySafe(callbackQueryId, "Bekor qilindi.");
      await telegram.sendMessage(chatId, "❌ Bekor qilindi", {
        reply_markup: MAIN_KEYBOARD,
      });
      return true;
    }

    try {
      const bookingResult = await insertBooking(state.data, callbackQuery);

      if (!bookingResult?.success) {
        await answerCallbackQuerySafe(callbackQueryId, "Sana band.");
        await telegram.sendMessage(chatId, "❌ Bu paket uchun joylar to‘lib bo'lgan. Boshqa sana tanlang.", {
          reply_markup: MAIN_KEYBOARD,
        });
        await promptAvailableDates(chatId, state, "Bo'sh sanani tanlang:");
        return true;
      }

      setChatState(chatId, "proof", { booking_id: bookingResult.bookingId });
      await answerCallbackQuerySafe(callbackQueryId, "So'rovingiz yuborildi.");
      await telegram.sendMessage(chatId, buildPaymentMessage(bookingResult), {
        reply_markup: MAIN_KEYBOARD,
      });
      await notifyManagerAboutBooking(bookingResult.booking);
    } catch (error) {
      console.error(`Customer booking insert failed: ${formatAxiosError(error)}`);
      await answerCallbackQuerySafe(callbackQueryId, "Xatolik yuz berdi.");
      await telegram.sendMessage(chatId, "So'rovni yuborishda xatolik yuz berdi. Qayta urinib ko'ring.", {
        reply_markup: MAIN_KEYBOARD,
      });
    }

    return true;
  }

  async function handleCallbackQuery(callbackQuery) {
    if (!callbackQuery) {
      return;
    }

    if (await handlePackageSelection(callbackQuery)) {
      return;
    }

    if (await handleDateSelection(callbackQuery)) {
      return;
    }

    if (await handleBookingDecision(callbackQuery)) {
      return;
    }

    if (callbackQuery.id) {
      await answerCallbackQuerySafe(callbackQuery.id);
    }
  }

  async function handleProofMessage(message) {
    const chatId = message?.chat?.id;
    const state = getChatState(chatId);
    const text = String(message?.text ?? "").trim();
    const caption = String(message?.caption ?? "").trim();
    const bookingId = state?.step === "proof" ? String(state.data.booking_id ?? "") : extractBookingId(`${caption} ${text}`);
    const photo = getLatestPhoto(message);
    const document = message?.document;
    const proofLink = isValidLink(text) ? text : extractProofLink(`${caption} ${text}`);

    if (!chatId || !bookingId) {
      return false;
    }

    try {
      if (photo?.file_id) {
        const file = await downloadTelegramFile(photo.file_id, "proof.jpg", "image/jpeg");
        await submitProof(chatId, message, bookingId, "", file);
        return true;
      }

      if (document?.file_id) {
        const file = await downloadTelegramFile(
          document.file_id,
          document.file_name || "proof",
          document.mime_type || "application/octet-stream",
        );
        await submitProof(chatId, message, bookingId, "", file);
        return true;
      }

      if (proofLink) {
        await submitProof(chatId, message, bookingId, proofLink);
        return true;
      }

      if (state?.step === "proof") {
        await telegram.sendMessage(chatId, "Chekni foto, PDF yoki link ko'rinishida yuboring.", {
          reply_markup: MAIN_KEYBOARD,
        });
        return true;
      }
    } catch (error) {
      console.error(`Customer proof submission failed: ${formatAxiosError(error)}`);
      await telegram.sendMessage(chatId, error instanceof Error ? error.message : "Chekni saqlab bo'lmadi.", {
        reply_markup: MAIN_KEYBOARD,
      });
      return true;
    }

    return false;
  }

  async function handleMessage(message) {
    const chatId = message?.chat?.id;
    const text = String(message?.text ?? "").trim();
    const state = getChatState(chatId);

    if (!chatId) {
      return;
    }

    if (message?.from?.id) {
      try {
        await syncTelegramUser(message);
      } catch (error) {
        console.error(`Customer user sync failed: ${formatAxiosError(error)}`);
      }
    }

    if (isStartCommand(text)) {
      await sendMainMenu(chatId);
      return;
    }

    if (text === BUTTONS.packages) {
      if (state?.step !== "proof") {
        clearChatState(chatId);
      }
      await sendPackages(chatId);
      return;
    }

    if (text === BUTTONS.contact) {
      if (state?.step !== "proof") {
        clearChatState(chatId);
      }
      await sendContacts(chatId);
      return;
    }

    if (text === BUTTONS.booking) {
      await startBookingConversation(chatId);
      return;
    }

    if (text === BUTTONS.availability) {
      if (state?.step !== "proof") {
        clearChatState(chatId);
      }
      await sendAvailabilityGuidance(chatId);
      return;
    }

    if (await handleProofMessage(message)) {
      return;
    }

    if (text && (await advanceBookingConversation(chatId, text))) {
      return;
    }

    if (state?.step === "proof") {
      await telegram.sendMessage(chatId, "Chekni yuborish uchun foto, PDF yoki link jo'nating.", {
        reply_markup: MAIN_KEYBOARD,
      });
      return;
    }

    await telegram.sendMessage(chatId, "Kerakli bo'limni tanlang.", {
      reply_markup: MAIN_KEYBOARD,
    });
  }

  return {
    async handleUpdate(update) {
      if (update?.callback_query) {
        await handleCallbackQuery(update.callback_query);
        return;
      }

      if (update?.message) {
        await handleMessage(update.message);
      }
    },
  };
}
