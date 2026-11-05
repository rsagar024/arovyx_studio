import { jsonError, jsonOk } from "@/lib/api";
import { getSession } from "@/lib/session";
import { errorResponse } from "@/lib/colortap/http";
import { colorTap } from "@/lib/colortap/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// One tick works for at most 240 s (TICK_BUDGET_MS), then saves and returns.
export const maxDuration = 300;

/**
 * POST /api/admin/colortap/runs/{id}/tick — one bounded slice of work.
 * Response: { status, done, busy?, pages, counts }. `busy` means another tab's
 * tick is in flight: wait and call again.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  if (!(await getSession())) return jsonError(401, "Unauthorized");
  try {
    return jsonOk({ ...(await colorTap.tickRun(params.id)) });
  } catch (err) {
    return errorResponse(err);
  }
}
