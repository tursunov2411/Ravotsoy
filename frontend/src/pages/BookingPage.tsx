import { ArrowRight, BedDouble, CalendarDays, LoaderCircle, Send, Sparkles, SunMedium, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AnimatedSection } from "../components/AnimatedSection";
import { createTelegramPrefill, getSiteSettings, getTripBuilderOptions, quoteBooking } from "../lib/api";
import type { BookingQuote, ResourceSelection, SiteSettings, TripBuilderOption } from "../lib/types";
import { formatCurrency, getTelegramStartLink, todayIso } from "../lib/utils";

type BookingForm = {
  guests: number;
  checkIn: string;
  checkOut: string;
  dayDate: string;
};

const fallbackImages = [
  "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1519046904884-53103b34b206?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80",
];

function iconForMode(mode: TripBuilderOption["bookingMode"]) {
  return mode === "stay" ? BedDouble : SunMedium;
}

function calculateNights(checkIn?: string, checkOut?: string) {
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

function summarizeSelections(options: TripBuilderOption[], selections: ResourceSelection[]) {
  return selections
    .map((selection) => {
      const option = options.find((item) => item.resourceType === selection.resourceType);
      const baseLabel = option?.label || selection.resourceType;

      if (selection.includeTapchan === false) {
        return `${baseLabel} (tapchansiz)${selection.quantity > 1 ? ` x${selection.quantity}` : ""}`;
      }

      if (selection.includeTapchan === true && String(selection.resourceType).startsWith("room_")) {
        return `${baseLabel} (tapchan bilan)${selection.quantity > 1 ? ` x${selection.quantity}` : ""}`;
      }

      return `${baseLabel}${selection.quantity > 1 ? ` x${selection.quantity}` : ""}`;
    })
    .join(", ");
}

export function BookingPage() {
  const [options, setOptions] = useState<TripBuilderOption[]>([]);
  const [siteSettings, setSiteSettings] = useState<SiteSettings | null>(null);
  const [error, setError] = useState("");
  const [quoteInfo, setQuoteInfo] = useState<BookingQuote | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [roomTapchanIncluded, setRoomTapchanIncluded] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState<BookingForm>({
    guests: 1,
    checkIn: "",
    checkOut: "",
    dayDate: todayIso(),
  });

  useEffect(() => {
    const load = async () => {
      try {
        const [optionsData, settingsData] = await Promise.all([getTripBuilderOptions(), getSiteSettings()]);
        setOptions(optionsData);
        setSiteSettings(settingsData);
        setRoomTapchanIncluded(
          Object.fromEntries(
            optionsData
              .filter((item) => item.bookingMode === "stay")
              .map((item) => [item.resourceType, true]),
          ),
        );
      } catch (loadError) {
        console.error(loadError);
        setError("Resurslarni yuklashda xatolik yuz berdi.");
      }
    };

    void load();
  }, []);

  const selectedSelections = useMemo(
    () =>
      options
        .map((option) => ({
          resourceType: option.resourceType,
          quantity: Math.max(0, Number(quantities[option.resourceType] ?? 0)),
          includeTapchan:
            option.bookingMode === "stay" ? Boolean(roomTapchanIncluded[option.resourceType] ?? true) : undefined,
        }))
        .filter((item) => item.quantity > 0),
    [options, quantities, roomTapchanIncluded],
  );

  const hasStaySelection = selectedSelections.some((item) => String(item.resourceType).startsWith("room_"));
  const nights = calculateNights(form.checkIn, form.checkOut);
  const selectedStartDate = hasStaySelection ? form.checkIn : form.dayDate;
  const selectedEndDate = hasStaySelection ? form.checkOut : null;
  const selectionSummary = summarizeSelections(options, selectedSelections);
  const bookingImage = fallbackImages[selectedSelections.length % fallbackImages.length];
  const hotelName = siteSettings?.hotel_name?.trim() || "Ravotsoy Dam Olish Maskani";
  const bookingIntro =
    siteSettings?.description?.trim()
    || "Tapchan va xonalarni tanlang, taxminiy narxni ko'ring va bronni Telegram botda yakunlang.";

  const totalCapacity = selectedSelections.reduce((sum, selection) => {
    const option = options.find((item) => item.resourceType === selection.resourceType);
    return sum + (option?.unitCapacity ?? 0) * selection.quantity;
  }, 0);

  const hasValidDates = hasStaySelection
    ? Boolean(form.checkIn && form.checkOut && nights > 0)
    : Boolean(form.dayDate);
  const isGuestCountInvalid = selectedSelections.length > 0 ? form.guests < 1 || form.guests > totalCapacity : false;

  useEffect(() => {
    let cancelled = false;

    const loadQuote = async () => {
      if (selectedSelections.length === 0 || !hasValidDates || isGuestCountInvalid) {
        setQuoteInfo(null);
        return;
      }

      try {
        const result = await quoteBooking({
          resourceSelections: selectedSelections,
          guests: form.guests,
          date_start: selectedStartDate,
          date_end: selectedEndDate,
        });

        if (!cancelled) {
          setQuoteInfo(result);
        }
      } catch (quoteError) {
        console.error(quoteError);

        if (!cancelled) {
          setQuoteInfo(null);
        }
      }
    };

    void loadQuote();

    return () => {
      cancelled = true;
    };
  }, [form.guests, hasValidDates, isGuestCountInvalid, selectedEndDate, selectedSelections, selectedStartDate]);

  const handleQuantityChange = (resourceType: string, nextQuantity: number, maxQuantity: number) => {
    setQuantities((current) => ({
      ...current,
      [resourceType]: Math.max(0, Math.min(nextQuantity, maxQuantity)),
    }));
  };

  const handleTelegramContinue = async () => {
    setError("");

    if (selectedSelections.length === 0) {
      setError("Avval kamida bitta resurs tanlang.");
      return;
    }

    if (!hasValidDates) {
      setError(hasStaySelection ? "Kirish va chiqish sanalarini tanlang." : "Sanani tanlang.");
      return;
    }

    if (isGuestCountInvalid) {
      setError(`Tanlangan resurslar sig'imi ${totalCapacity} kishigacha.`);
      return;
    }

    if (quoteInfo && !quoteInfo.available) {
      setError(quoteInfo.message);
      return;
    }

    const startLinkUsername = import.meta.env.VITE_TELEGRAM_USERNAME?.replace("@", "").trim();

    if (!startLinkUsername) {
      setError("Telegram bot havolasi sozlanmagan.");
      return;
    }

    try {
      setSubmitting(true);
      const prefill = await createTelegramPrefill({
        resourceSelections: selectedSelections,
        guests: form.guests,
        date_start: selectedStartDate,
        date_end: selectedEndDate,
      });
      const telegramLink = getTelegramStartLink(prefill.token);

      if (!telegramLink) {
        throw new Error("Telegram havolasini tayyorlab bo'lmadi.");
      }

      window.location.href = telegramLink;
    } catch (submitError) {
      console.error(submitError);
      setError(submitError instanceof Error ? submitError.message : "Telegramga yo'naltirishda xatolik yuz berdi.");
    } finally {
      setSubmitting(false);
    }
  };

  const bookingHint = selectedSelections.length === 0
    ? "Kamida bitta resurs tanlang."
    : isGuestCountInvalid
      ? `Mehmonlar soni tanlangan resurslar sig'imidan oshib ketdi. Maksimal: ${totalCapacity}.`
      : quoteInfo && !quoteInfo.available
        ? quoteInfo.message
        : hasStaySelection
          ? `${nights || 0} kecha uchun taxminiy narx hisoblandi.`
          : "Tanlangan resurslar va sanaga ko'ra taxminiy narx hisoblandi.";

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <AnimatedSection className="mb-8 rounded-[40px] bg-[#07111f] px-6 py-16 text-white shadow-[0_24px_80px_rgba(15,23,42,0.18)] sm:px-8 lg:px-10">
        <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(135deg,#0b1424_0%,#0f1d39_45%,#102d5a_100%)] p-8">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff10_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:66px_66px]" />
          <div className="absolute left-[-10%] top-[-20%] h-72 w-72 rounded-full bg-sky-500/20 blur-3xl" />
          <div className="absolute bottom-[-25%] right-[-10%] h-72 w-72 rounded-full bg-blue-400/15 blur-3xl" />

          <div className="relative z-10 max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-4 py-2 text-xs uppercase tracking-[0.3em] text-white/70">
              <Sparkles className="h-4 w-4" />
              Resource Builder
            </div>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">{hotelName} uchun bron</h1>
            <p className="mt-4 max-w-2xl text-sm leading-8 text-white/72 sm:text-base">{bookingIntro}</p>
            <p className="mt-4 max-w-2xl text-sm leading-8 text-white/60">
              Veb-sayt faqat konfiguratsiya uchun ishlaydi. To'lov va bron yakuni Telegram botda amalga oshiriladi.
            </p>
          </div>
        </div>
      </AnimatedSection>

      <div className="grid gap-8 lg:grid-cols-[0.98fr_1.02fr]">
        <AnimatedSection className="space-y-6 rounded-[36px] bg-[#07111f] p-6 text-white shadow-[0_24px_80px_rgba(15,23,42,0.18)] sm:p-8">
          <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/6">
            <div className="relative h-64">
              <img src={bookingImage} alt="Tanlangan trip" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#07111f] via-[#07111f]/35 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-5">
                <p className="text-xs uppercase tracking-[0.26em] text-white/60">Tanlangan resurslar</p>
                <h2 className="mt-2 text-2xl font-semibold">{selectionSummary || "Joylarni tanlang"}</h2>
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            {options.map((option) => {
              const Icon = iconForMode(option.bookingMode);
              const quantity = Number(quantities[option.resourceType] ?? 0);
              const includeTapchan = Boolean(roomTapchanIncluded[option.resourceType] ?? true);
              const discountedPrice = Math.round(option.basePrice * (1 - option.discountIfExcluded));

              return (
                <div key={option.resourceType} className="rounded-[28px] border border-white/10 bg-white/6 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-1 text-xs uppercase tracking-[0.24em] text-white/65">
                        <Icon size={14} />
                        {option.bookingMode === "stay" ? "Stay" : "Day"}
                      </div>
                      <h3 className="mt-4 text-2xl font-semibold">{option.label}</h3>
                      <p className="mt-2 text-sm text-white/68">
                        {option.availableUnits} ta birlik, har biri {option.unitCapacity} kishigacha.
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-[0.24em] text-white/45">Bazaviy narx</p>
                      <p className="mt-2 text-xl font-semibold">{formatCurrency(option.basePrice)}</p>
                    </div>
                  </div>

                  {option.bookingMode === "stay" && option.includesTapchan ? (
                    <div className="mt-5 rounded-2xl border border-white/10 bg-[#08121f] p-4">
                      <p className="text-sm font-medium">Tapchan varianti</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() =>
                            setRoomTapchanIncluded((current) => ({
                              ...current,
                              [option.resourceType]: true,
                            }))
                          }
                          className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
                            includeTapchan
                              ? "border-emerald-300 bg-emerald-500/10 text-white"
                              : "border-white/10 bg-white/5 text-white/70"
                          }`}
                        >
                          Tapchan bilan
                          <span className="mt-2 block text-xs text-white/55">{formatCurrency(option.basePrice)}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setRoomTapchanIncluded((current) => ({
                              ...current,
                              [option.resourceType]: false,
                            }))
                          }
                          className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
                            !includeTapchan
                              ? "border-amber-300 bg-amber-500/10 text-white"
                              : "border-white/10 bg-white/5 text-white/70"
                          }`}
                        >
                          Tapchansiz
                          <span className="mt-2 block text-xs text-white/55">{formatCurrency(discountedPrice)}</span>
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-5 flex items-center justify-between rounded-2xl border border-white/10 bg-[#08121f] px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">Miqdor</p>
                      <p className="text-xs text-white/50">Maksimal: {option.maxQuantity}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleQuantityChange(option.resourceType, quantity - 1, option.maxQuantity)}
                        className="h-10 w-10 rounded-full border border-white/14 text-lg transition hover:bg-white/10"
                      >
                        -
                      </button>
                      <span className="w-10 text-center text-lg font-semibold">{quantity}</span>
                      <button
                        type="button"
                        onClick={() => handleQuantityChange(option.resourceType, quantity + 1, option.maxQuantity)}
                        className="h-10 w-10 rounded-full border border-white/14 text-lg transition hover:bg-white/10"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </AnimatedSection>

        <AnimatedSection className="rounded-[36px] border border-black/5 bg-white p-6 shadow-soft sm:p-8">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.28em] text-ink/35">Konfiguratsiya</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink">Telegramga o'tishdan oldin</h2>
            <p className="mt-3 text-sm leading-7 text-ink/60">
              Mehmonlar soni va sanani belgilang. Tizim taxminiy narxni hisoblaydi, keyin siz shu konfiguratsiya bilan Telegram botga o'tasiz.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="space-y-2 text-sm text-ink/70">
              <span>Odamlar soni</span>
              <input
                type="number"
                min={1}
                max={Math.max(totalCapacity, 1)}
                value={form.guests}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    guests: Number(event.target.value),
                  }))
                }
                className="w-full rounded-2xl border border-black/10 bg-pearl px-4 py-3 outline-none transition focus:border-pine"
              />
            </label>
          </div>

          {hasStaySelection ? (
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <label className="space-y-2 text-sm text-ink/70">
                <span>Kirish sanasi</span>
                <input
                  type="date"
                  value={form.checkIn}
                  min={todayIso()}
                  onChange={(event) => setForm((current) => ({ ...current, checkIn: event.target.value }))}
                  className="w-full rounded-2xl border border-black/10 bg-pearl px-4 py-3 outline-none transition focus:border-pine"
                />
              </label>

              <label className="space-y-2 text-sm text-ink/70">
                <span>Chiqish sanasi</span>
                <input
                  type="date"
                  value={form.checkOut}
                  min={form.checkIn || todayIso()}
                  onChange={(event) => setForm((current) => ({ ...current, checkOut: event.target.value }))}
                  className="w-full rounded-2xl border border-black/10 bg-pearl px-4 py-3 outline-none transition focus:border-pine"
                />
              </label>
            </div>
          ) : (
            <label className="mt-5 block space-y-2 text-sm text-ink/70">
              <span>Sana</span>
              <input
                type="date"
                value={form.dayDate}
                min={todayIso()}
                onChange={(event) => setForm((current) => ({ ...current, dayDate: event.target.value }))}
                className="w-full rounded-2xl border border-black/10 bg-pearl px-4 py-3 outline-none transition focus:border-pine"
              />
            </label>
          )}

          <div className="mt-6 rounded-[28px] border border-black/5 bg-gradient-to-br from-sand/30 to-white p-5">
            <p className="text-sm font-medium text-ink">Tanlov: {selectionSummary || "Tanlanmagan"}</p>
            <p className="mt-2 text-sm font-medium text-ink">
              Taxminiy narx: {formatCurrency(quoteInfo?.totalPrice ?? 0)}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-white p-4">
                <div className="flex items-center gap-2 text-ink/45">
                  <Users size={16} />
                  <p className="text-xs uppercase tracking-[0.24em]">Sig'im</p>
                </div>
                <p className="mt-2 text-lg font-semibold">{totalCapacity || 0} kishi</p>
              </div>
              <div className="rounded-2xl bg-white p-4">
                <div className="flex items-center gap-2 text-ink/45">
                  <CalendarDays size={16} />
                  <p className="text-xs uppercase tracking-[0.24em]">Davomiyligi</p>
                </div>
                <p className="mt-2 text-lg font-semibold">{hasStaySelection ? `${nights || 0} kecha` : "1 kun"}</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-7 text-ink/60">{bookingHint}</p>
            {quoteInfo?.suggestions?.length ? (
              <p className="mt-3 text-sm leading-7 text-amber-700">
                Tavsiya: {summarizeSelections(options, quoteInfo.suggestions)}
              </p>
            ) : null}
          </div>

          {error ? (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleTelegramContinue()}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink px-5 py-4 text-sm font-medium text-white transition hover:bg-pine disabled:cursor-not-allowed disabled:bg-ink/60"
          >
            {submitting ? <LoaderCircle className="animate-spin" size={18} /> : <Send size={18} />}
            Telegram botda davom etish
            {!submitting ? <ArrowRight size={18} /> : null}
          </button>
        </AnimatedSection>
      </div>
    </div>
  );
}
