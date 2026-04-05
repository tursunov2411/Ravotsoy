import type { Session } from "@supabase/supabase-js";
import {
  Check,
  Clock3,
  LoaderCircle,
  LogOut,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import {
  deleteBooking,
  deletePackage,
  getAdminBookings,
  getMediaAssets,
  getPackages,
  getSession,
  onAuthChange,
  signOutAdmin,
  updateBookingStatus,
  uploadMediaAsset,
  uploadPackageImage,
  upsertPackage,
} from "../lib/api";
import { hasSupabaseConfig } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import type {
  BookingRecord,
  MediaAsset,
  MediaKind,
  PackageInput,
  PackageRecord,
} from "../lib/types";
import { formatCurrency, isVideoUrl } from "../lib/utils";

const emptyPackage: PackageInput = {
  name: "",
  description: "",
  type: "stay",
  base_price: 0,
  price_per_guest: 0,
  max_guests: 1,
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
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }

  if (status === "rejected") {
    return "bg-red-50 text-red-700 border-red-200";
  }

  return "bg-amber-50 text-amber-700 border-amber-200";
}

export function AdminPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [packages, setPackages] = useState<PackageRecord[]>([]);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [media, setMedia] = useState<MediaAsset[]>([]);
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

  const refresh = async () => {
    const [packagesData, bookingsData, mediaData] = await Promise.all([
      getPackages(),
      getAdminBookings(),
      getMediaAssets(),
    ]);
    setPackages(packagesData);
    setBookings(bookingsData);
    setMedia(mediaData);
  };

  useEffect(() => {
    if (!hasSupabaseConfig) {
      setLoading(false);
      return;
    }

    const boot = async () => {
      try {
        const currentSession = await getSession();
        setSession(currentSession);

        if (currentSession) {
          await refresh();
        } else {
          navigate("/admin-login", { replace: true });
        }
      } catch (bootError) {
        console.error(bootError);
        setError("Admin ma'lumotlarini yuklashda xatolik yuz berdi.");
      } finally {
        setLoading(false);
      }
    };

    const unsubscribe = onAuthChange((nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        void refresh();
      } else {
        navigate("/admin-login", { replace: true });
      }
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

  const pendingCount = bookings.filter((booking) => booking.status === "pending").length;
  const heroMedia = media.filter((item) => item.type === "hero");
  const galleryMedia = media.filter((item) => item.type === "gallery");
  const packageMedia = media.filter((item) => item.type === "package");

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
      <div className="rounded-[36px] border border-black/5 bg-white p-8 shadow-soft">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-ink/35">Admin dashboard</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">
              Paketlar, bronlar va media boshqaruvi
            </h1>
            <p className="mt-3 text-sm leading-7 text-ink/65">
              Bu panel orqali paket yaratish, bronlar holatini yangilash va hero,
              galereya hamda paket rasmlarini yuklash mumkin.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              void (async () => {
                await signOutAdmin();
                navigate("/admin-login", { replace: true });
              })()
            }
            className="inline-flex items-center justify-center gap-2 rounded-full border border-black/10 px-5 py-3 text-sm font-medium text-ink"
          >
            <LogOut size={16} />
            Chiqish
          </button>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-[28px] bg-pearl p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/35">Paketlar</p>
            <p className="mt-3 text-3xl font-semibold">{packages.length}</p>
          </div>
          <div className="rounded-[28px] bg-pearl p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/35">Kutilayotgan bronlar</p>
            <p className="mt-3 text-3xl font-semibold">{pendingCount}</p>
          </div>
          <div className="rounded-[28px] bg-pearl p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-ink/35">Jami media</p>
            <p className="mt-3 text-3xl font-semibold">{media.length}</p>
          </div>
        </div>
      </div>

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

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-[32px] border border-black/5 bg-white p-6 shadow-soft">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-2xl font-semibold tracking-tight">
              {editingPackageId ? "Paketni tahrirlash" : "Paket yaratish"}
            </h2>
            {editingPackageId ? (
              <button
                type="button"
                onClick={() => {
                  setEditingPackageId(null);
                  setPackageForm(emptyPackage);
                  setPackageImageFile(null);
                }}
                className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-ink"
              >
                Bekor qilish
              </button>
            ) : null}
          </div>

          <form className="mt-5 space-y-4" onSubmit={handlePackageSubmit}>
            <label className="space-y-2 text-sm text-ink/70">
              <span>Nomi</span>
              <input
                required
                value={packageForm.name}
                onChange={(event) => setPackageForm((current) => ({ ...current, name: event.target.value }))}
                className="w-full rounded-2xl border border-black/10 bg-pearl px-4 py-3 outline-none transition focus:border-pine"
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
                className="w-full rounded-2xl border border-black/10 bg-pearl px-4 py-3 outline-none transition focus:border-pine"
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
                  className="w-full rounded-2xl border border-black/10 bg-pearl px-4 py-3 outline-none transition focus:border-pine"
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
                  className="w-full rounded-2xl border border-black/10 bg-pearl px-4 py-3 outline-none transition focus:border-pine"
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm text-ink/70">
                <span>Narx</span>
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
                  className="w-full rounded-2xl border border-black/10 bg-pearl px-4 py-3 outline-none transition focus:border-pine"
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
                  className="w-full rounded-2xl border border-black/10 bg-pearl px-4 py-3 outline-none transition focus:border-pine"
                />
              </label>
            </div>

            <label className="space-y-2 text-sm text-ink/70">
              <span>Paket rasmi</span>
              <input
                type="file"
                accept="image/*"
                onChange={(event) => setPackageImageFile(event.target.files?.[0] ?? null)}
                className="w-full rounded-2xl border border-black/10 bg-pearl px-4 py-3"
              />
              <p className="text-xs text-ink/50">
                Rasm tanlansa, u `package-images` storage bucket ichiga yuklanadi.
              </p>
            </label>

            <button
              type="submit"
              disabled={working}
              className="inline-flex items-center justify-center rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-pine disabled:cursor-not-allowed disabled:bg-ink/60"
            >
              {editingPackageId ? "O'zgarishlarni saqlash" : "Paket yaratish"}
            </button>
          </form>
        </section>

        <section className="rounded-[32px] border border-black/5 bg-white p-6 shadow-soft">
          <h2 className="text-2xl font-semibold tracking-tight">Paketlar</h2>
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/5 text-ink/45">
                  <th className="px-3 py-3 font-medium">Nomi</th>
                  <th className="px-3 py-3 font-medium">Turi</th>
                  <th className="px-3 py-3 font-medium">Narx</th>
                  <th className="px-3 py-3 font-medium">Mehmon narxi</th>
                  <th className="px-3 py-3 font-medium">Maksimal</th>
                  <th className="px-3 py-3 font-medium">Amallar</th>
                </tr>
              </thead>
              <tbody>
                {packages.map((item) => (
                  <tr key={item.id} className="border-b border-black/5 align-top">
                    <td className="px-3 py-4">
                      <p className="font-medium text-ink">{item.name}</p>
                      <p className="mt-1 max-w-xs text-xs leading-5 text-ink/55">{item.description}</p>
                    </td>
                    <td className="px-3 py-4 text-ink/70">
                      {item.type === "stay" ? "Tunab qolish" : "Kunlik dam olish"}
                    </td>
                    <td className="px-3 py-4 text-ink/70">{formatCurrency(item.base_price)}</td>
                    <td className="px-3 py-4 text-ink/70">{formatCurrency(item.price_per_guest)}</td>
                    <td className="px-3 py-4 text-ink/70">{item.max_guests} kishi</td>
                    <td className="px-3 py-4">
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
                          className="rounded-full border border-black/10 px-3 py-2 text-xs font-medium text-ink"
                        >
                          Tahrirlash
                        </button>
                        <button
                          type="button"
                          onClick={() => void runAction(() => deletePackage(item.id), "Paket o'chirildi.")}
                          className="rounded-full border border-red-200 px-3 py-2 text-xs font-medium text-red-700"
                        >
                          O'chirish
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-[32px] border border-black/5 bg-white p-6 shadow-soft">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold tracking-tight">Bronlar</h2>
          <div className="inline-flex items-center gap-2 rounded-full bg-pearl px-4 py-2 text-sm text-ink/65">
            <Clock3 size={16} />
            {pendingCount} ta kutilayotgan bron
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/5 text-ink/45">
                <th className="px-3 py-3 font-medium">Ism</th>
                <th className="px-3 py-3 font-medium">Telefon</th>
                <th className="px-3 py-3 font-medium">Mehmonlar</th>
                <th className="px-3 py-3 font-medium">Sanalar</th>
                <th className="px-3 py-3 font-medium">Paket</th>
                <th className="px-3 py-3 font-medium">Narx</th>
                <th className="px-3 py-3 font-medium">Holat</th>
                <th className="px-3 py-3 font-medium">Amallar</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking) => (
                <tr key={booking.id} className="border-b border-black/5 align-top">
                  <td className="px-3 py-4 font-medium text-ink">{booking.name}</td>
                  <td className="px-3 py-4 text-ink/70">{booking.phone}</td>
                  <td className="px-3 py-4 text-ink/70">{booking.guests} kishi</td>
                  <td className="px-3 py-4 text-ink/70">
                    {booking.date_start}
                    {booking.date_end ? ` - ${booking.date_end}` : ""}
                  </td>
                  <td className="px-3 py-4 text-ink/70">{booking.package_name || booking.package_id}</td>
                  <td className="px-3 py-4 text-ink/70">{formatCurrency(booking.estimated_price)}</td>
                  <td className="px-3 py-4">
                    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${statusClass(booking.status)}`}>
                      {statusLabel(booking.status)}
                    </span>
                  </td>
                  <td className="px-3 py-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          void runAction(() => updateBookingStatus(booking.id, "approved"), "Bron tasdiqlandi.")
                        }
                        className="inline-flex items-center gap-1 rounded-full border border-emerald-200 px-3 py-2 text-xs font-medium text-emerald-700"
                      >
                        <Check size={14} />
                        Tasdiqlash
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void runAction(() => updateBookingStatus(booking.id, "rejected"), "Bron rad etildi.")
                        }
                        className="inline-flex items-center gap-1 rounded-full border border-amber-200 px-3 py-2 text-xs font-medium text-amber-700"
                      >
                        <X size={14} />
                        Rad etish
                      </button>
                      <button
                        type="button"
                        onClick={() => void runAction(() => deleteBooking(booking.id), "Bron o'chirildi.")}
                        className="inline-flex items-center gap-1 rounded-full border border-red-200 px-3 py-2 text-xs font-medium text-red-700"
                      >
                        <Trash2 size={14} />
                        O'chirish
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-[32px] border border-black/5 bg-white p-6 shadow-soft">
          <h2 className="text-2xl font-semibold tracking-tight">Media yuklash</h2>

          <form className="mt-5 space-y-4 rounded-[28px] bg-pearl p-5" onSubmit={handleMediaUpload}>
            <h3 className="text-lg font-semibold">Hero va galereya</h3>
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
                className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 outline-none transition focus:border-pine"
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
                className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3"
              />
            </label>
            <button
              type="submit"
              disabled={working}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-pine disabled:cursor-not-allowed disabled:bg-ink/60"
            >
              <Upload size={16} />
              Yuklash
            </button>
          </form>

          <form className="mt-6 space-y-4 rounded-[28px] bg-pearl p-5" onSubmit={handlePackageImageUpload}>
            <h3 className="text-lg font-semibold">Paket rasmlari</h3>
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
                className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 outline-none transition focus:border-pine"
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
                className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3"
              />
            </label>
            <button
              type="submit"
              disabled={working}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-pine disabled:cursor-not-allowed disabled:bg-ink/60"
            >
              <Upload size={16} />
              Paket rasmini yuklash
            </button>
          </form>
        </section>

        <section className="rounded-[32px] border border-black/5 bg-white p-6 shadow-soft">
          <h2 className="text-2xl font-semibold tracking-tight">Yuklangan media</h2>

          <div className="mt-5 space-y-6">
            <div>
              <p className="mb-3 text-sm font-medium text-ink">Hero rasmlari</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {heroMedia.map((item) => (
                  <div key={item.id} className="overflow-hidden rounded-3xl border border-black/5 bg-pearl">
                    {isVideoUrl(item.url) ? (
                      <video src={item.url} controls className="h-40 w-full object-cover" />
                    ) : (
                      <img src={item.url} alt="Hero media" className="h-40 w-full object-cover" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-3 text-sm font-medium text-ink">Galereya</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {galleryMedia.map((item) => (
                  <div key={item.id} className="overflow-hidden rounded-3xl border border-black/5 bg-pearl">
                    {isVideoUrl(item.url) ? (
                      <video src={item.url} controls className="h-40 w-full object-cover" />
                    ) : (
                      <img src={item.url} alt="Galereya media" className="h-40 w-full object-cover" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-3 text-sm font-medium text-ink">Paket rasmlari</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {packageMedia.map((item) => (
                  <div key={item.id} className="overflow-hidden rounded-3xl border border-black/5 bg-pearl">
                    <img src={item.url} alt="Paket rasmi" className="h-40 w-full object-cover" />
                    <div className="p-4 text-xs text-ink/55">
                      Paket ID: {item.package_id ?? "Biriktirilmagan"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
