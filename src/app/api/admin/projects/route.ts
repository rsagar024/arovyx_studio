import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  projectInputSchema,
  serializeProject,
  toProjectDTO,
} from "@/lib/validators";
import { uniqueSlug } from "@/lib/slug";
import { getSession } from "@/lib/session";
import { jsonError, jsonOk, zodErrorDetails, zodErrorMessage } from "@/lib/api";

/**
 * GET /api/admin/projects (spec §7) — list ALL projects (drafts included),
 * most recently updated first.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return jsonError(401, "Unauthorized");

  const rows = await db.project.findMany({ orderBy: { updatedAt: "desc" } });
  const projects = rows.map(toProjectDTO);
  return jsonOk({ count: projects.length, projects });
}

/**
 * POST /api/admin/projects (spec §7) — create a project.
 * Slug is auto-generated from the title and made unique (`my-app`, `my-app-2`, …).
 *
 * Body: ProjectInput (Zod). Response: { ok: true, project }
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return jsonError(401, "Unauthorized");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Request body must be valid JSON.");
  }

  const parsed = projectInputSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, zodErrorMessage(parsed.error), zodErrorDetails(parsed.error));
  }

  const input = parsed.data;
  const slug = await uniqueSlug(input.title);
  const row = await db.project.create({
    data: { slug, ...input, ...serializeProject(input) },
  });

  return jsonOk({ project: toProjectDTO(row) }, { status: 201 });
}
