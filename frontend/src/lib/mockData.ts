import type { BookingRecord, MediaAsset, PackageRecord, SiteSettings } from "./types";

export const mockPackages: PackageRecord[] = [
  {
    id: "pkg-family",
    name: "Oilaviy dam olish paketi",
    description:
      "Ko'l manzarasi, nonushta va shinam kottej bilan 2 kechalik sokin dam olish dasturi.",
    type: "stay",
    base_price: 950000,
    price_per_guest: 180000,
    max_guests: 6,
    images: [
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80"
    ],
  },
  {
    id: "pkg-adventure",
    name: "Sarguzasht kuni",
    description:
      "Bir kunlik paket: tog' etagida hordiq, baliq ovlash hududi va ochiq havodagi ovqatlanish zonasi.",
    type: "day",
    base_price: 420000,
    price_per_guest: 95000,
    max_guests: 10,
    images: [
      "https://images.unsplash.com/photo-1510798831971-661eb04b3739?auto=format&fit=crop&w=1200&q=80"
    ],
  },
  {
    id: "pkg-romantic",
    name: "Romantik oqshom paketi",
    description:
      "Juftliklar uchun mo'ljallangan xususiy zona, kechki bezaklar va yengil servis bilan maxsus tun.",
    type: "stay",
    base_price: 1250000,
    price_per_guest: 220000,
    max_guests: 2,
    images: [
      "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1200&q=80"
    ],
  },
];

export const mockGallery: MediaAsset[] = [
  {
    id: "hero-1",
    type: "hero",
    url:
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=80",
  },
  {
    id: "gallery-1",
    type: "gallery",
    url:
      "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "gallery-2",
    type: "gallery",
    url:
      "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "gallery-3",
    type: "gallery",
    url:
      "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80",
  },
];

export const mockBookings: BookingRecord[] = [
  {
    id: "booking-demo",
    package_id: "pkg-family",
    package_name: "Oilaviy dam olish paketi",
    name: "Aziza Qodirova",
    phone: "+998901112233",
    email: "aziza@example.com",
    guests: 4,
    date_start: "2026-05-10",
    date_end: "2026-05-12",
    estimated_price: 2620000,
    status: "pending",
    created_at: "2026-04-05T09:00:00.000Z",
  },
];

export const mockSiteSettings: SiteSettings = {
  id: 1,
  location_label: "Bizning manzilimiz",
  location_url: "https://yandex.com/maps/-/CHeC5WPL",
  maps_embed_url: "",
  contacts_button_label: "",
  contacts_button_url: "",
  contact_people: [],
};
