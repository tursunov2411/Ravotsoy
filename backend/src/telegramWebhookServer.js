import express from "express";
import axios from "axios";
import { createClient } from "@supabase/supabase-js";
import { sendTelegramMessage } from "../scripts/send-telegram-booking.mjs";

const DEFAULT_PORT = 3001;
const MAIN_KEYBOARD = {
  keyboard: [
    [{ text: "📦 Paketlar" }, { text: "📅 Bo‘sh sanalar" }],
    [{ text: "📝 Bron qilish" }, { text: "📞 Aloqa" }],
  ],
  resize_keyboard: true,
  one_time_keyboard: false,
};

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
  };
}

function formatPrice(value) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("uz-UZ").format(Number.isFinite(amount) ? amount : 0);
}

function formatPackageCaption(item) {
  return [
    item.name,
    "",
    item.description,
    "",
    `Narxi: ${formatPrice(item.base_price)} so'm`,
  ].join("\n");
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

  async function sendMainMenu(chatId) {
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

  async function sendBookingGuidance(chatId) {
    await telegram.sendMessage(
      chatId,
      "Bron qilish uchun operator bilan bog'laning. Aloqa ma'lumotlarini yuboryapman.",
      { reply_markup: MAIN_KEYBOARD },
    );
    await sendContacts(chatId);
  }

  async function sendAvailabilityGuidance(chatId) {
    await telegram.sendMessage(
      chatId,
      "Bo'sh sanalarni aniqlashtirish uchun operator bilan bog'laning. Aloqa ma'lumotlarini yuboryapman.",
      { reply_markup: MAIN_KEYBOARD },
    );
    await sendContacts(chatId);
  }

  async function handleTelegramUpdate(update) {
    const chatId = update?.message?.chat?.id;
    const text = extractMessageText(update);

    if (!chatId || !text) {
      return;
    }

    if (isStartCommand(text)) {
      await sendMainMenu(chatId);
      return;
    }

    if (text === "📦 Paketlar") {
      await sendPackages(chatId);
      return;
    }

    if (text === "📞 Aloqa") {
      await sendContacts(chatId);
      return;
    }

    if (text === "📝 Bron qilish") {
      await sendBookingGuidance(chatId);
      return;
    }

    if (text === "📅 Bo‘sh sanalar") {
      await sendAvailabilityGuidance(chatId);
      return;
    }

    await telegram.sendMessage(chatId, "Kerakli bo'limni tanlang.", {
      reply_markup: MAIN_KEYBOARD,
    });
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
