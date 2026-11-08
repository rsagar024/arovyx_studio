import { NextRequest } from "next/server";
import { saveSiteConfig } from "@/lib/store";
import { settingsInputSchema } from "@/lib/validators";
import { getSession } from "@/lib/session";
import { getSiteConfig } from "@/lib/projects";
import {
  jsonError,
  jsonOk,
  revalidatePublicPages,
  zodErrorDetails,
  zodErrorMessage,
} from "@/lib/api";

/**
 * GET /api/admin/settings (spec §7) — current site settings (defaults if
 * the row has never been written).
 */
export async function GET() {
  const session = await getSession();
  if (!session) return jsonError(401, "Unauthorized");

  const settings = await getSiteConfig();
  return jsonOk({ settings });
}

/**
 * PATCH /api/admin/settings (spec §7) — partial update of the single
 * SiteConfig row, then revalidate the public pages so the change is
 * reflected immediately.
 */
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return jsonError(401, "Unauthorized");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Request body must be valid JSON.");
  }

  const parsed = settingsInputSchema.partial().safeParse(body);
  if (!parsed.success) {
    return jsonError(400, zodErrorMessage(parsed.error), zodErrorDetails(parsed.error));
  }

  // heroProjectIds / featuredProjectIds are JSON-encoded string[] columns
  const { heroProjectIds, featuredProjectIds, ...rest } = parsed.data;
  const data = {
    ...rest,
    ...(heroProjectIds !== undefined ? { heroProjectIds: JSON.stringify(heroProjectIds) } : {}),
    ...(featuredProjectIds !== undefined ? { featuredProjectIds: JSON.stringify(featuredProjectIds) } : {}),
  };
  const settings = await saveSiteConfig(data);

  revalidatePublicPages();

  return jsonOk({ settings, message: "Settings saved — public pages refreshed." });
}
