import { db } from "@/lib/db";
import { parseJsonStringArray, toProjectDTO, type ProjectDTO } from "@/lib/validators";

/** All published projects, newest first, decoded to DTOs. */
export async function getPublishedProjects(): Promise<ProjectDTO[]> {
  const rows = await db.project.findMany({
    where: { isPublished: true },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toProjectDTO);
}

export async function getProjectBySlug(slug: string): Promise<ProjectDTO | null> {
  const row = await db.project.findUnique({ where: { slug } });
  if (!row || !row.isPublished) return null;
  return toProjectDTO(row);
}

/** Counts for the home stats strip. */
export async function getProjectStats(): Promise<{
  total: number;
  APP: number;
  GAME: number;
  PACKAGE: number;
  PLUGIN: number;
}> {
  const rows = await db.project.findMany({
    where: { isPublished: true },
    select: { category: true },
  });
  const stats = { total: rows.length, APP: 0, GAME: 0, PACKAGE: 0, PLUGIN: 0 };
  for (const row of rows) {
    if (row.category === "APP" || row.category === "GAME" || row.category === "PACKAGE" || row.category === "PLUGIN") {
      stats[row.category] += 1;
    }
  }
  return stats;
}

/**
 * Similar projects: same category first, then shared tags (spec §5.3).
 * If nothing scores (no same-category/tag overlap), fills with the most
 * recent published projects so the section is never empty-handed.
 * The source project is excluded.
 */
export async function getSimilarProjects(project: ProjectDTO, limit = 3): Promise<ProjectDTO[]> {
  const all = await getPublishedProjects();
  const candidates = all.filter((p) => p.id !== project.id);

  const scored = candidates
    .map((p, index) => {
      let score = p.category === project.category ? 2 : 0;
      score += p.tags.filter((tag) => project.tags.includes(tag)).length;
      return { p, score, index };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const matched = scored.filter((entry) => entry.score > 0).map((entry) => entry.p);
  const fallback = scored.filter((entry) => entry.score === 0).map((entry) => entry.p);

  return [...matched, ...fallback].slice(0, limit);
}

/**
 * Projects for the home hero cards: the ones chosen in Studio (SiteConfig
 * `heroProjectIds`, JSON string[]) in that order, skipping any that are
 * unpublished or deleted. Falls back to the latest published when none
 * of the choices are available.
 */
export function pickHeroProjects(
  published: ProjectDTO[],
  heroProjectIds: string | null | undefined,
  limit = 3
): ProjectDTO[] {
  const byId = new Map(published.map((p) => [p.id, p]));
  const chosen = parseJsonStringArray(heroProjectIds)
    .map((id) => byId.get(id))
    .filter((p): p is ProjectDTO => Boolean(p))
    .slice(0, limit);
  return chosen.length ? chosen : published.slice(0, limit);
}

/** Single-row site settings (with defaults if the row is missing). */
export async function getSiteConfig() {
  const config = await db.siteConfig.findFirst();
  if (config) return config;
  return {
    id: 1,
    siteName: "Arovyx Studio",
    ownerName: "Arovyx Studio Owner",
    tagline: "Building apps, games, packages & plugins.",
    bio: "",
    email: "",
    githubUrl: "",
    linkedinUrl: "",
    instagramUrl: "",
    avatarUrl: "",
    resumeUrl: "",
    heroProjectIds: "[]",
    updatedAt: new Date(),
  };
}
