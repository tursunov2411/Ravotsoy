import { randomBytes } from "node:crypto";
import { createSupabasePrivilegedClient } from "../bots/shared.js";

const supabase = createSupabasePrivilegedClient();

function requireText(value, fieldName) {
  const text = String(value ?? "").trim();

  if (!text) {
    throw new Error(`${fieldName} is required`);
  }

  return text;
}

export async function claimTelegramUpdate(botName, updateId) {
  const normalizedBotName = requireText(botName, "botName");

  if (!Number.isInteger(updateId) || updateId <= 0) {
    return true;
  }

  const { error } = await supabase.from("telegram_processed_updates").insert({
    bot_name: normalizedBotName,
    update_id: updateId,
  });

  if (!error) {
    return true;
  }

  if (String(error.code ?? "") === "23505") {
    return false;
  }

  throw error;
}

export async function createTelegramPrefill(payload) {
  const token = randomBytes(18).toString("base64url");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString();

  const { error } = await supabase.from("telegram_prefills").insert({
    token,
    payload,
    expires_at: expiresAt,
  });

  if (error) {
    throw error;
  }

  return {
    token,
    expiresAt,
    payload,
  };
}

export async function getTelegramPrefill(token) {
  const normalizedToken = requireText(token, "token");
  const { data, error } = await supabase
    .from("telegram_prefills")
    .select("token, payload, expires_at")
    .eq("token", normalizedToken)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    token: String(data.token),
    expiresAt: String(data.expires_at),
    payload: data.payload ?? {},
  };
}
