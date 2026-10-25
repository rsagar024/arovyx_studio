import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Boxes, Gamepad2, Package, Puzzle } from "lucide-react";
import Hero from "@/components/Hero";
import CountUp from "@/components/CountUp";
import AboutSection from "@/components/sections/AboutSection";
import ContactSection from "@/components/sections/ContactSection";
import Reveal from "@/components/Reveal";
import ProjectCard from "@/components/ProjectCard";
import { getPublishedProjects, getProjectStats, getSiteConfig, pickHeroProjects } from "@/lib/projects";
import { pageMetadata } from "@/lib/seo";
import { CATEGORY_META, cn, truncate } from "@/lib/utils";
import type { Category } from "@/lib/validators";

const CATEGORY_ICONS: Record<Category, typeof Boxes> = {
  APP: Boxes,
  GAME: Gamepad2,
  PACKAGE: Package,
  PLUGIN: Puzzle,
};

// Safety net: mutations revalidate "/" on demand, but if any write path ever
// misses it the cached page still refreshes within a minute.
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const config = await getSiteConfig();
  return pageMetadata({
    // bio can run to 4000 chars — keep the meta description snippet-sized
    description: truncate(
      config.bio ||
        config.tagline ||
        "A developer showcase of apps, games, packages and plugins, powered by NVIDIA NIM.",
      160
    ),
    path: "/",
  });
}

export default async function HomePage() {
  const [stats, projects, config] = await Promise.all([
    getProjectStats(),
    getPublishedProjects(),
    getSiteConfig(),
  ]);

  const featured = projects.slice(0, 6);

  const heroCards = pickHeroProjects(projects, config.heroProjectIds).map((p) => ({
    slug: p.slug,
    title: p.title,
    category: p.category,
    meta: p.techStack.length ? p.techStack.slice(0, 2).join(" · ") : truncate(p.shortDescription, 40),
    iconUrl: p.imageUrl,
  }));

  const tiles: Array<{ category: Category; count: number }> = [
    { category: "APP", count: stats.APP },
    { category: "GAME", count: stats.GAME },
    { category: "PACKAGE", count: stats.PACKAGE },
    { category: "PLUGIN", count: stats.PLUGIN },
  ];

  return (
    <>
      <Hero ownerName={config.ownerName} tagline={config.tagline} bio={config.bio} cards={heroCards} />

      {/* stats strip */}
      <section aria-label="Portfolio statistics" className="border-y border-[var(--border)] bg-[var(--panel)]">
        <div className="container-page grid grid-cols-2 divide-x divide-[var(--border)] md:grid-cols-5">
          <Stat value={stats.total} label="Projects" accent delay={0} />
          {tiles.map((tile, index) => (
            <Stat
              key={tile.category}
              value={tile.count}
              label={CATEGORY_META[tile.category].plural}
              delay={(index + 1) * 80}
            />
          ))}
        </div>
      </section>

      {/* featured projects */}
      <section className="container-page pt-20" aria-labelledby="featured-heading">
        <Reveal className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="micro-label">Selected work</p>
            <h2 id="featured-heading" className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Featured projects
            </h2>
          </div>
          <Link
            href="/projects"
            className="group inline-flex items-center gap-1.5 text-sm text-[var(--muted)] transition-colors hover:text-accent-500"
          >
            View all
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
          </Link>
        </Reveal>

        {featured.length === 0 ? (
          <p className="mt-8 text-sm text-[var(--muted)]">No published projects yet.</p>
        ) : (
          <div className="mt-10 grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((project, index) => (
              <Reveal key={project.id} delay={index * 80}>
                <ProjectCard project={project} />
              </Reveal>
            ))}
          </div>
        )}
      </section>

      {/* category tiles */}
      <section className="container-page pt-20" aria-labelledby="categories-heading">
        <Reveal>
          <p className="micro-label">Browse by type</p>
          <h2 id="categories-heading" className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            What lives here
          </h2>
        </Reveal>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map((tile, index) => {
            const meta = CATEGORY_META[tile.category];
            const Icon = CATEGORY_ICONS[tile.category];
            return (
              <Reveal key={tile.category} delay={index * 70}>
                <Link
                  href={`/projects?category=${tile.category}`}
                  className={cn(
                    "group flex h-full flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5 transition-all duration-300",
                    "hover:-translate-y-1 focus-visible:-translate-y-1",
                    meta.accentBorder,
                    meta.glow
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn("flex h-10 w-10 items-center justify-center rounded-lg border", meta.chip)}>
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="font-display text-3xl font-semibold text-[var(--muted)] transition-colors group-hover:text-[var(--fg)]">
                      <CountUp value={tile.count} delay={index * 80} />
                    </span>
                  </div>
                  <div className="mt-8">
                    <p className="font-display text-lg font-semibold">{meta.plural}</p>
                    <p className={cn("mt-1 inline-flex items-center gap-1 text-xs", meta.accentText)}>
                      Browse
                      <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" aria-hidden />
                    </p>
                  </div>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* about + contact live on the home page; the navbar scrolls to them */}
      <AboutSection config={config} projects={projects} />
      <ContactSection config={config} />
    </>
  );
}

function Stat({
  value,
  label,
  accent,
  delay,
}: {
  value: number;
  label: string;
  accent?: boolean;
  /** Count-up stagger in ms. */
  delay: number;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-7 text-center">
      <span
        className={cn(
          "font-display text-3xl font-semibold tracking-tight sm:text-4xl",
          accent ? "text-accent-600 dark:text-accent-400" : "text-[var(--fg)]"
        )}
      >
        <CountUp value={value} delay={delay} />
      </span>
      <span className="mt-1 text-[11px] uppercase tracking-micro text-[var(--muted)]">{label}</span>
    </div>
  );
}
