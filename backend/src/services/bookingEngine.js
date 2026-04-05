import { createSupabasePrivilegedClient } from "../bots/shared.js";

const supabase = createSupabasePrivilegedClient();

function requireText(value, fieldName) {
  const text = String(value ?? "").trim();

  if (!text) {
    throw new Error(`${fieldName} is required`);
  }

  return text;
}

function requirePositiveInteger(value, fieldName) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be greater than zero`);
  }

  return parsed;
}

function buildBookingWindow(startInput, endInput) {
  const startText = requireText(startInput, "start");
  const start = new Date(`${startText}T00:00:00.000Z`);

  if (Number.isNaN(start.getTime())) {
    throw new Error("start must be a valid date");
  }

  if (!endInput) {
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return {
      startDate: startText,
      endDate: null,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      isStay: false,
    };
  }

  const endText = String(endInput).trim();
  const end = new Date(`${endText}T00:00:00.000Z`);

  if (Number.isNaN(end.getTime()) || end <= start) {
    throw new Error("end must be after start");
  }

  return {
    startDate: startText,
    endDate: endText,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    isStay: true,
  };
}

function normalizeSource(value) {
  const source = String(value ?? "website").trim().toLowerCase();
  return source === "telegram" || source === "offline" ? source : "website";
}

function sanitizeTelegramHandle(value) {
  const trimmed = String(value ?? "").trim();

  if (!trimmed) {
    return "";
  }

  return trimmed
    .replace(/^https?:\/\/t\.me\//i, "")
    .replace(/^@/, "")
    .replace(/\/+$/, "");
}

async function fetchPaymentConfig() {
  const { data, error } = await supabase
    .from("site_settings")
    .select("hotel_name, payment_card_number, payment_card_holder, payment_instructions, payment_manager_telegram")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return {
    hotelName: String(data?.hotel_name ?? "Ravotsoy Dam Olish Maskani").trim() || "Ravotsoy Dam Olish Maskani",
    cardNumber: String(data?.payment_card_number ?? "").trim(),
    cardHolder: String(data?.payment_card_holder ?? "").trim(),
    instructions: String(data?.payment_instructions ?? "").trim(),
    managerTelegram: sanitizeTelegramHandle(data?.payment_manager_telegram ?? ""),
  };
}

async function fetchBookingDetails(bookingId) {
  const { data, error } = await supabase
    .from("bookings")
    .select("id, package_id, name, phone, email, guests, date_start, date_end, total_price, source, status, packages(name, type)")
    .eq("id", bookingId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    id: String(data.id),
    package_id: String(data.package_id),
    package_name: String((data.packages ?? {}).name ?? ""),
    type: String((data.packages ?? {}).type ?? ""),
    name: String(data.name ?? ""),
    phone: String(data.phone ?? ""),
    email: data.email ? String(data.email) : "",
    guests: Number(data.guests ?? 0),
    date_start: String(data.date_start ?? ""),
    date_end: data.date_end ? String(data.date_end) : null,
    total_price: Number(data.total_price ?? 0),
    source: String(data.source ?? "website"),
    status: String(data.status ?? "pending"),
  };
}

export async function getPaymentConfig() {
  return fetchPaymentConfig();
}

export async function quoteBooking(rawRequest) {
  const packageId = requireText(rawRequest.packageId ?? rawRequest.package_id, "packageId");
  const peopleCount = requirePositiveInteger(rawRequest.peopleCount ?? rawRequest.people_count ?? rawRequest.guests, "peopleCount");
  const window = buildBookingWindow(rawRequest.startDate ?? rawRequest.date_start, rawRequest.endDate ?? rawRequest.date_end);

  const [priceResult, availabilityResult] = await Promise.all([
    supabase.rpc("calculate_booking_price", {
      p_package_id: packageId,
      p_people_count: peopleCount,
      p_exclude_tapchan: false,
    }),
    supabase.rpc("get_package_availability", {
      p_package_id: packageId,
      p_start_time: window.startTime,
      p_end_time: window.endTime,
    }),
  ]);

  if (priceResult.error) {
    throw priceResult.error;
  }

  if (availabilityResult.error) {
    throw availabilityResult.error;
  }

  const price = priceResult.data ?? {};
  const availability = availabilityResult.data ?? {};

  return {
    available: Boolean(availability.available),
    message: String(availability.message ?? (availability.available ? "Resource available" : "Resource is not available for selected time")),
    totalPrice: Number(price.total_price ?? 0),
    resourceType: String(price.resource_type ?? availability.resource_type ?? ""),
    startDate: window.startDate,
    endDate: window.endDate,
  };
}

export async function createBooking(rawRequest) {
  const packageId = requireText(rawRequest.packageId ?? rawRequest.package_id, "packageId");
  const name = requireText(rawRequest.name, "name");
  const phone = requireText(rawRequest.phone, "phone");
  const email = String(rawRequest.email ?? "").trim();
  const peopleCount = requirePositiveInteger(rawRequest.peopleCount ?? rawRequest.people_count ?? rawRequest.guests, "peopleCount");
  const source = normalizeSource(rawRequest.source);
  const window = buildBookingWindow(rawRequest.startDate ?? rawRequest.date_start, rawRequest.endDate ?? rawRequest.date_end);

  const { data, error } = await supabase.rpc("create_booking_with_locking", {
    p_user_id: rawRequest.userId ?? rawRequest.user_id ?? null,
    p_package_id: packageId,
    p_name: name,
    p_phone: phone,
    p_email: email || null,
    p_people_count: peopleCount,
    p_start_time: window.startTime,
    p_end_time: window.endTime,
    p_source: source,
  });

  if (error) {
    throw error;
  }

  const result = data ?? {};

  if (!result.success) {
    return {
      success: false,
      available: false,
      message: String(result.message ?? "Resource is not available for selected time"),
    };
  }

  const bookingId = String(result.booking_id);
  const [payment, booking] = await Promise.all([fetchPaymentConfig(), fetchBookingDetails(bookingId)]);

  return {
    success: true,
    available: true,
    bookingId,
    totalPrice: Number(result.total_price ?? 0),
    resourceType: String(result.resource_type ?? ""),
    payment,
    booking,
  };
}
