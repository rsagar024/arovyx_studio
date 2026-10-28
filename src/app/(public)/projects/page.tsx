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
    <div className="container-page py-16">
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
