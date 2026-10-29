"use client";

import { m, useScroll, useTransform } from "motion/react";
import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Media that slowly zooms and drifts as it scrolls out of view (banner
 * images). Clips its own overflow so the zoom never spills out.
 */
export default function ScrollZoom({
  children,
  zoom = 0.08,
  drift = 40,
  className,
}: {
  children: ReactNode;
  /** Extra scale reached once fully scrolled past. */
  zoom?: number;
  /** Max downward drift in px. */
  drift?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const scale = useTransform(scrollYProgress, [0, 1], [1, 1 + zoom]);
  const y = useTransform(scrollYProgress, [0, 1], [0, drift]);

  return (
    <div ref={ref} className={cn("overflow-hidden", className)}>
      <m.div style={{ scale, y }}>{children}</m.div>
    </div>
  );
}
