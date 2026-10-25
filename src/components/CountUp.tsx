"use client";

import { useEffect, useRef, useState } from "react";

const DURATION_MS = 1200;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const format = (n: number, pad: number) => String(n).padStart(pad, "0");

/**
 * Number that counts up from 0 when it scrolls into view (once).
 * The server-rendered HTML already holds the final value (correct for SEO,
 * no-JS and reduced motion); screen readers get the final value only.
 */
export default function CountUp({
  value,
  pad = 2,
  delay = 0,
  className,
}: {
  value: number;
  /** Zero-pad to this many digits (05). */
  pad?: number;
  /** Stagger start in ms. */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const node = ref.current;
    if (!node || value <= 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (typeof IntersectionObserver === "undefined") return;

    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setDisplay(0);

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        timer = setTimeout(() => {
          const start = performance.now();
          const tick = (now: number) => {
            const t = Math.min(1, (now - start) / DURATION_MS);
            setDisplay(Math.round(easeOutCubic(t) * value));
            if (t < 1) frame = requestAnimationFrame(tick);
          };
          frame = requestAnimationFrame(tick);
        }, delay);
      },
      { threshold: 0.4 }
    );
    observer.observe(node);

    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
      cancelAnimationFrame(frame);
      setDisplay(value);
    };
  }, [value, delay]);

  return (
    <span ref={ref} className={className}>
      <span aria-hidden className="tabular-nums">
        {format(display, pad)}
      </span>
      <span className="sr-only">{value}</span>
    </span>
  );
}
