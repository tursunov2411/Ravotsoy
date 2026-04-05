import { createTelegramClient, formatAxiosError, readOptionalEnv } from "./shared.js";
import {
  approveBookingManually,
  approveBookingProof,
  cancelBookingManually,
  fetchBookingContext,
  loadLatestProofAsset,
  rejectBookingManually,
  rejectBookingProof,
  moveBookingDatesManually,
  setBookingCheckedIn,
  setBookingCompleted,
  updateBookingPriceManually,
} from "../services/proofService.js";
import {
  addReportRecipient,
  buildDailyReportMessage,
  createResource,
  exportBookingHistoryCsv,
  formatAnalyticsForTelegram,
  formatAvailabilityForTelegram,
  formatReportRecipientsForTelegram,
  getDailyReportRecipients,
  getBusinessAnalytics,
  getResourceOverview,
  getSitePaymentSettings,
  getSystemStatus,
  linkReportRecipientFromTelegram,
  listBookingsForManager,
  listPricingRules,
  listReportRecipients,
  removeReportRecipient,
  updateSitePaymentSettings,
  updatePricingRuleValues,
  updateResourceDetails,
} from "../services/businessOps.js";
import { deleteServiceMedia, getLatestServiceMedia, replaceServiceMedia } from "../services/mediaLibrary.js";
import { createOfflineBooking, getTripBuilderOptions } from "../services/bookingEngine.js";
import {
  clearManagerDecisionKeyboard,
  notifyCustomerAboutDecision,
  sendManagerProofPreview,
} from "../services/managerNotifications.js";

const BUTTONS = {
  bookings: "📚 Bronlar",
  resources: "🏡 Resurslar",
  pricing: "💵 Narxlar",
  payments: "💳 To'lov sozlamalari",
  offline: "🧍 Offlayn mehmonlar",
  analytics: "📊 Analitika",
  report: "🗂 Hisobotlar",
  status: "🛠 Tizim holati",
};

const ACTIONS = {
  view: "view_",
  approve: "approve_",
  reject: "reject_",
  bookings: "mbook_",
  analytics: "manal_",
  availability: "mavail_",
  resource: "mres_",
  resourceToggle: "mres_t_",
  resourceCapUp: "mres_cu_",
  resourceCapDown: "mres_cd_",
  resourceImageUpload: "mres_img_up_",
  resourceImageDelete: "mres_img_del_",
  bookingDetail: "mbook_detail_",
  bookingFree: "mbook_free_",
  bookingCheckIn: "mbook_checkin_",
  bookingLeft: "mbook_left_",
  bookingMoveDate: "mbook_move_",
  bookingPrice: "mbook_price_",
  pricing: "mpr_",
  pricingBaseUp: "mpr_bu_",
  pricingBaseDown: "mpr_bd_",
  pricingExtraUp: "mpr_eu_",
  pricingExtraDown: "mpr_ed_",
  pricingIncludedUp: "mpr_iu_",
  pricingIncludedDown: "mpr_id_",
  pricingDiscountUp: "mpr_du_",
  pricingDiscountDown: "mpr_dd_",
  report: "mrep_",
  reportRecipientDelete: "mrep_del_",
  payment: "mpay_",
  offline: "moff_",
  offlineType: "moff_t_",
  offlineIncludeTapchan: "moff_it_",
  offlineQuantity: "moff_q_",
  offlineDate: "moff_d_",
  offlineDuration: "moff_n_",
  main: "mmain_",
  resourceCreate: "mres_new_",
  backMain: "mback_main",
};

const RESOURCE_TEMPLATES = [
  { type: "room_small", shortLabel: "➕ Kichik xona", capacity: 2, namePrefix: "Kichik xona" },
  { type: "room_big", shortLabel: "➕ Katta xona", capacity: 4, namePrefix: "Katta xona" },
  { type: "tapchan_small", shortLabel: "➕ Kichik tapchan", capacity: 4, namePrefix: "Kichik tapchan" },
  { type: "tapchan_big", shortLabel: "➕ Katta tapchan", capacity: 6, namePrefix: "Katta tapchan" },
  { type: "tapchan_very_big", shortLabel: "➕ VIP tapchan", capacity: 8, namePrefix: "VIP tapchan" },
];

function isStartCommand(text) {
  return /^\/start(?:@\w+)?(?:\s|$)/i.test(text);
}

function isHelpCommand(text) {
  return /^\/help(?:@\w+)?(?:\s|$)/i.test(String(text ?? "").trim());
}

function getBookingId(callbackData, prefix) {
  const data = String(callbackData ?? "");
  return data.startsWith(prefix) ? data.slice(prefix.length) : "";
}

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
  const date = new Date(`${dateText}T00:00:00+05:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function buildMainKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: BUTTONS.bookings, callback_data: `${ACTIONS.main}bookings` },
        { text: BUTTONS.resources, callback_data: `${ACTIONS.main}resources` },
      ],
      [
        { text: BUTTONS.pricing, callback_data: `${ACTIONS.main}pricing` },
        { text: BUTTONS.analytics, callback_data: `${ACTIONS.main}analytics` },
      ],
      [
        { text: BUTTONS.payments, callback_data: `${ACTIONS.main}payments` },
        { text: BUTTONS.offline, callback_data: `${ACTIONS.main}offline` },
      ],
      [
        { text: BUTTONS.report, callback_data: `${ACTIONS.main}report` },
      ],
      [
        { text: BUTTONS.status, callback_data: `${ACTIONS.main}status` },
      ],
    ],
  };
}

function buildBookingsKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "🕓 Kutilmoqda", callback_data: `${ACTIONS.bookings}pending` },
        { text: "🧾 Chek tekshiruvi", callback_data: `${ACTIONS.bookings}awaiting` },
      ],
      [
        { text: "✅ Tasdiqlangan", callback_data: `${ACTIONS.bookings}confirmed` },
        { text: "❌ Rad etilgan", callback_data: `${ACTIONS.bookings}rejected` },
      ],
      [
        { text: "🏁 Mehmon ichkarida", callback_data: `${ACTIONS.bookings}checked_in` },
        { text: "👋 Yakunlangan", callback_data: `${ACTIONS.bookings}completed` },
      ],
      [
        { text: "📅 Bugun", callback_data: `${ACTIONS.bookings}today` },
        { text: "📆 Ertaga", callback_data: `${ACTIONS.bookings}tomorrow` },
      ],
      [
        { text: "🌐 Sayt", callback_data: `${ACTIONS.bookings}src:website` },
        { text: "💬 Telegram", callback_data: `${ACTIONS.bookings}src:telegram` },
      ],
      [
        { text: "⬇️ CSV yuklash", callback_data: `${ACTIONS.report}download_history` },
        { text: "🔙 Orqaga", callback_data: ACTIONS.backMain },
      ],
    ],
  };
}

function buildAnalyticsKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "📅 Bugun", callback_data: `${ACTIONS.analytics}today` },
        { text: "🗓 Shu hafta", callback_data: `${ACTIONS.analytics}week` },
        { text: "🗓 Shu oy", callback_data: `${ACTIONS.analytics}month` },
      ],
      [
        { text: "🏡 Bugungi bandlik", callback_data: `${ACTIONS.availability}today` },
        { text: "🌤 Ertangi bandlik", callback_data: `${ACTIONS.availability}tomorrow` },
      ],
      [{ text: "🔙 Orqaga", callback_data: ACTIONS.backMain }],
    ],
  };
}

function buildReportKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "🌙 Bugungi hisobot", callback_data: `${ACTIONS.report}send_today` },
        { text: "⬇️ Bronlar CSV", callback_data: `${ACTIONS.report}download_history` },
      ],
      [
        { text: "👤 Qabul qiluvchilar", callback_data: `${ACTIONS.report}recipients` },
        { text: "🔙 Orqaga", callback_data: ACTIONS.backMain },
      ],
    ],
  };
}

function buildReportRecipientsKeyboard(recipients) {
  return {
    inline_keyboard: [
      [{ text: "➕ @username qo'shish", callback_data: `${ACTIONS.report}add_username` }],
      [{ text: "➕ Telefon qo'shish", callback_data: `${ACTIONS.report}add_phone` }],
      ...recipients.slice(0, 10).map((item) => [
        {
          text: `🗑 O'chirish: ${item.label || item.telegramHandle || item.phone || item.id}`,
          callback_data: `${ACTIONS.reportRecipientDelete}${item.id}`,
        },
      ]),
      [{ text: "🔙 Orqaga", callback_data: `${ACTIONS.report}menu` }],
    ],
  };
}

function buildBookingDetailKeyboard(booking) {
  const rows = [];
  const isPending = booking.rawStatus === "pending" || booking.rawStatus === "proof_submitted";
  const isConfirmed = booking.rawStatus === "confirmed";
  const isCheckedIn = booking.rawStatus === "checked_in";
  const isClosed = ["rejected", "cancelled", "completed"].includes(booking.rawStatus);

  if (booking.hasProof) {
    rows.push([{ text: "🧾 Chekni ko'rish", callback_data: `${ACTIONS.view}${booking.id}` }]);
  }

  if (isPending) {
    rows.push([
      { text: "✅ Tasdiqlash", callback_data: `${ACTIONS.approve}${booking.id}` },
      { text: "❌ Rad etish", callback_data: `${ACTIONS.reject}${booking.id}` },
    ]);
  }

  if (isConfirmed) {
    rows.push([{ text: "🏁 Mehmon check-in qildi", callback_data: `${ACTIONS.bookingCheckIn}${booking.id}` }]);
  }

  if (isCheckedIn) {
    rows.push([{ text: "👋 Mehmon ketdi", callback_data: `${ACTIONS.bookingLeft}${booking.id}` }]);
  }

  if (!isClosed) {
    rows.push([
      { text: "📅 Boshqa sanaga ko'chirish", callback_data: `${ACTIONS.bookingMoveDate}${booking.id}` },
      { text: "💵 Narx o'zgardi", callback_data: `${ACTIONS.bookingPrice}${booking.id}` },
    ]);
    rows.push([{ text: "🔓 Joyni bo'shatish / bekor qilish", callback_data: `${ACTIONS.bookingFree}${booking.id}` }]);
  }

  rows.push([{ text: "📚 Bronlar ro'yxati", callback_data: `${ACTIONS.main}bookings` }]);
  rows.push([{ text: "🔙 Orqaga", callback_data: ACTIONS.backMain }]);
  return { inline_keyboard: rows };
}

function buildBookingListKeyboard(bookings) {
  return {
    inline_keyboard: [
      ...bookings.slice(0, 10).map((booking) => [
        {
          text: `👁 ${booking.bookingLabel}`,
          callback_data: `${ACTIONS.bookingDetail}${booking.id}`,
        },
      ]),
      [{ text: "🔙 Orqaga", callback_data: ACTIONS.backMain }],
    ],
  };
}

function buildPaymentSettingsKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "💳 Karta raqami", callback_data: `${ACTIONS.payment}card_number` },
        { text: "👤 Karta egasi", callback_data: `${ACTIONS.payment}card_holder` },
      ],
      [
        { text: "💬 To'lov Telegram", callback_data: `${ACTIONS.payment}manager_telegram` },
        { text: "📝 Ko'rsatma", callback_data: `${ACTIONS.payment}instructions` },
      ],
      [{ text: "🔙 Orqaga", callback_data: ACTIONS.backMain }],
    ],
  };
}

function buildOfflineMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "➕ Offlayn bron qo'shish", callback_data: `${ACTIONS.offline}new` }],
      [{ text: "📚 Offlayn bronlar", callback_data: `${ACTIONS.offline}list` }],
      [{ text: "🔙 Orqaga", callback_data: ACTIONS.backMain }],
    ],
  };
}

function buildOfflineTypeKeyboard(options) {
  return {
    inline_keyboard: [
      ...options.map((option) => [
        {
          text: `${option.label} (${option.availableUnits})`,
          callback_data: `${ACTIONS.offlineType}${option.resourceType}`,
        },
      ]),
      [{ text: "🔙 Orqaga", callback_data: `${ACTIONS.offline}menu` }],
    ],
  };
}

function buildOfflineTapchanKeyboard(resourceType) {
  return {
    inline_keyboard: [
      [
        { text: "🌿 Tapchan bilan", callback_data: `${ACTIONS.offlineIncludeTapchan}${resourceType}:with` },
        { text: "🏠 Tapchansiz", callback_data: `${ACTIONS.offlineIncludeTapchan}${resourceType}:without` },
      ],
      [{ text: "🔙 Orqaga", callback_data: `${ACTIONS.offline}new` }],
    ],
  };
}

function buildOfflineQuantityKeyboard(resourceType, maxQuantity) {
  const quantityButtons = Array.from({ length: Math.max(Math.min(maxQuantity, 6), 1) }, (_, index) => ({
    text: `${index + 1}`,
    callback_data: `${ACTIONS.offlineQuantity}${resourceType}:${index + 1}`,
  }));

  return {
    inline_keyboard: [
      quantityButtons,
      [{ text: "🔙 Orqaga", callback_data: `${ACTIONS.offline}new` }],
    ],
  };
}

function buildOfflineDateKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "📅 Bugun", callback_data: `${ACTIONS.offlineDate}today` },
        { text: "📆 Ertaga", callback_data: `${ACTIONS.offlineDate}tomorrow` },
      ],
      [{ text: "🗓 Sana yozaman", callback_data: `${ACTIONS.offlineDate}custom` }],
      [{ text: "🔙 Orqaga", callback_data: `${ACTIONS.offline}new` }],
    ],
  };
}

function buildOfflineDurationKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "1 kecha", callback_data: `${ACTIONS.offlineDuration}1` },
        { text: "2 kecha", callback_data: `${ACTIONS.offlineDuration}2` },
        { text: "3 kecha", callback_data: `${ACTIONS.offlineDuration}3` },
      ],
      [{ text: "🔙 Orqaga", callback_data: `${ACTIONS.offline}new` }],
    ],
  };
}

function buildResourcesKeyboard(resources) {
  return {
    inline_keyboard: [
      ...resources.map((resource) => [
        {
          text: `${resource.name} ${resource.is_active ? "on" : "off"}`,
          callback_data: `${ACTIONS.resource}${resource.id}`,
        },
      ]),
      RESOURCE_TEMPLATES.slice(0, 2).map((item) => ({
        text: item.shortLabel,
        callback_data: `${ACTIONS.resourceCreate}${item.type}`,
      })),
      RESOURCE_TEMPLATES.slice(2, 4).map((item) => ({
        text: item.shortLabel,
        callback_data: `${ACTIONS.resourceCreate}${item.type}`,
      })),
      [{ text: RESOURCE_TEMPLATES[4].shortLabel, callback_data: `${ACTIONS.resourceCreate}${RESOURCE_TEMPLATES[4].type}` }],
      [{ text: "🔙 Orqaga", callback_data: ACTIONS.backMain }],
    ],
  };
}

function buildResourceDetailKeyboard(resource) {
  return {
    inline_keyboard: [
      [
        { text: "➖ Sig'im", callback_data: `${ACTIONS.resourceCapDown}${resource.id}` },
        { text: "➕ Sig'im", callback_data: `${ACTIONS.resourceCapUp}${resource.id}` },
      ],
      [
        { text: "🖼 Rasm yuklash", callback_data: `${ACTIONS.resourceImageUpload}${resource.id}` },
        { text: "🗑 Rasm o'chirish", callback_data: `${ACTIONS.resourceImageDelete}${resource.id}` },
      ],
      [
        {
          text: resource.is_active ? "⛔ O'chirish" : "✅ Yoqish",
          callback_data: `${ACTIONS.resourceToggle}${resource.id}`,
        },
      ],
      [
        { text: "🏡 Resurslar", callback_data: `${ACTIONS.resource}menu` },
        { text: "🔙 Orqaga", callback_data: ACTIONS.backMain },
      ],
    ],
  };
}

function buildPricingKeyboard(rules) {
  return {
    inline_keyboard: [
      ...rules.map((rule) => [
        { text: rule.resourceType, callback_data: `${ACTIONS.pricing}${rule.resourceType}` },
      ]),
      [{ text: "🔙 Orqaga", callback_data: ACTIONS.backMain }],
    ],
  };
}

function buildPricingDetailKeyboard(rule) {
  const rows = [
    [
      { text: "Asosiy -10k", callback_data: `${ACTIONS.pricingBaseDown}${rule.resourceType}` },
      { text: "Asosiy +10k", callback_data: `${ACTIONS.pricingBaseUp}${rule.resourceType}` },
    ],
    [
      { text: "Qo'shimcha -5k", callback_data: `${ACTIONS.pricingExtraDown}${rule.resourceType}` },
      { text: "Qo'shimcha +5k", callback_data: `${ACTIONS.pricingExtraUp}${rule.resourceType}` },
    ],
    [
      { text: "Kiritilgan -1", callback_data: `${ACTIONS.pricingIncludedDown}${rule.resourceType}` },
      { text: "Kiritilgan +1", callback_data: `${ACTIONS.pricingIncludedUp}${rule.resourceType}` },
    ],
  ];

  if (rule.includesTapchan) {
    rows.push([
      { text: "Chegirma -5%", callback_data: `${ACTIONS.pricingDiscountDown}${rule.resourceType}` },
      { text: "Chegirma +5%", callback_data: `${ACTIONS.pricingDiscountUp}${rule.resourceType}` },
    ]);
  }

  rows.push([
    { text: "💵 Narxlar", callback_data: `${ACTIONS.pricing}menu` },
    { text: "🔙 Orqaga", callback_data: ACTIONS.backMain },
  ]);

  return { inline_keyboard: rows };
}

function formatBookingList(title, bookings) {
  if (bookings.length === 0) {
    return `${title}\n\nHozircha bronlar topilmadi.`;
  }

  return [
    title,
    "",
    ...bookings.map((booking) =>
      [
        `🧾 ${booking.bookingLabel}`,
        `ID: ${booking.id}`,
        `Holat: ${booking.trackingStatus}`,
        `Manba: ${booking.source}`,
        `Sana: ${booking.dateStart}${booking.dateEnd ? ` - ${booking.dateEnd}` : ""}`,
        `Narx: ${formatPrice(booking.totalPrice)} UZS`,
      ].join("\n")),
  ].join("\n\n");
}

function formatResourceDetail(resource, overview) {
  return [
    "🏡 Resurs tafsilotlari",
    "",
    `Nomi: ${resource.name}`,
    `Turi: ${resource.type}`,
    `Sig'imi: ${resource.capacity}`,
    `Holati: ${resource.is_active ? "faol" : "o'chirilgan"}`,
    `Rasm: ${resource.imageUrl ? "bor" : "yo'q"}`,
    `Hozir band emas: ${resource.is_active && !resource.bookedNow ? "ha" : "yo'q"}`,
    `Yaqin bronlar: ${resource.upcomingBookings}`,
    "",
    `Faol resurslar: ${overview.activeResources}`,
    `Hozir band: ${overview.bookedNow}`,
    `Hozir bo'sh: ${overview.availableNow}`,
  ].join("\n");
}

function formatPricingDetail(rule) {
  return [
    "💵 Narx boshqaruvi",
    "",
    `Resurs turi: ${rule.resourceType}`,
    `Asosiy narx: ${formatPrice(rule.basePrice)} UZS`,
    `Qo'shimcha odam: ${formatPrice(rule.extraPersonPrice)} UZS`,
    `Kiritilgan odam: ${rule.maxIncludedPeople}`,
    `Chegirma: ${Math.round(rule.discountIfExcluded * 100)}%`,
  ].join("\n");
}

function formatSystemStatus(status) {
  return [
    "🛠 Tizim holati",
    "",
    `Faol resurslar: ${status.activeResources}`,
    `Nofaol resurslar: ${status.inactiveResources}`,
    `Kutilayotgan bronlar: ${status.pendingBookings}`,
    `Tasdiq kutilmoqda: ${status.awaitingConfirmation}`,
    `Hozir bo'sh: ${status.availableNow}`,
    `Hozir band: ${status.bookedNow}`,
    `Muammolar: ${status.issues.join("; ") || "yo'q"}`,
  ].join("\n");
}

function formatBookingDetail(booking) {
  return [
    "🧾 Bron tafsilotlari",
    "",
    `ID: ${booking.id}`,
    `Mijoz: ${booking.name || "Ko'rsatilmagan"}`,
    `Telefon: ${booking.phone || "Ko'rsatilmagan"}`,
    `Tanlov: ${booking.bookingLabel}`,
    `Holat: ${booking.statusLabel || booking.trackingStatus}`,
    `To'lov holati: ${booking.paymentStatus}`,
    `Manba: ${booking.source}`,
    `Sana: ${booking.dateStart}${booking.dateEnd ? ` - ${booking.dateEnd}` : ""}`,
    `Narx: ${formatPrice(booking.totalPrice)} UZS`,
    `Chek: ${booking.proofUrl ? "bor" : "yo'q"}`,
    booking.proofUrl ? `Chek havolasi: ${booking.proofUrl}` : "",
  ].filter(Boolean).join("\n");
}

function formatPaymentSettings(settings) {
  return [
    "💳 To'lov sozlamalari",
    "",
    `Karta raqami: ${settings.cardNumber || "kiritilmagan"}`,
    `Karta egasi: ${settings.cardHolder || "kiritilmagan"}`,
    `To'lov Telegram: ${settings.managerTelegram || "kiritilmagan"}`,
    `Ko'rsatma: ${settings.instructions || "kiritilmagan"}`,
    `Oldindan to'lov: ${Math.round(Number(settings.depositRatio ?? 0.3) * 100)}%`,
    "",
    "Pastdagi tugma orqali kerakli maydonni yangilang.",
  ].join("\n");
}

export function createManagerBot() {
  const managerToken = readOptionalEnv("MANAGER_BOT_TOKEN");
  const telegram = managerToken ? createTelegramClient(managerToken) : null;
  const pendingImageUploads = new Map();
  const pendingRecipientInputs = new Map();
  const pendingPaymentInputs = new Map();
  const pendingOfflineBookings = new Map();
  const pendingBookingEdits = new Map();

  async function sendManagerMessage(chatId, text, extra = {}) {
    if (!telegram) {
      console.warn("Manager bot update received, but MANAGER_BOT_TOKEN is not configured.");
      return;
    }

    await telegram.sendMessage(chatId, text, extra);
  }

  async function answerCallbackQuery(callbackQueryId, text) {
    if (!telegram) {
      return;
    }

    try {
      await telegram.answerCallbackQuery(callbackQueryId, text);
    } catch (error) {
      console.error(`Manager callback acknowledgement failed: ${formatAxiosError(error)}`);
    }
  }

  async function showMainMenu(chatId, text = "👋 Manager panel tayyor.") {
    await sendManagerMessage(chatId, text, {
      reply_markup: buildMainKeyboard(),
    });
  }

  async function showBookingsMenu(chatId) {
    await sendManagerMessage(chatId, "📚 Bronlar bo'limi\n\nKerakli filtrni tanlang yoki CSV faylni yuklab oling.", {
      reply_markup: buildBookingsKeyboard(),
    });
  }

  async function showResourcesMenu(chatId) {
    const overview = await getResourceOverview();
    await sendManagerMessage(chatId, `🏡 Resurslar nazorati\n\n${formatAvailabilityForTelegram(overview)}\n\nPastdagi tugmalar orqali tez qo'shish ham mumkin.`, {
      reply_markup: buildResourcesKeyboard(overview.resources.slice(0, 20)),
    });
  }

  async function showPricingMenu(chatId) {
    const rules = await listPricingRules();
    await sendManagerMessage(chatId, "💵 Narx boshqaruvi\n\nResurs turini tanlang va qiymatlarni tugmalar bilan yangilang.", {
      reply_markup: buildPricingKeyboard(rules),
    });
  }

  async function showAnalyticsMenu(chatId) {
    await sendManagerMessage(chatId, "📊 Analitika markazi\n\nDavrni tanlang va tizim ko'rsatkichlarini ko'ring.", {
      reply_markup: buildAnalyticsKeyboard(),
    });
  }

  async function showPaymentSettingsMenu(chatId) {
    const settings = await getSitePaymentSettings();
    await sendManagerMessage(chatId, formatPaymentSettings(settings), {
      reply_markup: buildPaymentSettingsKeyboard(),
    });
  }

  async function showReportMenu(chatId) {
    const recipients = await getDailyReportRecipients();
    await sendManagerMessage(chatId, [
      "🗂 Hisobotlar markazi",
      "",
      `Ulangan qabul qiluvchilar: ${recipients.length}`,
      "Bu yerdan bugungi hisobotni yuborish, to'liq bron tarixini CSV ko'rinishida yuklash va owner qabul qiluvchilarini sozlash mumkin.",
    ].join("\n"), {
      reply_markup: buildReportKeyboard(),
    });
  }

  async function showReportRecipientsMenu(chatId) {
    const recipients = await listReportRecipients();
    await sendManagerMessage(chatId, formatReportRecipientsForTelegram(recipients), {
      reply_markup: buildReportRecipientsKeyboard(recipients),
    });
  }

  async function sendBookingHistoryFile(chatId) {
    const file = await exportBookingHistoryCsv();
    await telegram.sendDocument(chatId, {
      buffer: file.buffer,
      filename: file.filename,
      contentType: "text/csv",
    }, {
      caption: `📦 To'liq bron tarixi yuklandi. Jami yozuvlar: ${file.count}`,
    });
  }

  async function sendDailyReport(chatId, broadcast = false) {
    const text = await buildDailyReportMessage();

    if (!broadcast) {
      await sendManagerMessage(chatId, text, {
        reply_markup: buildReportKeyboard(),
      });
      return;
    }

    const recipients = await getDailyReportRecipients();

    if (recipients.length === 0) {
      await sendManagerMessage(chatId, "⚠️ Hozircha ulangan owner qabul qiluvchilari yo'q. Avval qabul qiluvchini bog'lang.", {
        reply_markup: buildReportKeyboard(),
      });
      return;
    }

    let sentCount = 0;

    for (const recipient of recipients) {
      try {
        await telegram.sendMessage(recipient.telegramChatId, text);
        sentCount += 1;
      } catch (error) {
        console.error(`Daily report send failed for recipient ${recipient.id}: ${formatAxiosError(error)}`);
      }
    }

    await sendManagerMessage(chatId, `🌙 Bugungi hisobot yuborildi. Qabul qilganlar soni: ${sentCount}.`, {
      reply_markup: buildReportKeyboard(),
    });
  }

  async function maybeLinkReportRecipient(message) {
    const chatId = Number(message?.chat?.id ?? 0);
    const username = String(message?.from?.username ?? "").trim();
    const phone = String(message?.contact?.phone_number ?? "").trim();

    if (!chatId) {
      return null;
    }

    try {
      return await linkReportRecipientFromTelegram({
        chatId,
        username,
        phone,
      });
    } catch (error) {
      console.error(`Report recipient link failed: ${formatAxiosError(error)}`);
      return null;
    }
  }

  async function showOfflineMenu(chatId) {
    await sendManagerMessage(chatId, "🧍 Offlayn mehmonlar\n\nBu bo'limdan menejer qo'lda bron kiritadi va offlayn bronlarni ko'radi.", {
      reply_markup: buildOfflineMenuKeyboard(),
    });
  }

  async function showOfflineTypeMenu(chatId) {
    const options = await getTripBuilderOptions();
    const filtered = options.filter((item) => item.availableUnits > 0);

    pendingOfflineBookings.set(chatId, { step: "resourceType", options: filtered });
    await sendManagerMessage(chatId, "🏷 Offlayn bron uchun xizmat turini tanlang.", {
      reply_markup: buildOfflineTypeKeyboard(filtered),
    });
  }

  async function showOfflineBookings(chatId) {
    const bookings = await listBookingsForManager({ source: "offline", limit: 12 });
    await sendManagerMessage(chatId, formatBookingList("🧍 Offlayn bronlar", bookings), {
      reply_markup: bookings.length > 0 ? buildBookingListKeyboard(bookings) : buildOfflineMenuKeyboard(),
    });
  }

  async function showFilteredBookings(chatId, key) {
    if (key === "today") {
      const bookings = await listBookingsForManager({
        date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()),
      });
      await sendManagerMessage(chatId, formatBookingList("📅 Bugungi bronlar", bookings), {
        reply_markup: bookings.length > 0 ? buildBookingListKeyboard(bookings) : buildBookingsKeyboard(),
      });
      return;
    }

    if (key === "tomorrow") {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowText = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit" }).format(tomorrow);
      const bookings = await listBookingsForManager({ date: tomorrowText });
      await sendManagerMessage(chatId, formatBookingList("📆 Ertangi bronlar", bookings), {
        reply_markup: bookings.length > 0 ? buildBookingListKeyboard(bookings) : buildBookingsKeyboard(),
      });
      return;
    }

    if (key.startsWith("src:")) {
      const source = key.slice(4);
      const bookings = await listBookingsForManager({ source });
      const sourceLabel = source === "telegram" ? "Telegram" : source === "website" ? "Sayt" : source;
      await sendManagerMessage(chatId, formatBookingList(`🌐 ${sourceLabel} bronlari`, bookings), {
        reply_markup: bookings.length > 0 ? buildBookingListKeyboard(bookings) : buildBookingsKeyboard(),
      });
      return;
    }

    const statusMap = {
      pending: "pending",
      awaiting: "awaiting confirmation",
      confirmed: "confirmed",
      checked_in: "checked_in",
      completed: "completed",
      rejected: "rejected",
    };

    const status = statusMap[key] ?? "";
    const bookings = await listBookingsForManager({ status });
    const titleMap = {
      pending: "🕓 Kutilayotgan bronlar",
      "awaiting confirmation": "🧾 Chek tekshiruvidagi bronlar",
      confirmed: "✅ Tasdiqlangan bronlar",
      checked_in: "🏁 Mehmon ichkaridagi bronlar",
      completed: "👋 Yakunlangan bronlar",
      rejected: "❌ Rad etilgan bronlar",
    };
    await sendManagerMessage(chatId, formatBookingList(titleMap[status] ?? "📚 So'nggi bronlar", bookings), {
      reply_markup: bookings.length > 0 ? buildBookingListKeyboard(bookings) : buildBookingsKeyboard(),
    });
  }

  async function showBookingDetail(chatId, bookingId) {
    const context = await fetchBookingContext(bookingId);

    if (!context?.booking) {
      await sendManagerMessage(chatId, "❌ Bron topilmadi.", {
        reply_markup: buildMainKeyboard(),
      });
      return;
    }

    const booking = context.booking;
    const detail = {
      id: booking.id,
      rawStatus: booking.status,
      name: booking.name,
      phone: booking.phone,
      bookingLabel: booking.booking_label || booking.resource_summary || "Ko'rsatilmagan",
      statusLabel:
        booking.status === "checked_in"
          ? "mehmon ichkarida"
          : booking.status === "completed"
            ? "mehmon ketgan"
            : booking.status === "cancelled"
              ? "bekor qilingan"
              : booking.status === "rejected"
                ? "rad etilgan"
                : booking.status === "proof_submitted" || booking.payment_status === "pending_verification"
                  ? "to'lov tekshiruvida"
                  : booking.status === "confirmed"
                    ? "tasdiqlangan"
                    : "kutilmoqda",
      trackingStatus: booking.status === "proof_submitted" || booking.payment_status === "pending_verification"
        ? "awaiting confirmation"
        : booking.status === "confirmed" || booking.status === "completed"
          ? "confirmed"
          : booking.status === "rejected" || booking.status === "cancelled"
            ? booking.status
            : "pending",
      paymentStatus: booking.payment_status,
      proofUrl: context.payment?.proof_url || "",
      hasProof: Boolean(context.payment?.proof_url),
      source: booking.source,
      dateStart: booking.date_start,
      dateEnd: booking.date_end,
      totalPrice: booking.total_price,
    };

    await sendManagerMessage(chatId, formatBookingDetail(detail), {
      reply_markup: buildBookingDetailKeyboard(detail),
    });
  }

  async function showAnalytics(chatId, period) {
    const summary = await getBusinessAnalytics(period);
    await sendManagerMessage(chatId, formatAnalyticsForTelegram(summary), {
      reply_markup: buildAnalyticsKeyboard(),
    });
  }

  async function showAvailability(chatId, key) {
    const targetDate = key === "tomorrow"
      ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + 24 * 60 * 60 * 1000))
      : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const overview = await getResourceOverview(targetDate);
    await sendManagerMessage(chatId, formatAvailabilityForTelegram(overview), {
      reply_markup: buildAnalyticsKeyboard(),
    });
  }

  async function showResourceDetail(chatId, resourceId) {
    const overview = await getResourceOverview();
    const resource = overview.resources.find((item) => item.id === resourceId);

    if (!resource) {
      await sendManagerMessage(chatId, "❌ Resurs topilmadi.", { reply_markup: buildMainKeyboard() });
      return;
    }

    const imageAsset = await getLatestServiceMedia(resource.type);
    const detail = {
      ...resource,
      imageUrl: imageAsset?.url ?? "",
    };

    if (imageAsset?.url && telegram) {
      await telegram.sendPhoto(chatId, imageAsset.url, `🖼 ${resource.name} rasmi`);
    }

    await sendManagerMessage(chatId, formatResourceDetail(detail, overview), {
      reply_markup: buildResourceDetailKeyboard(resource),
    });
  }

  async function showPricingDetail(chatId, resourceType) {
    const rules = await listPricingRules();
    const rule = rules.find((item) => item.resourceType === resourceType);

    if (!rule) {
      await sendManagerMessage(chatId, "❌ Narx qoidasi topilmadi.", { reply_markup: buildMainKeyboard() });
      return;
    }

    await sendManagerMessage(chatId, formatPricingDetail(rule), {
      reply_markup: buildPricingDetailKeyboard(rule),
    });
  }

  async function createResourceFromTemplate(chatId, resourceType) {
    const template = RESOURCE_TEMPLATES.find((item) => item.type === resourceType);

    if (!template) {
      await sendManagerMessage(chatId, "❌ Resurs shabloni topilmadi.", {
        reply_markup: buildMainKeyboard(),
      });
      return;
    }

    const overview = await getResourceOverview();
    const nextIndex = overview.resources.filter((item) => item.type === resourceType).length + 1;
    const created = await createResource({
      type: template.type,
      name: `${template.namePrefix} ${nextIndex}`,
      capacity: template.capacity,
      isActive: true,
    });

    await sendManagerMessage(chatId, `✅ ${created.name} yaratildi.`, {
      reply_markup: buildMainKeyboard(),
    });
    await showResourceDetail(chatId, created.id);
  }

  async function handleViewProof(callbackQuery) {
    const callbackQueryId = callbackQuery?.id;
    const chatId = callbackQuery?.message?.chat?.id;
    const bookingId = getBookingId(callbackQuery?.data, ACTIONS.view);

    if (!callbackQueryId || !chatId || !bookingId) {
      return false;
    }

    try {
      const [proofAsset, context] = await Promise.all([
        loadLatestProofAsset(bookingId),
        fetchBookingContext(bookingId),
      ]);

      if (!proofAsset || !context?.booking) {
        await answerCallbackQuery(callbackQueryId, "Chek topilmadi");
        return true;
      }

      await sendManagerProofPreview(chatId, bookingId, proofAsset, context.booking);
      await answerCallbackQuery(callbackQueryId, "Chek yuborildi");
    } catch (error) {
      console.error(`Manager proof preview failed: ${formatAxiosError(error)}`);
      await answerCallbackQuery(callbackQueryId, "Chekni ochib bo'lmadi");
    }

    return true;
  }

  async function handleDecision(callbackQuery, approved) {
    const callbackQueryId = callbackQuery?.id;
    const chatId = callbackQuery?.message?.chat?.id;
    const messageId = callbackQuery?.message?.message_id;
    const bookingId = getBookingId(callbackQuery?.data, approved ? ACTIONS.approve : ACTIONS.reject);

    if (!callbackQueryId || !chatId || !messageId || !bookingId) {
      return false;
    }

    try {
      const current = await fetchBookingContext(bookingId);

      if (!current?.booking) {
        await answerCallbackQuery(callbackQueryId, "Bron topilmadi.");
        return true;
      }

      const needsProofDecision =
        current.booking.status === "proof_submitted"
        || current.booking.payment_status === "pending_verification";
      const context = approved
        ? (needsProofDecision ? await approveBookingProof(bookingId) : await approveBookingManually(bookingId))
        : (needsProofDecision ? await rejectBookingProof(bookingId) : await rejectBookingManually(bookingId));

      await clearManagerDecisionKeyboard(chatId, messageId, bookingId);
      await answerCallbackQuery(callbackQueryId, approved ? "Bron tasdiqlandi." : "Bron rad etildi.");
      await sendManagerMessage(chatId, approved ? "✅ Bron tasdiqlandi." : "❌ Bron rad etildi.", {
        reply_markup: buildMainKeyboard(),
      });
      await notifyCustomerAboutDecision(context, approved);
    } catch (error) {
      console.error(`Manager decision failed: ${formatAxiosError(error)}`);
      await answerCallbackQuery(callbackQueryId, error instanceof Error ? error.message : "Qarorni saqlab bo'lmadi.");
    }

    return true;
  }

  async function handleDashboardCallback(callbackQuery) {
    const callbackQueryId = callbackQuery?.id;
    const chatId = callbackQuery?.message?.chat?.id;
    const data = String(callbackQuery?.data ?? "");

    if (!callbackQueryId || !chatId) {
      return false;
    }

    try {
      if (data.startsWith(ACTIONS.main)) {
        const key = data.slice(ACTIONS.main.length);
        await answerCallbackQuery(callbackQueryId, "Bo'lim ochildi");

        if (key === "bookings") {
          await showBookingsMenu(chatId);
          return true;
        }

        if (key === "resources") {
          await showResourcesMenu(chatId);
          return true;
        }

        if (key === "pricing") {
          await showPricingMenu(chatId);
          return true;
        }

        if (key === "payments") {
          await showPaymentSettingsMenu(chatId);
          return true;
        }

        if (key === "offline") {
          await showOfflineMenu(chatId);
          return true;
        }

        if (key === "analytics") {
          await showAnalyticsMenu(chatId);
          return true;
        }

        if (key === "report") {
          await showReportMenu(chatId);
          return true;
        }

        if (key === "status") {
          const status = await getSystemStatus();
          await sendManagerMessage(chatId, formatSystemStatus(status), {
            reply_markup: buildMainKeyboard(),
          });
          return true;
        }

        await showMainMenu(chatId);
        return true;
      }

      if (data === ACTIONS.backMain) {
        await answerCallbackQuery(callbackQueryId, "Bosh menyu");
        await showMainMenu(chatId, "🏠 Boshqaruv paneli");
        return true;
      }

      if (data.startsWith(ACTIONS.bookings)) {
        await answerCallbackQuery(callbackQueryId, "Bronlar");
        await showFilteredBookings(chatId, data.slice(ACTIONS.bookings.length));
        return true;
      }

      if (data.startsWith(ACTIONS.bookingDetail)) {
        await answerCallbackQuery(callbackQueryId, "Bron tafsilotlari");
        await showBookingDetail(chatId, data.slice(ACTIONS.bookingDetail.length));
        return true;
      }

      if (data.startsWith(ACTIONS.bookingFree)) {
        const bookingId = data.slice(ACTIONS.bookingFree.length);
        await cancelBookingManually(bookingId);
        await answerCallbackQuery(callbackQueryId, "Joy bo'shatildi");
        await showBookingDetail(chatId, bookingId);
        return true;
      }

      if (data.startsWith(ACTIONS.bookingCheckIn)) {
        const bookingId = data.slice(ACTIONS.bookingCheckIn.length);
        await setBookingCheckedIn(bookingId);
        await answerCallbackQuery(callbackQueryId, "Mehmon check-in qilindi");
        await showBookingDetail(chatId, bookingId);
        return true;
      }

      if (data.startsWith(ACTIONS.bookingLeft)) {
        const bookingId = data.slice(ACTIONS.bookingLeft.length);
        await setBookingCompleted(bookingId);
        await answerCallbackQuery(callbackQueryId, "Mehmon ketdi");
        await showBookingDetail(chatId, bookingId);
        return true;
      }

      if (data.startsWith(ACTIONS.bookingMoveDate)) {
        const bookingId = data.slice(ACTIONS.bookingMoveDate.length);
        pendingBookingEdits.set(chatId, { type: "moveDate", bookingId });
        await answerCallbackQuery(callbackQueryId, "Yangi sana yuboring");
        await sendManagerMessage(chatId, "📅 Yangi sanani yuboring.\n\nBir kunlik bo'lsa: `YYYY-MM-DD`\nTunab qolish bo'lsa: `YYYY-MM-DD YYYY-MM-DD`", {
          parse_mode: "Markdown",
        });
        return true;
      }

      if (data.startsWith(ACTIONS.bookingPrice)) {
        const bookingId = data.slice(ACTIONS.bookingPrice.length);
        pendingBookingEdits.set(chatId, { type: "price", bookingId });
        await answerCallbackQuery(callbackQueryId, "Yangi narx yuboring");
        await sendManagerMessage(chatId, "💵 Yangi narxni yuboring.\n\nMasalan: `1750000`", {
          parse_mode: "Markdown",
        });
        return true;
      }

      if (data.startsWith(ACTIONS.analytics)) {
        await answerCallbackQuery(callbackQueryId, "Analitika");
        await showAnalytics(chatId, data.slice(ACTIONS.analytics.length));
        return true;
      }

      if (data.startsWith(ACTIONS.availability)) {
        await answerCallbackQuery(callbackQueryId, "Bandlik");
        await showAvailability(chatId, data.slice(ACTIONS.availability.length));
        return true;
      }

      if (data === `${ACTIONS.report}menu`) {
        await answerCallbackQuery(callbackQueryId, "Hisobotlar");
        await showReportMenu(chatId);
        return true;
      }

      if (data === `${ACTIONS.report}send_today`) {
        await answerCallbackQuery(callbackQueryId, "Hisobot yuborilmoqda");
        await sendDailyReport(chatId, true);
        return true;
      }

      if (data === `${ACTIONS.report}download_history`) {
        await answerCallbackQuery(callbackQueryId, "CSV tayyorlanmoqda");
        await sendBookingHistoryFile(chatId);
        return true;
      }

      if (data === `${ACTIONS.report}recipients`) {
        await answerCallbackQuery(callbackQueryId, "Qabul qiluvchilar");
        await showReportRecipientsMenu(chatId);
        return true;
      }

      if (data === `${ACTIONS.report}add_username`) {
        pendingRecipientInputs.set(chatId, { mode: "username" });
        await answerCallbackQuery(callbackQueryId, "Username kiriting");
        await sendManagerMessage(chatId, "👤 Owner Telegram username yuboring.\n\nMasalan: `@ownername`", {
          parse_mode: "Markdown",
          reply_markup: buildMainKeyboard(),
        });
        return true;
      }

      if (data === `${ACTIONS.report}add_phone`) {
        pendingRecipientInputs.set(chatId, { mode: "phone" });
        await answerCallbackQuery(callbackQueryId, "Telefon yuboring");
        await sendManagerMessage(chatId, "📱 Owner telefon raqamini yuboring.\n\nMasalan: `+998901234567`", {
          parse_mode: "Markdown",
          reply_markup: buildMainKeyboard(),
        });
        return true;
      }

      if (data.startsWith(ACTIONS.reportRecipientDelete)) {
        await removeReportRecipient(data.slice(ACTIONS.reportRecipientDelete.length));
        await answerCallbackQuery(callbackQueryId, "Qabul qiluvchi o'chirildi");
        await showReportRecipientsMenu(chatId);
        return true;
      }

      if (data === `${ACTIONS.offline}menu`) {
        await answerCallbackQuery(callbackQueryId, "Offlayn mehmonlar");
        await showOfflineMenu(chatId);
        return true;
      }

      if (data === `${ACTIONS.offline}new`) {
        await answerCallbackQuery(callbackQueryId, "Yangi offlayn bron");
        await showOfflineTypeMenu(chatId);
        return true;
      }

      if (data === `${ACTIONS.offline}list`) {
        await answerCallbackQuery(callbackQueryId, "Offlayn bronlar");
        await showOfflineBookings(chatId);
        return true;
      }

      if (data.startsWith(ACTIONS.offlineType)) {
        const resourceType = data.slice(ACTIONS.offlineType.length);
        const options = await getTripBuilderOptions();
        const selected = options.find((item) => item.resourceType === resourceType);

        if (!selected) {
          await answerCallbackQuery(callbackQueryId, "Resurs turi topilmadi");
          return true;
        }

        const nextDraft = {
          step: selected.includesTapchan ? "tapchanMode" : "quantity",
          resourceType,
          label: selected.label,
          includeTapchan: selected.includesTapchan ? true : undefined,
          unitPeople: Math.max(Number(selected.maxIncludedPeople ?? selected.unitCapacity ?? 1), 1),
          maxQuantity: Math.max(Number(selected.availableUnits ?? 1), 1),
          bookingMode: selected.bookingMode,
        };
        pendingOfflineBookings.set(chatId, nextDraft);
        await answerCallbackQuery(callbackQueryId, selected.label);

        if (selected.includesTapchan) {
          await sendManagerMessage(chatId, `🏷 ${selected.label} uchun variantni tanlang.`, {
            reply_markup: buildOfflineTapchanKeyboard(resourceType),
          });
        } else {
          await sendManagerMessage(chatId, `🔢 ${selected.label} sonini tanlang.`, {
            reply_markup: buildOfflineQuantityKeyboard(resourceType, nextDraft.maxQuantity),
          });
        }
        return true;
      }

      if (data.startsWith(ACTIONS.offlineIncludeTapchan)) {
        const payload = data.slice(ACTIONS.offlineIncludeTapchan.length);
        const [resourceType, mode] = payload.split(":");
        const draft = pendingOfflineBookings.get(chatId) ?? {};
        pendingOfflineBookings.set(chatId, {
          ...draft,
          resourceType,
          includeTapchan: mode !== "without",
          step: "quantity",
        });
        await answerCallbackQuery(callbackQueryId, "Variant tanlandi");
        await sendManagerMessage(chatId, "🔢 Nechta birlik kerak?", {
          reply_markup: buildOfflineQuantityKeyboard(resourceType, Math.max(Number(draft.maxQuantity ?? 1), 1)),
        });
        return true;
      }

      if (data.startsWith(ACTIONS.offlineQuantity)) {
        const payload = data.slice(ACTIONS.offlineQuantity.length);
        const [resourceType, quantityText] = payload.split(":");
        const draft = pendingOfflineBookings.get(chatId) ?? {};
        pendingOfflineBookings.set(chatId, {
          ...draft,
          resourceType,
          quantity: Math.max(Number(quantityText ?? 1), 1),
          step: "date",
        });
        await answerCallbackQuery(callbackQueryId, "Soni tanlandi");
        await sendManagerMessage(chatId, "📅 Boshlanish sanasini tanlang.", {
          reply_markup: buildOfflineDateKeyboard(),
        });
        return true;
      }

      if (data.startsWith(ACTIONS.offlineDate)) {
        const key = data.slice(ACTIONS.offlineDate.length);
        const draft = pendingOfflineBookings.get(chatId) ?? {};

        if (key === "custom") {
          pendingOfflineBookings.set(chatId, {
            ...draft,
            step: "customDate",
          });
          await answerCallbackQuery(callbackQueryId, "Sana yozing");
          await sendManagerMessage(chatId, "🗓 Sanani `YYYY-MM-DD` formatda yuboring.", {
            parse_mode: "Markdown",
          });
          return true;
        }

        const startDate = key === "tomorrow" ? addDays(getTodayTashkent(), 1) : getTodayTashkent();
        const nextStep = draft.bookingMode === "stay" ? "duration" : "name";
        pendingOfflineBookings.set(chatId, {
          ...draft,
          startDate,
          endDate: draft.bookingMode === "stay" ? null : null,
          step: nextStep,
        });
        await answerCallbackQuery(callbackQueryId, "Sana tanlandi");

        if (draft.bookingMode === "stay") {
          await sendManagerMessage(chatId, "🌙 Necha kecha qoladi?", {
            reply_markup: buildOfflineDurationKeyboard(),
          });
        } else {
          await sendManagerMessage(chatId, "👤 Mehmon ismini yuboring.");
        }
        return true;
      }

      if (data.startsWith(ACTIONS.offlineDuration)) {
        const nights = Math.max(Number(data.slice(ACTIONS.offlineDuration.length) || 1), 1);
        const draft = pendingOfflineBookings.get(chatId) ?? {};
        pendingOfflineBookings.set(chatId, {
          ...draft,
          endDate: addDays(String(draft.startDate ?? getTodayTashkent()), nights),
          step: "name",
        });
        await answerCallbackQuery(callbackQueryId, "Davomiylik tanlandi");
        await sendManagerMessage(chatId, "👤 Mehmon ismini yuboring.");
        return true;
      }

      if (data === `${ACTIONS.resource}menu`) {
        await answerCallbackQuery(callbackQueryId, "Resurslar");
        await showResourcesMenu(chatId);
        return true;
      }

      if (data.startsWith(ACTIONS.resourceToggle)) {
        const resourceId = data.slice(ACTIONS.resourceToggle.length);
        const overview = await getResourceOverview();
        const current = overview.resources.find((item) => item.id === resourceId);
        if (!current) {
          await answerCallbackQuery(callbackQueryId, "Resource topilmadi.");
          return true;
        }
        await updateResourceDetails({ resourceId, isActive: !current.is_active });
        await answerCallbackQuery(callbackQueryId, "Resurs yangilandi");
        await showResourceDetail(chatId, resourceId);
        return true;
      }

      if (data.startsWith(ACTIONS.resourceCapUp) || data.startsWith(ACTIONS.resourceCapDown)) {
        const prefix = data.startsWith(ACTIONS.resourceCapUp) ? ACTIONS.resourceCapUp : ACTIONS.resourceCapDown;
        const resourceId = data.slice(prefix.length);
        const overview = await getResourceOverview();
        const current = overview.resources.find((item) => item.id === resourceId);
        if (!current) {
          await answerCallbackQuery(callbackQueryId, "Resource topilmadi.");
          return true;
        }
        const delta = prefix === ACTIONS.resourceCapUp ? 1 : -1;
        await updateResourceDetails({ resourceId, capacity: Math.max(current.capacity + delta, 1) });
        await answerCallbackQuery(callbackQueryId, "Sig'im yangilandi");
        await showResourceDetail(chatId, resourceId);
        return true;
      }

      if (data.startsWith(ACTIONS.resourceImageUpload)) {
        const resourceId = data.slice(ACTIONS.resourceImageUpload.length);
        const overview = await getResourceOverview();
        const current = overview.resources.find((item) => item.id === resourceId);

        if (!current) {
          await answerCallbackQuery(callbackQueryId, "Resource topilmadi.");
          return true;
        }

        pendingImageUploads.set(chatId, {
          resourceId,
          resourceType: current.type,
          resourceName: current.name,
        });
        await answerCallbackQuery(callbackQueryId, "Rasm yuklash");
        await sendManagerMessage(chatId, `🖼 ${current.name} uchun yangi rasm yuboring.\n\nFoto yoki rasm-document jo'nating.`, {
          reply_markup: buildMainKeyboard(),
        });
        return true;
      }

      if (data.startsWith(ACTIONS.resourceImageDelete)) {
        const resourceId = data.slice(ACTIONS.resourceImageDelete.length);
        const overview = await getResourceOverview();
        const current = overview.resources.find((item) => item.id === resourceId);

        if (!current) {
          await answerCallbackQuery(callbackQueryId, "Resource topilmadi.");
          return true;
        }

        await deleteServiceMedia(current.type);
        await answerCallbackQuery(callbackQueryId, "Rasm o'chirildi");
        await showResourceDetail(chatId, resourceId);
        return true;
      }

      if (data.startsWith(ACTIONS.resourceCreate)) {
        await answerCallbackQuery(callbackQueryId, "Resurs yaratildi");
        await createResourceFromTemplate(chatId, data.slice(ACTIONS.resourceCreate.length));
        return true;
      }

      if (data.startsWith(ACTIONS.resource)) {
        await answerCallbackQuery(callbackQueryId, "Resurs");
        await showResourceDetail(chatId, data.slice(ACTIONS.resource.length));
        return true;
      }

      if (data.startsWith(ACTIONS.payment)) {
        const key = data.slice(ACTIONS.payment.length);

        if (key === "card_number") {
          pendingPaymentInputs.set(chatId, { field: "cardNumber" });
          await answerCallbackQuery(callbackQueryId, "Karta raqamini yuboring");
          await sendManagerMessage(chatId, "💳 Yangi karta raqamini yuboring.");
          return true;
        }

        if (key === "card_holder") {
          pendingPaymentInputs.set(chatId, { field: "cardHolder" });
          await answerCallbackQuery(callbackQueryId, "Karta egasini yuboring");
          await sendManagerMessage(chatId, "👤 Yangi karta egasi ismini yuboring.");
          return true;
        }

        if (key === "manager_telegram") {
          pendingPaymentInputs.set(chatId, { field: "managerTelegram" });
          await answerCallbackQuery(callbackQueryId, "Telegramni yuboring");
          await sendManagerMessage(chatId, "💬 To'lov bo'yicha Telegram username yoki havolani yuboring.");
          return true;
        }

        if (key === "instructions") {
          pendingPaymentInputs.set(chatId, { field: "instructions" });
          await answerCallbackQuery(callbackQueryId, "Ko'rsatmani yuboring");
          await sendManagerMessage(chatId, "📝 Yangi to'lov ko'rsatmasini yuboring.");
          return true;
        }
      }

      if (data === `${ACTIONS.pricing}menu`) {
        await answerCallbackQuery(callbackQueryId, "Narxlar");
        await showPricingMenu(chatId);
        return true;
      }

      const pricingAdjustments = [
        [ACTIONS.pricingBaseUp, { field: "basePrice", delta: 10000 }],
        [ACTIONS.pricingBaseDown, { field: "basePrice", delta: -10000 }],
        [ACTIONS.pricingExtraUp, { field: "extraPersonPrice", delta: 5000 }],
        [ACTIONS.pricingExtraDown, { field: "extraPersonPrice", delta: -5000 }],
        [ACTIONS.pricingIncludedUp, { field: "maxIncludedPeople", delta: 1 }],
        [ACTIONS.pricingIncludedDown, { field: "maxIncludedPeople", delta: -1 }],
        [ACTIONS.pricingDiscountUp, { field: "discountIfExcluded", delta: 0.05 }],
        [ACTIONS.pricingDiscountDown, { field: "discountIfExcluded", delta: -0.05 }],
      ];

      for (const [prefix, config] of pricingAdjustments) {
        if (data.startsWith(prefix)) {
          const resourceType = data.slice(prefix.length);
          const rules = await listPricingRules();
          const current = rules.find((item) => item.resourceType === resourceType);
          if (!current) {
            await answerCallbackQuery(callbackQueryId, "Pricing topilmadi.");
            return true;
          }

          const next = {};
          next[config.field] = config.field === "discountIfExcluded"
            ? Math.min(Math.max(current[config.field] + config.delta, 0), 1)
            : Math.max(current[config.field] + config.delta, 0);
          await updatePricingRuleValues(resourceType, next);
          await answerCallbackQuery(callbackQueryId, "Narx yangilandi");
          await showPricingDetail(chatId, resourceType);
          return true;
        }
      }

      if (data.startsWith(ACTIONS.pricing)) {
        await answerCallbackQuery(callbackQueryId, "Narx");
        await showPricingDetail(chatId, data.slice(ACTIONS.pricing.length));
        return true;
      }
    } catch (error) {
      console.error(`Manager dashboard callback failed: ${formatAxiosError(error)}`);
      await answerCallbackQuery(callbackQueryId, "Xatolik yuz berdi.");
      return true;
    }

    return false;
  }

  return {
    isConfigured: Boolean(managerToken),
    async handleUpdate(update) {
      const message = update?.message;
      const callbackQuery = update?.callback_query;

      if (message?.chat?.id) {
        const chatId = message.chat.id;
        const text = String(message.text ?? "").trim();
        const pendingImageUpload = pendingImageUploads.get(chatId);
        const pendingRecipientInput = pendingRecipientInputs.get(chatId);
        const pendingOfflineBooking = pendingOfflineBookings.get(chatId);
        const linkedRecipient = await maybeLinkReportRecipient(message);

        if (linkedRecipient && (isStartCommand(text) || isHelpCommand(text) || message?.contact)) {
          await sendManagerMessage(chatId, `🔔 Hisobot qabul qiluvchisi bog'landi: ${linkedRecipient.label || linkedRecipient.telegramHandle || linkedRecipient.phone}.`);
        }

        if (pendingImageUpload) {
          const photo = Array.isArray(message.photo) ? message.photo.at(-1) : null;
          const document = message.document;
          const fileId = photo?.file_id || document?.file_id;
          const originalName = document?.file_name || `${pendingImageUpload.resourceType}.jpg`;
          const contentType = document?.mime_type || "image/jpeg";

          if (!fileId || (!photo && !String(contentType).startsWith("image/"))) {
            await sendManagerMessage(chatId, "⚠️ Faqat rasm yuboring. Foto yoki rasm-document qabul qilinadi.");
            return;
          }

          try {
            const fileResult = await telegram.getFile(fileId);
            const filePath = fileResult?.result?.file_path ?? fileResult?.file_path;

            if (!filePath) {
              throw new Error("Telegram file path topilmadi.");
            }

            const buffer = await telegram.downloadFile(filePath);
            await replaceServiceMedia(pendingImageUpload.resourceType, {
              buffer,
              originalName,
              contentType,
            });
            pendingImageUploads.delete(chatId);
            await sendManagerMessage(chatId, `✅ ${pendingImageUpload.resourceName} rasmi yangilandi.`);
            await showResourceDetail(chatId, pendingImageUpload.resourceId);
          } catch (error) {
            console.error(`Manager image upload failed: ${formatAxiosError(error)}`);
            await sendManagerMessage(chatId, "❌ Servis rasmini saqlab bo'lmadi.");
          }

          return;
        }

        if (pendingRecipientInput) {
          try {
            const value = text || String(message?.contact?.phone_number ?? "").trim();

            if (!value) {
              await sendManagerMessage(chatId, "⚠️ Qiymat yuborilmadi. Username yoki telefonni qayta yuboring.");
              return;
            }

            const recipient = await addReportRecipient({
              telegramHandle: pendingRecipientInput.mode === "username" ? value : "",
              phone: pendingRecipientInput.mode === "phone" ? value : "",
            });
            pendingRecipientInputs.delete(chatId);
            await sendManagerMessage(chatId, `✅ Qabul qiluvchi saqlandi: ${recipient.telegramHandle ? `@${recipient.telegramHandle}` : recipient.phone}\n\nOwner botga kirib /start yuborsa, hisobotlar avtomatik ulangan holatga o'tadi.`);
            await showReportRecipientsMenu(chatId);
          } catch (error) {
            console.error(`Report recipient save failed: ${formatAxiosError(error)}`);
            await sendManagerMessage(chatId, error instanceof Error ? `❌ ${error.message}` : "❌ Qabul qiluvchini saqlab bo'lmadi.");
          }

          return;
        }

        const pendingPaymentInput = pendingPaymentInputs.get(chatId);

        if (pendingPaymentInput) {
          try {
            const value = text;

            if (!value) {
              await sendManagerMessage(chatId, "⚠️ Qiymat yuborilmadi. Maydonni qayta yuboring.");
              return;
            }

            const payload = {};
            payload[pendingPaymentInput.field] = value;
            await updateSitePaymentSettings(payload);
            pendingPaymentInputs.delete(chatId);
            await sendManagerMessage(chatId, "✅ To'lov sozlamalari yangilandi.");
            await showPaymentSettingsMenu(chatId);
          } catch (error) {
            console.error(`Payment settings update failed: ${formatAxiosError(error)}`);
            await sendManagerMessage(chatId, error instanceof Error ? `❌ ${error.message}` : "❌ To'lov sozlamalarini saqlab bo'lmadi.");
          }

          return;
        }

        const pendingBookingEdit = pendingBookingEdits.get(chatId);

        if (pendingBookingEdit) {
          try {
            if (pendingBookingEdit.type === "price") {
              const numericPrice = Number.parseInt(text.replace(/[^\d]/g, ""), 10);

              if (!Number.isInteger(numericPrice) || numericPrice <= 0) {
                await sendManagerMessage(chatId, "⚠️ Narxni butun son bilan yuboring. Masalan: `1750000`", {
                  parse_mode: "Markdown",
                });
                return;
              }

              pendingBookingEdits.delete(chatId);
              await updateBookingPriceManually(pendingBookingEdit.bookingId, numericPrice);
              await sendManagerMessage(chatId, "✅ Bron narxi yangilandi.");
              await showBookingDetail(chatId, pendingBookingEdit.bookingId);
              return;
            }

            if (pendingBookingEdit.type === "moveDate") {
              const parts = text.split(/\s+/).filter(Boolean);

              if (parts.length < 1 || parts.length > 2 || !parts.every((item) => /^\d{4}-\d{2}-\d{2}$/.test(item))) {
                await sendManagerMessage(chatId, "⚠️ Sana formatini to'g'ri yuboring.\n\n`YYYY-MM-DD` yoki `YYYY-MM-DD YYYY-MM-DD`", {
                  parse_mode: "Markdown",
                });
                return;
              }

              pendingBookingEdits.delete(chatId);
              await moveBookingDatesManually(pendingBookingEdit.bookingId, parts[0], parts[1] ?? null);
              await sendManagerMessage(chatId, "✅ Bron sanasi ko'chirildi.");
              await showBookingDetail(chatId, pendingBookingEdit.bookingId);
              return;
            }
          } catch (error) {
            console.error(`Booking edit failed: ${formatAxiosError(error)}`);
            pendingBookingEdits.delete(chatId);
            await sendManagerMessage(chatId, error instanceof Error ? `❌ ${error.message}` : "❌ Bronni yangilab bo'lmadi.");
            return;
          }
        }

        if (pendingOfflineBooking) {
          try {
            if (pendingOfflineBooking.step === "customDate") {
              if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
                await sendManagerMessage(chatId, "⚠️ Sanani `YYYY-MM-DD` formatda yuboring.", {
                  parse_mode: "Markdown",
                });
                return;
              }

              const nextStep = pendingOfflineBooking.bookingMode === "stay" ? "duration" : "name";
              pendingOfflineBookings.set(chatId, {
                ...pendingOfflineBooking,
                startDate: text,
                step: nextStep,
              });

              if (pendingOfflineBooking.bookingMode === "stay") {
                await sendManagerMessage(chatId, "🌙 Necha kecha qoladi?", {
                  reply_markup: buildOfflineDurationKeyboard(),
                });
              } else {
                await sendManagerMessage(chatId, "👤 Mehmon ismini yuboring.");
              }
              return;
            }

            if (pendingOfflineBooking.step === "name") {
              pendingOfflineBookings.set(chatId, {
                ...pendingOfflineBooking,
                name: text,
                step: "phone",
              });
              await sendManagerMessage(chatId, "📞 Telefon raqamini yuboring. Agar kerak bo'lmasa `-` yuboring.", {
                parse_mode: "Markdown",
              });
              return;
            }

            if (pendingOfflineBooking.step === "phone") {
              pendingOfflineBookings.set(chatId, {
                ...pendingOfflineBooking,
                phone: text === "-" ? "Offlayn mijoz" : text,
                step: "price",
              });
              await sendManagerMessage(chatId, "💵 Yakuniy narxni butun son ko'rinishida yuboring.\n\nMasalan: `450000`", {
                parse_mode: "Markdown",
              });
              return;
            }

            if (pendingOfflineBooking.step === "price") {
              const price = Number.parseInt(text.replace(/[^\d]/g, ""), 10);

              if (!Number.isInteger(price) || price <= 0) {
                await sendManagerMessage(chatId, "⚠️ Narxni to'g'ri yuboring. Masalan: `450000`", {
                  parse_mode: "Markdown",
                });
                return;
              }

              const bookingResult = await createOfflineBooking({
                name: pendingOfflineBooking.name,
                phone: pendingOfflineBooking.phone || "Offlayn mijoz",
                peopleCount: Math.max(Number(pendingOfflineBooking.unitPeople ?? 1) * Number(pendingOfflineBooking.quantity ?? 1), 1),
                resourceSelections: [
                  {
                    resourceType: pendingOfflineBooking.resourceType,
                    quantity: Number(pendingOfflineBooking.quantity ?? 1),
                    includeTapchan: pendingOfflineBooking.includeTapchan,
                  },
                ],
                startDate: pendingOfflineBooking.startDate,
                endDate: pendingOfflineBooking.endDate,
                totalPrice: price,
              });

              pendingOfflineBookings.delete(chatId);

              if (!bookingResult?.success) {
                await sendManagerMessage(chatId, `❌ ${bookingResult?.message || "Offlayn bronni yaratib bo'lmadi."}`, {
                  reply_markup: buildOfflineMenuKeyboard(),
                });
                return;
              }

              await sendManagerMessage(chatId, `✅ Offlayn bron yaratildi.\n\nID: ${bookingResult.bookingId}\nNarx: ${formatPrice(price)} UZS`, {
                reply_markup: buildOfflineMenuKeyboard(),
              });
              await showBookingDetail(chatId, bookingResult.bookingId);
              return;
            }
          } catch (error) {
            console.error(`Offline booking flow failed: ${formatAxiosError(error)}`);
            pendingOfflineBookings.delete(chatId);
            await sendManagerMessage(chatId, error instanceof Error ? `❌ ${error.message}` : "❌ Offlayn bronni yaratib bo'lmadi.", {
              reply_markup: buildOfflineMenuKeyboard(),
            });
            return;
          }
        }

        if (isStartCommand(text) || isHelpCommand(text)) {
          await showMainMenu(chatId, "👋 Manager panel tayyor.\n\nBarcha boshqaruv tugmalar orqali ishlaydi.");
          return;
        }

        if (text === BUTTONS.bookings) {
          await showBookingsMenu(chatId);
          return;
        }

        if (text === BUTTONS.resources) {
          await showResourcesMenu(chatId);
          return;
        }

        if (text === BUTTONS.pricing) {
          await showPricingMenu(chatId);
          return;
        }

        if (text === BUTTONS.payments) {
          await showPaymentSettingsMenu(chatId);
          return;
        }

        if (text === BUTTONS.offline) {
          await showOfflineMenu(chatId);
          return;
        }

        if (text === BUTTONS.analytics) {
          await showAnalyticsMenu(chatId);
          return;
        }

        if (text === BUTTONS.report) {
          await showReportMenu(chatId);
          return;
        }

        if (text === BUTTONS.status) {
          const status = await getSystemStatus();
          await sendManagerMessage(chatId, formatSystemStatus(status), {
            reply_markup: buildMainKeyboard(),
          });
          return;
        }

        await showMainMenu(chatId, "🙂 Iltimos, boshqaruv uchun tugmalardan foydalaning.");
        return;
      }

      if (!callbackQuery?.id) {
        return;
      }

      if (await handleViewProof(callbackQuery)) {
        return;
      }

      if (await handleDecision(callbackQuery, true)) {
        return;
      }

      if (await handleDecision(callbackQuery, false)) {
        return;
      }

      if (await handleDashboardCallback(callbackQuery)) {
        return;
      }

      await answerCallbackQuery(callbackQuery.id, "Noma'lum amal");
    },
  };
}
