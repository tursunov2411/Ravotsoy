import type { Session } from "@supabase/supabase-js";
import {
  ArrowDown,
  ArrowUp,
  Boxes,
  CalendarRange,
  Check,
  Clock3,
  GripVertical,
  House,
  Image as ImageIcon,
  LoaderCircle,
  LogOut,
  MessageCircleMore,
  PanelsTopLeft,
  Pencil,
  Phone,
  Plus,
  Settings2,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  deleteBooking,
  deleteHomeSection,
  deleteMediaAsset,
  deletePackage,
  getAdminBookings,
  getAdminSession,
  getHomeSections,
  getMediaAssets,
  getPackages,
  getPricingRules,
  getResources,
  getSiteSettings,
  isAdminUser,
  onAuthChange,
  runAdminDiagnostics,
  signOutAdmin,
  upsertPricingRule,
  updateBookingStatus,
  uploadMediaAsset,
  uploadPackageImage,
  uploadServiceImage,
  upsertHomeSection,
  upsertPackage,
  upsertResource,
  upsertSiteSettings,
} from "../lib/api";
import type { AdminDiagnosticsReport } from "../lib/api";
import { hasSupabaseConfig } from "../lib/supabase";
import type {
  AboutStat,
  BookingRecord,
  ContentSection,
  ContentSectionType,
  FaqItem,
  MediaAsset,
  MediaKind,
  PackageInput,
  PackageRecord,
  PricingRuleRecord,
  PublicContact,
  ResourceRecord,
  ResourceType,
  SightseeingPlace,
  SiteSettings,
} from "../lib/types";
import { cn, formatCurrency, getPhoneLink, getTelegramProfileLink, isVideoUrl } from "../lib/utils";

const emptyPackage: PackageInput = {
  name: "",
  description: "",
  type: "stay",
  base_price: 0,
  price_per_guest: 0,
  max_guests: 1,
};

function createEmptyPackage(): PackageInput {
  return {
    name: "",
    description: "",
    type: "stay",
    base_price: 0,
    price_per_guest: 0,
    max_guests: 1,
  };
}

function pricingRuleLabel(resourceType: string) {
  switch (resourceType) {
    case "room_small":
      return "Kichik xona";
    case "room_big":
      return "Katta xona";
    case "tapchan_small":
      return "Kichik tapchan";
    case "tapchan_big":
      return "Katta tapchan";
    case "tapchan_very_big":
      return "Juda katta tapchan";
    default:
      return resourceType;
  }
}

const emptySiteSettings: Omit<SiteSettings, "id"> = {
  hotel_name: "",
  description: "",
  location_url: "https://yandex.com/maps/-/CHeC5WPL",
  about_text: "",
  hero_images: [],
  contact_people: [],
  payment_card_number: "",
  payment_card_holder: "",
  payment_instructions: "",
  payment_manager_telegram: "",
  payment_deposit_ratio: 0.3,
};

const sectionTypeOptions: Array<{ value: ContentSectionType; label: string }> = [
  { value: "about", label: "About" },
  { value: "faq", label: "FAQ" },
  { value: "packages", label: "Packages" },
  { value: "gallery", label: "Gallery" },
  { value: "sightseeing", label: "Sightseeing" },
  { value: "contacts", label: "Contacts" },
];

const resourceTypeOptions: ResourceType[] = [
  "room_small",
  "room_big",
  "tapchan_small",
  "tapchan_big",
  "tapchan_very_big",
];

function createEmptyContact(): PublicContact {
  return { id: crypto.randomUUID(), name: "", role: "", phone: "", telegram: "" };
}

function createAboutStat(): AboutStat {
  return {
    id: crypto.randomUUID(),
    value: "",
    label: "",
    description: "",
    icon: "sparkles",
  };
}

function createSightseeingPlace(): SightseeingPlace {
  return { id: crypto.randomUUID(), name: "", description: "" };
}

function createFaqItem(): FaqItem {
  return { id: crypto.randomUUID(), question: "", answer: "" };
}

function createDefaultFaqItems(): FaqItem[] {
  return [
    {
      id: crypto.randomUUID(),
      question: "Piknik uchun o'zimiz bilan nimalar olib kelishimiz kerak?",
      answer:
        "Sizdan faqat pishiriladigan masalliqlar va yaxshi kayfiyat so'raladi. Bizda barcha oshxona anjomlari: o'choq, qozon, mangal, shashlik sixlari va idish-tovoqlar to'liq mavjud va paket ichiga kiradi.",
    },
    {
      id: crypto.randomUUID(),
      question: "Dam olish maskani Registon maydonidan qancha uzoqlikda joylashgan?",
      answer:
        "Maskanimiz Samarqand shahridan bor-yo'g'i 1.5 soatlik, taxminan 80-90 km masofada joylashgan. Yo'llar asfaltrlangan va qulay.",
    },
    {
      id: crypto.randomUUID(),
      question: "Oilaviy dam olish uchun sharoitlar xavfsiz va alohidami?",
      answer:
        "Albatta. Har bir oila uchun alohida xona, basseyn va tapchan ajratiladi. Hudud yopiq va oilaviy hordiq uchun qulay tayyorlangan.",
    },
  ];
}

function createSection(type: ContentSectionType, sortOrder: number): Omit<ContentSection, "id"> {
  const title =
    type === "about"
      ? "Biz haqimizda"
      : type === "faq"
        ? "Savollaringiz bormi? Bizda javoblar tayyor!"
        : type === "packages"
          ? "Paketlar"
          : type === "gallery"
            ? "Galereya"
            : type === "sightseeing"
              ? "Sayr joylari"
              : "Aloqa";

  return {
    page: "home",
    section_type: type,
    eyebrow: "",
    title,
    description: "",
    content:
      type === "about"
        ? { stats: [createAboutStat(), createAboutStat()] }
        : type === "faq"
        ? {
            items: createDefaultFaqItems(),
            cta_label: "Boshqa savolingiz bormi? Telegramdan so'rang",
            cta_url: "",
          }
        : type === "sightseeing"
          ? { places: [createSightseeingPlace(), createSightseeingPlace()] }
          : {},
    sort_order: sortOrder,
    is_enabled: true,
  };
}

function getSectionTypeLabel(type: ContentSectionType) {
  return sectionTypeOptions.find((item) => item.value === type)?.label ?? type;
}

function readAboutStats(section: ContentSection): AboutStat[] {
  const value = section.content.stats;

  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const record = item as Record<string, unknown>;
    const icon = String(record.icon ?? "sparkles") as AboutStat["icon"];

    return {
      id: String(record.id ?? crypto.randomUUID()),
      value: String(record.value ?? ""),
      label: String(record.label ?? ""),
      description: String(record.description ?? ""),
      icon:
        icon === "calendar" || icon === "users" || icon === "shield" || icon === "sparkles"
          ? icon
          : "sparkles",
    };
  });
}

function readPlaces(section: ContentSection): SightseeingPlace[] {
  const value = section.content.places;

  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const record = item as Record<string, unknown>;

    return {
      id: String(record.id ?? crypto.randomUUID()),
      name: String(record.name ?? ""),
      description: String(record.description ?? ""),
    };
  });
}

function readFaqItems(section: ContentSection): FaqItem[] {
  const value = section.content.items;

  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const record = item as Record<string, unknown>;

    return {
      id: String(record.id ?? crypto.randomUUID()),
      question: String(record.question ?? ""),
      answer: String(record.answer ?? ""),
    };
  });
}

function readFaqCtaLabel(section: ContentSection) {
  return String(section.content.cta_label ?? "");
}

function readFaqCtaUrl(section: ContentSection) {
  const value = section.content.cta_url;
  return typeof value === "string" ? value : "";
}

function statusLabel(status: BookingRecord["status"]) {
  if (status === "approved" || status === "confirmed") {
    return "Tasdiqlangan";
  }

  if (status === "checked_in") {
    return "Mehmon ichkarida";
  }

  if (status === "proof_submitted") {
    return "To'lov tekshirilmoqda";
  }

  if (status === "rejected") {
    return "Rad etilgan";
  }

  if (status === "cancelled") {
    return "Bekor qilingan";
  }

  if (status === "completed") {
    return "Yakunlangan";
  }

  return "Kutilmoqda";
}

function statusClass(status: BookingRecord["status"]) {
  if (status === "approved" || status === "confirmed") {
    return "border-emerald-300/40 bg-emerald-500/12 text-emerald-100";
  }

  if (status === "checked_in") {
    return "border-indigo-300/40 bg-indigo-500/12 text-indigo-100";
  }

  if (status === "proof_submitted") {
    return "border-sky-300/40 bg-sky-500/12 text-sky-100";
  }

  if (status === "rejected") {
    return "border-red-300/40 bg-red-500/12 text-red-100";
  }

  if (status === "cancelled") {
    return "border-slate-300/40 bg-slate-500/12 text-slate-100";
  }

  if (status === "completed") {
    return "border-emerald-300/40 bg-emerald-500/12 text-emerald-100";
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

function diagnosticsStatusLabel(status: "ok" | "warning" | "error") {
  if (status === "ok") {
    return "Sog'lom";
  }

  if (status === "warning") {
    return "Ogohlantirish";
  }

  return "Xatolik";
}

function diagnosticsStatusClass(status: "ok" | "warning" | "error") {
  if (status === "ok") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-red-200 bg-red-50 text-red-700";
}

function formatDiagnosticsTime(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "Noma'lum vaqt";
  }

  return new Intl.DateTimeFormat("uz-UZ", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
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

function textareaClassName() {
  return "min-h-[120px] w-full rounded-2xl border border-black/10 bg-pearl px-4 py-3 outline-none transition focus:border-pine";
}

function iconButtonClassName() {
  return "inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-white text-ink transition hover:bg-pearl";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return "Noma'lum xatolik.";
}

type AdminNavItem = {
  id: "overview" | "settings" | "media" | "homepage" | "packages" | "bookings" | "diagnostics";
  label: string;
  icon: typeof House;
  hint: string;
};

type MediaUploadKind = Exclude<MediaKind, "package" | "service">;

export function AdminPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [packages, setPackages] = useState<PackageRecord[]>([]);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [homeSections, setHomeSections] = useState<ContentSection[]>([]);
  const [siteSettings, setSiteSettings] = useState<Omit<SiteSettings, "id">>(emptySiteSettings);
  const [pricingRules, setPricingRules] = useState<PricingRuleRecord[]>([]);
  const [resources, setResources] = useState<ResourceRecord[]>([]);
  const [diagnostics, setDiagnostics] = useState<AdminDiagnosticsReport | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [packageForm, setPackageForm] = useState<PackageInput>(createEmptyPackage());
  const [packageImageFiles, setPackageImageFiles] = useState<File[]>([]);
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);
  const [mediaForm, setMediaForm] = useState({
    kind: "hero" as MediaUploadKind,
    file: null as File | null,
  });
  const [packageImageForm, setPackageImageForm] = useState({
    packageId: "",
    files: [] as File[],
  });
  const [serviceImageForm, setServiceImageForm] = useState({
    resourceType: "",
    files: [] as File[],
  });
  const [serviceImageDrafts, setServiceImageDrafts] = useState<Record<string, File | null>>({});
  const [newResourceForm, setNewResourceForm] = useState({
    type: "room_small" as ResourceType,
    name: "",
    capacity: 1,
    is_active: true,
  });
  const [newSectionType, setNewSectionType] = useState<ContentSectionType>("about");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [activeAdminSection, setActiveAdminSection] = useState<AdminNavItem["id"]>("overview");
  const editingPackage = useMemo(
    () => packages.find((item) => item.id === editingPackageId) ?? null,
    [packages, editingPackageId],
  );

  const redirectToAdminLogin = async () => {
    setSession(null);
    await signOutAdmin();
    navigate("/admin-login", { replace: true });
  };

  const resetMessages = () => {
    setError("");
    setNotice("");
  };

  const loadDiagnostics = async (showSuccessNotice = false) => {
    setDiagnosticsLoading(true);

    try {
      const report = await runAdminDiagnostics();
      setDiagnostics(report);

      if (showSuccessNotice) {
        setNotice("Diagnostika yangilandi.");
      }
    } catch (diagnosticsError) {
      console.error(diagnosticsError);
      setError("Diagnostikani tekshirishda xatolik yuz berdi.");
    } finally {
      setDiagnosticsLoading(false);
    }
  };

  const refresh = async () => {
    const [packagesData, bookingsData, mediaData, settingsData, sectionsData, pricingRulesData, resourcesData] = await Promise.all([
      getPackages(),
      getAdminBookings(),
      getMediaAssets(),
      getSiteSettings(),
      getHomeSections(),
      getPricingRules(),
      getResources(),
    ]);

    setPackages(packagesData);
    setBookings(bookingsData);
    setMedia(mediaData);
    setHomeSections(sectionsData);
    setPricingRules(pricingRulesData);
    setResources(resourcesData);
    setSiteSettings({
      hotel_name: settingsData.hotel_name ?? "",
      description: settingsData.description ?? "",
      location_url: settingsData.location_url ?? "",
      about_text: settingsData.about_text ?? "",
      hero_images: settingsData.hero_images ?? [],
      contact_people: settingsData.contact_people ?? [],
      payment_card_number: settingsData.payment_card_number ?? "",
      payment_card_holder: settingsData.payment_card_holder ?? "",
      payment_instructions: settingsData.payment_instructions ?? "",
      payment_manager_telegram: settingsData.payment_manager_telegram ?? "",
      payment_deposit_ratio: settingsData.payment_deposit_ratio ?? 0.3,
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

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timeout = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (activeAdminSection === "diagnostics" && !diagnostics && !diagnosticsLoading) {
      void loadDiagnostics();
    }
  }, [activeAdminSection, diagnostics, diagnosticsLoading]);

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

  const updateSectionState = (sectionId: string, updater: (section: ContentSection) => ContentSection) => {
    setHomeSections((current) => current.map((section) => (section.id === sectionId ? updater(section) : section)));
  };

  const persistSectionOrder = async (sections: ContentSection[]) => {
    await Promise.all(
      sections.map((section, index) =>
        upsertHomeSection({
          ...section,
          sort_order: (index + 1) * 10,
        }),
      ),
    );
  };

  const saveSiteSettings = async () => {
    const savedSettings = await upsertSiteSettings({
      hotel_name: siteSettings.hotel_name?.trim() ?? "",
      description: siteSettings.description?.trim() ?? "",
      location_url: siteSettings.location_url.trim(),
      about_text: siteSettings.about_text?.trim() ?? "",
      hero_images: (siteSettings.hero_images ?? []).filter(Boolean),
      payment_card_number: siteSettings.payment_card_number?.trim() ?? "",
      payment_card_holder: siteSettings.payment_card_holder?.trim() ?? "",
      payment_instructions: siteSettings.payment_instructions?.trim() ?? "",
      payment_manager_telegram: siteSettings.payment_manager_telegram?.trim() ?? "",
      payment_deposit_ratio: Number(siteSettings.payment_deposit_ratio ?? 0.3),
      contact_people:
        siteSettings.contact_people?.map((item) => ({
          id: item.id,
          name: item.name.trim(),
          role: item.role.trim(),
          phone: item.phone.trim(),
          telegram: item.telegram.trim(),
        })) ?? [],
    });

    setSiteSettings({
      hotel_name: savedSettings.hotel_name ?? "",
      description: savedSettings.description ?? "",
      location_url: savedSettings.location_url ?? "",
      about_text: savedSettings.about_text ?? "",
      hero_images: savedSettings.hero_images ?? [],
      contact_people: savedSettings.contact_people ?? [],
      payment_card_number: savedSettings.payment_card_number ?? "",
      payment_card_holder: savedSettings.payment_card_holder ?? "",
      payment_instructions: savedSettings.payment_instructions ?? "",
      payment_manager_telegram: savedSettings.payment_manager_telegram ?? "",
      payment_deposit_ratio: savedSettings.payment_deposit_ratio ?? 0.3,
    });
  };

  const handleSiteSettingsSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await runAction(saveSiteSettings, "Sayt sozlamalari saqlandi.");
  };

  const savePricingRules = async () => {
    const savedRules = await Promise.all(
      pricingRules.map((rule) =>
        upsertPricingRule({
          ...rule,
          base_price: Math.max(Number(rule.base_price || 0), 0),
          price_per_extra_person: Math.max(Number(rule.price_per_extra_person || 0), 0),
          max_included_people: Math.max(Number(rule.max_included_people || 0), 1),
          discount_if_excluded: Math.min(Math.max(Number(rule.discount_if_excluded || 0), 0), 1),
        }),
      ),
    );

    setPricingRules(savedRules);
  };

  const saveResources = async () => {
    const savedResources = await Promise.all(
      resources.map((resource) =>
        upsertResource({
          ...resource,
          name: resource.name.trim(),
          capacity: Math.max(Number(resource.capacity || 0), 1),
        }),
      ),
    );

    setResources(savedResources);
  };

  const createResource = async () => {
    const savedResource = await upsertResource({
      id: "",
      type: newResourceForm.type,
      name: newResourceForm.name.trim() || pricingRuleLabel(newResourceForm.type),
      capacity: Math.max(Number(newResourceForm.capacity || 0), 1),
      is_active: newResourceForm.is_active,
    });

    setResources((current) => [...current, savedResource]);
    setNewResourceForm({
      type: "room_small",
      name: "",
      capacity: 1,
      is_active: true,
    });
  };

  const replaceServiceImageForType = async (resourceType: string) => {
    const nextFile = serviceImageDrafts[resourceType];

    if (!nextFile) {
      setError("Avval yangi servis rasmini tanlang.");
      return;
    }

    await runAction(
      async () => {
        const currentAssets = media.filter((item) => item.type === "service" && item.resource_type === resourceType);

        if (currentAssets.length > 0) {
          await Promise.all(currentAssets.map((asset) => deleteMediaAsset(asset)));
        }

        await uploadServiceImage(nextFile, resourceType);
        setServiceImageDrafts((current) => ({ ...current, [resourceType]: null }));
      },
      "Servis rasmi yangilandi.",
    );
  };

  const deleteServiceImageForType = async (resourceType: string) => {
    const currentAssets = media.filter((item) => item.type === "service" && item.resource_type === resourceType);

    if (currentAssets.length === 0) {
      setError("Bu servis uchun rasm topilmadi.");
      return;
    }

    await runAction(
      async () => {
        await Promise.all(currentAssets.map((asset) => deleteMediaAsset(asset)));
        setServiceImageDrafts((current) => ({ ...current, [resourceType]: null }));
      },
      "Servis rasmi o'chirildi.",
    );
  };

  const handlePackageSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setWorking(true);
    resetMessages();

    try {
      const savedPackage = await upsertPackage(editingPackageId, { ...packageForm });
      const uploadedImages =
        packageImageFiles.length > 0
          ? await Promise.all(packageImageFiles.map((file) => uploadPackageImage(file, savedPackage.id)))
          : [];

      if (uploadedImages.length > 0) {
        setMedia((current) => [...uploadedImages, ...current]);
      }

      setPackages((current) => {
        const existingImages = current.find((item) => item.id === savedPackage.id)?.images ?? [];
        const nextItem = {
          ...savedPackage,
          images: [...existingImages, ...uploadedImages.map((item) => item.url)],
        };

        return current.some((item) => item.id === savedPackage.id)
          ? current.map((item) => (item.id === savedPackage.id ? { ...item, ...nextItem } : item))
          : [...current, nextItem];
      });

      setEditingPackageId(null);
      setPackageForm(createEmptyPackage());
      setPackageImageFiles([]);
      setNotice("Paket muvaffaqiyatli saqlandi.");
    } catch (submitError) {
      console.error(submitError);
      setError(`Paketni saqlashda xatolik yuz berdi: ${getErrorMessage(submitError)}`);
    } finally {
      setWorking(false);
    }
  };

  const handleMediaUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!mediaForm.file) {
      setError("Hero yoki galereya uchun media fayl tanlang.");
      return;
    }

    await runAction(
      async () => {
        await uploadMediaAsset(mediaForm.file!, mediaForm.kind);
        setMediaForm({ kind: "hero", file: null });
      },
      "Media muvaffaqiyatli yuklandi.",
    );
  };

  const handlePackageImageUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!packageImageForm.packageId || packageImageForm.files.length === 0) {
      setError("Paket va kamida bitta rasm faylini tanlang.");
      return;
    }

    await runAction(
      async () => {
        await Promise.all(
          packageImageForm.files.map((file) => uploadPackageImage(file, packageImageForm.packageId)),
        );
        setPackageImageForm({ packageId: "", files: [] });
      },
      "Paket rasmlari yuklandi.",
    );
  };

  const handleServiceImageUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!serviceImageForm.resourceType || serviceImageForm.files.length === 0) {
      setError("Resurs turi va kamida bitta rasm faylini tanlang.");
      return;
    }

    await runAction(
      async () => {
        await Promise.all(
          serviceImageForm.files.map((file) => uploadServiceImage(file, serviceImageForm.resourceType)),
        );
        setServiceImageForm({ resourceType: "", files: [] });
      },
      "Servis rasmlari yuklandi.",
    );
  };

  const handleDeleteMedia = async (asset: MediaAsset) => {
    await runAction(
      async () => {
        await deleteMediaAsset(asset);

        if (asset.type === "hero" && (siteSettings.hero_images ?? []).includes(asset.id)) {
          await upsertSiteSettings({
            ...siteSettings,
            hero_images: (siteSettings.hero_images ?? []).filter((id) => id !== asset.id),
          });
        }
      },
      "Media o'chirildi.",
    );
  };

  const handleCreateSection = async () => {
    const nextSortOrder = (homeSections.length + 1) * 10;

    await runAction(
      async () => {
        await upsertHomeSection(createSection(newSectionType, nextSortOrder));
      },
      "Yangi bo'lim yaratildi.",
    );
  };

  const handleSaveSection = async (section: ContentSection) => {
    await runAction(
      async () => {
        const savedSection = await upsertHomeSection({
          ...section,
          eyebrow: section.eyebrow.trim(),
          title: section.title.trim(),
          description: section.description.trim(),
        });
        setHomeSections((current) => current.map((item) => (item.id === section.id ? savedSection : item)));
      },
      "Bo'lim saqlandi.",
    );
  };

  const handleMoveSection = async (sectionId: string, direction: "up" | "down") => {
    const currentSections = [...homeSections].sort((left, right) => left.sort_order - right.sort_order);
    const currentIndex = currentSections.findIndex((section) => section.id === sectionId);

    if (currentIndex < 0) {
      return;
    }

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (targetIndex < 0 || targetIndex >= currentSections.length) {
      return;
    }

    const nextSections = [...currentSections];
    const [selected] = nextSections.splice(currentIndex, 1);
    nextSections.splice(targetIndex, 0, selected);
    setHomeSections(nextSections.map((section, index) => ({ ...section, sort_order: (index + 1) * 10 })));

    await runAction(async () => persistSectionOrder(nextSections), "Bo'limlar tartibi yangilandi.");
  };

  const pendingCount = bookings.filter(
    (booking) => booking.status === "pending" || booking.status === "proof_submitted",
  ).length;
  const approvedCount = bookings.filter(
    (booking) =>
      booking.status === "approved" || booking.status === "confirmed" || booking.status === "completed",
  ).length;
  const heroMedia = media.filter((item) => item.type === "hero");
  const galleryMedia = media.filter((item) => item.type === "gallery");
  const packageMedia = media.filter((item) => item.type === "package");
  const serviceMedia = media.filter((item) => item.type === "service");
  const recentBookings = useMemo(() => bookings.slice(0, 6), [bookings]);
  const orderedSections = useMemo(
    () => [...homeSections].sort((left, right) => left.sort_order - right.sort_order),
    [homeSections],
  );
  const serviceResourceTypes = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...resourceTypeOptions,
            ...resources.map((item) => String(item.type ?? "")),
            ...pricingRules.map((item) => String(item.resource_type ?? "")),
            ...serviceMedia.map((item) => String(item.resource_type ?? "")),
          ].filter(Boolean),
        ),
      ),
    [pricingRules, resources, serviceMedia],
  );
  const serviceMediaByType = useMemo(
    () =>
      Object.fromEntries(
        serviceResourceTypes.map((resourceType) => [
          resourceType,
          serviceMedia.find((item) => item.resource_type === resourceType) ?? null,
        ]),
      ) as Record<string, MediaAsset | null>,
    [serviceMedia, serviceResourceTypes],
  );
  const adminNavItems = useMemo<AdminNavItem[]>(
    () => [
      { id: "overview", label: "Dashboard", icon: House, hint: "Umumiy ko'rinish" },
      { id: "settings", label: "Sozlamalar", icon: Settings2, hint: "Sayt matnlari va kontaktlar" },
      { id: "media", label: "Media", icon: Upload, hint: "Yuklash va kutubxona" },
      { id: "homepage", label: "Homepage", icon: PanelsTopLeft, hint: "Bosh sahifa bloklari" },
      { id: "packages", label: "Paketlar", icon: Boxes, hint: "Yaratish va tahrirlash" },
      { id: "bookings", label: "Bronlar", icon: CalendarRange, hint: "So'rovlar va holatlar" },
      { id: "diagnostics", label: "Diagnostika", icon: ShieldCheck, hint: "Tizim tekshiruvi" },
    ],
    [],
  );

  if (!hasSupabaseConfig) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="rounded-[36px] border border-black/5 bg-white p-8 shadow-soft">
          <p className="text-xs uppercase tracking-[0.3em] text-ink/35">Admin</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Supabase sozlanmagan</h1>
          <p className="mt-4 text-sm leading-7 text-ink/65">
            `frontend/.env` ichiga `VITE_SUPABASE_URL` va `VITE_SUPABASE_ANON_KEY`
            qiymatlarini kiriting.
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
      <section
        id="overview"
        className="scroll-mt-28 rounded-[40px] bg-[#07111f] px-6 py-8 text-white shadow-[0_24px_80px_rgba(15,23,42,0.18)] sm:px-8 lg:px-10"
      >
        <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(135deg,#09111f_0%,#0d1b33_48%,#143261_100%)] p-8">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff10_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:66px_66px]" />
          <div className="absolute left-[-8%] top-[-18%] h-72 w-72 rounded-full bg-sky-500/20 blur-3xl" />
          <div className="absolute bottom-[-20%] right-[-8%] h-72 w-72 rounded-full bg-blue-500/16 blur-3xl" />

          <div className="relative z-10 flex flex-col gap-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-4 py-2 text-xs uppercase tracking-[0.3em] text-white/72">
                  <ShieldCheck size={16} />
                  CMS admin
                </div>
                <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
                  Kontent, media va bron boshqaruvi
                </h1>
                <p className="mt-4 text-sm leading-8 text-white/72 sm:text-base">
                  Public sayt uchun barcha ko'rinadigan ma'lumotlar, hero slayder, galereya,
                  sightseeing bloklari, kontaktlar va paketlar shu yerdan boshqariladi.
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
              <StatCard icon={<ImageIcon size={20} />} label="Media" value={media.length} hint="Hero, galereya va paket fayllari" />
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

      <div className="mt-6 grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="xl:sticky xl:top-24 xl:self-start">
          <div className="rounded-[32px] border border-black/5 bg-white p-5 shadow-soft">
            <p className="text-xs uppercase tracking-[0.26em] text-ink/35">Navigatsiya</p>
            <h2 className="mt-3 text-xl font-semibold tracking-tight text-ink">Admin bo'limlari</h2>
            <p className="mt-2 text-sm leading-6 text-ink/58">
              Kerakli bo'limga tez o'ting va saqlash jarayonini yo'qotmasdan ishlang.
            </p>

            <div className="mt-5 flex gap-3 overflow-x-auto pb-1 xl:flex-col xl:overflow-visible xl:pb-0">
              {adminNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeAdminSection === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveAdminSection(item.id)}
                    className={cn(
                      "flex min-w-[220px] items-start gap-3 rounded-[24px] border px-4 py-4 text-left transition xl:min-w-0",
                      isActive
                        ? "border-ink bg-ink text-white shadow-[0_20px_40px_rgba(15,23,42,0.14)]"
                        : "border-black/6 bg-pearl/70 text-ink hover:bg-white",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
                        isActive ? "bg-white/12 text-white" : "bg-white text-ink",
                      )}
                    >
                      <Icon size={18} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{item.label}</span>
                      <span className={cn("mt-1 block text-xs leading-5", isActive ? "text-white/72" : "text-ink/48")}>
                        {item.hint}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        <div className="min-w-0">
      {activeAdminSection === "overview" ? (
        <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
          <SectionCard
            title="Boshqaruv markazi"
            description="Kerakli menyuni chap sidebar orqali tanlang. Har panel faqat kerakli funksiyalarni ko'rsatadi."
          >
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard icon={<Boxes size={20} />} label="Paketlar" value={packages.length} hint="Faol paketlar soni" />
              <StatCard icon={<Clock3 size={20} />} label="Kutilmoqda" value={pendingCount} hint="Yangi bronlar" />
              <StatCard icon={<Check size={20} />} label="Tasdiqlangan" value={approvedCount} hint="Yopilgan so'rovlar" />
              <StatCard icon={<ImageIcon size={20} />} label="Media" value={media.length} hint="Barcha yuklangan fayllar" />
            </div>
          </SectionCard>

          <SectionCard
            title="So'nggi bronlar"
            description="Oxirgi tushgan bronlar va ularning hozirgi holati."
          >
            <div className="grid gap-3">
              {recentBookings.length > 0 ? (
                recentBookings.map((booking) => (
                  <div key={booking.id} className="rounded-[24px] border border-black/6 bg-pearl/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-ink">{booking.name}</p>
                      <span className="text-xs text-ink/45">{statusLabel(booking.status)}</span>
                    </div>
                    <p className="mt-2 text-sm text-ink/60">{booking.booking_label || booking.package_name || booking.package_id}</p>
                    <p className="mt-1 text-xs text-ink/45">{formatBookingDates(booking)}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-[24px] border border-dashed border-black/10 bg-pearl/60 p-6 text-sm text-ink/58">
                  Hozircha yangi bronlar yo'q.
                </div>
              )}
            </div>
          </SectionCard>
        </div>
      ) : null}

      {activeAdminSection === "diagnostics" ? (
        <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <SectionCard
            title="Sayt diagnostikasi"
            description="Frontend admin panel tayangan asosiy oqimlar shu yerda tekshiriladi: backend, Supabase, media, resurslar va bronlash konfiguratori."
            action={
              <button
                type="button"
                disabled={diagnosticsLoading}
                onClick={() => void loadDiagnostics(true)}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-pine disabled:cursor-not-allowed disabled:bg-ink/60"
              >
                {diagnosticsLoading ? <LoaderCircle size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                Qayta tekshirish
              </button>
            }
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-emerald-700/70">Sog'lom</p>
                <p className="mt-3 text-3xl font-semibold text-emerald-700">{diagnostics?.summary.ok ?? 0}</p>
              </div>
              <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-amber-700/70">Ogohlantirish</p>
                <p className="mt-3 text-3xl font-semibold text-amber-700">{diagnostics?.summary.warning ?? 0}</p>
              </div>
              <div className="rounded-[24px] border border-red-200 bg-red-50 p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-red-700/70">Xatolik</p>
                <p className="mt-3 text-3xl font-semibold text-red-700">{diagnostics?.summary.error ?? 0}</p>
              </div>
            </div>

            <div className="mt-5 rounded-[24px] border border-black/6 bg-pearl/70 p-5 text-sm text-ink/65">
              Oxirgi tekshiruv: {diagnostics ? formatDiagnosticsTime(diagnostics.ranAt) : "hali ishga tushirilmagan"}
            </div>
          </SectionCard>

          <SectionCard
            title="Tekshiruv natijalari"
            description="Har bir satr admin panel ishlatayotgan haqiqiy endpoint yoki query bo'yicha statusni ko'rsatadi."
          >
            <div className="grid gap-4">
              {diagnosticsLoading && !diagnostics ? (
                <div className="rounded-[24px] border border-dashed border-black/10 bg-pearl/60 p-6 text-sm text-ink/58">
                  Diagnostika ishga tushmoqda...
                </div>
              ) : null}

              {!diagnosticsLoading && diagnostics?.checks.length ? (
                diagnostics.checks.map((check) => (
                  <div key={check.id} className="rounded-[24px] border border-black/6 bg-white/90 p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex items-center gap-3">
                          <p className="text-base font-semibold text-ink">{check.label}</p>
                          <span className={cn("inline-flex rounded-full border px-3 py-1 text-xs font-medium", diagnosticsStatusClass(check.status))}>
                            {diagnosticsStatusLabel(check.status)}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-ink/62">{check.detail}</p>
                      </div>
                      <div className="rounded-full bg-pearl px-3 py-1 text-xs text-ink/55">
                        {check.durationMs} ms
                      </div>
                    </div>
                  </div>
                ))
              ) : null}

              {!diagnosticsLoading && !diagnostics ? (
                <div className="rounded-[24px] border border-dashed border-black/10 bg-pearl/60 p-6 text-sm text-ink/58">
                  Hali diagnostika natijasi yo'q.
                </div>
              ) : null}
            </div>
          </SectionCard>
        </div>
      ) : null}

      {activeAdminSection === "settings" || activeAdminSection === "media" ? (
      <div className={cn("grid gap-6", activeAdminSection === "media" ? "xl:grid-cols-[1.02fr_0.98fr]" : "grid-cols-1")}>
        {activeAdminSection === "settings" ? (
        <section id="settings" className="scroll-mt-28">
        <SectionCard
          title="Sayt sozlamalari"
          description="Asosiy public kontent, hero slayder tartibi, joylashuv va xodimlar kontaktlarini shu yerdan boshqaring."
          action={
            <button
              type="button"
              disabled={working}
              onClick={() => void runAction(saveSiteSettings, "Sayt sozlamalari saqlandi.")}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-pine disabled:cursor-not-allowed disabled:bg-ink/60"
            >
              {working ? <LoaderCircle className="animate-spin" size={16} /> : <Save size={16} />}
              Kontentni saqlash
            </button>
          }
        >
          <form className="grid gap-4 lg:grid-cols-2" onSubmit={handleSiteSettingsSubmit}>
            <label className="space-y-2 text-sm text-ink/70">
              <span>Hotel nomi</span>
              <input
                required
                value={siteSettings.hotel_name ?? ""}
                onChange={(event) =>
                  setSiteSettings((current) => ({
                    ...current,
                    hotel_name: event.target.value,
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
              <span>Qisqa tavsif</span>
              <textarea
                value={siteSettings.description ?? ""}
                onChange={(event) =>
                  setSiteSettings((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                className={textareaClassName()}
              />
            </label>

            <label className="space-y-2 text-sm text-ink/70 lg:col-span-2">
              <span>About matni</span>
              <textarea
                value={siteSettings.about_text ?? ""}
                onChange={(event) =>
                  setSiteSettings((current) => ({
                    ...current,
                    about_text: event.target.value,
                  }))
                }
                className={textareaClassName()}
              />
            </label>

            <div className="space-y-4 rounded-[28px] bg-pearl p-5 lg:col-span-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-lg font-semibold text-ink">To'lov qabul qilish</p>
                  <p className="mt-1 text-sm leading-6 text-ink/58">
                    Tashqi to'lov tizimisiz ishlash uchun shu yerga karta va menejer ma'lumotlarini kiriting.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={working}
                  onClick={() => void runAction(saveSiteSettings, "To'lov parametrlari saqlandi.")}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-pine disabled:cursor-not-allowed disabled:bg-ink/60"
                >
                  <Save size={16} />
                  To'lovni saqlash
                </button>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <label className="space-y-2 text-sm text-ink/70">
                  <span>Karta raqami</span>
                  <input
                    value={siteSettings.payment_card_number ?? ""}
                    onChange={(event) =>
                      setSiteSettings((current) => ({
                        ...current,
                        payment_card_number: event.target.value,
                      }))
                    }
                    className={inputClassName()}
                    placeholder="8600 1234 5678 9012"
                  />
                </label>

                <label className="space-y-2 text-sm text-ink/70">
                  <span>Karta egasi</span>
                  <input
                    value={siteSettings.payment_card_holder ?? ""}
                    onChange={(event) =>
                      setSiteSettings((current) => ({
                        ...current,
                        payment_card_holder: event.target.value,
                      }))
                    }
                    className={inputClassName()}
                    placeholder="Sunnatilla Tursunov"
                  />
                </label>

                <label className="space-y-2 text-sm text-ink/70">
                  <span>To'lov menejeri Telegram</span>
                  <input
                    value={siteSettings.payment_manager_telegram ?? ""}
                    onChange={(event) =>
                      setSiteSettings((current) => ({
                        ...current,
                        payment_manager_telegram: event.target.value,
                      }))
                    }
                    className={inputClassName()}
                    placeholder="@manager_username"
                  />
                </label>

                <label className="space-y-2 text-sm text-ink/70">
                  <span>Oldindan to'lov ulushi</span>
                  <input
                    type="number"
                    min={10}
                    max={100}
                    step={10}
                    value={Math.round(Number(siteSettings.payment_deposit_ratio ?? 0.3) * 100)}
                    onChange={(event) =>
                      setSiteSettings((current) => ({
                        ...current,
                        payment_deposit_ratio: Math.min(
                          Math.max(Number(event.target.value || 0) / 100, 0.1),
                          1,
                        ),
                      }))
                    }
                    className={inputClassName()}
                    placeholder="30"
                  />
                </label>

                <label className="space-y-2 text-sm text-ink/70 lg:col-span-2">
                  <span>To'lov ko'rsatmasi</span>
                  <textarea
                    value={siteSettings.payment_instructions ?? ""}
                    onChange={(event) =>
                      setSiteSettings((current) => ({
                        ...current,
                        payment_instructions: event.target.value,
                      }))
                    }
                    className={textareaClassName()}
                    placeholder="Pul o'tkazilgach, chekni menejerga Telegram orqali yuboring."
                  />
                </label>
              </div>
            </div>

            <div className="space-y-4 rounded-[28px] bg-pearl p-5 lg:col-span-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-lg font-semibold text-ink">Resurs narxlari</p>
                  <p className="mt-1 text-sm leading-6 text-ink/58">
                    Xona va tapchan narxlarini shu yerdan yangilang. Bu qiymatlar sayt va Telegram botga bir xil qo'llanadi.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void runAction(savePricingRules, "Narxlar saqlandi.")}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-pine"
                >
                  <Save size={16} />
                  Narxlarni saqlash
                </button>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {pricingRules.map((rule) => (
                  <div key={rule.resource_type} className="rounded-[24px] border border-black/8 bg-white/85 p-4">
                    <p className="text-sm font-semibold text-ink">{pricingRuleLabel(rule.resource_type)}</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className="space-y-2 text-sm text-ink/70">
                        <span>Bazaviy narx</span>
                        <input
                          type="number"
                          min={0}
                          value={rule.base_price}
                          onChange={(event) =>
                            setPricingRules((current) =>
                              current.map((item) =>
                                item.resource_type === rule.resource_type
                                  ? { ...item, base_price: Number(event.target.value) }
                                  : item,
                              ),
                            )
                          }
                          className={inputClassName()}
                        />
                      </label>

                      <label className="space-y-2 text-sm text-ink/70">
                        <span>Kiritilgan odam limiti</span>
                        <input
                          type="number"
                          min={1}
                          value={rule.max_included_people}
                          onChange={(event) =>
                            setPricingRules((current) =>
                              current.map((item) =>
                                item.resource_type === rule.resource_type
                                  ? { ...item, max_included_people: Number(event.target.value) }
                                  : item,
                              ),
                            )
                          }
                          className={inputClassName()}
                        />
                      </label>

                      <label className="space-y-2 text-sm text-ink/70">
                        <span>Qo'shimcha odam narxi</span>
                        <input
                          type="number"
                          min={0}
                          value={rule.price_per_extra_person}
                          onChange={(event) =>
                            setPricingRules((current) =>
                              current.map((item) =>
                                item.resource_type === rule.resource_type
                                  ? { ...item, price_per_extra_person: Number(event.target.value) }
                                  : item,
                              ),
                            )
                          }
                          className={inputClassName()}
                        />
                      </label>

                      {rule.includes_tapchan ? (
                        <label className="space-y-2 text-sm text-ink/70">
                          <span>Tapchansiz chegirma (%)</span>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={5}
                            value={Math.round(rule.discount_if_excluded * 100)}
                            onChange={(event) =>
                              setPricingRules((current) =>
                                current.map((item) =>
                                  item.resource_type === rule.resource_type
                                    ? {
                                        ...item,
                                        discount_if_excluded: Math.min(
                                          Math.max(Number(event.target.value || 0) / 100, 0),
                                          1,
                                        ),
                                      }
                                    : item,
                                ),
                              )
                            }
                            className={inputClassName()}
                          />
                        </label>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4 rounded-[28px] bg-pearl p-5 lg:col-span-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-lg font-semibold text-ink">Resurs birliklari</p>
                  <p className="mt-1 text-sm leading-6 text-ink/58">
                    Sayt va Telegram botda ko'rinadigan haqiqiy xona va tapchan birliklari shu yerda boshqariladi.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void runAction(saveResources, "Resurslar saqlandi.")}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-pine"
                >
                  <Save size={16} />
                  Resurslarni saqlash
                </button>
              </div>

              <div className="grid gap-4 rounded-[24px] border border-black/8 bg-white/85 p-4 lg:grid-cols-[0.9fr_1.1fr_0.65fr_auto_auto]">
                <label className="space-y-2 text-sm text-ink/70">
                  <span>Turi</span>
                  <select
                    value={newResourceForm.type}
                    onChange={(event) =>
                      setNewResourceForm((current) => ({
                        ...current,
                        type: event.target.value as ResourceType,
                      }))
                    }
                    className={inputClassName()}
                  >
                    {resourceTypeOptions.map((resourceType) => (
                      <option key={resourceType} value={resourceType}>
                        {pricingRuleLabel(resourceType)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2 text-sm text-ink/70">
                  <span>Yangi resurs nomi</span>
                  <input
                    value={newResourceForm.name}
                    onChange={(event) =>
                      setNewResourceForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Masalan: Kichik xona 3"
                    className={inputClassName()}
                  />
                </label>

                <label className="space-y-2 text-sm text-ink/70">
                  <span>Sig'imi</span>
                  <input
                    type="number"
                    min={1}
                    value={newResourceForm.capacity}
                    onChange={(event) =>
                      setNewResourceForm((current) => ({
                        ...current,
                        capacity: Math.max(Number(event.target.value || 0), 1),
                      }))
                    }
                    className={inputClassName()}
                  />
                </label>

                <label className="flex items-end gap-3 rounded-[20px] border border-black/8 bg-pearl/60 px-4 py-3 text-sm text-ink/70">
                  <input
                    type="checkbox"
                    checked={newResourceForm.is_active}
                    onChange={(event) =>
                      setNewResourceForm((current) => ({
                        ...current,
                        is_active: event.target.checked,
                      }))
                    }
                  />
                  <span>Faol</span>
                </label>

                <button
                  type="button"
                  disabled={working}
                  onClick={() => void runAction(createResource, "Yangi resurs qo'shildi.")}
                  className="inline-flex items-center justify-center gap-2 self-end rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-pine disabled:cursor-not-allowed disabled:bg-ink/60"
                >
                  <Plus size={16} />
                  Resurs qo'shish
                </button>
              </div>

              <div className="grid gap-4">
                {resources.map((resource) => (
                  <div key={resource.id} className="rounded-[24px] border border-black/8 bg-white/85 p-4">
                    <div className="grid gap-3 lg:grid-cols-[1.1fr_0.7fr_0.6fr_0.5fr]">
                      <label className="space-y-2 text-sm text-ink/70">
                        <span>Nomi</span>
                        <input
                          value={resource.name}
                          onChange={(event) =>
                            setResources((current) =>
                              current.map((item) =>
                                item.id === resource.id ? { ...item, name: event.target.value } : item,
                              ),
                            )
                          }
                          className={inputClassName()}
                        />
                      </label>

                      <label className="space-y-2 text-sm text-ink/70">
                        <span>Turi</span>
                        <input value={pricingRuleLabel(resource.type)} disabled className={inputClassName()} />
                      </label>

                      <label className="space-y-2 text-sm text-ink/70">
                        <span>Sig'imi</span>
                        <input
                          type="number"
                          min={1}
                          value={resource.capacity}
                          onChange={(event) =>
                            setResources((current) =>
                              current.map((item) =>
                                item.id === resource.id
                                  ? { ...item, capacity: Math.max(Number(event.target.value || 0), 1) }
                                  : item,
                              ),
                            )
                          }
                          className={inputClassName()}
                        />
                      </label>

                      <label className="flex items-end gap-3 rounded-[20px] border border-black/8 bg-pearl/60 px-4 py-3 text-sm text-ink/70">
                        <input
                          type="checkbox"
                          checked={resource.is_active}
                          onChange={(event) =>
                            setResources((current) =>
                              current.map((item) =>
                                item.id === resource.id ? { ...item, is_active: event.target.checked } : item,
                              ),
                            )
                          }
                        />
                        <span>Faol</span>
                      </label>
                    </div>
                  </div>
                ))}

                {resources.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-black/10 bg-white/70 p-5 text-sm text-ink/58">
                    Resurs birliklari topilmadi.
                  </div>
                ) : null}
              </div>
            </div>

            <div className="space-y-4 rounded-[28px] bg-pearl p-5 lg:col-span-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-lg font-semibold text-ink">Servis rasmlari</p>
                  <p className="mt-1 text-sm leading-6 text-ink/58">
                    Har bir xizmat turi uchun ko'rinadigan asosiy rasmni shu yerdan yuklang, almashtiring yoki o'chiring.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                {serviceResourceTypes.map((resourceType) => {
                  const currentAsset = serviceMediaByType[resourceType];
                  const pendingFile = serviceImageDrafts[resourceType];

                  return (
                    <div key={resourceType} className="rounded-[24px] border border-black/8 bg-white/85 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-ink">{pricingRuleLabel(resourceType)}</p>
                          <p className="mt-1 text-xs text-ink/45">{resourceType}</p>
                        </div>
                        <span className="rounded-full bg-pearl px-3 py-1 text-xs text-ink/60">
                          {currentAsset ? "Rasm biriktirilgan" : "Rasm yo'q"}
                        </span>
                      </div>

                      <div className="mt-4 overflow-hidden rounded-[20px] border border-black/6 bg-pearl/60">
                        {currentAsset ? (
                          <img src={currentAsset.url} alt={pricingRuleLabel(resourceType)} className="h-48 w-full object-cover" />
                        ) : (
                          <div className="flex h-48 items-center justify-center bg-[linear-gradient(135deg,#eef8f2_0%,#f5f7fb_55%,#fbf6ef_100%)] text-sm text-ink/45">
                            Hozircha servis rasmi yuklanmagan
                          </div>
                        )}
                      </div>

                      <label className="mt-4 block space-y-2 text-sm text-ink/70">
                        <span>Yangi rasm</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(event) =>
                            setServiceImageDrafts((current) => ({
                              ...current,
                              [resourceType]: event.target.files?.[0] ?? null,
                            }))
                          }
                          className={inputClassName()}
                        />
                        <p className="text-xs leading-5 text-ink/45">
                          {pendingFile ? `Tanlangan fayl: ${pendingFile.name}` : "Yangi rasm tanlasangiz, eski rasm almashtiriladi."}
                        </p>
                      </label>

                      <div className="mt-4 flex flex-wrap gap-3">
                        <button
                          type="button"
                          disabled={working || !pendingFile}
                          onClick={() => void replaceServiceImageForType(resourceType)}
                          className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-pine disabled:cursor-not-allowed disabled:bg-ink/60"
                        >
                          <Upload size={14} />
                          {currentAsset ? "Rasmni almashtirish" : "Rasmni yuklash"}
                        </button>
                        <button
                          type="button"
                          disabled={working || !currentAsset}
                          onClick={() => void deleteServiceImageForType(resourceType)}
                          className="inline-flex items-center justify-center gap-2 rounded-full border border-red-200 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Trash2 size={14} />
                          Rasmni o'chirish
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4 rounded-[28px] bg-pearl p-5 lg:col-span-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-lg font-semibold text-ink">Hero slider</p>
                  <p className="mt-1 text-sm leading-6 text-ink/58">
                    Yuklangan hero media ichidan public bosh sahifada chiqadigan slaydlarni tanlang va tartiblang.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {heroMedia.length > 0 ? (
                  heroMedia.map((item) => {
                    const isSelected = (siteSettings.hero_images ?? []).includes(item.id);
                    const orderIndex = (siteSettings.hero_images ?? []).indexOf(item.id);

                    return (
                      <div key={item.id} className="rounded-[24px] border border-black/8 bg-white/85 p-4">
                        <div className="overflow-hidden rounded-[20px]">
                          {isVideoUrl(item.url) ? (
                            <video src={item.url} controls className="h-40 w-full object-cover" />
                          ) : (
                            <img src={item.url} alt="Hero media" className="h-40 w-full object-cover" />
                          )}
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-ink">{isSelected ? `Slayd ${orderIndex + 1}` : "Tanlanmagan"}</p>
                            <p className="text-xs text-ink/45">{item.id}</p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setSiteSettings((current) => ({
                                  ...current,
                                  hero_images: isSelected
                                    ? (current.hero_images ?? []).filter((id) => id !== item.id)
                                    : [...(current.hero_images ?? []), item.id],
                                }))
                              }
                              className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-pearl"
                            >
                              {isSelected ? "Olib tashlash" : "Tanlash"}
                            </button>
                            {isSelected ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSiteSettings((current) => {
                                      const heroImages = [...(current.hero_images ?? [])];
                                      const index = heroImages.indexOf(item.id);

                                      if (index > 0) {
                                        [heroImages[index - 1], heroImages[index]] = [heroImages[index], heroImages[index - 1]];
                                      }

                                      return { ...current, hero_images: heroImages };
                                    })
                                  }
                                  className={iconButtonClassName()}
                                >
                                  <ArrowUp size={16} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSiteSettings((current) => {
                                      const heroImages = [...(current.hero_images ?? [])];
                                      const index = heroImages.indexOf(item.id);

                                      if (index >= 0 && index < heroImages.length - 1) {
                                        [heroImages[index], heroImages[index + 1]] = [heroImages[index + 1], heroImages[index]];
                                      }

                                      return { ...current, hero_images: heroImages };
                                    })
                                  }
                                  className={iconButtonClassName()}
                                >
                                  <ArrowDown size={16} />
                                </button>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-[24px] border border-dashed border-black/10 bg-white/70 p-6 text-sm text-ink/58 md:col-span-2">
                    Hero media hali yuklanmagan.
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4 rounded-[28px] bg-pearl p-5 lg:col-span-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-lg font-semibold text-ink">Xodimlar kontaktlari</p>
                  <p className="mt-1 text-sm leading-6 text-ink/58">
                    Telefon va Telegram ma'lumotlari public saytda chiqadi.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setSiteSettings((current) => ({
                      ...current,
                      contact_people: [...(current.contact_people ?? []), createEmptyContact()],
                    }))
                  }
                  className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-white/80"
                >
                  Kontakt qo'shish
                </button>
              </div>

              <div className="grid gap-4">
                {(siteSettings.contact_people ?? []).map((contact) => (
                  <div key={contact.id} className="grid gap-4 rounded-[24px] border border-black/8 bg-white/80 p-4 lg:grid-cols-2">
                    <label className="space-y-2 text-sm text-ink/70">
                      <span>Ism</span>
                      <input
                        value={contact.name}
                        onChange={(event) =>
                          setSiteSettings((current) => ({
                            ...current,
                            contact_people: (current.contact_people ?? []).map((item) =>
                              item.id === contact.id ? { ...item, name: event.target.value } : item,
                            ),
                          }))
                        }
                        className={inputClassName()}
                      />
                    </label>

                    <label className="space-y-2 text-sm text-ink/70">
                      <span>Lavozim</span>
                      <input
                        value={contact.role}
                        onChange={(event) =>
                          setSiteSettings((current) => ({
                            ...current,
                            contact_people: (current.contact_people ?? []).map((item) =>
                              item.id === contact.id ? { ...item, role: event.target.value } : item,
                            ),
                          }))
                        }
                        className={inputClassName()}
                      />
                    </label>

                    <label className="space-y-2 text-sm text-ink/70">
                      <span>Telefon</span>
                      <input
                        value={contact.phone}
                        onChange={(event) =>
                          setSiteSettings((current) => ({
                            ...current,
                            contact_people: (current.contact_people ?? []).map((item) =>
                              item.id === contact.id ? { ...item, phone: event.target.value } : item,
                            ),
                          }))
                        }
                        className={inputClassName()}
                      />
                    </label>

                    <label className="space-y-2 text-sm text-ink/70">
                      <span>Telegram</span>
                      <input
                        value={contact.telegram}
                        onChange={(event) =>
                          setSiteSettings((current) => ({
                            ...current,
                            contact_people: (current.contact_people ?? []).map((item) =>
                              item.id === contact.id ? { ...item, telegram: event.target.value } : item,
                            ),
                          }))
                        }
                        className={inputClassName()}
                      />
                    </label>

                    <div className="flex items-center justify-between rounded-[20px] bg-pearl/70 px-4 py-3 lg:col-span-2">
                      <div className="flex flex-wrap gap-2 text-xs text-ink/45">
                        {contact.phone ? (
                          <a href={getPhoneLink(contact.phone)} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-2 text-ink">
                            <Phone size={12} />
                            Qo'ng'iroq
                          </a>
                        ) : null}
                        {contact.telegram ? (
                          <a
                            href={getTelegramProfileLink(contact.telegram)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-2 text-ink"
                          >
                            <MessageCircleMore size={12} />
                            Telegram
                          </a>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setSiteSettings((current) => ({
                            ...current,
                            contact_people: (current.contact_people ?? []).filter((item) => item.id !== contact.id),
                          }))
                        }
                        className="inline-flex items-center gap-2 rounded-full border border-red-200 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50"
                      >
                        <Trash2 size={14} />
                        O'chirish
                      </button>
                    </div>
                  </div>
                ))}

                {(siteSettings.contact_people ?? []).length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-black/10 bg-white/70 p-6 text-sm text-ink/58">
                    Hali xodim kontaktlari qo'shilmagan.
                  </div>
                ) : null}
              </div>
            </div>

            <button
              type="submit"
              disabled={working}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-pine disabled:cursor-not-allowed disabled:bg-ink/60"
            >
              {working ? <LoaderCircle className="animate-spin" size={16} /> : <Save size={16} />}
              Sayt sozlamalarini saqlash
            </button>
          </form>
        </SectionCard>
        </section>
        ) : null}

        {activeAdminSection === "media" ? (
        <section id="media-upload" className="scroll-mt-28">
        <SectionCard
          title="Media boshqaruvi"
          description="Hero, galereya, servis va paket rasmlarini shu yerdan yuklang va o'chiring."
        >
          <form className="space-y-4 rounded-[28px] bg-pearl p-5" onSubmit={handleMediaUpload}>
            <h3 className="text-lg font-semibold text-ink">Hero va galereya media</h3>
            <label className="space-y-2 text-sm text-ink/70">
              <span>Bo'lim</span>
              <select
                value={mediaForm.kind}
                onChange={(event) =>
                  setMediaForm((current) => ({
                    ...current,
                    kind: event.target.value as MediaUploadKind,
                  }))
                }
                className={inputClassName()}
              >
                <option value="hero">Hero</option>
                <option value="gallery">Gallery</option>
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
              Media yuklash
            </button>
          </form>

          <form className="mt-6 space-y-4 rounded-[28px] bg-pearl p-5" onSubmit={handlePackageImageUpload}>
            <h3 className="text-lg font-semibold text-ink">Paket rasmi yuklash</h3>
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
              <span>Paket rasmlari</span>
              <input
                required
                type="file"
                multiple
                accept="image/*"
                onChange={(event) =>
                  setPackageImageForm((current) => ({
                    ...current,
                    files: Array.from(event.target.files ?? []),
                  }))
                }
                className={inputClassName()}
              />
              <p className="text-xs leading-5 text-ink/45">Bir nechta rasmni birdan yuklash mumkin.</p>
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

          <form className="mt-6 space-y-4 rounded-[28px] bg-pearl p-5" onSubmit={handleServiceImageUpload}>
            <h3 className="text-lg font-semibold text-ink">Servis rasmi yuklash</h3>
            <label className="space-y-2 text-sm text-ink/70">
              <span>Resurs turi</span>
              <select
                value={serviceImageForm.resourceType}
                onChange={(event) =>
                  setServiceImageForm((current) => ({
                    ...current,
                    resourceType: event.target.value,
                  }))
                }
                className={inputClassName()}
              >
                <option value="">Resurs turini tanlang</option>
                {serviceResourceTypes.map((resourceType) => (
                  <option key={resourceType} value={resourceType}>
                    {pricingRuleLabel(resourceType)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm text-ink/70">
              <span>Servis rasmlari</span>
              <input
                required
                type="file"
                multiple
                accept="image/*"
                onChange={(event) =>
                  setServiceImageForm((current) => ({
                    ...current,
                    files: Array.from(event.target.files ?? []),
                  }))
                }
                className={inputClassName()}
              />
              <p className="text-xs leading-5 text-ink/45">Booking sahifasidagi servis kartalari shu rasmlardan foydalanadi.</p>
            </label>
            <button
              type="submit"
              disabled={working}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-pine disabled:cursor-not-allowed disabled:bg-ink/60"
            >
              {working ? <LoaderCircle className="animate-spin" size={16} /> : <Upload size={16} />}
              Servis rasmini yuklash
            </button>
          </form>
        </SectionCard>
        </section>
        ) : null}
      </div>
      ) : null}

      {activeAdminSection === "homepage" || activeAdminSection === "media" ? (
      <div className={cn("mt-6 grid gap-6", activeAdminSection === "media" ? "xl:grid-cols-[1.02fr_0.98fr]" : "grid-cols-1")}>
        {activeAdminSection === "homepage" ? (
        <section id="homepage-sections" className="scroll-mt-28">
        <SectionCard
          title="Bosh sahifa bo'limlari"
          description="Homepage sectionlarini yoqish/o'chirish, tahrirlash va tartiblash mumkin."
          action={
            <div className="flex flex-col gap-3 sm:flex-row">
              <select
                value={newSectionType}
                onChange={(event) => setNewSectionType(event.target.value as ContentSectionType)}
                className={inputClassName()}
              >
                {sectionTypeOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void handleCreateSection()}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-pine"
              >
                <Plus size={16} />
                Bo'lim qo'shish
              </button>
            </div>
          }
        >
          <div className="space-y-5">
            {orderedSections.map((section, index) => {
              const aboutStats = readAboutStats(section);
              const faqItems = readFaqItems(section);
              const places = readPlaces(section);

              return (
                <div key={section.id} className="rounded-[28px] border border-black/6 bg-gradient-to-br from-white to-pearl/70 p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-ink/70">
                          <GripVertical size={12} />
                          {getSectionTypeLabel(section.section_type)}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-3 py-1 text-xs font-medium",
                            section.is_enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600",
                          )}
                        >
                          {section.is_enabled ? "Yoqilgan" : "O'chirilgan"}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleMoveSection(section.id, "up")}
                        disabled={index === 0}
                        className="inline-flex items-center gap-2 rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-ink transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <ArrowUp size={14} />
                        Yuqoriga
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleMoveSection(section.id, "down")}
                        disabled={index === orderedSections.length - 1}
                        className="inline-flex items-center gap-2 rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-ink transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <ArrowDown size={14} />
                        Pastga
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateSectionState(section.id, (current) => ({
                            ...current,
                            is_enabled: !current.is_enabled,
                          }))
                        }
                        className="inline-flex items-center gap-2 rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-ink transition hover:bg-white"
                      >
                        {section.is_enabled ? "O'chirish" : "Yoqish"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSaveSection(section)}
                        className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-pine"
                      >
                        <Save size={14} />
                        Saqlash
                      </button>
                      <button
                        type="button"
                        onClick={() => void runAction(() => deleteHomeSection(section.id), "Bo'lim o'chirildi.")}
                        className="inline-flex items-center gap-2 rounded-full border border-red-200 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50"
                      >
                        <Trash2 size={14} />
                        O'chirish
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    <label className="space-y-2 text-sm text-ink/70">
                      <span>Eyebrow</span>
                      <input
                        value={section.eyebrow}
                        onChange={(event) =>
                          updateSectionState(section.id, (current) => ({
                            ...current,
                            eyebrow: event.target.value,
                          }))
                        }
                        className={inputClassName()}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-ink/70">
                      <span>Sarlavha</span>
                      <input
                        value={section.title}
                        onChange={(event) =>
                          updateSectionState(section.id, (current) => ({
                            ...current,
                            title: event.target.value,
                          }))
                        }
                        className={inputClassName()}
                      />
                    </label>
                    <label className="space-y-2 text-sm text-ink/70 lg:col-span-2">
                      <span>Tavsif</span>
                      <textarea
                        value={section.description}
                        onChange={(event) =>
                          updateSectionState(section.id, (current) => ({
                            ...current,
                            description: event.target.value,
                          }))
                        }
                        className={textareaClassName()}
                      />
                    </label>
                  </div>

                  {section.section_type === "about" ? (
                    <div className="mt-5 rounded-[24px] bg-white/80 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-ink">Ishonch ko'rsatkichlari</p>
                        <button
                          type="button"
                          onClick={() =>
                            updateSectionState(section.id, (current) => ({
                              ...current,
                              content: {
                                ...current.content,
                                stats: [...readAboutStats(current), createAboutStat()],
                              },
                            }))
                          }
                          className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-pearl"
                        >
                          Ko'rsatkich qo'shish
                        </button>
                      </div>

                      <div className="mt-4 grid gap-4">
                        {aboutStats.map((stat) => (
                          <div
                            key={stat.id}
                            className="grid gap-4 rounded-[20px] border border-black/8 bg-pearl/70 p-4 lg:grid-cols-[0.65fr_1fr_1.4fr_auto]"
                          >
                            <input
                              value={stat.value}
                              onChange={(event) =>
                                updateSectionState(section.id, (current) => ({
                                  ...current,
                                  content: {
                                    ...current.content,
                                    stats: readAboutStats(current).map((item) =>
                                      item.id === stat.id ? { ...item, value: event.target.value } : item,
                                    ),
                                  },
                                }))
                              }
                              placeholder="4+"
                              className={inputClassName()}
                            />
                            <input
                              value={stat.label}
                              onChange={(event) =>
                                updateSectionState(section.id, (current) => ({
                                  ...current,
                                  content: {
                                    ...current.content,
                                    stats: readAboutStats(current).map((item) =>
                                      item.id === stat.id ? { ...item, label: event.target.value } : item,
                                    ),
                                  },
                                }))
                              }
                              placeholder="Yillik tajriba"
                              className={inputClassName()}
                            />
                            <input
                              value={stat.description}
                              onChange={(event) =>
                                updateSectionState(section.id, (current) => ({
                                  ...current,
                                  content: {
                                    ...current.content,
                                    stats: readAboutStats(current).map((item) =>
                                      item.id === stat.id ? { ...item, description: event.target.value } : item,
                                    ),
                                  },
                                }))
                              }
                              placeholder="Qisqa izoh"
                              className={inputClassName()}
                            />
                            <div className="flex gap-2">
                              <select
                                value={stat.icon}
                                onChange={(event) =>
                                  updateSectionState(section.id, (current) => ({
                                    ...current,
                                    content: {
                                      ...current.content,
                                      stats: readAboutStats(current).map((item) =>
                                        item.id === stat.id
                                          ? { ...item, icon: event.target.value as AboutStat["icon"] }
                                          : item,
                                      ),
                                    },
                                  }))
                                }
                                className={inputClassName()}
                              >
                                <option value="calendar">calendar</option>
                                <option value="users">users</option>
                                <option value="shield">shield</option>
                                <option value="sparkles">sparkles</option>
                              </select>
                              <button
                                type="button"
                                onClick={() =>
                                  updateSectionState(section.id, (current) => ({
                                    ...current,
                                    content: {
                                      ...current.content,
                                      stats: readAboutStats(current).filter((item) => item.id !== stat.id),
                                    },
                                  }))
                                }
                                className="inline-flex items-center justify-center rounded-full border border-red-200 px-3 py-2 text-red-700 transition hover:bg-red-50"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {section.section_type === "faq" ? (
                    <div className="mt-5 rounded-[24px] bg-white/80 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-ink">FAQ savollari</p>
                        <button
                          type="button"
                          onClick={() =>
                            updateSectionState(section.id, (current) => ({
                              ...current,
                              content: {
                                ...current.content,
                                items: [...readFaqItems(current), createFaqItem()],
                              },
                            }))
                          }
                          className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-pearl"
                        >
                          Savol qo'shish
                        </button>
                      </div>

                      <div className="mt-4">
                        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
                          <label className="space-y-2 text-sm text-ink/70">
                            <span>CTA tugma matni</span>
                            <input
                              value={readFaqCtaLabel(section)}
                              onChange={(event) =>
                                updateSectionState(section.id, (current) => ({
                                  ...current,
                                  content: {
                                    ...current.content,
                                    cta_label: event.target.value,
                                  },
                                }))
                              }
                              placeholder="Boshqa savolingiz bormi? Telegramdan so'rang"
                              className={inputClassName()}
                            />
                          </label>

                          <label className="space-y-2 text-sm text-ink/70">
                            <span>Redirect URL</span>
                            <input
                              value={readFaqCtaUrl(section)}
                              onChange={(event) =>
                                updateSectionState(section.id, (current) => ({
                                  ...current,
                                  content: {
                                    ...current.content,
                                    cta_url: event.target.value,
                                  },
                                }))
                              }
                              placeholder="https://t.me/..."
                              className={inputClassName()}
                            />
                            <p className="text-xs leading-5 text-ink/45">
                              Telegram username (`@username`) yoki to'liq havola kiriting.
                            </p>
                          </label>

                          <div className="flex items-end">
                            <button
                              type="button"
                              onClick={() =>
                                updateSectionState(section.id, (current) => ({
                                  ...current,
                                  content: {
                                    ...current.content,
                                    cta_url: "",
                                  },
                                }))
                              }
                              className="inline-flex w-full items-center justify-center rounded-full border border-red-200 px-4 py-3 text-sm font-medium text-red-700 transition hover:bg-red-50"
                            >
                              URL olib tashlash
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-4">
                        {faqItems.map((item) => (
                          <div key={item.id} className="grid gap-4 rounded-[20px] border border-black/8 bg-pearl/70 p-4">
                            <input
                              value={item.question}
                              onChange={(event) =>
                                updateSectionState(section.id, (current) => ({
                                  ...current,
                                  content: {
                                    ...current.content,
                                    items: readFaqItems(current).map((faqItem) =>
                                      faqItem.id === item.id ? { ...faqItem, question: event.target.value } : faqItem,
                                    ),
                                  },
                                }))
                              }
                              placeholder="Savol"
                              className={inputClassName()}
                            />
                            <textarea
                              value={item.answer}
                              onChange={(event) =>
                                updateSectionState(section.id, (current) => ({
                                  ...current,
                                  content: {
                                    ...current.content,
                                    items: readFaqItems(current).map((faqItem) =>
                                      faqItem.id === item.id ? { ...faqItem, answer: event.target.value } : faqItem,
                                    ),
                                  },
                                }))
                              }
                              placeholder="Javob"
                              className={textareaClassName()}
                            />
                            <button
                              type="button"
                              onClick={() =>
                                updateSectionState(section.id, (current) => ({
                                  ...current,
                                  content: {
                                    ...current.content,
                                    items: readFaqItems(current).filter((faqItem) => faqItem.id !== item.id),
                                  },
                                }))
                              }
                              className="inline-flex w-fit items-center justify-center rounded-full border border-red-200 px-4 py-2 text-red-700 transition hover:bg-red-50"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {section.section_type === "sightseeing" ? (
                    <div className="mt-5 rounded-[24px] bg-white/80 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-ink">Sightseeing joylari</p>
                        <button
                          type="button"
                          onClick={() =>
                            updateSectionState(section.id, (current) => ({
                              ...current,
                              content: {
                                ...current.content,
                                places: [...readPlaces(current), createSightseeingPlace()],
                              },
                            }))
                          }
                          className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-pearl"
                        >
                          Joy qo'shish
                        </button>
                      </div>

                      <div className="mt-4 grid gap-4">
                        {places.map((place) => (
                          <div key={place.id} className="grid gap-4 rounded-[20px] border border-black/8 bg-pearl/70 p-4 lg:grid-cols-[1fr_1.3fr_auto]">
                            <input
                              value={place.name}
                              onChange={(event) =>
                                updateSectionState(section.id, (current) => ({
                                  ...current,
                                  content: {
                                    ...current.content,
                                    places: readPlaces(current).map((item) =>
                                      item.id === place.id ? { ...item, name: event.target.value } : item,
                                    ),
                                  },
                                }))
                              }
                              placeholder="Joy nomi"
                              className={inputClassName()}
                            />
                            <input
                              value={place.description}
                              onChange={(event) =>
                                updateSectionState(section.id, (current) => ({
                                  ...current,
                                  content: {
                                    ...current.content,
                                    places: readPlaces(current).map((item) =>
                                      item.id === place.id ? { ...item, description: event.target.value } : item,
                                    ),
                                  },
                                }))
                              }
                              placeholder="Qisqa tavsif"
                              className={inputClassName()}
                            />
                            <button
                              type="button"
                              onClick={() =>
                                updateSectionState(section.id, (current) => ({
                                  ...current,
                                  content: {
                                    ...current.content,
                                    places: readPlaces(current).filter((item) => item.id !== place.id),
                                  },
                                }))
                              }
                              className="inline-flex items-center justify-center rounded-full border border-red-200 px-3 py-2 text-red-700 transition hover:bg-red-50"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}

            {orderedSections.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-black/10 bg-pearl/60 p-8 text-sm text-ink/55">
                Hozircha homepage bo'limlari mavjud emas.
              </div>
            ) : null}
          </div>
        </SectionCard>
        </section>
        ) : null}

        {activeAdminSection === "media" ? (
        <section id="media-library" className="scroll-mt-28">
        <SectionCard
          title="Yuklangan media"
          description="Media fayllarni kategoriyalar bo'yicha ko'ring va kerak bo'lsa o'chiring."
        >
          <div className="space-y-6">
            {[
              { title: "Hero media", items: heroMedia },
              { title: "Gallery media", items: galleryMedia },
              { title: "Service media", items: serviceMedia },
              { title: "Package media", items: packageMedia },
            ].map((group) => (
              <div key={group.title}>
                <p className="mb-3 text-sm font-medium text-ink">{group.title}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {group.items.map((item) => (
                    <div key={item.id} className="overflow-hidden rounded-[28px] border border-black/5 bg-pearl">
                      {isVideoUrl(item.url) ? (
                        <video src={item.url} controls className="h-44 w-full object-cover" />
                      ) : (
                        <img src={item.url} alt={group.title} className="h-44 w-full object-cover" />
                      )}
                      <div className="flex items-center justify-between gap-3 p-4">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink">{item.id}</p>
                          {item.package_id ? (
                            <p className="mt-1 text-xs text-ink/45">Paket ID: {item.package_id}</p>
                          ) : null}
                          {item.resource_type ? (
                            <p className="mt-1 text-xs text-ink/45">Resurs turi: {pricingRuleLabel(String(item.resource_type))}</p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleDeleteMedia(item)}
                          className="inline-flex items-center gap-2 rounded-full border border-red-200 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50"
                        >
                          <Trash2 size={14} />
                          O'chirish
                        </button>
                      </div>
                    </div>
                  ))}
                  {group.items.length === 0 ? (
                    <div className="rounded-[28px] border border-dashed border-black/10 bg-pearl/60 p-8 text-sm text-ink/55 sm:col-span-2">
                      Hozircha media yo'q.
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
        </section>
        ) : null}
      </div>
      ) : null}

      {activeAdminSection === "packages" ? (
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.04fr_0.96fr]">
        <section id="package-editor" className="scroll-mt-28">
        <SectionCard
          title={editingPackageId ? "Paketni tahrirlash" : "Paket yaratish"}
          description="Yangi paketlar va ularning narxlarini boshqaring."
        >
          <form className="grid gap-4 lg:grid-cols-2" onSubmit={handlePackageSubmit}>
            {editingPackage ? (
              <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900 lg:col-span-2">
                <p className="font-medium">{editingPackage.name} paketi tahrir qilinmoqda.</p>
                <p className="mt-1 text-amber-800/80">
                  Hozirgi rasmlar: {editingPackage.images.length} ta. Yangi rasmlar qo'shsangiz, ular mavjud galereyaga
                  qo'shiladi.
                </p>
              </div>
            ) : null}

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

            <label className="space-y-2 text-sm text-ink/70 lg:col-span-2">
              <span>Tavsif</span>
              <textarea
                required
                value={packageForm.description}
                onChange={(event) =>
                  setPackageForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                className={textareaClassName()}
              />
            </label>

            <label className="space-y-2 text-sm text-ink/70">
              <span>Asosiy narx</span>
              <input
                required
                type="number"
                min={0}
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
              <span>Har mehmon uchun</span>
              <input
                required
                type="number"
                min={0}
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

            <label className="space-y-2 text-sm text-ink/70">
              <span>Maksimal sig'im</span>
              <input
                required
                type="number"
                min={1}
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

            <label className="space-y-2 text-sm text-ink/70">
              <span>Paket rasmlari</span>
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={(event) => setPackageImageFiles(Array.from(event.target.files ?? []))}
                className={inputClassName()}
              />
              <p className="text-xs leading-5 text-ink/45">Yangi paketga bir nechta rasm birga biriktiriladi.</p>
            </label>

            <div className="flex flex-wrap gap-3 lg:col-span-2">
              <button
                type="submit"
                disabled={working}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-pine disabled:cursor-not-allowed disabled:bg-ink/60"
              >
                {working ? <LoaderCircle className="animate-spin" size={16} /> : null}
                {editingPackageId ? "O'zgarishlarni saqlash" : "Paket yaratish"}
              </button>
              {editingPackageId ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditingPackageId(null);
                    setPackageForm(createEmptyPackage());
                    setPackageImageFiles([]);
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-black/10 px-5 py-3 text-sm font-medium text-ink transition hover:bg-pearl"
                >
                  <X size={16} />
                  Bekor qilish
                </button>
              ) : null}
            </div>
          </form>
        </SectionCard>
        </section>

        <section id="package-list" className="scroll-mt-28">
        <SectionCard
          title="Paketlar ro'yxati"
          description="Paketlarni tahrirlang yoki o'chiring."
        >
          <div className="grid gap-4">
            {packages.map((item) => (
              <div key={item.id} className="rounded-[28px] border border-black/6 bg-gradient-to-br from-white to-pearl/70 p-5">
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
                        setActiveAdminSection("packages");
                        setEditingPackageId(item.id);
                        setPackageImageFiles([]);
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
        </section>
      </div>
      ) : null}

      {activeAdminSection === "bookings" ? (
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <section id="bookings" className="scroll-mt-28">
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
              <div key={booking.id} className="rounded-[28px] border border-black/6 bg-gradient-to-br from-white to-pearl/70 p-5">
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
                          {booking.booking_label || booking.package_name || booking.package_id}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-white/85 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-ink/40">Narx</p>
                        <p className="mt-2 text-sm font-medium text-ink">{formatCurrency(booking.estimated_price)}</p>
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
                    {booking.status === "proof_submitted" || booking.status === "pending" ? (
                      <button
                        type="button"
                        onClick={() =>
                          void runAction(() => updateBookingStatus(booking.id, "confirmed"), "Bron tasdiqlandi.")
                        }
                        className="inline-flex items-center gap-1 rounded-full border border-emerald-200 px-4 py-2 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50"
                      >
                        <Check size={14} />
                        Tasdiqlash
                      </button>
                    ) : null}
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
        </section>

        <section id="quick-view" className="scroll-mt-28">
        <SectionCard
          title="Tezkor ko'rinish"
          description="So'nggi bronlar va media taqsimotini qisqacha ko'rsatadi."
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
                    <p className="mt-2 text-sm text-white/70">{booking.booking_label || booking.package_name || booking.package_id}</p>
                    <p className="mt-1 text-xs text-white/55">{formatBookingDates(booking)}</p>
                  </div>
                ))}
                {recentBookings.length === 0 ? (
                  <p className="text-sm text-white/65">Bronlar paydo bo'lgach shu yerda ko'rinadi.</p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[28px] border border-black/6 bg-pearl/70 p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-ink/35">Hero</p>
                <p className="mt-3 text-3xl font-semibold text-ink">{heroMedia.length}</p>
              </div>
              <div className="rounded-[28px] border border-black/6 bg-pearl/70 p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-ink/35">Galereya</p>
                <p className="mt-3 text-3xl font-semibold text-ink">{galleryMedia.length}</p>
              </div>
              <div className="rounded-[28px] border border-black/6 bg-pearl/70 p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-ink/35">Servis rasmlari</p>
                <p className="mt-3 text-3xl font-semibold text-ink">{serviceMedia.length}</p>
              </div>
              <div className="rounded-[28px] border border-black/6 bg-pearl/70 p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-ink/35">Paket rasmlari</p>
                <p className="mt-3 text-3xl font-semibold text-ink">{packageMedia.length}</p>
              </div>
            </div>
          </div>
        </SectionCard>
        </section>
      </div>
      ) : null}
        </div>
      </div>
    </div>
  );
}
