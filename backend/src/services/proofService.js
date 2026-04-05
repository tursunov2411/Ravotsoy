import { createSupabasePrivilegedClient } from "../bots/shared.js";

const supabase = createSupabasePrivilegedClient();
const PROOF_BUCKET = "payment-proofs";
const STORAGE_PREFIX = `storage://${PROOF_BUCKET}/`;

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

export async function fetchBookingContext(bookingId) {
  const normalizedBookingId = requireText(bookingId, "bookingId");
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, user_id, package_id, name, phone, email, guests, people_count, date_start, date_end, start_time, end_time, total_price, estimated_price, source, status, payment_status, packages(name, type)",
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
    booking: {
      id: String(data.id),
      user_id: data.user_id ? String(data.user_id) : null,
      package_id: String(data.package_id),
      package_name: String((data.packages ?? {}).name ?? ""),
      type: String((data.packages ?? {}).type ?? ""),
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
    },
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

  return fetchBookingContext(normalizedBookingId);
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
