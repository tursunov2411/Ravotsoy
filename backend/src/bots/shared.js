import axios from "axios";
import { createClient } from "@supabase/supabase-js";

export function readEnv(name, ...fallbacks) {
  const candidates = [name, ...fallbacks];

  for (const candidate of candidates) {
    const value = process.env[candidate]?.trim();

    if (value) {
      return value;
    }
  }

  throw new Error(`${name} environment variable is required.`);
}

export function readOptionalEnv(name, ...fallbacks) {
  const candidates = [name, ...fallbacks];

  for (const candidate of candidates) {
    const value = process.env[candidate]?.trim();

    if (value && !/^(paste_|your_)/i.test(value)) {
      return value;
    }
  }

  return "";
}

function createSupabaseClient(key) {
  return createClient(readEnv("SUPABASE_URL"), key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function createSupabasePublicClient() {
  return createSupabaseClient(readEnv("SUPABASE_ANON_KEY", "SUPABASE_KEY"));
}

export function createSupabasePrivilegedClient() {
  const key = readOptionalEnv("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "SUPABASE_KEY");
  return createSupabaseClient(key || readEnv("SUPABASE_ANON_KEY", "SUPABASE_KEY"));
}

export function createTelegramClient(token) {
  const api = axios.create({
    baseURL: `https://api.telegram.org/bot${token}/`,
    timeout: 15000,
  });

  async function callTelegram(method, payload) {
    const response = await api.post(method, payload);
    return response.data;
  }

  async function callTelegramMultipart(method, payload) {
    const form = new FormData();

    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined || value === null) {
        continue;
      }

      if (typeof value === "object" && "buffer" in value) {
        const file = value;
        const blob = new Blob([file.buffer], {
          type: file.contentType || "application/octet-stream",
        });

        form.append(key, blob, file.filename || "file");
        continue;
      }

      form.append(key, typeof value === "string" ? value : JSON.stringify(value));
    }

    const response = await api.post(method, form);
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
      if (typeof photo !== "string") {
        return callTelegramMultipart("sendPhoto", {
          chat_id: chatId,
          photo,
          ...(caption ? { caption } : {}),
          ...extra,
        });
      }

      return callTelegram("sendPhoto", {
        chat_id: chatId,
        photo,
        caption,
        ...extra,
      });
    },
    sendDocument(chatId, document, extra = {}) {
      if (typeof document !== "string") {
        return callTelegramMultipart("sendDocument", {
          chat_id: chatId,
          document,
          ...extra,
        });
      }

      return callTelegram("sendDocument", {
        chat_id: chatId,
        document,
        ...extra,
      });
    },
    sendSticker(chatId, sticker, extra = {}) {
      if (typeof sticker !== "string") {
        return callTelegramMultipart("sendSticker", {
          chat_id: chatId,
          sticker,
          ...extra,
        });
      }

      return callTelegram("sendSticker", {
        chat_id: chatId,
        sticker,
        ...extra,
      });
    },
    answerCallbackQuery(callbackQueryId, text) {
      return callTelegram("answerCallbackQuery", {
        callback_query_id: callbackQueryId,
        ...(text ? { text } : {}),
      });
    },
    editMessageReplyMarkup(chatId, messageId, replyMarkup) {
      return callTelegram("editMessageReplyMarkup", {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: replyMarkup,
      });
    },
    getFile(fileId) {
      return callTelegram("getFile", {
        file_id: fileId,
      });
    },
    async downloadFile(filePath) {
      const response = await axios.get(`https://api.telegram.org/file/bot${token}/${filePath}`, {
        responseType: "arraybuffer",
        timeout: 15000,
      });

      return Buffer.from(response.data);
    },
  };
}

export function formatAxiosError(error) {
  return axios.isAxiosError(error)
    ? error.response?.data?.description ?? error.message
    : error instanceof Error
      ? error.message
      : "Unknown error";
}
