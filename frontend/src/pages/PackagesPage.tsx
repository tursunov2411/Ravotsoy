import { useEffect, useMemo, useState } from "react";
import { AnimatedSection } from "../components/AnimatedSection";
import { PackageCard } from "../components/PackageCard";
import { getHomeSections, getPackages, getSiteSettings } from "../lib/api";
import type { ContentSection, PackageRecord, PackageType, SiteSettings } from "../lib/types";

export function PackagesPage() {
  const [packages, setPackages] = useState<PackageRecord[]>([]);
  const [siteSettings, setSiteSettings] = useState<SiteSettings | null>(null);
  const [homeSections, setHomeSections] = useState<ContentSection[]>([]);
  const [selectedType, setSelectedType] = useState<PackageType>("day");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        setError("");
        const [packagesData, settingsData, sectionsData] = await Promise.all([
          getPackages(),
          getSiteSettings(),
          getHomeSections(),
        ]);
        setPackages(packagesData);
        setSiteSettings(settingsData);
        setHomeSections(sectionsData);
      } catch (loadError) {
        console.error(loadError);
        setError("Paketlarni yuklashda xatolik yuz berdi.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const filteredPackages = useMemo(
    () => packages.filter((item) => item.type === selectedType),
    [packages, selectedType],
  );
  const packagesSection = homeSections.find((item) => item.section_type === "packages");
  const hotelName = siteSettings?.hotel_name?.trim() || "Ravotsoy Dam Olish Maskani";
  const heroTitle = packagesSection?.title?.trim() || `${hotelName} paketlari`;
  const heroDescription =
    packagesSection?.description?.trim() ||
    siteSettings?.description?.trim() ||
    "Mos paketni tanlang va bronni davom ettiring.";

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {loading ? (
        <AnimatedSection className="rounded-[32px] border border-black/5 bg-white p-8 text-sm text-ink/60 shadow-soft">
          Paketlar yuklanmoqda...
        </AnimatedSection>
      ) : error ? (
        <AnimatedSection className="rounded-[32px] border border-red-200 bg-red-50 p-8 text-sm text-red-700 shadow-soft">
          {error}
        </AnimatedSection>
      ) : (
        <div className="space-y-8">
          <AnimatedSection className="rounded-[40px] bg-[#07111f] px-6 py-12 text-white shadow-[0_24px_80px_rgba(15,23,42,0.18)] sm:px-8 lg:px-10">
            <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-white/55">
                  {packagesSection?.eyebrow || "Paketlar"}
                </p>
                <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
                  {heroTitle}
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-8 text-white/72 sm:text-base">
                  {heroDescription}
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedType("day")}
                  className={`rounded-full px-5 py-3 text-sm font-medium transition ${
                    selectedType === "day"
                      ? "bg-white text-ink"
                      : "border border-white/16 bg-white/8 text-white"
                  }`}
                >
                  Kunlik paketlar
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedType("stay")}
                  className={`rounded-full px-5 py-3 text-sm font-medium transition ${
                    selectedType === "stay"
                      ? "bg-white text-ink"
                      : "border border-white/16 bg-white/8 text-white"
                  }`}
                >
                  Tunab qolish
                </button>
              </div>
            </div>
          </AnimatedSection>

          {filteredPackages.length > 0 ? (
            <div className="grid gap-6 lg:grid-cols-3">
              {filteredPackages.map((item) => (
                <PackageCard key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <AnimatedSection className="rounded-[32px] border border-black/5 bg-white p-8 text-sm text-ink/60 shadow-soft">
              Bu bo'lim uchun hozircha paketlar qo'shilmagan.
            </AnimatedSection>
          )}
        </div>
      )}
    </div>
  );
}
