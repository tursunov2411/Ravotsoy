import {
  createSupabasePublicClient,
  createTelegramClient,
  formatAxiosError,
  readEnv,
} from "./shared.js";
import { createBooking, getTripBuilderOptions, quoteBooking } from "../services/bookingEngine.js";
import { buildSelectionLabel, normalizeResourceSelections, summarizeResourceSelections } from "../services/bookingMetadata.js";
import {
  cancelBookingForTelegramUser,
  fetchBookingsForTelegramUser,
  submitBookingProof,
  upsertTelegramUser,
} from "../services/proofService.js";
import { getTelegramPrefill } from "../services/telegramFlow.js";
import { getLatestServiceMedia } from "../services/mediaLibrary.js";

const BUTTONS = {
  booking: "🧺 Bron boshlash",
  resources: "🏡 Joylar",
  myBookings: "📚 Mening bronlarim",
  contact: "📞 Aloqa",
  help: "❓ Yordam",
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
  catalogNav: "catalog_nav_",
  catalogAdd: "catalog_add_",
  catalogRemove: "catalog_remove_",
  catalogStart: "catalog_start",
  catalogBack: "catalog_back",
  proofConfirm: "proof_confirm",
  proofCancel: "proof_cancel",
  bookingCancel: "mybooking_cancel_",
  bookingCancelConfirm: "mybooking_cancel_confirm_",
  bookingCancelBack: "mybooking_cancel_back_",
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

function buildWelcomeMessage() {
  return [
    "Assalomu alaykum!",
    "",
    "Ravotsoy botiga xush kelibsiz.",
    "Bu yerda joylarni rasm va ma'lumot bilan ko'rib chiqib, savatga qo'shib, keyin bronni davom ettirishingiz mumkin.",
    "",
    "Asosiy bo'limlar:",
    `${BUTTONS.booking} - bron jarayonini boshlash`,
    `${BUTTONS.resources} - joylarni ko'rish`,
    `${BUTTONS.myBookings} - mavjud bronlarni tekshirish`,
    `${BUTTONS.contact} - aloqa ma'lumotlari`,
  ].join("\n");
}

function buildHelpMessage() {
  return [
    "Yordam",
    "",
    `1. ${BUTTONS.booking} yoki ${BUTTONS.resources} ni bosing.`,
    "2. Joylarni rasm bilan ko'rib chiqing va savatga qo'shing.",
    "3. Bronlash tugmasi orqali mehmonlar soni, sana, ism va telefonni kiriting.",
    "4. Bot sizga to'lov ma'lumotlari va bron ID beradi.",
    "5. To'lovdan keyin chekni shu chatga yuboring.",
  ].join("\n");
}

function isRoomOption(option) {
  return String(option?.resourceType ?? "").startsWith("room_");
}

function buildCatalogSelectionKey(resourceType, includeTapchan) {
  return `${resourceType}:${includeTapchan === false ? "without" : "with"}`;
}

function getSelectionQuantity(selections, resourceType, includeTapchan = true) {
  const normalized = normalizeResourceSelections(selections);
  const match = normalized.find(
    (item) => buildCatalogSelectionKey(item.resourceType, item.includeTapchan) === buildCatalogSelectionKey(resourceType, includeTapchan),
  );
  return Number(match?.quantity ?? 0);
}

function formatOptionDescription(option) {
  const lines = [
    `💵 Asosiy narx: ${formatPrice(option.basePrice)} so'm`,
    `👥 Sig'im: ${option.unitCapacity} kishi`,
    `🧩 Mavjud birlik: ${option.availableUnits} ta`,
    option.pricePerExtraPerson > 0
      ? `➕ Qo'shimcha mehmon: ${formatPrice(option.pricePerExtraPerson)} so'm`
      : "➕ Qo'shimcha mehmon narxi: yo'q",
  ];

  if (option.bookingMode === "stay") {
    lines.push("🌙 Format: tunab qolish");
  } else {
    lines.push("☀️ Format: kunlik dam olish");
  }

  if (option.includesTapchan && isRoomOption(option)) {
    lines.push(`🏷 Tapchan bilan: ${formatPrice(option.basePrice)} so'm`);
    lines.push(`🏷 Tapchansiz: ${formatPrice(Math.round(option.basePrice * (1 - option.discountIfExcluded)))} so'm`);
  }

  return lines.join("\n");
}

function buildCatalogCaption(option, selections) {
  const withTapchanCount = getSelectionQuantity(selections, option.resourceType, true);
  const withoutTapchanCount = getSelectionQuantity(selections, option.resourceType, false);
  const bucketSummary = summarizeSelections(selections);

  return [
    `✨ ${option.label}`,
    "",
    formatOptionDescription(option),
    "",
    option.includesTapchan && isRoomOption(option)
      ? `🧺 Savatda: tapchan bilan x${withTapchanCount}, tapchansiz x${withoutTapchanCount}`
      : `🧺 Savatda: x${withTapchanCount}`,
    `📌 Jami savat: ${bucketSummary}`,
    "",
    "Pastdagi tugmalar bilan tariflarni almashtiring yoki savatga qo'shing.",
  ].join("\n");
}

function buildCatalogKeyboard(option, index, total, selections) {
  const withTapchanCount = getSelectionQuantity(selections, option.resourceType, true);
  const withoutTapchanCount = getSelectionQuantity(selections, option.resourceType, false);
  const rows = [
    [
      { text: "⬅️ Oldingi", callback_data: `${CALLBACKS.catalogNav}${Math.max(index - 1, total - 1)}` },
      { text: `${index + 1}/${total}`, callback_data: "noop" },
      { text: "Keyingi ➡️", callback_data: `${CALLBACKS.catalogNav}${(index + 1) % total}` },
    ],
  ];

  if (option.includesTapchan && isRoomOption(option)) {
    rows.push([
      { text: `🛏➕ Tapchan bilan (${withTapchanCount})`, callback_data: `${CALLBACKS.catalogAdd}${option.resourceType}:with` },
      { text: `🚫➕ Tapchansiz (${withoutTapchanCount})`, callback_data: `${CALLBACKS.catalogAdd}${option.resourceType}:without` },
    ]);
    rows.push([
      { text: "🛏➖ Tapchan bilan", callback_data: `${CALLBACKS.catalogRemove}${option.resourceType}:with` },
      { text: "🚫➖ Tapchansiz", callback_data: `${CALLBACKS.catalogRemove}${option.resourceType}:without` },
    ]);
  } else {
    rows.push([
      { text: `➕ Savatga qo'shish (${withTapchanCount})`, callback_data: `${CALLBACKS.catalogAdd}${option.resourceType}:with` },
      { text: "➖ Kamaytirish", callback_data: `${CALLBACKS.catalogRemove}${option.resourceType}:with` },
    ]);
  }

  rows.push([{ text: "🧺 Bronlash", callback_data: CALLBACKS.catalogStart }]);
  rows.push([{ text: "🔙 Bosh menyu", callback_data: CALLBACKS.catalogBack }]);

  return {
    inline_keyboard: rows,
  };
}

function buildProofConfirmationKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "✅ Ha, bu haqiqiy to'lov cheki", callback_data: CALLBACKS.proofConfirm }],
      [{ text: "🔁 Yo'q, qayta yuboraman", callback_data: CALLBACKS.proofCancel }],
    ],
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
    "🧾 Bron xulosasi:",
    `🧺 Tanlov: ${summarizeSelections(data.selections ?? [])}`,
  ];

  if (Number(data.guests ?? 0) > 0) {
    lines.push(`👥 Mehmonlar: ${data.guests} kishi`);
  }

  if (data.date_start) {
    lines.push(
      data.date_end
        ? `📅 Sanalar: ${data.date_start} dan ${data.date_end} gacha`
        : `📅 Sana: ${data.date_start}`,
    );
  }

  if (data.name) {
    lines.push(`👤 Ism: ${data.name}`);
  }

  if (data.phone) {
    lines.push(`📞 Telefon: ${data.phone}`);
  }

  if (quote?.totalPrice) {
    lines.push(`💰 Narx: ${formatPrice(quote.totalPrice)} so'm`);
  }

  return lines.join("\n");
}

function buildPaymentMessage(result) {
  const payment = result?.payment ?? {};
  const booking = result?.booking ?? {};
  const lines = [
    "🎉 Bron yaratildi.",
    `🆔 Bron ID: ${result?.bookingId ?? ""}`,
    `🧺 Tanlov: ${booking.booking_label || result?.bookingLabel || "Ko'rsatilmagan"}`,
    `💰 Umumiy narx: ${formatPrice(result?.totalPrice ?? 0)} so'm`,
    `💳 Hozir to'lanadi: ${formatPrice(payment.requiredAmount ?? result?.totalPrice ?? 0)} so'm`,
  ];

  if (payment.depositPercentage) {
    lines.push(`📌 Talab qilinadigan avans: ${payment.depositPercentage}%`);
  }

  if (payment.cardNumber) {
    lines.push(`💳 Karta raqami: ${payment.cardNumber}`);
  } else {
    lines.push("💳 Karta raqami: admin panelda kiritilmagan");
  }

  if (payment.cardHolder) {
    lines.push(`👤 Karta egasi: ${payment.cardHolder}`);
  }

  if (payment.managerTelegram) {
    lines.push(`📞 To'lov bo'yicha menejer: @${payment.managerTelegram}`);
  }

  if (payment.instructions) {
    lines.push("");
    lines.push(payment.instructions);
  }

  lines.push("");
  lines.push("📎 To'lovni yuborgach chekni shu chatga foto, PDF yoki link ko'rinishida jo'nating.");

  return lines.join("\n");
}

function buildBookingConfirmationKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "✅ Tasdiqlash", callback_data: CALLBACKS.confirm }],
      [{ text: "❌ Bekor qilish", callback_data: CALLBACKS.cancel }],
    ],
  };
}

function buildTrackingStatusLabel(status) {
  if (status === "awaiting confirmation") {
    return "Tekshiruvda";
  }

  if (status === "confirmed") {
    return "Tasdiqlangan";
  }

  if (status === "checked_in") {
    return "Joy band";
  }

  if (status === "rejected") {
    return "Rad etilgan";
  }

  return "Kutilmoqda";
}

function isBookingCancellable(booking) {
  return ["pending", "proof_submitted", "confirmed"].includes(String(booking?.status ?? "").trim());
}

function buildBookingCancelKeyboard(bookingId, confirm = false) {
  if (!bookingId) {
    return undefined;
  }

  if (confirm) {
    return {
      inline_keyboard: [
        [
          { text: "✅ Ha, bekor qilish", callback_data: `${CALLBACKS.bookingCancelConfirm}${bookingId}` },
          { text: "🔙 Ortga", callback_data: `${CALLBACKS.bookingCancelBack}${bookingId}` },
        ],
      ],
    };
  }

  return {
    inline_keyboard: [
      [{ text: "❌ Bronni bekor qilish", callback_data: `${CALLBACKS.bookingCancel}${bookingId}` }],
    ],
  };
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

  async function sendMainMenu(chatId, text = buildWelcomeMessage()) {
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

  async function sendResources(chatId, intro = "Joylar katalogi") {
    const options = await fetchTripOptions();

    if (options.length === 0) {
      await telegram.sendMessage(chatId, "😕 Hozircha bron uchun resurslar mavjud emas.", {
        reply_markup: buildMainKeyboard(),
      });
      return;
    }
    const state = setChatState(chatId, "catalog", {
      options,
      selections: normalizeResourceSelections(getChatState(chatId)?.data?.selections ?? []),
      catalogIndex: 0,
    });
    await showCatalogCard(chatId, state, intro);
  }

  async function sendMyBookings(chatId, telegramId) {
    const bookings = await fetchBookingsForTelegramUser(telegramId);

    if (bookings.length === 0) {
      await telegram.sendMessage(chatId, "Sizda hozircha bronlar mavjud emas.", {
        reply_markup: buildMainKeyboard(),
      });
      return;
    }

    await telegram.sendMessage(chatId, "📚 Mening bronlarim", {
      reply_markup: buildMainKeyboard(),
    });

    for (const booking of bookings) {
      await telegram.sendMessage(
        chatId,
        [
          `🆔 Bron ID: ${booking.id}`,
          `🧺 Tanlov: ${booking.booking_label || booking.resource_summary || "Ko'rsatilmagan"}`,
          `📌 Holat: ${buildTrackingStatusLabel(booking.tracking_status)}`,
          booking.date_end
            ? `📅 Sana: ${booking.date_start} dan ${booking.date_end} gacha`
            : `📅 Sana: ${booking.date_start}`,
        ].join("\n"),
        {
          reply_markup: isBookingCancellable(booking) ? buildBookingCancelKeyboard(booking.id) : undefined,
        },
      );
    }
  }

  async function cleanupCatalogMessage(message) {
    const messageId = Number(message?.message_id ?? 0);
    const chatId = Number(message?.chat?.id ?? 0);

    if (!messageId || !chatId) {
      return;
    }

    try {
      await telegram.callTelegram("deleteMessage", {
        chat_id: chatId,
        message_id: messageId,
      });
    } catch (error) {
      console.error(`Customer catalog cleanup failed: ${formatAxiosError(error)}`);
    }
  }

  async function showCatalogCard(chatId, state, intro = "", previousMessage = null) {
    const options = Array.isArray(state?.data?.options) ? state.data.options : await fetchTripOptions();

    if (options.length === 0) {
      await sendMainMenu(chatId, "😕 Hozircha ko'rsatish uchun joylar topilmadi.");
      return;
    }

    state.step = "catalog";
    state.data.options = options;
    state.data.catalogIndex = Math.min(Math.max(Number(state.data.catalogIndex ?? 0), 0), options.length - 1);
    state.data.selections = normalizeResourceSelections(state.data.selections ?? []);

    const option = options[state.data.catalogIndex];
    const media = await getLatestServiceMedia(option.resourceType);
    const caption = [intro, buildCatalogCaption(option, state.data.selections)].filter(Boolean).join("\n\n");
    const replyMarkup = buildCatalogKeyboard(option, state.data.catalogIndex, options.length, state.data.selections);

    if (media?.url) {
      await telegram.sendPhoto(chatId, media.url, caption, {
        reply_markup: replyMarkup,
      });
      await cleanupCatalogMessage(previousMessage);
      return;
    }

    await telegram.sendMessage(chatId, caption, {
      reply_markup: replyMarkup,
    });
    await cleanupCatalogMessage(previousMessage);
  }

  async function promptResourceMenu(chatId, state, intro = "Kerakli resurslarni tanlang.") {
    const options = await fetchTripOptions();

    if (options.length === 0) {
      await sendMainMenu(chatId, "Hozircha faol resurslar topilmadi.");
      return;
    }

    state.step = "catalog";
    state.data.options = options;
    state.data.selections = normalizeResourceSelections(state.data.selections ?? []);
    state.data.catalogIndex = Math.min(Math.max(Number(state.data.catalogIndex ?? 0), 0), Math.max(options.length - 1, 0));
    await showCatalogCard(chatId, state, `🏡 ${intro}`);
  }

  async function promptDateSelection(chatId, state) {
    state.step = "date";
    await telegram.sendMessage(chatId, "📅 Boshlanish sanasini tanlang:", {
      reply_markup: buildDateKeyboard(hasRoomSelection(state.data.selections) ? 14 : 10),
    });
  }

  async function promptName(chatId, state, intro = "") {
    state.step = "name";
    await telegram.sendMessage(chatId, `${intro ? `${intro}\n\n` : ""}👤 Ismingizni kiriting:`, {
      reply_markup: {
        remove_keyboard: true,
      },
    });
  }

  async function promptPhone(chatId, state) {
    state.step = "phone";
    await telegram.sendMessage(chatId, "📞 Telefon raqamingizni yuboring yoki pastdagi tugma bilan ulashing:", {
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
      await telegram.sendMessage(chatId, `⚠️ ${quote.message}${suggestions}`, {
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
        "✨ Veb-saytdagi tanlovingiz qabul qilindi.",
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
    const state = setChatState(chatId, "catalog", {
      selections: [],
      catalogIndex: 0,
    });
    await showCatalogCard(chatId, state, "Bronni boshlaymiz. Avval joylarni tanlang.");
  }

  async function startBookingFromCatalog(chatId, state) {
    state.step = "guests";
    await telegram.sendMessage(chatId, [
      "🧺 Savatdagi joylar bron uchun tayyor.",
      `Tanlov: ${summarizeSelections(state.data.selections ?? [])}`,
      "",
      "👥 Endi nechta mehmon bo'lishini kiriting.",
    ].join("\n"), {
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

    if (callbackQueryId && chatId && data.startsWith(CALLBACKS.bookingCancelConfirm)) {
      const bookingId = data.slice(CALLBACKS.bookingCancelConfirm.length);

      try {
        await cancelBookingForTelegramUser(callbackQuery?.from?.id, bookingId);
        await telegram.editMessageReplyMarkup(chatId, callbackQuery?.message?.message_id, {
          inline_keyboard: [],
        });
        await answerCallbackQuerySafe(callbackQueryId, "Bron bekor qilindi.");
        await telegram.sendMessage(chatId, `❌ Bron bekor qilindi.\n\nBron ID: ${bookingId}`, {
          reply_markup: buildMainKeyboard(),
        });
      } catch (error) {
        console.error(`Customer booking cancel failed: ${formatAxiosError(error)}`);
        await answerCallbackQuerySafe(
          callbackQueryId,
          error instanceof Error ? error.message : "Bronni bekor qilib bo'lmadi.",
        );
      }
      return;
    }

    if (callbackQueryId && chatId && data.startsWith(CALLBACKS.bookingCancelBack)) {
      const bookingId = data.slice(CALLBACKS.bookingCancelBack.length);
      await telegram.editMessageReplyMarkup(chatId, callbackQuery?.message?.message_id, buildBookingCancelKeyboard(bookingId));
      await answerCallbackQuerySafe(callbackQueryId, "Bekor qilindi.");
      return;
    }

    if (callbackQueryId && chatId && data.startsWith(CALLBACKS.bookingCancel)) {
      const bookingId = data.slice(CALLBACKS.bookingCancel.length);
      await telegram.editMessageReplyMarkup(chatId, callbackQuery?.message?.message_id, buildBookingCancelKeyboard(bookingId, true));
      await answerCallbackQuerySafe(callbackQueryId, "Bekor qilishni tasdiqlang.");
      return;
    }

    if (!callbackQueryId || !chatId || !state) {
      if (callbackQueryId) {
        await answerCallbackQuerySafe(callbackQueryId, "Jarayon topilmadi.");
      }
      return;
    }

    try {
      if (data === "noop") {
        await answerCallbackQuerySafe(callbackQueryId, "Ko'rib chiqyapsiz 👀");
        return;
      }

      if (data.startsWith(CALLBACKS.catalogNav) && state.step === "catalog") {
        state.data.catalogIndex = Number.parseInt(data.slice(CALLBACKS.catalogNav.length), 10) || 0;
        await answerCallbackQuerySafe(callbackQueryId, "Boshqa tarif ochildi.");
        await showCatalogCard(chatId, state, "", callbackQuery.message);
        return;
      }

      if (data.startsWith(CALLBACKS.catalogAdd) && state.step === "catalog") {
        const payload = data.slice(CALLBACKS.catalogAdd.length);
        const [resourceType, mode] = payload.split(":");
        const includeTapchan = mode !== "without";
        const currentSelections = normalizeResourceSelections(state.data.selections ?? []);
        const nextSelections = normalizeResourceSelections([
          ...currentSelections.filter(
            (item) => buildCatalogSelectionKey(item.resourceType, item.includeTapchan) !== buildCatalogSelectionKey(resourceType, includeTapchan),
          ),
          {
            resourceType,
            includeTapchan,
            quantity: getSelectionQuantity(currentSelections, resourceType, includeTapchan) + 1,
          },
        ]);

        state.data.selections = nextSelections;
        await answerCallbackQuerySafe(callbackQueryId, "Savatga qo'shildi ✅");
        await showCatalogCard(chatId, state, "", callbackQuery.message);
        return;
      }

      if (data.startsWith(CALLBACKS.catalogRemove) && state.step === "catalog") {
        const payload = data.slice(CALLBACKS.catalogRemove.length);
        const [resourceType, mode] = payload.split(":");
        const includeTapchan = mode !== "without";
        const currentSelections = normalizeResourceSelections(state.data.selections ?? []);
        const currentQuantity = getSelectionQuantity(currentSelections, resourceType, includeTapchan);
        const nextSelections = normalizeResourceSelections([
          ...currentSelections.filter(
            (item) => buildCatalogSelectionKey(item.resourceType, item.includeTapchan) !== buildCatalogSelectionKey(resourceType, includeTapchan),
          ),
          ...(currentQuantity > 1
            ? [{ resourceType, includeTapchan, quantity: currentQuantity - 1 }]
            : []),
        ]);

        state.data.selections = nextSelections;
        await answerCallbackQuerySafe(callbackQueryId, currentQuantity > 0 ? "Savat yangilandi." : "Bu tarif savatda yo'q.");
        await showCatalogCard(chatId, state, "", callbackQuery.message);
        return;
      }

      if (data === CALLBACKS.catalogStart && state.step === "catalog") {
        if ((state.data.selections ?? []).length === 0) {
          await answerCallbackQuerySafe(callbackQueryId, "Avval savatga kamida bitta tarif qo'shing.");
          await showCatalogCard(chatId, state, "🧺 Avval savatni to'ldiring.", callbackQuery.message);
          return;
        }

        await answerCallbackQuerySafe(callbackQueryId, "Bronlashga o'tamiz.");
        await startBookingFromCatalog(chatId, state);
        return;
      }

      if (data === CALLBACKS.catalogBack && state.step === "catalog") {
        await answerCallbackQuerySafe(callbackQueryId, "Bosh menyu");
        await sendMainMenu(chatId, "🏠 Bosh menyuga qaytdik.");
        await cleanupCatalogMessage(callbackQuery.message);
        return;
      }

      if (data === CALLBACKS.proofCancel && state.step === "proof_confirm") {
        setChatState(chatId, "proof", { booking_id: state.data.booking_id });
        await answerCallbackQuerySafe(callbackQueryId, "Qayta yuborishingiz mumkin.");
        await telegram.sendMessage(chatId, "🔁 Yaxshi, chekni qayta yuboring. Foto, PDF yoki link qabul qilinadi.", {
          reply_markup: buildMainKeyboard(),
        });
        return;
      }

      if (data === CALLBACKS.proofConfirm && state.step === "proof_confirm") {
        await answerCallbackQuerySafe(callbackQueryId, "Chek yuborilmoqda.");
        await submitProof(
          chatId,
          state.data.sourceMessage ?? callbackQuery,
          state.data.booking_id,
          state.data.pendingProofLink ?? "",
          state.data.pendingProofFile ?? null,
        );
        return;
      }

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
          buildHelpMessage(),
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
          buildHelpMessage(),
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
      await telegram.sendMessage(chatId, "Kerakli bo'limni tanlang yoki /start yuboring.", {
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

      if ((state.data.selections ?? []).length > 0) {
        await promptDateSelection(chatId, state);
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
