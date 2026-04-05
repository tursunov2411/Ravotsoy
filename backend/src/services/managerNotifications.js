import { createSupabasePrivilegedClient } from "../bots/shared.js";
import { createTelegramClient, formatAxiosError, readOptionalEnv } from "../bots/shared.js";

const managerToken = readOptionalEnv("MANAGER_BOT_TOKEN");
const customerToken = readOptionalEnv("CUSTOMER_BOT_TOKEN", "BOT_TOKEN");
const managerChatId = readOptionalEnv("CHAT_ID");
const managerTelegram = managerToken && managerChatId ? createTelegramClient(managerToken) : null;
const customerTelegram = customerToken ? createTelegramClient(customerToken) : null;
const supabase = createSupabasePrivilegedClient();

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

function getBookingLabel(booking) {
  return booking?.booking_label || booking?.resource_summary || "Ko'rsatilmagan";
}

function buildManagerDecisionKeyboard(bookingId) {
  return {
    inline_keyboard: [
      [{ text: "👁 Bronni ko'rish", callback_data: `mbook_detail_${bookingId}` }],
      [{ text: "🧾 Chekni ko'rish", callback_data: `view_${bookingId}` }],
      [
        { text: "✅ Tasdiqlash", callback_data: `approve_${bookingId}` },
        { text: "❌ Rad etish", callback_data: `reject_${bookingId}` },
      ],
    ],
  };
}

async function readNotificationState(bookingId) {
  if (!bookingId) {
    return null;
  }

  const { data, error } = await supabase
    .from("bookings")
    .select("id, manager_booking_notified_at, manager_proof_notified_at, manager_proof_message_id, manager_proof_chat_id, status, payment_status")
    .eq("id", bookingId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function updateNotificationState(bookingId, values) {
  const { error } = await supabase
    .from("bookings")
    .update(values)
    .eq("id", bookingId);

  if (error) {
    throw error;
  }
}

export async function notifyManagerAboutBooking(booking) {
  if (!managerTelegram || !managerChatId || !booking?.id) {
    return;
  }

  try {
    const state = await readNotificationState(booking.id);

    if (state?.manager_booking_notified_at) {
      return;
    }

    const lines = [
      "🆕 Yangi bron",
      "",
      `Bron ID: ${booking.id}`,
      `Ism: ${booking.name || "Ko'rsatilmagan"}`,
      `Telefon: ${booking.phone || "Ko'rsatilmagan"}`,
      `Tanlov: ${getBookingLabel(booking)}`,
      `Manba: ${booking.source || "website"}`,
      `Odamlar: ${booking.guests || 0}`,
      `Sanalar: ${formatDates(booking)}`,
      `Narx: ${formatPrice(booking.total_price)} so'm`,
    ];

    await managerTelegram.sendMessage(managerChatId, lines.join("\n"), {
      reply_markup: buildManagerDecisionKeyboard(booking.id),
    });
    await updateNotificationState(booking.id, {
      manager_booking_notified_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`Manager notification failed: ${formatAxiosError(error)}`);
  }
}

export async function notifyManagerAboutProof(context) {
  if (!managerTelegram || !managerChatId || !context?.booking?.id) {
    return null;
  }

  const booking = context.booking;
  const payment = context.payment ?? {};

  try {
    const state = await readNotificationState(booking.id);

    if (state?.manager_proof_notified_at && state?.status === "proof_submitted") {
      return state?.manager_proof_message_id
        ? {
            message_id: state.manager_proof_message_id,
            chat: { id: state.manager_proof_chat_id ? Number(state.manager_proof_chat_id) : Number(managerChatId) },
          }
        : null;
    }

    const lines = [
      "🧾 Yangi to'lov cheki",
      "",
      `Booking: ${booking.id}`,
      `User: ${booking.name || "Ko'rsatilmagan"}`,
      `Phone: ${booking.phone || "Ko'rsatilmagan"}`,
      `Selection: ${getBookingLabel(booking)}`,
      `Amount: ${formatPrice(payment?.amount ?? booking.total_price)} UZS`,
      `Dates: ${formatDates(booking)}`,
    ];

    const response = await managerTelegram.sendMessage(managerChatId, lines.join("\n"), {
      reply_markup: buildManagerDecisionKeyboard(booking.id),
    });

    const result = response?.result ?? null;
    await updateNotificationState(booking.id, {
      manager_proof_notified_at: new Date().toISOString(),
      manager_proof_message_id: result?.message_id ?? null,
      manager_proof_chat_id: result?.chat?.id ?? null,
    });

    return result;
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
        `Tanlov: ${getBookingLabel(booking)}`,
        "Tez orada siz bilan bog'lanamiz.",
      ].join("\n")
    : [
        "Payment rejected",
        "",
        "To'lov tasdiqlanmadi. Iltimos qo'llab-quvvatlash bilan bog'laning yoki yangi bron yarating.",
        `Bron ID: ${booking.id}`,
        `Tanlov: ${getBookingLabel(booking)}`,
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

export async function clearManagerDecisionKeyboard(chatId, messageId, bookingId = "") {
  if (!managerTelegram || !chatId || !messageId) {
    return;
  }

  try {
    await managerTelegram.editMessageReplyMarkup(chatId, messageId, {
      inline_keyboard: [],
    });

    if (bookingId) {
      await updateNotificationState(bookingId, {
        manager_proof_message_id: null,
        manager_proof_chat_id: null,
      });
    }
  } catch (error) {
    console.error(`Manager keyboard cleanup failed: ${formatAxiosError(error)}`);
  }
}
