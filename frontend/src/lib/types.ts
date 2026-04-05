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
};

export type PackageInput = Omit<PackageRecord, "id" | "images">;

export type SiteSettings = {
  id: number;
  location_label: string;
  location_url: string;
  maps_embed_url?: string | null;
  contacts_button_label?: string | null;
  contacts_button_url?: string | null;
};
