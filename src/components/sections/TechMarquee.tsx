import Marquee from "@/components/motion/Marquee";
import Reveal from "@/components/Reveal";
import type { ProjectDTO } from "@/lib/validators";

/** Most-used tech across published projects, most common first. */
function topTech(projects: ProjectDTO[], limit: number): string[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const project of projects) {
    for (const tech of project.techStack) {
      const key = tech.trim().toLowerCase();
      if (!key) continue;
      const entry = counts.get(key) ?? { label: tech.trim(), count: 0 };
      entry.count += 1;
      counts.set(key, entry);
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map((entry) => entry.label);
}

/** "Built with" ticker — two rows of tech chips sliding in opposite directions. */
export default function TechMarquee({ projects }: { projects: ProjectDTO[] }) {
  const tech = topTech(projects, 28);
  if (tech.length < 4) return null;

  const half = Math.ceil(tech.length / 2);
  const rows = tech.length >= 10 ? [tech.slice(0, half), tech.slice(half)] : [tech];

  return (
    <section aria-labelledby="tech-heading" className="py-14">
      <Reveal>
        <p id="tech-heading" className="micro-label text-center">
          Built with the tools I trust
        </p>
      </Reveal>
      {/* decorative — the sr-only sentence below lists the same tech once */}
      <div aria-hidden className="mt-6 space-y-3">
        {rows.map((row, index) => (
          <Marquee key={index} reverse={index % 2 === 1} seconds={30 + row.length * 1.5}>
            {row.map((label) => (
              <span
                key={label}
                className="shrink-0 whitespace-nowrap rounded-full border border-[var(--border)] bg-[var(--panel)] px-4 py-2 font-mono text-sm text-[var(--muted)] transition-colors hover:border-accent-500/50 hover:text-[var(--fg)]"
              >
                {label}
              </span>
            ))}
          </Marquee>
        ))}
      </div>
      <p className="sr-only">Technologies used: {tech.join(", ")}.</p>
    </section>
  );
}
