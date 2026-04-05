export type PackageType = "stay" | "day";

export type PackageRecord = {
  id: string;
  name: string;
  description: string;
  type: PackageType;
  base_price: number;
  price_per_guest: number;
  max_guests: number;
  images: string[];
};

export type BookingStatus = "pending" | "approved" | "rejected";

export type BookingRecord = {
  id: string;
  package_id: string;
  package_name?: string;
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

export type MediaKind = "hero" | "gallery" | "package";

export type MediaAsset = {
  id: string;
  type: MediaKind;
  url: string;
  package_id?: string | null;
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
};
