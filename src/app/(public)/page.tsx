import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Hero from "@/components/Hero";
import CountUp from "@/components/CountUp";
import AboutSection from "@/components/sections/AboutSection";
import CategoryShowcase from "@/components/sections/CategoryShowcase";
import ContactSection from "@/components/sections/ContactSection";
import CtaBand from "@/components/sections/CtaBand";
import FeaturedStack from "@/components/sections/FeaturedStack";
import ProcessSection from "@/components/sections/ProcessSection";
import TechMarquee from "@/components/sections/TechMarquee";
import Reveal from "@/components/Reveal";
import SplitText from "@/components/motion/SplitText";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import {
  getPublishedProjects,
  getProjectStats,
  getSiteConfig,
  pickChosenProjects,
  pickHeroProjects,
} from "@/lib/projects";
import { pageMetadata } from "@/lib/seo";
import { CATEGORY_META, cn, truncate } from "@/lib/utils";
import type { Category } from "@/lib/validators";

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

  // chosen in Studio → Settings → Featured projects (newest 6 when none picked)
  const featured = pickChosenProjects(projects, config.featuredProjectIds, 6);

  const heroCards = pickHeroProjects(projects, config.heroProjectIds).map((p) => ({
    slug: p.slug,
    title: p.title,
    category: p.category,
    meta: p.techStack.length ? p.techStack.slice(0, 2).join(" · ") : truncate(p.shortDescription, 40),
    iconUrl: p.imageUrl,
  }));

  // newest four per category is all the tabbed showcase shows
  const showcase = (["APP", "GAME", "PACKAGE", "PLUGIN"] as const).flatMap((category) =>
    projects.filter((p) => p.category === category).slice(0, 4)
  );

  const tiles: Array<{ category: Category; count: number }> = [
    { category: "APP", count: stats.APP },
    { category: "GAME", count: stats.GAME },
    { category: "PACKAGE", count: stats.PACKAGE },
    { category: "PLUGIN", count: stats.PLUGIN },
  ];

  return (
    <>
      <Hero ownerName={config.ownerName} tagline={config.tagline} bio={config.bio} cards={heroCards} />

      <TechMarquee projects={projects} />

      {/* stats strip */}
      <section aria-label="Portfolio statistics" className="border-y border-[var(--border)] bg-[var(--panel)]">
        <Stagger step={0.07} className="container-page grid grid-cols-2 divide-x divide-[var(--border)] md:grid-cols-5">
          <Stat value={stats.total} label="Projects" accent delay={0} />
          {tiles.map((tile, index) => (
            <Stat
              key={tile.category}
              value={tile.count}
              label={CATEGORY_META[tile.category].plural}
              delay={(index + 1) * 80}
            />
          ))}
        </Stagger>
      </section>

      {/* featured projects */}
      <section className="container-page pt-24" aria-labelledby="featured-heading">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Reveal>
              <p className="micro-label">Selected work</p>
            </Reveal>
            <SplitText
              id="featured-heading"
              text="Featured projects"
              className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-5xl"
            />
          </div>
          <Reveal delay={200}>
            <Link
              href="/projects"
              className="group inline-flex items-center gap-1.5 text-sm text-[var(--muted)] transition-colors hover:text-accent-500"
            >
              View all
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
            </Link>
          </Reveal>
        </div>

        {featured.length === 0 ? (
          <p className="mt-8 text-sm text-[var(--muted)]">No published projects yet.</p>
        ) : (
          <FeaturedStack projects={featured} />
        )}
      </section>

      {/* browse by type — tabbed showcase */}
      <section className="container-page pt-28" aria-labelledby="categories-heading">
        <Reveal>
          <p className="micro-label">Browse by type</p>
        </Reveal>
        <SplitText
          id="categories-heading"
          text="What lives here"
          className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-5xl"
        />
        <CategoryShowcase projects={showcase} counts={stats} />
      </section>

      <ProcessSection />

      {/* about + contact live on the home page; the navbar scrolls to them */}
      <AboutSection config={config} projects={projects} />
      <CtaBand />
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
    <StaggerItem className="flex flex-col items-center justify-center px-4 py-7 text-center">
      <span
        className={cn(
          "font-display text-3xl font-semibold tracking-tight sm:text-4xl",
          accent ? "text-accent-600 dark:text-accent-400" : "text-[var(--fg)]"
        )}
      >
        <CountUp value={value} delay={delay} />
      </span>
      <span className="mt-1 text-[11px] uppercase tracking-micro text-[var(--muted)]">{label}</span>
    </StaggerItem>
  );
}
