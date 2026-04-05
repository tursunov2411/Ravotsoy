import { createTelegramClient, formatAxiosError, readOptionalEnv } from "../bots/shared.js";

const managerToken = readOptionalEnv("MANAGER_BOT_TOKEN");
const customerToken = readOptionalEnv("CUSTOMER_BOT_TOKEN", "BOT_TOKEN");
const managerChatId = readOptionalEnv("CHAT_ID");
const managerTelegram = managerToken && managerChatId ? createTelegramClient(managerToken) : null;
const customerTelegram = customerToken ? createTelegramClient(customerToken) : null;

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

function buildManagerDecisionKeyboard(bookingId) {
  return {
    inline_keyboard: [
      [{ text: "View Proof", callback_data: `view_${bookingId}` }],
      [
        { text: "Approve", callback_data: `approve_${bookingId}` },
        { text: "Reject", callback_data: `reject_${bookingId}` },
      ],
    ],
  };
}

export async function notifyManagerAboutBooking(booking) {
  if (!managerTelegram || !managerChatId || !booking) {
    return;
  }

  const lines = [
    "New booking",
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
    await managerTelegram.sendMessage(managerChatId, lines.join("\n"));
  } catch (error) {
    console.error(`Manager notification failed: ${formatAxiosError(error)}`);
  }
}

export async function notifyManagerAboutProof(context) {
  if (!managerTelegram || !managerChatId || !context?.booking) {
    return null;
  }

  const { booking, payment } = context;
  const lines = [
    "New payment proof",
    "",
    `Booking: ${booking.id}`,
    `User: ${booking.name || "Ko'rsatilmagan"}`,
    `Phone: ${booking.phone || "Ko'rsatilmagan"}`,
    `Package: ${booking.package_name || booking.package_id || "Ko'rsatilmagan"}`,
    `Amount: ${formatPrice(payment?.amount ?? booking.total_price)} UZS`,
    `Dates: ${formatDates(booking)}`,
  ];

  try {
    const response = await managerTelegram.sendMessage(managerChatId, lines.join("\n"), {
      reply_markup: buildManagerDecisionKeyboard(booking.id),
    });

    return response?.result ?? null;
  } catch (error) {
    console.error(`Manager proof notification failed: ${formatAxiosError(error)}`);
    return null;
  }
}

export async function notifyCustomerAboutDecision(context, approved) {
  const chatId = context?.user?.telegram_id;

  if (!customerTelegram || !chatId || !context?.booking) {
    return;
  }

  const booking = context.booking;
  const text = approved
    ? [
        "Booking confirmed",
        "",
        "Sizning broningiz tasdiqlandi.",
        `Bron ID: ${booking.id}`,
        "Tez orada siz bilan bog'lanamiz.",
      ].join("\n")
    : [
        "Payment rejected",
        "",
        "To'lov tasdiqlanmadi. Iltimos qo'llab-quvvatlash bilan bog'laning yoki yangi bron yarating.",
        `Bron ID: ${booking.id}`,
      ].join("\n");

  try {
    await customerTelegram.sendMessage(chatId, text);
  } catch (error) {
    console.error(`Customer decision notification failed: ${formatAxiosError(error)}`);
  }
}

export async function sendManagerProofPreview(chatId, bookingId, proofAsset, booking) {
  if (!managerTelegram || !chatId || !proofAsset) {
    return;
  }

  if (proofAsset.kind === "photo") {
    await managerTelegram.sendPhoto(
      chatId,
      {
        buffer: proofAsset.buffer,
        filename: proofAsset.fileName,
        contentType: proofAsset.contentType,
      },
      `Booking ${bookingId} proof`,
    );
    return;
  }

  if (proofAsset.kind === "document") {
    await managerTelegram.sendDocument(chatId, {
      buffer: proofAsset.buffer,
      filename: proofAsset.fileName,
      contentType: proofAsset.contentType,
    }, {
      caption: `Booking ${bookingId} proof`,
    });
    return;
  }

  await managerTelegram.sendMessage(chatId, [
    `Booking ${bookingId} proof link:`,
    proofAsset.proofUrl,
    booking?.name ? `Customer: ${booking.name}` : "",
  ].filter(Boolean).join("\n"));
}

export async function clearManagerDecisionKeyboard(chatId, messageId) {
  if (!managerTelegram || !chatId || !messageId) {
    return;
  }

  try {
    await managerTelegram.editMessageReplyMarkup(chatId, messageId, {
      inline_keyboard: [],
    });
  } catch (error) {
    console.error(`Manager keyboard cleanup failed: ${formatAxiosError(error)}`);
  }
}
