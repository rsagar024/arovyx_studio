import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, ExternalLink, Github, Gitlab, Globe, Package, Star, Tag } from "lucide-react";
import CategoryBadge from "@/components/CategoryBadge";
import StatusBadge from "@/components/StatusBadge";
import TechChip from "@/components/TechChip";
import Reveal from "@/components/Reveal";
import ProjectCard from "@/components/ProjectCard";
import GooglePlayIcon from "@/components/icons/GooglePlayIcon";
import SafeImg from "@/components/SafeImg";
import ScreenshotGallery from "@/components/ScreenshotGallery";
import CountUp from "@/components/CountUp";
import Magnetic from "@/components/motion/Magnetic";
import ScrollZoom from "@/components/motion/ScrollZoom";
import SplitText from "@/components/motion/SplitText";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { getProjectBySlug, getSimilarProjects } from "@/lib/projects";
import { markdownToHtml } from "@/lib/markdown";
import { pageMetadata } from "@/lib/seo";
import { CATEGORY_META, absoluteUrl, cn, formatDate, mediaSrc, sourceLinkMeta } from "@/lib/utils";

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const project = await getProjectBySlug(params.slug);
  if (!project) return { title: "Project not found" };

  return {
    ...(await pageMetadata({
      title: project.title,
      description: project.shortDescription,
      path: `/projects/${project.slug}`,
      // the wide feature graphic makes a better social card than a square icon
      image: project.bannerUrl ?? project.imageUrl,
      type: "article",
    })),
    keywords: [...project.tags, ...project.techStack],
  };
}

export default async function ProjectDetailPage({ params }: Props) {
  const project = await getProjectBySlug(params.slug);
  if (!project) notFound();

  const [similar, html] = await Promise.all([
    getSimilarProjects(project, 3),
    Promise.resolve(markdownToHtml(project.longDescription || project.shortDescription)),
  ]);

  const meta = CATEGORY_META[project.category];
  const source = sourceLinkMeta(project.sourceUrl);
  const SourceIcon =
    source.kind === "github"
      ? Github
      : source.kind === "gitlab"
        ? Gitlab
        : source.kind === "npm" || source.kind === "pypi"
          ? Package
          : Globe;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: project.title,
    description: project.shortDescription,
    url: absoluteUrl(`/projects/${project.slug}`),
    applicationCategory: meta.label,
    ...(project.version ? { softwareVersion: project.version } : {}),
    ...(project.demoUrl ? { sameAs: project.demoUrl } : {}),
    ...(project.imageUrl ? { image: project.imageUrl } : {}),
    ...(project.screenshots.length ? { screenshot: project.screenshots } : {}),
    ...(project.publisher ? { author: { "@type": "Organization", name: project.publisher } } : {}),
    ...(source.kind === "playstore" ? { operatingSystem: "Android", installUrl: project.sourceUrl } : {}),
  };

  return (
    <div className="container-page relative py-16">
      {/* diagonal accent line in the category color — grid-breaking detail (spec §9) */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute right-[12%] top-0 h-[380px] w-px rotate-[24deg]">
          <div
            className={cn(
              "h-full w-full origin-top bg-gradient-to-b to-transparent motion-safe:animate-draw-y",
              meta.line
            )}
          />
        </div>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Reveal>
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] transition-colors hover:text-accent-500"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          All projects
        </Link>
      </Reveal>

      <Reveal delay={60} variant="scale">
        <header
          className={cn(
            "relative mt-6",
            project.bannerUrl
              ? "overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)] shadow-card"
              : "border-b border-[var(--border)] pb-10"
          )}
        >
          {/* Feature graphic as a strip ABOVE the text — store graphics often contain
              their own lettering, so text is never drawn on top of it. If the image
              fails to load it removes itself and the card simply starts with the text. */}
          {project.bannerUrl && (
            <ScrollZoom className="border-b border-[var(--border)]">
              <SafeImg
                src={mediaSrc(project.bannerUrl)}
                alt=""
                aria-hidden
                className="block aspect-[1024/500] max-h-[22rem] w-full object-cover motion-safe:animate-settle"
              />
            </ScrollZoom>
          )}

          <div className={cn("relative", project.bannerUrl && "px-5 pb-8 pt-6 sm:px-10")}>
            <Stagger className="flex flex-wrap items-center gap-2" delay={0.2}>
              <StaggerItem variant="scale">
                <CategoryBadge category={project.category} />
              </StaggerItem>
              <StaggerItem variant="scale">
                <StatusBadge status={project.status} />
              </StaggerItem>
              {project.version && (
                <StaggerItem variant="scale">
                  <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2.5 py-0.5 font-mono text-[11px] text-[var(--muted)]">
                    <Tag className="h-3 w-3" aria-hidden />
                    v{project.version}
                  </span>
                </StaggerItem>
              )}
            </Stagger>

            <div className="mt-5 flex items-center gap-4">
              {project.imageUrl && (
                <SafeImg
                  src={mediaSrc(project.imageUrl)}
                  alt={`${project.title} icon`}
                  width={80}
                  height={80}
                  className="h-16 w-16 shrink-0 rounded-2xl border border-[var(--border)] object-cover shadow-card motion-safe:animate-pop sm:h-20 sm:w-20"
                />
              )}
              <div className="min-w-0">
                <SplitText
                  as="h1"
                  onMount
                  delay={0.25}
                  text={project.title}
                  className="font-display text-3xl font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-5xl"
                />
                {project.publisher && (
                  <p className="mt-1.5 text-sm text-[var(--muted)]">
                    by <span className="font-medium text-[var(--fg)]">{project.publisher}</span>
                  </p>
                )}
              </div>
            </div>
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-[var(--muted)] [overflow-wrap:anywhere] sm:text-lg">
              {project.shortDescription}
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              {project.sourceUrl && source.kind === "playstore" && (
                <a
                  href={project.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${source.label}: ${project.title}`}
                  className="inline-flex items-center gap-3 rounded-xl border border-white/15 bg-ink-950 px-4 py-2 text-white transition-all hover:-translate-y-0.5 hover:shadow-glow"
                >
                  <GooglePlayIcon className="h-7 w-7" />
                  <span className="flex flex-col leading-tight">
                    <span className="text-[10px] uppercase tracking-wide text-white/70">Get it on</span>
                    <span className="font-display text-base font-semibold">Google Play</span>
                  </span>
                </a>
              )}
              {project.sourceUrl && source.kind !== "playstore" && (
                <Magnetic>
                  <a
                    href={project.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative inline-flex items-center gap-2 overflow-hidden rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-semibold text-ink-950 transition-all hover:bg-accent-400 hover:shadow-glow"
                  >
                    {/* shine sweep on hover */}
                    <span
                      aria-hidden
                      className="absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-white/40 opacity-0 transition-all duration-700 group-hover:left-[120%] group-hover:opacity-100"
                    />
                    <SourceIcon className="relative h-4 w-4" aria-hidden />
                    <span className="relative">{source.label}</span>
                  </a>
                </Magnetic>
              )}
              {project.demoUrl && (
                <a
                  href={project.demoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-5 py-2.5 text-sm font-medium transition-colors hover:border-accent-500/60"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  Live demo
                </a>
              )}
              {/* on phones the stats wrap onto their own line below the buttons */}
              <span className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--muted)] sm:ml-auto sm:w-auto">
                {project.stars != null && (
                  <span className="inline-flex items-center gap-1">
                    <Star className="h-3.5 w-3.5" aria-hidden /> <CountUp value={project.stars} pad={1} /> stars
                  </span>
                )}
                {project.downloads != null && (
                  <span className="inline-flex items-center gap-1">
                    <Download className="h-3.5 w-3.5" aria-hidden /> {project.downloads.toLocaleString()}
                    {source.kind === "playstore" ? "+ installs" : " downloads"}
                  </span>
                )}
                <span>{formatDate(project.createdAt)}</span>
              </span>
            </div>
          </div>
        </header>
      </Reveal>

      {/* phone screenshots — section is omitted entirely when there are none */}
      {project.screenshots.length > 0 && (
        <Reveal delay={100}>
          <ScreenshotGallery
            title={project.title}
            screenshots={[...new Set(project.screenshots.map((s) => mediaSrc(s)))]}
          />
        </Reveal>
      )}

      <div className="mt-12 grid gap-12 lg:grid-cols-[1.6fr_1fr]">
        {/* main content */}
        {/* min-w-0: a wide code block must scroll inside its box, not widen the page */}
        <Reveal delay={120} className="min-w-0">
          <article
            className="max-w-none text-[15px] [overflow-wrap:anywhere] [&_pre]:max-w-full"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </Reveal>

        {/* sidebar */}
        {/* sidebar: panels rise in one after another, their chips pop in */}
        <Stagger className="min-w-0 space-y-8" step={0.12} delay={0.15}>
          <StaggerItem variant="up">
            <aside className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
              <h2 className="micro-label">Tech stack</h2>
              {project.techStack.length ? (
                <Stagger className="mt-3 flex flex-wrap gap-1.5" step={0.04} delay={0.2}>
                  {project.techStack.map((tech) => (
                    <StaggerItem key={tech} variant="scale">
                      <TechChip label={tech} />
                    </StaggerItem>
                  ))}
                </Stagger>
              ) : (
                <p className="mt-3 text-sm text-[var(--muted)]">Not specified.</p>
              )}
            </aside>
          </StaggerItem>

          <StaggerItem variant="up">
            <aside className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
              <h2 className="micro-label">Tags</h2>
              {project.tags.length ? (
                <Stagger className="mt-3 flex flex-wrap gap-1.5" step={0.04} delay={0.2}>
                  {project.tags.map((tag) => (
                    <StaggerItem key={tag} variant="scale">
                      <span className="block rounded-full border border-[var(--border)] px-2.5 py-0.5 text-[11px] text-[var(--muted)] [overflow-wrap:anywhere]">
                        #{tag}
                      </span>
                    </StaggerItem>
                  ))}
                </Stagger>
              ) : (
                <p className="mt-3 text-sm text-[var(--muted)]">No tags yet.</p>
              )}
            </aside>
          </StaggerItem>

          {project.features.length > 0 && (
            <StaggerItem variant="up">
              <aside className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
                <h2 className="micro-label">Features</h2>
                <Stagger as="ul" className="mt-3 space-y-2" step={0.06} delay={0.2}>
                  {project.features.map((feature) => (
                    <StaggerItem
                      as="li"
                      key={feature}
                      variant="left"
                      className="flex items-start gap-2 text-sm text-[var(--muted)] [overflow-wrap:anywhere]"
                    >
                      <span className="relative mt-1.5 flex h-1.5 w-1.5 shrink-0" aria-hidden>
                        <span className={cn("absolute inset-0 rounded-full motion-safe:animate-ping-once", meta.dot)} />
                        <span className={cn("relative h-1.5 w-1.5 rounded-full", meta.dot)} />
                      </span>
                      {feature}
                    </StaggerItem>
                  ))}
                </Stagger>
              </aside>
            </StaggerItem>
          )}

          <StaggerItem variant="up">
            <aside className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
              <h2 className="micro-label">Meta</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <MetaRow label="Category" value={meta.label} />
                <MetaRow label="Status" value={project.status.replace("_", " ")} />
                {project.version && <MetaRow label="Version" value={`v${project.version}`} />}
                <MetaRow label="Added" value={formatDate(project.createdAt)} />
                <MetaRow label="Source" value={safeHostname(project.sourceUrl)} />
              </dl>
            </aside>
          </StaggerItem>
        </Stagger>
      </div>

      {/* similar projects */}
      {similar.length > 0 && (
        <section className="mt-20" aria-labelledby="similar-heading">
          <Reveal>
            <p className="micro-label">Keep exploring</p>
            <h2 id="similar-heading" className="mt-3 font-display text-3xl font-semibold tracking-tight">
              Similar projects
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {similar.map((item, index) => (
              <Reveal key={item.id} delay={index * 80}>
                <ProjectCard project={item} />
              </Reveal>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="shrink-0 text-[var(--muted)]">{label}</dt>
      <dd className="min-w-0 truncate font-medium capitalize text-[var(--fg)]" title={value}>
        {value}
      </dd>
    </div>
  );
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
