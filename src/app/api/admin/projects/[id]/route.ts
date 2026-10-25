import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  parseJsonStringArray,
  projectUpdateSchema,
  serializeProject,
  toProjectDTO,
  type Category,
  type ProjectUpdate,
  type Status,
} from "@/lib/validators";
import { uniqueSlug } from "@/lib/slug";
import { getSession } from "@/lib/session";
import {
  jsonError,
  jsonOk,
  revalidatePublicPages,
  zodErrorDetails,
  zodErrorMessage,
} from "@/lib/api";

/** Stored row shape needed to merge a partial update. */
interface StoredRow {
  category: string;
  status: string;
  tags: string;
  techStack: string;
  features: string;
}

/**
 * Apply a validated patch to the stored row. Arrays are re-encoded as JSON
 * columns only when the patch touches one of them (untouched arrays keep
 * their stored encoding verbatim).
 */
function applyUpdate(existing: StoredRow, patch: Omit<ProjectUpdate, "slug">) {
  const { tags, techStack, features, category, status, ...scalars } = patch;
  const update: Record<string, unknown> = { ...scalars };

  if (category !== undefined) update.category = category;
  if (status !== undefined) update.status = status;

  if (tags !== undefined || techStack !== undefined || features !== undefined) {
    Object.assign(
      update,
      serializeProject({
        category: (category ?? existing.category) as Category,
        status: (status ?? existing.status) as Status,
        tags: tags ?? parseJsonStringArray(existing.tags),
        techStack: techStack ?? parseJsonStringArray(existing.techStack),
        features: features ?? parseJsonStringArray(existing.features),
      })
    );
  }

  return update;
}

/** GET /api/admin/projects/[id] — one project, drafts included. */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) return jsonError(401, "Unauthorized");

  const row = await db.project.findUnique({ where: { id: params.id } });
  if (!row) return jsonError(404, "Project not found.");

  return jsonOk({ project: toProjectDTO(row) });
}

/**
 * PATCH /api/admin/projects/[id] — partial update.
 * Slug may be overridden; when it changes, uniqueness is enforced here.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) return jsonError(401, "Unauthorized");

  const existing = await db.project.findUnique({ where: { id: params.id } });
  if (!existing) return jsonError(404, "Project not found.");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Request body must be valid JSON.");
  }

  const parsed = projectUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, zodErrorMessage(parsed.error), zodErrorDetails(parsed.error));
  }

  const patch = parsed.data;
  const { slug: requestedSlug, ...fields } = patch;

  let slug = existing.slug;
  if (requestedSlug !== undefined && requestedSlug !== existing.slug) {
    slug = await uniqueSlug(requestedSlug, existing.id);
  }

  const row = await db.project.update({
    where: { id: existing.id },
    data: { slug, ...applyUpdate(existing, fields) },
  });

  const project = toProjectDTO(row);
  revalidatePublicPages([`/projects/${project.slug}`, `/projects/${existing.slug}`]);

  return jsonOk({ project });
}

/** DELETE /api/admin/projects/[id] — remove and revalidate the public pages. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) return jsonError(401, "Unauthorized");

  const existing = await db.project.findUnique({ where: { id: params.id } });
  if (!existing) return jsonError(404, "Project not found.");

  await db.project.delete({ where: { id: existing.id } });
  revalidatePublicPages([`/projects/${existing.slug}`]);

  return jsonOk({ message: `“${existing.title}” deleted.`, id: existing.id });
}
