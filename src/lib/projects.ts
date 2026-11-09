import { unstable_cache } from "next/cache";
import { CACHE_TAGS } from "@/lib/api";
import { SITE_CONFIG_DEFAULTS, listProjects, readSiteConfig, type Project, type SiteConfig } from "@/lib/store";
import { parseJsonStringArray, toProjectDTO, type ProjectDTO } from "@/lib/validators";

/*
 * Every public page, the sitemap and the root layout's metadata read the
 * projects and the site settings. Reading Firestore on each render cost
 * thousands of reads a day on the free plan, so both are kept in Next's data
 * cache: one read of the projects and one of the settings per hour at most,
 * and at once after any edit in Studio (revalidatePublicPages drops the
 * tags). The cache stores JSON, so dates are revived on the way out.
 */
const CACHE_SECONDS = 3600;

const cachedPublishedRows = unstable_cache(
  async () => listProjects({ publishedOnly: true }),
  ["published-projects-v1"],
  { tags: [CACHE_TAGS.projects], revalidate: CACHE_SECONDS }
);

const cachedSiteConfig = unstable_cache(async () => readSiteConfig(), ["site-config-v1"], {
  tags: [CACHE_TAGS.site],
  revalidate: CACHE_SECONDS,
});

const reviveProject = (p: Project): Project => ({
  ...p,
  createdAt: new Date(p.createdAt),
  updatedAt: new Date(p.updatedAt),
});

/** All published projects, newest first, decoded to DTOs. */
export async function getPublishedProjects(): Promise<ProjectDTO[]> {
  const rows = await cachedPublishedRows();
  return rows.map((r) => toProjectDTO(reviveProject(r)));
}

/** A published project by slug, from the cached list: an unknown slug costs no read. */
export async function getProjectBySlug(slug: string): Promise<ProjectDTO | null> {
  return (await getPublishedProjects()).find((p) => p.slug === slug) ?? null;
}

/** Counts for the home stats strip. */
export async function getProjectStats(): Promise<{
  total: number;
  APP: number;
  GAME: number;
  PACKAGE: number;
  PLUGIN: number;
}> {
  const rows = await getPublishedProjects();
  const stats = { total: rows.length, APP: 0, GAME: 0, PACKAGE: 0, PLUGIN: 0 };
  for (const row of rows) {
    if (row.category === "APP" || row.category === "GAME" || row.category === "PACKAGE" || row.category === "PLUGIN") {
      stats[row.category] += 1;
    }
  }
  return stats;
}

/* ------------------------------------------------------------------ */
/* Similar projects                                                    */
/* ------------------------------------------------------------------ */

/** Words too generic to make two titles "related". */
const TITLE_STOPWORDS = new Set([
  "the", "and", "for", "with", "app", "apps", "pro", "lite", "free", "mobile", "android", "ios",
  "plus", "new", "beta", "official", "game", "games", "your", "you", "from", "by", "of", "a", "an",
]);

const norm = (value: string) => value.trim().toLowerCase();

/** Meaningful lower-case title words (≥3 chars, no stopwords). */
export function titleTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 3 && !TITLE_STOPWORDS.has(word))
  );
}

/** "Published by": the stored value, else the GitHub/GitLab owner from the source URL. */
export function effectivePublisher(project: Pick<ProjectDTO, "publisher" | "sourceUrl">): string | null {
  if (project.publisher?.trim()) return norm(project.publisher);
  try {
    const url = new URL(project.sourceUrl);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "github.com" || host === "gitlab.com") {
      const owner = url.pathname.split("/").filter(Boolean)[0];
      if (owner) return norm(owner);
    }
  } catch {
    /* invalid URL — no publisher */
  }
  return null;
}

const SCORE = { publisher: 5, titleWord: 3, tag: 2, tech: 1, category: 1 } as const;
/** Minimum relevance (category excluded) for a project to count as related. */
const MIN_RELEVANCE = 2;

/**
 * How related `other` is to `project`. `relevance` excludes the category
 * bonus — a shared category alone never makes projects "similar".
 */
export function similarityScore(project: ProjectDTO, other: ProjectDTO): { relevance: number; total: number } {
  let relevance = 0;

  const publisher = effectivePublisher(project);
  if (publisher && publisher === effectivePublisher(other)) relevance += SCORE.publisher;

  const words = titleTokens(project.title);
  for (const word of titleTokens(other.title)) if (words.has(word)) relevance += SCORE.titleWord;

  const tags = new Set(project.tags.map(norm));
  relevance += other.tags.filter((tag) => tags.has(norm(tag))).length * SCORE.tag;

  const tech = new Set(project.techStack.map(norm));
  relevance += other.techStack.filter((t) => tech.has(norm(t))).length * SCORE.tech;

  const total = relevance + (other.category === project.category ? SCORE.category : 0);
  return { relevance, total };
}

/**
 * Projects genuinely related to `project` — same publisher, shared title
 * words, shared tags, or 2+ shared tech-stack items — best match first.
 * Returns an empty list when nothing is related (the section is then hidden);
 * never pads with unrelated projects.
 */
export function pickSimilarProjects(project: ProjectDTO, candidates: ProjectDTO[], limit = 3): ProjectDTO[] {
  return candidates
    .filter((p) => p.id !== project.id)
    .map((p, index) => ({ p, index, ...similarityScore(project, p) }))
    .filter((entry) => entry.relevance >= MIN_RELEVANCE)
    .sort((a, b) => b.total - a.total || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.p);
}

export async function getSimilarProjects(project: ProjectDTO, limit = 3): Promise<ProjectDTO[]> {
  return pickSimilarProjects(project, await getPublishedProjects(), limit);
}

/**
 * Projects chosen in Studio (a SiteConfig JSON string[] of ids) in that
 * order, skipping any that are unpublished or deleted. Falls back to the
 * latest published when none of the choices are available.
 */
export function pickChosenProjects(
  published: ProjectDTO[],
  idsJson: string | null | undefined,
  limit: number
): ProjectDTO[] {
  const byId = new Map(published.map((p) => [p.id, p]));
  const chosen = parseJsonStringArray(idsJson)
    .map((id) => byId.get(id))
    .filter((p): p is ProjectDTO => Boolean(p))
    .slice(0, limit);
  return chosen.length ? chosen : published.slice(0, limit);
}

/** Home hero cards (SiteConfig `heroProjectIds`, up to 3). */
export function pickHeroProjects(published: ProjectDTO[], heroProjectIds: string | null | undefined, limit = 3) {
  return pickChosenProjects(published, heroProjectIds, limit);
}

/**
 * Single-row site settings (with defaults if the row is missing).
 * A database outage also falls back to the defaults, because the root layout's
 * metadata calls this on every page. Without the fallback, an outage crashes
 * even pages that don't need the database (and the error boundaries never get
 * a chance to render).
 */
export async function getSiteConfig(): Promise<SiteConfig> {
  let config: SiteConfig | null = null;
  try {
    const cached = await cachedSiteConfig();
    config = cached ? { ...cached, updatedAt: new Date(cached.updatedAt) } : null;
  } catch (err) {
    console.error("getSiteConfig: database unavailable, using defaults:", err);
  }
  if (config) return config;
  return { ...SITE_CONFIG_DEFAULTS, updatedAt: new Date() };
}
