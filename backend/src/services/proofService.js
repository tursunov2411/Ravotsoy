import { createSupabasePrivilegedClient } from "../bots/shared.js";
import { summarizeBookingResources, summarizeResourceSelections } from "./bookingMetadata.js";
import { notifyManagerAboutProof } from "./managerNotifications.js";

const supabase = createSupabasePrivilegedClient();
const PROOF_BUCKET = "payment-proofs";
const STORAGE_PREFIX = `storage://${PROOF_BUCKET}/`;
const TASHKENT_OFFSET = "+05:00";

function requireText(value, fieldName) {
  const text = String(value ?? "").trim();

  if (!text) {
    throw new Error(`${fieldName} is required`);
  }

  return text;
}

function sanitizePathPart(value) {
  return String(value ?? "file")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "file";
}

function buildBookingWindow(startInput, endInput) {
  const startText = requireText(startInput, "startDate");
  const start = new Date(`${startText}T00:00:00${TASHKENT_OFFSET}`);

  if (Number.isNaN(start.getTime())) {
    throw new Error("Sana noto'g'ri.");
  }

  if (!endInput) {
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return {
      dateStart: startText,
      dateEnd: null,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    };
  }

  const endText = String(endInput).trim();
  const end = new Date(`${endText}T00:00:00${TASHKENT_OFFSET}`);

  if (Number.isNaN(end.getTime()) || end <= start) {
    throw new Error("Yakuniy sana boshlanish sanasidan keyin bo'lishi kerak.");
  }

  return {
    dateStart: startText,
    dateEnd: endText,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  };
}

function parseStorageReference(value) {
  const proofUrl = String(value ?? "").trim();

  if (!proofUrl.startsWith(STORAGE_PREFIX)) {
    return null;
  }

  return {
    bucket: PROOF_BUCKET,
    path: proofUrl.slice(STORAGE_PREFIX.length),
  };
}

function buildStorageReference(path) {
  return `${STORAGE_PREFIX}${path}`;
}

function getExtensionFromName(fileName, fallback = "bin") {
  const extension = String(fileName ?? "").trim().split(".").pop()?.toLowerCase();
  return extension && /^[a-z0-9]+$/i.test(extension) ? extension : fallback;
}

function guessContentType(fileName, fallback = "application/octet-stream") {
  const extension = getExtensionFromName(fileName, "");

  if (extension === "jpg" || extension === "jpeg") {
    return "image/jpeg";
  }

  if (extension === "png") {
    return "image/png";
  }

  if (extension === "webp") {
    return "image/webp";
  }

  if (extension === "pdf") {
    return "application/pdf";
  }

  return fallback;
}

function isValidLink(value) {
  return /^https?:\/\/\S+$/i.test(String(value ?? "").trim());
}

function normalizeRequestedResources(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = item && typeof item === "object" ? item : {};
      const resourceType = String(record.resourceType ?? record.resource_type ?? "").trim();
      const quantity = Number.parseInt(String(record.quantity ?? 0), 10);

      if (!resourceType || !Number.isInteger(quantity) || quantity <= 0) {
        return null;
      }

      return {
        resourceType,
        quantity,
      };
    })
    .filter(Boolean);
}

function normalizeBooking(data) {
  if (!data) {
    return null;
  }

  const bookingResources = Array.isArray(data.booking_resources) ? data.booking_resources : [];
  const requestedResources = normalizeRequestedResources(data.requested_resources);
  const bookingLabel =
    String(data.booking_label ?? "").trim()
    || summarizeBookingResources(bookingResources)
    || summarizeResourceSelections(requestedResources);

  return {
    id: String(data.id),
    user_id: data.user_id ? String(data.user_id) : null,
    booking_label: bookingLabel,
    resource_summary: bookingLabel,
    requested_resources: requestedResources,
    name: String(data.name ?? ""),
    phone: String(data.phone ?? ""),
    email: data.email ? String(data.email) : "",
    guests: Number(data.guests ?? data.people_count ?? 0),
    date_start: String(data.date_start ?? ""),
    date_end: data.date_end ? String(data.date_end) : null,
    start_time: String(data.start_time ?? ""),
    end_time: String(data.end_time ?? ""),
    total_price: Number(data.total_price ?? data.estimated_price ?? 0),
    source: String(data.source ?? "website"),
    status: String(data.status ?? "pending"),
    payment_status: String(data.payment_status ?? "awaiting_proof"),
  };
}

function normalizeTrackingStatus(booking) {
  if (!booking) {
    return "pending";
  }

  if (booking.status === "proof_submitted" || booking.payment_status === "pending_verification") {
    return "awaiting confirmation";
  }

  if (booking.status === "confirmed" || booking.status === "completed") {
    return "confirmed";
  }

  if (booking.status === "checked_in") {
    return "checked_in";
  }

  if (booking.status === "rejected" || booking.status === "cancelled") {
    return "rejected";
  }

  return "pending";
}

async function uploadProofFile(bookingId, file) {
  const baseName = sanitizePathPart(file?.originalName ?? file?.fileName ?? "proof");
  const extension = getExtensionFromName(baseName, file?.contentType === "application/pdf" ? "pdf" : "jpg");
  const fileName = `${Date.now()}-${baseName.replace(/\.[a-z0-9]+$/i, "")}.${extension}`;
  const path = `${bookingId}/${fileName}`;

  const { error } = await supabase.storage.from(PROOF_BUCKET).upload(path, file.buffer, {
    contentType: file.contentType || guessContentType(fileName),
    upsert: false,
  });

  if (error) {
    throw error;
  }

  return buildStorageReference(path);
}

async function fetchLatestPayment(bookingId) {
  const { data, error } = await supabase
    .from("payments")
    .select("id, booking_id, amount, proof_url, status, created_at")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    id: String(data.id),
    booking_id: String(data.booking_id),
    amount: Number(data.amount ?? 0),
    proof_url: String(data.proof_url ?? "").trim(),
    status: String(data.status ?? "pending"),
    created_at: String(data.created_at ?? ""),
  };
}

async function fetchTelegramUser(userId) {
  if (!userId) {
    return null;
  }

  const { data, error } = await supabase
    .from("users")
    .select("id, telegram_id, name, phone, role")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    id: String(data.id),
    telegram_id: data.telegram_id ? Number(data.telegram_id) : null,
    name: String(data.name ?? ""),
    phone: String(data.phone ?? ""),
    role: String(data.role ?? "customer"),
  };
}

async function fetchBookingRow(bookingId) {
  const normalizedBookingId = requireText(bookingId, "bookingId");
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, user_id, booking_label, requested_resources, name, phone, email, guests, people_count, date_start, date_end, start_time, end_time, total_price, estimated_price, source, status, payment_status, booking_resources(id, quantity, resource_id, resources(id, type, name, capacity))",
    )
    .eq("id", normalizedBookingId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchConflictingAssignments(bookingId, resourceIds, startIso, endIso) {
  if (!Array.isArray(resourceIds) || resourceIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("booking_resources")
    .select("resource_id, bookings!inner(id, status, start_time, end_time)")
    .in("resource_id", resourceIds)
    .neq("booking_id", bookingId)
    .lt("bookings.start_time", endIso)
    .gt("bookings.end_time", startIso)
    .not("bookings.status", "in", "(rejected,cancelled,completed)");

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

export async function upsertTelegramUser({ telegramId, name, phone, role = "customer" }) {
  const normalizedTelegramId = Number(telegramId);

  if (!Number.isInteger(normalizedTelegramId) || normalizedTelegramId <= 0) {
    return null;
  }

  const payload = {
    telegram_id: normalizedTelegramId,
    name: String(name ?? "").trim() || null,
    phone: String(phone ?? "").trim() || null,
    role,
  };

  const { data, error } = await supabase
    .from("users")
    .upsert(payload, { onConflict: "telegram_id" })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return String(data.id);
}

export async function fetchBookingsForTelegramUser(telegramId) {
  const normalizedTelegramId = Number(telegramId);

  if (!Number.isInteger(normalizedTelegramId) || normalizedTelegramId <= 0) {
    return [];
  }

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id")
    .eq("telegram_id", normalizedTelegramId)
    .maybeSingle();

  if (userError) {
    throw userError;
  }

  if (!user?.id) {
    return [];
  }

  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, booking_label, requested_resources, name, phone, email, guests, people_count, date_start, date_end, start_time, end_time, total_price, estimated_price, source, status, payment_status, booking_resources(quantity, resources(id, type, name, capacity))",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    throw error;
  }

  return (Array.isArray(data) ? data : [])
    .map((item) => normalizeBooking(item))
    .filter(Boolean)
    .map((booking) => ({
      ...booking,
      tracking_status: normalizeTrackingStatus(booking),
    }));
}

export async function fetchBookingContext(bookingId) {
  const normalizedBookingId = requireText(bookingId, "bookingId");
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, user_id, booking_label, requested_resources, name, phone, email, guests, people_count, date_start, date_end, start_time, end_time, total_price, estimated_price, source, status, payment_status, booking_resources(quantity, resources(id, type, name, capacity))",
    )
    .eq("id", normalizedBookingId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const [payment, user] = await Promise.all([fetchLatestPayment(normalizedBookingId), fetchTelegramUser(data.user_id)]);

  return {
    booking: normalizeBooking(data),
    payment,
    user,
  };
}

export async function submitBookingProof({ bookingId, proofLink, file }) {
  const normalizedBookingId = requireText(bookingId, "bookingId");
  let proofUrl = "";

  if (file?.buffer) {
    proofUrl = await uploadProofFile(normalizedBookingId, file);
  } else if (isValidLink(proofLink)) {
    proofUrl = String(proofLink).trim();
  } else {
    throw new Error("Proof file or link is required");
  }

  const { data, error } = await supabase.rpc("submit_booking_proof", {
    p_booking_id: normalizedBookingId,
    p_proof_url: proofUrl,
  });

  if (error) {
    throw error;
  }

  if (!data?.success) {
    throw new Error(String(data?.message ?? "Proof could not be saved"));
  }

  const context = await fetchBookingContext(normalizedBookingId);
  await notifyManagerAboutProof(context);
  return context;
}

export async function approveBookingProof(bookingId) {
  const normalizedBookingId = requireText(bookingId, "bookingId");
  const { data, error } = await supabase.rpc("approve_booking_proof", {
    p_booking_id: normalizedBookingId,
  });

  if (error) {
    throw error;
  }

  if (!data?.success) {
    throw new Error(String(data?.message ?? "Booking could not be approved"));
  }

  return fetchBookingContext(normalizedBookingId);
}

export async function rejectBookingProof(bookingId) {
  const normalizedBookingId = requireText(bookingId, "bookingId");
  const { data, error } = await supabase.rpc("reject_booking_proof", {
    p_booking_id: normalizedBookingId,
  });

  if (error) {
    throw error;
  }

  if (!data?.success) {
    throw new Error(String(data?.message ?? "Booking could not be rejected"));
  }

  return fetchBookingContext(normalizedBookingId);
}

export async function approveBookingManually(bookingId) {
  const normalizedBookingId = requireText(bookingId, "bookingId");

  const { error } = await supabase
    .from("bookings")
    .update({
      status: "confirmed",
      payment_status: "paid",
      manager_proof_message_id: null,
      manager_proof_chat_id: null,
    })
    .eq("id", normalizedBookingId);

  if (error) {
    throw error;
  }

  const { data: payment } = await supabase
    .from("payments")
    .select("id")
    .eq("booking_id", normalizedBookingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (payment?.id) {
    const { error: paymentError } = await supabase
      .from("payments")
      .update({ status: "verified" })
      .eq("id", payment.id);

    if (paymentError) {
      throw paymentError;
    }
  }

  return fetchBookingContext(normalizedBookingId);
}

export async function rejectBookingManually(bookingId) {
  const normalizedBookingId = requireText(bookingId, "bookingId");

  const { error } = await supabase
    .from("bookings")
    .update({
      status: "rejected",
      payment_status: "failed",
      manager_proof_message_id: null,
      manager_proof_chat_id: null,
    })
    .eq("id", normalizedBookingId);

  if (error) {
    throw error;
  }

  const { data: payment } = await supabase
    .from("payments")
    .select("id")
    .eq("booking_id", normalizedBookingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (payment?.id) {
    const { error: paymentError } = await supabase
      .from("payments")
      .update({ status: "rejected" })
      .eq("id", payment.id);

    if (paymentError) {
      throw paymentError;
    }
  }

  return fetchBookingContext(normalizedBookingId);
}

export async function cancelBookingManually(bookingId) {
  const normalizedBookingId = requireText(bookingId, "bookingId");

  const { error } = await supabase
    .from("bookings")
    .update({
      status: "cancelled",
      payment_status: "failed",
      manager_proof_message_id: null,
      manager_proof_chat_id: null,
    })
    .eq("id", normalizedBookingId);

  if (error) {
    throw error;
  }

  return fetchBookingContext(normalizedBookingId);
}

export async function setBookingCheckedIn(bookingId) {
  const normalizedBookingId = requireText(bookingId, "bookingId");
  const { error } = await supabase
    .from("bookings")
    .update({ status: "checked_in" })
    .eq("id", normalizedBookingId);

  if (error) {
    throw error;
  }

  return fetchBookingContext(normalizedBookingId);
}

export async function setBookingCompleted(bookingId) {
  const normalizedBookingId = requireText(bookingId, "bookingId");
  const { error } = await supabase
    .from("bookings")
    .update({ status: "completed" })
    .eq("id", normalizedBookingId);

  if (error) {
    throw error;
  }

  return fetchBookingContext(normalizedBookingId);
}

export async function updateBookingFieldsManually(bookingId, values = {}) {
  const normalizedBookingId = requireText(bookingId, "bookingId");
  const payload = {};

  if (Object.hasOwn(values, "name")) {
    const normalizedName = String(values.name ?? "").trim();

    if (!normalizedName) {
      throw new Error("Mijoz ismi bo'sh bo'lmasligi kerak.");
    }

    payload.name = normalizedName;
  }

  if (Object.hasOwn(values, "phone")) {
    const normalizedPhone = String(values.phone ?? "").trim();

    if (!normalizedPhone) {
      throw new Error("Telefon raqami bo'sh bo'lmasligi kerak.");
    }

    payload.phone = normalizedPhone;
  }

  if (Object.keys(payload).length === 0) {
    throw new Error("Yangilash uchun maydon topilmadi.");
  }

  const { error } = await supabase
    .from("bookings")
    .update(payload)
    .eq("id", normalizedBookingId);

  if (error) {
    throw error;
  }

  return fetchBookingContext(normalizedBookingId);
}

export async function completeBookingPaymentManually(bookingId, totalPrice) {
  const normalizedBookingId = requireText(bookingId, "bookingId");
  const normalizedTotalPrice = Number.parseInt(String(totalPrice ?? ""), 10);

  if (!Number.isInteger(normalizedTotalPrice) || normalizedTotalPrice < 0) {
    throw new Error("To'lov summasi 0 yoki undan katta butun son bo'lishi kerak.");
  }

  const booking = await fetchBookingRow(normalizedBookingId);

  if (!booking) {
    throw new Error("Bron topilmadi.");
  }

  if (["rejected", "cancelled", "completed"].includes(String(booking.status ?? ""))) {
    throw new Error("Bu bron uchun to'lovni yopib bo'lmaydi.");
  }

  const { error: bookingError } = await supabase
    .from("bookings")
    .update({
      total_price: normalizedTotalPrice,
      estimated_price: normalizedTotalPrice,
      payment_status: "paid",
    })
    .eq("id", normalizedBookingId);

  if (bookingError) {
    throw bookingError;
  }

  const { data: payment } = await supabase
    .from("payments")
    .select("id")
    .eq("booking_id", normalizedBookingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (payment?.id) {
    const { error: paymentError } = await supabase
      .from("payments")
      .update({
        amount: normalizedTotalPrice,
        status: "verified",
      })
      .eq("id", payment.id);

    if (paymentError) {
      throw paymentError;
    }
  } else {
    const { error: insertPaymentError } = await supabase
      .from("payments")
      .insert({
        booking_id: normalizedBookingId,
        amount: normalizedTotalPrice,
        status: "verified",
      });

    if (insertPaymentError) {
      throw insertPaymentError;
    }
  }

  return fetchBookingContext(normalizedBookingId);
}

export async function updateBookingPriceManually(bookingId, totalPrice) {
  const normalizedBookingId = requireText(bookingId, "bookingId");
  const normalizedTotalPrice = Number.parseInt(String(totalPrice ?? ""), 10);

  if (!Number.isInteger(normalizedTotalPrice) || normalizedTotalPrice <= 0) {
    throw new Error("Narx musbat butun son bo'lishi kerak.");
  }

  const { error } = await supabase
    .from("bookings")
    .update({
      total_price: normalizedTotalPrice,
      estimated_price: normalizedTotalPrice,
    })
    .eq("id", normalizedBookingId);

  if (error) {
    throw error;
  }

  const { data: payment } = await supabase
    .from("payments")
    .select("id")
    .eq("booking_id", normalizedBookingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (payment?.id) {
    const { error: paymentError } = await supabase
      .from("payments")
      .update({ amount: normalizedTotalPrice })
      .eq("id", payment.id);

    if (paymentError) {
      throw paymentError;
    }
  }

  return fetchBookingContext(normalizedBookingId);
}

export async function moveBookingDatesManually(bookingId, startDate, endDate = null) {
  const normalizedBookingId = requireText(bookingId, "bookingId");
  const booking = await fetchBookingRow(normalizedBookingId);

  if (!booking) {
    throw new Error("Bron topilmadi.");
  }

  if (["rejected", "cancelled", "completed"].includes(String(booking.status ?? ""))) {
    throw new Error("Bu bron uchun sanani o'zgartirib bo'lmaydi.");
  }

  const window = buildBookingWindow(startDate, endDate);
  const bookingResources = Array.isArray(booking.booking_resources) ? booking.booking_resources : [];
  const resourceIds = bookingResources
    .map((item) => String(item.resource_id ?? "").trim())
    .filter(Boolean);

  const conflicts = await fetchConflictingAssignments(
    normalizedBookingId,
    resourceIds,
    window.startTime,
    window.endTime,
  );

  if (conflicts.length > 0) {
    throw new Error("Tanlangan yangi sanalarda shu joylardan biri band.");
  }

  const { error } = await supabase
    .from("bookings")
    .update({
      date_start: window.dateStart,
      date_end: window.dateEnd,
      start_time: window.startTime,
      end_time: window.endTime,
    })
    .eq("id", normalizedBookingId);

  if (error) {
    throw error;
  }

  return fetchBookingContext(normalizedBookingId);
}

export async function loadLatestProofAsset(bookingId) {
  const context = await fetchBookingContext(bookingId);
  const proofUrl = String(context?.payment?.proof_url ?? "").trim();

  if (!proofUrl) {
    return null;
  }

  const storageRef = parseStorageReference(proofUrl);

  if (!storageRef) {
    return {
      kind: "link",
      proofUrl,
      fileName: "proof-link.txt",
      contentType: "text/plain",
    };
  }

  const { data, error } = await supabase.storage.from(storageRef.bucket).download(storageRef.path);

  if (error) {
    throw error;
  }

  const fileName = storageRef.path.split("/").pop() || "proof";
  const contentType = guessContentType(fileName, "application/octet-stream");
  const arrayBuffer = await data.arrayBuffer();

  return {
    kind: contentType.startsWith("image/") ? "photo" : "document",
    proofUrl,
    buffer: Buffer.from(arrayBuffer),
    fileName,
    contentType,
  };
}
