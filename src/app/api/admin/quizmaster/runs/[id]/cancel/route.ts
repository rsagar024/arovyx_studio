import { jsonError, jsonOk } from "@/lib/api";
import { getSession } from "@/lib/session";
import { errorResponse } from "@/lib/quizmaster/http";
import { cancelRun, runDto } from "@/lib/quizmaster/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/admin/quizmaster/runs/{id}/cancel — stops a running run after its current unit. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  if (!(await getSession())) return jsonError(401, "Unauthorized");
  try {
    const run = await cancelRun(params.id);
    if (!run) return jsonError(404, "Run not found.");
    return jsonOk({ run: runDto(run) });
  } catch (err) {
    return errorResponse(err);
  }
}
