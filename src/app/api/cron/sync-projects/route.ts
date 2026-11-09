import { NextRequest } from "next/server";
import { timingSafeEqualStr } from "@/lib/auth";
import { isAdminRequest, jsonError, jsonOk } from "@/lib/api";
import { syncAllProjects } from "@/lib/sync";

// one fetch per project (15 s timeout each, 3 at a time) — allow the full budget
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/sync-projects — daily refresh of every project's fetched
 * facts (stars, installs, version, media). Scheduled in vercel.json for
 * 23:30 UTC = 5:00 AM IST.
 *
 * Lives outside /api/admin so the session middleware doesn't block Vercel
 * Cron, which authenticates with `Authorization: Bearer $CRON_SECRET`.
 * A logged-in admin can also open it to run a sync by hand.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  const fromCron = Boolean(secret) && timingSafeEqualStr(header, `Bearer ${secret}`);

  if (!fromCron && !(await isAdminRequest(req))) {
    return jsonError(401, "Unauthorized");
  }

  const summary = await syncAllProjects();
  console.log(
    `[sync-projects] checked ${summary.checked}, updated ${summary.updated.length}, failed ${summary.failed.length} in ${summary.durationMs}ms`,
    JSON.stringify({ updated: summary.updated, failed: summary.failed })
  );
  return jsonOk({ ...summary });
}
