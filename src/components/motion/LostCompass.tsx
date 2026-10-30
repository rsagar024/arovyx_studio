"use client";

import { m } from "motion/react";
import { Compass } from "lucide-react";

/** 404 badge: springs in, then bobs while the needle searches for north. */
export default function LostCompass() {
  return (
    <m.span
      initial={{ scale: 0, rotate: -120 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 12 }}
      className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-accent-500/40 bg-accent-400/10 text-accent-600 shadow-glow dark:text-accent-400"
    >
      <m.span
        animate={{ y: [0, -6, 0], rotate: [0, 25, -35, 15, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
        className="flex"
      >
        <Compass className="h-8 w-8" aria-hidden />
      </m.span>
    </m.span>
  );
}
