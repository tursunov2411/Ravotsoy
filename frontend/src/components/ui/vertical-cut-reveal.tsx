import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion, type Transition } from "framer-motion";
import { cn } from "../../lib/utils";

type TextProps = {
  children: React.ReactNode;
  reverse?: boolean;
  transition?: Transition & { delay?: number };
  splitBy?: "words" | "characters" | "lines" | string;
  staggerDuration?: number;
  staggerFrom?: "first" | "last" | "center" | "random" | number;
  containerClassName?: string;
  wordLevelClassName?: string;
  elementLevelClassName?: string;
  onClick?: () => void;
  onStart?: () => void;
  onComplete?: () => void;
  autoStart?: boolean;
};

export interface VerticalCutRevealRef {
  startAnimation: () => void;
  reset: () => void;
}

type WordObject = {
  characters: string[];
  needsSpace: boolean;
};

export const VerticalCutReveal = forwardRef<VerticalCutRevealRef, TextProps>(
  (
    {
      children,
      reverse = false,
      transition = {
        type: "spring",
        stiffness: 190,
        damping: 22,
      },
      splitBy = "words",
      staggerDuration = 0.2,
      staggerFrom = "first",
      containerClassName,
      wordLevelClassName,
      elementLevelClassName,
      onClick,
      onStart,
      onComplete,
      autoStart = true,
      ...props
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLSpanElement>(null);
    const text = typeof children === "string" ? children : children?.toString() ?? "";
    const [isAnimating, setIsAnimating] = useState(false);

    const splitIntoCharacters = (value: string): string[] => {
      const SegmenterCtor = (
        Intl as typeof Intl & {
          Segmenter?: new (
            locales?: string | string[],
            options?: { granularity: "grapheme" },
          ) => {
            segment(input: string): Iterable<{ segment: string }>;
          };
        }
      ).Segmenter;

      if (typeof Intl !== "undefined" && SegmenterCtor) {
        const segmenter = new SegmenterCtor("uz", { granularity: "grapheme" });
        return Array.from(segmenter.segment(value), ({ segment }) => segment);
      }

      return Array.from(value);
    };

    const elements = useMemo(() => {
      const words = text.split(" ");

      if (splitBy === "characters") {
        return words.map((word, index) => ({
          characters: splitIntoCharacters(word),
          needsSpace: index !== words.length - 1,
        }));
      }

      return splitBy === "words"
        ? text.split(" ")
        : splitBy === "lines"
          ? text.split("\n")
          : text.split(splitBy);
    }, [splitBy, text]);

    const getStaggerDelay = useCallback(
      (index: number) => {
        const total =
          splitBy === "characters"
            ? (elements as WordObject[]).reduce(
                (accumulator, word) =>
                  accumulator + word.characters.length + (word.needsSpace ? 1 : 0),
                0,
              )
            : (elements as string[]).length;

        if (staggerFrom === "first") {
          return index * staggerDuration;
        }

        if (staggerFrom === "last") {
          return (total - 1 - index) * staggerDuration;
        }

        if (staggerFrom === "center") {
          const center = Math.floor(total / 2);
          return Math.abs(center - index) * staggerDuration;
        }

        if (staggerFrom === "random") {
          const randomIndex = Math.floor(Math.random() * total);
          return Math.abs(randomIndex - index) * staggerDuration;
        }

        return Math.abs(staggerFrom - index) * staggerDuration;
      },
      [elements, splitBy, staggerDuration, staggerFrom],
    );

    const startAnimation = useCallback(() => {
      setIsAnimating(true);
      onStart?.();
    }, [onStart]);

    useImperativeHandle(ref, () => ({
      startAnimation,
      reset: () => setIsAnimating(false),
    }));

    useEffect(() => {
      if (autoStart) {
        startAnimation();
      }
    }, [autoStart, startAnimation]);

    const variants = {
      hidden: { y: reverse ? "-100%" : "100%" },
      visible: (index: number) => ({
        y: 0,
        transition: {
          ...transition,
          delay: (transition.delay ?? 0) + getStaggerDelay(index),
        },
      }),
    };

    const normalizedWords =
      splitBy === "characters"
        ? (elements as WordObject[])
        : (elements as string[]).map((element, index, array) => ({
            characters: [element],
            needsSpace: index !== array.length - 1,
          }));

    return (
      <span
        className={cn(
          "flex flex-wrap whitespace-pre-wrap",
          splitBy === "lines" && "flex-col",
          containerClassName,
        )}
        onClick={onClick}
        ref={containerRef}
        {...props}
      >
        <span className="sr-only">{text}</span>

        {normalizedWords.map((word, wordIndex, array) => {
          const previousCharsCount = array
            .slice(0, wordIndex)
            .reduce((sum, currentWord) => sum + currentWord.characters.length, 0);

          return (
            <span
              key={`${wordIndex}-${word.characters.join("")}`}
              aria-hidden="true"
              className={cn("inline-flex overflow-hidden", wordLevelClassName)}
            >
              {word.characters.map((char, charIndex) => (
                <span
                  className={cn("relative whitespace-pre-wrap", elementLevelClassName)}
                  key={`${char}-${charIndex}`}
                >
                  <motion.span
                    custom={previousCharsCount + charIndex}
                    initial="hidden"
                    animate={isAnimating ? "visible" : "hidden"}
                    variants={variants}
                    onAnimationComplete={
                      wordIndex === normalizedWords.length - 1 &&
                      charIndex === word.characters.length - 1
                        ? onComplete
                        : undefined
                    }
                    className="inline-block"
                  >
                    {char}
                  </motion.span>
                </span>
              ))}
              {word.needsSpace ? <span> </span> : null}
            </span>
          );
        })}
      </span>
    );
  },
);

VerticalCutReveal.displayName = "VerticalCutReveal";
