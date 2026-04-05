export function formatCurrency(value: number) {
  return `${new Intl.NumberFormat("uz-UZ").format(value)} so'm`;
}

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function calculateNights(checkIn?: string, checkOut?: string) {
  if (!checkIn || !checkOut) {
    return 0;
  }

  const start = new Date(checkIn);
  const end = new Date(checkOut);
  const diff = end.getTime() - start.getTime();

  if (Number.isNaN(diff) || diff <= 0) {
    return 0;
  }

  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function getTelegramLink(_message?: string) {
  const username = (import.meta.env.VITE_TELEGRAM_USERNAME?.replace("@", "") || "ravotsoyadmin_bot").trim();

  return username ? `https://t.me/${username}?start=${encodeURIComponent("start")}` : "";
}

export function getTelegramStartLink(token: string) {
  const username = import.meta.env.VITE_TELEGRAM_USERNAME?.replace("@", "");

  if (!username || !token.trim()) {
    return "";
  }

  return `https://t.me/${username}?start=${encodeURIComponent(token.trim())}`;
}

export function getTelegramProfileLink(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  const normalized = trimmed
    .replace(/^https?:\/\/t\.me\//i, "")
    .replace(/^@/, "")
    .replace(/\/+$/, "");

  return normalized ? `https://t.me/${normalized}` : "";
}

export function getPhoneLink(phone: string) {
  const normalized = phone.trim().replace(/[^\d+]/g, "");
  return normalized ? `tel:${normalized}` : "";
}

export function todayIso() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isVideoUrl(url: string) {
  return /\.(mp4|mov|webm)(\?|$)/i.test(url);
}
