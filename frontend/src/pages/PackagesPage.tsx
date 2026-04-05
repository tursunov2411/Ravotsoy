import { useEffect, useState } from "react";
import { AnimatedSection } from "../components/AnimatedSection";
import { Card } from "../components/Card";
import { PackageCard } from "../components/PackageCard";
import { getPackages } from "../lib/api";
import type { PackageRecord } from "../lib/types";

type PackageSectionProps = {
  title: string;
  description: string;
  items: PackageRecord[];
};

function PackageSection({ title, description, items }: PackageSectionProps) {
  return (
    <AnimatedSection className="mt-12">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-ink">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-ink/60">{description}</p>
        </div>
        <div className="inline-flex w-fit rounded-full surface-panel px-4 py-2 text-sm font-medium text-ink/70">
          {items.length} ta paket
        </div>
      </div>

      {items.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <PackageCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <Card className="border border-dashed border-black/10 px-6 py-10 text-sm text-ink/55">
          Hozircha bu bo'lim uchun paketlar qo'shilmagan.
        </Card>
      )}
    </AnimatedSection>
  );
}

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

  const stayPackages = packages.filter((item) => item.type === "stay");
  const dayPackages = packages.filter((item) => item.type === "day");

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <AnimatedSection>
        <Card strong className="overflow-hidden p-0">
          <div className="grid gap-6 p-8 lg:grid-cols-[1.1fr_0.9fr] lg:p-10">
            <div className="max-w-3xl">
              <p className="text-xs uppercase tracking-[0.3em] text-ink/35">Paketlar</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
                Tunab qolish va kunlik hordiq uchun tayyor paketlar
              </h1>
              <p className="mt-4 text-base leading-8 text-ink/65">
                Barcha paketlar Supabase bazasidan yuklanadi. O'zingizga mos formatni tanlang,
                narxlarni solishtiring va bir tugma bilan bron jarayoniga o'ting.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-[28px] surface-panel p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-ink/35">Tunab qolish</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight">{stayPackages.length}</p>
                <p className="mt-2 text-sm leading-6 text-ink/60">
                  Bir yoki bir necha kechalik dam olish uchun mo'ljallangan paketlar.
                </p>
              </div>
              <div className="rounded-[28px] surface-panel p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-ink/35">Kunlik dam olish</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight">{dayPackages.length}</p>
                <p className="mt-2 text-sm leading-6 text-ink/60">
                  Bir kunlik tashrif, oilaviy hordiq va tezkor dam olish variantlari.
                </p>
              </div>
            </div>
          </div>
        </Card>
      </AnimatedSection>

      {loading ? (
        <AnimatedSection className="mt-12">
          <Card className="text-sm text-ink/60">
            Paketlar yuklanmoqda...
          </Card>
        </AnimatedSection>
      ) : error ? (
        <AnimatedSection className="mt-12">
          <div className="rounded-[32px] border border-red-200 bg-red-50 p-8 text-sm text-red-700 shadow-soft">
            {error}
          </div>
        </AnimatedSection>
      ) : (
        <>
          <PackageSection
            title="Tunab qolish"
            description="Kechalik dam olish, oilaviy sayohat yoki juftliklar uchun mo'ljallangan paketlar."
            items={stayPackages}
          />
          <PackageSection
            title="Kunlik dam olish"
            description="Bir kunlik tabiat qo'ynida hordiq, tadbir yoki qisqa sayohat uchun tanlovlar."
            items={dayPackages}
          />
        </>
      )}
    </div>
  );
}
