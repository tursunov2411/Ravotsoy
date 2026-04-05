import type { Session } from "@supabase/supabase-js";
import { mockBookings, mockGallery, mockHomeSections, mockPackages, mockSiteSettings } from "./mockData";
import { hasSupabaseConfig, supabase } from "./supabase";
import type {
  BookingRecord,
  BookingQuote,
  BookingStatus,
  ContentSection,
  ContentSectionType,
  MediaAsset,
  MediaKind,
  PaymentConfig,
  PricingRuleRecord,
  PublicContact,
  PackageInput,
  PackageRecord,
  ResourceRecord,
  ResourceSelection,
  SightseeingPlace,
  SiteSettings,
  TelegramPrefillResult,
  TripBuilderOption,
} from "./types";

type BookingCreateResult = {
  ok?: boolean;
  success: boolean;
  available?: boolean;
  message?: string;
  bookingId?: string;
  totalPrice?: number;
  payment?: PaymentConfig;
  booking?: {
    booking_label?: string;
    resource_summary?: string;
  };
};

type TelegramPrefillApiResult = {
  ok?: boolean;
  error?: string;
  token?: string;
  expiresAt?: string;
  quote?: BookingQuote;
};

type BookingProofResult = {
  ok?: boolean;
  error?: string;
  context?: {
    booking?: {
      id: string;
      status: string;
      payment_status: string;
    };
  };
};

function ensureSupabase() {
  if (!supabase) {
    throw new Error("Supabase sozlanmagan.");
  }

  return supabase;
}

const packageImagesBucket = "package-images";
const defaultMediaBucket = "media";
const backendUrl = import.meta.env.VITE_BACKEND_URL?.replace(/\/$/, "") || "http://localhost:3001";

function parseContactPeople(value: unknown): PublicContact[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = item as Record<string, unknown>;
      const name = String(record.name ?? "").trim();
      const role = String(record.role ?? "").trim();
      const phone = String(record.phone ?? "").trim();
      const telegram = String(record.telegram ?? "").trim();

      if (!name && !role && !phone && !telegram) {
        return null;
      }

      return {
        id: String(record.id ?? crypto.randomUUID()),
        name,
        role,
        phone,
        telegram,
      } satisfies PublicContact;
    })
    .filter((item): item is PublicContact => Boolean(item));
}

function parseSightseeingPlaces(value: unknown): SightseeingPlace[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = item as Record<string, unknown>;
      const name = String(record.name ?? "").trim();
      const description = String(record.description ?? "").trim();

      if (!name && !description) {
        return null;
      }

      return {
        id: String(record.id ?? crypto.randomUUID()),
        name,
        description,
      } satisfies SightseeingPlace;
    })
    .filter((item): item is SightseeingPlace => Boolean(item));
}

function parseHeroImages(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function parseSectionType(value: unknown): ContentSectionType {
  const type = String(value ?? "");

  if (
    type === "about" ||
    type === "faq" ||
    type === "packages" ||
    type === "gallery" ||
    type === "sightseeing" ||
    type === "contacts"
  ) {
    return type;
  }

  if (type === "highlights") {
    return "faq";
  }

  return "about";
}

function parseContentSection(item: Record<string, unknown>): ContentSection {
  return {
    id: String(item.id),
    page: "home",
    section_type: parseSectionType(item.section_type),
    eyebrow: String(item.eyebrow ?? ""),
    title: String(item.title ?? ""),
    description: String(item.description ?? ""),
    content: (item.content as Record<string, unknown> | null) ?? {},
    sort_order: Number(item.sort_order ?? 0),
    is_enabled: Boolean(item.is_enabled),
  };
}

export async function getPackages() {
  if (!hasSupabaseConfig) {
    return mockPackages;
  }

  const client = ensureSupabase();
  const { data, error } = await client
    .from("packages")
    .select("id, name, description, type, base_price, price_per_guest, max_guests, resource_type, resource_quantity, media(url)")
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data as Array<Record<string, unknown>>).map((item) => ({
    id: String(item.id),
    name: String(item.name),
    description: String(item.description),
    type: item.type as PackageRecord["type"],
    base_price: Number(item.base_price),
    price_per_guest: Number(item.price_per_guest),
    max_guests: Number(item.max_guests),
    resource_type: item.resource_type ? String(item.resource_type) as PackageRecord["resource_type"] : undefined,
    resource_quantity: item.resource_quantity ? Number(item.resource_quantity) : undefined,
    images: Array.isArray(item.media)
      ? item.media
          .map((image) => String((image as { url?: string }).url ?? ""))
          .filter(Boolean)
      : [],
  }));
}

export async function upsertPackage(id: string | null, payload: PackageInput) {
  if (!hasSupabaseConfig) {
    return {
      id: id ?? crypto.randomUUID(),
      ...payload,
      images: [],
    } satisfies PackageRecord;
  }

  const client = ensureSupabase();
  const basePayload = {
    name: payload.name,
    description: payload.description,
    type: payload.type,
    base_price: payload.base_price,
    price_per_guest: payload.price_per_guest,
    max_guests: payload.max_guests,
  };

  const query = id
    ? client
        .from("packages")
        .update(basePayload)
        .eq("id", id)
        .select("id")
        .maybeSingle()
    : client
        .from("packages")
        .insert({ id: crypto.randomUUID(), ...basePayload })
        .select("id, name, description, type, base_price, price_per_guest, max_guests")
        .single();

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  if (id) {
    return {
      id,
      name: basePayload.name,
      description: basePayload.description,
      type: basePayload.type as PackageRecord["type"],
      base_price: Number(basePayload.base_price),
      price_per_guest: Number(basePayload.price_per_guest),
      max_guests: Number(basePayload.max_guests),
      images: [],
    } satisfies PackageRecord;
  }

  const insertedData = data as {
    id: string;
    name: string;
    description: string;
    type: string;
    base_price: number;
    price_per_guest: number;
    max_guests: number;
  };

  return {
    id: String(insertedData.id),
    name: String(insertedData.name),
    description: String(insertedData.description),
    type: insertedData.type as PackageRecord["type"],
    base_price: Number(insertedData.base_price),
    price_per_guest: Number(insertedData.price_per_guest),
    max_guests: Number(insertedData.max_guests),
    images: [],
  } satisfies PackageRecord;
}

export async function deletePackage(id: string) {
  if (!hasSupabaseConfig) {
    return;
  }

  const client = ensureSupabase();
  const { data: packageMedia, error: packageMediaError } = await client
    .from("media")
    .select("storage_path")
    .eq("package_id", id);

  if (packageMediaError) {
    throw packageMediaError;
  }

  const storagePaths = (Array.isArray(packageMedia) ? packageMedia : [])
    .map((item) => String(item.storage_path ?? "").trim())
    .filter(Boolean);

  if (storagePaths.length > 0) {
    const { error: storageError } = await client.storage.from(packageImagesBucket).remove(storagePaths);

    if (storageError) {
      console.error(storageError);
    }
  }

  const { error: bookingError } = await client
    .from("bookings")
    .update({ package_id: null })
    .eq("package_id", id);

  if (bookingError) {
    throw bookingError;
  }

  const { error: mediaDeleteError } = await client.from("media").delete().eq("package_id", id);

  if (mediaDeleteError) {
    throw mediaDeleteError;
  }

  const { error } = await client.from("packages").delete().eq("id", id);

  if (error) {
    throw error;
  }
}

export async function getMediaAssets() {
  if (!hasSupabaseConfig) {
    return mockGallery;
  }

  const client = ensureSupabase();
  const { data, error } = await client
    .from("media")
    .select("id, type, url, package_id, storage_path")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data as MediaAsset[]).map((item) => ({
    id: item.id,
    type: item.type,
    url: item.url,
    package_id: item.package_id,
    storage_path: item.storage_path ?? null,
  }));
}

export async function getSiteSettings() {
  if (!hasSupabaseConfig) {
    return mockSiteSettings;
  }

  const client = ensureSupabase();
  const { data, error } = await client
    .from("site_settings")
    .select(
      "id, hotel_name, description, location_url, about_text, hero_images, contact_people, payment_card_number, payment_card_holder, payment_instructions, payment_manager_telegram, payment_deposit_ratio",
    )
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return mockSiteSettings;
  }

  return {
    id: Number(data.id),
    hotel_name: data.hotel_name ? String(data.hotel_name) : "",
    location_url: String(data.location_url ?? ""),
    description: data.description ? String(data.description) : "",
    about_text: data.about_text ? String(data.about_text) : "",
    hero_images: parseHeroImages(data.hero_images),
    contact_people: parseContactPeople(data.contact_people),
    payment_card_number: data.payment_card_number ? String(data.payment_card_number) : "",
    payment_card_holder: data.payment_card_holder ? String(data.payment_card_holder) : "",
    payment_instructions: data.payment_instructions ? String(data.payment_instructions) : "",
    payment_manager_telegram: data.payment_manager_telegram ? String(data.payment_manager_telegram) : "",
    payment_deposit_ratio: Number(data.payment_deposit_ratio ?? 0.3),
  } satisfies SiteSettings;
}

export async function upsertSiteSettings(payload: Omit<SiteSettings, "id">) {
  if (!hasSupabaseConfig) {
    return {
      id: 1,
      ...payload,
    } satisfies SiteSettings;
  }

  const client = ensureSupabase();
  const { data, error } = await client
    .from("site_settings")
    .upsert(
      {
        id: 1,
        hotel_name: payload.hotel_name || null,
        location_url: payload.location_url,
        description: payload.description || null,
        about_text: payload.about_text || null,
        hero_images: payload.hero_images ?? [],
        contact_people: payload.contact_people ?? [],
        payment_card_number: payload.payment_card_number || null,
        payment_card_holder: payload.payment_card_holder || null,
        payment_instructions: payload.payment_instructions || null,
        payment_manager_telegram: payload.payment_manager_telegram || null,
        payment_deposit_ratio: payload.payment_deposit_ratio ?? 0.3,
      },
      { onConflict: "id" },
    )
    .select(
      "id, hotel_name, description, location_url, about_text, hero_images, contact_people, payment_card_number, payment_card_holder, payment_instructions, payment_manager_telegram, payment_deposit_ratio",
    )
    .single();

  if (error) {
    throw error;
  }

  return {
    id: Number(data.id),
    hotel_name: data.hotel_name ? String(data.hotel_name) : "",
    location_url: String(data.location_url ?? ""),
    description: data.description ? String(data.description) : "",
    about_text: data.about_text ? String(data.about_text) : "",
    hero_images: parseHeroImages(data.hero_images),
    contact_people: parseContactPeople(data.contact_people),
    payment_card_number: data.payment_card_number ? String(data.payment_card_number) : "",
    payment_card_holder: data.payment_card_holder ? String(data.payment_card_holder) : "",
    payment_instructions: data.payment_instructions ? String(data.payment_instructions) : "",
    payment_manager_telegram: data.payment_manager_telegram ? String(data.payment_manager_telegram) : "",
    payment_deposit_ratio: Number(data.payment_deposit_ratio ?? 0.3),
  } satisfies SiteSettings;
}

export async function getTripBuilderOptions() {
  if (!hasSupabaseConfig) {
    return [] satisfies TripBuilderOption[];
  }

  const response = await fetch(`${backendUrl}/api/trip-builder/options`);
  const result = (await response.json()) as { ok?: boolean; error?: string; options?: TripBuilderOption[] };

  if (!response.ok || !result.ok) {
    throw new Error(result.error || "Resurslarni yuklab bo'lmadi.");
  }

  return Array.isArray(result.options) ? result.options : [];
}

export async function getPricingRules() {
  if (!hasSupabaseConfig) {
    return [] satisfies PricingRuleRecord[];
  }

  const client = ensureSupabase();
  const { data, error } = await client
    .from("pricing_rules")
    .select(
      "resource_type, base_price, price_per_extra_person, max_included_people, discount_if_excluded, includes_tapchan",
    )
    .order("resource_type", { ascending: true });

  if (error) {
    throw error;
  }

  return (data as Array<Record<string, unknown>>).map((item) => ({
    resource_type: String(item.resource_type ?? ""),
    base_price: Number(item.base_price ?? 0),
    price_per_extra_person: Number(item.price_per_extra_person ?? 0),
    max_included_people: Number(item.max_included_people ?? 0),
    discount_if_excluded: Number(item.discount_if_excluded ?? 0),
    includes_tapchan: Boolean(item.includes_tapchan),
  }));
}

export async function upsertPricingRule(payload: PricingRuleRecord) {
  const client = ensureSupabase();
  const { data, error } = await client
    .from("pricing_rules")
    .upsert(payload, { onConflict: "resource_type" })
    .select(
      "resource_type, base_price, price_per_extra_person, max_included_people, discount_if_excluded, includes_tapchan",
    )
    .single();

  if (error) {
    throw error;
  }

  return {
    resource_type: String(data.resource_type ?? ""),
    base_price: Number(data.base_price ?? 0),
    price_per_extra_person: Number(data.price_per_extra_person ?? 0),
    max_included_people: Number(data.max_included_people ?? 0),
    discount_if_excluded: Number(data.discount_if_excluded ?? 0),
    includes_tapchan: Boolean(data.includes_tapchan),
  } satisfies PricingRuleRecord;
}

export async function getResources() {
  if (!hasSupabaseConfig) {
    return [] satisfies ResourceRecord[];
  }

  const client = ensureSupabase();
  const { data, error } = await client
    .from("resources")
    .select("id, type, name, capacity, is_active")
    .order("type", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data as Array<Record<string, unknown>>).map((item) => ({
    id: String(item.id ?? ""),
    type: String(item.type ?? ""),
    name: String(item.name ?? ""),
    capacity: Number(item.capacity ?? 0),
    is_active: Boolean(item.is_active),
  }));
}

export async function upsertResource(payload: ResourceRecord) {
  const client = ensureSupabase();
  const { data, error } = await client
    .from("resources")
    .update({
      type: payload.type,
      name: payload.name,
      capacity: payload.capacity,
      is_active: payload.is_active,
    })
    .eq("id", payload.id)
    .select("id, type, name, capacity, is_active")
    .single();

  if (error) {
    throw error;
  }

  return {
    id: String(data.id ?? ""),
    type: String(data.type ?? ""),
    name: String(data.name ?? ""),
    capacity: Number(data.capacity ?? 0),
    is_active: Boolean(data.is_active),
  } satisfies ResourceRecord;
}

export async function createBooking(payload: {
  resourceSelections: ResourceSelection[];
  name: string;
  phone: string;
  email?: string;
  guests: number;
  date_start: string;
  date_end?: string | null;
}) {
  if (!hasSupabaseConfig) {
    return {
      ok: true,
      success: true,
      available: true,
      bookingId: crypto.randomUUID(),
      totalPrice: 0,
      payment: undefined,
    } satisfies BookingCreateResult;
  }

  const response = await fetch(`${backendUrl}/api/bookings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      resourceSelections: payload.resourceSelections,
      name: payload.name,
      phone: payload.phone,
      email: payload.email,
      peopleCount: payload.guests,
      startDate: payload.date_start,
      endDate: payload.date_end,
      source: "website",
    }),
  });

  const result = (await response.json()) as BookingCreateResult & { error?: string };

  if (!response.ok || !result.ok) {
    throw new Error(result.error || result.message || "Bron yaratib bo'lmadi.");
  }

  return result;
}

export async function quoteBooking(payload: {
  resourceSelections: ResourceSelection[];
  guests: number;
  date_start: string;
  date_end?: string | null;
}) {
  const response = await fetch(`${backendUrl}/api/bookings/quote`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      resourceSelections: payload.resourceSelections,
      peopleCount: payload.guests,
      startDate: payload.date_start,
      endDate: payload.date_end ?? null,
      source: "website",
    }),
  });

  const result = (await response.json()) as { ok?: boolean; error?: string } & BookingQuote;

  if (!response.ok || !result.ok) {
    throw new Error(result.error || "Narxni hisoblab bo'lmadi.");
  }

  return result;
}

export async function createTelegramPrefill(payload: {
  resourceSelections: ResourceSelection[];
  guests?: number;
  estimatedGuests?: number;
  date_start: string;
  date_end?: string | null;
  guestConfirmationRequired?: boolean;
}) {
  const response = await fetch(`${backendUrl}/api/telegram/prefill`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      resourceSelections: payload.resourceSelections,
      peopleCount: payload.guests,
      estimatedPeopleCount: payload.estimatedGuests,
      startDate: payload.date_start,
      endDate: payload.date_end ?? null,
      guestConfirmationRequired: payload.guestConfirmationRequired ?? false,
      source: "website",
    }),
  });

  const result = (await response.json()) as TelegramPrefillApiResult;

  if (!response.ok || !result.ok || !result.token || !result.expiresAt || !result.quote) {
    throw new Error(result.error || "Telegramga yo'naltirishni tayyorlab bo'lmadi.");
  }

  return {
    token: result.token,
    expiresAt: result.expiresAt,
    quote: result.quote,
  } satisfies TelegramPrefillResult;
}

export async function submitBookingProof(payload: {
  bookingId: string;
  file?: File | null;
  proofLink?: string;
}) {
  const formData = new FormData();

  if (payload.file) {
    formData.append("file", payload.file);
  }

  if (payload.proofLink?.trim()) {
    formData.append("proofLink", payload.proofLink.trim());
  }

  const response = await fetch(`${backendUrl}/api/bookings/${payload.bookingId}/proof`, {
    method: "POST",
    body: formData,
  });

  const result = (await response.json()) as BookingProofResult;

  if (!response.ok || !result.ok) {
    throw new Error(result.error || "Chekni yuborib bo'lmadi.");
  }

  return result.context;
}

export async function getAdminBookings() {
  if (!hasSupabaseConfig) {
    return mockBookings;
  }

  const client = ensureSupabase();
  const { data, error } = await client
    .from("bookings")
    .select(
      "id, booking_label, name, phone, email, guests, date_start, date_end, estimated_price, status, created_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data as Array<Record<string, unknown>>).map((item) => ({
    id: String(item.id),
    booking_label: String(item.booking_label ?? ""),
    name: String(item.name),
    phone: String(item.phone),
    email: item.email ? String(item.email) : "",
    guests: Number(item.guests),
    date_start: String(item.date_start),
    date_end: item.date_end ? String(item.date_end) : null,
    estimated_price: Number(item.estimated_price),
    status: item.status as BookingStatus,
    created_at: item.created_at ? String(item.created_at) : undefined,
  }));
}

export async function updateBookingStatus(id: string, status: BookingStatus) {
  if (!hasSupabaseConfig) {
    return;
  }

  const client = ensureSupabase();
  const { error } = await client.from("bookings").update({ status }).eq("id", id);

  if (error) {
    throw error;
  }
}

export async function deleteBooking(id: string) {
  if (!hasSupabaseConfig) {
    return;
  }

  const client = ensureSupabase();
  const { error } = await client.from("bookings").delete().eq("id", id);

  if (error) {
    throw error;
  }
}

export async function getSession() {
  if (!hasSupabaseConfig) {
    return null;
  }

  const client = ensureSupabase();
  const {
    data: { session },
  } = await client.auth.getSession();

  return session;
}

export async function isAdminUser(userId: string) {
  const client = ensureSupabase();
  const { data, error } = await client.rpc("is_admin", { user_id: userId });

  if (error) {
    throw error;
  }

  return Boolean(data);
}

export async function getAdminSession() {
  const session = await getSession();

  if (!session) {
    return null;
  }

  const isAdmin = await isAdminUser(session.user.id);

  return isAdmin ? session : null;
}

export async function signInAdmin(email: string, password: string) {
  const client = ensureSupabase();
  const { data, error } = await client.auth.signInWithPassword({ email, password });

  if (error) {
    throw error;
  }

  return data.session;
}

export async function signOutAdmin() {
  const client = ensureSupabase();
  const { error } = await client.auth.signOut();

  if (error) {
    throw error;
  }
}

export function onAuthChange(callback: (session: Session | null) => void) {
  if (!hasSupabaseConfig || !supabase) {
    return () => undefined;
  }

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });

  return () => {
    data.subscription.unsubscribe();
  };
}

export async function uploadMediaAsset(file: File, type: MediaKind, packageId?: string | null) {
  const client = ensureSupabase();
  const extension = file.name.split(".").pop() ?? "bin";
  const folder = type === "package" && packageId ? `packages/${packageId}` : type;
  const path = `${folder}/${crypto.randomUUID()}.${extension}`;
  const bucket = type === "package" ? packageImagesBucket : defaultMediaBucket;

  const { error: uploadError } = await client.storage.from(bucket).upload(path, file, {
    upsert: true,
  });

  if (uploadError) {
    throw uploadError;
  }

  const { data: publicUrlData } = client.storage.from(bucket).getPublicUrl(path);
  const { data, error: insertError } = await client
    .from("media")
    .insert({
      type,
      url: publicUrlData.publicUrl,
      package_id: packageId ?? null,
      storage_path: path,
    })
    .select("id, type, url, package_id, storage_path")
    .single();

  if (insertError) {
    throw insertError;
  }

  return {
    id: String(data.id),
    type: data.type as MediaKind,
    url: String(data.url),
    package_id: data.package_id ? String(data.package_id) : null,
    storage_path: data.storage_path ? String(data.storage_path) : null,
  } satisfies MediaAsset;
}

export async function uploadPackageImage(file: File, packageId: string) {
  return uploadMediaAsset(file, "package", packageId);
}

export async function deleteMediaAsset(asset: MediaAsset) {
  if (!hasSupabaseConfig) {
    return;
  }

  const client = ensureSupabase();
  const bucket = asset.type === "package" ? packageImagesBucket : defaultMediaBucket;

  if (asset.storage_path) {
    const { error: storageError } = await client.storage.from(bucket).remove([asset.storage_path]);

    if (storageError) {
      console.error(storageError);
    }
  }

  const { error } = await client.from("media").delete().eq("id", asset.id);

  if (error) {
    throw error;
  }
}

export async function getHomeSections() {
  if (!hasSupabaseConfig) {
    return mockHomeSections;
  }

  const client = ensureSupabase();
  const { data, error } = await client
    .from("content_sections")
    .select("id, page, section_type, eyebrow, title, description, content, sort_order, is_enabled")
    .eq("page", "home")
    .order("sort_order", { ascending: true });

  if (error) {
    throw error;
  }

  return (data as Array<Record<string, unknown>>).map(parseContentSection);
}

export async function upsertHomeSection(
  section: Omit<ContentSection, "id" | "page"> & { id?: string | null },
) {
  const client = ensureSupabase();
  const payload = {
    id: section.id ?? crypto.randomUUID(),
    page: "home",
    section_type: section.section_type,
    eyebrow: section.eyebrow,
    title: section.title,
    description: section.description,
    content: section.content,
    sort_order: section.sort_order,
    is_enabled: section.is_enabled,
  };

  const { data, error } = await client
    .from("content_sections")
    .upsert(payload, { onConflict: "id" })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return parseContentSection(data as Record<string, unknown>);
}

export async function deleteHomeSection(id: string) {
  const client = ensureSupabase();
  const { error } = await client.from("content_sections").delete().eq("id", id);

  if (error) {
    throw error;
  }
}
