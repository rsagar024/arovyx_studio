import { jsonError, jsonOk } from "@/lib/api";
import { getSession } from "@/lib/session";
import { runDto } from "@/lib/colortap/cleanup";
import { errorResponse } from "@/lib/colortap/http";
import { colorTap } from "@/lib/colortap/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/admin/colortap/runs/{id}/cancel — stops a running run after its current page. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  if (!(await getSession())) return jsonError(401, "Unauthorized");
  try {
    const run = await colorTap.cancelRun(params.id);
    if (!run) return jsonError(404, "Run not found.");
    return jsonOk({ run: runDto(run) });
  } catch (err) {
    return errorResponse(err);
  }
}
