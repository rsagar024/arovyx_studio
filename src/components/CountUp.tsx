"use client";

import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

const DURATION_S = 1.4;
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
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const [armed, setArmed] = useState(false);

  // drop to 0 after hydration so the count-up has somewhere to start from
  useEffect(() => {
    if (value > 0 && !reduceMotion) {
      setDisplay(0);
      setArmed(true);
    } else {
      setDisplay(value);
    }
  }, [value, reduceMotion]);

  useEffect(() => {
    if (!armed || !inView) return;
    const controls = animate(0, value, {
      duration: DURATION_S,
      delay: delay / 1000,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => setDisplay(Math.round(latest)),
    });
    return () => controls.stop();
  }, [armed, inView, value, delay]);

  return (
    <span ref={ref} className={className}>
      <span aria-hidden className="tabular-nums">
        {format(display, pad)}
      </span>
      <span className="sr-only">{value}</span>
    </span>
  );
}
