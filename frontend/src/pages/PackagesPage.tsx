import { useEffect, useMemo, useState } from "react";
import { AnimatedSection } from "../components/AnimatedSection";
import { PackageCard } from "../components/PackageCard";
import { getPackages } from "../lib/api";
import type { PackageRecord, PackageType } from "../lib/types";

export function PackagesPage() {
  const [packages, setPackages] = useState<PackageRecord[]>([]);
  const [selectedType, setSelectedType] = useState<PackageType>("day");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        setError("");
        setPackages(await getPackages());
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
                <p className="text-xs uppercase tracking-[0.3em] text-white/55">Paketlar</p>
                <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
                  O'zingizga mos dam olish formatini tez tanlang
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-8 text-white/72 sm:text-base">
                  Paketlar ikki yo'nalishda jamlangan: kunlik dam olish va tunab qolish.
                  Kerakli turini tanlang, qolganini esa sahifa sodda ko'rinishda ko'rsatadi.
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
