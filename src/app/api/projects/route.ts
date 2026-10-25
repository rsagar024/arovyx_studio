import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { toProjectDTO, categorySchema } from "@/lib/validators";
import { isAdminRequest, jsonError, jsonOk } from "@/lib/api";

/**
 * GET /api/projects (spec §7) — public project listing.
 *
 * Query params:
 *   - `category` — APP | GAME | PACKAGE | PLUGIN (case-insensitive; invalid → 400)
 *   - `q`        — free-text search across title, shortDescription, tags, techStack
 *
 * Published projects only, unless the request carries a valid admin
 * session cookie (then drafts are included too).
 *
 * Response: { ok: true, count, projects, filters: { category, q } }
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawCategory = searchParams.get("category");
  const q = (searchParams.get("q") ?? "").trim();

  let category: "APP" | "GAME" | "PACKAGE" | "PLUGIN" | null = null;
  if (rawCategory) {
    const parsed = categorySchema.safeParse(rawCategory.toUpperCase());
    if (!parsed.success) {
      return jsonError(
        400,
        `Unknown category "${rawCategory}". Expected one of: APP, GAME, PACKAGE, PLUGIN.`,
        { category: `Unknown category "${rawCategory}"` }
      );
    }
    category = parsed.data;
  }

  const isAdmin = await isAdminRequest(req);

  const rows = await db.project.findMany({
    where: {
      ...(isAdmin ? {} : { isPublished: true }),
      ...(category ? { category } : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  let projects = rows.map(toProjectDTO);

  if (q) {
    const needle = q.toLowerCase();
    projects = projects.filter(
      (p) =>
        p.title.toLowerCase().includes(needle) ||
        p.shortDescription.toLowerCase().includes(needle) ||
        p.tags.some((tag) => tag.toLowerCase().includes(needle)) ||
        p.techStack.some((tech) => tech.toLowerCase().includes(needle))
    );
  }

  return jsonOk({
    count: projects.length,
    projects,
    filters: { category: category ?? "ALL", q },
  });
}
