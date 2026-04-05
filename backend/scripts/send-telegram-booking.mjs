import axios from "axios";
import "dotenv/config";
import { pathToFileURL } from "node:url";

const botToken = process.env.MANAGER_BOT_TOKEN || process.env.CUSTOMER_BOT_TOKEN || process.env.BOT_TOKEN;
const chatId = process.env.CHAT_ID;

function ensureConfig() {
  if (!botToken || !chatId) {
    throw new Error("MANAGER_BOT_TOKEN/CUSTOMER_BOT_TOKEN va CHAT_ID muhit o'zgaruvchilari kerak.");
  }
}

function formatDates(data) {
  if (data.dates) {
    return data.dates;
  }

  if (data.date_start && data.date_end) {
    return `${data.date_start} dan ${data.date_end} gacha`;
  }

  if (data.date_start) {
    return data.date_start;
  }

  if (data.date) {
    return data.date;
  }

  return "Ko'rsatilmagan";
}

function formatType(data) {
  if (data.type_label) {
    return data.type_label;
  }

  if (data.type === "stay") {
    return "Tunab qolish";
  }

  if (data.type === "day") {
    return "Kunlik dam olish";
  }

  return data.type_label ?? "Ko'rsatilmagan";
}

function formatBookingText(data) {
  const estimatedPrice = data.estimated_price ?? data.price ?? 0;

  return [
    "Yangi bron:",
    "",
    `Ism: ${data.name ?? "Ko'rsatilmagan"}`,
    `Telefon: ${data.phone ?? "Ko'rsatilmagan"}`,
    `Paket: ${data.package_name ?? data.package ?? "Ko'rsatilmagan"}`,
    `Turi: ${formatType(data)}`,
    `Odamlar soni: ${data.guests ?? "Ko'rsatilmagan"}`,
    `Sanalar: ${formatDates(data)}`,
    `Taxminiy narx: ${estimatedPrice} so'm`,
  ].join("\n");
}

export async function sendTelegramMessage(data) {
  ensureConfig();

  const text = formatBookingText(data);
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  const response = await axios.post(url, {
    chat_id: chatId,
    text,
  });

  return response.data;
}

async function runCli() {
  const rawPayload = process.argv[2];

  if (!rawPayload) {
    console.error(
      "Foydalanish: npm run telegram:test --workspace backend -- '{\"name\":\"Ali\",\"phone\":\"+998...\"}'",
    );
    process.exit(1);
  }

  let booking;

  try {
    booking = JSON.parse(rawPayload);
  } catch {
    console.error("JSON format noto'g'ri.");
    process.exit(1);
  }

  try {
    await sendTelegramMessage(booking);
    console.log("Telegramga muvaffaqiyatli yuborildi.");
  } catch (error) {
    const message = axios.isAxiosError(error)
      ? error.response?.data ?? error.message
      : error instanceof Error
        ? error.message
        : "Noma'lum xatolik";

    console.error("Telegramga yuborishda xatolik:", message);
    process.exit(1);
  }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  await runCli();
}
