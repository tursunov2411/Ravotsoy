import { createSupabasePrivilegedClient } from "../bots/shared.js";
import {
  buildSelectionLabel,
  getResourceTypeMeta,
  normalizeResourceSelections,
  summarizeBookingResources,
  summarizeResourceSelections,
} from "./bookingMetadata.js";
import { notifyManagerAboutBooking } from "./managerNotifications.js";
import { createTelegramPrefill as storeTelegramPrefill } from "./telegramFlow.js";

const supabase = createSupabasePrivilegedClient();
const MAX_INDOOR_CAPACITY = 30;

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

function normalizeSelectionsInput(rawRequest) {
  const directSelections = normalizeResourceSelections(
    rawRequest.resourceSelections ?? rawRequest.resource_selections ?? [],
  );

  if (directSelections.length > 0) {
    return directSelections;
  }

  const singleType = String(rawRequest.resourceType ?? rawRequest.resource_type ?? "").trim();
  const singleQuantity = Number.parseInt(
    String(rawRequest.resourceQuantity ?? rawRequest.resource_quantity ?? 1),
    10,
  );
  const includeTapchan = rawRequest.includeTapchan ?? rawRequest.include_tapchan;

  if (!singleType || !Number.isInteger(singleQuantity) || singleQuantity <= 0) {
    throw new Error("resourceSelections are required");
  }

  return normalizeResourceSelections([
    {
      resourceType: singleType,
      quantity: singleQuantity,
      includeTapchan,
    },
  ]);
}

function normalizeRequestedResources(value) {
  return normalizeResourceSelections(value).map((item) => ({
    resourceType: item.resourceType,
    quantity: item.quantity,
    includeTapchan: item.includeTapchan,
    label: buildSelectionLabel(item),
  }));
}

function normalizeBookingRecord(data) {
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
    booking_label: bookingLabel,
    resource_summary: bookingLabel,
    requested_resources: requestedResources,
    name: String(data.name ?? ""),
    phone: String(data.phone ?? ""),
    email: data.email ? String(data.email) : "",
    guests: Number(data.guests ?? data.people_count ?? 0),
    date_start: String(data.date_start ?? ""),
    date_end: data.date_end ? String(data.date_end) : null,
    total_price: Number(data.total_price ?? data.estimated_price ?? 0),
    source: String(data.source ?? "website"),
    status: String(data.status ?? "pending"),
  };
}

function calculateRequiredDeposit(totalPrice, ratio) {
  const normalizedTotal = Math.max(Number(totalPrice ?? 0), 0);
  const normalizedRatio = Math.min(Math.max(Number(ratio ?? 0.3), 0.01), 1);
  return Math.ceil(normalizedTotal * normalizedRatio);
}

function formatSuggestion(option, quantity = 1, includeTapchan = true) {
  return {
    resourceType: option.resourceType,
    quantity,
    includeTapchan,
    label: buildSelectionLabel({
      resourceType: option.resourceType,
      includeTapchan,
    }),
  };
}

function buildCapacitySuggestions(options, peopleCount, totalCapacity) {
  if (peopleCount <= totalCapacity) {
    return [];
  }

  const sorted = [...options].sort((left, right) => right.unitCapacity - left.unitCapacity);
  const suggestions = [];

  for (const option of sorted) {
    if (suggestions.length >= 3 || option.maxQuantity <= 0) {
      continue;
    }

    const neededQuantity = Math.ceil(peopleCount / Math.max(option.unitCapacity, 1));

    if (neededQuantity <= option.maxQuantity) {
      suggestions.push(
        formatSuggestion(
          option,
          Math.max(neededQuantity, 1),
          option.bookingMode === "stay" ? true : undefined,
        ),
      );
    }
  }

  return suggestions;
}

async function fetchPaymentConfigRecord() {
  const { data, error } = await supabase
    .from("site_settings")
    .select(
      "hotel_name, payment_card_number, payment_card_holder, payment_instructions, payment_manager_telegram, payment_deposit_ratio",
    )
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchPaymentConfig(totalPrice = 0) {
  const data = await fetchPaymentConfigRecord();
  const depositRatio = Number(data?.payment_deposit_ratio ?? 0.3);

  return {
    hotelName:
      String(data?.hotel_name ?? "Ravotsoy Dam Olish Maskani").trim() || "Ravotsoy Dam Olish Maskani",
    cardNumber: String(data?.payment_card_number ?? "").trim(),
    cardHolder: String(data?.payment_card_holder ?? "").trim(),
    instructions: String(data?.payment_instructions ?? "").trim(),
    managerTelegram: sanitizeTelegramHandle(data?.payment_manager_telegram ?? ""),
    depositRatio,
    depositPercentage: Math.round(depositRatio * 100),
    requiredAmount: calculateRequiredDeposit(totalPrice, depositRatio),
  };
}

async function fetchBookingDetails(bookingId) {
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, booking_label, requested_resources, name, phone, email, guests, people_count, date_start, date_end, total_price, estimated_price, source, status, booking_resources(quantity, resources(id, type, name, capacity))",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return normalizeBookingRecord(data);
}

export async function getPaymentConfig(totalPrice = 0) {
  return fetchPaymentConfig(totalPrice);
}

export async function getTripBuilderOptions() {
  const [resourcesResult, pricingResult] = await Promise.all([
    supabase
      .from("resources")
      .select("id, type, name, capacity, is_active")
      .eq("is_active", true)
      .order("type", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("pricing_rules")
      .select(
        "resource_type, base_price, price_per_extra_person, max_included_people, includes_tapchan, discount_if_excluded",
      )
      .order("resource_type", { ascending: true }),
  ]);

  if (resourcesResult.error) {
    throw resourcesResult.error;
  }

  if (pricingResult.error) {
    throw pricingResult.error;
  }

  const resourceRows = Array.isArray(resourcesResult.data) ? resourcesResult.data : [];
  const pricingByType = new Map(
    (Array.isArray(pricingResult.data) ? pricingResult.data : []).map((item) => [
      String(item.resource_type),
      item,
    ]),
  );
  const grouped = new Map();

  for (const item of resourceRows) {
    const resourceType = String(item.type ?? "").trim();

    if (!resourceType) {
      continue;
    }

    const current = grouped.get(resourceType) ?? {
      resourceType,
      resources: [],
      maxCapacity: 0,
    };

    current.resources.push({
      id: String(item.id),
      name: String(item.name ?? ""),
      capacity: Number(item.capacity ?? 0),
    });
    current.maxCapacity = Math.max(current.maxCapacity, Number(item.capacity ?? 0));
    grouped.set(resourceType, current);
  }

  return Array.from(new Set([...grouped.keys(), ...pricingByType.keys()]))
    .map((resourceType) => {
      const group = grouped.get(resourceType) ?? { resources: [], maxCapacity: 0 };
      const pricing = pricingByType.get(resourceType);
      const meta = getResourceTypeMeta(resourceType);

      return {
        resourceType,
        label: meta.label,
        shortLabel: meta.shortLabel,
        bookingMode: meta.bookingMode,
        unitCapacity: group.maxCapacity,
        availableUnits: group.resources.length,
        maxQuantity: group.resources.length,
        basePrice: Number(pricing?.base_price ?? 0),
        pricePerExtraPerson: Number(pricing?.price_per_extra_person ?? 0),
        maxIncludedPeople: Number(pricing?.max_included_people ?? group.maxCapacity ?? 0),
        includesTapchan: Boolean(pricing?.includes_tapchan),
        discountIfExcluded: Number(pricing?.discount_if_excluded ?? 0),
        resourceNames: group.resources.map((item) => item.name),
      };
    })
    .filter((item) => item.availableUnits > 0 || item.basePrice > 0)
    .sort((left, right) => left.label.localeCompare(right.label, "uz"));
}

export async function quoteBooking(rawRequest) {
  const peopleCount = requirePositiveInteger(
    rawRequest.peopleCount ?? rawRequest.people_count ?? rawRequest.guests,
    "peopleCount",
  );

  if (peopleCount > MAX_INDOOR_CAPACITY) {
    throw new Error(`peopleCount must not exceed ${MAX_INDOOR_CAPACITY}`);
  }

  const resourceSelections = normalizeSelectionsInput(rawRequest);
  const window = buildBookingWindow(
    rawRequest.startDate ?? rawRequest.date_start,
    rawRequest.endDate ?? rawRequest.date_end,
  );

  const { data, error } = await supabase.rpc("quote_trip_booking", {
    p_resource_requests: resourceSelections.map((item) => ({
      resourceType: item.resourceType,
      quantity: item.quantity,
      includeTapchan: item.includeTapchan,
    })),
    p_people_count: peopleCount,
    p_start_time: window.startTime,
    p_end_time: window.endTime,
  });

  if (error) {
    throw error;
  }

  const result = data ?? {};
  const options = await getTripBuilderOptions();
  const totalCapacity = Number(result.total_capacity ?? 0);

  return {
    available: Boolean(result.available),
    message: String(
      result.message ?? (result.available ? "Resources are available" : "Selected resources are not available"),
    ),
    totalPrice: Number(result.total_price ?? 0),
    totalCapacity,
    bookingLabel: String(result.booking_label ?? summarizeResourceSelections(resourceSelections)),
    selections: normalizeRequestedResources(result.selections),
    unavailable: Array.isArray(result.unavailable) ? result.unavailable : [],
    suggestions: buildCapacitySuggestions(options, peopleCount, totalCapacity),
    startDate: window.startDate,
    endDate: window.endDate,
  };
}

export async function createBooking(rawRequest) {
  const name = requireText(rawRequest.name, "name");
  const phone = requireText(rawRequest.phone, "phone");
  const email = String(rawRequest.email ?? "").trim();
  const peopleCount = requirePositiveInteger(
    rawRequest.peopleCount ?? rawRequest.people_count ?? rawRequest.guests,
    "peopleCount",
  );

  if (peopleCount > MAX_INDOOR_CAPACITY) {
    throw new Error(`peopleCount must not exceed ${MAX_INDOOR_CAPACITY}`);
  }

  const source = normalizeSource(rawRequest.source);
  const resourceSelections = normalizeSelectionsInput(rawRequest);
  const window = buildBookingWindow(
    rawRequest.startDate ?? rawRequest.date_start,
    rawRequest.endDate ?? rawRequest.date_end,
  );

  const { data, error } = await supabase.rpc("create_trip_booking_with_locking", {
    p_user_id: rawRequest.userId ?? rawRequest.user_id ?? null,
    p_name: name,
    p_phone: phone,
    p_email: email || null,
    p_people_count: peopleCount,
    p_resource_requests: resourceSelections.map((item) => ({
      resourceType: item.resourceType,
      quantity: item.quantity,
      includeTapchan: item.includeTapchan,
    })),
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
      message: String(result.message ?? "Selected resources are not available"),
      unavailable: Array.isArray(result.unavailable) ? result.unavailable : [],
    };
  }

  const bookingId = String(result.booking_id ?? result.bookingId ?? "");
  const totalPrice = Number(result.total_price ?? 0);
  const [payment, booking] = await Promise.all([fetchPaymentConfig(totalPrice), fetchBookingDetails(bookingId)]);

  if (booking) {
    await notifyManagerAboutBooking(booking);
  }

  return {
    success: true,
    available: true,
    bookingId,
    totalPrice,
    bookingLabel: String(result.booking_label ?? booking?.booking_label ?? summarizeResourceSelections(resourceSelections)),
    payment,
    booking,
  };
}

export async function createTelegramPrefill(rawRequest) {
  const peopleCount = requirePositiveInteger(
    rawRequest.peopleCount ?? rawRequest.people_count ?? rawRequest.guests,
    "peopleCount",
  );

  if (peopleCount > MAX_INDOOR_CAPACITY) {
    throw new Error(`peopleCount must not exceed ${MAX_INDOOR_CAPACITY}`);
  }

  const resourceSelections = normalizeSelectionsInput(rawRequest);
  const window = buildBookingWindow(
    rawRequest.startDate ?? rawRequest.date_start,
    rawRequest.endDate ?? rawRequest.date_end,
  );
  const quote = await quoteBooking({
    resourceSelections,
    peopleCount,
    startDate: window.startDate,
    endDate: window.endDate,
  });

  if (!quote.available) {
    throw new Error(quote.message || "Selected resources are not available");
  }

  const stored = await storeTelegramPrefill({
    peopleCount,
    startDate: window.startDate,
    endDate: window.endDate,
    resourceSelections: resourceSelections.map((item) => ({
      resourceType: item.resourceType,
      quantity: item.quantity,
      includeTapchan: item.includeTapchan,
    })),
    quote: {
      totalPrice: quote.totalPrice,
      totalCapacity: quote.totalCapacity,
      bookingLabel: quote.bookingLabel,
    },
  });

  return {
    token: stored.token,
    expiresAt: stored.expiresAt,
    quote,
  };
}
