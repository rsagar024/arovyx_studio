"use client";

import Link from "next/link";
import { ArrowUpRight, Github, Globe, Star, Download } from "lucide-react";
import type { ProjectDTO } from "@/lib/validators";
import { CATEGORY_META, cn, sourceLinkMeta } from "@/lib/utils";
import CategoryBadge from "@/components/CategoryBadge";
import StatusBadge from "@/components/StatusBadge";
import TechChip from "@/components/TechChip";
import GooglePlayIcon from "@/components/icons/GooglePlayIcon";

/** Small preview tile used in hero collage / detail pages. */
export default function ProjectCard({
  project,
  className,
}: {
  project: ProjectDTO;
  className?: string;
}) {
  const meta = CATEGORY_META[project.category];
  const accent = meta.accentText;
  const source = sourceLinkMeta(project.sourceUrl);

  return (
    <article
      className={cn(
        "group relative flex h-full flex-col rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5 pt-6",
        "transition-all duration-300 hover:-translate-y-1 focus-within:-translate-y-1",
        meta.hoverBorder,
        meta.glow,
        className
      )}
    >
      {/* category-colored accent line along the top edge */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r via-transparent to-transparent",
          meta.line
        )}
      />

      {/* grid-breaking category badge, overlapping the top border (spec §9) */}
      {/* opaque backing so the card border doesn't show through the tinted chip */}
      <span className="absolute -top-3 left-5 z-10 rounded-full bg-[var(--bg)] shadow-card">
        <CategoryBadge category={project.category} />
      </span>

      {/* header: icon or image + status */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="relative shrink-0">
          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-black/20">
            {project.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={project.imageUrl}
                alt={`${project.title} preview`}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className={cn("font-display text-lg font-semibold", accent)}>
                {project.title.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          {source.kind === "playstore" && (
            <span
              title="On Google Play"
              className="absolute -bottom-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg)]"
            >
              <GooglePlayIcon className="h-3 w-3" />
              <span className="sr-only">On Google Play</span>
            </span>
          )}
        </div>
        <StatusBadge status={project.status} />
      </div>

      <h3 className="font-display text-lg font-semibold tracking-tight text-[var(--fg)]">
        <Link href={`/projects/${project.slug}`} className="after:absolute after:inset-0">
          <span className="group-hover:text-accent-600 dark:group-hover:text-accent-400">
            {project.title}
          </span>
        </Link>
      </h3>

      <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-[var(--muted)]">
        {project.shortDescription}
      </p>

      {project.techStack.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {project.techStack.slice(0, 4).map((tech) => (
            <TechChip key={tech} label={tech} />
          ))}
          {project.techStack.length > 4 && (
            <TechChip label={`+${project.techStack.length - 4}`} />
          )}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between pt-5 text-xs text-[var(--muted)]">
        <div className="flex items-center gap-3">
          {project.stars != null && (
            <span className="inline-flex items-center gap-1">
              <Star className="h-3.5 w-3.5" aria-hidden /> {project.stars}
            </span>
          )}
          {project.downloads != null && (
            <span className="inline-flex items-center gap-1">
              <Download className="h-3.5 w-3.5" aria-hidden />{" "}
              {project.downloads >= 1000
                ? `${(project.downloads / 1000).toFixed(1)}k`
                : project.downloads}
            </span>
          )}
          {project.version && <span className="font-mono">v{project.version}</span>}
        </div>

        <span className="inline-flex items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100">
          View
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </span>
      </div>

      {/* source / demo quick links (above the stretched card link) */}
      {(project.sourceUrl || project.demoUrl) && (
        <div className="absolute right-4 top-1/2 z-10 flex -translate-y-1/2 translate-x-2 flex-col gap-2 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100">
          {project.sourceUrl && (
            <a
              href={project.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${project.title}: ${source.label}`}
              onClick={(e) => e.stopPropagation()}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:border-accent-500/60 hover:text-accent-500"
            >
              {source.kind === "playstore" ? (
                <GooglePlayIcon className="h-4 w-4" />
              ) : source.kind === "github" ? (
                <Github className="h-4 w-4" aria-hidden />
              ) : (
                <Globe className="h-4 w-4" aria-hidden />
              )}
            </a>
          )}
          {project.demoUrl && (
            <a
              href={project.demoUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${project.title} live demo`}
              onClick={(e) => e.stopPropagation()}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg)] text-[var(--muted)] hover:border-accent-500/60 hover:text-accent-500"
            >
              <ArrowUpRight className="h-4 w-4" />
            </a>
          )}
        </div>
      )}
    </article>
  );
}
