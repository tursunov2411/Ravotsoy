import type { Session } from "@supabase/supabase-js";
import {
  Boxes,
  CalendarRange,
  Check,
  Clock3,
  Image as ImageIcon,
  LoaderCircle,
  LogOut,
  Pencil,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  deleteBooking,
  deletePackage,
  getAdminSession,
  getAdminBookings,
  getMediaAssets,
  getPackages,
  getSiteSettings,
  isAdminUser,
  onAuthChange,
  signOutAdmin,
  updateBookingStatus,
  uploadMediaAsset,
  uploadPackageImage,
  upsertSiteSettings,
  upsertPackage,
} from "../lib/api";
import { hasSupabaseConfig } from "../lib/supabase";
import type {
  BookingRecord,
  MediaAsset,
  MediaKind,
  PackageInput,
  PackageRecord,
  SiteSettings,
} from "../lib/types";
import { cn, formatCurrency, isVideoUrl } from "../lib/utils";

const emptyPackage: PackageInput = {
  name: "",
  description: "",
  type: "stay",
  base_price: 0,
  price_per_guest: 0,
  max_guests: 1,
};

const emptySiteSettings: Omit<SiteSettings, "id"> = {
  location_label: "Bizning manzilimiz",
  location_url: "https://yandex.com/maps/-/CHeC5WPL",
  maps_embed_url: "",
  contacts_button_label: "",
  contacts_button_url: "",
};

function statusLabel(status: BookingRecord["status"]) {
  if (status === "approved") {
    return "Tasdiqlangan";
  }

  if (status === "rejected") {
    return "Rad etilgan";
  }

  return "Kutilmoqda";
}

function statusClass(status: BookingRecord["status"]) {
  if (status === "approved") {
    return "border-emerald-300/40 bg-emerald-500/12 text-emerald-100";
  }

  if (status === "rejected") {
    return "border-red-300/40 bg-red-500/12 text-red-100";
  }

  return "border-amber-300/40 bg-amber-500/12 text-amber-100";
}

function packageTypeLabel(type: PackageRecord["type"]) {
  return type === "stay" ? "Tunab qolish" : "Kunlik dam olish";
}

function formatBookingDates(booking: BookingRecord) {
  return booking.date_end ? `${booking.date_start} - ${booking.date_end}` : booking.date_start;
}

type StatCardProps = {
  icon: ReactNode;
  label: string;
  value: string | number;
  hint: string;
};

function StatCard({ icon, label, value, hint }: StatCardProps) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/6 p-5 backdrop-blur-xl">
      <div className="inline-flex rounded-2xl border border-white/10 bg-white/10 p-3 text-white/90">
        {icon}
      </div>
      <p className="mt-4 text-xs uppercase tracking-[0.24em] text-white/45">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-2 text-sm leading-6 text-white/62">{hint}</p>
    </div>
  );
}

type SectionCardProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
};

function SectionCard({ title, description, action, children }: SectionCardProps) {
  return (
    <section className="rounded-[32px] border border-black/5 bg-white p-6 shadow-soft sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink">{title}</h2>
          {description ? <p className="mt-2 text-sm leading-7 text-ink/60">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function inputClassName() {
  return "w-full rounded-2xl border border-black/10 bg-pearl px-4 py-3 outline-none transition focus:border-pine";
}

export function AdminPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [packages, setPackages] = useState<PackageRecord[]>([]);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [siteSettings, setSiteSettings] = useState<Omit<SiteSettings, "id">>(emptySiteSettings);
  const [packageForm, setPackageForm] = useState<PackageInput>(emptyPackage);
  const [packageImageFile, setPackageImageFile] = useState<File | null>(null);
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);
  const [mediaForm, setMediaForm] = useState({
    kind: "hero" as Exclude<MediaKind, "package">,
    file: null as File | null,
  });
  const [packageImageForm, setPackageImageForm] = useState({
    packageId: "",
    file: null as File | null,
  });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const redirectToAdminLogin = async () => {
    setSession(null);
    await signOutAdmin();
    navigate("/admin-login", { replace: true });
  };

  const refresh = async () => {
    const [packagesData, bookingsData, mediaData, settingsData] = await Promise.all([
      getPackages(),
      getAdminBookings(),
      getMediaAssets(),
      getSiteSettings(),
    ]);
    setPackages(packagesData);
    setBookings(bookingsData);
    setMedia(mediaData);
    setSiteSettings({
      location_label: settingsData.location_label,
      location_url: settingsData.location_url,
      maps_embed_url: settingsData.maps_embed_url ?? "",
      contacts_button_label: settingsData.contacts_button_label ?? "",
      contacts_button_url: settingsData.contacts_button_url ?? "",
    });
  };

  useEffect(() => {
    if (!hasSupabaseConfig) {
      setLoading(false);
      return;
    }

    const boot = async () => {
      try {
        const currentSession = await getAdminSession();
        setSession(currentSession);

        if (currentSession) {
          await refresh();
        } else {
          await redirectToAdminLogin();
        }
      } catch (bootError) {
        console.error(bootError);
        setError("Admin ma'lumotlarini yuklashda xatolik yuz berdi.");
      } finally {
        setLoading(false);
      }
    };

    const unsubscribe = onAuthChange((nextSession) => {
      void (async () => {
        if (!nextSession) {
          setSession(null);
          navigate("/admin-login", { replace: true });
          return;
        }

        try {
          const adminAllowed = await isAdminUser(nextSession.user.id);

          if (!adminAllowed) {
            await redirectToAdminLogin();
            return;
          }

          setSession(nextSession);
          await refresh();
        } catch (authError) {
          console.error(authError);
          setError("Admin ruxsatlarini tekshirishda xatolik yuz berdi.");
        }
      })();
    });

    void boot();

    return unsubscribe;
  }, [navigate]);

  const resetMessages = () => {
    setError("");
    setNotice("");
  };

  const runAction = async (action: () => Promise<void>, successText: string) => {
    setWorking(true);
    resetMessages();

    try {
      await action();
      await refresh();
      setNotice(successText);
    } catch (actionError) {
      console.error(actionError);
      setError("Amalni bajarishda xatolik yuz berdi.");
    } finally {
      setWorking(false);
    }
  };

  const handlePackageSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setWorking(true);
    resetMessages();

    try {
      const savedPackage = await upsertPackage(editingPackageId, packageForm);

      if (packageImageFile) {
        await uploadPackageImage(packageImageFile, savedPackage.id);
      }

      await refresh();
      setEditingPackageId(null);
      setPackageForm(emptyPackage);
      setPackageImageFile(null);
      setNotice("Paket muvaffaqiyatli saqlandi.");
    } catch (submitError) {
      console.error(submitError);
      setError("Paketni saqlashda xatolik yuz berdi.");
    } finally {
      setWorking(false);
    }
  };

  const handleMediaUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!mediaForm.file) {
      setError("Hero yoki galereya faylini tanlang.");
      return;
    }

    setWorking(true);
    resetMessages();

    try {
      await uploadMediaAsset(mediaForm.file, mediaForm.kind);
      await refresh();
      setMediaForm({ kind: "hero", file: null });
      setNotice("Media muvaffaqiyatli yuklandi.");
    } catch (uploadError) {
      console.error(uploadError);
      setError("Media yuklashda xatolik yuz berdi.");
    } finally {
      setWorking(false);
    }
  };

  const handlePackageImageUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!packageImageForm.packageId || !packageImageForm.file) {
      setError("Paket va rasm faylini tanlang.");
      return;
    }

    setWorking(true);
    resetMessages();

    try {
      await uploadPackageImage(packageImageForm.file, packageImageForm.packageId);
      await refresh();
      setPackageImageForm({ packageId: "", file: null });
      setNotice("Paket rasmi yuklandi.");
    } catch (uploadError) {
      console.error(uploadError);
      setError("Paket rasmini yuklashda xatolik yuz berdi.");
    } finally {
      setWorking(false);
    }
  };

  const handleSiteSettingsSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setWorking(true);
    resetMessages();

    try {
      await upsertSiteSettings({
        location_label: siteSettings.location_label.trim(),
        location_url: siteSettings.location_url.trim(),
        maps_embed_url: siteSettings.maps_embed_url?.trim() ?? "",
        contacts_button_label: siteSettings.contacts_button_label?.trim() ?? "",
        contacts_button_url: siteSettings.contacts_button_url?.trim() ?? "",
      });
      await refresh();
      setNotice("Sayt sozlamalari saqlandi.");
    } catch (submitError) {
      console.error(submitError);
      setError("Sayt sozlamalarini saqlashda xatolik yuz berdi.");
    } finally {
      setWorking(false);
    }
  };

  const pendingCount = bookings.filter((booking) => booking.status === "pending").length;
  const approvedCount = bookings.filter((booking) => booking.status === "approved").length;
  const heroMedia = media.filter((item) => item.type === "hero");
  const galleryMedia = media.filter((item) => item.type === "gallery");
  const packageMedia = media.filter((item) => item.type === "package");
  const recentBookings = useMemo(() => bookings.slice(0, 6), [bookings]);

  if (!hasSupabaseConfig) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-[36px] border border-black/5 bg-white p-8 shadow-soft">
          <p className="text-xs uppercase tracking-[0.3em] text-ink/35">Admin</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Supabase sozlanmagan</h1>
          <p className="mt-4 text-sm leading-7 text-ink/65">
            `frontend/.env` ichiga `VITE_SUPABASE_URL` va `VITE_SUPABASE_ANON_KEY`
            qiymatlarini kiriting. So'ng admin foydalanuvchini `Supabase Auth` orqali yarating.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-[36px] border border-black/5 bg-white p-8 text-sm text-ink/60 shadow-soft">
          Admin panel yuklanmoqda...
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-[36px] border border-black/5 bg-white p-8 text-sm text-ink/60 shadow-soft">
          Admin kirish sahifasiga yo'naltirilmoqda...
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <section className="rounded-[40px] bg-[#07111f] px-6 py-8 text-white shadow-[0_24px_80px_rgba(15,23,42,0.18)] sm:px-8 lg:px-10">
        <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(135deg,#09111f_0%,#0d1b33_48%,#143261_100%)] p-8">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff10_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:66px_66px]" />
          <div className="absolute left-[-8%] top-[-18%] h-72 w-72 rounded-full bg-sky-500/20 blur-3xl" />
          <div className="absolute bottom-[-20%] right-[-8%] h-72 w-72 rounded-full bg-blue-500/16 blur-3xl" />

          <div className="relative z-10 flex flex-col gap-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-4 py-2 text-xs uppercase tracking-[0.3em] text-white/72">
                  <ShieldCheck size={16} />
                  Admin panel
                </div>
                <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
                  Paketlar, bronlar va media boshqaruvi
                </h1>
                <p className="mt-4 text-sm leading-8 text-white/72 sm:text-base">
                  Shu panel orqali yangi paket yaratish, kelgan bronlarni tasdiqlash yoki rad
                  etish, shuningdek hero, galereya va paket rasmlarini boshqarish mumkin.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col lg:items-end">
                <div className="rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-sm text-white/75">
                  {session.user.email ?? "Admin foydalanuvchi"}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void (async () => {
                      await signOutAdmin();
                      navigate("/admin-login", { replace: true });
                    })()
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/14 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/10"
                >
                  <LogOut size={16} />
                  Chiqish
                </button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard icon={<Boxes size={20} />} label="Paketlar" value={packages.length} hint="Faol paketlar soni" />
              <StatCard icon={<Clock3 size={20} />} label="Kutilmoqda" value={pendingCount} hint="Javob kutayotgan bronlar" />
              <StatCard icon={<Check size={20} />} label="Tasdiqlangan" value={approvedCount} hint="Tasdiqlangan bronlar" />
              <StatCard icon={<ImageIcon size={20} />} label="Media" value={media.length} hint="Jami yuklangan fayllar" />
            </div>
          </div>
        </div>
      </section>

      {notice ? (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      ) : null}

      {error ? (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mt-6">
        <SectionCard
          title="Sayt sozlamalari"
          description="Joylashuv havolasi, ixtiyoriy embed xarita va Telegram yonidagi Contacts tugmasini shu yerdan boshqaring."
        >
          <form className="grid gap-4 lg:grid-cols-2" onSubmit={handleSiteSettingsSubmit}>
            <label className="space-y-2 text-sm text-ink/70">
              <span>Joylashuv nomi</span>
              <input
                required
                value={siteSettings.location_label}
                onChange={(event) =>
                  setSiteSettings((current) => ({
                    ...current,
                    location_label: event.target.value,
                  }))
                }
                className={inputClassName()}
              />
            </label>

            <label className="space-y-2 text-sm text-ink/70">
              <span>Joylashuv havolasi</span>
              <input
                required
                type="url"
                value={siteSettings.location_url}
                onChange={(event) =>
                  setSiteSettings((current) => ({
                    ...current,
                    location_url: event.target.value,
                  }))
                }
                className={inputClassName()}
              />
            </label>

            <label className="space-y-2 text-sm text-ink/70 lg:col-span-2">
              <span>Xarita embed URL</span>
              <input
                type="url"
                placeholder="https://..."
                value={siteSettings.maps_embed_url ?? ""}
                onChange={(event) =>
                  setSiteSettings((current) => ({
                    ...current,
                    maps_embed_url: event.target.value,
                  }))
                }
                className={inputClassName()}
              />
              <p className="text-xs leading-5 text-ink/45">
                Ixtiyoriy. Agar embed URL bo'sh qolsa, sayt Yandex xaritani ochish tugmasini ko'rsatadi.
              </p>
            </label>

            <label className="space-y-2 text-sm text-ink/70">
              <span>Contacts tugmasi matni</span>
              <input
                placeholder="Masalan: Contacts"
                value={siteSettings.contacts_button_label ?? ""}
                onChange={(event) =>
                  setSiteSettings((current) => ({
                    ...current,
                    contacts_button_label: event.target.value,
                  }))
                }
                className={inputClassName()}
              />
            </label>

            <label className="space-y-2 text-sm text-ink/70">
              <span>Contacts tugmasi havolasi</span>
              <input
                type="url"
                placeholder="https://..., tel:+998..., mailto:..."
                value={siteSettings.contacts_button_url ?? ""}
                onChange={(event) =>
                  setSiteSettings((current) => ({
                    ...current,
                    contacts_button_url: event.target.value,
                  }))
                }
                className={inputClassName()}
              />
            </label>

            <div className="lg:col-span-2">
              <button
                type="submit"
                disabled={working}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-pine disabled:cursor-not-allowed disabled:bg-ink/60"
              >
                {working ? <LoaderCircle className="animate-spin" size={16} /> : null}
                Sozlamalarni saqlash
              </button>
            </div>
          </form>
        </SectionCard>
      </div>

      <div className="mt-6 grid gap-6 2xl:grid-cols-[1.02fr_0.98fr]">
        <SectionCard
          title={editingPackageId ? "Paketni tahrirlash" : "Yangi paket yaratish"}
          description="Paket ma'lumotlarini kiriting, kerak bo'lsa darhol asosiy rasm ham yuklang."
          action={
            editingPackageId ? (
              <button
                type="button"
                onClick={() => {
                  setEditingPackageId(null);
                  setPackageForm(emptyPackage);
                  setPackageImageFile(null);
                }}
                className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-ink transition hover:bg-pearl"
              >
                Bekor qilish
              </button>
            ) : null
          }
        >
          <form className="grid gap-4" onSubmit={handlePackageSubmit}>
            <label className="space-y-2 text-sm text-ink/70">
              <span>Nomi</span>
              <input
                required
                value={packageForm.name}
                onChange={(event) => setPackageForm((current) => ({ ...current, name: event.target.value }))}
                className={inputClassName()}
              />
            </label>

            <label className="space-y-2 text-sm text-ink/70">
              <span>Qisqa tavsif</span>
              <textarea
                required
                rows={4}
                value={packageForm.description}
                onChange={(event) =>
                  setPackageForm((current) => ({ ...current, description: event.target.value }))
                }
                className={inputClassName()}
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm text-ink/70">
                <span>Turi</span>
                <select
                  value={packageForm.type}
                  onChange={(event) =>
                    setPackageForm((current) => ({
                      ...current,
                      type: event.target.value as PackageRecord["type"],
                    }))
                  }
                  className={inputClassName()}
                >
                  <option value="stay">Tunab qolish</option>
                  <option value="day">Kunlik dam olish</option>
                </select>
              </label>

              <label className="space-y-2 text-sm text-ink/70">
                <span>Maksimal mehmon</span>
                <input
                  type="number"
                  min={1}
                  required
                  value={packageForm.max_guests}
                  onChange={(event) =>
                    setPackageForm((current) => ({
                      ...current,
                      max_guests: Number(event.target.value),
                    }))
                  }
                  className={inputClassName()}
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm text-ink/70">
                <span>Asosiy narx</span>
                <input
                  type="number"
                  min={0}
                  required
                  value={packageForm.base_price}
                  onChange={(event) =>
                    setPackageForm((current) => ({
                      ...current,
                      base_price: Number(event.target.value),
                    }))
                  }
                  className={inputClassName()}
                />
              </label>

              <label className="space-y-2 text-sm text-ink/70">
                <span>Mehmon narxi</span>
                <input
                  type="number"
                  min={0}
                  required
                  value={packageForm.price_per_guest}
                  onChange={(event) =>
                    setPackageForm((current) => ({
                      ...current,
                      price_per_guest: Number(event.target.value),
                    }))
                  }
                  className={inputClassName()}
                />
              </label>
            </div>

            <label className="space-y-2 text-sm text-ink/70">
              <span>Paket rasmi</span>
              <input
                type="file"
                accept="image/*"
                onChange={(event) => setPackageImageFile(event.target.files?.[0] ?? null)}
                className={inputClassName()}
              />
              <p className="text-xs leading-5 text-ink/45">
                Rasm tanlansa, u `package-images` storage bucket ichiga yuklanadi.
              </p>
            </label>

            <button
              type="submit"
              disabled={working}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-pine disabled:cursor-not-allowed disabled:bg-ink/60"
            >
              {working ? <LoaderCircle className="animate-spin" size={16} /> : null}
              {editingPackageId ? "O'zgarishlarni saqlash" : "Paket yaratish"}
            </button>
          </form>
        </SectionCard>

        <SectionCard
          title="Paketlar ro'yxati"
          description="Mavjud paketlarni tez ko'ring, tahrirlang yoki o'chiring."
        >
          <div className="grid gap-4">
            {packages.map((item) => (
              <div
                key={item.id}
                className="rounded-[28px] border border-black/6 bg-gradient-to-br from-white to-pearl/70 p-5"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-ink">{item.name}</h3>
                      <span className="rounded-full bg-pearl px-3 py-1 text-xs font-medium text-ink/70">
                        {packageTypeLabel(item.type)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-ink/58">{item.description}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPackageId(item.id);
                        setPackageForm({
                          name: item.name,
                          description: item.description,
                          type: item.type,
                          base_price: item.base_price,
                          price_per_guest: item.price_per_guest,
                          max_guests: item.max_guests,
                        });
                      }}
                      className="inline-flex items-center gap-2 rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-ink transition hover:bg-white"
                    >
                      <Pencil size={14} />
                      Tahrirlash
                    </button>
                    <button
                      type="button"
                      onClick={() => void runAction(() => deletePackage(item.id), "Paket o'chirildi.")}
                      className="inline-flex items-center gap-2 rounded-full border border-red-200 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50"
                    >
                      <Trash2 size={14} />
                      O'chirish
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-white/80 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-ink/40">Asosiy narx</p>
                    <p className="mt-2 text-base font-semibold text-ink">{formatCurrency(item.base_price)}</p>
                  </div>
                  <div className="rounded-2xl bg-white/80 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-ink/40">Mehmon narxi</p>
                    <p className="mt-2 text-base font-semibold text-ink">{formatCurrency(item.price_per_guest)}</p>
                  </div>
                  <div className="rounded-2xl bg-white/80 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-ink/40">Maksimal sig'im</p>
                    <p className="mt-2 text-base font-semibold text-ink">{item.max_guests} kishi</p>
                  </div>
                </div>
              </div>
            ))}

            {packages.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-black/10 bg-pearl/60 p-8 text-sm text-ink/55">
                Hozircha birorta paket yaratilmagan.
              </div>
            ) : null}
          </div>
        </SectionCard>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <SectionCard
          title="Bronlar"
          description="Kelgan so'rovlarni ko'rib chiqing va ularning holatini yangilang."
          action={
            <div className="inline-flex items-center gap-2 rounded-full bg-pearl px-4 py-2 text-sm text-ink/65">
              <Clock3 size={16} />
              {pendingCount} ta kutilayotgan bron
            </div>
          }
        >
          <div className="grid gap-4">
            {bookings.map((booking) => (
              <div
                key={booking.id}
                className="rounded-[28px] border border-black/6 bg-gradient-to-br from-white to-pearl/70 p-5"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-ink">{booking.name}</h3>
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-3 py-1 text-xs font-medium",
                          statusClass(booking.status),
                        )}
                      >
                        {statusLabel(booking.status)}
                      </span>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      <div className="rounded-2xl bg-white/85 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-ink/40">Telefon</p>
                        <p className="mt-2 text-sm font-medium text-ink">{booking.phone}</p>
                      </div>
                      <div className="rounded-2xl bg-white/85 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-ink/40">Paket</p>
                        <p className="mt-2 text-sm font-medium text-ink">
                          {booking.package_name || booking.package_id}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-white/85 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-ink/40">Narx</p>
                        <p className="mt-2 text-sm font-medium text-ink">
                          {formatCurrency(booking.estimated_price)}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-white/85 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-ink/40">Mehmonlar</p>
                        <p className="mt-2 text-sm font-medium text-ink">{booking.guests} kishi</p>
                      </div>
                      <div className="rounded-2xl bg-white/85 p-4 sm:col-span-2 xl:col-span-2">
                        <p className="text-xs uppercase tracking-[0.2em] text-ink/40">Sanalar</p>
                        <p className="mt-2 text-sm font-medium text-ink">{formatBookingDates(booking)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 lg:max-w-[220px] lg:justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        void runAction(() => updateBookingStatus(booking.id, "approved"), "Bron tasdiqlandi.")
                      }
                      className="inline-flex items-center gap-1 rounded-full border border-emerald-200 px-4 py-2 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50"
                    >
                      <Check size={14} />
                      Tasdiqlash
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void runAction(() => updateBookingStatus(booking.id, "rejected"), "Bron rad etildi.")
                      }
                      className="inline-flex items-center gap-1 rounded-full border border-amber-200 px-4 py-2 text-xs font-medium text-amber-700 transition hover:bg-amber-50"
                    >
                      <X size={14} />
                      Rad etish
                    </button>
                    <button
                      type="button"
                      onClick={() => void runAction(() => deleteBooking(booking.id), "Bron o'chirildi.")}
                      className="inline-flex items-center gap-1 rounded-full border border-red-200 px-4 py-2 text-xs font-medium text-red-700 transition hover:bg-red-50"
                    >
                      <Trash2 size={14} />
                      O'chirish
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {bookings.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-black/10 bg-pearl/60 p-8 text-sm text-ink/55">
                Hozircha bron so'rovlari mavjud emas.
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard
          title="Tezkor ko'rinish"
          description="So'nggi bronlar va joriy media taqsimotini tez ko'rish uchun qisqa ko'rsatkichlar."
        >
          <div className="grid gap-4">
            <div className="rounded-[28px] bg-gradient-to-br from-[#09111f] to-[#12284c] p-5 text-white">
              <div className="flex items-center gap-2 text-white/72">
                <CalendarRange size={18} />
                <p className="text-sm font-medium">So'nggi bronlar</p>
              </div>
              <div className="mt-4 space-y-3">
                {recentBookings.map((booking) => (
                  <div key={booking.id} className="rounded-2xl border border-white/10 bg-white/8 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{booking.name}</p>
                      <span className="text-xs text-white/65">{statusLabel(booking.status)}</span>
                    </div>
                    <p className="mt-2 text-sm text-white/70">{booking.package_name || booking.package_id}</p>
                    <p className="mt-1 text-xs text-white/55">{formatBookingDates(booking)}</p>
                  </div>
                ))}
                {recentBookings.length === 0 ? (
                  <p className="text-sm text-white/65">Bronlar paydo bo'lgach shu yerda ko'rinadi.</p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-[28px] border border-black/6 bg-pearl/70 p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-ink/35">Hero</p>
                <p className="mt-3 text-3xl font-semibold text-ink">{heroMedia.length}</p>
              </div>
              <div className="rounded-[28px] border border-black/6 bg-pearl/70 p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-ink/35">Galereya</p>
                <p className="mt-3 text-3xl font-semibold text-ink">{galleryMedia.length}</p>
              </div>
              <div className="rounded-[28px] border border-black/6 bg-pearl/70 p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-ink/35">Paket rasmlari</p>
                <p className="mt-3 text-3xl font-semibold text-ink">{packageMedia.length}</p>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <SectionCard
          title="Media yuklash"
          description="Hero, galereya va paket rasmlarini alohida yuklab, sayt ko'rinishini boshqaring."
        >
          <form className="space-y-4 rounded-[28px] bg-pearl p-5" onSubmit={handleMediaUpload}>
            <h3 className="text-lg font-semibold text-ink">Hero va galereya</h3>
            <label className="space-y-2 text-sm text-ink/70">
              <span>Bo'lim</span>
              <select
                value={mediaForm.kind}
                onChange={(event) =>
                  setMediaForm((current) => ({
                    ...current,
                    kind: event.target.value as Exclude<MediaKind, "package">,
                  }))
                }
                className={inputClassName()}
              >
                <option value="hero">Hero rasmlari</option>
                <option value="gallery">Galereya</option>
              </select>
            </label>
            <label className="space-y-2 text-sm text-ink/70">
              <span>Fayl</span>
              <input
                required
                type="file"
                accept="image/*,video/*"
                onChange={(event) =>
                  setMediaForm((current) => ({
                    ...current,
                    file: event.target.files?.[0] ?? null,
                  }))
                }
                className={inputClassName()}
              />
            </label>
            <button
              type="submit"
              disabled={working}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-pine disabled:cursor-not-allowed disabled:bg-ink/60"
            >
              {working ? <LoaderCircle className="animate-spin" size={16} /> : <Upload size={16} />}
              Yuklash
            </button>
          </form>

          <form className="mt-6 space-y-4 rounded-[28px] bg-pearl p-5" onSubmit={handlePackageImageUpload}>
            <h3 className="text-lg font-semibold text-ink">Paket rasmlari</h3>
            <label className="space-y-2 text-sm text-ink/70">
              <span>Paket</span>
              <select
                value={packageImageForm.packageId}
                onChange={(event) =>
                  setPackageImageForm((current) => ({
                    ...current,
                    packageId: event.target.value,
                  }))
                }
                className={inputClassName()}
              >
                <option value="">Paketni tanlang</option>
                {packages.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm text-ink/70">
              <span>Rasm fayli</span>
              <input
                required
                type="file"
                accept="image/*"
                onChange={(event) =>
                  setPackageImageForm((current) => ({
                    ...current,
                    file: event.target.files?.[0] ?? null,
                  }))
                }
                className={inputClassName()}
              />
            </label>
            <button
              type="submit"
              disabled={working}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-pine disabled:cursor-not-allowed disabled:bg-ink/60"
            >
              {working ? <LoaderCircle className="animate-spin" size={16} /> : <Upload size={16} />}
              Paket rasmini yuklash
            </button>
          </form>
        </SectionCard>

        <SectionCard
          title="Yuklangan media"
          description="Yuklangan fayllarni bo'limlar bo'yicha ko'ring va vizual holatni tekshirib boring."
        >
          <div className="space-y-6">
            <div>
              <p className="mb-3 text-sm font-medium text-ink">Hero rasmlari</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {heroMedia.map((item) => (
                  <div key={item.id} className="overflow-hidden rounded-[28px] border border-black/5 bg-pearl">
                    {isVideoUrl(item.url) ? (
                      <video src={item.url} controls className="h-44 w-full object-cover" />
                    ) : (
                      <img src={item.url} alt="Hero media" className="h-44 w-full object-cover" />
                    )}
                  </div>
                ))}
                {heroMedia.length === 0 ? (
                  <div className="rounded-[28px] border border-dashed border-black/10 bg-pearl/60 p-8 text-sm text-ink/55">
                    Hero media hali yuklanmagan.
                  </div>
                ) : null}
              </div>
            </div>

            <div>
              <p className="mb-3 text-sm font-medium text-ink">Galereya</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {galleryMedia.map((item) => (
                  <div key={item.id} className="overflow-hidden rounded-[28px] border border-black/5 bg-pearl">
                    {isVideoUrl(item.url) ? (
                      <video src={item.url} controls className="h-44 w-full object-cover" />
                    ) : (
                      <img src={item.url} alt="Galereya media" className="h-44 w-full object-cover" />
                    )}
                  </div>
                ))}
                {galleryMedia.length === 0 ? (
                  <div className="rounded-[28px] border border-dashed border-black/10 bg-pearl/60 p-8 text-sm text-ink/55">
                    Galereya media hali yuklanmagan.
                  </div>
                ) : null}
              </div>
            </div>

            <div>
              <p className="mb-3 text-sm font-medium text-ink">Paket rasmlari</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {packageMedia.map((item) => (
                  <div key={item.id} className="overflow-hidden rounded-[28px] border border-black/5 bg-pearl">
                    <img src={item.url} alt="Paket rasmi" className="h-44 w-full object-cover" />
                    <div className="p-4 text-xs text-ink/55">Paket ID: {item.package_id ?? "Biriktirilmagan"}</div>
                  </div>
                ))}
                {packageMedia.length === 0 ? (
                  <div className="rounded-[28px] border border-dashed border-black/10 bg-pearl/60 p-8 text-sm text-ink/55">
                    Paket rasmlari hali yuklanmagan.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
