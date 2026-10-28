"use client";

import { m, useScroll, useSpring } from "motion/react";

/** Thin accent bar along the top edge that fills as the page scrolls. */
export default function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 200, damping: 30, restDelta: 0.001 });
  return (
    <m.div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[2px] origin-left bg-gradient-to-r from-accent-600 via-accent-400 to-accent-200"
      style={{ scaleX }}
    />
  );
}
