"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, SearchX } from "lucide-react";
import ProjectCard from "@/components/ProjectCard";
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
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
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
                  "rounded-lg border px-3.5 py-1.5 text-sm transition-colors",
                  !active && "border-transparent text-[var(--muted)] hover:text-[var(--fg)]",
                  active && !meta && "border-transparent bg-accent-500 font-medium text-ink-950",
                  active && meta && cn("font-medium", meta.chip)
                )}
              >
                {tab.label}
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
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] py-2.5 pl-9 pr-3 text-sm text-[var(--fg)] placeholder:text-[var(--muted)] focus:border-accent-500/60 focus:outline-none"
          />
        </div>
      </div>

      {/* results */}
      <p className="mt-6 text-xs uppercase tracking-micro text-[var(--muted)]" aria-live="polite">
        {visible.length} {visible.length === 1 ? "project" : "projects"}
        {category !== "ALL" && ` in ${CATEGORY_META[category as Category].plural}`}
        {query && ` matching “${query}”`}
      </p>

      {visible.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--border)] py-16 text-center">
          <SearchX className="h-8 w-8 text-[var(--muted)]" aria-hidden />
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
        </div>
      ) : (
        // Keyed on category so switching tabs replays the stagger; while
        // searching, cards that newly match animate in and the rest stay put.
        <div key={category} className="mt-8 grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((project, index) => (
            <div
              key={project.id}
              className="motion-safe:animate-fade-up"
              style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
            >
              <ProjectCard project={project} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
