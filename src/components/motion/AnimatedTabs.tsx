"use client";

import { AnimatePresence, m } from "motion/react";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { EASE_OUT, SPRING_SNAPPY } from "@/lib/motion";
import { cn } from "@/lib/utils";

export interface TabItem {
  id: string;
  label: ReactNode;
  content: ReactNode;
}

/**
 * Tab strip with a pill that slides to the active tab and a panel that
 * cross-fades. WAI-ARIA tabs pattern: arrows / Home / End move between tabs.
 */
export default function AnimatedTabs({
  tabs,
  label,
  className,
  listClassName,
}: {
  tabs: TabItem[];
  /** Accessible name for the tab list. */
  label: string;
  className?: string;
  listClassName?: string;
}) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const baseId = useId();
  const current = tabs.find((tab) => tab.id === active) ?? tabs[0];

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((tab) => tab.id === active);
    const next =
      event.key === "ArrowRight" ? (index + 1) % tabs.length
      : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length
      : event.key === "Home" ? 0
      : event.key === "End" ? tabs.length - 1
      : -1;
    if (next < 0) return;
    event.preventDefault();
    setActive(tabs[next]!.id);
    buttons.current[next]?.focus();
  }

  if (!current) return null;

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className={cn(
          // phones: a 2×2 grid so every tab stays on screen (a scrolling row hid the last ones)
          "grid max-w-full grid-cols-2 gap-1 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-1 sm:inline-flex sm:overflow-x-auto sm:rounded-full",
          listClassName
        )}
      >
        {tabs.map((tab, index) => {
          const selected = tab.id === current.id;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                buttons.current[index] = el;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(tab.id)}
              className={cn(
                "relative flex shrink-0 justify-center rounded-full px-4 py-2 text-sm font-medium transition-colors",
                selected ? "text-ink-950" : "text-[var(--muted)] hover:text-[var(--fg)]"
              )}
            >
              {selected && (
                <m.span
                  layoutId={`${baseId}-pill`}
                  className="absolute inset-0 rounded-full bg-accent-400"
                  transition={SPRING_SNAPPY}
                />
              )}
              <span className="relative z-10 inline-flex items-center gap-2">{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`${baseId}-panel`}
        aria-labelledby={`${baseId}-tab-${current.id}`}
        className="relative mt-8"
      >
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={current.id}
            initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -12, filter: "blur(6px)" }}
            transition={{ duration: 0.35, ease: EASE_OUT }}
          >
            {current.content}
          </m.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
