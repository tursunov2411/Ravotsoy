import http from "node:http";
import { sendTelegramMessage } from "./send-telegram-booking.mjs";

const port = Number(process.env.PORT || 3001);
const webhookSecret = process.env.WEBHOOK_SECRET;
const frontendUrl = process.env.FRONTEND_URL;

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", reject);
  });
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

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", frontendUrl || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-webhook-secret");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "telegram-webhook", port }));
    return;
  }

  if (req.method !== "POST" || !["/telegram/booking", "/send-telegram"].includes(req.url ?? "")) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "Topilmadi" }));
    return;
  }

  if (req.url === "/telegram/booking" && webhookSecret) {
    const providedSecret = req.headers["x-webhook-secret"];

    if (providedSecret !== webhookSecret) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Ruxsat yo'q" }));
      return;
    }
  }

  try {
    const payload = await readJsonBody(req);
    const booking = normalizeBooking(payload);
    const validationError = validateBooking(booking);

    if (validationError) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: validationError }));
      return;
    }

    await sendTelegramMessage(booking);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Noma'lum xatolik";
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: message }));
  }
});

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
