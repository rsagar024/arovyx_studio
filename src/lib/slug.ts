import { db } from "@/lib/db";

/** Convert any string to a URL-safe slug. */
export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");

  return slug || "project";
}

/**
 * Generate a slug that is unique across the Project table.
 * If `excludeId` is given, that project's own slug is allowed to collide
 * (used when editing an existing project without changing its slug).
 */
export async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root = slugify(base);
  let candidate = root;
  let counter = 2;

  // Bounded loop — never hangs even with many collisions.
  for (let i = 0; i < 200; i++) {
    const existing = await db.project.findUnique({ where: { slug: candidate } });
    if (!existing || existing.id === excludeId) return candidate;
    candidate = `${root}-${counter++}`;
  }

  return `${root}-${Date.now()}`;
}
