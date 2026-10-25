"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import ThemeToggle from "@/components/ThemeToggle";
import { CATEGORY_META, cn } from "@/lib/utils";
import type { Category } from "@/lib/validators";

const CATEGORY_ORDER: Category[] = ["APP", "GAME", "PACKAGE", "PLUGIN"];

const links = [
  { href: "/", label: "Home" },
  { href: "/projects", label: "Projects" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuButton = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b transition-all duration-300",
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
            className="h-[34px] w-[34px] transition-transform duration-300 group-hover:scale-110 group-hover:drop-shadow-[0_0_10px_rgba(34,211,238,0.55)]"
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
                    "flex items-center gap-1 rounded-lg px-3 py-2 text-sm transition-colors",
                    isActive(link.href)
                      ? "text-accent-600 dark:text-accent-400"
                      : "text-[var(--muted)] hover:text-[var(--fg)]"
                  )}
                >
                  {link.label}
                  <ChevronDown className="h-3.5 w-3.5 transition-transform group-hover:rotate-180" aria-hidden />
                </Link>

                {/* dropdown */}
                <div className="invisible absolute right-0 top-full w-48 translate-y-1 rounded-xl border border-[var(--border)] bg-[rgb(var(--bg-rgb)/0.95)] p-1.5 opacity-0 shadow-card backdrop-blur-xl transition-all duration-200 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
                  <Link
                    href="/projects"
                    className="block rounded-lg px-3 py-2 text-sm text-[var(--muted)] hover:bg-[var(--panel)] hover:text-[var(--fg)]"
                  >
                    All projects
                  </Link>
                  {CATEGORY_ORDER.map((category) => (
                    <Link
                      key={category}
                      href={`/projects?category=${category}`}
                      className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-[var(--muted)] hover:bg-[var(--panel)] hover:text-[var(--fg)]"
                    >
                      {CATEGORY_META[category].plural}
                      <span className={cn("h-1.5 w-1.5 rounded-full bg-current opacity-60", CATEGORY_META[category].accentText)} />
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm transition-colors",
                  isActive(link.href)
                    ? "text-accent-600 dark:text-accent-400"
                    : "text-[var(--muted)] hover:text-[var(--fg)]"
                )}
              >
                {link.label}
              </Link>
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
            {open ? <X className="h-4 w-4" aria-hidden /> : <Menu className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      </nav>

      {/* mobile menu */}
      {open && (
        <div
          id="mobile-menu"
          className="border-t border-[var(--border)] bg-[rgb(var(--bg-rgb)/0.95)] backdrop-blur-xl md:hidden"
        >
          <nav className="container-page flex flex-col gap-1 py-4" aria-label="Mobile">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-lg px-3 py-2.5 text-sm",
                  isActive(link.href)
                    ? "bg-[var(--panel)] text-accent-600 dark:text-accent-400"
                    : "text-[var(--muted)]"
                )}
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-2 border-t border-[var(--border)] pt-3">
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
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
