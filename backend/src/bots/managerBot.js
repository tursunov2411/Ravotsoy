import { createTelegramClient, formatAxiosError, readOptionalEnv } from "./shared.js";
import { approveBookingProof, fetchBookingContext, loadLatestProofAsset, rejectBookingProof } from "../services/proofService.js";
import {
  clearManagerDecisionKeyboard,
  notifyCustomerAboutDecision,
  sendManagerProofPreview,
} from "../services/managerNotifications.js";

const ACTIONS = {
  view: "view_",
  approve: "approve_",
  reject: "reject_",
};

function isStartCommand(text) {
  return /^\/start(?:@\w+)?(?:\s|$)/i.test(text);
}

function getBookingId(callbackData, prefix) {
  const data = String(callbackData ?? "");
  return data.startsWith(prefix) ? data.slice(prefix.length) : "";
}

function formatDecisionMessage(context, approved) {
  const booking = context?.booking;

  if (!booking) {
    return approved ? "Bron tasdiqlandi." : "Bron rad etildi.";
  }

  return [
    approved ? "✅ Booking confirmed" : "❌ Booking rejected",
    `Bron ID: ${booking.id}`,
    `Mijoz: ${booking.name || "Ko'rsatilmagan"}`,
    `Paket: ${booking.package_name || booking.package_id || "Ko'rsatilmagan"}`,
  ].join("\n");
}

export function createManagerBot() {
  const managerToken = readOptionalEnv("MANAGER_BOT_TOKEN");
  const telegram = managerToken ? createTelegramClient(managerToken) : null;

  async function sendManagerMessage(chatId, text, extra = {}) {
    if (!telegram) {
      console.warn("Manager bot update received, but MANAGER_BOT_TOKEN is not configured.");
      return;
    }

    await telegram.sendMessage(chatId, text, extra);
  }

  async function answerCallbackQuery(callbackQueryId, text) {
    if (!telegram) {
      console.warn("Manager callback received, but MANAGER_BOT_TOKEN is not configured.");
      return;
    }

    try {
      await telegram.answerCallbackQuery(callbackQueryId, text);
    } catch (error) {
      console.error(`Manager callback acknowledgement failed: ${formatAxiosError(error)}`);
    }
  }

  async function handleViewProof(callbackQuery) {
    const callbackQueryId = callbackQuery?.id;
    const chatId = callbackQuery?.message?.chat?.id;
    const bookingId = getBookingId(callbackQuery?.data, ACTIONS.view);

    if (!callbackQueryId || !chatId || !bookingId) {
      return false;
    }

    try {
      const [proofAsset, context] = await Promise.all([
        loadLatestProofAsset(bookingId),
        fetchBookingContext(bookingId),
      ]);

      if (!proofAsset || !context?.booking) {
        await answerCallbackQuery(callbackQueryId, "Proof topilmadi.");
        return true;
      }

      await sendManagerProofPreview(chatId, bookingId, proofAsset, context.booking);
      await answerCallbackQuery(callbackQueryId, "Proof yuborildi.");
    } catch (error) {
      console.error(`Manager proof preview failed: ${formatAxiosError(error)}`);
      await answerCallbackQuery(callbackQueryId, "Proofni ochib bo'lmadi.");
    }

    return true;
  }

  async function handleDecision(callbackQuery, approved) {
    const callbackQueryId = callbackQuery?.id;
    const chatId = callbackQuery?.message?.chat?.id;
    const messageId = callbackQuery?.message?.message_id;
    const bookingId = getBookingId(callbackQuery?.data, approved ? ACTIONS.approve : ACTIONS.reject);

    if (!callbackQueryId || !chatId || !messageId || !bookingId) {
      return false;
    }

    try {
      const context = approved ? await approveBookingProof(bookingId) : await rejectBookingProof(bookingId);

      await clearManagerDecisionKeyboard(chatId, messageId);
      await answerCallbackQuery(callbackQueryId, approved ? "Bron tasdiqlandi." : "Bron rad etildi.");
      await sendManagerMessage(chatId, formatDecisionMessage(context, approved));
      await notifyCustomerAboutDecision(context, approved);
    } catch (error) {
      console.error(`Manager decision failed: ${formatAxiosError(error)}`);
      await answerCallbackQuery(callbackQueryId, error instanceof Error ? error.message : "Qarorni saqlab bo'lmadi.");
    }

    return true;
  }

  return {
    isConfigured: Boolean(managerToken),
    async handleUpdate(update) {
      const message = update?.message;
      const callbackQuery = update?.callback_query;

      if (message?.chat?.id) {
        const chatId = message.chat.id;
        const text = String(message.text ?? "").trim();

        if (isStartCommand(text)) {
          await sendManagerMessage(chatId, "Manager bot tayyor. Qarorlarni inline tugmalar orqali boshqaring.");
          return;
        }

        await sendManagerMessage(chatId, "Manager bot faqat inline tugmalar orqali ishlaydi.");
        return;
      }

      if (!callbackQuery?.id) {
        return;
      }

      if (await handleViewProof(callbackQuery)) {
        return;
      }

      if (await handleDecision(callbackQuery, true)) {
        return;
      }

      if (await handleDecision(callbackQuery, false)) {
        return;
      }

      await answerCallbackQuery(callbackQuery.id, "Noma'lum amal.");
    },
  };
}
