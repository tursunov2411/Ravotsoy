import express from "express";
import axios from "axios";
import { createClient } from "@supabase/supabase-js";
import { sendTelegramMessage } from "../scripts/send-telegram-booking.mjs";

const DEFAULT_PORT = 3001;
const BUTTONS = {
  packages: "\u{1F4E6} Paketlar",
  availability: "\u{1F4C5} Bo\u2018sh sanalar",
  booking: "\u{1F4DD} Bron qilish",
  contact: "\u{1F4DE} Aloqa",
};
const CALLBACKS = {
  packagePrefix: "package_",
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
const userState = {};

function requireEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} environment variable is required.`);
  }

  return value;
}

function createSupabaseClient() {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const supabaseKey = requireEnv("SUPABASE_KEY");

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function createTelegramClient() {
  const botToken = requireEnv("BOT_TOKEN");
  const api = axios.create({
    baseURL: `https://api.telegram.org/bot${botToken}/`,
    timeout: 15000,
  });

  async function callTelegram(method, payload) {
    const response = await api.post(method, payload);
    return response.data;
  }

  return {
    callTelegram,
    sendMessage(chatId, text, extra = {}) {
      return callTelegram("sendMessage", {
        chat_id: chatId,
        text,
        ...extra,
      });
    },
    sendPhoto(chatId, photo, caption, extra = {}) {
      return callTelegram("sendPhoto", {
        chat_id: chatId,
        photo,
        caption,
        ...extra,
      });
    },
    answerCallbackQuery(callbackQueryId, text) {
      return callTelegram("answerCallbackQuery", {
        callback_query_id: callbackQueryId,
        ...(text ? { text } : {}),
      });
    },
  };
}

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

function normalizeBooking(payload) {
  const record = payload.record ?? payload;

  return {
    name: record.name,
    phone: record.phone,
    guests: record.guests,
    date_start: record.date_start,
    date_end: record.date_end,
    estimated_price: record.estimated_price,
    package_name: record.package_name ?? record.package,
    type: record.type,
    type_label: record.type_label,
    dates: record.dates,
    price: record.price,
  };
}

function validateBooking(booking) {
  if (!booking.name || !booking.phone) {
    return "Majburiy maydonlar yetishmayapti.";
  }

  if (booking.date_start && booking.date_end) {
    const start = new Date(booking.date_start);
    const end = new Date(booking.date_end);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return "Sanalar noto'g'ri.";
    }
  }

  return null;
}

function extractMessageText(update) {
  return String(update?.message?.text ?? "").trim();
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
      [{ text: "\u2705 Tasdiqlash", callback_data: CALLBACKS.confirm }],
      [{ text: "\u274C Bekor qilish", callback_data: CALLBACKS.cancel }],
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

export function createTelegramWebhookApp() {
  const frontendUrl = process.env.FRONTEND_URL?.trim();
  const webhookSecret = process.env.WEBHOOK_SECRET?.trim();
  const supabase = createSupabaseClient();
  const telegram = createTelegramClient();
  const app = express();

  app.use(express.json({ limit: "1mb" }));
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", frontendUrl || "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-webhook-secret");

    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }

    next();
  });

  async function fetchPackages() {
    const { data, error } = await supabase
      .from("packages")
      .select("id, name, description, base_price, media(url)")
      .order("created_at", { ascending: true });

    if (error) {
      throw error;
    }

    return (data ?? []).map((item) => ({
      id: String(item.id),
      name: String(item.name ?? ""),
      description: String(item.description ?? ""),
      base_price: Number(item.base_price ?? 0),
      imageUrl: Array.isArray(item.media)
        ? String(item.media.find((media) => String(media?.url ?? "").trim())?.url ?? "")
        : "",
    }));
  }

  async function fetchContacts() {
    const { data, error } = await supabase
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

  async function insertBooking(bookingData) {
    const { error } = await supabase.from("bookings").insert({
      name: bookingData.name,
      phone: bookingData.phone,
      guests: bookingData.guests,
      package_id: bookingData.package_id,
      date_start: bookingData.date_start,
      status: "pending",
    });

    if (error) {
      throw error;
    }
  }

  async function answerCallbackQuerySafe(callbackQueryId, text) {
    try {
      await telegram.answerCallbackQuery(callbackQueryId, text);
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.description ?? error.message
        : error instanceof Error
          ? error.message
          : "Unknown error";
      console.error(`Telegram callback acknowledgement failed: ${message}`);
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
    clearChatState(chatId);
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
    state.data.packages = packages.map((item) => ({ id: item.id, name: item.name }));
    await telegram.sendMessage(chatId, "Paketni tanlang:", {
      reply_markup: buildPackageInlineKeyboard(packages),
    });
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
      if (!isValidDateInput(text)) {
        await telegram.sendMessage(chatId, "Sanani YYYY-MM-DD formatida kiriting.", {
          reply_markup: MAIN_KEYBOARD,
        });
        return true;
      }

      state.data.date_start = text;
      state.step = "confirm";
      await telegram.sendMessage(chatId, buildBookingSummary(state.data), {
        reply_markup: buildBookingConfirmationKeyboard(),
      });
      return true;
    }

    if (state.step === "confirm") {
      await telegram.sendMessage(chatId, "Tasdiqlash yoki bekor qilish tugmasini bosing.", {
        reply_markup: buildBookingConfirmationKeyboard(),
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
    delete state.data.packages;
    state.step = "date";

    await answerCallbackQuerySafe(callbackQueryId, "Paket tanlandi.");
    await telegram.sendMessage(chatId, "Sanani kiriting (YYYY-MM-DD)", {
      reply_markup: MAIN_KEYBOARD,
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
      await telegram.sendMessage(chatId, "\u274C Bekor qilindi", {
        reply_markup: MAIN_KEYBOARD,
      });
      return true;
    }

    try {
      await insertBooking(state.data);
      clearChatState(chatId);
      await answerCallbackQuerySafe(callbackQueryId, "So'rovingiz yuborildi.");
      await telegram.sendMessage(chatId, "\u2705 So\u2018rovingiz yuborildi!", {
        reply_markup: MAIN_KEYBOARD,
      });
    } catch (error) {
      console.error("Telegram booking insert failed:", error);
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

    if (await handleBookingDecision(callbackQuery)) {
      return;
    }

    if (callbackQuery.id) {
      await answerCallbackQuerySafe(callbackQuery.id);
    }
  }

  async function handleMessage(message) {
    const chatId = message?.chat?.id;
    const text = String(message?.text ?? "").trim();

    if (!chatId || !text) {
      return;
    }

    if (isStartCommand(text)) {
      await sendMainMenu(chatId);
      return;
    }

    if (text === BUTTONS.packages) {
      clearChatState(chatId);
      await sendPackages(chatId);
      return;
    }

    if (text === BUTTONS.contact) {
      clearChatState(chatId);
      await sendContacts(chatId);
      return;
    }

    if (text === BUTTONS.booking) {
      await startBookingConversation(chatId);
      return;
    }

    if (text === BUTTONS.availability) {
      await sendAvailabilityGuidance(chatId);
      return;
    }

    if (await advanceBookingConversation(chatId, text)) {
      return;
    }

    await telegram.sendMessage(chatId, "Kerakli bo'limni tanlang.", {
      reply_markup: MAIN_KEYBOARD,
    });
  }

  async function handleTelegramUpdate(update) {
    if (update?.callback_query) {
      await handleCallbackQuery(update.callback_query);
      return;
    }

    if (update?.message) {
      await handleMessage(update.message);
    }
  }

  app.get("/", (_req, res) => {
    res.status(200).json({ ok: true, service: "telegram-webhook" });
  });

  app.post("/telegram-webhook", async (req, res) => {
    res.status(200).json({ ok: true });

    try {
      await handleTelegramUpdate(req.body);
    } catch (error) {
      console.error("Telegram webhook handling failed:", error);
    }
  });

  app.post(["/telegram/booking", "/telegram-booking", "/send-telegram"], async (req, res) => {
    if ((req.path === "/telegram/booking" || req.path === "/telegram-booking") && webhookSecret) {
      const providedSecret = req.get("x-webhook-secret");

      if (providedSecret !== webhookSecret) {
        res.status(401).json({ ok: false, error: "Ruxsat yo'q" });
        return;
      }
    }

    try {
      const booking = normalizeBooking(req.body);
      const validationError = validateBooking(booking);

      if (validationError) {
        res.status(400).json({ ok: false, error: validationError });
        return;
      }

      await sendTelegramMessage(booking);
      res.status(200).json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Noma'lum xatolik";
      res.status(500).json({ ok: false, error: message });
    }
  });

  app.use((_req, res) => {
    res.status(404).json({ ok: false, error: "Topilmadi" });
  });

  return app;
}

export function startTelegramWebhookServer() {
  const app = createTelegramWebhookApp();
  const port = Number(process.env.PORT || DEFAULT_PORT);

  return app.listen(port, () => {
    console.log(`Telegram webhook server running on port ${port}`);
  });
}
