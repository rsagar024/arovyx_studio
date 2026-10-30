"use client";

import { m } from "motion/react";
import type { ReactNode } from "react";
import { VIEWPORT, revealVariants, staggerContainer, type RevealVariant } from "@/lib/motion";

/** Reveals its <StaggerItem> children one after another when scrolled into view. */
export function Stagger({
  children,
  className,
  step = 0.08,
  delay = 0,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  /** Seconds between children. */
  step?: number;
  /** Seconds before the first child. */
  delay?: number;
  as?: "div" | "ul" | "ol" | "nav";
}) {
  const Tag = m[as];
  return (
    <Tag
      className={className}
      variants={staggerContainer(step, delay)}
      initial="hidden"
      whileInView="show"
      viewport={VIEWPORT}
    >
      {children}
    </Tag>
  );
}

export function StaggerItem({
  children,
  className,
  variant = "up",
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  variant?: RevealVariant;
  as?: "div" | "li";
}) {
  const Tag = m[as];
  return (
    <Tag data-reveal="" className={className} variants={revealVariants(variant)}>
      {children}
    </Tag>
  );
}
