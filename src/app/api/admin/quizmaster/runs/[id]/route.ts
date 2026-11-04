import { jsonError, jsonOk } from "@/lib/api";
import { getSession } from "@/lib/session";
import { errorResponse } from "@/lib/quizmaster/http";
import { runDetail } from "@/lib/quizmaster/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/quizmaster/runs/{id}?after=ISO — the run, its steps and new log lines. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  if (!(await getSession())) return jsonError(401, "Unauthorized");
  try {
    const afterParam = new URL(req.url).searchParams.get("after");
    const after = afterParam ? new Date(afterParam) : undefined;
    const detail = await runDetail(params.id, after && !Number.isNaN(after.getTime()) ? after : undefined);
    if (!detail) return jsonError(404, "Run not found.");
    return jsonOk(detail);
  } catch (err) {
    return errorResponse(err);
  }
}
