import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  LoaderCircle,
  Sparkles,
  TicketPercent,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { AnimatedSection } from "../components/AnimatedSection";
import { createTelegramPrefill, getMediaAssets, getSiteSettings, getTripBuilderOptions, quoteBooking } from "../lib/api";
import type { BookingQuote, MediaAsset, ResourceSelection, SiteSettings, TripBuilderOption } from "../lib/types";
import { calculateNights, cn, formatCurrency, getTelegramStartLink, todayIso } from "../lib/utils";

type Step = "services" | "dates";
type BookingForm = { checkIn: string; checkOut: string; dayDate: string };

function summarizeSelections(options: TripBuilderOption[], selections: ResourceSelection[]) {
  return selections
    .map((selection) => {
      const option = options.find((item) => item.resourceType === selection.resourceType);
      const label = option?.label || selection.resourceType;
      const suffix = selection.includeTapchan === false ? " (tapchansiz)" : "";
      return `${label}${suffix}${selection.quantity > 1 ? ` x${selection.quantity}` : ""}`;
    })
    .join(", ");
}

function getEstimatedGuests(options: TripBuilderOption[], selections: ResourceSelection[]) {
  return Math.max(
    selections.reduce((sum, selection) => {
      const option = options.find((item) => item.resourceType === selection.resourceType);
      return sum + Math.max(Number(option?.maxIncludedPeople ?? 0), 0) * selection.quantity;
    }, 0),
    1,
  );
}

function describePricing(option: TripBuilderOption) {
  if (option.resourceType === "tapchan_small") return "5 kishigacha 200 000, keyin 40 000 so'm/odam.";
  if (option.resourceType === "tapchan_big") return "8 kishigacha 350 000, keyin 35 000 so'm/odam.";
  if (option.resourceType === "tapchan_very_big") return "12 kishigacha 450 000, keyin 35 000 so'm/odam.";
  if (option.resourceType === "room_small") return "500 000, tapchansiz 400 000.";
  if (option.resourceType === "room_big") return "800 000, tapchansiz 20% chegirma.";
  return formatCurrency(option.basePrice);
}

export function BookingPage() {
  const [step, setStep] = useState<Step>("services");
  const [showIntro, setShowIntro] = useState(true);
  const [slideIndex, setSlideIndex] = useState(0);
  const [options, setOptions] = useState<TripBuilderOption[]>([]);
  const [siteSettings, setSiteSettings] = useState<SiteSettings | null>(null);
  const [serviceMedia, setServiceMedia] = useState<MediaAsset[]>([]);
  const [quoteInfo, setQuoteInfo] = useState<BookingQuote | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [roomTapchanIncluded, setRoomTapchanIncluded] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState<BookingForm>({ checkIn: "", checkOut: "", dayDate: todayIso() });

  useEffect(() => {
    const load = async () => {
      try {
        const [optionsData, settingsData, mediaData] = await Promise.all([getTripBuilderOptions(), getSiteSettings(), getMediaAssets()]);
        setOptions(optionsData);
        setSiteSettings(settingsData);
        setServiceMedia(mediaData.filter((item) => item.type === "service"));
        setRoomTapchanIncluded(
          Object.fromEntries(optionsData.filter((item) => item.bookingMode === "stay").map((item) => [item.resourceType, true])),
        );
      } catch (loadError) {
        console.error(loadError);
        setError("Xizmatlarni yuklashda xatolik yuz berdi.");
      }
    };

    void load();
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => setShowIntro(false), 3000);
    return () => window.clearTimeout(timeout);
  }, []);

  const selectedSelections = useMemo(
    () =>
      options
        .map((option) => ({
          resourceType: option.resourceType,
          quantity: Math.max(0, Number(quantities[option.resourceType] ?? 0)),
          includeTapchan: option.bookingMode === "stay" ? Boolean(roomTapchanIncluded[option.resourceType] ?? true) : undefined,
        }))
        .filter((item) => item.quantity > 0),
    [options, quantities, roomTapchanIncluded],
  );

  const currentOption = options[slideIndex] ?? null;
  const hasStaySelection = selectedSelections.some((item) => String(item.resourceType).startsWith("room_"));
  const nights = calculateNights(form.checkIn, form.checkOut);
  const selectedStartDate = hasStaySelection ? form.checkIn : form.dayDate;
  const selectedEndDate = hasStaySelection ? form.checkOut : null;
  const hasValidDates = hasStaySelection ? Boolean(form.checkIn && form.checkOut && nights > 0) : Boolean(form.dayDate);
  const selectionSummary = summarizeSelections(options, selectedSelections);
  const estimatedGuests = getEstimatedGuests(options, selectedSelections);
  const totalCapacity = selectedSelections.reduce((sum, selection) => {
    const option = options.find((item) => item.resourceType === selection.resourceType);
    return sum + (option?.unitCapacity ?? 0) * selection.quantity;
  }, 0);
  const discountActive = selectedSelections.some((item) => String(item.resourceType).startsWith("room_") && item.includeTapchan === false);
  const depositRatio = Number(siteSettings?.payment_deposit_ratio ?? 0.3);

  useEffect(() => {
    let cancelled = false;

    const loadQuote = async () => {
      if (selectedSelections.length === 0 || !hasValidDates) {
        setQuoteInfo(null);
        return;
      }

      try {
        const result = await quoteBooking({
          resourceSelections: selectedSelections,
          guests: estimatedGuests,
          date_start: selectedStartDate,
          date_end: selectedEndDate,
        });

        if (!cancelled) setQuoteInfo(result);
      } catch (quoteError) {
        console.error(quoteError);
        if (!cancelled) setQuoteInfo(null);
      }
    };

    void loadQuote();
    return () => {
      cancelled = true;
    };
  }, [estimatedGuests, hasValidDates, selectedEndDate, selectedSelections, selectedStartDate]);

  const hotelName = siteSettings?.hotel_name?.trim() || "Ravotsoy";
  const depositAmount = Math.ceil((quoteInfo?.totalPrice ?? 0) * depositRatio);
  const introImage = serviceMedia[0]?.url || "";
  const currentServiceImage = currentOption
    ? serviceMedia.find((item) => item.resource_type === currentOption.resourceType)?.url || ""
    : "";

  const handleQuantityChange = (resourceType: string, nextQuantity: number, maxQuantity: number) => {
    setQuantities((current) => ({ ...current, [resourceType]: Math.max(0, Math.min(nextQuantity, maxQuantity)) }));
  };

  const handleTelegramContinue = async () => {
    setError("");
    if (selectedSelections.length === 0) return setError("Avval kamida bitta xizmat tanlang.");
    if (!hasValidDates) return setError(hasStaySelection ? "Kirish va chiqish sanalarini tanlang." : "Sanani tanlang.");
    if (quoteInfo && !quoteInfo.available) return setError(quoteInfo.message);

    try {
      setSubmitting(true);
      const prefill = await createTelegramPrefill({
        resourceSelections: selectedSelections,
        estimatedGuests,
        date_start: selectedStartDate,
        date_end: selectedEndDate,
        guestConfirmationRequired: true,
      });
      const telegramLink = getTelegramStartLink(prefill.token);
      if (!telegramLink) throw new Error("Telegram havolasini tayyorlab bo'lmadi.");
      window.location.href = telegramLink;
    } catch (submitError) {
      console.error(submitError);
      setError(submitError instanceof Error ? submitError.message : "Telegramga yo'naltirishda xatolik yuz berdi.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-[100svh] overflow-hidden bg-white">
      <AnimatePresence>
        {showIntro ? (
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowIntro(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-white px-6 text-center"
          >
            <div className="relative w-full max-w-5xl overflow-hidden rounded-[40px]">
              {introImage ? (
                <img src={introImage} alt={hotelName} className="h-[58vh] w-full object-cover" />
              ) : (
                <div className="h-[58vh] w-full bg-[linear-gradient(135deg,#e5f4ec_0%,#f4f8ff_52%,#fbf6ef_100%)]" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/20 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-8 sm:p-12">
                <p className="text-sm uppercase tracking-[0.32em] text-white/70">Ravotsoy</p>
                <p className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-6xl">{hotelName}</p>
              </div>
            </div>
          </motion.button>
        ) : null}
      </AnimatePresence>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex justify-end">
          <div className="flex flex-wrap gap-3">
            {[
              { id: "services", label: "1. Xizmatlar" },
              { id: "dates", label: "2. Sana va narx" },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setStep(item.id as Step)}
                className={cn(
                  "rounded-full px-5 py-3 text-sm font-medium transition",
                  step === item.id ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-500",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {step === "services" ? (
          <div className="mt-8 grid gap-8 lg:grid-cols-[1.08fr_0.92fr]">
            <AnimatedSection className="rounded-[36px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:p-8">
              {currentOption ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Slider</p>
                      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{currentOption.label}</p>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setSlideIndex((current) => (current - 1 + options.length) % options.length)} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white">
                        <ChevronLeft size={18} />
                      </button>
                      <button type="button" onClick={() => setSlideIndex((current) => (current + 1) % options.length)} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white">
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>

                  <motion.div key={currentOption.resourceType} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} className="mt-6 overflow-hidden rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)]">
                    <div className="relative h-72">
                      {currentServiceImage ? (
                        <img src={currentServiceImage} alt={currentOption.label} className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full bg-[linear-gradient(135deg,#dff6ea_0%,#eff7ff_46%,#f8f5ed_100%)]" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
                        <div className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.24em]">
                          {currentOption.bookingMode === "stay" ? "Tunab qolish" : "Kunlik dam olish"}
                        </div>
                        <p className="mt-3 text-3xl font-semibold tracking-tight">{currentOption.label}</p>
                      </div>
                    </div>

                    <div className="grid gap-4 p-6">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-[22px] bg-slate-50 p-4"><p className="text-xs uppercase tracking-[0.22em] text-slate-400">Bazaviy narx</p><p className="mt-2 text-lg font-semibold text-slate-950">{formatCurrency(currentOption.basePrice)}</p></div>
                        <div className="rounded-[22px] bg-slate-50 p-4"><p className="text-xs uppercase tracking-[0.22em] text-slate-400">Sig'im</p><p className="mt-2 text-lg font-semibold text-slate-950">{currentOption.unitCapacity} kishi</p></div>
                        <div className="rounded-[22px] bg-slate-50 p-4"><p className="text-xs uppercase tracking-[0.22em] text-slate-400">Mavjud</p><p className="mt-2 text-lg font-semibold text-slate-950">{currentOption.availableUnits} ta</p></div>
                      </div>
                      <div className="rounded-[22px] border border-slate-200 bg-white p-4 text-sm leading-7 text-slate-600">{describePricing(currentOption)}</div>

                      {currentOption.bookingMode === "stay" && currentOption.includesTapchan ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <button type="button" onClick={() => setRoomTapchanIncluded((current) => ({ ...current, [currentOption.resourceType]: true }))} className={cn("rounded-[22px] border px-4 py-4 text-left", roomTapchanIncluded[currentOption.resourceType] !== false ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white")}>
                            <p className="text-sm font-semibold text-slate-950">Tapchan bilan</p>
                            <p className="mt-2 text-xs text-slate-500">{formatCurrency(currentOption.basePrice)}</p>
                          </button>
                          <button type="button" onClick={() => setRoomTapchanIncluded((current) => ({ ...current, [currentOption.resourceType]: false }))} className={cn("rounded-[22px] border px-4 py-4 text-left", roomTapchanIncluded[currentOption.resourceType] === false ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white")}>
                            <p className="text-sm font-semibold text-slate-950">Tapchansiz</p>
                            <p className="mt-2 text-xs text-slate-500">{formatCurrency(Math.round(currentOption.basePrice * (1 - currentOption.discountIfExcluded)))}</p>
                          </button>
                        </div>
                      ) : null}

                      <div className="flex items-center justify-between rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4">
                        <div><p className="text-sm font-semibold text-slate-950">Tanlangan son</p><p className="mt-1 text-xs text-slate-500">Maksimal: {currentOption.maxQuantity}</p></div>
                        <div className="flex items-center gap-3">
                          <button type="button" onClick={() => handleQuantityChange(currentOption.resourceType, Number(quantities[currentOption.resourceType] ?? 0) - 1, currentOption.maxQuantity)} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-lg">-</button>
                          <span className="w-10 text-center text-xl font-semibold text-slate-950">{Number(quantities[currentOption.resourceType] ?? 0)}</span>
                          <button type="button" onClick={() => handleQuantityChange(currentOption.resourceType, Number(quantities[currentOption.resourceType] ?? 0) + 1, currentOption.maxQuantity)} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-lg">+</button>
                        </div>
                      </div>
                    </div>
                  </motion.div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {options.map((option, index) => (
                      <button key={option.resourceType} type="button" onClick={() => setSlideIndex(index)} className={cn("rounded-full px-4 py-2 text-sm transition", slideIndex === index ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-500")}>
                        {option.shortLabel}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </AnimatedSection>

            <AnimatedSection className="rounded-[36px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:p-8">
              <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Konfiguratsiya xulosasi</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Tanlangan xizmatlar</h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                Odamlar soni saytda so'ralmaydi. Sayt boshlang'ich narxni ko'rsatadi, Telegram esa yakuniy mehmon soni bilan qayta hisoblaydi.
              </p>
              <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm font-semibold text-slate-950">{selectionSummary || "Hali xizmat tanlanmagan"}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[22px] bg-white p-4"><p className="text-xs uppercase tracking-[0.22em] text-slate-400">Boshlang'ich sig'im</p><p className="mt-2 text-lg font-semibold text-slate-950">{estimatedGuests} kishi</p></div>
                  <div className="rounded-[22px] bg-white p-4"><p className="text-xs uppercase tracking-[0.22em] text-slate-400">Maksimal sig'im</p><p className="mt-2 text-lg font-semibold text-slate-950">{totalCapacity} kishi</p></div>
                </div>
              </div>
              {error ? <div className="mt-5 rounded-[22px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
              <button type="button" onClick={() => (selectedSelections.length === 0 ? setError("Avval kamida bitta xizmat tanlang.") : setStep("dates"))} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-5 py-4 text-sm font-medium text-white">
                Keyingi qadam
                <ArrowRight size={18} />
              </button>
            </AnimatedSection>
          </div>
        ) : (
          <div className="mt-8 grid gap-8 lg:grid-cols-[0.96fr_1.04fr]">
            <AnimatedSection className="rounded-[36px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:p-8">
              <div className="flex items-center gap-3"><CalendarDays className="text-emerald-600" size={20} /><div><p className="text-xs uppercase tracking-[0.28em] text-slate-400">Sana tanlash</p><p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Davrni belgilang</p></div></div>
              {hasStaySelection ? (
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2 text-sm text-slate-600"><span>Kirish sanasi</span><input type="date" value={form.checkIn} min={todayIso()} onChange={(event) => setForm((current) => ({ ...current, checkIn: event.target.value }))} className="w-full rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 outline-none" /></label>
                  <label className="space-y-2 text-sm text-slate-600"><span>Chiqish sanasi</span><input type="date" value={form.checkOut} min={form.checkIn || todayIso()} onChange={(event) => setForm((current) => ({ ...current, checkOut: event.target.value }))} className="w-full rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 outline-none" /></label>
                </div>
              ) : (
                <label className="mt-6 block space-y-2 text-sm text-slate-600"><span>Sana</span><input type="date" value={form.dayDate} min={todayIso()} onChange={(event) => setForm((current) => ({ ...current, dayDate: event.target.value }))} className="w-full rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 outline-none" /></label>
              )}
              <div className="mt-6 flex flex-wrap gap-3">
                <button type="button" onClick={() => setStep("services")} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-5 py-3 text-sm font-medium text-slate-700"><ArrowLeft size={16} />Ortga</button>
                <button type="button" disabled={submitting} onClick={() => void handleTelegramContinue()} className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400">{submitting ? <LoaderCircle className="animate-spin" size={16} /> : null}Bron qilish{!submitting ? <ArrowRight size={16} /> : null}</button>
              </div>
            </AnimatedSection>

            <AnimatedSection className="rounded-[36px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:p-8">
              <div className="flex items-center gap-3"><TicketPercent className="text-amber-500" size={20} /><div><p className="text-xs uppercase tracking-[0.28em] text-slate-400">Narx va to'lov</p><p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Boshlang'ich hisob</p></div></div>
              <motion.div animate={discountActive ? { scale: [1, 1.03, 1] } : { scale: 1 }} transition={{ duration: 0.5 }} className="mt-6 rounded-[30px] border border-slate-200 bg-[linear-gradient(135deg,#fdfdfd_0%,#f6fbff_46%,#f4fbf6_100%)] p-6">
                <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Taxminiy narx</p>
                <p className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">{formatCurrency(quoteInfo?.totalPrice ?? 0)}</p>
                {discountActive ? <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-sm font-medium text-amber-800"><Sparkles size={16} />Chegirma qo'llandi</div> : null}
                <p className="mt-4 text-sm leading-7 text-slate-600">Telegram bot mehmonlar soni kiritilgach narxni qayta tekshiradi.</p>
              </motion.div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5"><p className="text-xs uppercase tracking-[0.22em] text-slate-400">Boshlang'ich mehmonlar</p><p className="mt-2 text-lg font-semibold text-slate-950">{estimatedGuests} kishi</p></div>
                <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5"><p className="text-xs uppercase tracking-[0.22em] text-slate-400">Davomiylik</p><p className="mt-2 text-lg font-semibold text-slate-950">{hasStaySelection ? `${nights || 0} kecha` : "1 kun"}</p></div>
              </div>
              <div className="mt-5 rounded-[28px] border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center gap-2 text-slate-500"><CreditCard size={18} /><p className="text-sm font-medium">To'lov ma'lumoti</p></div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[22px] bg-white p-4"><p className="text-xs uppercase tracking-[0.22em] text-slate-400">Karta raqami</p><p className="mt-2 text-base font-semibold text-slate-950">{siteSettings?.payment_card_number?.trim() || "Admin panelda kiritilmagan"}</p></div>
                  <div className="rounded-[22px] bg-white p-4"><p className="text-xs uppercase tracking-[0.22em] text-slate-400">Karta egasi</p><p className="mt-2 text-base font-semibold text-slate-950">{siteSettings?.payment_card_holder?.trim() || "Admin panelda kiritilmagan"}</p></div>
                  <div className="rounded-[22px] bg-white p-4"><p className="text-xs uppercase tracking-[0.22em] text-slate-400">Avans foizi</p><p className="mt-2 text-base font-semibold text-slate-950">{Math.round(depositRatio * 100)}%</p></div>
                  <div className="rounded-[22px] bg-white p-4"><p className="text-xs uppercase tracking-[0.22em] text-slate-400">Taxminiy avans</p><p className="mt-2 text-base font-semibold text-slate-950">{formatCurrency(depositAmount)}</p></div>
                </div>
                <p className="mt-4 text-sm leading-7 text-slate-600">{siteSettings?.payment_instructions?.trim() || "To'lov va chek yuborish Telegram botda davom etadi."}</p>
              </div>
              <div className="mt-5 rounded-[28px] border border-slate-200 bg-slate-50 p-5 text-sm font-medium text-slate-900">
                {quoteInfo?.available ? "Tanlangan sana bo'yicha xizmatlar hozircha mavjud." : quoteInfo?.message || "Sana tanlangandan keyin bo'sh joy tekshiriladi."}
              </div>
              {error ? <div className="mt-5 rounded-[22px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
            </AnimatedSection>
          </div>
        )}
      </div>
    </div>
  );
}
