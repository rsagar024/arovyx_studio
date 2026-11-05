import { jsonError, jsonOk } from "@/lib/api";
import { getSession } from "@/lib/session";
import { errorResponse } from "@/lib/colortap/http";
import { colorTap } from "@/lib/colortap/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/colortap/runs/{id}?after=ISO — the run and its new log lines. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (!(await getSession())) return jsonError(401, "Unauthorized");
  try {
    const afterParam = new URL(req.url).searchParams.get("after");
    const after = afterParam ? new Date(afterParam) : undefined;
    const detail = await colorTap.runDetail(params.id, after && !Number.isNaN(after.getTime()) ? after : undefined);
    if (!detail) return jsonError(404, "Run not found.");
    return jsonOk(detail);
  } catch (err) {
    return errorResponse(err);
  }
}
