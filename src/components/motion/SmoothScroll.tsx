"use client";

import "lenis/dist/lenis.css";
import Lenis from "lenis";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const LenisContext = createContext<Lenis | null>(null);

/** The page's Lenis instance, or null (reduced motion / not mounted yet). */
export function useSmoothScroll() {
  return useContext(LenisContext);
}

/**
 * Inertia smooth scrolling (Lenis) for mouse wheels; touch keeps native
 * scrolling. Never created when the OS asks for reduced motion.
 */
export default function SmoothScroll({ children }: { children: ReactNode }) {
  const [lenis, setLenis] = useState<Lenis | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const instance = new Lenis({ lerp: 0.1, smoothWheel: true, autoRaf: true });
    setLenis(instance);
    return () => {
      instance.destroy();
      setLenis(null);
    };
  }, []);

  // a new page starts at the top (Lenis keeps its own scroll target)
  useEffect(() => {
    if (!window.location.hash) lenis?.scrollTo(0, { immediate: true });
  }, [pathname, lenis]);

  return <LenisContext.Provider value={lenis}>{children}</LenisContext.Provider>;
}
