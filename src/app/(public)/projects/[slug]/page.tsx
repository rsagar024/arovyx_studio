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
import { getProjectBySlug, getSimilarProjects } from "@/lib/projects";
import { markdownToHtml } from "@/lib/markdown";
import { pageMetadata } from "@/lib/seo";
import { CATEGORY_META, absoluteUrl, cn, formatDate, sourceLinkMeta } from "@/lib/utils";

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
    ...(source.kind === "playstore" ? { operatingSystem: "Android", installUrl: project.sourceUrl } : {}),
  };

  return (
    <div className="container-page relative py-16">
      {/* diagonal accent line in the category color — grid-breaking detail (spec §9) */}
      <div aria-hidden className="pointer-events-none absolute inset-0 hidden overflow-hidden sm:block">
        <div
          className={cn(
            "absolute -top-10 right-[12%] h-[380px] w-px rotate-[24deg] bg-gradient-to-b to-transparent",
            meta.line
          )}
        />
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

      <Reveal delay={60}>
        <header
          className={cn(
            "relative mt-6 border-b border-[var(--border)] pb-10",
            project.bannerUrl &&
              "overflow-hidden rounded-2xl border px-5 pt-28 shadow-card sm:px-10 sm:pt-44"
          )}
        >
          {/* feature graphic as background; fades into the page so text stays readable in both themes */}
          {project.bannerUrl && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={project.bannerUrl}
                alt=""
                aria-hidden
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div
                aria-hidden
                className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-[rgb(var(--bg-rgb)/0.85)] to-[rgb(var(--bg-rgb)/0.2)]"
              />
            </>
          )}

          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <CategoryBadge category={project.category} />
              <StatusBadge status={project.status} />
              {project.version && (
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2.5 py-0.5 font-mono text-[11px] text-[var(--muted)]">
                  <Tag className="h-3 w-3" aria-hidden />
                  v{project.version}
                </span>
              )}
            </div>

            <div className="mt-5 flex items-center gap-4">
              {project.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={project.imageUrl}
                  alt={`${project.title} icon`}
                  width={80}
                  height={80}
                  className="h-16 w-16 shrink-0 rounded-2xl border border-[var(--border)] object-cover shadow-card sm:h-20 sm:w-20"
                />
              )}
              <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
                {project.title}
              </h1>
            </div>
            <p className="mt-4 max-w-3xl text-lg leading-relaxed text-[var(--muted)]">
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
                <a
                  href={project.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-semibold text-ink-950 transition-all hover:bg-accent-400 hover:shadow-glow"
                >
                  <SourceIcon className="h-4 w-4" aria-hidden />
                  {source.label}
                </a>
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
              <span className="ml-auto hidden items-center gap-4 text-xs text-[var(--muted)] sm:flex">
                {project.stars != null && (
                  <span className="inline-flex items-center gap-1">
                    <Star className="h-3.5 w-3.5" aria-hidden /> {project.stars} stars
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
          <section aria-labelledby="screenshots-heading" className="mt-12">
            <h2 id="screenshots-heading" className="micro-label">
              Screenshots
            </h2>
            <ul className="mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4">
              {project.screenshots.map((src, index) => (
                <li key={`${src}-${index}`} className="shrink-0 snap-start">
                  <a
                    href={src}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block overflow-hidden rounded-2xl border border-[var(--border)] transition-all hover:-translate-y-1 hover:border-accent-500/50 hover:shadow-glow"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={`Screenshot ${index + 1} of ${project.title}`}
                      loading="lazy"
                      className="h-[22rem] w-auto max-w-none object-cover sm:h-[26rem]"
                    />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </Reveal>
      )}

      <div className="mt-12 grid gap-12 lg:grid-cols-[1.6fr_1fr]">
        {/* main content */}
        <Reveal delay={120}>
          <article
            className="max-w-none text-[15px]"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </Reveal>

        {/* sidebar */}
        <Reveal delay={160} className="space-y-8">
          <aside className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
            <h2 className="micro-label">Tech stack</h2>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {project.techStack.length ? (
                project.techStack.map((tech) => <TechChip key={tech} label={tech} />)
              ) : (
                <p className="text-sm text-[var(--muted)]">Not specified.</p>
              )}
            </div>
          </aside>

          <aside className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
            <h2 className="micro-label">Tags</h2>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {project.tags.length ? (
                project.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-[var(--border)] px-2.5 py-0.5 text-[11px] text-[var(--muted)]"
                  >
                    #{tag}
                  </span>
                ))
              ) : (
                <p className="text-sm text-[var(--muted)]">No tags yet.</p>
              )}
            </div>
          </aside>

          {project.features.length > 0 && (
            <aside className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
              <h2 className="micro-label">Features</h2>
              <ul className="mt-3 space-y-2">
                {project.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2 text-sm text-[var(--muted)]"
                  >
                    <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", meta.dot)} aria-hidden />
                    {feature}
                  </li>
                ))}
              </ul>
            </aside>
          )}

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
        </Reveal>
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
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="font-medium capitalize text-[var(--fg)]">{value}</dd>
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
