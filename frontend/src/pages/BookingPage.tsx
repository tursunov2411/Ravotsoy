import { CalendarDays, LoaderCircle, Mail, Phone, Send, Sparkles, Users } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { AnimatedSection } from "../components/AnimatedSection";
import { createBooking, getPackages } from "../lib/api";
import { hasSupabaseConfig } from "../lib/supabase";
import type { PackageRecord } from "../lib/types";
import { calculateNights, formatCurrency, todayIso } from "../lib/utils";

const backendUrl = import.meta.env.VITE_BACKEND_URL?.replace(/\/$/, "") || "http://localhost:3001";

type BookingForm = {
  packageId: string;
  customerName: string;
  phone: string;
  email: string;
  guests: number;
  checkIn: string;
  checkOut: string;
  dayDate: string;
};

const fallbackImages = [
  "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1200&q=80",
];

function getTypeLabel(type: PackageRecord["type"]) {
  return type === "stay" ? "Tunab qolish" : "Kunlik dam olish";
}

export function BookingPage() {
  const location = useLocation();
  const [packages, setPackages] = useState<PackageRecord[]>([]);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [estimatedPrice, setEstimatedPrice] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<BookingForm>({
    packageId: "",
    customerName: "",
    phone: "",
    email: "",
    guests: 1,
    checkIn: "",
    checkOut: "",
    dayDate: todayIso(),
  });

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getPackages();
        setPackages(data);
        const selectedPackageId = (location.state as { packageId?: string } | null)?.packageId;

        if (selectedPackageId) {
          setForm((current) => ({ ...current, packageId: selectedPackageId }));
        } else if (data[0]) {
          setForm((current) => ({ ...current, packageId: current.packageId || data[0].id }));
        }
      } catch (loadError) {
        console.error(loadError);
      }
    };

    void load();
  }, [location.state]);

  const selectedPackage = packages.find((item) => item.id === form.packageId) ?? null;
  const nights = selectedPackage?.type === "stay" ? calculateNights(form.checkIn, form.checkOut) : 0;

  const calculatePrice = () => {
    if (!selectedPackage) {
      return 0;
    }

    if (selectedPackage.type === "stay") {
      if (!form.checkIn || !form.checkOut || nights <= 0) {
        return 0;
      }

      return nights * selectedPackage.base_price + form.guests * selectedPackage.price_per_guest;
    }

    if (!form.dayDate) {
      return 0;
    }

    return selectedPackage.base_price + form.guests * selectedPackage.price_per_guest;
  };

  useEffect(() => {
    setEstimatedPrice(calculatePrice());
  }, [form.checkIn, form.checkOut, form.dayDate, form.guests, nights, selectedPackage]);

  const isGuestCountInvalid = selectedPackage
    ? form.guests < 1 || form.guests > selectedPackage.max_guests
    : false;

  const bookingHint = !selectedPackage
    ? "Avval paketni tanlang."
    : isGuestCountInvalid
      ? `Mehmonlar soni 1 dan ${selectedPackage.max_guests} gacha bo'lishi kerak.`
      : selectedPackage.type === "stay"
        ? nights > 0
          ? `${nights} kecha uchun narx hisoblandi.`
          : "Narxni ko'rish uchun kirish va chiqish sanasini tanlang."
        : "Narx tanlangan kun va mehmonlar soni bo'yicha hisoblanmoqda.";

  const bookingImage = useMemo(() => {
    if (!selectedPackage) {
      return fallbackImages[0];
    }

    const index = packages.findIndex((item) => item.id === selectedPackage.id);
    return selectedPackage.images[0] ?? fallbackImages[Math.max(0, index) % fallbackImages.length];
  }, [packages, selectedPackage]);

  const sendToTelegram = async (bookingData: {
    name: string;
    phone: string;
    package_name: string;
    type: string;
    guests: number;
    dates: string;
    price: number;
    date_start?: string;
    date_end?: string | null;
  }) => {
    const response = await fetch(`${backendUrl}/send-telegram`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bookingData),
    });

    if (!response.ok) {
      throw new Error("Telegramga yuborishda xatolik yuz berdi.");
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccessMessage("");

    if (!selectedPackage) {
      setError("Avval paketni tanlang.");
      return;
    }

    if (!form.customerName.trim()) {
      setError("Ism maydonini to'ldiring.");
      return;
    }

    if (!form.phone.trim()) {
      setError("Telefon raqamini kiriting.");
      return;
    }

    if (isGuestCountInvalid) {
      setError(`Odamlar soni 1 dan ${selectedPackage.max_guests} gacha bo'lishi kerak.`);
      return;
    }

    if (selectedPackage.type === "stay" && nights <= 0) {
      setError("Kirish va chiqish sanalarini to'g'ri tanlang.");
      return;
    }

    if (selectedPackage.type === "day" && !form.dayDate) {
      setError("Sanani tanlang.");
      return;
    }

    const typeLabel = getTypeLabel(selectedPackage.type);
    const datesLabel =
      selectedPackage.type === "stay" ? `${form.checkIn} dan ${form.checkOut} gacha` : form.dayDate;

    const bookingPayload = {
      package_id: selectedPackage.id,
      name: form.customerName.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || undefined,
      guests: form.guests,
      date_start: selectedPackage.type === "stay" ? form.checkIn : form.dayDate,
      date_end: selectedPackage.type === "stay" ? form.checkOut : null,
      estimated_price: estimatedPrice,
    };

    try {
      setSubmitting(true);
      await createBooking(bookingPayload);

      if (!hasSupabaseConfig) {
        await sendToTelegram({
          name: form.customerName.trim(),
          phone: form.phone.trim(),
          package_name: selectedPackage.name,
          type: typeLabel,
          guests: form.guests,
          dates: datesLabel,
          price: estimatedPrice,
          date_start: bookingPayload.date_start,
          date_end: bookingPayload.date_end,
        });
      }

      setForm({
        packageId: selectedPackage.id,
        customerName: "",
        phone: "",
        email: "",
        guests: 1,
        checkIn: "",
        checkOut: "",
        dayDate: todayIso(),
      });
      setSuccessMessage("So'rov qabul qilindi. Menejerga yuborish jarayoni boshlandi.");
    } catch (submitError) {
      console.error(submitError);
      setError("So'rovni yuborishda xatolik yuz berdi.");
    } finally {
      setSubmitting(false);
    }
  };

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
              Bron qilish
            </div>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
              Dam olish rejangizni bir necha daqiqada rasmiylashtiring
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-8 text-white/72 sm:text-base">
              Paketni tanlang, sana va mehmonlar sonini kiriting. Tizim taxminiy narxni darhol
              hisoblaydi va so'rovingizni Telegram orqali menejerga yuboradi.
            </p>
          </div>
        </div>
      </AnimatedSection>

      <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr]">
        <AnimatedSection className="space-y-6 rounded-[36px] bg-[#07111f] p-6 text-white shadow-[0_24px_80px_rgba(15,23,42,0.18)] sm:p-8">
          <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/6">
            <div className="relative h-64">
              <img src={bookingImage} alt={selectedPackage?.name ?? "Bron paketi"} className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#07111f] via-[#07111f]/35 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-5">
                <p className="text-xs uppercase tracking-[0.26em] text-white/60">Tanlangan paket</p>
                <h2 className="mt-2 text-2xl font-semibold">
                  {selectedPackage?.name ?? "Paketni tanlang"}
                </h2>
                <p className="mt-2 text-sm text-white/70">
                  {selectedPackage ? getTypeLabel(selectedPackage.type) : "Bron boshlash uchun paket tanlang"}
                </p>
              </div>
            </div>

            {selectedPackage ? (
              <div className="space-y-5 p-5">
                <p className="text-sm leading-7 text-white/70">{selectedPackage.description}</p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-white/45">Asosiy narx</p>
                    <p className="mt-2 text-xl font-semibold">{formatCurrency(selectedPackage.base_price)}</p>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-white/45">Qo'shimcha mehmon</p>
                    <p className="mt-2 text-xl font-semibold">{formatCurrency(selectedPackage.price_per_guest)}</p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                    <div className="flex items-center gap-2 text-white/50">
                      <Users size={16} />
                      <p className="text-xs uppercase tracking-[0.24em]">Sig'im</p>
                    </div>
                    <p className="mt-2 text-lg font-semibold">{selectedPackage.max_guests} kishi</p>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-white/5 p-4">
                    <div className="flex items-center gap-2 text-white/50">
                      <CalendarDays size={16} />
                      <p className="text-xs uppercase tracking-[0.24em]">Hisob turi</p>
                    </div>
                    <p className="mt-2 text-lg font-semibold">
                      {selectedPackage.type === "stay" ? `${nights || 0} kecha` : "1 kun"}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-white/45">Taxminiy narx</p>
            <p className="mt-3 text-4xl font-semibold tracking-tight">{formatCurrency(estimatedPrice)}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-white/6 p-4">
                <div className="flex items-center gap-2 text-white/45">
                  <CalendarDays size={16} />
                  <p className="text-xs uppercase tracking-[0.24em]">Davomiyligi</p>
                </div>
                <p className="mt-2 text-lg font-semibold">
                  {selectedPackage?.type === "stay" ? `${nights || 0} kecha` : "1 kun"}
                </p>
              </div>
              <div className="rounded-2xl bg-white/6 p-4">
                <div className="flex items-center gap-2 text-white/45">
                  <Users size={16} />
                  <p className="text-xs uppercase tracking-[0.24em]">Mehmonlar</p>
                </div>
                <p className="mt-2 text-lg font-semibold">{form.guests} kishi</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-7 text-white/65">{bookingHint}</p>
          </div>
        </AnimatedSection>

        <AnimatedSection className="rounded-[36px] border border-black/5 bg-white p-6 shadow-soft sm:p-8">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="mb-2">
              <p className="text-xs uppercase tracking-[0.28em] text-ink/35">Ma'lumotlar</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink">Bron formasini to'ldiring</h2>
              <p className="mt-3 text-sm leading-7 text-ink/60">
                Quyidagi maydonlarni to'ldiring. Tizim ma'lumotlarni saqlaydi va so'rovingizni Telegram orqali yuboradi.
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="space-y-2 text-sm text-ink/70">
                <span>Ism</span>
                <div className="flex items-center gap-3 rounded-2xl border border-black/10 bg-pearl px-4 py-3 transition focus-within:border-pine">
                  <Users size={18} className="text-ink/35" />
                  <input
                    value={form.customerName}
                    onChange={(event) => setForm((current) => ({ ...current, customerName: event.target.value }))}
                    className="w-full bg-transparent outline-none"
                    placeholder="Masalan, Diyorbek Karimov"
                  />
                </div>
              </label>

              <label className="space-y-2 text-sm text-ink/70">
                <span>Telefon raqami</span>
                <div className="flex items-center gap-3 rounded-2xl border border-black/10 bg-pearl px-4 py-3 transition focus-within:border-pine">
                  <Phone size={18} className="text-ink/35" />
                  <input
                    value={form.phone}
                    onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                    className="w-full bg-transparent outline-none"
                    placeholder="+998 90 123 45 67"
                  />
                </div>
              </label>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="space-y-2 text-sm text-ink/70">
                <span>Elektron pochta</span>
                <div className="flex items-center gap-3 rounded-2xl border border-black/10 bg-pearl px-4 py-3 transition focus-within:border-pine">
                  <Mail size={18} className="text-ink/35" />
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                    className="w-full bg-transparent outline-none"
                    placeholder="ixtiyoriy"
                  />
                </div>
              </label>

              <label className="space-y-2 text-sm text-ink/70">
                <span>Odamlar soni</span>
                <input
                  type="number"
                  min={1}
                  max={selectedPackage?.max_guests ?? 20}
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

            <label className="space-y-2 text-sm text-ink/70">
              <span>Paket tanlash</span>
              <select
                value={form.packageId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    packageId: event.target.value,
                    guests: 1,
                    checkIn: "",
                    checkOut: "",
                    dayDate: todayIso(),
                  }))
                }
                className="w-full rounded-2xl border border-black/10 bg-pearl px-4 py-3 outline-none transition focus:border-pine"
              >
                <option value="">Paketni tanlang</option>
                {packages.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            {selectedPackage?.type === "stay" ? (
              <div className="grid gap-5 sm:grid-cols-2">
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
              <label className="space-y-2 text-sm text-ink/70">
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

            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {successMessage ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {successMessage}
              </div>
            ) : null}

            <div className="rounded-[28px] border border-black/5 bg-gradient-to-br from-sand/30 to-white p-5">
              <p className="text-sm font-medium text-ink">Taxminiy narx: {formatCurrency(estimatedPrice)}</p>
              <p className="mt-2 text-sm leading-6 text-ink/60">
                So'rov yuborilgach, ma'lumotlar bazaga saqlanadi va Telegram orqali menejerga fon rejimida yetkaziladi.
              </p>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink px-5 py-4 text-sm font-medium text-white transition hover:bg-pine disabled:cursor-not-allowed disabled:bg-ink/60"
            >
              {submitting ? <LoaderCircle className="animate-spin" size={18} /> : <Send size={18} />}
              Telegram orqali bron qilish
            </button>
          </form>
        </AnimatedSection>
      </div>
    </div>
  );
}
