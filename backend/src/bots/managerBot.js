import { createTelegramClient, formatAxiosError, readOptionalEnv } from "./shared.js";
import { approveBookingProof, fetchBookingContext, loadLatestProofAsset, rejectBookingProof } from "../services/proofService.js";
import {
  createResource,
  formatAnalyticsForTelegram,
  formatAvailabilityForTelegram,
  getBusinessAnalytics,
  getResourceOverview,
  getSystemStatus,
  listBookingsForManager,
  listPricingRules,
  updatePricingRuleValues,
  updateResourceDetails,
} from "../services/businessOps.js";
import { deleteServiceMedia, getLatestServiceMedia, replaceServiceMedia } from "../services/mediaLibrary.js";
import {
  clearManagerDecisionKeyboard,
  notifyCustomerAboutDecision,
  sendManagerProofPreview,
} from "../services/managerNotifications.js";

const BUTTONS = {
  bookings: "View bookings",
  resources: "Manage resources",
  pricing: "Manage pricing",
  analytics: "Analytics",
  report: "Daily report",
  status: "System status",
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
  pricing: "mpr_",
  pricingBaseUp: "mpr_bu_",
  pricingBaseDown: "mpr_bd_",
  pricingExtraUp: "mpr_eu_",
  pricingExtraDown: "mpr_ed_",
  pricingIncludedUp: "mpr_iu_",
  pricingIncludedDown: "mpr_id_",
  pricingDiscountUp: "mpr_du_",
  pricingDiscountDown: "mpr_dd_",
  main: "mmain_",
  resourceCreate: "mres_new_",
  backMain: "mback_main",
};

const RESOURCE_TEMPLATES = [
  { type: "room_small", shortLabel: "Room S +", capacity: 2, namePrefix: "Small room" },
  { type: "room_big", shortLabel: "Room B +", capacity: 4, namePrefix: "Big room" },
  { type: "tapchan_small", shortLabel: "Tapchan S +", capacity: 4, namePrefix: "Small tapchan" },
  { type: "tapchan_big", shortLabel: "Tapchan B +", capacity: 6, namePrefix: "Big tapchan" },
  { type: "tapchan_very_big", shortLabel: "Tapchan XL +", capacity: 8, namePrefix: "VIP tapchan" },
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
        { text: BUTTONS.report, callback_data: `${ACTIONS.main}report` },
        { text: BUTTONS.status, callback_data: `${ACTIONS.main}status` },
      ],
    ],
  };
}

function buildBookingsKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "Pending", callback_data: `${ACTIONS.bookings}pending` },
        { text: "Awaiting", callback_data: `${ACTIONS.bookings}awaiting` },
      ],
      [
        { text: "Confirmed", callback_data: `${ACTIONS.bookings}confirmed` },
        { text: "Rejected", callback_data: `${ACTIONS.bookings}rejected` },
      ],
      [
        { text: "Today", callback_data: `${ACTIONS.bookings}today` },
        { text: "Tomorrow", callback_data: `${ACTIONS.bookings}tomorrow` },
      ],
      [
        { text: "Website", callback_data: `${ACTIONS.bookings}src:website` },
        { text: "Telegram", callback_data: `${ACTIONS.bookings}src:telegram` },
      ],
      [{ text: "Back", callback_data: ACTIONS.backMain }],
    ],
  };
}

function buildAnalyticsKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "Today", callback_data: `${ACTIONS.analytics}today` },
        { text: "This week", callback_data: `${ACTIONS.analytics}week` },
        { text: "This month", callback_data: `${ACTIONS.analytics}month` },
      ],
      [
        { text: "Today availability", callback_data: `${ACTIONS.availability}today` },
        { text: "Tomorrow availability", callback_data: `${ACTIONS.availability}tomorrow` },
      ],
      [{ text: "Back", callback_data: ACTIONS.backMain }],
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
      [{ text: "Back", callback_data: ACTIONS.backMain }],
    ],
  };
}

function buildResourceDetailKeyboard(resource) {
  return {
    inline_keyboard: [
      [
        { text: "Capacity -", callback_data: `${ACTIONS.resourceCapDown}${resource.id}` },
        { text: "Capacity +", callback_data: `${ACTIONS.resourceCapUp}${resource.id}` },
      ],
      [
        { text: "Upload image", callback_data: `${ACTIONS.resourceImageUpload}${resource.id}` },
        { text: "Delete image", callback_data: `${ACTIONS.resourceImageDelete}${resource.id}` },
      ],
      [
        {
          text: resource.is_active ? "Disable" : "Enable",
          callback_data: `${ACTIONS.resourceToggle}${resource.id}`,
        },
      ],
      [
        { text: "Resources", callback_data: `${ACTIONS.resource}menu` },
        { text: "Back", callback_data: ACTIONS.backMain },
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
      [{ text: "Back", callback_data: ACTIONS.backMain }],
    ],
  };
}

function buildPricingDetailKeyboard(rule) {
  const rows = [
    [
      { text: "Base -10k", callback_data: `${ACTIONS.pricingBaseDown}${rule.resourceType}` },
      { text: "Base +10k", callback_data: `${ACTIONS.pricingBaseUp}${rule.resourceType}` },
    ],
    [
      { text: "Extra -5k", callback_data: `${ACTIONS.pricingExtraDown}${rule.resourceType}` },
      { text: "Extra +5k", callback_data: `${ACTIONS.pricingExtraUp}${rule.resourceType}` },
    ],
    [
      { text: "Included -1", callback_data: `${ACTIONS.pricingIncludedDown}${rule.resourceType}` },
      { text: "Included +1", callback_data: `${ACTIONS.pricingIncludedUp}${rule.resourceType}` },
    ],
  ];

  if (rule.includesTapchan) {
    rows.push([
      { text: "Discount -5%", callback_data: `${ACTIONS.pricingDiscountDown}${rule.resourceType}` },
      { text: "Discount +5%", callback_data: `${ACTIONS.pricingDiscountUp}${rule.resourceType}` },
    ]);
  }

  rows.push([
    { text: "Pricing", callback_data: `${ACTIONS.pricing}menu` },
    { text: "Back", callback_data: ACTIONS.backMain },
  ]);

  return { inline_keyboard: rows };
}

function formatBookingList(title, bookings) {
  if (bookings.length === 0) {
    return `${title}\n\nNo bookings found.`;
  }

  return [
    title,
    "",
    ...bookings.map((booking) =>
      [
        `${booking.bookingLabel}`,
        `ID: ${booking.id}`,
        `Status: ${booking.trackingStatus}`,
        `Source: ${booking.source}`,
        `Dates: ${booking.dateStart}${booking.dateEnd ? ` - ${booking.dateEnd}` : ""}`,
        `Price: ${formatPrice(booking.totalPrice)} UZS`,
      ].join("\n")),
  ].join("\n\n");
}

function formatResourceDetail(resource, overview) {
  return [
    "Resource details",
    "",
    `Name: ${resource.name}`,
    `Type: ${resource.type}`,
    `Capacity: ${resource.capacity}`,
    `Active: ${resource.is_active ? "yes" : "no"}`,
    `Image: ${resource.imageUrl ? "set" : "not set"}`,
    `Available now: ${resource.is_active && !resource.bookedNow ? "yes" : "no"}`,
    `Upcoming bookings: ${resource.upcomingBookings}`,
    "",
    `Total active resources: ${overview.activeResources}`,
    `Booked now: ${overview.bookedNow}`,
    `Free now: ${overview.availableNow}`,
  ].join("\n");
}

function formatPricingDetail(rule) {
  return [
    "Pricing control",
    "",
    `Resource type: ${rule.resourceType}`,
    `Base price: ${formatPrice(rule.basePrice)} UZS`,
    `Extra person: ${formatPrice(rule.extraPersonPrice)} UZS`,
    `Included people: ${rule.maxIncludedPeople}`,
    `Discount: ${Math.round(rule.discountIfExcluded * 100)}%`,
  ].join("\n");
}

function formatSystemStatus(status) {
  return [
    "System status",
    "",
    `Active resources: ${status.activeResources}`,
    `Inactive resources: ${status.inactiveResources}`,
    `Pending bookings: ${status.pendingBookings}`,
    `Awaiting confirmation: ${status.awaitingConfirmation}`,
    `Available now: ${status.availableNow}`,
    `Booked now: ${status.bookedNow}`,
    `Issues: ${status.issues.join("; ") || "none"}`,
  ].join("\n");
}

export function createManagerBot() {
  const managerToken = readOptionalEnv("MANAGER_BOT_TOKEN");
  const telegram = managerToken ? createTelegramClient(managerToken) : null;
  const pendingImageUploads = new Map();

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

  async function showMainMenu(chatId, text = "Manager dashboard ready.") {
    await sendManagerMessage(chatId, text, {
      reply_markup: buildMainKeyboard(),
    });
  }

  async function showBookingsMenu(chatId) {
    await sendManagerMessage(chatId, "Booking history and availability filters:", {
      reply_markup: buildBookingsKeyboard(),
    });
  }

  async function showResourcesMenu(chatId) {
    const overview = await getResourceOverview();
    await sendManagerMessage(chatId, `${formatAvailabilityForTelegram(overview)}\n\nQuick add buttons are below.`, {
      reply_markup: buildResourcesKeyboard(overview.resources.slice(0, 20)),
    });
  }

  async function showPricingMenu(chatId) {
    const rules = await listPricingRules();
    await sendManagerMessage(chatId, "Pricing controls:", {
      reply_markup: buildPricingKeyboard(rules),
    });
  }

  async function showAnalyticsMenu(chatId) {
    await sendManagerMessage(chatId, "Analytics dashboard:", {
      reply_markup: buildAnalyticsKeyboard(),
    });
  }

  async function showFilteredBookings(chatId, key) {
    if (key === "today") {
      const bookings = await listBookingsForManager({
        date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()),
      });
      await sendManagerMessage(chatId, formatBookingList("Today bookings", bookings), { reply_markup: buildBookingsKeyboard() });
      return;
    }

    if (key === "tomorrow") {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowText = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit" }).format(tomorrow);
      const bookings = await listBookingsForManager({ date: tomorrowText });
      await sendManagerMessage(chatId, formatBookingList("Tomorrow bookings", bookings), { reply_markup: buildBookingsKeyboard() });
      return;
    }

    if (key.startsWith("src:")) {
      const source = key.slice(4);
      const bookings = await listBookingsForManager({ source });
      await sendManagerMessage(chatId, formatBookingList(`${source} bookings`, bookings), { reply_markup: buildBookingsKeyboard() });
      return;
    }

    const statusMap = {
      pending: "pending",
      awaiting: "awaiting confirmation",
      confirmed: "confirmed",
      rejected: "rejected",
    };

    const status = statusMap[key] ?? "";
    const bookings = await listBookingsForManager({ status });
    await sendManagerMessage(chatId, formatBookingList(`${status || "Recent"} bookings`, bookings), {
      reply_markup: buildBookingsKeyboard(),
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
      await sendManagerMessage(chatId, "Resource topilmadi.", { reply_markup: buildMainKeyboard() });
      return;
    }

    const imageAsset = await getLatestServiceMedia(resource.type);
    const detail = {
      ...resource,
      imageUrl: imageAsset?.url ?? "",
    };

    if (imageAsset?.url && telegram) {
      await telegram.sendPhoto(chatId, imageAsset.url, `${resource.name} image`);
    }

    await sendManagerMessage(chatId, formatResourceDetail(detail, overview), {
      reply_markup: buildResourceDetailKeyboard(resource),
    });
  }

  async function showPricingDetail(chatId, resourceType) {
    const rules = await listPricingRules();
    const rule = rules.find((item) => item.resourceType === resourceType);

    if (!rule) {
      await sendManagerMessage(chatId, "Pricing rule topilmadi.", { reply_markup: buildMainKeyboard() });
      return;
    }

    await sendManagerMessage(chatId, formatPricingDetail(rule), {
      reply_markup: buildPricingDetailKeyboard(rule),
    });
  }

  async function createResourceFromTemplate(chatId, resourceType) {
    const template = RESOURCE_TEMPLATES.find((item) => item.type === resourceType);

    if (!template) {
      await sendManagerMessage(chatId, "Resource template topilmadi.", {
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

    await sendManagerMessage(chatId, `${created.name} yaratildi.`, {
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
        await answerCallbackQuery(callbackQueryId, "Proof topilmadi.");
        return true;
      }

      await sendManagerProofPreview(chatId, bookingId, proofAsset, context.booking);
      await answerCallbackQuery(callbackQueryId, "Proof yuborildi.");
    } catch (error) {
      console.error(`Manager proof preview failed: ${formatAxiosError(error)}`);
      await answerCallbackQuery(callbackQueryId, "Proofni ochib bo'lmadi.");
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
      const context = approved ? await approveBookingProof(bookingId) : await rejectBookingProof(bookingId);

      await clearManagerDecisionKeyboard(chatId, messageId, bookingId);
      await answerCallbackQuery(callbackQueryId, approved ? "Bron tasdiqlandi." : "Bron rad etildi.");
      await sendManagerMessage(chatId, approved ? "Booking confirmed." : "Booking rejected.", {
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
        await answerCallbackQuery(callbackQueryId, "Menu");

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

        if (key === "analytics") {
          await showAnalyticsMenu(chatId);
          return true;
        }

        if (key === "report") {
          await showAnalytics(chatId, "today");
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
        await answerCallbackQuery(callbackQueryId, "Main menu");
        await showMainMenu(chatId);
        return true;
      }

      if (data.startsWith(ACTIONS.bookings)) {
        await answerCallbackQuery(callbackQueryId, "Bookings");
        await showFilteredBookings(chatId, data.slice(ACTIONS.bookings.length));
        return true;
      }

      if (data.startsWith(ACTIONS.analytics)) {
        await answerCallbackQuery(callbackQueryId, "Analytics");
        await showAnalytics(chatId, data.slice(ACTIONS.analytics.length));
        return true;
      }

      if (data.startsWith(ACTIONS.availability)) {
        await answerCallbackQuery(callbackQueryId, "Availability");
        await showAvailability(chatId, data.slice(ACTIONS.availability.length));
        return true;
      }

      if (data === `${ACTIONS.resource}menu`) {
        await answerCallbackQuery(callbackQueryId, "Resources");
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
        await answerCallbackQuery(callbackQueryId, "Resource updated.");
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
        await answerCallbackQuery(callbackQueryId, "Capacity updated.");
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
        await answerCallbackQuery(callbackQueryId, "Image upload mode");
        await sendManagerMessage(chatId, `${current.name} uchun yangi rasm yuboring. Photo yoki image document jo'nating.`, {
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
        await answerCallbackQuery(callbackQueryId, "Image deleted.");
        await showResourceDetail(chatId, resourceId);
        return true;
      }

      if (data.startsWith(ACTIONS.resourceCreate)) {
        await answerCallbackQuery(callbackQueryId, "Resource created");
        await createResourceFromTemplate(chatId, data.slice(ACTIONS.resourceCreate.length));
        return true;
      }

      if (data.startsWith(ACTIONS.resource)) {
        await answerCallbackQuery(callbackQueryId, "Resource");
        await showResourceDetail(chatId, data.slice(ACTIONS.resource.length));
        return true;
      }

      if (data === `${ACTIONS.pricing}menu`) {
        await answerCallbackQuery(callbackQueryId, "Pricing");
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
          await answerCallbackQuery(callbackQueryId, "Pricing updated.");
          await showPricingDetail(chatId, resourceType);
          return true;
        }
      }

      if (data.startsWith(ACTIONS.pricing)) {
        await answerCallbackQuery(callbackQueryId, "Pricing");
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

        if (pendingImageUpload) {
          const photo = Array.isArray(message.photo) ? message.photo.at(-1) : null;
          const document = message.document;
          const fileId = photo?.file_id || document?.file_id;
          const originalName = document?.file_name || `${pendingImageUpload.resourceType}.jpg`;
          const contentType = document?.mime_type || "image/jpeg";

          if (!fileId || (!photo && !String(contentType).startsWith("image/"))) {
            await sendManagerMessage(chatId, "Faqat rasm yuboring. Photo yoki image document qabul qilinadi.");
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
            await sendManagerMessage(chatId, `${pendingImageUpload.resourceName} rasmi yangilandi.`);
            await showResourceDetail(chatId, pendingImageUpload.resourceId);
          } catch (error) {
            console.error(`Manager image upload failed: ${formatAxiosError(error)}`);
            await sendManagerMessage(chatId, "Servis rasmini saqlab bo'lmadi.");
          }

          return;
        }

        if (isStartCommand(text) || isHelpCommand(text)) {
          await showMainMenu(chatId, "Manager panel tayyor. Barcha boshqaruv tugmalar orqali ishlaydi.");
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

        if (text === BUTTONS.analytics) {
          await showAnalyticsMenu(chatId);
          return;
        }

        if (text === BUTTONS.report) {
          await showAnalytics(chatId, "today");
          return;
        }

        if (text === BUTTONS.status) {
          const status = await getSystemStatus();
          await sendManagerMessage(chatId, formatSystemStatus(status), {
            reply_markup: buildMainKeyboard(),
          });
          return;
        }

        await showMainMenu(chatId, "Iltimos, boshqaruv uchun tugmalardan foydalaning.");
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

      await answerCallbackQuery(callbackQuery.id, "Unknown action.");
    },
  };
}
