import type { Session } from "@supabase/supabase-js";
import { mockBookings, mockGallery, mockPackages } from "./mockData";
import { hasSupabaseConfig, supabase } from "./supabase";
import type {
  BookingRecord,
  BookingStatus,
  MediaAsset,
  MediaKind,
  PackageInput,
  PackageRecord,
} from "./types";

function ensureSupabase() {
  if (!supabase) {
    throw new Error("Supabase sozlanmagan.");
  }

  return supabase;
}

const packageImagesBucket = "package-images";
const defaultMediaBucket = "media";

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
    name: payload.name,
    description: payload.description,
    type: payload.type,
    base_price: payload.base_price,
    price_per_guest: payload.price_per_guest,
    max_guests: payload.max_guests,
  };

  const query = id
    ? client.from("packages").update(basePayload).eq("id", id).select().single()
    : client.from("packages").insert(basePayload).select().single();

  const { data, error } = await query;

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
    .select("id, type, url, package_id")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data as MediaAsset[]).map((item) => ({
    id: item.id,
    type: item.type,
    url: item.url,
    package_id: item.package_id,
  }));
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

export async function signInAdmin(email: string, password: string) {
  const client = ensureSupabase();
  const { error } = await client.auth.signInWithPassword({ email, password });

  if (error) {
    throw error;
  }
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
  const { error: insertError } = await client.from("media").insert({
    type,
    url: publicUrlData.publicUrl,
    package_id: packageId ?? null,
  });

  if (insertError) {
    throw insertError;
  }
}

export async function uploadPackageImage(file: File, packageId: string) {
  await uploadMediaAsset(file, "package", packageId);
}
