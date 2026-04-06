import { createSupabasePrivilegedClient } from "../bots/shared.js";

const supabase = createSupabasePrivilegedClient();
const TASHKENT_OFFSET = "+05:00";

function formatPrice(value) {
  return new Intl.NumberFormat("uz-UZ").format(Number(value ?? 0));
}

function normalizeTelegramHandle(value) {
  return String(value ?? "").trim().replace(/^@+/, "").toLowerCase();
}

function normalizePhone(value) {
  return String(value ?? "").trim().replace(/[^\d+]/g, "");
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll("\"", "\"\"")}"`;
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

function getCurrentYearMonth() {
  return getTodayTashkent().slice(0, 7);
}

function normalizeYearMonth(value = "") {
  const normalized = String(value ?? "").trim();
  return /^\d{4}-\d{2}$/.test(normalized) ? normalized : getCurrentYearMonth();
}

function formatMonthLabel(yearMonth) {
  const [yearText, monthText] = normalizeYearMonth(yearMonth).split("-");
  const year = Number(yearText);
  const monthIndex = Math.max(Number(monthText) - 1, 0);
  const monthNames = [
    "Yanvar",
    "Fevral",
    "Mart",
    "Aprel",
    "May",
    "Iyun",
    "Iyul",
    "Avgust",
    "Sentabr",
    "Oktabr",
    "Noyabr",
    "Dekabr",
  ];

  return `${monthNames[monthIndex] ?? yearMonth} ${year}`;
}

function getMonthRange(yearMonth = getCurrentYearMonth()) {
  const normalized = normalizeYearMonth(yearMonth);
  const [yearText, monthText] = normalized.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const startDate = `${normalized}-01`;
  const endDateExclusive = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1)));

  return {
    yearMonth: normalized,
    startDate,
    endDateExclusive,
    label: formatMonthLabel(normalized),
  };
}

function getDateWeekdayIndex(dateText) {
  const date = new Date(`${dateText}T00:00:00${TASHKENT_OFFSET}`);
  return (date.getUTCDay() + 6) % 7;
}

function toTashkentDateText(value) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
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
    return { label: "Shu hafta", startDate, endDateExclusive };
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
    return { label: "Shu oy", startDate, endDateExclusive };
  }

  return { label: "Bugun", startDate: today, endDateExclusive: addDays(today, 1) };
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

  if (status === "checked_in") {
    return "checked_in";
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

function getBookingEndDateExclusive(record) {
  const startDate = String(record?.date_start ?? "").trim();
  const dateEnd = String(record?.date_end ?? "").trim();

  if (dateEnd && startDate && dateEnd > startDate) {
    return dateEnd;
  }

  return startDate ? addDays(startDate, 1) : "";
}

function normalizeExpenseRecord(record) {
  return {
    id: String(record?.id ?? ""),
    name: String(record?.name ?? "").trim(),
    amount: Number(record?.amount ?? 0),
    managerTelegramId: record?.manager_telegram_id ? Number(record.manager_telegram_id) : null,
    managerChatId: record?.manager_chat_id ? Number(record.manager_chat_id) : null,
    managerUsername: String(record?.manager_username ?? "").trim(),
    createdAt: String(record?.created_at ?? ""),
  };
}

function normalizeHandoffRecord(record) {
  return {
    id: String(record?.id ?? ""),
    amount: Number(record?.amount ?? 0),
    note: String(record?.note ?? "").trim(),
    managerTelegramId: record?.manager_telegram_id ? Number(record.manager_telegram_id) : null,
    managerChatId: record?.manager_chat_id ? Number(record.manager_chat_id) : null,
    managerUsername: String(record?.manager_username ?? "").trim(),
    createdAt: String(record?.created_at ?? ""),
  };
}

function normalizeManagerActor(actor = {}) {
  const managerTelegramId = Number(actor.managerTelegramId ?? 0);
  const managerChatId = Number(actor.managerChatId ?? 0);

  return {
    managerTelegramId: Number.isInteger(managerTelegramId) && managerTelegramId > 0 ? managerTelegramId : null,
    managerChatId: Number.isInteger(managerChatId) && managerChatId > 0 ? managerChatId : null,
    managerUsername: String(actor.managerUsername ?? "").trim().replace(/^@+/, ""),
  };
}

function isMissingFinanceTableError(error) {
  const message = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`.toLowerCase();
  return message.includes("manager_expenses") || message.includes("manager_balance_handoffs") || message.includes("does not exist");
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

async function fetchSiteSettingsRecord() {
  const { data, error } = await supabase
    .from("site_settings")
    .select(
      "id, hotel_name, description, location_url, about_text, hero_images, contact_people, payment_card_number, payment_card_holder, payment_instructions, payment_manager_telegram, payment_deposit_ratio",
    )
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function getSitePaymentSettings() {
  const data = await fetchSiteSettingsRecord();

  return {
    cardNumber: String(data?.payment_card_number ?? "").trim(),
    cardHolder: String(data?.payment_card_holder ?? "").trim(),
    managerTelegram: String(data?.payment_manager_telegram ?? "").trim(),
    instructions: String(data?.payment_instructions ?? "").trim(),
    depositRatio: Number(data?.payment_deposit_ratio ?? 0.3),
  };
}

export async function updateSitePaymentSettings(values = {}) {
  const current = await fetchSiteSettingsRecord();
  const payload = {
    id: 1,
    hotel_name: current?.hotel_name ?? "Ravotsoy Dam Olish Maskani",
    description: current?.description ?? "",
    location_url: current?.location_url ?? "https://yandex.com/maps/-/CHeC5WPL",
    about_text: current?.about_text ?? "",
    hero_images: current?.hero_images ?? [],
    contact_people: current?.contact_people ?? [],
    payment_card_number: typeof values.cardNumber === "string" ? values.cardNumber.trim() || null : current?.payment_card_number ?? null,
    payment_card_holder: typeof values.cardHolder === "string" ? values.cardHolder.trim() || null : current?.payment_card_holder ?? null,
    payment_manager_telegram: typeof values.managerTelegram === "string" ? values.managerTelegram.trim() || null : current?.payment_manager_telegram ?? null,
    payment_instructions: typeof values.instructions === "string" ? values.instructions.trim() || null : current?.payment_instructions ?? null,
    payment_deposit_ratio: Number(values.depositRatio ?? current?.payment_deposit_ratio ?? 0.3),
  };

  const { data, error } = await supabase
    .from("site_settings")
    .update(payload)
    .eq("id", 1)
    .select(
      "id, payment_card_number, payment_card_holder, payment_manager_telegram, payment_instructions, payment_deposit_ratio",
    )
    .single();

  if (error) {
    throw error;
  }

  return {
    cardNumber: String(data?.payment_card_number ?? "").trim(),
    cardHolder: String(data?.payment_card_holder ?? "").trim(),
    managerTelegram: String(data?.payment_manager_telegram ?? "").trim(),
    instructions: String(data?.payment_instructions ?? "").trim(),
    depositRatio: Number(data?.payment_deposit_ratio ?? 0.3),
  };
}

export async function createResource({ type, name, capacity, isActive = true }) {
  const normalizedType = String(type ?? "").trim();
  const normalizedName = String(name ?? "").trim() || "Resurs";
  const normalizedCapacity = Math.max(Number(capacity ?? 1), 1);

  if (!normalizedType) {
    throw new Error("Resurs turi kiritilishi kerak.");
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
    .not("status", "in", "(rejected,cancelled,completed)")
    .lt("start_time", endIso)
    .gt("end_time", startIso)
    .order("start_time", { ascending: true });

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

async function fetchBookingsOverlappingWindow(startIso, endIso, excludedStatuses = "(rejected,cancelled)") {
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, booking_label, name, phone, source, status, payment_status, total_price, estimated_price, date_start, date_end, start_time, end_time, created_at",
    )
    .not("status", "in", excludedStatuses)
    .lt("start_time", endIso)
    .gt("end_time", startIso)
    .order("start_time", { ascending: true });

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

async function fetchManagerExpensesRaw(limit = null) {
  let query = supabase
    .from("manager_expenses")
    .select("id, name, amount, manager_telegram_id, manager_chat_id, manager_username, created_at")
    .order("created_at", { ascending: false });

  if (Number.isInteger(limit) && limit > 0) {
    query = query.limit(limit);
  }

  try {
    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return Array.isArray(data) ? data.map(normalizeExpenseRecord) : [];
  } catch (error) {
    if (isMissingFinanceTableError(error)) {
      return [];
    }

    throw error;
  }
}

async function fetchManagerBalanceHandoffsRaw(limit = null) {
  let query = supabase
    .from("manager_balance_handoffs")
    .select("id, amount, note, manager_telegram_id, manager_chat_id, manager_username, created_at")
    .order("created_at", { ascending: false });

  if (Number.isInteger(limit) && limit > 0) {
    query = query.limit(limit);
  }

  try {
    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return Array.isArray(data) ? data.map(normalizeHandoffRecord) : [];
  } catch (error) {
    if (isMissingFinanceTableError(error)) {
      return [];
    }

    throw error;
  }
}

async function fetchPaidBookings() {
  const { data, error } = await supabase
    .from("bookings")
    .select("id, total_price, estimated_price, payment_status, status, created_at")
    .eq("payment_status", "paid")
    .not("status", "in", "(rejected,cancelled)");

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
    throw new Error("Narx qoidasi topilmadi.");
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

export async function listBookingsForManagerDay(dateText, { limit = 20 } = {}) {
  const normalizedDate = String(dateText ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
    throw new Error("Sana formati noto'g'ri.");
  }

  const { startIso, endIso } = buildUtcWindow(normalizedDate, addDays(normalizedDate, 1));
  const rows = await fetchBookingsOverlappingWindow(startIso, endIso);
  return rows.slice(0, limit).map(summarizeBooking);
}

export async function getBookingCalendarMonth(yearMonth = getCurrentYearMonth()) {
  const range = getMonthRange(yearMonth);
  const { startIso, endIso } = buildUtcWindow(range.startDate, range.endDateExclusive);
  const bookings = await fetchBookingsOverlappingWindow(startIso, endIso);
  const countsByDate = new Map();

  for (const booking of bookings) {
    const startDate = String(booking.date_start ?? "").trim();
    const endDateExclusive = getBookingEndDateExclusive(booking);

    if (!startDate || !endDateExclusive) {
      continue;
    }

    let cursor = startDate < range.startDate ? range.startDate : startDate;
    const stopDate = endDateExclusive < range.endDateExclusive ? endDateExclusive : range.endDateExclusive;

    while (cursor < stopDate) {
      countsByDate.set(cursor, (countsByDate.get(cursor) ?? 0) + 1);
      cursor = addDays(cursor, 1);
    }
  }

  const firstWeekOffset = getDateWeekdayIndex(range.startDate);
  const gridStartDate = addDays(range.startDate, -firstWeekOffset);
  const weeks = [];
  let cursor = gridStartDate;

  for (let weekIndex = 0; weekIndex < 6; weekIndex += 1) {
    const days = [];

    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      days.push({
        dateText: cursor,
        dayNumber: Number(cursor.slice(-2)),
        inMonth: cursor.startsWith(`${range.yearMonth}-`),
        bookingCount: countsByDate.get(cursor) ?? 0,
      });
      cursor = addDays(cursor, 1);
    }

    weeks.push(days);
  }

  return {
    yearMonth: range.yearMonth,
    label: range.label,
    startDate: range.startDate,
    endDateExclusive: range.endDateExclusive,
    weeks,
    totalBookings: bookings.length,
    daysWithBookings: Array.from(countsByDate.values()).filter((count) => count > 0).length,
  };
}

export async function listManagerExpenses({ limit = 12 } = {}) {
  return fetchManagerExpensesRaw(limit);
}

export async function listManagerBalanceHandoffs({ limit = 12 } = {}) {
  return fetchManagerBalanceHandoffsRaw(limit);
}

export async function getManagerBalanceSnapshot() {
  const today = getTodayTashkent();
  const [paidBookings, expenses, handoffs] = await Promise.all([
    fetchPaidBookings(),
    fetchManagerExpensesRaw(),
    fetchManagerBalanceHandoffsRaw(),
  ]);

  const totalRevenue = paidBookings.reduce(
    (sum, booking) => sum + Number(booking.total_price ?? booking.estimated_price ?? 0),
    0,
  );
  const totalExpenses = expenses.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
  const totalHandedOver = handoffs.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
  const currentBalance = Math.max(totalRevenue - totalExpenses - totalHandedOver, 0);
  const todayExpenseTotal = expenses
    .filter((item) => toTashkentDateText(item.createdAt) === today)
    .reduce((sum, item) => sum + Number(item.amount ?? 0), 0);

  return {
    totalRevenue,
    totalExpenses,
    totalHandedOver,
    currentBalance,
    todayExpenseTotal,
    managerEarningsTotal: Math.round(totalRevenue * 0.25),
    managerEarningsCurrent: Math.round(currentBalance * 0.25),
    paidBookingCount: paidBookings.length,
    expenseCount: expenses.length,
    handoffCount: handoffs.length,
    recentExpenses: expenses.slice(0, 8),
    recentHandoffs: handoffs.slice(0, 8),
  };
}

export async function addManagerExpense({ name, amount, actor = {} }) {
  const normalizedName = String(name ?? "").trim();
  const normalizedAmount = Number(amount);

  if (!normalizedName) {
    throw new Error("Xarajat nomi kiritilishi kerak.");
  }

  if (!Number.isInteger(normalizedAmount) || normalizedAmount <= 0) {
    throw new Error("Xarajat summasi musbat butun son bo'lishi kerak.");
  }

  const snapshotBefore = await getManagerBalanceSnapshot();

  if (snapshotBefore.currentBalance <= 0) {
    throw new Error("Balans nol. Xarajat kiritishdan oldin tushum bo'lishi kerak.");
  }

  if (normalizedAmount > snapshotBefore.currentBalance) {
    throw new Error(`Xarajat summasi balansdan katta. Hozirgi balans: ${formatPrice(snapshotBefore.currentBalance)} UZS.`);
  }

  const manager = normalizeManagerActor(actor);
  const { data, error } = await supabase
    .from("manager_expenses")
    .insert({
      name: normalizedName,
      amount: normalizedAmount,
      manager_telegram_id: manager.managerTelegramId,
      manager_chat_id: manager.managerChatId,
      manager_username: manager.managerUsername || null,
    })
    .select("id, name, amount, manager_telegram_id, manager_chat_id, manager_username, created_at")
    .single();

  if (error) {
    if (isMissingFinanceTableError(error)) {
      throw new Error("Balance moduli uchun yangi migration hali bazaga qo'llanmagan.");
    }

    throw error;
  }

  return {
    expense: normalizeExpenseRecord(data),
    snapshotBefore,
    snapshotAfter: await getManagerBalanceSnapshot(),
  };
}

export async function handOverBalanceToOwner({ actor = {}, note = "Topshirildi" } = {}) {
  const snapshotBefore = await getManagerBalanceSnapshot();

  if (snapshotBefore.currentBalance <= 0) {
    throw new Error("Topshirish uchun balansda mablag' yo'q.");
  }

  const manager = normalizeManagerActor(actor);
  const { data, error } = await supabase
    .from("manager_balance_handoffs")
    .insert({
      amount: snapshotBefore.currentBalance,
      note: String(note ?? "").trim() || "Topshirildi",
      manager_telegram_id: manager.managerTelegramId,
      manager_chat_id: manager.managerChatId,
      manager_username: manager.managerUsername || null,
    })
    .select("id, amount, note, manager_telegram_id, manager_chat_id, manager_username, created_at")
    .single();

  if (error) {
    if (isMissingFinanceTableError(error)) {
      throw new Error("Balance moduli uchun yangi migration hali bazaga qo'llanmagan.");
    }

    throw error;
  }

  return {
    handoff: normalizeHandoffRecord(data),
    snapshotBefore,
    snapshotAfter: await getManagerBalanceSnapshot(),
  };
}

export async function getBusinessAnalytics(period = "today") {
  const range = getPeriodRange(period);
  const { startIso, endIso } = buildUtcWindow(range.startDate, range.endDateExclusive);
  const [resources, bookings] = await Promise.all([fetchResources(), fetchBookingsBetween(startIso, endIso)]);

  const activeResources = resources.filter((item) => item.is_active);
  const roomResources = activeResources.filter((item) => item.type.startsWith("room_"));
  const tapchanResources = activeResources.filter((item) => item.type.startsWith("tapchan_"));
  const bookingSummaries = bookings.map(summarizeBooking);
  const confirmedBookings = bookingSummaries.filter((item) => item.trackingStatus === "confirmed" || item.trackingStatus === "checked_in");
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
    insights.push("Bandlik past. Hafta ichidagi tapchanlar uchun chegirma ko'rib chiqing.");
  }

  if (peakDemand) {
    insights.push("Talab yuqori. Dam olish kunlari narxini oshirishni ko'rib chiqing.");
  }

  if (unusedResources.some((item) => item.type.startsWith("tapchan_"))) {
    insights.push("Bo'sh tapchanlar bor. Past talab kunlari uchun aksiya paketlarini sinab ko'ring.");
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
      roomOccupancyRate === 0 && tapchanUtilizationRate === 0 ? "Tanlangan davrda tasdiqlangan foydalanish ko'rinmadi." : "",
      cancellationRate > 25 ? "Bekor qilish darajasi yuqori." : "",
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
      proofPending.length > 5 ? "Tasdiq kutayotgan cheklar soni ko'paygan." : "",
      todayOverview.availableNow === 0 ? "Hozircha bo'sh resurs qolmagan." : "",
    ].filter(Boolean),
  };
}

export async function exportBookingHistoryCsv() {
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, booking_label, name, phone, email, source, status, payment_status, guests, total_price, estimated_price, date_start, date_end, created_at, booking_resources(resource_id, resources(name, type, capacity))",
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  const bookings = Array.isArray(data) ? data : [];
  const rows = [
    [
      "booking_id",
      "booking_label",
      "customer_name",
      "phone",
      "email",
      "source",
      "tracking_status",
      "status",
      "payment_status",
      "guests",
      "date_start",
      "date_end",
      "total_price",
      "created_at",
      "resources",
    ].map(csvCell).join(","),
  ];

  for (const booking of bookings) {
    const items = Array.isArray(booking.booking_resources) ? booking.booking_resources : [];
    const resources = items
      .map((item) => {
        const resource = item.resources ?? {};
        return `${String(resource.name ?? "Resurs")} (${String(resource.type ?? "")}, ${Number(resource.capacity ?? 0)})`;
      })
      .join("; ");

    rows.push([
      booking.id,
      booking.booking_label,
      booking.name,
      booking.phone,
      booking.email,
      booking.source,
      normalizeTrackingStatus(booking),
      booking.status,
      booking.payment_status,
      booking.guests,
      booking.date_start,
      booking.date_end ?? "",
      Number(booking.total_price ?? booking.estimated_price ?? 0),
      booking.created_at,
      resources,
    ].map(csvCell).join(","));
  }

  return {
    filename: `booking-history-${getTodayTashkent()}.csv`,
    buffer: Buffer.from(`\uFEFF${rows.join("\n")}`, "utf8"),
    count: bookings.length,
  };
}

export async function listReportRecipients() {
  const { data, error } = await supabase
    .from("report_recipients")
    .select("id, label, telegram_handle, phone, telegram_chat_id, is_active, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data.map((item) => ({
    id: String(item.id),
    label: String(item.label ?? "").trim(),
    telegramHandle: String(item.telegram_handle ?? "").trim(),
    phone: String(item.phone ?? "").trim(),
    telegramChatId: item.telegram_chat_id ? Number(item.telegram_chat_id) : null,
    isActive: Boolean(item.is_active),
    createdAt: String(item.created_at ?? ""),
    updatedAt: String(item.updated_at ?? ""),
  })) : [];
}

export async function addReportRecipient({ telegramHandle = "", phone = "", label = "" }) {
  const normalizedHandle = normalizeTelegramHandle(telegramHandle);
  const normalizedPhone = normalizePhone(phone);

  if (!normalizedHandle && !normalizedPhone) {
    throw new Error("Telegram username yoki telefon raqami kerak.");
  }

  const { data, error } = await supabase
    .from("report_recipients")
    .insert({
      label: String(label ?? "").trim() || null,
      telegram_handle: normalizedHandle || null,
      phone: normalizedPhone || null,
      is_active: true,
    })
    .select("id, label, telegram_handle, phone, telegram_chat_id, is_active, created_at, updated_at")
    .single();

  if (error) {
    throw error;
  }

  return {
    id: String(data.id),
    label: String(data.label ?? "").trim(),
    telegramHandle: String(data.telegram_handle ?? "").trim(),
    phone: String(data.phone ?? "").trim(),
    telegramChatId: data.telegram_chat_id ? Number(data.telegram_chat_id) : null,
    isActive: Boolean(data.is_active),
    createdAt: String(data.created_at ?? ""),
    updatedAt: String(data.updated_at ?? ""),
  };
}

export async function removeReportRecipient(id) {
  const { error } = await supabase
    .from("report_recipients")
    .delete()
    .eq("id", id);

  if (error) {
    throw error;
  }
}

export async function linkReportRecipientFromTelegram({ chatId, username = "", phone = "" }) {
  const normalizedHandle = normalizeTelegramHandle(username);
  const normalizedPhone = normalizePhone(phone);

  if (!chatId || (!normalizedHandle && !normalizedPhone)) {
    return null;
  }

  let query = supabase
    .from("report_recipients")
    .select("id, label, telegram_handle, phone, telegram_chat_id, is_active, created_at, updated_at")
    .eq("is_active", true);

  if (normalizedHandle && normalizedPhone) {
    query = query.or(`telegram_handle.eq.${normalizedHandle},phone.eq.${normalizedPhone}`);
  } else if (normalizedHandle) {
    query = query.eq("telegram_handle", normalizedHandle);
  } else {
    query = query.eq("phone", normalizedPhone);
  }

  const { data, error } = await query.limit(1).maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const { data: updated, error: updateError } = await supabase
    .from("report_recipients")
    .update({
      telegram_chat_id: Number(chatId),
      updated_at: new Date().toISOString(),
    })
    .eq("id", data.id)
    .select("id, label, telegram_handle, phone, telegram_chat_id, is_active, created_at, updated_at")
    .single();

  if (updateError) {
    throw updateError;
  }

  return {
    id: String(updated.id),
    label: String(updated.label ?? "").trim(),
    telegramHandle: String(updated.telegram_handle ?? "").trim(),
    phone: String(updated.phone ?? "").trim(),
    telegramChatId: updated.telegram_chat_id ? Number(updated.telegram_chat_id) : null,
    isActive: Boolean(updated.is_active),
    createdAt: String(updated.created_at ?? ""),
    updatedAt: String(updated.updated_at ?? ""),
  };
}

export async function getDailyReportRecipients() {
  const recipients = await listReportRecipients();
  return recipients.filter((item) => item.isActive && Number.isInteger(item.telegramChatId) && item.telegramChatId > 0);
}

export async function buildDailyReportMessage() {
  const [analytics, systemStatus, balance] = await Promise.all([
    getBusinessAnalytics("today"),
    getSystemStatus(),
    getManagerBalanceSnapshot(),
  ]);

  return [
    "Kunlik biznes hisobot",
    "",
    formatAnalyticsForTelegram(analytics),
    "",
    `Balans: ${formatPrice(balance.currentBalance)} UZS`,
    `Xarajatlar: ${formatPrice(balance.totalExpenses)} UZS`,
    `Ownerga topshirilgan: ${formatPrice(balance.totalHandedOver)} UZS`,
    balance.recentExpenses.length > 0
      ? `So'nggi xarajatlar: ${balance.recentExpenses.slice(0, 3).map((item) => `${item.name} ${formatPrice(item.amount)}`).join(", ")}`
      : "So'nggi xarajatlar: yo'q",
    "",
    `Tizim holati: faol ${systemStatus.activeResources}, kutilayotgan ${systemStatus.pendingBookings}, tasdiq kutilmoqda ${systemStatus.awaitingConfirmation}`,
  ].join("\n");
}

export function formatReportRecipientsForTelegram(recipients) {
  if (!recipients.length) {
    return [
      "Hisobot qabul qiluvchilar yo'q.",
      "",
      "Manager bu yerdan @username yoki telefon raqam qo'shishi mumkin.",
      "Username bo'yicha ishlashi uchun owner botga bir marta /start yuborishi kerak.",
      "Telefon bo'yicha ishlashi uchun owner botga kontaktini yuborishi kerak.",
    ].join("\n");
  }

  return [
    "Hisobot qabul qiluvchilar",
    "",
    ...recipients.map((item, index) => {
      const target = item.telegramHandle ? `@${item.telegramHandle}` : item.phone || "Noma'lum";
      const status = item.telegramChatId ? "bog'langan" : "ulanish kutilmoqda";
      return `${index + 1}. ${item.label || target} | ${target} | ${status}`;
    }),
  ].join("\n");
}

export function formatAnalyticsForTelegram(summary) {
  return [
    `📊 ${summary.period} analitikasi`,
    "",
    `💰 Tushum: ${formatPrice(summary.revenue)} UZS`,
    `📚 Bronlar: ${summary.bookingCount}`,
    `🛏 Xona bandligi: ${summary.roomOccupancyRate}%`,
    `🪑 Tapchan bandligi: ${summary.tapchanUtilizationRate}%`,
    `❌ Bekor qilish darajasi: ${summary.cancellationRate}%`,
    `📦 Ishlatilmagan sig'im: ${summary.unusedCapacity}`,
    `🌐 Manbalar: ${Object.entries(summary.bookingSources).map(([key, value]) => `${key} ${value}`).join(", ") || "yo'q"}`,
    summary.issues.length > 0 ? `⚠️ Muammolar: ${summary.issues.join("; ")}` : "⚠️ Muammolar: yo'q",
    summary.insights.length > 0 ? `💡 Tavsiyalar: ${summary.insights.join("; ")}` : "💡 Tavsiyalar: hozircha yo'q",
  ].join("\n");
}

export function formatAvailabilityForTelegram(overview) {
  const lines = [
    `📍 ${overview.date} uchun bandlik`,
    "",
    `Faol resurslar: ${overview.activeResources}`,
    `Hozir bo'sh: ${overview.availableNow}`,
    `Hozir band: ${overview.bookedNow}`,
    `Yaqin bronlar: ${overview.upcomingBookings}`,
    "",
  ];

  for (const resource of overview.resources.slice(0, 20)) {
    lines.push(
      `${resource.name} - ${resource.is_active ? (resource.bookedNow ? "band" : "bo'sh") : "o'chirilgan"} - sig'im ${resource.capacity}`,
    );
  }

  return lines.join("\n");
}
