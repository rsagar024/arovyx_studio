"use client";

import { m } from "motion/react";
import { EASE_OUT, staggerContainer } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Oversized outlined wordmark whose letters rise one after another when it
 * scrolls into view. Decorative only — hidden from assistive tech.
 */
export default function Wordmark({ text, className }: { text: string; className?: string }) {
  return (
    <m.p
      aria-hidden
      className={cn("flex justify-center", className)}
      variants={staggerContainer(0.07)}
      initial="hidden"
      whileInView="show"
      // no shrunken bottom margin (unlike VIEWPORT): on phones the wordmark is
      // short and sits at the very bottom of the page, so it would never
      // enter a viewport cut 10% short and would stay invisible
      viewport={{ once: true, amount: 0.3 }}
    >
      {[...text].map((letter, index) => (
        <m.span
          key={index}
          data-reveal=""
          className="footer-wordmark inline-block"
          variants={{
            hidden: { opacity: 0, y: "45%" },
            show: { opacity: 1, y: "0%", transition: { duration: 0.9, ease: EASE_OUT } },
          }}
        >
          {letter}
        </m.span>
      ))}
    </m.p>
  );
}
