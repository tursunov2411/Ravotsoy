import { useEffect, useState } from "react";
import { AnimatedSection } from "../components/AnimatedSection";
import PricingSection4 from "../components/ui/pricing-section-4";
import { getPackages } from "../lib/api";
import type { PackageRecord } from "../lib/types";

export function PackagesPage() {
  const [packages, setPackages] = useState<PackageRecord[]>([]);
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
        <PricingSection4 packages={packages} />
      )}
    </div>
  );
}
