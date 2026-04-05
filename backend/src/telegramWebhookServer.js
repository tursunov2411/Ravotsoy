import express from "express";
import multer from "multer";
import { createCustomerBot } from "./bots/customerBot.js";
import { createManagerBot } from "./bots/managerBot.js";
import { readOptionalEnv } from "./bots/shared.js";
import { sendTelegramMessage } from "../scripts/send-telegram-booking.mjs";
import { createBooking, getPaymentConfig, quoteBooking } from "./services/bookingEngine.js";
import { notifyManagerAboutBooking, notifyManagerAboutProof } from "./services/managerNotifications.js";
import { submitBookingProof } from "./services/proofService.js";

const DEFAULT_PORT = 3001;

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

function normalizeEnginePayload(payload) {
  const record = payload ?? {};

  return {
    userId: record.userId ?? record.user_id ?? null,
    packageId: record.packageId ?? record.package_id,
    name: record.name,
    phone: record.phone,
    email: record.email ?? "",
    peopleCount: record.peopleCount ?? record.people_count ?? record.guests,
    startDate: record.startDate ?? record.date_start,
    endDate: record.endDate ?? record.date_end ?? null,
    source: record.source ?? "website",
  };
}

export function createTelegramWebhookApp() {
  const frontendUrl = readOptionalEnv("FRONTEND_URL");
  const webhookSecret = readOptionalEnv("WEBHOOK_SECRET");
  const customerBot = createCustomerBot();
  const managerBot = createManagerBot();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024,
    },
  });
  const app = express();

  app.use(express.json({ limit: "5mb" }));
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

  async function processUpdate(handler, source, update) {
    try {
      await handler.handleUpdate(update);
    } catch (error) {
      console.error(`${source} webhook handling failed:`, error);
    }
  }

  app.get("/", (_req, res) => {
    res.status(200).json({
      ok: true,
      service: "telegram-webhook",
      routes: {
        customer: "/webhook/customer",
        manager: "/webhook/manager",
      },
      managerConfigured: managerBot.isConfigured,
    });
  });

  app.post("/webhook/customer", async (req, res) => {
    res.status(200).json({ ok: true });
    await processUpdate(customerBot, "Customer bot", req.body);
  });

  app.post("/webhook/manager", async (req, res) => {
    res.status(200).json({ ok: true });
    await processUpdate(managerBot, "Manager bot", req.body);
  });

  // Compatibility alias for the currently live customer bot.
  app.post("/telegram-webhook", async (req, res) => {
    res.status(200).json({ ok: true });
    await processUpdate(customerBot, "Customer bot", req.body);
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

  app.get("/api/payment-config", async (_req, res) => {
    try {
      const payment = await getPaymentConfig();
      res.status(200).json({ ok: true, payment });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Noma'lum xatolik";
      res.status(500).json({ ok: false, error: message });
    }
  });

  app.post("/api/bookings/quote", async (req, res) => {
    try {
      const quote = await quoteBooking(normalizeEnginePayload(req.body));
      res.status(200).json({ ok: true, ...quote });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Noma'lum xatolik";
      res.status(400).json({ ok: false, error: message });
    }
  });

  app.post("/api/bookings", async (req, res) => {
    try {
      const result = await createBooking(normalizeEnginePayload(req.body));

      if (!result.success) {
        res.status(409).json({ ok: false, ...result });
        return;
      }

      await notifyManagerAboutBooking(result.booking);
      res.status(200).json({ ok: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Noma'lum xatolik";
      res.status(400).json({ ok: false, error: message });
    }
  });

  app.post("/api/bookings/:id/proof", upload.single("file"), async (req, res) => {
    try {
      const bookingId = String(req.params.id ?? "").trim();
      const proofLink = String(req.body?.proofLink ?? req.body?.proof_url ?? "").trim();
      const file = req.file
        ? {
            buffer: req.file.buffer,
            originalName: req.file.originalname,
            contentType: req.file.mimetype,
          }
        : null;

      const context = await submitBookingProof({
        bookingId,
        proofLink,
        file,
      });

      await notifyManagerAboutProof(context);
      res.status(200).json({ ok: true, context });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Noma'lum xatolik";
      res.status(400).json({ ok: false, error: message });
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
