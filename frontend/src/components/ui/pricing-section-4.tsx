import NumberFlow from "@number-flow/react";
import { motion } from "framer-motion";
import {
  BedDouble,
  CalendarDays,
  Check,
  ChevronRight,
  Sparkles as SparklesIcon,
  Users,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { PackageRecord, PackageType } from "../../lib/types";
import { cn, formatCurrency } from "../../lib/utils";
import { Card, CardContent, CardHeader } from "./card";
import { Sparkles } from "./sparkles";
import { TimelineContent } from "./timeline-animation";
import { VerticalCutReveal } from "./vertical-cut-reveal";

const fallbackImages = [
  "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1519046904884-53103b34b206?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1200&q=80",
];

type PricingSectionProps = {
  packages: PackageRecord[];
};

type SwitchProps = {
  selectedType: PackageType;
  onSwitch: (value: PackageType) => void;
};

function PricingSwitch({ selectedType, onSwitch }: SwitchProps) {
  return (
    <div className="flex justify-center">
      <div className="relative z-10 mx-auto flex w-fit rounded-full border border-white/10 bg-neutral-900/80 p-1 shadow-[0_12px_40px_rgba(0,0,0,0.25)] backdrop-blur-xl">
        {[
          { value: "day" as const, label: "Kunlik" },
          { value: "stay" as const, label: "Tunab qolish" },
        ].map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => onSwitch(item.value)}
            className={cn(
              "relative z-10 h-11 rounded-full px-4 py-2 text-sm font-medium transition-colors sm:px-6",
              selectedType === item.value ? "text-white" : "text-neutral-200",
            )}
          >
            {selectedType === item.value ? (
              <motion.span
                layoutId="package-switch"
                className="absolute left-0 top-0 h-11 w-full rounded-full border border-sky-400/70 bg-gradient-to-t from-sky-500 to-blue-500 shadow-[0_10px_30px_rgba(37,99,235,0.45)]"
                transition={{ type: "spring", stiffness: 420, damping: 30 }}
              />
            ) : null}
            <span className="relative">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function packageSubtitle(type: PackageType) {
  return type === "stay"
    ? "Tunab qolish, oilaviy sayohat va sokin dam olish uchun tanlangan paketlar."
    : "Bir kunlik hordiq, tabiat qo'ynida dam va tezkor sayohat uchun variantlar.";
}

function packagePeriod(type: PackageType) {
  return type === "stay" ? "kecha" : "kun";
}

function typeLabel(type: PackageType) {
  return type === "stay" ? "Tunab qolish paketi" : "Kunlik dam olish paketi";
}

function packageHighlights(item: PackageRecord) {
  return [
    `${item.max_guests} kishigacha qulay joy`,
    typeLabel(item.type),
    `${formatCurrency(item.price_per_guest)} har bir mehmon uchun`,
  ];
}

export default function PricingSection4({ packages }: PricingSectionProps) {
  const [selectedType, setSelectedType] = useState<PackageType>("day");
  const pricingRef = useRef<HTMLDivElement>(null);

  const revealVariants = {
    visible: (index: number) => ({
      y: 0,
      opacity: 1,
      filter: "blur(0px)",
      transition: {
        delay: index * 0.11,
        duration: 0.45,
      },
    }),
    hidden: {
      y: 24,
      opacity: 0,
      filter: "blur(10px)",
    },
  };

  const filteredPackages = useMemo(
    () => packages.filter((item) => item.type === selectedType),
    [packages, selectedType],
  );

  return (
    <div
      className="relative mx-auto overflow-x-hidden rounded-[40px] bg-[#050816] px-4 pb-10 pt-20 sm:px-6 lg:px-8"
      ref={pricingRef}
    >
      <TimelineContent
        animationNum={0}
        customVariants={revealVariants}
        className="absolute inset-x-0 top-0 h-80 overflow-hidden"
        
      >
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff12_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:68px_72px]" />
        <Sparkles
          density={900}
          speed={0.7}
          opacity={0.85}
          color="#ffffff"
          className="absolute inset-0 h-full w-full"
        />
      </TimelineContent>

      <div
        className="absolute left-[10%] right-[10%] top-0 h-full w-[80%] opacity-70"
        style={{
          backgroundImage:
            "radial-gradient(circle at center, rgba(37,99,235,0.7) 0%, transparent 70%)",
          mixBlendMode: "screen",
        }}
      />

      <article className="relative z-10 mx-auto mb-8 max-w-3xl space-y-4 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium uppercase tracking-[0.28em] text-white/70">
          <SparklesIcon className="h-4 w-4" />
          Paketlar
        </div>

        <h1 className="text-4xl font-medium text-white sm:text-5xl">
          <VerticalCutReveal
            splitBy="words"
            staggerDuration={0.12}
            staggerFrom="first"
            reverse
            containerClassName="justify-center"
            transition={{
              type: "spring",
              stiffness: 220,
              damping: 34,
              delay: 0,
            }}
          >
            Sizga mos dam olish paketini tanlang
          </VerticalCutReveal>
        </h1>

        <TimelineContent
          as="p"
          animationNum={1}
          customVariants={revealVariants}
          className="text-sm leading-7 text-white/72 sm:text-base"
        >
          Narxlar va paketlar real vaqt rejimida bazadan olinadi. Kerakli formatni tanlang va
          bir necha soniyada bron sahifasiga o'ting.
        </TimelineContent>

        <TimelineContent as="div" animationNum={2} customVariants={revealVariants}>
          <PricingSwitch selectedType={selectedType} onSwitch={setSelectedType} />
        </TimelineContent>
      </article>

      <div className="relative z-10 mx-auto grid max-w-6xl gap-5 py-6 md:grid-cols-2 xl:grid-cols-3">
        {filteredPackages.map((plan, index) => {
          const image = plan.images[0] ?? fallbackImages[index % fallbackImages.length];
          const popular = index === 1 || (filteredPackages.length === 1 && index === 0);

          return (
            <TimelineContent
              key={plan.id}
              as="div"
              animationNum={index + 3}
              customVariants={revealVariants}
            >
              <Card
                className={cn(
                  "relative overflow-hidden border-white/10 text-white shadow-[0_24px_90px_rgba(2,8,23,0.45)]",
                  popular
                    ? "bg-gradient-to-br from-[#0c1331] via-[#111827] to-[#09111f] ring-1 ring-sky-400/40"
                    : "bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-800",
                )}
              >
                <div className="absolute inset-x-0 top-0 h-56 overflow-hidden">
                  <img src={image} alt={plan.name} className="h-full w-full object-cover opacity-65" />
                  <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-black/45 to-[#090d18]" />
                </div>

                <div className="relative z-10 pt-36">
                  <CardHeader className="text-left">
                    <div className="mb-3 flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-3xl font-medium">{plan.name}</h3>
                        <p className="mt-2 text-sm text-white/68">{typeLabel(plan.type)}</p>
                      </div>
                      {popular ? (
                        <span className="rounded-full border border-sky-400/40 bg-sky-500/15 px-3 py-1 text-xs font-medium text-sky-200">
                          Tavsiya etiladi
                        </span>
                      ) : null}
                    </div>

                    <div className="flex items-baseline">
                      <span className="text-lg text-white/65">so'm</span>
                      <NumberFlow
                        value={plan.base_price}
                        className="ml-2 text-4xl font-semibold tracking-tight"
                        format={{ useGrouping: true }}
                      />
                      <span className="ml-2 text-sm text-white/65">/{packagePeriod(plan.type)}</span>
                    </div>

                    <p className="mt-4 text-sm leading-7 text-white/72">{plan.description}</p>
                  </CardHeader>

                  <CardContent className="pt-0">
                    <Link
                      to="/bron"
                      state={{ packageId: plan.id }}
                      className={cn(
                        "mb-6 inline-flex w-full items-center justify-center rounded-2xl px-5 py-4 text-base font-semibold transition",
                        popular
                          ? "border border-sky-400/60 bg-gradient-to-t from-sky-500 to-blue-500 text-white shadow-[0_18px_40px_rgba(37,99,235,0.45)] hover:translate-y-[-1px]"
                          : "border border-white/12 bg-white/8 text-white hover:bg-white/12",
                      )}
                    >
                      Bron qilish
                      <ChevronRight className="ml-2 h-4 w-4" />
                    </Link>

                    <div className="space-y-4 border-t border-white/10 pt-5">
                      <h4 className="text-base font-medium text-white/90">{packageSubtitle(plan.type)}</h4>

                      <ul className="space-y-3">
                        {packageHighlights(plan).map((feature) => (
                          <li key={feature} className="flex items-center gap-3">
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/10">
                              <Check className="h-3.5 w-3.5 text-sky-200" />
                            </span>
                            <span className="text-sm text-white/72">{feature}</span>
                          </li>
                        ))}
                      </ul>

                      <div className="grid gap-3 pt-2 sm:grid-cols-2">
                        <div className="rounded-2xl border border-white/8 bg-white/5 p-3">
                          <div className="flex items-center gap-2 text-white/55">
                            <Users className="h-4 w-4" />
                            <span className="text-xs uppercase tracking-[0.24em]">Sig'im</span>
                          </div>
                          <p className="mt-2 text-lg font-medium text-white">{plan.max_guests} kishi</p>
                        </div>
                        <div className="rounded-2xl border border-white/8 bg-white/5 p-3">
                          <div className="flex items-center gap-2 text-white/55">
                            {plan.type === "stay" ? (
                              <BedDouble className="h-4 w-4" />
                            ) : (
                              <CalendarDays className="h-4 w-4" />
                            )}
                            <span className="text-xs uppercase tracking-[0.24em]">Qo'shimcha mehmon</span>
                          </div>
                          <p className="mt-2 text-lg font-medium text-white">
                            {formatCurrency(plan.price_per_guest)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </div>
              </Card>
            </TimelineContent>
          );
        })}
      </div>

      {filteredPackages.length === 0 ? (
        <div className="relative z-10 mx-auto mt-4 max-w-3xl rounded-[28px] border border-dashed border-white/15 bg-white/5 p-8 text-center text-sm text-white/70">
          Bu toifa uchun hozircha paket qo'shilmagan.
        </div>
      ) : null}
    </div>
  );
}
