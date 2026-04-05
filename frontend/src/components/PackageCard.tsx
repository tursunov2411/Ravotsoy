import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Images, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "./Button";
import type { PackageRecord } from "../lib/types";
import { formatCurrency } from "../lib/utils";

type PackageCardProps = {
  item: PackageRecord;
};

export function PackageCard({ item }: PackageCardProps) {
  const [open, setOpen] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const images = useMemo(
    () => (item.images.length > 0 ? item.images : ["https://placehold.co/1400x900?text=Ravotsoy"]),
    [item.images],
  );
  const activeImage = images[activeImageIndex] ?? images[0];

  const moveImage = (direction: "next" | "prev") => {
    setActiveImageIndex((current) => {
      if (direction === "next") {
        return (current + 1) % images.length;
      }

      return current === 0 ? images.length - 1 : current - 1;
    });
  };

  const openModal = () => {
    setActiveImageIndex(0);
    setOpen(true);
  };

  return (
    <>
      <motion.button
        type="button"
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        whileHover={{ y: -6 }}
        onClick={openModal}
        className="group relative h-44 overflow-hidden rounded-[30px] text-left shadow-[0_24px_70px_rgba(15,23,42,0.12)]"
      >
        <img
          src={images[0]}
          alt={item.name}
          className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,17,31,0.1)_0%,rgba(7,17,31,0.35)_38%,rgba(7,17,31,0.82)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 p-5 text-white">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/14 bg-white/10 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur">
            <Images size={14} />
            {images.length} ta rasm
          </div>
          <h3 className="mt-3 text-2xl font-semibold tracking-tight">{item.name}</h3>
        </div>
      </motion.button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(4,9,22,0.72)] px-4 py-6 backdrop-blur-md"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 28, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 22, scale: 0.98 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="relative max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-[34px] bg-white shadow-[0_40px_120px_rgba(15,23,42,0.28)]"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="absolute right-5 top-5 z-20 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/14 bg-[rgba(7,17,31,0.45)] text-white backdrop-blur transition hover:bg-[rgba(7,17,31,0.62)]"
                aria-label="Yopish"
              >
                <X size={18} />
              </button>

              <div className="grid max-h-[92vh] overflow-y-auto lg:grid-cols-[1.15fr_0.85fr]">
                <div className="relative min-h-[360px] bg-[#07111f] lg:min-h-[640px]">
                  <img src={activeImage} alt={item.name} className="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,17,31,0.12)_0%,rgba(7,17,31,0.2)_45%,rgba(7,17,31,0.68)_100%)]" />

                  {images.length > 1 ? (
                    <>
                      <button
                        type="button"
                        onClick={() => moveImage("prev")}
                        className="absolute left-5 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/14 bg-[rgba(7,17,31,0.45)] text-white backdrop-blur transition hover:bg-[rgba(7,17,31,0.62)]"
                        aria-label="Oldingi rasm"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveImage("next")}
                        className="absolute right-5 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/14 bg-[rgba(7,17,31,0.45)] text-white backdrop-blur transition hover:bg-[rgba(7,17,31,0.62)]"
                        aria-label="Keyingi rasm"
                      >
                        <ChevronRight size={18} />
                      </button>
                    </>
                  ) : null}

                  <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-8">
                    <p className="text-xs uppercase tracking-[0.28em] text-white/60">
                      {item.type === "stay" ? "Tunab qolish" : "Kunlik dam olish"}
                    </p>
                    <h3 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{item.name}</h3>
                  </div>
                </div>

                <div className="flex flex-col justify-between p-6 sm:p-8">
                  <div>
                    <div className="rounded-[28px] bg-pearl p-5">
                      <p className="text-sm leading-8 text-ink/64">{item.description}</p>
                    </div>

                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                      <div className="rounded-[24px] border border-black/6 bg-white p-5">
                        <p className="text-xs uppercase tracking-[0.24em] text-ink/38">Boshlang'ich narx</p>
                        <p className="mt-2 text-xl font-semibold text-ink">{formatCurrency(item.base_price)}</p>
                      </div>
                      <div className="rounded-[24px] border border-black/6 bg-white p-5">
                        <p className="text-xs uppercase tracking-[0.24em] text-ink/38">Har mehmon uchun</p>
                        <p className="mt-2 text-xl font-semibold text-ink">{formatCurrency(item.price_per_guest)}</p>
                      </div>
                      <div className="rounded-[24px] border border-black/6 bg-white p-5">
                        <p className="text-xs uppercase tracking-[0.24em] text-ink/38">Maksimal mehmon</p>
                        <p className="mt-2 text-xl font-semibold text-ink">{item.max_guests} kishi</p>
                      </div>
                      <div className="rounded-[24px] border border-black/6 bg-white p-5">
                        <p className="text-xs uppercase tracking-[0.24em] text-ink/38">Rasmlar</p>
                        <p className="mt-2 text-xl font-semibold text-ink">{images.length} ta</p>
                      </div>
                    </div>

                    {images.length > 1 ? (
                      <div className="mt-5 grid grid-cols-4 gap-3">
                        {images.map((image, index) => (
                          <button
                            key={`${item.id}-${image}-${index}`}
                            type="button"
                            onClick={() => setActiveImageIndex(index)}
                            className={`overflow-hidden rounded-[18px] border transition ${
                              index === activeImageIndex
                                ? "border-ink shadow-[0_14px_30px_rgba(15,23,42,0.12)]"
                                : "border-black/8"
                            }`}
                          >
                            <img src={image} alt={`${item.name} ${index + 1}`} className="h-20 w-full object-cover" />
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                    <Button to="/bron" state={{ packageId: item.id }} className="w-full justify-center">
                      Bron qilish
                    </Button>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="inline-flex w-full items-center justify-center rounded-2xl border border-black/10 px-6 py-3 text-sm font-semibold text-ink transition hover:bg-pearl sm:w-auto"
                    >
                      Yopish
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
