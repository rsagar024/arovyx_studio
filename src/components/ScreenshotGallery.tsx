"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, m } from "motion/react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useSmoothScroll } from "@/components/motion/SmoothScroll";
import { EASE_OUT, SPRING_SOFT } from "@/lib/motion";

/**
 * Horizontal phone-screenshot gallery. Screenshots that fail to load are
 * dropped, and the whole section disappears if none are left. Clicking one
 * zooms it into a lightbox (shared-layout animation); arrows / Escape work.
 */
export default function ScreenshotGallery({
  title,
  screenshots,
}: {
  title: string;
  /** Display URLs (already passed through mediaSrc). */
  screenshots: string[];
}) {
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const [open, setOpen] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const lenis = useSmoothScroll();
  const visible = screenshots.filter((src) => !failed.has(src));
  const isOpen = open !== null;
  const count = visible.length;

  useEffect(() => setMounted(true), []);

  // keyboard navigation while the lightbox is up
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
      if (event.key === "ArrowRight") setOpen((i) => (i === null ? i : (i + 1) % count));
      if (event.key === "ArrowLeft") setOpen((i) => (i === null ? i : (i - 1 + count) % count));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, count]);

  // page scroll is frozen while open; focus returns to the thumbnail on close
  useEffect(() => {
    if (!isOpen) return;
    lenis?.stop();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      lenis?.start();
      document.body.style.overflow = overflow;
      opener.current?.focus();
    };
  }, [isOpen, lenis]);

  if (visible.length === 0) return null;
  const current = open === null ? null : visible[open];

  return (
    <section aria-labelledby="screenshots-heading" className="mt-12">
      <h2 id="screenshots-heading" className="micro-label">
        Screenshots
      </h2>
      <ul className="mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4" data-lenis-prevent-horizontal="">
        {visible.map((src, index) => (
          <li key={src} className="shrink-0 snap-start">
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey) return; // new tab as usual
                event.preventDefault();
                opener.current = event.currentTarget;
                setOpen(index);
              }}
              className="group block overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-accent-500/50 hover:shadow-glow"
            >
              <m.img
                layoutId={`shot-${src}`}
                src={src}
                alt={`Screenshot ${index + 1} of ${title}`}
                loading="lazy"
                onError={() => setFailed((prev) => new Set(prev).add(src))}
                className="h-[22rem] w-auto max-w-none object-cover transition-transform duration-500 group-hover:scale-[1.03] sm:h-[26rem]"
              />
            </a>
          </li>
        ))}
      </ul>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {current && open !== null && (
              <m.div
                key="lightbox"
                role="dialog"
                aria-modal="true"
                aria-label={`Screenshot ${open + 1} of ${visible.length}: ${title}`}
                className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-10"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: EASE_OUT }}
              >
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setOpen(null)}
                  className="absolute inset-0 cursor-zoom-out bg-ink-950/85 backdrop-blur-md"
                />
                <m.img
                  key={current}
                  layoutId={`shot-${current}`}
                  src={current}
                  alt={`Screenshot ${open + 1} of ${title}`}
                  transition={SPRING_SOFT}
                  className="relative max-h-full max-w-full rounded-2xl border border-white/10 object-contain shadow-2xl"
                />
                {visible.length > 1 && (
                  <>
                    <LightboxButton
                      label="Previous screenshot"
                      className="left-3 top-1/2 -translate-y-1/2 sm:left-6"
                      onClick={() => setOpen((open - 1 + visible.length) % visible.length)}
                    >
                      <ChevronLeft className="h-5 w-5" aria-hidden />
                    </LightboxButton>
                    <LightboxButton
                      label="Next screenshot"
                      className="right-3 top-1/2 -translate-y-1/2 sm:right-6"
                      onClick={() => setOpen((open + 1) % visible.length)}
                    >
                      <ChevronRight className="h-5 w-5" aria-hidden />
                    </LightboxButton>
                  </>
                )}
                <LightboxButton label="Close" autoFocus className="right-3 top-3 sm:right-6 sm:top-6" onClick={() => setOpen(null)}>
                  <X className="h-5 w-5" aria-hidden />
                </LightboxButton>
              </m.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </section>
  );
}

function LightboxButton({
  label,
  className,
  onClick,
  autoFocus,
  children,
}: {
  label: string;
  className: string;
  onClick: () => void;
  autoFocus?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      autoFocus={autoFocus}
      onClick={onClick}
      className={`absolute flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white backdrop-blur transition-all hover:scale-110 hover:bg-white/20 ${className}`}
    >
      {children}
    </button>
  );
}
