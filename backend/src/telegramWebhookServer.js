import express from "express";
import multer from "multer";
import { createCustomerBot } from "./bots/customerBot.js";
import { createManagerBot } from "./bots/managerBot.js";
import { readOptionalEnv } from "./bots/shared.js";
import {
  createBooking,
  createTelegramPrefill,
  getPaymentConfig,
  getTripBuilderOptions,
  quoteBooking,
} from "./services/bookingEngine.js";
import { approveBookingProof, rejectBookingProof, submitBookingProof } from "./services/proofService.js";
import { claimTelegramUpdate } from "./services/telegramFlow.js";

const DEFAULT_PORT = 3001;

function normalizeEnginePayload(payload) {
  const record = payload ?? {};

  return {
    userId: record.userId ?? record.user_id ?? null,
    resourceSelections: record.resourceSelections ?? record.resource_selections ?? [],
    resourceType: record.resourceType ?? record.resource_type ?? "",
    resourceQuantity: record.resourceQuantity ?? record.resource_quantity ?? 1,
    includeTapchan: record.includeTapchan ?? record.include_tapchan,
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
    const updateId = Number(update?.update_id);

    try {
      const claimed = await claimTelegramUpdate(source, updateId);

      if (!claimed) {
        return;
      }

      await handler.handleUpdate(update);
    } catch (error) {
      console.error(`${source} webhook handling failed:`, error);
    }
  }

  async function handleQuoteRequest(req, res) {
    try {
      const quote = await quoteBooking(normalizeEnginePayload(req.body));
      res.status(200).json({ ok: true, ...quote });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Noma'lum xatolik";
      res.status(400).json({ ok: false, error: message });
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
    await processUpdate(customerBot, "customer", req.body);
  });

  app.post("/webhook/manager", async (req, res) => {
    res.status(200).json({ ok: true });
    await processUpdate(managerBot, "manager", req.body);
  });

  app.post("/telegram-webhook", async (req, res) => {
    res.status(200).json({ ok: true });
    await processUpdate(customerBot, "customer", req.body);
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

  app.get("/api/trip-builder/options", async (_req, res) => {
    try {
      const options = await getTripBuilderOptions();
      res.status(200).json({ ok: true, options });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Noma'lum xatolik";
      res.status(500).json({ ok: false, error: message });
    }
  });

  app.post("/api/quote", handleQuoteRequest);
  app.post("/api/bookings/quote", handleQuoteRequest);

  app.post("/api/telegram/prefill", async (req, res) => {
    try {
      const result = await createTelegramPrefill(normalizeEnginePayload(req.body));
      res.status(200).json({ ok: true, ...result });
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

      res.status(200).json({ ok: true, context });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Noma'lum xatolik";
      res.status(400).json({ ok: false, error: message });
    }
  });

  app.post("/api/bookings/:id/approve", async (req, res) => {
    try {
      const context = await approveBookingProof(String(req.params.id ?? "").trim());
      res.status(200).json({ ok: true, context });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Noma'lum xatolik";
      res.status(400).json({ ok: false, error: message });
    }
  });

  app.post("/api/bookings/:id/reject", async (req, res) => {
    try {
      const context = await rejectBookingProof(String(req.params.id ?? "").trim());
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
