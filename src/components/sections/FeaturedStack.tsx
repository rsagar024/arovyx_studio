"use client";

import Link from "next/link";
import { m, useScroll, useTransform, type MotionValue } from "motion/react";
import { useRef, useState, type RefObject } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import CategoryBadge from "@/components/CategoryBadge";
import DeviceMockup from "@/components/DeviceMockup";
import TechChip from "@/components/TechChip";
import { EASE_OUT, SPRING_SNAPPY, VIEWPORT } from "@/lib/motion";
import { CATEGORY_META, cn } from "@/lib/utils";
import type { ProjectDTO } from "@/lib/validators";

/** Sticky offset of the first card; each later card sits a little lower. */
const TOP = 96;
const STEP = 22;

/**
 * Featured projects. Desktop: wide cards that pin and pile up as you scroll,
 * earlier ones shrinking back into the stack. Smaller screens: a swipeable
 * carousel of mini feature cards (see Carousel).
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

/**
 * Phones & tablets: a centred snap carousel of mini feature cards. The card
 * in the middle is full size and fans out its screenshots; its neighbours
 * shrink, tilt and fade as they slide away. Cards rise in as they come into
 * view, and the dots under the track follow the active card.
 */
function Carousel({ projects }: { projects: ProjectDTO[] }) {
  const track = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);

  // the card whose centre is nearest the track's centre is the active one
  function onScroll() {
    const node = track.current;
    if (!node) return;
    const centre = node.scrollLeft + node.clientWidth / 2;
    let nearest = 0;
    let best = Infinity;
    Array.from(node.children).forEach((child, index) => {
      const el = child as HTMLElement;
      const distance = Math.abs(el.offsetLeft + el.offsetWidth / 2 - centre);
      if (distance < best) {
        best = distance;
        nearest = index;
      }
    });
    setActive(nearest);
  }

  function goTo(index: number) {
    const node = track.current;
    const child = node?.children[index] as HTMLElement | undefined;
    if (!node || !child) return;
    node.scrollTo({ left: child.offsetLeft - (node.clientWidth - child.offsetWidth) / 2, behavior: "smooth" });
  }

  return (
    <div className="mt-8 lg:hidden">
      <div
        ref={track}
        onScroll={onScroll}
        data-lenis-prevent-horizontal=""
        className="-mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-[9%] pb-4 pt-4 [scrollbar-width:none] sm:-mx-8 sm:px-[27%] [&::-webkit-scrollbar]:hidden"
      >
        {projects.map((project, index) => (
          <CarouselCard
            key={project.id}
            project={project}
            index={index}
            total={projects.length}
            active={index === active}
            track={track}
          />
        ))}
      </div>

      {projects.length > 1 && (
        <div className="mt-3 flex items-center justify-between gap-4">
          {/* position dots: the accent pill slides to the active card */}
          <div className="flex items-center gap-1.5">
            {projects.map((project, index) => (
              <button
                key={project.id}
                type="button"
                onClick={() => goTo(index)}
                aria-label={`Show ${project.title}`}
                aria-current={index === active || undefined}
                className="relative flex h-6 items-center justify-center px-0.5"
              >
                <span
                  className={cn(
                    "block h-1.5 rounded-full bg-[var(--border)] transition-all duration-300",
                    index === active ? "w-6" : "w-1.5"
                  )}
                />
                {index === active && (
                  <m.span
                    layoutId="featured-dot"
                    transition={SPRING_SNAPPY}
                    className="absolute inset-x-0.5 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-accent-400"
                  />
                )}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => goTo(Math.max(0, active - 1))}
              disabled={active === 0}
              aria-label="Previous project"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--panel)] text-[var(--muted)] transition-all hover:border-accent-500/50 hover:text-[var(--fg)] active:scale-90 disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => goTo(Math.min(projects.length - 1, active + 1))}
              disabled={active === projects.length - 1}
              aria-label="Next project"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--panel)] text-[var(--muted)] transition-all hover:border-accent-500/50 hover:text-[var(--fg)] active:scale-90 disabled:opacity-40"
            >
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CarouselCard({
  project,
  index,
  total,
  active,
  track,
}: {
  project: ProjectDTO;
  index: number;
  total: number;
  active: boolean;
  track: RefObject<HTMLDivElement | null>;
}) {
  const meta = CATEGORY_META[project.category];
  const card = useRef<HTMLDivElement | null>(null);
  // 0 → entering at the track's right edge, 0.5 → centred, 1 → leaving at the left
  const { scrollXProgress } = useScroll({
    container: track,
    target: card,
    axis: "x",
    offset: ["start end", "end start"],
  });
  const scale = useTransform(scrollXProgress, [0, 0.5, 1], [0.88, 1, 0.88]);
  const opacity = useTransform(scrollXProgress, [0, 0.5, 1], [0.55, 1, 0.55]);
  const rotate = useTransform(scrollXProgress, [0, 0.5, 1], [3, 0, -3]);

  return (
    <m.div
      ref={card}
      data-reveal=""
      className="w-full shrink-0 snap-center sm:w-[46%]"
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT}
      transition={{ duration: 0.7, ease: EASE_OUT, delay: Math.min(index, 2) * 0.1 }}
    >
      <m.article
        style={{ scale, opacity, rotate }}
        // the centred card plays its hover effects (mockup fan) on touch screens
        data-active={active}
        className={cn(
          "panel-solid group relative flex h-full flex-col overflow-hidden rounded-3xl border border-[var(--border)] shadow-card transition-[border-color,box-shadow] duration-500",
          meta.hoverBorder,
          active && "shadow-glow"
        )}
      >
        <span
          aria-hidden
          className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br via-transparent to-transparent opacity-40", meta.line)}
        />

        {/* media stage: category glow + faint grid, device mockup on top */}
        <div className="relative h-56 overflow-hidden border-b border-[var(--border)]">
          <span
            aria-hidden
            className={cn("absolute inset-0 bg-gradient-to-tl via-transparent to-transparent opacity-50", meta.line)}
          />
          <span
            aria-hidden
            className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(var(--fg)_1px,transparent_1px),linear-gradient(90deg,var(--fg)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:radial-gradient(circle_at_center,black,transparent_75%)]"
          />
          <DeviceMockup
            title={project.title}
            screenshots={project.screenshots}
            bannerUrl={project.bannerUrl}
            iconUrl={project.imageUrl}
            size="sm"
            className="relative h-full"
          />
        </div>

        <div className="relative flex flex-1 flex-col p-5">
          <div className="flex items-center gap-3">
            <CategoryBadge category={project.category} />
            <span className="font-mono text-xs text-[var(--muted)]">
              {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
            </span>
          </div>
          <h3 className="mt-4 font-display text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]">
            <Link href={`/projects/${project.slug}`} className="after:absolute after:inset-0">
              {project.title}
            </Link>
          </h3>
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-[var(--muted)]">{project.shortDescription}</p>
          {project.techStack.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {project.techStack.slice(0, 3).map((tech) => (
                <TechChip key={tech} label={tech} />
              ))}
            </div>
          )}
          <span className={cn("mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-medium", meta.accentText)}>
            View project
            <ArrowUpRight
              className={cn("h-4 w-4 transition-transform duration-500", active && "-translate-y-0.5 translate-x-0.5")}
              aria-hidden
            />
          </span>
        </div>
      </m.article>
    </m.div>
  );
}
