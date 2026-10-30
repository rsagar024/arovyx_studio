import type { Transition, Variants } from "motion/react";

/** House easing — same curve as the CSS `fade-up` keyframe. */
export const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

export const SPRING_SOFT: Transition = { type: "spring", stiffness: 160, damping: 22, mass: 0.6 };
export const SPRING_SNAPPY: Transition = { type: "spring", stiffness: 380, damping: 32 };

export type RevealVariant = "up" | "fade" | "scale" | "blur" | "left" | "right";

/** Hidden state per reveal style; every one settles on the same `show` state. */
const HIDDEN: Record<RevealVariant, Record<string, number | string>> = {
  up: { opacity: 0, y: 24 },
  fade: { opacity: 0 },
  scale: { opacity: 0, scale: 0.94 },
  blur: { opacity: 0, filter: "blur(10px)", y: 12 },
  left: { opacity: 0, x: -32 },
  right: { opacity: 0, x: 32 },
};

/** `delay` (seconds) lives in the variant: a variant's transition overrides the element's. */
export function revealVariants(variant: RevealVariant = "up", delay = 0, duration = 0.7): Variants {
  return {
    hidden: HIDDEN[variant],
    show: {
      opacity: 1,
      x: 0,
      y: 0,
      scale: 1,
      // only touch filter when it was used — a leftover filter creates a
      // containing block and stacking context on every revealed element
      ...(variant === "blur" ? { filter: "blur(0px)" } : {}),
      transition: { duration, delay, ease: EASE_OUT },
    },
  };
}

/** Parent variants that cascade `show` to children `step` seconds apart. */
export function staggerContainer(step = 0.08, delayChildren = 0): Variants {
  return {
    hidden: {},
    show: { transition: { staggerChildren: step, delayChildren } },
  };
}

/** Shared in-view trigger: fire a little before the element is fully on screen. */
// `amount: "some"` (not a fraction): on phones a stacked column can be many
// screens tall, and a 15% threshold would never be reached.
export const VIEWPORT = { once: true, amount: "some", margin: "0px 0px -10% 0px" } as const;
