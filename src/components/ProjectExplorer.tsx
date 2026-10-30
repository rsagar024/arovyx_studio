"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, m } from "motion/react";
import { Search, SearchX } from "lucide-react";
import ProjectCard from "@/components/ProjectCard";
import { EASE_OUT, SPRING_SNAPPY, VIEWPORT, revealVariants } from "@/lib/motion";
import { CATEGORY_META, cn } from "@/lib/utils";
import type { Category, ProjectDTO } from "@/lib/validators";

const TABS: Array<{ value: Category | "ALL"; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "APP", label: CATEGORY_META.APP.plural },
  { value: "GAME", label: CATEGORY_META.GAME.plural },
  { value: "PACKAGE", label: CATEGORY_META.PACKAGE.plural },
  { value: "PLUGIN", label: CATEGORY_META.PLUGIN.plural },
];

function matches(project: ProjectDTO, query: string): boolean {
  if (!query) return true;
  const needle = query.toLowerCase();
  return (
    project.title.toLowerCase().includes(needle) ||
    project.shortDescription.toLowerCase().includes(needle) ||
    project.tags.some((tag) => tag.toLowerCase().includes(needle)) ||
    project.techStack.some((tech) => tech.toLowerCase().includes(needle))
  );
}

export default function ProjectExplorer({
  projects,
  initialCategory,
  initialQuery,
}: {
  projects: ProjectDTO[];
  initialCategory: string;
  initialQuery: string;
}) {
  const router = useRouter();
  const [category, setCategory] = useState<string>(initialCategory);
  const [query, setQuery] = useState<string>(initialQuery);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // keep the URL in sync so filtered views are shareable (spec §5.2)
  const syncUrl = (nextCategory: string, nextQuery: string) => {
    const params = new URLSearchParams();
    if (nextCategory && nextCategory !== "ALL") params.set("category", nextCategory);
    if (nextQuery) params.set("q", nextQuery);
    const search = params.toString();
    router.replace(search ? `/projects?${search}` : "/projects", { scroll: false });
  };

  useEffect(() => {
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, []);

  const onCategory = (value: string) => {
    setCategory(value);
    syncUrl(value, query);
  };

  const onQuery = (value: string) => {
    setQuery(value);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => syncUrl(category, value), 250);
  };

  const visible = useMemo(
    () =>
      projects.filter(
        (project) => (category === "ALL" || project.category === category) && matches(project, query)
      ),
    [projects, category, query]
  );

  return (
    <div>
      {/* controls */}
      <m.div
        data-reveal=""
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.3 }}
        className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
      >
        <div
          role="tablist"
          aria-label="Filter by category"
          className="flex flex-wrap gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-1.5"
        >
          {TABS.map((tab) => {
            const active = category === tab.value;
            const meta = tab.value === "ALL" ? null : CATEGORY_META[tab.value];
            return (
              <button
                key={tab.value}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => onCategory(tab.value)}
                className={cn(
                  "relative rounded-lg px-3.5 py-1.5 text-sm transition-colors",
                  !active && "text-[var(--muted)] hover:text-[var(--fg)]",
                  active && !meta && "font-medium text-ink-950",
                  active && meta && cn("font-medium", meta.accentText)
                )}
              >
                {/* highlight slides from the old tab to the new one */}
                {active && (
                  <m.span
                    layoutId="explorer-tab"
                    aria-hidden
                    transition={SPRING_SNAPPY}
                    className={cn("absolute inset-0 rounded-lg border", meta ? meta.chip : "border-transparent bg-accent-500")}
                  />
                )}
                <span className="relative">{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full md:w-72">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search title, tag or tech…"
            aria-label="Search projects"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] py-2.5 pl-9 pr-3 text-sm text-[var(--fg)] transition-shadow duration-300 placeholder:text-[var(--muted)] focus:border-accent-500/60 focus:shadow-glow focus:outline-none"
          />
        </div>
      </m.div>

      {/* results */}
      <p className="mt-6 text-xs uppercase tracking-micro text-[var(--muted)]" aria-live="polite">
        {/* the number flips whenever the filter changes it */}
        <span className="inline-flex overflow-hidden align-bottom">
          <AnimatePresence mode="popLayout" initial={false}>
            <m.span
              key={visible.length}
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: "0%", opacity: 1 }}
              exit={{ y: "-100%", opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE_OUT }}
              className="inline-block font-semibold text-[var(--fg)]"
            >
              {visible.length}
            </m.span>
          </AnimatePresence>
        </span>{" "}
        {visible.length === 1 ? "project" : "projects"}
        {category !== "ALL" && ` in ${CATEGORY_META[category as Category].plural}`}
        {query && ` matching “${query}”`}
      </p>

      {visible.length === 0 ? (
        <m.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: EASE_OUT }}
          className="mt-10 flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--border)] py-16 text-center"
        >
          <m.span
            className="flex"
            animate={{ rotate: [0, -14, 10, -6, 0] }}
            transition={{ duration: 1.2, ease: "easeInOut", delay: 0.2 }}
          >
            <SearchX className="h-8 w-8 text-[var(--muted)]" aria-hidden />
          </m.span>
          <p className="font-display text-lg font-semibold">Nothing matches that</p>
          <p className="max-w-sm text-sm text-[var(--muted)]">
            Try a different keyword or switch categories.
          </p>
          <button
            type="button"
            onClick={() => {
              setCategory("ALL");
              setQuery("");
              syncUrl("ALL", "");
            }}
            className="mt-2 text-sm text-accent-600 underline underline-offset-4 dark:text-accent-400"
          >
            Reset filters
          </button>
        </m.div>
      ) : (
        // Cards rise in row by row as they scroll into view (staggered by
        // column). On filtering, cards that drop out shrink away, the rest
        // glide to their new grid slots, and newly matching ones rise in.
        <m.div layout className="mt-8 grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {visible.map((project, index) => (
              <m.div
                key={project.id}
                data-reveal=""
                layout
                variants={revealVariants("up", (index % 3) * 0.09)}
                initial="hidden"
                whileInView="show"
                viewport={VIEWPORT}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                transition={{ layout: SPRING_SNAPPY }}
              >
                <ProjectCard project={project} />
              </m.div>
            ))}
          </AnimatePresence>
        </m.div>
      )}
    </div>
  );
}
