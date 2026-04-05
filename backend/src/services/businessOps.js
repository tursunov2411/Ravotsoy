import { createSupabasePrivilegedClient } from "../bots/shared.js";

const supabase = createSupabasePrivilegedClient();
const TASHKENT_OFFSET = "+05:00";

function formatPrice(value) {
  return new Intl.NumberFormat("uz-UZ").format(Number(value ?? 0));
}

function getTodayTashkent() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00${TASHKENT_OFFSET}`);
  date.setUTCDate(date.getUTCDate() + days);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function buildUtcWindow(startDate, endDateExclusive) {
  return {
    startIso: new Date(`${startDate}T00:00:00${TASHKENT_OFFSET}`).toISOString(),
    endIso: new Date(`${endDateExclusive}T00:00:00${TASHKENT_OFFSET}`).toISOString(),
  };
}

function getPeriodRange(period = "today") {
  const today = getTodayTashkent();
  const todayDate = new Date(`${today}T00:00:00${TASHKENT_OFFSET}`);
  const dayOfWeek = todayDate.getUTCDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  if (period === "week") {
    const startDate = addDays(today, mondayOffset);
    const endDateExclusive = addDays(startDate, 7);
    return { label: "This week", startDate, endDateExclusive };
  }

  if (period === "month") {
    const startDate = `${today.slice(0, 8)}01`;
    const [year, month] = startDate.split("-").map((value) => Number(value));
    const endDateExclusive = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tashkent",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1)));
    return { label: "This month", startDate, endDateExclusive };
  }

  return { label: "Today", startDate: today, endDateExclusive: addDays(today, 1) };
}

function normalizeTrackingStatus(record) {
  const status = String(record?.status ?? "pending");
  const paymentStatus = String(record?.payment_status ?? "awaiting_proof");

  if (status === "proof_submitted" || paymentStatus === "pending_verification") {
    return "awaiting confirmation";
  }

  if (status === "confirmed" || status === "completed") {
    return "confirmed";
  }

  if (status === "rejected" || status === "cancelled") {
    return "rejected";
  }

  return "pending";
}

function summarizeBooking(record) {
  return {
    id: String(record.id ?? ""),
    name: String(record.name ?? ""),
    phone: String(record.phone ?? ""),
    source: String(record.source ?? "website"),
    status: String(record.status ?? "pending"),
    trackingStatus: normalizeTrackingStatus(record),
    paymentStatus: String(record.payment_status ?? "awaiting_proof"),
    bookingLabel: String(record.booking_label ?? "").trim() || "Ko'rsatilmagan",
    totalPrice: Number(record.total_price ?? record.estimated_price ?? 0),
    dateStart: String(record.date_start ?? ""),
    dateEnd: record.date_end ? String(record.date_end) : null,
    createdAt: String(record.created_at ?? ""),
  };
}

async function fetchResources() {
  const { data, error } = await supabase
    .from("resources")
    .select("id, type, name, capacity, is_active")
    .order("type", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data.map((item) => ({
    id: String(item.id),
    type: String(item.type ?? ""),
    name: String(item.name ?? ""),
    capacity: Number(item.capacity ?? 0),
    is_active: Boolean(item.is_active),
  })) : [];
}

export async function createResource({ type, name, capacity, isActive = true }) {
  const normalizedType = String(type ?? "").trim();
  const normalizedName = String(name ?? "").trim() || "Resurs";
  const normalizedCapacity = Math.max(Number(capacity ?? 1), 1);

  if (!normalizedType) {
    throw new Error("Resource type is required");
  }

  const { data, error } = await supabase
    .from("resources")
    .insert({
      type: normalizedType,
      name: normalizedName,
      capacity: normalizedCapacity,
      is_active: Boolean(isActive),
    })
    .select("id, type, name, capacity, is_active")
    .single();

  if (error) {
    throw error;
  }

  return {
    id: String(data.id),
    type: String(data.type ?? ""),
    name: String(data.name ?? ""),
    capacity: Number(data.capacity ?? 0),
    is_active: Boolean(data.is_active),
  };
}

async function fetchBookingsBetween(startIso, endIso) {
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, booking_label, name, phone, source, status, payment_status, total_price, estimated_price, date_start, date_end, start_time, end_time, created_at, booking_resources(resource_id, resources(id, type, name, capacity))",
    )
    .lt("start_time", endIso)
    .gt("end_time", startIso)
    .order("start_time", { ascending: true });

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

export async function getResourceOverview(dateText = getTodayTashkent()) {
  const { startIso, endIso } = buildUtcWindow(dateText, addDays(dateText, 1));
  const [resources, bookings] = await Promise.all([fetchResources(), fetchBookingsBetween(startIso, endIso)]);

  const bookedResourceIds = new Set();
  const upcomingCountByResourceId = new Map();

  for (const booking of bookings) {
    const items = Array.isArray(booking.booking_resources) ? booking.booking_resources : [];

    for (const item of items) {
      const resourceId = String(item.resource_id ?? item.resources?.id ?? "");
      if (!resourceId) continue;
      bookedResourceIds.add(resourceId);
      upcomingCountByResourceId.set(resourceId, (upcomingCountByResourceId.get(resourceId) ?? 0) + 1);
    }
  }

  const resourceDetails = resources.map((resource) => ({
    ...resource,
    bookedNow: bookedResourceIds.has(resource.id),
    upcomingBookings: upcomingCountByResourceId.get(resource.id) ?? 0,
  }));

  return {
    date: dateText,
    totalResources: resourceDetails.length,
    activeResources: resourceDetails.filter((item) => item.is_active).length,
    availableNow: resourceDetails.filter((item) => item.is_active && !item.bookedNow).length,
    bookedNow: resourceDetails.filter((item) => item.bookedNow).length,
    upcomingBookings: bookings.length,
    resources: resourceDetails,
  };
}

export async function updateResourceDetails({ resourceId, name, capacity, isActive }) {
  const payload = {};

  if (typeof name === "string") {
    payload.name = name.trim() || "Resurs";
  }

  if (Number.isInteger(Number(capacity)) && Number(capacity) > 0) {
    payload.capacity = Number(capacity);
  }

  if (typeof isActive === "boolean") {
    payload.is_active = isActive;
  }

  const { data, error } = await supabase
    .from("resources")
    .update(payload)
    .eq("id", resourceId)
    .select("id, type, name, capacity, is_active")
    .single();

  if (error) {
    throw error;
  }

  return {
    id: String(data.id),
    type: String(data.type ?? ""),
    name: String(data.name ?? ""),
    capacity: Number(data.capacity ?? 0),
    is_active: Boolean(data.is_active),
  };
}

export async function listPricingRules() {
  const { data, error } = await supabase
    .from("pricing_rules")
    .select("resource_type, base_price, price_per_extra_person, max_included_people, discount_if_excluded, includes_tapchan")
    .order("resource_type", { ascending: true });

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data.map((item) => ({
    resourceType: String(item.resource_type ?? ""),
    basePrice: Number(item.base_price ?? 0),
    extraPersonPrice: Number(item.price_per_extra_person ?? 0),
    maxIncludedPeople: Number(item.max_included_people ?? 0),
    discountIfExcluded: Number(item.discount_if_excluded ?? 0),
    includesTapchan: Boolean(item.includes_tapchan),
  })) : [];
}

export async function updatePricingRuleValues(resourceType, values) {
  const currentRules = await listPricingRules();
  const current = currentRules.find((item) => item.resourceType === resourceType);

  if (!current) {
    throw new Error("Pricing rule not found");
  }

  const payload = {
    resource_type: resourceType,
    base_price: Math.max(Number(values.basePrice ?? current.basePrice), 0),
    price_per_extra_person: Math.max(Number(values.extraPersonPrice ?? current.extraPersonPrice), 0),
    max_included_people: Math.max(Number(values.maxIncludedPeople ?? current.maxIncludedPeople), 1),
    discount_if_excluded: Math.min(Math.max(Number(values.discountIfExcluded ?? current.discountIfExcluded), 0), 1),
    includes_tapchan: current.includesTapchan,
  };

  const { data, error } = await supabase
    .from("pricing_rules")
    .upsert(payload, { onConflict: "resource_type" })
    .select("resource_type, base_price, price_per_extra_person, max_included_people, discount_if_excluded, includes_tapchan")
    .single();

  if (error) {
    throw error;
  }

  return {
    resourceType: String(data.resource_type ?? ""),
    basePrice: Number(data.base_price ?? 0),
    extraPersonPrice: Number(data.price_per_extra_person ?? 0),
    maxIncludedPeople: Number(data.max_included_people ?? 0),
    discountIfExcluded: Number(data.discount_if_excluded ?? 0),
    includesTapchan: Boolean(data.includes_tapchan),
  };
}

export async function listBookingsForManager({ date = "", status = "", source = "", limit = 12 } = {}) {
  let query = supabase
    .from("bookings")
    .select("id, booking_label, name, phone, source, status, payment_status, total_price, estimated_price, date_start, date_end, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (date) {
    query = query.eq("date_start", date);
  }

  if (status === "awaiting confirmation") {
    query = query.or("status.eq.proof_submitted,payment_status.eq.pending_verification");
  } else if (status) {
    query = query.eq("status", status);
  }

  if (source) {
    query = query.eq("source", source);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (Array.isArray(data) ? data : []).map(summarizeBooking);
}

export async function getBusinessAnalytics(period = "today") {
  const range = getPeriodRange(period);
  const { startIso, endIso } = buildUtcWindow(range.startDate, range.endDateExclusive);
  const [resources, bookings] = await Promise.all([fetchResources(), fetchBookingsBetween(startIso, endIso)]);

  const activeResources = resources.filter((item) => item.is_active);
  const roomResources = activeResources.filter((item) => item.type.startsWith("room_"));
  const tapchanResources = activeResources.filter((item) => item.type.startsWith("tapchan_"));
  const bookingSummaries = bookings.map(summarizeBooking);
  const confirmedBookings = bookingSummaries.filter((item) => item.trackingStatus === "confirmed");
  const rejectedBookings = bookingSummaries.filter((item) => item.trackingStatus === "rejected");

  const bookedRoomIds = new Set();
  const bookedTapchanIds = new Set();
  const resourceBookingCounts = new Map();

  for (const booking of bookings) {
    const items = Array.isArray(booking.booking_resources) ? booking.booking_resources : [];

    for (const item of items) {
      const resource = item.resources ?? {};
      const resourceId = String(item.resource_id ?? resource.id ?? "");
      const resourceType = String(resource.type ?? "");
      if (!resourceId) continue;
      resourceBookingCounts.set(resourceId, (resourceBookingCounts.get(resourceId) ?? 0) + 1);
      if (resourceType.startsWith("room_")) bookedRoomIds.add(resourceId);
      if (resourceType.startsWith("tapchan_")) bookedTapchanIds.add(resourceId);
    }
  }

  const roomOccupancyRate = roomResources.length > 0 ? Math.round((bookedRoomIds.size / roomResources.length) * 100) : 0;
  const tapchanUtilizationRate = tapchanResources.length > 0 ? Math.round((bookedTapchanIds.size / tapchanResources.length) * 100) : 0;
  const cancellationRate = bookingSummaries.length > 0 ? Math.round((rejectedBookings.length / bookingSummaries.length) * 100) : 0;
  const sourceCounts = bookingSummaries.reduce((acc, item) => {
    acc[item.source] = (acc[item.source] ?? 0) + 1;
    return acc;
  }, {});
  const unusedResources = activeResources.filter((item) => !resourceBookingCounts.has(item.id));
  const peakDemand = roomOccupancyRate >= 75 || tapchanUtilizationRate >= 75;
  const lowOccupancy = roomOccupancyRate < 35 && tapchanUtilizationRate < 35;

  const insights = [];

  if (lowOccupancy) {
    insights.push("Low occupancy detected. Consider weekday tapchan discounts.");
  }

  if (peakDemand) {
    insights.push("High demand detected. Consider increasing weekend prices.");
  }

  if (unusedResources.some((item) => item.type.startsWith("tapchan_"))) {
    insights.push("Unused tapchans detected. Consider promotional bundles for low-demand days.");
  }

  return {
    period: range.label,
    startDate: range.startDate,
    endDateExclusive: range.endDateExclusive,
    revenue: confirmedBookings.reduce((sum, item) => sum + item.totalPrice, 0),
    bookingCount: bookingSummaries.length,
    roomOccupancyRate,
    tapchanUtilizationRate,
    cancellationRate,
    bookingSources: sourceCounts,
    unusedCapacity: unusedResources.reduce((sum, item) => sum + item.capacity, 0),
    unusedResources: unusedResources.map((item) => item.name),
    issues: [
      roomOccupancyRate === 0 && tapchanUtilizationRate === 0 ? "No confirmed resource utilization in selected period." : "",
      cancellationRate > 25 ? "Cancellation rate is elevated." : "",
    ].filter(Boolean),
    insights,
  };
}

export async function getSystemStatus() {
  const today = getTodayTashkent();
  const [resources, pendingBookings, proofPending, todayOverview] = await Promise.all([
    fetchResources(),
    listBookingsForManager({ status: "pending", limit: 20 }),
    listBookingsForManager({ status: "awaiting confirmation", limit: 20 }),
    getResourceOverview(today),
  ]);

  return {
    activeResources: resources.filter((item) => item.is_active).length,
    inactiveResources: resources.filter((item) => !item.is_active).length,
    pendingBookings: pendingBookings.length,
    awaitingConfirmation: proofPending.length,
    availableNow: todayOverview.availableNow,
    bookedNow: todayOverview.bookedNow,
    issues: [
      proofPending.length > 5 ? "Many proofs are waiting for confirmation." : "",
      todayOverview.availableNow === 0 ? "No resources are currently free." : "",
    ].filter(Boolean),
  };
}

export function formatAnalyticsForTelegram(summary) {
  return [
    `${summary.period} analytics`,
    "",
    `Revenue: ${formatPrice(summary.revenue)} UZS`,
    `Bookings: ${summary.bookingCount}`,
    `Room occupancy: ${summary.roomOccupancyRate}%`,
    `Tapchan utilization: ${summary.tapchanUtilizationRate}%`,
    `Cancellation rate: ${summary.cancellationRate}%`,
    `Unused capacity: ${summary.unusedCapacity}`,
    `Sources: ${Object.entries(summary.bookingSources).map(([key, value]) => `${key} ${value}`).join(", ") || "none"}`,
    summary.issues.length > 0 ? `Issues: ${summary.issues.join("; ")}` : "Issues: none",
    summary.insights.length > 0 ? `Insights: ${summary.insights.join("; ")}` : "Insights: no optimization alerts",
  ].join("\n");
}

export function formatAvailabilityForTelegram(overview) {
  const lines = [
    `Availability for ${overview.date}`,
    "",
    `Active resources: ${overview.activeResources}`,
    `Available now: ${overview.availableNow}`,
    `Booked now: ${overview.bookedNow}`,
    `Upcoming bookings: ${overview.upcomingBookings}`,
    "",
  ];

  for (const resource of overview.resources.slice(0, 20)) {
    lines.push(
      `${resource.name} - ${resource.is_active ? (resource.bookedNow ? "booked" : "free") : "disabled"} - capacity ${resource.capacity}`,
    );
  }

  return lines.join("\n");
}
