import { motion } from "framer-motion";
import { Button } from "./Button";
import { Card } from "./Card";
import type { PackageRecord } from "../lib/types";
import { formatCurrency } from "../lib/utils";

type PackageCardProps = {
  item: PackageRecord;
};

export function PackageCard({ item }: PackageCardProps) {
  const shortDescription =
    item.description.length > 120 ? `${item.description.slice(0, 117).trim()}...` : item.description;

  return (
    <motion.article
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -8, scale: 1.01 }}
      className="group"
    >
      <Card strong className="overflow-hidden p-0 transition duration-300 group-hover:shadow-[0_30px_75px_rgba(15,23,42,0.16)]">
        <div className="relative h-64 overflow-hidden">
          <img
            src={item.images[0] ?? "https://placehold.co/1200x800?text=Ravotsoy"}
            alt={item.name}
            className="h-full w-full object-cover transition duration-700 group-hover:scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[rgba(15,23,42,0.55)] via-[rgba(15,23,42,0.1)] to-transparent opacity-70 transition duration-500 group-hover:opacity-90" />
          <div className="absolute left-4 top-4 rounded-full bg-white/88 px-3 py-1 text-xs font-semibold text-ink shadow-md">
            {item.type === "stay" ? "Tunab qolish" : "Kunlik dam olish"}
          </div>
          <div className="absolute inset-x-0 bottom-0 p-5 text-white">
            <p className="text-xs uppercase tracking-[0.28em] text-white/70">Ravotsoy tanlovi</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight">{item.name}</h3>
          </div>
        </div>
        <div className="space-y-5 p-6">
          <p className="min-h-12 text-sm leading-7 text-ink/65">{shortDescription}</p>

          <div className="grid grid-cols-2 gap-4 rounded-[24px] surface-panel p-4 text-sm text-ink/72">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-ink/38">Boshlang'ich narx</p>
              <p className="mt-2 text-base font-semibold text-ink">{formatCurrency(item.base_price)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-ink/38">Har mehmon uchun</p>
              <p className="mt-2 text-base font-semibold text-ink">{formatCurrency(item.price_per_guest)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-ink/38">Maksimal mehmon</p>
              <p className="mt-2 text-base font-semibold text-ink">{item.max_guests} kishi</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-ink/38">Format</p>
              <p className="mt-2 text-base font-semibold text-ink">
                {item.type === "stay" ? "Kechalik paket" : "Kunlik paket"}
              </p>
            </div>
          </div>

          <Button
            to="/bron"
            state={{ packageId: item.id }}
            className="w-full hover:scale-[1.02]"
          >
            Bron qilish
          </Button>
        </div>
      </Card>
    </motion.article>
  );
}
