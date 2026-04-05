import {
  createSupabasePublicClient,
  createTelegramClient,
  formatAxiosError,
  readEnv,
} from "./shared.js";
import { createBooking, getTripBuilderOptions, quoteBooking } from "../services/bookingEngine.js";
import { buildSelectionLabel, normalizeResourceSelections, summarizeResourceSelections } from "../services/bookingMetadata.js";
import { fetchBookingsForTelegramUser, submitBookingProof, upsertTelegramUser } from "../services/proofService.js";
import { getTelegramPrefill } from "../services/telegramFlow.js";

const BUTTONS = {
  booking: "Bron boshlash",
  resources: "Joylar",
  myBookings: "Mening bronlarim",
  contact: "Aloqa",
  help: "Yordam",
};

const CALLBACKS = {
  resourcePick: "pick_",
  includeTapchan: "tap_",
  quantity: "qty_",
  selectionDone: "sel_done",
  selectionClear: "sel_clear",
  selectionMenu: "sel_menu",
  date: "date_",
  nights: "night_",
  confirm: "confirm_booking",
  cancel: "cancel_booking",
};

const BOOKING_ID_PATTERN =
  /#?([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i;
const URL_PATTERN = /https?:\/\/\S+/i;
const MAX_GUESTS = 30;
const stateByChatId = {};

function formatPrice(value) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("uz-UZ").format(Number.isFinite(amount) ? amount : 0);
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
    hotelName,
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

function isSlashCommand(text, command) {
  return new RegExp(`^\\/${command}(?:@\\w+)?(?:\\s|$)`, "i").test(String(text ?? "").trim());
}

function extractStartPayload(text) {
  const match = String(text ?? "").match(/^\/start(?:@\w+)?(?:\s+(.+))?$/i);
  return String(match?.[1] ?? "").trim();
}

function isGenericStartPayload(payloadToken) {
  const normalized = String(payloadToken ?? "").trim().toLowerCase();
  return normalized === "" || normalized === "start" || normalized === "website" || normalized === "home";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isPositiveInteger(value) {
  return /^[1-9]\d*$/.test(String(value ?? "").trim());
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

function buildMainKeyboard() {
  return {
    keyboard: [
      [{ text: BUTTONS.booking }, { text: BUTTONS.resources }],
      [{ text: BUTTONS.myBookings }],
      [{ text: BUTTONS.contact }, { text: BUTTONS.help }],
    ],
    resize_keyboard: true,
    one_time_keyboard: false,
  };
}

function buildContactKeyboard() {
  return {
    keyboard: [
      [{ text: "Telefonni ulashish", request_contact: true }],
      [{ text: BUTTONS.help }],
    ],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

function getChatState(chatId) {
  return stateByChatId[chatId] ?? null;
}

function setChatState(chatId, step, data = {}) {
  stateByChatId[chatId] = { step, data };
  return stateByChatId[chatId];
}

function clearChatState(chatId) {
  delete stateByChatId[chatId];
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

function buildSelectionKey(selection) {
  return `${selection.resourceType}:${selection.includeTapchan === false ? "without" : "with"}`;
}

function summarizeSelections(selections) {
  return summarizeResourceSelections(selections, "Tanlanmagan");
}

function hasRoomSelection(selections) {
  return selections.some((item) => String(item.resourceType ?? "").startsWith("room_"));
}

function buildSelectionsPayload(state) {
  return normalizeResourceSelections(state.data.selections ?? []).map((item) => ({
    resourceType: item.resourceType,
    quantity: item.quantity,
    includeTapchan: item.includeTapchan,
  }));
}

function buildBookingSummary(data, quote = null) {
  const lines = [
    "Bron xulosasi:",
    `Tanlov: ${summarizeSelections(data.selections ?? [])}`,
  ];

  if (Number(data.guests ?? 0) > 0) {
    lines.push(`Mehmonlar: ${data.guests} kishi`);
  }

  if (data.date_start) {
    lines.push(
      data.date_end
        ? `Sanalar: ${data.date_start} dan ${data.date_end} gacha`
        : `Sana: ${data.date_start}`,
    );
  }

  if (data.name) {
    lines.push(`Ism: ${data.name}`);
  }

  if (data.phone) {
    lines.push(`Telefon: ${data.phone}`);
  }

  if (quote?.totalPrice) {
    lines.push(`Narx: ${formatPrice(quote.totalPrice)} so'm`);
  }

  return lines.join("\n");
}

function buildPaymentMessage(result) {
  const payment = result?.payment ?? {};
  const booking = result?.booking ?? {};
  const lines = [
    "Bron yaratildi.",
    `Bron ID: ${result?.bookingId ?? ""}`,
    `Tanlov: ${booking.booking_label || result?.bookingLabel || "Ko'rsatilmagan"}`,
    `Umumiy narx: ${formatPrice(result?.totalPrice ?? 0)} so'm`,
    `Hozir to'lanadi: ${formatPrice(payment.requiredAmount ?? result?.totalPrice ?? 0)} so'm`,
  ];

  if (payment.depositPercentage) {
    lines.push(`Talab qilinadigan avans: ${payment.depositPercentage}%`);
  }

  if (payment.cardNumber) {
    lines.push(`Karta raqami: ${payment.cardNumber}`);
  } else {
    lines.push("Karta raqami: admin panelda kiritilmagan");
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
  lines.push("To'lovni yuborgach chekni shu chatga foto, PDF yoki link ko'rinishida jo'nating.");

  return lines.join("\n");
}

function buildBookingConfirmationKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "Tasdiqlash", callback_data: CALLBACKS.confirm }],
      [{ text: "Bekor qilish", callback_data: CALLBACKS.cancel }],
    ],
  };
}

function buildTrackingStatusLabel(status) {
  if (status === "awaiting confirmation") {
    return "awaiting confirmation";
  }

  if (status === "confirmed") {
    return "confirmed";
  }

  if (status === "rejected") {
    return "rejected";
  }

  return "pending";
}

function buildResourceMenuKeyboard(options, selections) {
  const groupedByType = new Map();

  for (const item of normalizeResourceSelections(selections)) {
    groupedByType.set(item.resourceType, (groupedByType.get(item.resourceType) ?? 0) + item.quantity);
  }

  const optionButtons = options.map((item) => {
    const quantity = groupedByType.get(item.resourceType) ?? 0;

    return {
      text: quantity > 0 ? `${item.label} x${quantity}` : item.label,
      callback_data: `${CALLBACKS.resourcePick}${item.resourceType}`,
    };
  });

  return {
    inline_keyboard: [
      ...chunkItems(optionButtons, 2),
      [
        { text: "Tozalash", callback_data: CALLBACKS.selectionClear },
        { text: "Davom etish", callback_data: CALLBACKS.selectionDone },
      ],
    ],
  };
}

function buildIncludeTapchanKeyboard(resourceType) {
  return {
    inline_keyboard: [
      [{ text: "Tapchan bilan", callback_data: `${CALLBACKS.includeTapchan}${resourceType}:with` }],
      [{ text: "Tapchansiz", callback_data: `${CALLBACKS.includeTapchan}${resourceType}:without` }],
      [{ text: "Ortga", callback_data: CALLBACKS.selectionMenu }],
    ],
  };
}

function buildQuantityKeyboard(maxQuantity) {
  const cappedMax = Math.max(Math.min(maxQuantity, 6), 1);
  const buttons = Array.from({ length: cappedMax }, (_item, index) => ({
    text: String(index + 1),
    callback_data: `${CALLBACKS.quantity}${index + 1}`,
  }));

  return {
    inline_keyboard: [...chunkItems(buttons, 3), [{ text: "Ortga", callback_data: CALLBACKS.selectionMenu }]],
  };
}

function buildDateKeyboard(days = 10) {
  const dates = Array.from({ length: days }, (_item, index) => addDays(todayIso(), index));

  return {
    inline_keyboard: chunkItems(
      dates.map((date) => ({
        text: date,
        callback_data: `${CALLBACKS.date}${date}`,
      })),
      2,
    ),
  };
}

function buildNightsKeyboard() {
  const buttons = Array.from({ length: 5 }, (_item, index) => ({
    text: `${index + 1} kecha`,
    callback_data: `${CALLBACKS.nights}${index + 1}`,
  }));

  return {
    inline_keyboard: chunkItems(buttons, 2),
  };
}

export function createCustomerBot() {
  const telegram = createTelegramClient(readEnv("CUSTOMER_BOT_TOKEN", "BOT_TOKEN"));
  const publicSupabase = createSupabasePublicClient();

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
      hotelName:
        String(data?.hotel_name ?? "Ravotsoy dam olish maskani").trim() || "Ravotsoy dam olish maskani",
      contacts: parseContactPeople(data?.contact_people),
    };
  }

  async function fetchTripOptions() {
    return getTripBuilderOptions();
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

  async function answerCallbackQuerySafe(callbackQueryId, text) {
    try {
      await telegram.answerCallbackQuery(callbackQueryId, text);
    } catch (error) {
      console.error(`Customer callback acknowledgement failed: ${formatAxiosError(error)}`);
    }
  }

  async function sendMainMenu(chatId, text = "Assalomu alaykum! Bronni shu yerda davom ettirishingiz mumkin.") {
    clearChatState(chatId);
    await telegram.sendMessage(chatId, text, {
      reply_markup: buildMainKeyboard(),
    });
  }

  async function sendContacts(chatId) {
    const { hotelName, contacts } = await fetchContacts();
    await telegram.sendMessage(chatId, buildContactMessage(hotelName, contacts), {
      reply_markup: buildMainKeyboard(),
    });
  }

  async function sendResources(chatId) {
    const options = await fetchTripOptions();

    if (options.length === 0) {
      await telegram.sendMessage(chatId, "Hozircha bron uchun resurslar mavjud emas.", {
        reply_markup: buildMainKeyboard(),
      });
      return;
    }

    const lines = options.map((item) => {
      const base = `${item.label}: ${item.availableUnits} ta, ${item.unitCapacity} kishigacha, ${formatPrice(item.basePrice)} so'm`;
      const extra = item.pricePerExtraPerson > 0
        ? `, qo'shimcha odam ${formatPrice(item.pricePerExtraPerson)} so'm`
        : "";
      const tapchan = item.includesTapchan
        ? `, tapchan chiqarilsa ${Math.round(item.discountIfExcluded * 100)}% chegirma`
        : "";
      return `${base}${extra}${tapchan}`;
    });

    await telegram.sendMessage(chatId, ["Mavjud resurslar:", "", ...lines].join("\n"), {
      reply_markup: buildMainKeyboard(),
    });
  }

  async function sendMyBookings(chatId, telegramId) {
    const bookings = await fetchBookingsForTelegramUser(telegramId);

    if (bookings.length === 0) {
      await telegram.sendMessage(chatId, "Sizda hozircha bronlar mavjud emas.", {
        reply_markup: buildMainKeyboard(),
      });
      return;
    }

    const lines = ["My bookings", ""];

    for (const booking of bookings) {
      lines.push(`Bron ID: ${booking.id}`);
      lines.push(`Tanlov: ${booking.booking_label || booking.resource_summary || "Ko'rsatilmagan"}`);
      lines.push(`Status: ${buildTrackingStatusLabel(booking.tracking_status)}`);
      lines.push(
        booking.date_end
          ? `Sana: ${booking.date_start} dan ${booking.date_end} gacha`
          : `Sana: ${booking.date_start}`,
      );
      lines.push("");
    }

    await telegram.sendMessage(chatId, lines.join("\n").trim(), {
      reply_markup: buildMainKeyboard(),
    });
  }

  async function promptResourceMenu(chatId, state, intro = "Kerakli resurslarni tanlang.") {
    const options = await fetchTripOptions();

    if (options.length === 0) {
      await sendMainMenu(chatId, "Hozircha faol resurslar topilmadi.");
      return;
    }

    state.step = "resource_menu";
    state.data.options = options;
    state.data.selections = normalizeResourceSelections(state.data.selections ?? []);

    await telegram.sendMessage(
      chatId,
      `${intro}\n\nTanlangan: ${summarizeSelections(state.data.selections)}`,
      {
        reply_markup: buildResourceMenuKeyboard(options, state.data.selections),
      },
    );
  }

  async function promptDateSelection(chatId, state) {
    state.step = "date";
    await telegram.sendMessage(chatId, "Boshlanish sanasini tanlang:", {
      reply_markup: buildDateKeyboard(hasRoomSelection(state.data.selections) ? 14 : 10),
    });
  }

  async function promptName(chatId, state, intro = "") {
    state.step = "name";
    await telegram.sendMessage(chatId, `${intro ? `${intro}\n\n` : ""}Ismingizni kiriting:`, {
      reply_markup: {
        remove_keyboard: true,
      },
    });
  }

  async function promptPhone(chatId, state) {
    state.step = "phone";
    await telegram.sendMessage(chatId, "Telefon raqamingizni yuboring yoki pastdagi tugma bilan ulashing:", {
      reply_markup: buildContactKeyboard(),
    });
  }

  async function prepareConfirmation(chatId, state) {
    const quote = await quoteBooking({
      resourceSelections: buildSelectionsPayload(state),
      peopleCount: state.data.guests,
      startDate: state.data.date_start,
      endDate: state.data.date_end,
    });

    state.data.quote = quote;

    if (!quote.available) {
      const suggestions = Array.isArray(quote.suggestions) && quote.suggestions.length > 0
        ? `\n\nTavsiya: ${summarizeSelections(quote.suggestions)}`
        : "";
      await telegram.sendMessage(chatId, `${quote.message}${suggestions}`, {
        reply_markup: buildMainKeyboard(),
      });
      await promptResourceMenu(chatId, state, "Sig'im yoki bo'sh joy yetarli emas. Tanlovni qayta ko'ring.");
      return;
    }

    state.step = "confirm";
    await telegram.sendMessage(chatId, buildBookingSummary(state.data, quote), {
      reply_markup: buildBookingConfirmationKeyboard(),
    });
  }

  async function startPrefilledConversation(chatId, payload) {
    const guests = Number(payload.peopleCount ?? 0);
    const estimatedPeopleCount = Number(payload.estimatedPeopleCount ?? 0);
    const state = setChatState(chatId, guests > 0 ? "name" : "guests", {
      guests,
      estimatedPeopleCount,
      guestConfirmationRequired: Boolean(payload.guestConfirmationRequired),
      date_start: String(payload.startDate ?? ""),
      date_end: payload.endDate ? String(payload.endDate) : null,
      selections: normalizeResourceSelections(payload.resourceSelections ?? []),
      quote: payload.quote ?? null,
    });

    if (guests > 0) {
      await promptName(chatId, state, buildBookingSummary(state.data, state.data.quote));
      return;
    }

    await telegram.sendMessage(
      chatId,
      [
        "Veb-saytdagi tanlovingiz qabul qilindi.",
        buildBookingSummary(state.data, state.data.quote),
        "",
        estimatedPeopleCount > 0
          ? `Boshlang'ich hisob ${estimatedPeopleCount} kishi uchun tayyorlandi. Yakuniy narx uchun nechta mehmon bo'lishini kiriting.`
          : "Yakuniy narx uchun nechta mehmon bo'lishini kiriting.",
      ].join("\n"),
      {
        reply_markup: buildMainKeyboard(),
      },
    );
  }

  async function startBookingConversation(chatId) {
    setChatState(chatId, "guests", {
      selections: [],
    });
    await telegram.sendMessage(chatId, "Nechta mehmon bo'ladi? (maksimal 30 kishi)", {
      reply_markup: buildMainKeyboard(),
    });
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
    await telegram.sendMessage(
      chatId,
      ["To'lov cheki qabul qilindi.", `Bron ID: ${bookingId}`, "Menejer tasdiqlashini kuting."].join("\n"),
      {
        reply_markup: buildMainKeyboard(),
      },
    );

    return context;
  }

  async function insertBooking(state, updateAuthor) {
    const userId = await syncTelegramUser(updateAuthor, {
      name: state.data.name,
      phone: state.data.phone,
    });

    return createBooking({
      userId,
      resourceSelections: buildSelectionsPayload(state),
      name: state.data.name,
      phone: state.data.phone,
      guests: state.data.guests,
      startDate: state.data.date_start,
      endDate: state.data.date_end,
      source: "telegram",
    });
  }

  async function handleResourcePick(callbackQuery, state, resourceType) {
    const selectedOption = (state.data.options ?? []).find((item) => item.resourceType === resourceType);

    if (!selectedOption) {
      await telegram.sendMessage(callbackQuery.message.chat.id, "Resurs topilmadi.", {
        reply_markup: buildMainKeyboard(),
      });
      return;
    }

    state.data.pendingResourceType = resourceType;
    state.data.pendingMaxQuantity = Math.max(Number(selectedOption.maxQuantity ?? 1), 1);

    if (selectedOption.bookingMode === "stay" && selectedOption.includesTapchan) {
      state.step = "room_include";
      await telegram.sendMessage(callbackQuery.message.chat.id, `${selectedOption.label} uchun variantni tanlang:`, {
        reply_markup: buildIncludeTapchanKeyboard(resourceType),
      });
      return;
    }

    state.data.pendingIncludeTapchan = undefined;
    state.step = "quantity";
    await telegram.sendMessage(callbackQuery.message.chat.id, `${selectedOption.label} sonini tanlang:`, {
      reply_markup: buildQuantityKeyboard(state.data.pendingMaxQuantity),
    });
  }

  async function handleCallbackQuery(callbackQuery) {
    const callbackQueryId = callbackQuery?.id;
    const chatId = callbackQuery?.message?.chat?.id;
    const data = String(callbackQuery?.data ?? "");
    const state = getChatState(chatId);

    if (!callbackQueryId || !chatId || !state) {
      if (callbackQueryId) {
        await answerCallbackQuerySafe(callbackQueryId, "Jarayon topilmadi.");
      }
      return;
    }

    try {
      if (data.startsWith(CALLBACKS.resourcePick) && state.step === "resource_menu") {
        await answerCallbackQuerySafe(callbackQueryId, "Tanlandi.");
        await handleResourcePick(callbackQuery, state, data.slice(CALLBACKS.resourcePick.length));
        return;
      }

      if (data === CALLBACKS.selectionClear && state.step === "resource_menu") {
        state.data.selections = [];
        await answerCallbackQuerySafe(callbackQueryId, "Tanlov tozalandi.");
        await promptResourceMenu(chatId, state, "Tanlovlar tozalandi.");
        return;
      }

      if (data === CALLBACKS.selectionMenu && (state.step === "room_include" || state.step === "quantity")) {
        await answerCallbackQuerySafe(callbackQueryId, "Ortga qaytdik.");
        await promptResourceMenu(chatId, state, "Kerakli resurslarni tanlang.");
        return;
      }

      if (data === CALLBACKS.selectionDone && (state.step === "resource_menu" || state.step === "room_include" || state.step === "quantity")) {
        if ((state.data.selections ?? []).length === 0) {
          await answerCallbackQuerySafe(callbackQueryId, "Avval kamida bitta resurs tanlang.");
          await promptResourceMenu(chatId, state, "Avval kamida bitta resurs tanlang.");
          return;
        }

        await answerCallbackQuerySafe(callbackQueryId, "Davom etamiz.");
        await promptDateSelection(chatId, state);
        return;
      }

      if (data.startsWith(CALLBACKS.includeTapchan) && state.step === "room_include") {
        const payload = data.slice(CALLBACKS.includeTapchan.length);
        const [resourceType, mode] = payload.split(":");

        state.data.pendingResourceType = resourceType;
        state.data.pendingIncludeTapchan = mode !== "without";
        state.step = "quantity";
        await answerCallbackQuerySafe(callbackQueryId, "Variant saqlandi.");
        await telegram.sendMessage(chatId, "Nechta birlik kerak?", {
          reply_markup: buildQuantityKeyboard(state.data.pendingMaxQuantity ?? 1),
        });
        return;
      }

      if (data.startsWith(CALLBACKS.quantity) && state.step === "quantity") {
        const quantity = Number.parseInt(data.slice(CALLBACKS.quantity.length), 10);
        const resourceType = String(state.data.pendingResourceType ?? "");

        if (!resourceType || !Number.isInteger(quantity) || quantity <= 0) {
          await answerCallbackQuerySafe(callbackQueryId, "Miqdor noto'g'ri.");
          return;
        }

        const nextSelection = normalizeResourceSelections([
          ...(state.data.selections ?? []).filter(
            (item) => buildSelectionKey(item) !== buildSelectionKey({
              resourceType,
              includeTapchan: state.data.pendingIncludeTapchan,
            }),
          ),
          {
            resourceType,
            quantity,
            includeTapchan: state.data.pendingIncludeTapchan,
          },
        ]);

        state.data.selections = nextSelection;
        delete state.data.pendingResourceType;
        delete state.data.pendingIncludeTapchan;
        delete state.data.pendingMaxQuantity;

        await answerCallbackQuerySafe(callbackQueryId, "Tanlov saqlandi.");
        await promptResourceMenu(chatId, state, "Yana resurs qo'shishingiz mumkin.");
        return;
      }

      if (data.startsWith(CALLBACKS.date) && state.step === "date") {
        const selectedDate = data.slice(CALLBACKS.date.length);

        if (!isValidDateInput(selectedDate)) {
          await answerCallbackQuerySafe(callbackQueryId, "Sana noto'g'ri.");
          return;
        }

        state.data.date_start = selectedDate;
        state.data.date_end = null;
        await answerCallbackQuerySafe(callbackQueryId, "Sana tanlandi.");

        if (hasRoomSelection(state.data.selections ?? [])) {
          state.step = "nights";
          await telegram.sendMessage(chatId, "Necha kecha qolasiz?", {
            reply_markup: buildNightsKeyboard(),
          });
          return;
        }

        await promptName(chatId, state);
        return;
      }

      if (data.startsWith(CALLBACKS.nights) && state.step === "nights") {
        const nights = Number.parseInt(data.slice(CALLBACKS.nights.length), 10);

        if (!Number.isInteger(nights) || nights <= 0) {
          await answerCallbackQuerySafe(callbackQueryId, "Tunlar soni noto'g'ri.");
          return;
        }

        state.data.nights = nights;
        state.data.date_end = addDays(state.data.date_start, nights);
        await answerCallbackQuerySafe(callbackQueryId, "Tunlar saqlandi.");
        await promptName(chatId, state);
        return;
      }

      if ((data === CALLBACKS.confirm || data === CALLBACKS.cancel) && state.step === "confirm") {
        if (data === CALLBACKS.cancel) {
          await answerCallbackQuerySafe(callbackQueryId, "Bekor qilindi.");
          await sendMainMenu(chatId, "Bron jarayoni bekor qilindi.");
          return;
        }

        try {
          const bookingResult = await insertBooking(state, callbackQuery);

          if (!bookingResult?.success) {
            await answerCallbackQuerySafe(callbackQueryId, "Joy band.");
            await telegram.sendMessage(chatId, bookingResult.message || "Tanlangan vaqt band.", {
              reply_markup: buildMainKeyboard(),
            });
            await promptResourceMenu(chatId, state, "Tanlovni qayta yig'ing.");
            return;
          }

          setChatState(chatId, "proof", { booking_id: bookingResult.bookingId });
          await answerCallbackQuerySafe(callbackQueryId, "Bron yaratildi.");
          await telegram.sendMessage(chatId, buildPaymentMessage(bookingResult), {
            reply_markup: buildMainKeyboard(),
          });
        } catch (error) {
          console.error(`Customer booking insert failed: ${formatAxiosError(error)}`);
          await answerCallbackQuerySafe(callbackQueryId, "Xatolik yuz berdi.");
          await telegram.sendMessage(chatId, "Bronni yaratishda xatolik yuz berdi. Qayta urinib ko'ring.", {
            reply_markup: buildMainKeyboard(),
          });
        }

        return;
      }

      await answerCallbackQuerySafe(callbackQueryId, "Noma'lum amal.");
    } catch (error) {
      console.error(`Customer callback processing failed: ${formatAxiosError(error)}`);
      await answerCallbackQuerySafe(callbackQueryId, "Xatolik yuz berdi.");
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
          reply_markup: buildMainKeyboard(),
        });
        return true;
      }
    } catch (error) {
      console.error(`Customer proof submission failed: ${formatAxiosError(error)}`);
      await telegram.sendMessage(chatId, error instanceof Error ? error.message : "Chekni saqlab bo'lmadi.", {
        reply_markup: buildMainKeyboard(),
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
      const payloadToken = extractStartPayload(text);

      if (payloadToken && !isGenericStartPayload(payloadToken)) {
        try {
          const prefill = await getTelegramPrefill(payloadToken);

          if (prefill?.payload) {
            await startPrefilledConversation(chatId, prefill.payload);
            return;
          }
        } catch (error) {
          console.error(`Telegram prefill load failed: ${formatAxiosError(error)}`);
        }
      }

      await sendMainMenu(chatId);
      return;
    }

    if (isSlashCommand(text, "book")) {
      await startBookingConversation(chatId);
      return;
    }

    if (isSlashCommand(text, "resources")) {
      await sendResources(chatId);
      return;
    }

    if (isSlashCommand(text, "contact")) {
      await sendContacts(chatId);
      return;
    }

    if (isSlashCommand(text, "mybookings")) {
      await sendMyBookings(chatId, message?.from?.id);
      return;
    }

    if (isSlashCommand(text, "help")) {
      await telegram.sendMessage(
        chatId,
        "Bron boshlasangiz mehmonlar soni, resurslar va sanani tanlaysiz. Keyin ism va telefon yuborasiz, tizim sizga karta raqami bilan bron ID beradi.",
        {
          reply_markup: buildMainKeyboard(),
        },
      );
      return;
    }

    if (text === BUTTONS.resources) {
      await sendResources(chatId);
      return;
    }

    if (text === BUTTONS.contact) {
      await sendContacts(chatId);
      return;
    }

    if (text === BUTTONS.myBookings || text === "My bookings") {
      await sendMyBookings(chatId, message?.from?.id);
      return;
    }

    if (text === BUTTONS.help) {
      await telegram.sendMessage(
        chatId,
        "Bron boshlasangiz mehmonlar soni, resurslar va sanani tanlaysiz. Keyin ism va telefon yuborasiz, tizim sizga karta raqami bilan bron ID beradi.",
        {
          reply_markup: buildMainKeyboard(),
        },
      );
      return;
    }

    if (text === BUTTONS.booking) {
      await startBookingConversation(chatId);
      return;
    }

    if (await handleProofMessage(message)) {
      return;
    }

    if (!state) {
      await telegram.sendMessage(chatId, "Kerakli bo'limni tanlang.", {
        reply_markup: buildMainKeyboard(),
      });
      return;
    }

    if (state.step === "guests") {
      if (!isPositiveInteger(text)) {
        await telegram.sendMessage(chatId, "Mehmonlar sonini raqam bilan kiriting.", {
          reply_markup: buildMainKeyboard(),
        });
        return;
      }

      const guests = Number.parseInt(text, 10);

      if (guests > MAX_GUESTS) {
        await telegram.sendMessage(chatId, `Maksimal ichki sig'im ${MAX_GUESTS} kishi.`, {
          reply_markup: buildMainKeyboard(),
        });
        return;
      }

      state.data.guests = guests;

      if ((state.data.selections ?? []).length > 0 && state.data.date_start) {
        await promptName(chatId, state, buildBookingSummary(state.data, state.data.quote));
        return;
      }

      await promptResourceMenu(chatId, state);
      return;
    }

    if (state.step === "name") {
      if (!text) {
        await telegram.sendMessage(chatId, "Ismingizni kiriting.", {
          reply_markup: {
            remove_keyboard: true,
          },
        });
        return;
      }

      state.data.name = text;
      await promptPhone(chatId, state);
      return;
    }

    if (state.step === "phone") {
      const sharedPhone = String(message?.contact?.phone_number ?? "").trim();
      const phone = sharedPhone || text;

      if (!phone) {
        await telegram.sendMessage(chatId, "Telefon raqamingizni yuboring yoki ulashish tugmasini bosing.", {
          reply_markup: buildContactKeyboard(),
        });
        return;
      }

      state.data.phone = phone;
      await prepareConfirmation(chatId, state);
      return;
    }

    if (state.step === "proof") {
      await telegram.sendMessage(chatId, "Chekni yuborish uchun foto, PDF yoki link jo'nating.", {
        reply_markup: buildMainKeyboard(),
      });
      return;
    }

    await telegram.sendMessage(chatId, "Jarayonni davom ettirish uchun tugmalardan foydalaning.", {
      reply_markup: buildMainKeyboard(),
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
