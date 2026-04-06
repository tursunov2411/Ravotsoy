import { randomUUID } from "node:crypto";
import { createSupabasePrivilegedClient } from "../bots/shared.js";

const supabase = createSupabasePrivilegedClient();

function normalizeActor(actor = {}) {
  const telegramId = Number(actor.telegramId ?? actor.managerTelegramId ?? 0);
  const chatId = Number(actor.chatId ?? actor.managerChatId ?? 0);

  return {
    telegramId: Number.isInteger(telegramId) && telegramId > 0 ? telegramId : null,
    chatId: Number.isInteger(chatId) && chatId !== 0 ? chatId : null,
    username: String(actor.username ?? actor.managerUsername ?? "").trim().replace(/^@+/, ""),
    name: String(actor.name ?? actor.managerName ?? "").trim(),
  };
}

function isMissingAuditTableError(error) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`.toLowerCase();
  return message.includes("manager_action_logs") || message.includes("does not exist");
}

function normalizeAuditRecord(record) {
  return {
    id: String(record.id ?? record.token ?? ""),
    actionType: String(record.action_type ?? record.payload?.actionType ?? "").trim(),
    entityType: String(record.entity_type ?? record.payload?.entityType ?? "").trim(),
    entityId: String(record.entity_id ?? record.payload?.entityId ?? "").trim(),
    bookingId: String(record.booking_id ?? record.payload?.bookingId ?? "").trim(),
    summary: String(record.summary ?? record.payload?.summary ?? "").trim(),
    details: record.details ?? record.payload?.details ?? {},
    actorTelegramId: record.actor_telegram_id ? Number(record.actor_telegram_id) : Number(record.payload?.actorTelegramId ?? 0) || null,
    actorChatId: record.actor_chat_id ? Number(record.actor_chat_id) : Number(record.payload?.actorChatId ?? 0) || null,
    actorUsername: String(record.actor_username ?? record.payload?.actorUsername ?? "").trim(),
    actorName: String(record.actor_name ?? record.payload?.actorName ?? "").trim(),
    createdAt: String(record.created_at ?? record.payload?.createdAt ?? ""),
  };
}

export async function logManagerAction({
  actionType,
  entityType = "",
  entityId = "",
  bookingId = "",
  summary = "",
  details = {},
  actor = {},
}) {
  const normalizedActionType = String(actionType ?? "").trim();

  if (!normalizedActionType) {
    return null;
  }

  const normalizedActor = normalizeActor(actor);
  const payload = {
    action_type: normalizedActionType,
    entity_type: String(entityType ?? "").trim() || null,
    entity_id: String(entityId ?? "").trim() || null,
    booking_id: String(bookingId ?? "").trim() || null,
    summary: String(summary ?? "").trim() || normalizedActionType,
    details: details ?? {},
    actor_telegram_id: normalizedActor.telegramId,
    actor_chat_id: normalizedActor.chatId,
    actor_username: normalizedActor.username || null,
    actor_name: normalizedActor.name || null,
  };

  try {
    const { data, error } = await supabase
      .from("manager_action_logs")
      .insert(payload)
      .select("id, action_type, entity_type, entity_id, booking_id, summary, details, actor_telegram_id, actor_chat_id, actor_username, actor_name, created_at")
      .single();

    if (error) {
      throw error;
    }

    return normalizeAuditRecord(data);
  } catch (error) {
    if (!isMissingAuditTableError(error)) {
      throw error;
    }

    const fallbackPayload = {
      actionType: normalizedActionType,
      entityType: payload.entity_type ?? "",
      entityId: payload.entity_id ?? "",
      bookingId: payload.booking_id ?? "",
      summary: payload.summary,
      details: payload.details ?? {},
      actorTelegramId: normalizedActor.telegramId,
      actorChatId: normalizedActor.chatId,
      actorUsername: normalizedActor.username,
      actorName: normalizedActor.name,
      createdAt: new Date().toISOString(),
    };

    const { data: stored, error: storeError } = await supabase
      .from("telegram_prefills")
      .insert({
        token: `ops_audit_${randomUUID()}`,
        payload: fallbackPayload,
        expires_at: "2099-12-31T23:59:59Z",
      })
      .select("token, payload, created_at")
      .single();

    if (storeError) {
      throw storeError;
    }

    return normalizeAuditRecord(stored);
  }
}

export async function listManagerActionLogs(limit = 20) {
  const normalizedLimit = Math.max(Number(limit ?? 20), 1);

  try {
    const { data, error } = await supabase
      .from("manager_action_logs")
      .select("id, action_type, entity_type, entity_id, booking_id, summary, details, actor_telegram_id, actor_chat_id, actor_username, actor_name, created_at")
      .order("created_at", { ascending: false })
      .limit(normalizedLimit);

    if (error) {
      throw error;
    }

    return Array.isArray(data) ? data.map(normalizeAuditRecord) : [];
  } catch (error) {
    if (!isMissingAuditTableError(error)) {
      throw error;
    }

    const { data: fallback, error: fallbackError } = await supabase
      .from("telegram_prefills")
      .select("token, payload, created_at")
      .like("token", "ops_audit_%")
      .order("created_at", { ascending: false })
      .limit(normalizedLimit);

    if (fallbackError) {
      throw fallbackError;
    }

    return Array.isArray(fallback) ? fallback.map(normalizeAuditRecord) : [];
  }
}
