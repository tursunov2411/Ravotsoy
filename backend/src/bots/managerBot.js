import { createTelegramClient, formatAxiosError, readOptionalEnv } from "./shared.js";

function isStartCommand(text) {
  return /^\/start(?:@\w+)?(?:\s|$)/i.test(text);
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

  return {
    isConfigured: Boolean(managerToken),
    async handleUpdate(update) {
      const message = update?.message;
      const callbackQuery = update?.callback_query;

      if (message?.chat?.id) {
        const chatId = message.chat.id;
        const text = String(message.text ?? "").trim();

        if (isStartCommand(text)) {
          await sendManagerMessage(chatId, "Manager bot ulandi. Backend xabarni qabul qildi.");
          return;
        }

        await sendManagerMessage(chatId, "Manager bot backendga ulangan. Xabaringiz qabul qilindi.");
        return;
      }

      if (callbackQuery?.id) {
        await answerCallbackQuery(callbackQuery.id, "Manager callback qabul qilindi.");
      }
    },
  };
}
