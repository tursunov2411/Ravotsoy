import * as React from "react";
import { motion, type Variants } from "framer-motion";
import { cn } from "../../lib/utils";

interface AnimatedTextProps extends React.HTMLAttributes<HTMLDivElement> {
  text: string;
  duration?: number;
  delay?: number;
  replay?: boolean;
  className?: string;
  textClassName?: string;
  underlineClassName?: string;
  as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span";
  underlineGradient?: string;
  underlineHeight?: string;
  underlineOffset?: string;
}

const AnimatedText = React.forwardRef<HTMLDivElement, AnimatedTextProps>(
  (
    {
      text,
      duration = 0.035,
      delay = 0.05,
      replay = true,
      className,
      textClassName,
      underlineClassName,
      underlineGradient = "from-slate-900 via-emerald-600 to-sky-500",
      underlineHeight = "h-1",
      underlineOffset = "-bottom-3",
      ...props
    },
    ref,
  ) => {
    const letters = Array.from(text);

    const container: Variants = {
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: {
          staggerChildren: duration,
          delayChildren: delay,
        },
      },
    };

    const child: Variants = {
      visible: {
        opacity: 1,
        y: 0,
        transition: {
          type: "spring",
          damping: 14,
          stiffness: 220,
        },
      },
      hidden: {
        opacity: 0,
        y: 18,
        transition: {
          type: "spring",
          damping: 14,
          stiffness: 220,
        },
      },
    };

    const lineVariants: Variants = {
      hidden: {
        width: "0%",
        left: "50%",
      },
      visible: {
        width: "100%",
        left: "0%",
        transition: {
          delay: Math.max(letters.length * duration, 0.2),
          duration: 0.75,
          ease: "easeOut",
        },
      },
    };

    return (
      <div ref={ref} className={cn("flex flex-col items-center justify-center gap-2", className)} {...props}>
        <div className="relative">
          <motion.div
            style={{ display: "flex", overflow: "hidden" }}
            variants={container}
            initial="hidden"
            animate={replay ? "visible" : "hidden"}
            className={cn("text-center text-4xl font-semibold tracking-tight", textClassName)}
          >
            {letters.map((letter, index) => (
              <motion.span key={`${letter}-${index}`} variants={child}>
                {letter === " " ? "\u00A0" : letter}
              </motion.span>
            ))}
          </motion.div>

          <motion.div
            variants={lineVariants}
            initial="hidden"
            animate="visible"
            className={cn(
              "absolute rounded-full bg-gradient-to-r",
              underlineHeight,
              underlineOffset,
              underlineGradient,
              underlineClassName,
            )}
          />
        </div>
      </div>
    );
  },
);

AnimatedText.displayName = "AnimatedText";

export { AnimatedText };
