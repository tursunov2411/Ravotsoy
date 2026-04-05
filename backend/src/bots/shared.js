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
      return callTelegram("sendPhoto", {
        chat_id: chatId,
        photo,
        caption,
        ...extra,
      });
    },
    answerCallbackQuery(callbackQueryId, text) {
      return callTelegram("answerCallbackQuery", {
        callback_query_id: callbackQueryId,
        ...(text ? { text } : {}),
      });
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
