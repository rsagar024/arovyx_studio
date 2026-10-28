"use client";

import Link from "next/link";
import { m } from "motion/react";
import { ArrowRight, Boxes, Gamepad2, Package, Puzzle } from "lucide-react";
import AnimatedTabs from "@/components/motion/AnimatedTabs";
import CountUp from "@/components/CountUp";
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
 * category's pitch, count, a fan of its screenshots and its newest projects.
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
    const shots = items.flatMap((p) => (p.screenshots[0] ? [p.screenshots[0]] : p.imageUrl ? [p.imageUrl] : [])).slice(0, 3);

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
            {shots.length > 0 && <ShotFan shots={shots} />}
          </div>

          <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2">
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

/** Stacked screenshots that fan out when hovered. */
function ShotFan({ shots }: { shots: string[] }) {
  const spread = [
    { rest: { rotate: -6, x: -10, y: 0 }, open: { rotate: -14, x: -70, y: -6 } },
    { rest: { rotate: 3, x: 6, y: 0 }, open: { rotate: 0, x: 0, y: -14 } },
    { rest: { rotate: 9, x: 18, y: 0 }, open: { rotate: 14, x: 70, y: -6 } },
  ];
  return (
    <m.div
      aria-hidden
      initial="rest"
      animate="rest"
      whileHover="open"
      className="relative mx-auto mt-10 hidden h-44 w-60 sm:block lg:mx-0 lg:ml-16"
    >
      {shots.map((src, index) => (
        <m.div
          key={src}
          variants={spread[index]}
          transition={{ type: "spring", stiffness: 220, damping: 18 }}
          className="absolute inset-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--panel-2)] shadow-card"
          style={{ zIndex: index }}
        >
          <SafeImg src={mediaSrc(src)} alt="" className="h-full w-full object-cover" />
        </m.div>
      ))}
    </m.div>
  );
}
