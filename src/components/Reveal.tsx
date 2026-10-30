"use client";

import { m } from "motion/react";
import type { ReactNode } from "react";
import { VIEWPORT, revealVariants, type RevealVariant } from "@/lib/motion";

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Stagger delay in ms */
  delay?: number;
  /** Reveal once and stop observing */
  once?: boolean;
  /** Entrance style (default: fade-up). */
  variant?: RevealVariant;
}

/**
 * Entrance animation on scroll (spec §9 motion). `data-reveal` lets the
 * <noscript> style in the root layout force it visible without JS.
 */
export default function Reveal({ children, className, delay = 0, once = true, variant = "up" }: RevealProps) {
  return (
    <m.div
      data-reveal=""
      className={className}
      variants={revealVariants(variant, delay / 1000)}
      initial="hidden"
      whileInView="show"
      viewport={{ ...VIEWPORT, once }}
    >
      {children}
    </m.div>
  );
}
