import type { Metadata } from "next";
import ProjectExplorer from "@/components/ProjectExplorer";
import Reveal from "@/components/Reveal";
import SplitText from "@/components/motion/SplitText";
import { getPublishedProjects } from "@/lib/projects";
import { pageMetadata } from "@/lib/seo";
import { categorySchema } from "@/lib/validators";

export function generateMetadata(): Promise<Metadata> {
  return pageMetadata({
    title: "Projects",
    description:
      "Browse every app, game, package and plugin from Arovyx Studio — filter by category or search by tech stack.",
    path: "/projects",
  });
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: { category?: string; q?: string };
}) {
  const projects = await getPublishedProjects();

  const parsed = categorySchema.safeParse(searchParams.category?.toUpperCase() ?? "");
  const category = parsed.success ? parsed.data : "ALL";
  const query = searchParams.q ?? "";

  return (
    <div className="container-page relative py-16">
      {/* ambient backdrop: breathing glow, faint grid and a diagonal line that draws in */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 overflow-hidden">
        <div className="absolute -left-20 -top-24 h-72 w-72 rounded-full bg-accent-500/20 blur-3xl motion-safe:animate-pulse-glow" />
        <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(var(--fg)_1px,transparent_1px),linear-gradient(90deg,var(--fg)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(ellipse_at_top_left,black,transparent_70%)]" />
        <div className="absolute right-[10%] top-0 h-80 w-px rotate-[24deg]">
          <div className="h-full w-full origin-top bg-gradient-to-b from-accent-500/60 to-transparent motion-safe:animate-draw-y" />
        </div>
      </div>

      <Reveal>
        <p className="micro-label">The work</p>
      </Reveal>
      <SplitText
        as="h1"
        onMount
        text="All projects"
        className="mt-3 font-display text-4xl font-semibold tracking-tight sm:text-6xl"
      />
      <Reveal delay={200}>
        <p className="mt-4 max-w-2xl text-[var(--muted)]">
          Apps, games, packages and plugins — filter by category or search across titles,
          tags and tech stacks.
        </p>
      </Reveal>

      <div className="mt-10">
        <ProjectExplorer projects={projects} initialCategory={category} initialQuery={query} />
      </div>
    </div>
  );
}
