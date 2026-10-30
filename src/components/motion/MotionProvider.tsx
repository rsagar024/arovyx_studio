"use client";

import { LazyMotion, MotionConfig, domMax } from "motion/react";
import type { ReactNode } from "react";

/**
 * Motion setup for the public site: lazy-loads the feature bundle (components
 * use the slim `m.*` elements) and honours the OS reduced-motion setting —
 * transforms are dropped, only opacity fades remain.
 */
export default function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domMax}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
