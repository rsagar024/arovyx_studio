import type { ProjectDTO } from "@/lib/validators";

export interface TechUsage {
  /** Normalised, case-insensitive key ("android"). */
  key: string;
  /** Display label, uppercase ("ANDROID"). */
  label: string;
  /** Number of projects using it. */
  count: number;
}

/**
 * Every tech across the given projects, case-insensitively merged
 * ("Android" and "android" are one entry) and counted once per project.
 * Most used first, then alphabetical.
 */
export function techUsage(projects: ProjectDTO[]): TechUsage[] {
  const counts = new Map<string, number>();
  for (const project of projects) {
    const seen = new Set<string>();
    for (const tech of project.techStack) {
      const key = tech.trim().replace(/\s+/g, " ").toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, label: key.toUpperCase(), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
