export function formatCurrency(value: number) {
  return `${new Intl.NumberFormat("uz-UZ").format(value)} so'm`;
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

export function getTelegramLink(message: string) {
  const username = import.meta.env.VITE_TELEGRAM_USERNAME?.replace("@", "");

  if (username) {
    return `https://t.me/${username}?text=${encodeURIComponent(message)}`;
  }

  return `https://t.me/share/url?url=${encodeURIComponent(window.location.origin)}&text=${encodeURIComponent(message)}`;
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
