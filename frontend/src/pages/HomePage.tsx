import {
  ArrowRight,
  CalendarRange,
  ChevronDown,
  ExternalLink,
  MapPinned,
  MessageCircleMore,
  Phone,
  CircleHelp,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatedSection } from "../components/AnimatedSection";
import { PackageCard } from "../components/PackageCard";
import InteractiveBentoGallery, {
  type BentoGalleryItem,
} from "../components/ui/interactive-bento-gallery";
import { getHomeSections, getMediaAssets, getPackages, getSiteSettings } from "../lib/api";
import type {
  AboutStat,
  ContentSection,
  FaqItem,
  MediaAsset,
  PackageRecord,
  SightseeingPlace,
  SiteSettings,
} from "../lib/types";
import { getPhoneLink, getTelegramLink, getTelegramProfileLink, isVideoUrl } from "../lib/utils";

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title?: string;
  description?: string;
}) {
  return (
    <div className="max-w-3xl">
      {eyebrow ? (
        <p className="text-xs uppercase tracking-[0.32em] text-ink/38">{eyebrow}</p>
      ) : null}
      {title ? <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{title}</h2> : null}
      {description ? <p className="mt-4 text-sm leading-8 text-ink/62">{description}</p> : null}
    </div>
  );
}

function parseFaqItems(value: unknown): FaqItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = item as Record<string, unknown>;
      const question = String(record.question ?? "").trim();
      const answer = String(record.answer ?? "").trim();

      if (!question && !answer) {
        return null;
      }

      return {
        id: String(record.id ?? crypto.randomUUID()),
        question,
        answer,
      } satisfies FaqItem;
    })
    .filter((item): item is FaqItem => Boolean(item));
}

function parseSightseeingPlaces(value: unknown): SightseeingPlace[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = item as Record<string, unknown>;
      const name = String(record.name ?? "").trim();
      const description = String(record.description ?? "").trim();

      if (!name && !description) {
        return null;
      }

      return {
        id: String(record.id ?? crypto.randomUUID()),
        name,
        description,
      } satisfies SightseeingPlace;
    })
    .filter((item): item is SightseeingPlace => Boolean(item));
}

function parseAboutStats(value: unknown): AboutStat[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = item as Record<string, unknown>;
      const icon = String(record.icon ?? "sparkles") as AboutStat["icon"];

      return {
        id: String(record.id ?? crypto.randomUUID()),
        value: String(record.value ?? "").trim(),
        label: String(record.label ?? "").trim(),
        description: String(record.description ?? "").trim(),
        icon:
          icon === "calendar" || icon === "users" || icon === "shield" || icon === "sparkles"
            ? icon
            : "sparkles",
      } satisfies AboutStat;
    })
    .filter((item) => item.value || item.label || item.description);
}

function AboutStatIcon({ icon }: { icon: AboutStat["icon"] }) {
  if (icon === "calendar") {
    return <CalendarRange className="text-white" size={20} />;
  }

  if (icon === "users") {
    return <Users className="text-white" size={20} />;
  }

  if (icon === "shield") {
    return <ShieldCheck className="text-white" size={20} />;
  }

  return <Sparkles className="text-white" size={20} />;
}

export function HomePage() {
  const [sections, setSections] = useState<ContentSection[]>([]);
  const [packages, setPackages] = useState<PackageRecord[]>([]);
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [siteSettings, setSiteSettings] = useState<SiteSettings | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [openFaqId, setOpenFaqId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [sectionsData, packagesData, mediaData, settingsData] = await Promise.all([
          getHomeSections(),
          getPackages(),
          getMediaAssets(),
          getSiteSettings(),
        ]);
        setSections(sectionsData);
        setPackages(packagesData);
        setMedia(mediaData);
        setSiteSettings(settingsData);
      } catch (error) {
        console.error(error);
      }
    };

    void load();
  }, []);

  const orderedSections = useMemo(
    () =>
      [...sections]
        .filter((section) => section.is_enabled)
        .sort((left, right) => left.sort_order - right.sort_order),
    [sections],
  );

  const heroMedia = useMemo(() => media.filter((item) => item.type === "hero"), [media]);
  const heroSlides = useMemo(() => {
    if ((siteSettings?.hero_images?.length ?? 0) > 0) {
      return siteSettings!.hero_images!
        .map((id) => heroMedia.find((item) => item.id === id))
        .filter((item): item is MediaAsset => Boolean(item));
    }

    return heroMedia;
  }, [heroMedia, siteSettings]);
  const galleryMedia = useMemo(() => media.filter((item) => item.type === "gallery"), [media]);
  const contactPeople = siteSettings?.contact_people ?? [];
  const locationUrl = siteSettings?.location_url?.trim() || "https://yandex.com/maps/-/CHeC5WPL";
  const hotelName = siteSettings?.hotel_name?.trim() || "Ravotsoy Dam Olish Maskani";
  const hotelDescription =
    siteSettings?.description?.trim() ||
    "Tabiat bag'rida dam olish, paketlar va bron ma'lumotlari shu sahifada boshqariladi.";
  const aboutText = siteSettings?.about_text?.trim() || hotelDescription;
  const telegramLink = getTelegramLink(`${hotelName} haqida ma'lumot olmoqchiman.`);

  useEffect(() => {
    if (heroSlides.length <= 1) {
      setHeroIndex(0);
      return;
    }

    const timer = window.setInterval(() => {
      setHeroIndex((current) => (current + 1) % heroSlides.length);
    }, 5200);

    return () => window.clearInterval(timer);
  }, [heroSlides.length]);

  const galleryItems = useMemo<BentoGalleryItem[]>(
    () =>
      galleryMedia.map((item, index) => ({
        id: item.id,
        type: isVideoUrl(item.url) ? "video" : "image",
        title: `${hotelName} media ${index + 1}`,
        desc: hotelDescription,
        url: item.url,
        span:
          [
            "sm:col-span-1 sm:row-span-3 md:col-span-1 md:row-span-3",
            "sm:col-span-2 sm:row-span-2 md:col-span-2 md:row-span-2",
            "sm:col-span-1 sm:row-span-2 md:col-span-1 md:row-span-3",
            "sm:col-span-2 sm:row-span-2 md:col-span-2 md:row-span-2",
            "sm:col-span-1 sm:row-span-3 md:col-span-1 md:row-span-3",
            "sm:col-span-1 sm:row-span-2 md:col-span-2 md:row-span-2",
          ][index % 6],
      })),
    [galleryMedia, hotelDescription, hotelName],
  );

  const renderSection = (section: ContentSection) => {
    if (section.section_type === "about") {
      const aboutStats = parseAboutStats(section.content.stats);

      return (
        <AnimatedSection key={section.id} className="mt-16">
          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-[36px] border border-black/5 bg-white p-8 shadow-soft sm:p-10">
              <SectionHeading eyebrow={section.eyebrow} title={section.title} />
              <p className="mt-5 text-sm leading-8 text-ink/64">{aboutText}</p>
            </div>

            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {aboutStats.length > 0 ? (
                  aboutStats.map((item, index) => (
                    <div
                      key={item.id}
                      className={`rounded-[32px] p-6 shadow-[0_24px_80px_rgba(15,23,42,0.16)] ${
                        index % 2 === 0
                          ? "bg-[#07111f] text-white"
                          : "bg-[linear-gradient(135deg,#1c4a7e_0%,#215f87_45%,#237a64_100%)] text-white"
                      }`}
                    >
                      <div className="inline-flex rounded-2xl border border-white/10 bg-white/10 p-3">
                        <AboutStatIcon icon={item.icon} />
                      </div>
                      <p className="mt-5 text-5xl font-semibold tracking-tight">{item.value}</p>
                      <p className="mt-3 text-sm uppercase tracking-[0.28em] text-white/58">{item.label}</p>
                      {item.description ? (
                        <p className="mt-3 text-sm leading-7 text-white/72">{item.description}</p>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="rounded-[32px] bg-[#07111f] p-6 text-white shadow-[0_24px_80px_rgba(15,23,42,0.16)] sm:col-span-2">
                    <p className="text-5xl font-semibold tracking-tight">{packages.length}+</p>
                    <p className="mt-3 text-sm uppercase tracking-[0.28em] text-white/58">Paketlar</p>
                    <p className="mt-3 text-sm leading-7 text-white/72">Tanlangan dam olish paketlari.</p>
                  </div>
                )}
              </div>

              <div className="rounded-[32px] bg-pearl p-6">
                <p className="text-xs uppercase tracking-[0.28em] text-ink/35">Joylashuv</p>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm leading-7 text-ink/62">
                    Yo'nalishni Yandex xaritada ochish va mehmonlar uchun qulay yetib kelish havolasini ishlatish mumkin.
                  </p>
                  <a
                    href={locationUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-medium text-ink transition hover:bg-white/80"
                  >
                    Xarita
                    <ExternalLink size={16} />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </AnimatedSection>
      );
    }

    if (section.section_type === "faq") {
      const faqItems = parseFaqItems(section.content.items);
      const ctaLabel = String(section.content.cta_label ?? "Boshqa savolingiz bormi? Telegramdan so'rang").trim();
      const hasCustomCtaUrl = typeof section.content.cta_url === "string";
      const rawCtaUrl = hasCustomCtaUrl ? String(section.content.cta_url ?? "").trim() : "";
      const ctaUrl = hasCustomCtaUrl ? getTelegramProfileLink(rawCtaUrl) : telegramLink;
      const showCta = hasCustomCtaUrl ? ctaUrl.length > 0 : Boolean(ctaLabel);

      return (
        <AnimatedSection key={section.id} className="mt-16">
          <div className="rounded-[36px] bg-[linear-gradient(180deg,#f4f9f4_0%,#edf5ed_100%)] p-8 shadow-soft sm:p-10">
            <SectionHeading eyebrow={section.eyebrow} title={section.title} description={section.description} />
            <div className="mt-8 grid gap-4">
              {faqItems.length > 0 ? (
                faqItems.map((item) => {
                  const isOpen = openFaqId === item.id;

                  return (
                    <div key={item.id} className="overflow-hidden rounded-[28px] border border-black/6 bg-white shadow-soft">
                      <button
                        type="button"
                        onClick={() => setOpenFaqId((current) => (current === item.id ? null : item.id))}
                        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                      >
                        <div className="flex items-start gap-4">
                          <div className="mt-1 inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                            <CircleHelp size={18} />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold tracking-tight text-ink sm:text-xl">{item.question}</h3>
                          </div>
                        </div>
                        <ChevronDown
                          size={18}
                          className={`shrink-0 text-ink/45 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                        />
                      </button>
                      <motion.div
                        initial={false}
                        animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }}
                        transition={{ duration: 0.22, ease: "easeOut" }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-black/6 px-6 pb-6 pt-5 text-sm leading-8 text-ink/62">
                          {item.answer}
                        </div>
                      </motion.div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-[32px] border border-dashed border-black/10 bg-white p-8 text-sm text-ink/60">
                  FAQ savollari hali qo'shilmagan.
                </div>
              )}
            </div>

            {ctaLabel && showCta ? (
              <div className="mt-8">
                <a
                  href={ctaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-medium text-white transition hover:bg-pine"
                >
                  <MessageCircleMore size={18} />
                  {ctaLabel}
                </a>
              </div>
            ) : (
              null
            )}
          </div>
        </AnimatedSection>
      );
    }

    if (section.section_type === "packages") {
      return (
        <AnimatedSection key={section.id} className="mt-16">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <SectionHeading eyebrow={section.eyebrow} title={section.title} description={section.description} />
            <Link to="/paketlar" className="inline-flex items-center gap-2 text-sm font-medium text-ink/60">
              Barcha paketlar
              <ArrowRight size={16} />
            </Link>
          </div>
          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            {packages.length > 0 ? (
              packages.slice(0, 3).map((item) => <PackageCard key={item.id} item={item} />)
            ) : (
              <div className="rounded-[32px] border border-dashed border-black/10 bg-white p-8 text-sm text-ink/60 lg:col-span-3">
                Hali paketlar qo'shilmagan.
              </div>
            )}
          </div>
        </AnimatedSection>
      );
    }

    if (section.section_type === "sightseeing") {
      const places = parseSightseeingPlaces(section.content.places);

      return (
        <AnimatedSection key={section.id} className="mt-16">
          <div className="grid gap-6 lg:grid-cols-[0.96fr_1.04fr]">
            <div className="rounded-[36px] bg-[#07111f] p-8 text-white shadow-[0_24px_80px_rgba(15,23,42,0.16)] sm:p-10">
              <SectionHeading eyebrow={section.eyebrow} title={section.title} description={section.description} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {places.length > 0 ? (
                places.map((place, index) => (
                  <div
                    key={place.id}
                    className={`rounded-[32px] border border-black/5 p-6 shadow-soft ${
                      index % 2 === 0 ? "bg-white" : "bg-pearl"
                    }`}
                  >
                    <p className="text-xs uppercase tracking-[0.28em] text-ink/35">Sayr nuqtasi</p>
                    <h3 className="mt-3 text-2xl font-semibold tracking-tight text-ink">{place.name}</h3>
                    <p className="mt-3 text-sm leading-7 text-ink/60">{place.description}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-[32px] border border-dashed border-black/10 bg-white p-8 text-sm text-ink/60 md:col-span-2">
                  Sayr nuqtalari hali qo'shilmagan.
                </div>
              )}
            </div>
          </div>
        </AnimatedSection>
      );
    }

    if (section.section_type === "gallery") {
      return (
        <AnimatedSection key={section.id} className="mt-16">
          <SectionHeading eyebrow={section.eyebrow} title={section.title} description={section.description} />
          <div className="mt-8">
            {galleryItems.length > 0 ? (
              <InteractiveBentoGallery
                mediaItems={galleryItems}
                title={section.title || hotelName}
                description={section.description || hotelDescription}
              />
            ) : (
              <div className="rounded-[32px] border border-dashed border-black/10 bg-white p-8 text-sm text-ink/60">
                Galereya uchun media hali yuklanmagan.
              </div>
            )}
          </div>
        </AnimatedSection>
      );
    }

    if (section.section_type === "contacts") {
      return (
        <AnimatedSection key={section.id} className="mt-16">
          <div className="grid gap-6 lg:grid-cols-[0.98fr_1.02fr]">
            <div className="overflow-hidden rounded-[36px] border border-black/5 bg-white shadow-soft">
              <div className="border-b border-black/5 px-8 py-7">
                <SectionHeading eyebrow={section.eyebrow} title={section.title} description={section.description} />
              </div>
              <div className="flex h-full min-h-[320px] items-center justify-center bg-[radial-gradient(circle_at_top,#ecf8ef_0%,#f7f3ea_52%,#ffffff_100%)] p-8">
                <div className="max-w-md rounded-[28px] border border-black/6 bg-white/85 p-8 text-center shadow-soft backdrop-blur">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-pearl text-pine">
                    <MapPinned size={24} />
                  </div>
                  <h3 className="mt-5 text-2xl font-semibold tracking-tight text-ink">Joylashuv</h3>
                  <p className="mt-3 text-sm leading-7 text-ink/62">
                    Manzil havolasi orqali mehmonlar Yandex xaritada yo'nalishni tez ochishi mumkin.
                  </p>
                  <a
                    href={locationUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-pine"
                  >
                    Yandex xaritada ochish
                    <ExternalLink size={16} />
                  </a>
                </div>
              </div>
            </div>

            <div className="rounded-[36px] border border-black/5 bg-white p-8 shadow-soft sm:p-10">
              <div className="flex flex-col gap-3 sm:flex-row">
                <a
                  href={telegramLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition hover:bg-pine"
                >
                  <MessageCircleMore size={18} />
                  Telegram orqali yozish
                </a>
              </div>

              <div className="mt-6 grid gap-4">
                {contactPeople.length > 0 ? (
                  contactPeople.map((contact) => (
                    <div key={contact.id} className="rounded-[28px] bg-pearl p-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-xl font-semibold text-ink">{contact.name || "Xodim"}</p>
                          {contact.role ? <p className="mt-1 text-sm text-ink/55">{contact.role}</p> : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {contact.phone ? (
                            <a
                              href={getPhoneLink(contact.phone)}
                              className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-3 text-sm font-medium text-ink transition hover:bg-white/80"
                            >
                              <Phone size={16} />
                              {contact.phone}
                            </a>
                          ) : null}
                          {contact.telegram ? (
                            <a
                              href={getTelegramProfileLink(contact.telegram)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-3 text-sm font-medium text-ink transition hover:bg-white/80"
                            >
                              <MessageCircleMore size={16} />
                              Telegram
                            </a>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[28px] border border-dashed border-black/10 bg-pearl/55 p-6 text-sm leading-7 text-ink/58">
                    Xodimlar kontaktlari shu yerda ko'rsatiladi.
                  </div>
                )}
              </div>
            </div>
          </div>
        </AnimatedSection>
      );
    }

    return null;
  };

  return (
    <div className="pb-14">
      <section className="relative min-h-[100svh] overflow-hidden">
        <div className="absolute inset-0">
          {heroSlides.length > 0 ? (
            heroSlides.map((item, index) =>
              isVideoUrl(item.url) ? (
                <video
                  key={item.id}
                  src={item.url}
                  autoPlay
                  muted
                  loop
                  playsInline
                  className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${
                    index === heroIndex ? "opacity-100" : "opacity-0"
                  }`}
                />
              ) : (
                <img
                  key={item.id}
                  src={item.url}
                  alt={hotelName}
                  className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${
                    index === heroIndex ? "opacity-100" : "opacity-0"
                  }`}
                />
              ),
            )
          ) : (
            <div className="absolute inset-0 bg-[linear-gradient(120deg,#0b1324_0%,#173865_52%,#1d6f63_100%)]" />
          )}
        </div>

        <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(4,9,22,0.82)_0%,rgba(7,17,31,0.64)_36%,rgba(7,17,31,0.48)_58%,rgba(7,17,31,0.78)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12)_0%,transparent_28%)]" />

        <div className="relative mx-auto flex min-h-[100svh] max-w-7xl flex-col justify-between px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <div className="pt-24 text-white lg:pt-28">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/10 px-4 py-2 text-sm backdrop-blur"
            >
              <Sparkles size={16} />
              Tabiat bag'ridagi hordiq
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="mt-6 max-w-5xl text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl"
            >
              {hotelName}
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.14, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="mt-5 max-w-2xl text-base leading-8 text-white/82 sm:text-lg"
            >
              {hotelDescription}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="mt-8 flex flex-col gap-3 sm:flex-row"
            >
              <Link
                to="/paketlar"
                className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-medium text-ink transition hover:bg-pearl"
              >
                Paketlarni ko'rish
              </Link>
              <Link
                to="/bron"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/24 px-6 py-3 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Bron qilish
                <ArrowRight size={16} />
              </Link>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="mt-10 flex flex-wrap gap-3"
          >
            <a
              href={locationUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/18 bg-white/8 px-4 py-3 text-sm font-medium text-white backdrop-blur transition hover:bg-white/12"
            >
              <MapPinned size={16} />
              Joylashuv
            </a>
            <a
              href={telegramLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/18 bg-white/8 px-4 py-3 text-sm font-medium text-white backdrop-blur transition hover:bg-white/12"
            >
              <MessageCircleMore size={16} />
              Telegram
            </a>
          </motion.div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">{orderedSections.map(renderSection)}</div>
    </div>
  );
}
