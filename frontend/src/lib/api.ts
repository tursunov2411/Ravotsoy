import type { Session } from "@supabase/supabase-js";
import { mockBookings, mockGallery, mockHomeSections, mockPackages, mockSiteSettings } from "./mockData";
import { hasSupabaseConfig, supabase } from "./supabase";
import type {
  BookingRecord,
  BookingStatus,
  ContentSection,
  ContentSectionType,
  HomeFeatureCard,
  MediaAsset,
  MediaKind,
  PublicContact,
  PackageInput,
  PackageRecord,
  SightseeingPlace,
  SiteSettings,
} from "./types";

function ensureSupabase() {
  if (!supabase) {
    throw new Error("Supabase sozlanmagan.");
  }

  return supabase;
}

const packageImagesBucket = "package-images";
const defaultMediaBucket = "media";

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

function parseFeatureCards(value: unknown): HomeFeatureCard[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = item as Record<string, unknown>;
      const title = String(record.title ?? "").trim();
      const description = String(record.description ?? "").trim();
      const icon = String(record.icon ?? "sparkles") as HomeFeatureCard["icon"];

      if (!title && !description) {
        return null;
      }

      return {
        id: String(record.id ?? crypto.randomUUID()),
        title,
        description,
        icon:
          icon === "trees" || icon === "sparkles" || icon === "message-circle" || icon === "map-pinned"
            ? icon
            : "sparkles",
      } satisfies HomeFeatureCard;
    })
    .filter((item): item is HomeFeatureCard => Boolean(item));
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
    type === "highlights" ||
    type === "packages" ||
    type === "gallery" ||
    type === "sightseeing" ||
    type === "contacts"
  ) {
    return type;
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
    .select("id, name, description, type, base_price, price_per_guest, max_guests, media(url)")
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
    id: id ?? crypto.randomUUID(),
    name: payload.name,
    description: payload.description,
    type: payload.type,
    base_price: payload.base_price,
    price_per_guest: payload.price_per_guest,
    max_guests: payload.max_guests,
  };

  const { data, error } = await client
    .from("packages")
    .upsert(basePayload, { onConflict: "id" })
    .select("id, name, description, type, base_price, price_per_guest, max_guests")
    .single();

  if (error) {
    throw error;
  }

  return {
    id: String(data.id),
    name: String(data.name),
    description: String(data.description),
    type: data.type as PackageRecord["type"],
    base_price: Number(data.base_price),
    price_per_guest: Number(data.price_per_guest),
    max_guests: Number(data.max_guests),
    images: [],
  } satisfies PackageRecord;
}

export async function deletePackage(id: string) {
  if (!hasSupabaseConfig) {
    return;
  }

  const client = ensureSupabase();
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
    .select("id, hotel_name, description, location_url, about_text, hero_images, contact_people")
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
      },
      { onConflict: "id" },
    )
    .select("id, hotel_name, description, location_url, about_text, hero_images, contact_people")
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
  } satisfies SiteSettings;
}

export async function createBooking(payload: Omit<BookingRecord, "id" | "status" | "created_at">) {
  if (!hasSupabaseConfig) {
    return {
      id: crypto.randomUUID(),
      ...payload,
      status: "pending" as const,
    };
  }

  const client = ensureSupabase();
  const { error } = await client
    .from("bookings")
    .insert({
      package_id: payload.package_id,
      name: payload.name,
      phone: payload.phone,
      email: payload.email,
      guests: payload.guests,
      date_start: payload.date_start,
      date_end: payload.date_end,
      estimated_price: payload.estimated_price,
    });

  if (error) {
    throw error;
  }
}

export async function getAdminBookings() {
  if (!hasSupabaseConfig) {
    return mockBookings;
  }

  const client = ensureSupabase();
  const { data, error } = await client
    .from("bookings")
    .select(
      "id, package_id, name, phone, email, guests, date_start, date_end, estimated_price, status, created_at, packages(name)",
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data as Array<Record<string, unknown>>).map((item) => ({
    id: String(item.id),
    package_id: String(item.package_id),
    package_name: String((item.packages as { name?: string } | null)?.name ?? ""),
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
    id: section.id ?? undefined,
    page: "home",
    section_type: section.section_type,
    eyebrow: section.eyebrow,
    title: section.title,
    description: section.description,
    content: section.content,
    sort_order: section.sort_order,
    is_enabled: section.is_enabled,
  };

  const query = section.id
    ? client.from("content_sections").update(payload).eq("id", section.id).select().single()
    : client.from("content_sections").insert(payload).select().single();

  const { data, error } = await query;

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
