import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Grip, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../../lib/utils";

export interface BentoGalleryItem {
  id: string;
  type: "image" | "video";
  title: string;
  desc: string;
  url: string;
  span: string;
}

type MediaItemProps = {
  item: BentoGalleryItem;
  className?: string;
  onClick?: () => void;
  fit?: "cover" | "contain";
};

function MediaItem({ item, className = "", onClick, fit = "cover" }: MediaItemProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isInView, setIsInView] = useState(false);
  const [isBuffering, setIsBuffering] = useState(item.type === "video");

  useEffect(() => {
    if (item.type !== "video") {
      return;
    }

    const target = videoRef.current;

    if (!target) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setIsInView(entry.isIntersecting);
        }
      },
      {
        root: null,
        rootMargin: "64px",
        threshold: 0.15,
      },
    );

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [item.type]);

  useEffect(() => {
    if (item.type !== "video") {
      return;
    }

    const target = videoRef.current;

    if (!target) {
      return;
    }

    let mounted = true;

    const playVideo = async () => {
      if (!isInView || !mounted) {
        return;
      }

      try {
        if (target.readyState >= 3) {
          setIsBuffering(false);
          await target.play();
          return;
        }

        setIsBuffering(true);

        await new Promise<void>((resolve) => {
          const handleCanPlay = () => {
            target.removeEventListener("canplay", handleCanPlay);
            resolve();
          };

          target.addEventListener("canplay", handleCanPlay);
        });

        if (mounted) {
          setIsBuffering(false);
          await target.play();
        }
      } catch (error) {
        console.warn("Video playback failed:", error);
      }
    };

    if (isInView) {
      void playVideo();
    } else {
      target.pause();
    }

    return () => {
      mounted = false;
      target.pause();
    };
  }, [isInView, item.type]);

  if (item.type === "video") {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <video
          ref={videoRef}
          className={`h-full w-full cursor-pointer ${fit === "contain" ? "object-contain" : "object-cover"}`}
          onClick={onClick}
          playsInline
          muted
          loop
          preload="metadata"
          style={{
            opacity: isBuffering ? 0.88 : 1,
            transition: "opacity 0.25s ease",
          }}
        >
          <source src={item.url} type="video/mp4" />
        </video>
        {isBuffering ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/10">
            <div className="h-7 w-7 rounded-full border-2 border-white/35 border-t-white animate-spin" />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <img
      src={item.url}
      alt={item.title}
      className={`${className} cursor-pointer ${fit === "contain" ? "object-contain" : "object-cover"}`}
      onClick={onClick}
      loading="lazy"
      decoding="async"
    />
  );
}

type GalleryModalProps = {
  selectedItem: BentoGalleryItem;
  isOpen: boolean;
  onClose: () => void;
  setSelectedItem: (item: BentoGalleryItem | null) => void;
  mediaItems: BentoGalleryItem[];
  onPrevious: () => void;
  onNext: () => void;
};

function GalleryModal({
  selectedItem,
  isOpen,
  onClose,
  setSelectedItem,
  mediaItems,
  onPrevious,
  onNext,
}: GalleryModalProps) {
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    setZoom(1);
  }, [selectedItem.id]);

  if (!isOpen) {
    return null;
  }

  return (
    <>
      <motion.div
        className="fixed inset-0 z-40 bg-[rgba(12,20,33,0.38)] backdrop-blur-xl"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />

      <motion.div
        initial={{ scale: 0.98, opacity: 0, y: 18 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.98, opacity: 0, y: 18 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        className="fixed inset-0 z-50 flex items-center justify-center px-3 py-4 sm:px-6 sm:py-6"
      >
        <div className="relative flex h-full w-full max-w-7xl flex-col overflow-hidden rounded-[32px] border border-white/45 bg-white/75 shadow-[0_24px_80px_rgba(15,23,42,0.18)] backdrop-blur-2xl">
          <div className="flex-1 p-3 sm:p-5">
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedItem.id}
                className="relative flex h-full min-h-[420px] items-center justify-center overflow-hidden rounded-[28px] bg-slate-100"
                initial={{ opacity: 0, scale: 0.985 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.985 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              >
                <motion.div
                  drag={zoom === 1 ? "x" : false}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.08}
                  onDragEnd={(_, info) => {
                    if (zoom > 1) {
                      return;
                    }

                    if (info.offset.x <= -90) {
                      onNext();
                      return;
                    }

                    if (info.offset.x >= 90) {
                      onPrevious();
                    }
                  }}
                  animate={{ scale: zoom }}
                  transition={{ type: "spring", stiffness: 280, damping: 28 }}
                  className="flex h-full w-full items-center justify-center px-4 py-16 sm:px-8 sm:py-20"
                  style={{ touchAction: zoom > 1 ? "none" : "pan-y" }}
                >
                  <MediaItem
                    item={selectedItem}
                    fit="contain"
                    className="max-h-[68vh] max-w-full select-none sm:max-h-[72vh]"
                  />
                </motion.div>

                {selectedItem.type === "image" ? (
                  <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-white/82 px-2 py-2 text-slate-700 shadow-lg backdrop-blur">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setZoom((current) => Math.max(1, Number((current - 0.25).toFixed(2))));
                      }}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white"
                    >
                      <ZoomOut className="h-4 w-4" />
                    </button>
                    <span className="min-w-[56px] text-center text-xs font-medium">{Math.round(zoom * 100)}%</span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setZoom((current) => Math.min(2.5, Number((current + 0.25).toFixed(2))));
                      }}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white"
                    >
                      <ZoomIn className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setZoom(1);
                      }}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}

                <div className="pointer-events-none absolute inset-y-0 left-0 right-0 flex items-center justify-between px-3 sm:px-5">
                  <motion.button
                    type="button"
                    className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/82 text-slate-700 shadow-lg transition hover:bg-white"
                    onClick={(event) => {
                      event.stopPropagation();
                      onPrevious();
                    }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </motion.button>

                  <motion.button
                    type="button"
                    className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/82 text-slate-700 shadow-lg transition hover:bg-white"
                    onClick={(event) => {
                      event.stopPropagation();
                      onNext();
                    }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <ChevronRight className="h-5 w-5" />
                  </motion.button>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="border-t border-black/6 bg-white/72 px-4 py-4 backdrop-blur sm:px-5 sm:py-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0 lg:max-w-xl">
                <p className="text-xs uppercase tracking-[0.24em] text-ink/40">Galereya ko'rinishi</p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight text-ink sm:text-2xl">{selectedItem.title}</h3>
                <p className="mt-2 text-sm leading-7 text-ink/62">{selectedItem.desc}</p>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:max-w-[52%]">
                {mediaItems.map((item, index) => (
                  <motion.button
                    key={item.id}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedItem(item);
                    }}
                    className={cn(
                      "relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl border bg-slate-100 transition sm:h-16 sm:w-16",
                      selectedItem.id === item.id
                        ? "border-ink shadow-[0_14px_28px_rgba(15,23,42,0.14)]"
                        : "border-black/10 hover:border-black/20",
                    )}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.02 }}
                  >
                    <MediaItem item={item} className="h-full w-full" />
                  </motion.button>
                ))}
              </div>
            </div>
          </div>

          <motion.button
            className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/85 text-slate-700 shadow-lg transition hover:bg-white"
            onClick={onClose}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
          >
            <X className="h-4 w-4" />
          </motion.button>
        </div>
      </motion.div>
    </>
  );
}

type InteractiveBentoGalleryProps = {
  mediaItems: BentoGalleryItem[];
  title: string;
  description: string;
};

export default function InteractiveBentoGallery({
  mediaItems,
  title,
  description,
}: InteractiveBentoGalleryProps) {
  const [selectedItem, setSelectedItem] = useState<BentoGalleryItem | null>(null);
  const [items, setItems] = useState(mediaItems);
  const [isDragging, setIsDragging] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    setItems(mediaItems);
  }, [mediaItems]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(pointer: coarse)");
    const updateTouchMode = () => {
      setIsTouchDevice(mediaQuery.matches || window.innerWidth < 768);
    };

    updateTouchMode();
    mediaQuery.addEventListener("change", updateTouchMode);
    window.addEventListener("resize", updateTouchMode);

    return () => {
      mediaQuery.removeEventListener("change", updateTouchMode);
      window.removeEventListener("resize", updateTouchMode);
    };
  }, []);

  const galleryItems = useMemo(() => items.filter(Boolean), [items]);
  const selectedIndex = selectedItem
    ? galleryItems.findIndex((item) => item.id === selectedItem.id)
    : -1;

  const selectPrevious = () => {
    if (selectedIndex < 0) {
      return;
    }

    const nextIndex = selectedIndex === 0 ? galleryItems.length - 1 : selectedIndex - 1;
    setSelectedItem(galleryItems[nextIndex] ?? null);
  };

  const selectNext = () => {
    if (selectedIndex < 0) {
      return;
    }

    const nextIndex = selectedIndex === galleryItems.length - 1 ? 0 : selectedIndex + 1;
    setSelectedItem(galleryItems[nextIndex] ?? null);
  };

  useEffect(() => {
    if (!selectedItem) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedItem(null);
      }

      if (event.key === "ArrowLeft") {
        selectPrevious();
      }

      if (event.key === "ArrowRight") {
        selectNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedItem, selectedIndex, galleryItems]);

  if (galleryItems.length === 0) {
    return null;
  }

  return (
    <div className="rounded-[36px] border border-black/5 bg-white/72 px-4 py-6 shadow-soft backdrop-blur-xl sm:px-6 sm:py-8">
      <div className="mb-8 text-center">
        <motion.h3
          className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5 }}
        >
          {title}
        </motion.h3>
        <motion.p
          className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-ink/60 sm:text-base"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5, delay: 0.08 }}
        >
          {description}
        </motion.p>
      </div>

      <AnimatePresence mode="wait">
        {selectedItem ? (
          <GalleryModal
            selectedItem={selectedItem}
            isOpen
            onClose={() => setSelectedItem(null)}
            setSelectedItem={setSelectedItem}
            mediaItems={galleryItems}
            onPrevious={selectPrevious}
            onNext={selectNext}
          />
        ) : (
          <>
            <div className="mb-4 flex items-center justify-center gap-2 text-center text-xs text-ink/45 sm:text-sm">
              <Grip className="h-4 w-4" />
              {isTouchDevice
                ? "Mobil qurilmada galereya teginish orqali ochiladi."
                : "Kartalarni ushlab joyini almashtirishingiz mumkin."}
            </div>

            <motion.div
              className="grid auto-rows-[88px] grid-cols-1 gap-3 sm:grid-cols-3 md:grid-cols-4"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.15 }}
              variants={{
                hidden: { opacity: 0 },
                visible: {
                  opacity: 1,
                  transition: { staggerChildren: 0.08 },
                },
              }}
            >
            {galleryItems.map((item, index) => (
              <motion.div
                key={item.id}
                layoutId={`media-${item.id}`}
                className={`group relative overflow-hidden rounded-[24px] border border-white/35 bg-slate-100 shadow-[0_16px_32px_rgba(15,23,42,0.08)] ${item.span}`}
                onClick={() => {
                  if (!isDragging) {
                    setSelectedItem(item);
                  }
                }}
                variants={{
                  hidden: { y: 36, scale: 0.94, opacity: 0 },
                  visible: {
                    y: 0,
                    scale: 1,
                    opacity: 1,
                    transition: {
                      type: "spring",
                      stiffness: 300,
                      damping: 24,
                      delay: index * 0.04,
                    },
                  },
                }}
                whileHover={{ scale: 1.015, y: -2 }}
                drag={!isTouchDevice}
                dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                dragElastic={0.18}
                dragMomentum={false}
                onDragStart={() => setIsDragging(true)}
                onDragEnd={(_, info) => {
                  setIsDragging(false);

                  if (isTouchDevice) {
                    return;
                  }

                  const moveDistance = info.offset.x + info.offset.y;

                  if (Math.abs(moveDistance) <= 56) {
                    return;
                  }

                  const nextItems = [...galleryItems];
                  const draggedItem = nextItems[index];
                  const targetIndex =
                    moveDistance > 0
                      ? Math.min(index + 1, galleryItems.length - 1)
                      : Math.max(index - 1, 0);

                  nextItems.splice(index, 1);
                  nextItems.splice(targetIndex, 0, draggedItem);
                  setItems(nextItems);
                }}
              >
                <MediaItem item={item} className="absolute inset-0 h-full w-full" />
                <motion.div
                  className="absolute inset-0 flex flex-col justify-end p-4"
                  initial={{ opacity: 0 }}
                  whileHover={{ opacity: 1 }}
                  transition={{ duration: 0.18 }}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent" />
                  <h4 className="relative text-sm font-semibold text-white sm:text-base">{item.title}</h4>
                  <p className="relative mt-1 text-xs leading-5 text-white/75 sm:text-sm">{item.desc}</p>
                </motion.div>
              </motion.div>
            ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
