import { motion, type Variants } from "framer-motion";
import type { PropsWithChildren } from "react";

type TimelineContentProps = PropsWithChildren<{
  as?: "div" | "p";
  animationNum?: number;
  className?: string;
  customVariants?: Variants;
}>;

const defaultVariants: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.55,
      delay: index * 0.08,
      ease: [0.16, 1, 0.3, 1],
    },
  }),
};

export function TimelineContent({
  as = "div",
  animationNum = 0,
  customVariants,
  className,
  children,
}: TimelineContentProps) {
  const variants = customVariants ?? defaultVariants;

  if (as === "p") {
    return (
      <motion.p
        className={className}
        custom={animationNum}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        variants={variants}
      >
        {children}
      </motion.p>
    );
  }

  return (
    <motion.div
      className={className}
      custom={animationNum}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      variants={variants}
    >
      {children}
    </motion.div>
  );
}
