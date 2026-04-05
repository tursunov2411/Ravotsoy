import type { BookingRecord, ContentSection, MediaAsset, PackageRecord, SiteSettings } from "./types";

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
  hotel_name: "Ravotsoy Dam Olish Maskani",
  location_url: "https://yandex.com/maps/-/CHeC5WPL",
  description:
    "Tabiat manzarasi, shinam muhit va oilaviy hordiq uchun mo'ljallangan tunab qolish hamda kunlik dam olish paketlari.",
  about_text:
    "Ravotsoy Dam olish Maskani mehmonlarga sokin muhit, keng hudud va sifatli hordiq tajribasini taqdim etadi. Oilaviy sayohat, do'stlar davrasi yoki qisqa kunlik dam olish uchun qulay yechimlar tayyorlangan.",
  hero_images: ["hero-1"],
  contact_people: [],
};

export const mockHomeSections: ContentSection[] = [
  {
    id: "section-about",
    page: "home",
    section_type: "about",
    eyebrow: "Biz haqimizda",
    title: "Ravotsoyda tabiiy tinchlik va qulay dam olish birlashadi",
    description: "",
    content: {},
    sort_order: 10,
    is_enabled: true,
  },
  {
    id: "section-highlights",
    page: "home",
    section_type: "highlights",
    eyebrow: "Afzalliklar",
    title: "Mehmonlarga yoqadigan asosiy jihatlar",
    description: "",
    content: {
      cards: [
        {
          id: "nature",
          title: "Tabiat",
          description: "Ochiq havo, manzara va osoyishta muhit.",
          icon: "trees",
        },
        {
          id: "comfort",
          title: "Qulaylik",
          description: "Toza, shinam va mehmonlar uchun mos tayyor joylar.",
          icon: "sparkles",
        },
        {
          id: "contact",
          title: "Aloqa",
          description: "Telegram orqali tezkor javob va bron bo'yicha yordam.",
          icon: "message-circle",
        },
      ],
    },
    sort_order: 20,
    is_enabled: true,
  },
  {
    id: "section-packages",
    page: "home",
    section_type: "packages",
    eyebrow: "Paketlar",
    title: "Tanlangan paketlar",
    description: "",
    content: {},
    sort_order: 30,
    is_enabled: true,
  },
  {
    id: "section-sightseeing",
    page: "home",
    section_type: "sightseeing",
    eyebrow: "Atrofdagi maskanlar",
    title: "Ravotsoy atrofida ko'rish mumkin bo'lgan joylar",
    description:
      "Dam olish davomida yaqin hududdagi manzarali joylar va sayr uchun qiziqarli nuqtalarni ham ko'rib chiqishingiz mumkin.",
    content: {
      places: [
        {
          id: "ravotsoy-view",
          name: "Ravotsoy manzarali hududi",
          description: "Tonggi sayr va sokin manzara uchun mos ochiq hudud.",
        },
        {
          id: "family-picnic",
          name: "Oilaviy piknik joylari",
          description: "Qisqa dam olish va suratga tushish uchun qulay joylar.",
        },
      ],
    },
    sort_order: 40,
    is_enabled: true,
  },
  {
    id: "section-gallery",
    page: "home",
    section_type: "gallery",
    eyebrow: "Galereya",
    title: "Hudud va muhit",
    description: "",
    content: {},
    sort_order: 50,
    is_enabled: true,
  },
  {
    id: "section-contacts",
    page: "home",
    section_type: "contacts",
    eyebrow: "Aloqa",
    title: "Biz bilan bog'laning",
    description: "Bron, bo'sh joylar va qo'shimcha ma'lumot uchun xodimlarimiz bilan bog'laning.",
    content: {},
    sort_order: 60,
    is_enabled: true,
  },
];
