"use client";

import Link from "next/link";
import { m } from "motion/react";
import { ArrowRight, Boxes, Gamepad2, Package, Puzzle } from "lucide-react";
import AnimatedTabs from "@/components/motion/AnimatedTabs";
import CountUp from "@/components/CountUp";
import DeviceMockup from "@/components/DeviceMockup";
import Reveal from "@/components/Reveal";
import ProjectCard from "@/components/ProjectCard";
import SafeImg from "@/components/SafeImg";
import { EASE_OUT } from "@/lib/motion";
import { CATEGORY_META, cn, mediaSrc } from "@/lib/utils";
import type { Category, ProjectDTO } from "@/lib/validators";

const CATEGORY_ICONS: Record<Category, typeof Boxes> = {
  APP: Boxes,
  GAME: Gamepad2,
  PACKAGE: Package,
  PLUGIN: Puzzle,
};

const BLURBS: Record<Category, string> = {
  APP: "Polished apps for web and mobile — built to ship, not just to demo.",
  GAME: "Small worlds with tight loops, juicy feedback and a reason to replay.",
  PACKAGE: "Libraries other developers drop in and forget about — because they just work.",
  PLUGIN: "Extensions that bend existing tools to fit the way people actually work.",
};

const ORDER: Category[] = ["APP", "GAME", "PACKAGE", "PLUGIN"];

/**
 * "Browse by type" — monday-style tabbed showcase. Each tab shows the
 * category's pitch, count, a preview of its screenshots (or icons) and its newest projects.
 */
export default function CategoryShowcase({
  projects,
  counts,
}: {
  projects: ProjectDTO[];
  counts: Record<Category, number>;
}) {
  const tabs = ORDER.filter((category) => counts[category] > 0).map((category) => {
    const meta = CATEGORY_META[category];
    const Icon = CATEGORY_ICONS[category];
    const items = projects.filter((p) => p.category === category);

    return {
      id: category,
      label: (
        <>
          <Icon className="h-4 w-4" aria-hidden />
          {meta.plural}
        </>
      ),
      content: (
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-12">
          <div className="flex flex-col">
            <div className="flex items-end gap-4">
              <span className={cn("font-display text-7xl font-semibold leading-none tracking-tightest", meta.accentText)}>
                <CountUp value={counts[category]} />
              </span>
              <span className="pb-2 text-sm uppercase tracking-micro text-[var(--muted)]">{meta.plural}</span>
            </div>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-[var(--muted)]">{BLURBS[category]}</p>
            <Link
              href={`/projects?category=${category}`}
              className={cn("group mt-6 inline-flex w-fit items-center gap-1.5 text-sm font-medium", meta.accentText)}
            >
              Browse all {meta.plural.toLowerCase()}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
            </Link>
            <Preview items={items} glow={meta.line} />
          </div>

          <div className="grid content-start gap-x-5 gap-y-8 sm:grid-cols-2">
            {items.slice(0, 4).map((project, index) => (
              <m.div
                data-reveal=""
                key={project.id}
                initial={{ opacity: 0, y: 24, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.08 + index * 0.07 }}
              >
                <ProjectCard project={project} />
              </m.div>
            ))}
          </div>
        </div>
      ),
    };
  });

  if (tabs.length === 0) return null;
  return (
    <Reveal delay={150}>
      <AnimatedTabs tabs={tabs} label="Project categories" className="mt-8" />
    </Reveal>
  );
}

/** Category preview: phone mockups of its screenshots, or its app icons. */
function Preview({ items, glow }: { items: ProjectDTO[]; glow: string }) {
  const shots = items.flatMap((p) => p.screenshots.slice(0, 1)).slice(0, 3);
  const icons = items.filter((p) => p.imageUrl).slice(0, 5);
  if (shots.length === 0 && icons.length === 0) return null;

  return (
    <div className="group relative mt-10 flex h-64 items-center justify-center overflow-hidden rounded-2xl border border-[var(--border)]">
      <span aria-hidden className={cn("absolute inset-0 bg-gradient-to-t via-transparent to-transparent opacity-40", glow)} />
      <span
        aria-hidden
        className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(var(--fg)_1px,transparent_1px),linear-gradient(90deg,var(--fg)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:radial-gradient(circle_at_center,black,transparent_75%)]"
      />
      {shots.length > 0 ? (
        <DeviceMockup title={items[0]!.title} screenshots={shots} size="sm" className="relative h-full w-full" />
      ) : (
        // overlapping app icons that spread apart on hover
        <ul className="relative flex -space-x-4 transition-all duration-500 group-hover:space-x-2">
          {icons.map((p, index) => (
            <li
              key={p.id}
              className="h-20 w-20 overflow-hidden rounded-[1.25rem] bg-white p-2.5 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.8)] ring-2 ring-[var(--bg)]"
              style={{ transform: `rotate(${(index - (icons.length - 1) / 2) * 6}deg)`, zIndex: icons.length - index }}
            >
              <SafeImg src={mediaSrc(p.imageUrl) ?? undefined} alt={`${p.title} icon`} className="h-full w-full object-contain" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
