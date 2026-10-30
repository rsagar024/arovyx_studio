import Marquee from "@/components/motion/Marquee";
import SplitText from "@/components/motion/SplitText";
import Reveal from "@/components/Reveal";
import { techUsage } from "@/lib/tech";
import { cn } from "@/lib/utils";
import type { ProjectDTO } from "@/lib/validators";

/** Most-used techs shown in the ticker. */
const MAX_TECH = 14;

/**
 * "Built with" band: the most-used tech in big uppercase type, alternating
 * solid / outlined, sliding past in one row.
 */
export default function TechMarquee({ projects }: { projects: ProjectDTO[] }) {
  const tech = techUsage(projects);
  if (tech.length < 4) return null;

  const big = tech.slice(0, MAX_TECH);

  return (
    <section aria-labelledby="tech-heading" className="py-16">
      <div className="container-page text-center">
        <Reveal>
          <p className="micro-label">Built with</p>
        </Reveal>
        <SplitText
          id="tech-heading"
          text="The tools I trust"
          className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-4xl"
        />
        <Reveal delay={150}>
          <p className="mt-3 font-mono text-xs uppercase tracking-micro text-[var(--muted)]">
            {tech.length} technologies <span className="text-accent-500">·</span> {projects.length}{" "}
            {projects.length === 1 ? "project" : "projects"}
          </p>
        </Reveal>
      </div>

      {/* decorative — the sr-only sentence below lists the same tech once */}
      <Reveal delay={200} variant="fade">
        <div
          aria-hidden
          className="relative mt-10 overflow-hidden border-y border-[var(--border)] bg-[var(--panel)] py-8"
        >
          {/* faint grid + soft accent glow behind the rows */}
          <span className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(var(--fg)_1px,transparent_1px),linear-gradient(90deg,var(--fg)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
          <span className="pointer-events-none absolute left-1/2 top-1/2 h-40 w-2/3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-500/10 blur-3xl" />

          <div className="relative">
            <Marquee seconds={28 + big.length * 2}>
              {big.map(({ key, label }, index) => (
                <span key={key} className="flex shrink-0 items-center gap-4">
                  <span
                    className={cn(
                      "whitespace-nowrap font-display text-3xl font-semibold uppercase leading-none tracking-tight transition-colors duration-300 sm:text-5xl",
                      index % 2 === 0 ? "text-[var(--fg)] hover:text-accent-500" : "text-outline hover:text-accent-500"
                    )}
                  >
                    {label}
                  </span>
                  <span className="text-lg text-accent-500 sm:text-2xl">✦</span>
                </span>
              ))}
            </Marquee>

          </div>
        </div>
      </Reveal>

      <p className="sr-only">Technologies used: {tech.map((t) => t.label).join(", ")}.</p>
    </section>
  );
}
