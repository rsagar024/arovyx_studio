"use client";

import Link from "next/link";
import { m, useScroll, useTransform, type MotionValue } from "motion/react";
import { useRef } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import CategoryBadge from "@/components/CategoryBadge";
import ProjectCard from "@/components/ProjectCard";
import DeviceMockup from "@/components/DeviceMockup";
import TechChip from "@/components/TechChip";
import { CATEGORY_META, cn } from "@/lib/utils";
import type { ProjectDTO } from "@/lib/validators";

/** Sticky offset of the first card; each later card sits a little lower. */
const TOP = 96;
const STEP = 22;

/**
 * Featured projects. Desktop: wide cards that pin and pile up as you scroll,
 * earlier ones shrinking back into the stack. Smaller screens: a swipeable
 * snap carousel with arrow buttons.
 */
export default function FeaturedStack({ projects }: { projects: ProjectDTO[] }) {
  const stack = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({ target: stack, offset: ["start start", "end end"] });

  return (
    <>
      <div ref={stack} className="relative mt-12 hidden lg:block">
        {projects.map((project, index) => (
          <StackCard
            key={project.id}
            project={project}
            index={index}
            total={projects.length}
            progress={scrollYProgress}
          />
        ))}
      </div>
      <Carousel projects={projects} />
    </>
  );
}

function StackCard({
  project,
  index,
  total,
  progress,
}: {
  project: ProjectDTO;
  index: number;
  total: number;
  progress: MotionValue<number>;
}) {
  const meta = CATEGORY_META[project.category];
  const last = index === total - 1;
  // shrink once the cards behind this one start arriving
  const scale = useTransform(progress, [index / total, 1], [1, 1 - (total - 1 - index) * 0.04]);
  const dim = useTransform(progress, [index / total, 1], [0, last ? 0 : 0.35]);

  return (
    <div className={cn("sticky", !last && "mb-[18vh]")} style={{ top: TOP + index * STEP }}>
      <m.article
        style={{ scale }}
        className={cn(
          "panel-solid group relative grid h-[26rem] origin-top grid-cols-[1fr_1.1fr] overflow-hidden rounded-3xl border border-[var(--border)] shadow-card",
          meta.hoverBorder
        )}
      >
        {/* category-tinted wash */}
        <span
          aria-hidden
          className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br via-transparent to-transparent opacity-40", meta.line)}
        />

        <div className="relative flex flex-col p-10">
          <div className="flex items-center gap-3">
            <CategoryBadge category={project.category} />
            <span className="font-mono text-xs text-[var(--muted)]">
              {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
            </span>
          </div>
          <h3 className="mt-6 font-display text-4xl font-semibold tracking-tight">
            <Link href={`/projects/${project.slug}`} className="after:absolute after:inset-0">
              {project.title}
            </Link>
          </h3>
          <p className="mt-4 line-clamp-3 max-w-md leading-relaxed text-[var(--muted)]">{project.shortDescription}</p>
          {project.techStack.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-1.5">
              {project.techStack.slice(0, 5).map((tech) => (
                <TechChip key={tech} label={tech} />
              ))}
            </div>
          )}
          <span className={cn("mt-auto inline-flex items-center gap-1.5 text-sm font-medium", meta.accentText)}>
            View project
            <ArrowUpRight
              className="h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              aria-hidden
            />
          </span>
        </div>

        {/* media stage: category glow + faint grid, device mockup on top */}
        <div className="relative overflow-hidden border-l border-[var(--border)]">
          <span
            aria-hidden
            className={cn("absolute inset-0 bg-gradient-to-tl via-transparent to-transparent opacity-50", meta.line)}
          />
          <span
            aria-hidden
            className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(var(--fg)_1px,transparent_1px),linear-gradient(90deg,var(--fg)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(circle_at_center,black,transparent_75%)]"
          />
          <DeviceMockup
            title={project.title}
            screenshots={project.screenshots}
            bannerUrl={project.bannerUrl}
            iconUrl={project.imageUrl}
            className="relative h-full"
          />
        </div>

        {/* darkens as the next card covers this one */}
        <m.span aria-hidden className="pointer-events-none absolute inset-0 bg-black" style={{ opacity: dim }} />
      </m.article>
    </div>
  );
}

function Carousel({ projects }: { projects: ProjectDTO[] }) {
  const track = useRef<HTMLDivElement | null>(null);

  function scroll(direction: 1 | -1) {
    const node = track.current;
    if (!node) return;
    node.scrollBy({ left: direction * node.clientWidth * 0.85, behavior: "smooth" });
  }

  return (
    <div className="mt-8 lg:hidden">
      <div
        ref={track}
        className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 pt-4 [scrollbar-width:none] sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden"
      >
        {projects.map((project) => (
          <div key={project.id} className="w-[85%] shrink-0 snap-start sm:w-[46%]">
            <ProjectCard project={project} />
          </div>
        ))}
      </div>
      {projects.length > 1 && (
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => scroll(-1)}
            aria-label="Previous projects"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--panel)] text-[var(--muted)] transition-all hover:border-accent-500/50 hover:text-[var(--fg)] active:scale-90"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => scroll(1)}
            aria-label="Next projects"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--panel)] text-[var(--muted)] transition-all hover:border-accent-500/50 hover:text-[var(--fg)] active:scale-90"
          >
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
