import { motion } from "framer-motion";
import { Link } from "react-router-dom";
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
      whileHover={{ y: -8 }}
      className="group overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-soft transition-shadow duration-300 hover:shadow-[0_22px_60px_rgba(17,17,17,0.12)]"
    >
      <div className="relative h-64 overflow-hidden">
        <img
          src={item.images[0] ?? "https://placehold.co/1200x800?text=Ravotsoy"}
          alt={item.name}
          className="h-full w-full object-cover transition duration-700 group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-60 transition duration-500 group-hover:opacity-90" />
        <div className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-ink shadow">
          {item.type === "stay" ? "Tunab qolish" : "Bir kunlik"}
        </div>
      </div>
      <div className="space-y-4 p-6">
        <div className="space-y-2">
          <h3 className="text-2xl font-semibold tracking-tight">{item.name}</h3>
          <p className="min-h-12 text-sm leading-6 text-ink/65">{shortDescription}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-3xl bg-pearl p-4 text-sm text-ink/70">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-ink/35">Boshlang'ich narx</p>
            <p className="mt-1 font-semibold text-ink">{formatCurrency(item.base_price)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-ink/35">Har mehmon uchun</p>
            <p className="mt-1 font-semibold text-ink">{formatCurrency(item.price_per_guest)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-ink/35">Maksimal mehmon</p>
            <p className="mt-1 font-semibold text-ink">{item.max_guests} kishi</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-ink/35">Format</p>
            <p className="mt-1 font-semibold text-ink">
              {item.type === "stay" ? "Kechalik paket" : "Kunlik paket"}
            </p>
          </div>
        </div>

        <Link
          to="/bron"
          state={{ packageId: item.id }}
          className="inline-flex w-full items-center justify-center rounded-full bg-ink px-5 py-3 text-sm font-medium text-white transition duration-300 hover:bg-pine"
        >
          Bron qilish
        </Link>
      </div>
    </motion.article>
  );
}
