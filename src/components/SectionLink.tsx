"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { useSmoothScroll } from "@/components/motion/SmoothScroll";

/** Height of the sticky navbar — sections stop just below it. */
export const NAV_OFFSET = 80;

/**
 * Link to a home-page section ("/#about", "/#contact") or to the top ("/").
 * On the home page it smooth-scrolls in place (instant with reduced motion)
 * and updates the URL hash; from any other page it navigates normally and
 * the browser jumps to the section.
 */
export default function SectionLink({
  href,
  className,
  children,
  onNavigate,
  ...rest
}: {
  href: string;
  className?: string;
  children: ReactNode;
  /** Called after an in-page scroll (e.g. to close the mobile menu). */
  onNavigate?: () => void;
  "aria-current"?: "page" | "location";
}) {
  const pathname = usePathname();
  const lenis = useSmoothScroll();

  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (pathname !== "/" || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    const id = href.split("#")[1] ?? "";
    const target = id ? document.getElementById(id) : null;
    if (id && !target) return; // section missing — let the browser handle it

    event.preventDefault();
    const top = target ? target.getBoundingClientRect().top + window.scrollY - NAV_OFFSET : 0;
    if (lenis) {
      lenis.scrollTo(top, { duration: 1.2 });
    } else {
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
    }
    history.replaceState(null, "", id ? `/#${id}` : "/");
    onNavigate?.();
  }

  return (
    <Link href={href} onClick={onClick} className={className} {...rest}>
      {children}
    </Link>
  );
}
