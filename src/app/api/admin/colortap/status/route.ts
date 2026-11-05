import { z } from "zod";
import { jsonError, jsonOk, zodErrorDetails, zodErrorMessage } from "@/lib/api";
import { getSession } from "@/lib/session";
import { MIN_DAYS } from "@/lib/colortap/guestCleanup";
import { errorResponse, readJson } from "@/lib/colortap/http";
import { colorTap } from "@/lib/colortap/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/admin/colortap/status — settings, key check, active and recent runs.
 * PATCH — { action: "auto", enabled } · { action: "days", days: 30+ }.
 */
export async function GET() {
  if (!(await getSession())) return jsonError(401, "Unauthorized");
  try {
    return jsonOk(await colorTap.status());
  } catch (err) {
    return errorResponse(err);
  }
}

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("auto"), enabled: z.boolean() }),
  z.object({ action: z.literal("days"), days: z.number().int().min(MIN_DAYS, `days must be at least ${MIN_DAYS}`) }),
]);

export async function PATCH(req: Request) {
  if (!(await getSession())) return jsonError(401, "Unauthorized");
  try {
    const parsed = patchSchema.safeParse(await readJson(req));
    if (!parsed.success) return jsonError(400, zodErrorMessage(parsed.error), zodErrorDetails(parsed.error));
    await colorTap.changeSchedule(parsed.data);
    return jsonOk(await colorTap.status());
  } catch (err) {
    return errorResponse(err);
  }
}
