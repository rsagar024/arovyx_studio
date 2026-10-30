"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, m, useMotionValueEvent, useScroll } from "motion/react";
import { ChevronDown, Menu, X } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import SectionLink from "@/components/SectionLink";
import ThemeToggle from "@/components/ThemeToggle";
import { EASE_OUT, SPRING_SNAPPY } from "@/lib/motion";
import { CATEGORY_META, cn } from "@/lib/utils";
import type { Category } from "@/lib/validators";

const CATEGORY_ORDER: Category[] = ["APP", "GAME", "PACKAGE", "PLUGIN"];

// About and Contact are sections of the home page — the links scroll to them.
const links = [
  { href: "/", label: "Home" },
  { href: "/projects", label: "Projects" },
  { href: "/#about", label: "About" },
  { href: "/#contact", label: "Contact" },
];

const HOME_SECTIONS = ["about", "contact"];

const MENU_ITEM = {
  hidden: { opacity: 0, x: -16 },
  show: { opacity: 1, x: 0, transition: { duration: 0.35, ease: EASE_OUT } },
};

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  /** Tucked away while scrolling down; slides back on any upward scroll. */
  const [hidden, setHidden] = useState(false);
  const menuButton = useRef<HTMLButtonElement | null>(null);
  /** Home-page section currently in view ("" = top of the page). */
  const [section, setSection] = useState("");
  const { scrollY } = useScroll();

  useEffect(() => {
    setScrolled(window.scrollY > 8);
  }, []);

  useMotionValueEvent(scrollY, "change", (y) => {
    const previous = scrollY.getPrevious() ?? 0;
    setScrolled(y > 8);
    if (Math.abs(y - previous) < 4) return; // ignore jitter
    setHidden(y > previous && y > 160);
  });

  // Scroll-spy: highlight About / Contact while that section is on screen.
  useEffect(() => {
    if (pathname !== "/") {
      setSection("");
      return;
    }
    const targets = HOME_SECTIONS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => Boolean(el)
    );
    if (!targets.length || typeof IntersectionObserver === "undefined") return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        // the lowest visible section wins (contact sits below about)
        setSection(HOME_SECTIONS.filter((id) => visible.has(id)).pop() ?? "");
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [pathname]);

  // close the mobile menu on navigation
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Escape closes the mobile menu and returns focus to its toggle
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      menuButton.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const isActive = (href: string) => {
    if (href.startsWith("/#")) return pathname === "/" && section === href.slice(2);
    if (href === "/") return pathname === "/" && section === "";
    return pathname.startsWith(href);
  };

  return (
    <m.header
      animate={{ y: hidden && !open ? "-100%" : "0%" }}
      transition={{ duration: 0.35, ease: EASE_OUT }}
      // keyboard users tabbing into a hidden bar bring it back
      onFocusCapture={() => setHidden(false)}
      className={cn(
        "sticky top-0 z-50 w-full border-b transition-[background-color,border-color] duration-300",
        scrolled
          ? "border-[var(--border)] bg-[rgb(var(--bg-rgb)/0.80)] backdrop-blur-xl"
          : "border-transparent bg-transparent"
      )}
    >
      <nav className="container-page flex h-16 items-center justify-between" aria-label="Main">
        <Link
          href="/"
          className="group flex items-center gap-2 font-display text-lg font-semibold tracking-tight"
          aria-label="Arovyx Studio home"
        >
          <BrandMark
            size={34}
            className="h-[34px] w-[34px] transition-transform duration-500 group-hover:rotate-[8deg] group-hover:scale-110 group-hover:drop-shadow-[0_0_10px_rgba(34,211,238,0.55)]"
          />
          Arovyx <span className="text-accent-600 dark:text-accent-400">Studio</span>
        </Link>

        {/* desktop nav */}
        <div className="hidden items-center gap-1 md:flex">
          {links.map((link) =>
            link.href === "/projects" ? (
              <div key={link.href} className="group relative">
                <Link
                  href={link.href}
                  className={cn(
                    "relative isolate flex items-center gap-1 rounded-lg px-3 py-2 text-sm transition-colors",
                    isActive(link.href)
                      ? "text-accent-600 dark:text-accent-400"
                      : "text-[var(--muted)] hover:text-[var(--fg)]"
                  )}
                >
                  {isActive(link.href) && <ActivePill />}
                  {link.label}
                  <ChevronDown className="h-3.5 w-3.5 transition-transform duration-300 group-hover:rotate-180" aria-hidden />
                </Link>

                {/* dropdown */}
                <div className="invisible absolute right-0 top-full w-52 origin-top-right translate-y-1 scale-95 rounded-xl border border-[var(--border)] bg-[rgb(var(--bg-rgb)/0.95)] p-1.5 opacity-0 shadow-card backdrop-blur-xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:scale-100 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100">
                  <Link
                    href="/projects"
                    className="block rounded-lg px-3 py-2 text-sm text-[var(--muted)] transition-colors hover:bg-[var(--panel)] hover:text-[var(--fg)]"
                  >
                    All projects
                  </Link>
                  {CATEGORY_ORDER.map((category) => (
                    <Link
                      key={category}
                      href={`/projects?category=${category}`}
                      className="group/item flex items-center justify-between rounded-lg px-3 py-2 text-sm text-[var(--muted)] transition-colors hover:bg-[var(--panel)] hover:text-[var(--fg)]"
                    >
                      <span className="transition-transform duration-300 group-hover/item:translate-x-1">
                        {CATEGORY_META[category].plural}
                      </span>
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full bg-current opacity-60 transition-transform duration-300 group-hover/item:scale-150",
                          CATEGORY_META[category].accentText
                        )}
                      />
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              <SectionLink
                key={link.href}
                href={link.href}
                aria-current={isActive(link.href) ? "page" : undefined}
                className={cn(
                  "relative isolate rounded-lg px-3 py-2 text-sm transition-colors",
                  isActive(link.href)
                    ? "text-accent-600 dark:text-accent-400"
                    : "text-[var(--muted)] hover:text-[var(--fg)]"
                )}
              >
                {isActive(link.href) && <ActivePill />}
                {link.label}
              </SectionLink>
            )
          )}
          <div className="ml-3">
            <ThemeToggle />
          </div>
        </div>

        {/* mobile controls */}
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <button
            ref={menuButton}
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-menu"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--panel)] text-[var(--muted)]"
          >
            <AnimatePresence mode="wait" initial={false}>
              <m.span
                key={open ? "close" : "open"}
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                {open ? <X className="h-4 w-4" aria-hidden /> : <Menu className="h-4 w-4" aria-hidden />}
              </m.span>
            </AnimatePresence>
          </button>
        </div>
      </nav>

      {/* mobile menu */}
      <AnimatePresence>
        {open && (
          <m.div
            id="mobile-menu"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: EASE_OUT }}
            className="overflow-hidden border-t border-[var(--border)] bg-[rgb(var(--bg-rgb)/0.95)] backdrop-blur-xl md:hidden"
          >
            <m.nav
              className="container-page flex flex-col gap-1 py-4"
              aria-label="Mobile"
              initial="hidden"
              animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.08 } } }}
            >
              {links.map((link) => (
                <m.div key={link.href} variants={MENU_ITEM}>
                  <SectionLink
                    href={link.href}
                    onNavigate={() => setOpen(false)}
                    aria-current={isActive(link.href) ? "page" : undefined}
                    className={cn(
                      "block rounded-lg px-3 py-2.5 text-sm",
                      isActive(link.href)
                        ? "bg-[var(--panel)] text-accent-600 dark:text-accent-400"
                        : "text-[var(--muted)]"
                    )}
                  >
                    {link.label}
                  </SectionLink>
                </m.div>
              ))}
              <m.div variants={MENU_ITEM} className="mt-2 border-t border-[var(--border)] pt-3">
                <p className="micro-label px-3 pb-2">Categories</p>
                {CATEGORY_ORDER.map((category) => (
                  <Link
                    key={category}
                    href={`/projects?category=${category}`}
                    className="block rounded-lg px-3 py-2 text-sm text-[var(--muted)]"
                  >
                    {CATEGORY_META[category].plural}
                  </Link>
                ))}
              </m.div>
            </m.nav>
          </m.div>
        )}
      </AnimatePresence>
    </m.header>
  );
}

/** Highlight that slides between desktop links as the active one changes. */
function ActivePill() {
  return (
    <m.span
      layoutId="nav-active-pill"
      aria-hidden
      className="absolute inset-0 -z-10 rounded-lg bg-accent-400/10 ring-1 ring-accent-500/25"
      transition={SPRING_SNAPPY}
    />
  );
}
