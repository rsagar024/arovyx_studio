import { z } from "zod";
import { jsonError, jsonOk, zodErrorDetails, zodErrorMessage } from "@/lib/api";
import { getSession } from "@/lib/session";
import { errorResponse, readJson } from "@/lib/quizmaster/http";
import { changeSchedule, statusPayload } from "@/lib/quizmaster/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/admin/quizmaster/schedule — the countdown, env check, active run
 * and recent runs for the Studio tab.
 * PATCH — { action: "pause" | "resume" | "reset" } · { action: "interval",
 * intervalHours: 11..12 } · { action: "setNext", nextRunAt: ISO } (within 12 h).
 */
export async function GET() {
  if (!(await getSession())) return jsonError(401, "Unauthorized");
  try {
    return jsonOk(await statusPayload());
  } catch (err) {
    return errorResponse(err);
  }
}

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("pause") }),
  z.object({ action: z.literal("resume") }),
  z.object({ action: z.literal("reset") }),
  z.object({ action: z.literal("interval"), intervalHours: z.number().min(11).max(12) }),
  z.object({ action: z.literal("setNext"), nextRunAt: z.string().datetime({ offset: true }) }),
]);

export async function PATCH(req: Request) {
  if (!(await getSession())) return jsonError(401, "Unauthorized");
  try {
    const parsed = patchSchema.safeParse(await readJson(req));
    if (!parsed.success) return jsonError(400, zodErrorMessage(parsed.error), zodErrorDetails(parsed.error));
    await changeSchedule(parsed.data);
    return jsonOk(await statusPayload());
  } catch (err) {
    return errorResponse(err);
  }
}
