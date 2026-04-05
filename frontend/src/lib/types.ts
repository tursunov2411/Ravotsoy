export type PackageType = "stay" | "day";
export type ResourceType =
  | "room_small"
  | "room_big"
  | "tapchan_small"
  | "tapchan_big"
  | "tapchan_very_big";

export type PackageRecord = {
  id: string;
  name: string;
  description: string;
  type: PackageType;
  base_price: number;
  price_per_guest: number;
  max_guests: number;
  images: string[];
  resource_type?: ResourceType;
  resource_quantity?: number;
};

export type BookingStatus =
  | "pending"
  | "proof_submitted"
  | "confirmed"
  | "rejected"
  | "cancelled"
  | "completed"
  | "approved";

export type BookingRecord = {
  id: string;
  package_id?: string | null;
  package_name?: string;
  booking_label?: string;
  name: string;
  phone: string;
  email?: string;
  guests: number;
  date_start: string;
  date_end?: string | null;
  estimated_price: number;
  status: BookingStatus;
  created_at?: string;
};

export type BookingQuote = {
  available: boolean;
  message: string;
  totalPrice: number;
  totalCapacity?: number;
  bookingLabel?: string;
  selections?: ResourceSelection[];
  suggestions?: ResourceSelection[];
  unavailable?: Array<Record<string, unknown>>;
  startDate: string;
  endDate?: string | null;
};

export type ResourceSelection = {
  resourceType: ResourceType | string;
  quantity: number;
  label?: string;
  includeTapchan?: boolean;
};

export type TripBuilderOption = {
  resourceType: ResourceType | string;
  label: string;
  shortLabel: string;
  bookingMode: "stay" | "day" | "flex";
  unitCapacity: number;
  availableUnits: number;
  maxQuantity: number;
  basePrice: number;
  pricePerExtraPerson: number;
  maxIncludedPeople: number;
  includesTapchan: boolean;
  discountIfExcluded: number;
  resourceNames: string[];
};

export type PricingRuleRecord = {
  resource_type: ResourceType | string;
  base_price: number;
  price_per_extra_person: number;
  max_included_people: number;
  discount_if_excluded: number;
  includes_tapchan: boolean;
};

export type ResourceRecord = {
  id: string;
  type: ResourceType | string;
  name: string;
  capacity: number;
  is_active: boolean;
};

export type PaymentConfig = {
  hotelName?: string;
  cardNumber?: string;
  cardHolder?: string;
  instructions?: string;
  managerTelegram?: string;
  depositRatio?: number;
  depositPercentage?: number;
  requiredAmount?: number;
};

export type MediaKind = "hero" | "gallery" | "package" | "service";

export type MediaAsset = {
  id: string;
  type: MediaKind;
  url: string;
  package_id?: string | null;
  resource_type?: ResourceType | string | null;
  storage_path?: string | null;
};

export type PackageInput = Omit<PackageRecord, "id" | "images">;

export type HomeFeatureCard = {
  id: string;
  title: string;
  description: string;
  icon: "trees" | "sparkles" | "message-circle" | "map-pinned";
};

export type FaqItem = {
  id: string;
  question: string;
  answer: string;
};

export type SightseeingPlace = {
  id: string;
  name: string;
  description: string;
};

export type AboutStat = {
  id: string;
  value: string;
  label: string;
  description: string;
  icon: "calendar" | "users" | "shield" | "sparkles";
};

export type ContentSectionType = "about" | "faq" | "packages" | "gallery" | "sightseeing" | "contacts";

export type ContentSection = {
  id: string;
  page: "home";
  section_type: ContentSectionType;
  eyebrow: string;
  title: string;
  description: string;
  content: Record<string, unknown>;
  sort_order: number;
  is_enabled: boolean;
};

export type PublicContact = {
  id: string;
  name: string;
  role: string;
  phone: string;
  telegram: string;
};

export type SiteSettings = {
  id: number;
  hotel_name?: string | null;
  location_url: string;
  description?: string | null;
  about_text?: string | null;
  hero_images?: string[];
  contact_people?: PublicContact[];
  payment_card_number?: string | null;
  payment_card_holder?: string | null;
  payment_instructions?: string | null;
  payment_manager_telegram?: string | null;
  payment_deposit_ratio?: number | null;
};

export type TelegramPrefillResult = {
  token: string;
  expiresAt: string;
  quote: BookingQuote;
};
