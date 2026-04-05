import { createTelegramClient, formatAxiosError, readOptionalEnv } from "../bots/shared.js";

const managerToken = readOptionalEnv("MANAGER_BOT_TOKEN");
const managerChatId = readOptionalEnv("CHAT_ID");
const telegram = managerToken && managerChatId ? createTelegramClient(managerToken) : null;

function formatDates(booking) {
  if (booking.date_start && booking.date_end) {
    return `${booking.date_start} dan ${booking.date_end} gacha`;
  }

  return booking.date_start || "Ko'rsatilmagan";
}

function formatPrice(value) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("uz-UZ").format(Number.isFinite(amount) ? amount : 0);
}

export async function notifyManagerAboutBooking(booking) {
  if (!telegram || !managerChatId || !booking) {
    return;
  }

  const lines = [
    "📥 Yangi bron",
    "",
    `Bron ID: ${booking.id}`,
    `Ism: ${booking.name || "Ko'rsatilmagan"}`,
    `Telefon: ${booking.phone || "Ko'rsatilmagan"}`,
    `Paket: ${booking.package_name || booking.package_id || "Ko'rsatilmagan"}`,
    `Manba: ${booking.source || "website"}`,
    `Odamlar: ${booking.guests || 0}`,
    `Sanalar: ${formatDates(booking)}`,
    `Narx: ${formatPrice(booking.total_price)} so'm`,
  ];

  try {
    await telegram.sendMessage(managerChatId, lines.join("\n"));
  } catch (error) {
    console.error(`Manager notification failed: ${formatAxiosError(error)}`);
  }
}
