"use client";

import { m, useScroll, useTransform } from "motion/react";
import { useRef, type ReactNode } from "react";

/** Drifts its content vertically as it scrolls past (positive = slower than the page). */
export default function Parallax({
  children,
  offset = 60,
  className,
}: {
  children: ReactNode;
  /** Max drift in px each way. */
  offset?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [offset, -offset]);

  return (
    <m.div ref={ref} style={{ y }} className={className}>
      {children}
    </m.div>
  );
}
