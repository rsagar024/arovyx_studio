import { listProjects, updateProject, type Project } from "@/lib/store";
import { revalidatePublicPages } from "@/lib/api";
import { fetchProjectData } from "@/lib/fetchers";
import { parseJsonStringArray } from "@/lib/validators";

/** Projects fetched at once — polite to GitHub / Play / npm, fits the time limit. */
const CONCURRENCY = 3;

export type SyncResult =
  | { slug: string; changed: string[] }
  | { slug: string; error: string };

export interface SyncSummary {
  checked: number;
  updated: Array<{ slug: string; changed: string[] }>;
  failed: Array<{ slug: string; error: string }>;
  durationMs: number;
}

/**
 * Re-fetch one project's source link and update the facts that changed:
 * stars, installs, version, publisher, icon, banner and screenshots.
 * AI-written text (title, descriptions, features, tags) is never touched,
 * and a value the fetch couldn't get never overwrites a stored one.
 */
export async function syncProject(row: Project): Promise<SyncResult> {
  const fetched = await fetchProjectData(row.sourceUrl);
  const problem = fetched.warnings.find((w) => w.startsWith("Fetch problem:"));
  if (problem) return { slug: row.slug, error: problem.replace(/^Fetch problem:\s*/, "") };

  const patch: Partial<Project> = {};
  const set = <K extends keyof Project>(field: K, value: Project[K] | null | undefined) => {
    if (value == null || value === "" || value === row[field]) return;
    patch[field] = value;
  };

  set("stars", fetched.stars);
  set("downloads", fetched.downloads);
  set("version", fetched.version);
  set("publisher", fetched.publisher);
  set("imageUrl", fetched.iconUrl);
  set("bannerUrl", fetched.bannerUrl);

  if (fetched.screenshots.length > 0) {
    const stored = parseJsonStringArray(row.screenshots);
    if (JSON.stringify(stored) !== JSON.stringify(fetched.screenshots)) {
      patch.screenshots = JSON.stringify(fetched.screenshots);
    }
  }

  const changed = Object.keys(patch);
  if (changed.length > 0) {
    await updateProject(row.id, patch);
  }
  return { slug: row.slug, changed };
}

/** Sync every project (drafts included) and refresh the affected public pages. */
export async function syncAllProjects(): Promise<SyncSummary> {
  const started = Date.now();
  const rows = (await listProjects()).reverse(); // oldest first
  const results: SyncResult[] = [];

  // small worker pool: each worker takes the next project until none are left
  let next = 0;
  const worker = async () => {
    while (next < rows.length) {
      const row = rows[next++]!;
      try {
        results.push(await syncProject(row));
      } catch (err) {
        results.push({ slug: row.slug, error: err instanceof Error ? err.message : String(err) });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker));

  const updated = results.filter(
    (r): r is { slug: string; changed: string[] } => "changed" in r && r.changed.length > 0
  );
  const failed = results.filter((r): r is { slug: string; error: string } => "error" in r);

  if (updated.length > 0) {
    revalidatePublicPages(updated.map((r) => `/projects/${r.slug}`));
  }

  return { checked: rows.length, updated, failed, durationMs: Date.now() - started };
}
