import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { toProjectDTO } from "@/lib/validators";
import { getSession } from "@/lib/session";
import { fetchProjectData } from "@/lib/fetchers";
import { jsonError, jsonOk, revalidatePublicPages } from "@/lib/api";

/**
 * POST /api/admin/projects/[id]/refetch
 * Re-fetch the project's sourceUrl and overwrite the fetched fields on the
 * stored row (title, short description, long description, tags, tech stack,
 * media, publisher, version, stars, downloads). Fields not returned by the
 * fetcher are left untouched. Returns { ok: true, project }.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) return jsonError(401, "Unauthorized");

  const existing = await db.project.findUnique({ where: { id: params.id } });
  if (!existing) return jsonError(404, "Project not found.");

  if (!existing.sourceUrl) {
    return jsonError(400, "This project has no source URL to re-fetch from.");
  }

  let fetched;
  try {
    fetched = await fetchProjectData(existing.sourceUrl);
  } catch (err) {
    return jsonError(422, `Couldn't re-fetch the link: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!fetched.title && !fetched.description && !fetched.readme && !fetched.topics.length) {
    return jsonError(
      422,
      "Re-fetched the link, but there wasn't enough content to update from it."
    );
  }

  const row = await db.project.update({
    where: { id: existing.id },
    data: {
      title: fetched.title ?? existing.title,
      shortDescription: fetched.description ?? existing.shortDescription,
      longDescription:
        fetched.readme ?? fetched.description ?? existing.longDescription,
      ...(fetched.topics.length > 0 ? { tags: JSON.stringify(fetched.topics) } : {}),
      ...(fetched.languages.length > 0
        ? { techStack: JSON.stringify(fetched.languages) }
        : {}),
      ...(fetched.stars != null ? { stars: fetched.stars } : {}),
      ...(fetched.downloads != null ? { downloads: fetched.downloads } : {}),
      ...(fetched.iconUrl ? { imageUrl: fetched.iconUrl } : {}),
      ...(fetched.bannerUrl ? { bannerUrl: fetched.bannerUrl } : {}),
      ...(fetched.screenshots.length > 0
        ? { screenshots: JSON.stringify(fetched.screenshots) }
        : {}),
      ...(fetched.publisher ? { publisher: fetched.publisher } : {}),
      ...(fetched.version ? { version: fetched.version } : {}),
    },
  });

  const project = toProjectDTO(row);
  revalidatePublicPages([`/projects/${project.slug}`]);

  return jsonOk({ project });
}
