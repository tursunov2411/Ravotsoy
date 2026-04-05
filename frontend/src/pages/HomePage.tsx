import { ArrowRight, ExternalLink, MapPinned, MessageCircleMore, Phone, Sparkles, Trees } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatedSection } from "../components/AnimatedSection";
import { PackageCard } from "../components/PackageCard";
import InteractiveBentoGallery, {
  type BentoGalleryItem,
} from "../components/ui/interactive-bento-gallery";
import { getMediaAssets, getPackages, getSiteSettings } from "../lib/api";
import type { MediaAsset, PackageRecord, PublicContact, SiteSettings } from "../lib/types";
import { getPhoneLink, getTelegramLink, getTelegramProfileLink, isVideoUrl } from "../lib/utils";

export function HomePage() {
  const [packages, setPackages] = useState<PackageRecord[]>([]);
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [siteSettings, setSiteSettings] = useState<SiteSettings | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [packagesData, mediaData, settingsData] = await Promise.all([
          getPackages(),
          getMediaAssets(),
          getSiteSettings(),
        ]);
        setPackages(packagesData);
        setMedia(mediaData);
        setSiteSettings(settingsData);
      } catch (error) {
        console.error(error);
      }
    };

    void load();
  }, []);

  const hero = media.find((item) => item.type === "hero") ?? media[0];
  const gallery = media.filter((item) => item.type === "gallery");
  const telegramLink = getTelegramLink("Salom, Ravotsoy Dam olish Maskani haqida ma'lumot olmoqchiman.");
  const mapsEmbedUrl = siteSettings?.maps_embed_url?.trim() ?? "";
  const locationUrl = siteSettings?.location_url?.trim() || "https://yandex.com/maps/-/CHeC5WPL";
  const locationLabel = siteSettings?.location_label?.trim() || "Bizning manzilimiz";
  const contactPeople = siteSettings?.contact_people ?? [];
  const featuredContacts = contactPeople.filter(
    (item) => item.name.trim() || item.phone.trim() || item.telegram.trim(),
  );
  const galleryItems = useMemo<BentoGalleryItem[]>(() => {
    const spans = [
      "sm:col-span-1 sm:row-span-3 md:col-span-1 md:row-span-3",
      "sm:col-span-2 sm:row-span-2 md:col-span-2 md:row-span-2",
      "sm:col-span-1 sm:row-span-2 md:col-span-1 md:row-span-3",
      "sm:col-span-2 sm:row-span-2 md:col-span-2 md:row-span-2",
      "sm:col-span-1 sm:row-span-3 md:col-span-1 md:row-span-3",
      "sm:col-span-1 sm:row-span-2 md:col-span-2 md:row-span-2",
    ];

    return gallery.map((item, index) => ({
      id: item.id,
      type: isVideoUrl(item.url) ? "video" : "image",
      title: `Ravotsoydan lavha ${index + 1}`,
      desc:
        index % 2 === 0
          ? "Hududning tabiiy manzarasi va osoyishta dam olish muhiti."
          : "Mehmonlar uchun tayyorlangan qulay maskan va dam olish kayfiyati.",
      url: item.url,
      span: spans[index % spans.length],
    }));
  }, [gallery]);

  return (
    <div className="pb-12">
      <section className="relative min-h-[100svh] overflow-hidden">
        {hero && isVideoUrl(hero.url) ? (
          <video
            src={hero.url}
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <img
            src={hero?.url ?? "https://placehold.co/1800x1200?text=Ravotsoy+Dam+olish+Maskani"}
            alt="Ravotsoy Dam olish Maskani"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}

        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/25 to-black/55" />

        <div className="relative mx-auto flex min-h-[100svh] max-w-7xl flex-col justify-end px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <AnimatedSection className="max-w-4xl text-white">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm backdrop-blur">
              <Sparkles size={16} />
              Tabiat qo'ynidagi sokin hordiq
            </div>

            <h1 className="mt-6 text-5xl font-semibold leading-tight tracking-tight sm:text-6xl lg:text-7xl">
              Ravotsoy Dam olish Maskani
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-8 text-white/85 sm:text-lg">
              Tabiat manzarasi, shinam muhit va oilaviy hordiq uchun mo'ljallangan
              tunab qolish hamda kunlik dam olish paketlari.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/paketlar"
                className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-medium text-ink transition hover:bg-pearl"
              >
                Paketlarni ko'rish
              </Link>
              <Link
                to="/bron"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/25 px-6 py-3 text-sm font-medium text-white transition hover:bg-white/10"
              >
                Bron qilish
                <ArrowRight size={16} />
              </Link>
            </div>
          </AnimatedSection>
        </div>
      </section>

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <AnimatedSection className="mt-8">
          <div className="grid gap-4 rounded-[32px] border border-black/5 bg-white/80 p-5 shadow-soft md:grid-cols-3">
            <div className="rounded-[24px] bg-pearl p-5">
              <p className="text-xs uppercase tracking-[0.28em] text-ink/40">Yo'nalish</p>
              <p className="mt-3 text-2xl font-semibold text-ink">Yandex xarita orqali tez toping</p>
              <a
                href={locationUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-pine"
              >
                Joylashuvni ochish
                <ExternalLink size={16} />
              </a>
            </div>
            <div className="rounded-[24px] bg-pearl p-5">
              <p className="text-xs uppercase tracking-[0.28em] text-ink/40">Bron</p>
              <p className="mt-3 text-2xl font-semibold text-ink">Paketni tanlang va darhol so'rov yuboring</p>
              <p className="mt-3 text-sm leading-7 text-ink/62">
                Paketlar bazadan yuklanadi, narx esa mehmonlar soni va sanaga qarab hisoblanadi.
              </p>
            </div>
            <div className="rounded-[24px] bg-pearl p-5">
              <p className="text-xs uppercase tracking-[0.28em] text-ink/40">Aloqa</p>
              <p className="mt-3 text-2xl font-semibold text-ink">Savollar uchun xodimlar bilan bevosita bog'laning</p>
              <p className="mt-3 text-sm leading-7 text-ink/62">
                Telefon orqali qo'ng'iroq qiling yoki Telegram profiliga yozing.
              </p>
            </div>
          </div>
        </AnimatedSection>

        <AnimatedSection className="mt-16">
          <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
            <div className="rounded-[32px] border border-black/5 bg-white p-8 shadow-soft">
              <p className="text-xs uppercase tracking-[0.3em] text-ink/35">Biz haqimizda</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                Ravotsoyda tabiiy tinchlik va qulay dam olish birlashadi
              </h2>
              <p className="mt-4 text-sm leading-8 text-ink/65">
                Ravotsoy Dam olish Maskani mehmonlarga sokin muhit, keng hudud va
                sifatli hordiq tajribasini taqdim etadi. Oilaviy sayohat, do'stlar
                davrasi yoki qisqa kunlik dam olish uchun qulay yechimlar tayyorlangan.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-[32px] bg-pearl p-6">
                <Trees className="text-pine" size={22} />
                <p className="mt-4 text-3xl font-semibold">Tabiat</p>
                <p className="mt-2 text-sm leading-6 text-ink/60">
                  Ochiq havo, manzara va osoyishta muhit.
                </p>
              </div>
              <div className="rounded-[32px] bg-pearl p-6">
                <Sparkles className="text-pine" size={22} />
                <p className="mt-4 text-3xl font-semibold">Qulaylik</p>
                <p className="mt-2 text-sm leading-6 text-ink/60">
                  Toza, shinam va mehmonlar uchun mos tayyor joylar.
                </p>
              </div>
              <div className="rounded-[32px] bg-pearl p-6">
                <MessageCircleMore className="text-pine" size={22} />
                <p className="mt-4 text-3xl font-semibold">Aloqa</p>
                <p className="mt-2 text-sm leading-6 text-ink/60">
                  Telegram orqali tezkor javob va bron bo'yicha yordam.
                </p>
              </div>
            </div>
          </div>
        </AnimatedSection>

        <AnimatedSection className="mt-16">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-ink/35">Paketlar</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                Tanlangan paketlar
              </h2>
            </div>
            <Link to="/paketlar" className="hidden text-sm font-medium text-ink/60 sm:inline-flex">
              Barchasini ko'rish
            </Link>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {packages.slice(0, 3).map((item) => (
              <PackageCard key={item.id} item={item} />
            ))}
          </div>
        </AnimatedSection>

        <AnimatedSection className="mt-16">
          <div className="mb-8">
            <p className="text-xs uppercase tracking-[0.3em] text-ink/35">Galereya</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Hudud va muhit
            </h2>
          </div>

          {galleryItems.length > 0 ? (
            <InteractiveBentoGallery
              mediaItems={galleryItems}
              title="Ravotsoy lahzalari"
              description="Suratlar va videolarni ochib ko'ring, joyini siljitib tanlang va hududdagi muhitni yaqinroq his qiling."
            />
          ) : (
            <div className="rounded-[32px] border border-black/5 bg-white p-8 shadow-soft">
              <p className="text-sm leading-7 text-ink/60">
                Galereya hozircha tayyorlanmoqda. Yaqinda hudud suratlari shu yerda ko'rinadi.
              </p>
            </div>
          )}
        </AnimatedSection>

        <AnimatedSection className="mt-16">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="overflow-hidden rounded-[32px] border border-black/5 bg-white shadow-soft">
              <div className="border-b border-black/5 px-8 py-6">
                <p className="text-xs uppercase tracking-[0.3em] text-ink/35">Joylashuv</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight">Maskan manzili</h2>
              </div>
              <div className="flex h-[420px] items-center justify-center bg-[radial-gradient(circle_at_top,#ebf4ef_0%,#f6f3ec_55%,#ffffff_100%)] p-8">
                <div className="max-w-md rounded-[28px] border border-black/6 bg-white/88 p-8 text-center shadow-soft backdrop-blur">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-pearl text-pine">
                    <MapPinned size={24} />
                  </div>
                  <h3 className="mt-5 text-2xl font-semibold tracking-tight text-ink">{locationLabel}</h3>
                  <p className="mt-3 text-sm leading-7 text-ink/62">
                    Maskan joylashuvini Yandex xarita orqali oching va yo'lni qulay toping.
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

            <div className="rounded-[32px] border border-black/5 bg-white p-8 shadow-soft">
              <p className="text-xs uppercase tracking-[0.3em] text-ink/35">Aloqa</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">Biz bilan bog'laning</h2>
              <p className="mt-4 text-sm leading-8 text-ink/65">
                Bron, bo'sh joylar va qo'shimcha ma'lumot uchun xodimlarimiz bilan to'g'ridan-to'g'ri gaplashing.
              </p>

              <div className="mt-8 rounded-[28px] bg-pearl p-5">
                <div className="flex items-center gap-3">
                  <MapPinned className="text-pine" size={20} />
                  <a
                    href={locationUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium text-ink transition hover:text-pine"
                  >
                    {locationLabel}
                  </a>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-3">
                <a
                  href={telegramLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-ink px-5 py-4 text-sm font-medium text-white transition hover:bg-pine"
                >
                  <MessageCircleMore size={18} />
                  Telegram orqali bog'lanish
                </a>
              </div>

              {featuredContacts.length > 0 ? (
                <div className="mt-6 grid gap-4">
                  {featuredContacts.map((contact) => {
                    const phoneLink = getPhoneLink(contact.phone);
                    const telegramProfile = getTelegramProfileLink(contact.telegram);

                    return (
                      <div key={contact.id} className="rounded-[24px] border border-black/6 bg-pearl/60 p-5">
                        <p className="text-lg font-semibold text-ink">{contact.name || "Xodim"}</p>
                        {contact.role ? <p className="mt-1 text-sm text-ink/55">{contact.role}</p> : null}
                        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                          {contact.phone ? (
                            <a
                              href={phoneLink}
                              className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-4 py-3 text-sm font-medium text-ink transition hover:bg-white/80"
                            >
                              <Phone size={16} />
                              {contact.phone}
                            </a>
                          ) : null}
                          {contact.telegram ? (
                            <a
                              href={telegramProfile}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center justify-center gap-2 rounded-full border border-black/10 bg-white px-4 py-3 text-sm font-medium text-ink transition hover:bg-white/80"
                            >
                              <MessageCircleMore size={16} />
                              Telegram profil
                            </a>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-6 rounded-[24px] border border-dashed border-black/10 bg-pearl/50 p-5 text-sm leading-7 text-ink/58">
                  Aloqa ma'lumotlari yaqin orada yangilanadi. Hozircha umumiy Telegram havolasi orqali yozishingiz mumkin.
                </div>
              )}
            </div>
          </div>
        </AnimatedSection>
      </div>
    </div>
  );
}
