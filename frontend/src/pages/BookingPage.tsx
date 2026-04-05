import { CalendarDays, LoaderCircle, Send, Users } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { AnimatedSection } from "../components/AnimatedSection";
import { createBooking, getPackages } from "../lib/api";
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

export function BookingPage() {
  const location = useLocation();
  const [packages, setPackages] = useState<PackageRecord[]>([]);
  const [error, setError] = useState("");
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
          ? `${nights} kecha uchun hisoblandi.`
          : "Narxni aniq ko'rish uchun kirish va chiqish sanasini tanlang."
        : "Narx tanlangan kun va mehmonlar soni asosida hisoblanmoqda.";

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

    const typeLabel = selectedPackage.type === "stay" ? "Tunab qolish" : "Kunlik dam olish";
    const datesLabel =
      selectedPackage.type === "stay"
        ? `${form.checkIn} dan ${form.checkOut} gacha`
        : form.dayDate;

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

    const bookingData = {
      name: form.customerName.trim(),
      phone: form.phone.trim(),
      package_name: selectedPackage.name,
      type: typeLabel,
      guests: form.guests,
      dates: datesLabel,
      price: estimatedPrice,
      date_start: bookingPayload.date_start,
      date_end: bookingPayload.date_end,
    };

    try {
      setSubmitting(true);
      await createBooking(bookingPayload);
      await sendToTelegram(bookingData);
      window.alert("So'rov yuborildi!");
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
    } catch (submitError) {
      console.error(submitError);
      setError("So'rovni yuborishda xatolik yuz berdi.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <AnimatedSection className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6 rounded-[36px] border border-black/5 bg-white p-8 shadow-soft">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-ink/35">Bron qilish</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">Bron formasini to'ldiring</h1>
            <p className="mt-4 text-sm leading-7 text-ink/65">
              Paket turiga qarab tegishli sanalarni kiriting. Tizim kechalar sonini hisoblaydi
              va taxminiy narxni shu sahifaning o'zida ko'rsatadi.
            </p>
          </div>

          {selectedPackage ? (
            <div className="rounded-[28px] bg-pearl p-5">
              <p className="text-sm font-medium text-ink">{selectedPackage.name}</p>
              <p className="mt-2 text-sm leading-6 text-ink/60">{selectedPackage.description}</p>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-ink/35">Paket turi</p>
                  <p className="mt-2 font-medium text-ink">
                    {selectedPackage.type === "stay" ? "Tunab qolish" : "Bir kunlik"}
                  </p>
                </div>
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-ink/35">Maksimal sig'im</p>
                  <p className="mt-2 font-medium text-ink">{selectedPackage.max_guests} kishi</p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="rounded-[28px] border border-black/5 bg-gradient-to-br from-sand/35 to-white p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/35">Taxminiy narx</p>
            <p className="mt-3 text-4xl font-semibold tracking-tight text-ink">
              {formatCurrency(estimatedPrice)}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-white/85 p-4">
                <div className="flex items-center gap-2 text-ink/45">
                  <CalendarDays size={16} />
                  <p className="text-xs uppercase tracking-[0.24em]">Kechalar soni</p>
                </div>
                <p className="mt-2 text-lg font-semibold text-ink">{selectedPackage?.type === "stay" ? nights : 1}</p>
              </div>
              <div className="rounded-2xl bg-white/85 p-4">
                <div className="flex items-center gap-2 text-ink/45">
                  <Users size={16} />
                  <p className="text-xs uppercase tracking-[0.24em]">Mehmonlar soni</p>
                </div>
                <p className="mt-2 text-lg font-semibold text-ink">{form.guests} kishi</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-ink/60">{bookingHint}</p>
          </div>
        </div>

        <AnimatedSection className="rounded-[36px] border border-black/5 bg-white p-8 shadow-soft">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="space-y-2 text-sm text-ink/70">
                <span>Ism</span>
                <input
                  value={form.customerName}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      customerName: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-black/10 bg-pearl px-4 py-3 outline-none transition focus:border-pine"
                  placeholder="Masalan, Diyorbek Karimov"
                />
              </label>

              <label className="space-y-2 text-sm text-ink/70">
                <span>Telefon raqami</span>
                <input
                  value={form.phone}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      phone: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-black/10 bg-pearl px-4 py-3 outline-none transition focus:border-pine"
                  placeholder="+998 90 123 45 67"
                />
              </label>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="space-y-2 text-sm text-ink/70">
                <span>Elektron pochta (ixtiyoriy)</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-black/10 bg-pearl px-4 py-3 outline-none transition focus:border-pine"
                  placeholder="mehmon@example.com"
                />
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
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        checkIn: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-black/10 bg-pearl px-4 py-3 outline-none transition focus:border-pine"
                  />
                </label>

                <label className="space-y-2 text-sm text-ink/70">
                  <span>Chiqish sanasi</span>
                  <input
                    type="date"
                    value={form.checkOut}
                    min={form.checkIn || todayIso()}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        checkOut: event.target.value,
                      }))
                    }
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
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      dayDate: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-black/10 bg-pearl px-4 py-3 outline-none transition focus:border-pine"
                />
              </label>
            )}

            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <div className="rounded-[28px] border border-black/5 bg-pearl px-5 py-4 text-sm text-ink/65">
              <p className="font-medium text-ink">Taxminiy narx: {formatCurrency(estimatedPrice)}</p>
              <p className="mt-2 leading-6">
                So'rov yuborilganda ma'lumot backend orqali Telegram botga jo'natiladi.
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
      </AnimatedSection>
    </div>
  );
}
