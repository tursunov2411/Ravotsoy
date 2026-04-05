const RESOURCE_TYPE_META = {
  room_small: {
    label: "Kichik xona",
    shortLabel: "Kichik xona",
    bookingMode: "stay",
  },
  room_big: {
    label: "Katta xona",
    shortLabel: "Katta xona",
    bookingMode: "stay",
  },
  tapchan_small: {
    label: "Kichik tapchan",
    shortLabel: "Tapchan",
    bookingMode: "day",
  },
  tapchan_big: {
    label: "Katta tapchan",
    shortLabel: "Katta tapchan",
    bookingMode: "day",
  },
  tapchan_very_big: {
    label: "Juda katta tapchan",
    shortLabel: "Katta tapchan",
    bookingMode: "day",
  },
};

function prettifyResourceType(value) {
  return String(value ?? "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
    .trim();
}

export function getResourceTypeMeta(resourceType) {
  const type = String(resourceType ?? "").trim();
  const meta = RESOURCE_TYPE_META[type];

  if (meta) {
    return meta;
  }

  const label = prettifyResourceType(type) || "Resurs";
  return {
    label,
    shortLabel: label,
    bookingMode: "flex",
  };
}

function isRoomResource(resourceType) {
  return String(resourceType ?? "").trim().startsWith("room_");
}

function normalizeIncludeTapchan(resourceType, value) {
  if (!isRoomResource(resourceType)) {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value ?? "").trim().toLowerCase();

  if (!normalized) {
    return true;
  }

  return ["true", "1", "yes", "on", "include", "included"].includes(normalized);
}

export function buildSelectionLabel(selection) {
  const resourceType = String(selection?.resourceType ?? selection?.resource_type ?? "").trim();
  const meta = getResourceTypeMeta(resourceType);
  const includeTapchan = normalizeIncludeTapchan(
    resourceType,
    selection?.includeTapchan ?? selection?.include_tapchan,
  );

  if (includeTapchan === false) {
    return `${meta.label} (tapchansiz)`;
  }

  if (includeTapchan === true && isRoomResource(resourceType)) {
    return `${meta.label} (tapchan bilan)`;
  }

  return meta.label;
}

export function normalizeResourceSelections(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const grouped = new Map();

  for (const item of value) {
    const record = item && typeof item === "object" ? item : {};
    const resourceType = String(
      record.resourceType ?? record.resource_type ?? record.type ?? "",
    ).trim();
    const quantity = Number.parseInt(String(record.quantity ?? 0), 10);
    const includeTapchan = normalizeIncludeTapchan(
      resourceType,
      record.includeTapchan ?? record.include_tapchan,
    );

    if (!resourceType || !Number.isInteger(quantity) || quantity <= 0) {
      continue;
    }

    const key = includeTapchan === undefined ? resourceType : `${resourceType}:${includeTapchan ? "with" : "without"}`;
    const existing = grouped.get(key) ?? {
      resourceType,
      quantity: 0,
      includeTapchan,
    };

    existing.quantity += quantity;
    grouped.set(key, existing);
  }

  return Array.from(grouped.values()).map((selection) => ({
    resourceType: selection.resourceType,
    quantity: selection.quantity,
    includeTapchan: selection.includeTapchan,
    label: buildSelectionLabel(selection),
  }));
}

export function summarizeResourceSelections(value, fallback = "Ko'rsatilmagan") {
  const selections = normalizeResourceSelections(value);

  if (selections.length === 0) {
    return fallback;
  }

  return selections
    .map((item) => `${item.label}${item.quantity > 1 ? ` x${item.quantity}` : ""}`)
    .join(", ");
}

export function summarizeBookingResources(bookingResources, fallbackPackageName = "") {
  if (!Array.isArray(bookingResources) || bookingResources.length === 0) {
    return fallbackPackageName || "Ko'rsatilmagan";
  }

  const grouped = new Map();

  for (const item of bookingResources) {
    const record = item && typeof item === "object" ? item : {};
    const resource = record.resources && typeof record.resources === "object" ? record.resources : {};
    const resourceType = String(resource.type ?? "").trim();
    const quantity = Number.parseInt(String(record.quantity ?? 1), 10);
    const current = grouped.get(resourceType) ?? 0;
    grouped.set(resourceType, current + (Number.isInteger(quantity) && quantity > 0 ? quantity : 1));
  }

  return summarizeResourceSelections(
    Array.from(grouped.entries()).map(([resourceType, quantity]) => ({
      resourceType,
      quantity,
    })),
    fallbackPackageName,
  );
}

export function extractBookingSelections(bookingResources) {
  if (!Array.isArray(bookingResources)) {
    return [];
  }

  return bookingResources
    .map((item) => {
      const record = item && typeof item === "object" ? item : {};
      const resource = record.resources && typeof record.resources === "object" ? record.resources : {};
      const resourceType = String(resource.type ?? "").trim();
      const quantity = Number.parseInt(String(record.quantity ?? 1), 10);

      if (!resourceType || !Number.isInteger(quantity) || quantity <= 0) {
        return null;
      }

      return {
        resourceType,
        quantity,
        label: getResourceTypeMeta(resourceType).label,
        resourceName: String(resource.name ?? "").trim(),
        capacity: Number(resource.capacity ?? 0),
      };
    })
    .filter(Boolean);
}
