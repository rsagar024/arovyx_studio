import Link from "next/link";
import { ArrowRight, Code2, Cpu, FileText, Rocket } from "lucide-react";
import Reveal from "@/components/Reveal";
import SplitText from "@/components/motion/SplitText";
import SectionLink from "@/components/SectionLink";
import { CATEGORY_META, formatDate } from "@/lib/utils";
import type { ProjectDTO } from "@/lib/validators";
import type { getSiteConfig } from "@/lib/projects";

type SiteConfig = Awaited<ReturnType<typeof getSiteConfig>>;

/** Home-page "About" section (#about): bio, shipped timeline, tech arsenal. */
export default function AboutSection({
  config,
  projects,
}: {
  config: SiteConfig;
  /** Published projects, newest first. */
  projects: ProjectDTO[];
}) {
  // Tech arsenal: every tech across published projects, with usage counts
  const counts = new Map<string, number>();
  for (const project of projects) {
    for (const tech of project.techStack) {
      counts.set(tech, (counts.get(tech) ?? 0) + 1);
    }
  }
  const arsenal = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  // Timeline: group shipped projects by year
  const byYear = new Map<number, typeof projects>();
  for (const project of [...projects].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) {
    const year = project.createdAt.getFullYear();
    byYear.set(year, [...(byYear.get(year) ?? []), project]);
  }
  const years = [...byYear.entries()].sort((a, b) => b[0] - a[0]);

  return (
    <section id="about" aria-labelledby="about-heading" className="container-page scroll-mt-20 pt-24">
      <Reveal>
        <p className="micro-label">The maker</p>
      </Reveal>
      <SplitText
        id="about-heading"
        text="About Arovyx"
        className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-5xl"
      />

      <div className="mt-10 grid gap-12 lg:grid-cols-[1.4fr_1fr]">
        {/* bio */}
        <Reveal delay={80} variant="left">
          <section aria-labelledby="bio-heading" className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-6 sm:p-8">
            <div className="flex items-center gap-4">
              {config.avatarUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={config.avatarUrl}
                  alt={config.ownerName}
                  width={56}
                  height={56}
                  className="h-14 w-14 shrink-0 rounded-full border border-accent-500/40 object-cover"
                />
              )}
              <div>
                <h3 id="bio-heading" className="flex items-center gap-2 font-display text-xl font-semibold">
                  <Rocket className="h-5 w-5 text-accent-500" aria-hidden />
                  The story
                </h3>
                {config.avatarUrl && (
                  <p className="mt-0.5 text-sm text-[var(--muted)]">{config.ownerName}</p>
                )}
              </div>
            </div>
            <p className="mt-4 leading-relaxed text-[var(--muted)]">{config.bio || config.tagline}</p>
            <p className="mt-4 leading-relaxed text-[var(--muted)]">
              Every project here starts the same way: a real problem, a small surface area,
              and a bias toward shipping. Items marked <strong className="text-[var(--fg)]">Live</strong> are
              in production and maintained; items in development are public experiments.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/projects"
                className="inline-flex items-center gap-2 rounded-lg bg-accent-500 px-4 py-2.5 text-sm font-semibold text-ink-950 transition-all hover:bg-accent-400 hover:shadow-glow"
              >
                See the work
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <SectionLink
                href="/#contact"
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-medium transition-colors hover:border-accent-500/60"
              >
                Work together
              </SectionLink>
              {config.resumeUrl && (
                <a
                  href={config.resumeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-medium transition-colors hover:border-accent-500/60"
                >
                  <FileText className="h-4 w-4" aria-hidden />
                  Résumé
                </a>
              )}
            </div>
          </section>

          {/* timeline */}
          <section aria-labelledby="timeline-heading" className="mt-8">
            <h3 id="timeline-heading" className="flex items-center gap-2 font-display text-xl font-semibold">
              <Code2 className="h-5 w-5 text-accent-500" aria-hidden />
              Shipped
            </h3>
            <ol className="mt-5 space-y-6 border-l border-[var(--border)] pl-6">
              {years.map(([year, items]) => (
                <li key={year} className="relative">
                  <span className="absolute -left-[1.94rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-accent-500 bg-[var(--bg)]" aria-hidden />
                  <p className="font-mono text-sm text-accent-600 dark:text-accent-400">{year}</p>
                  <ul className="mt-2 space-y-1.5 text-sm text-[var(--muted)]">
                    {items.map((project) => (
                      <li key={project.id}>
                        <Link
                          href={`/projects/${project.slug}`}
                          className="transition-colors hover:text-[var(--fg)]"
                        >
                          {project.title}
                        </Link>{" "}
                        <span className="opacity-70">
                          · {CATEGORY_META[project.category].label} · {formatDate(project.createdAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
              {years.length === 0 && <li className="text-sm text-[var(--muted)]">Nothing shipped yet.</li>}
            </ol>
          </section>
        </Reveal>

        {/* tech arsenal */}
        <Reveal delay={140} variant="right">
          <section aria-labelledby="arsenal-heading" className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-6">
            <h3 id="arsenal-heading" className="flex items-center gap-2 font-display text-xl font-semibold">
              <Cpu className="h-5 w-5 text-accent-500" aria-hidden />
              Tech arsenal
            </h3>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Tools used across {projects.length} published {projects.length === 1 ? "project" : "projects"}.
            </p>
            <ul className="mt-5 flex flex-wrap gap-2">
              {arsenal.map(([tech, count]) => (
                <li
                  key={tech}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-sm"
                >
                  {tech}
                  <span className="rounded-full bg-accent-400/15 px-1.5 text-[10px] font-semibold text-accent-700 dark:text-accent-300">
                    {count}
                  </span>
                </li>
              ))}
              {arsenal.length === 0 && <li className="text-sm text-[var(--muted)]">No data yet.</li>}
            </ul>
          </section>
        </Reveal>
      </div>
    </section>
  );
}
