"use client";

import { m, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import type { PointerEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";

const SPRING = { stiffness: 220, damping: 20, mass: 0.5 };

/**
 * 3D tilt that follows the mouse, with a soft glare where the pointer is.
 * Mouse only — touch gets a press-in on tap instead, reduced motion a flat card.
 */
export default function TiltCard({
  children,
  className,
  max = 8,
}: {
  children: ReactNode;
  /** Applied to the tilting element — give it the card's border radius for the glare. */
  className?: string;
  /** Max tilt in degrees. */
  max?: number;
}) {
  const reduceMotion = useReducedMotion();
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rotateX = useSpring(useTransform(py, [0, 1], [max, -max]), SPRING);
  const rotateY = useSpring(useTransform(px, [0, 1], [-max, max]), SPRING);
  const glareX = useTransform(px, (v) => `${v * 100}%`);
  const glareY = useTransform(py, (v) => `${v * 100}%`);
  const glare = useMotionTemplate`radial-gradient(420px circle at ${glareX} ${glareY}, rgba(34,211,238,0.14), transparent 45%)`;
  const glareOpacity = useSpring(0, SPRING);

  function onMove(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse" || reduceMotion) return;
    const rect = event.currentTarget.getBoundingClientRect();
    px.set((event.clientX - rect.left) / rect.width);
    py.set((event.clientY - rect.top) / rect.height);
    glareOpacity.set(1);
  }

  function onLeave() {
    px.set(0.5);
    py.set(0.5);
    glareOpacity.set(0);
  }

  return (
    // perspective is per-element (transformPerspective), not preserve-3d on a
    // parent: a 3D rendering context switches off backdrop-filter (glass cards)
    <div className="h-full" onPointerMove={onMove} onPointerLeave={onLeave}>
      <m.div
        className={cn("relative h-full", className)}
        style={{ rotateX, rotateY, transformPerspective: 1000 }}
        whileTap={reduceMotion ? undefined : { scale: 0.98 }}
      >
        {children}
        <m.span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-20 rounded-[inherit]"
          style={{ background: glare, opacity: glareOpacity }}
        />
      </m.div>
    </div>
  );
}
