import { createSupabasePrivilegedClient, readOptionalEnv } from "../bots/shared.js";
import { createTelegramPrefill, getTelegramPrefill } from "./telegramFlow.js";

const supabase = createSupabasePrivilegedClient();
const legacyManagerTelegramId = Number(readOptionalEnv("CHAT_ID"));

function normalizeTelegramId(value) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : 0;
}

function normalizeUserRecord(data) {
  if (!data) {
    return null;
  }

  return {
    id: String(data.id ?? ""),
    telegramId: data.telegram_id ? Number(data.telegram_id) : 0,
    name: String(data.name ?? "").trim(),
    phone: String(data.phone ?? "").trim(),
    role: String(data.role ?? "customer").trim(),
  };
}

export async function fetchTelegramUserByTelegramId(telegramId) {
  const normalizedTelegramId = normalizeTelegramId(telegramId);

  if (!normalizedTelegramId) {
    return null;
  }

  const { data, error } = await supabase
    .from("users")
    .select("id, telegram_id, name, phone, role")
    .eq("telegram_id", normalizedTelegramId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return normalizeUserRecord(data);
}

async function upsertRoleUser({ telegramId, name = "", phone = "", role = "customer" }) {
  const normalizedTelegramId = normalizeTelegramId(telegramId);

  if (!normalizedTelegramId) {
    throw new Error("Telegram foydalanuvchisi topilmadi.");
  }

  const { data, error } = await supabase
    .from("users")
    .upsert({
      telegram_id: normalizedTelegramId,
      name: String(name ?? "").trim() || null,
      phone: String(phone ?? "").trim() || null,
      role,
    }, { onConflict: "telegram_id" })
    .select("id, telegram_id, name, phone, role")
    .single();

  if (error) {
    throw error;
  }

  return normalizeUserRecord(data);
}

export async function listManagerUsers() {
  const { data, error } = await supabase
    .from("users")
    .select("id, telegram_id, name, phone, role")
    .in("role", ["manager", "owner"])
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data.map(normalizeUserRecord).filter(Boolean) : [];
}

export async function ensureLegacyManagerAccess({ telegramId, name = "", phone = "" }) {
  const normalizedTelegramId = normalizeTelegramId(telegramId);

  if (!normalizedTelegramId) {
    return null;
  }

  const current = await fetchTelegramUserByTelegramId(normalizedTelegramId);

  if (current?.role === "manager" || current?.role === "owner") {
    return current;
  }

  if (legacyManagerTelegramId && normalizedTelegramId === legacyManagerTelegramId) {
    return upsertRoleUser({
      telegramId: normalizedTelegramId,
      name,
      phone,
      role: "manager",
    });
  }

  return current;
}

export async function hasManagerAccess(telegramId) {
  const user = await fetchTelegramUserByTelegramId(telegramId);
  return user?.role === "manager" || user?.role === "owner";
}

export async function createManagerTransferToken(currentTelegramId) {
  const issuer = await fetchTelegramUserByTelegramId(currentTelegramId);

  if (!issuer || (issuer.role !== "manager" && issuer.role !== "owner")) {
    throw new Error("Faqat manager yoki owner nazoratni topshirishi mumkin.");
  }

  const stored = await createTelegramPrefill({
    kind: "manager_transfer",
    issuedByTelegramId: issuer.telegramId,
    issuedAt: new Date().toISOString(),
  });

  return {
    token: stored.token,
    expiresAt: stored.expiresAt,
    issuedBy: issuer,
  };
}

export async function claimManagerTransferToken(token, { telegramId, name = "", phone = "" }) {
  const normalizedTelegramId = normalizeTelegramId(telegramId);

  if (!normalizedTelegramId) {
    throw new Error("Telegram foydalanuvchisi topilmadi.");
  }

  const prefill = await getTelegramPrefill(token);

  if (!prefill || String(prefill.payload?.kind ?? "") !== "manager_transfer") {
    throw new Error("Manager topshirish kodi topilmadi yoki muddati tugagan.");
  }

  const previousManagers = await listManagerUsers();

  const revokeTargets = previousManagers
    .filter((item) => item.role === "manager" && item.telegramId !== normalizedTelegramId)
    .map((item) => item.telegramId);

  if (revokeTargets.length > 0) {
    const { error: revokeError } = await supabase
      .from("users")
      .update({ role: "customer" })
      .in("telegram_id", revokeTargets);

    if (revokeError) {
      throw revokeError;
    }
  }

  const newManager = await upsertRoleUser({
    telegramId: normalizedTelegramId,
    name,
    phone,
    role: "manager",
  });

  await supabase
    .from("telegram_prefills")
    .delete()
    .eq("token", String(prefill.token));

  return {
    token: prefill.token,
    newManager,
    previousManagers,
    expiresAt: prefill.expiresAt,
  };
}

export async function listManagerNotificationTargets() {
  const managerUsers = await listManagerUsers();
  return managerUsers
    .filter((item) => item.role === "manager")
    .map((item) => String(item.telegramId))
    .filter(Boolean);
}
