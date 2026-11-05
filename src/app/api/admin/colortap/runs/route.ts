import { z } from "zod";
import { jsonError, jsonOk, zodErrorDetails, zodErrorMessage } from "@/lib/api";
import { getSession } from "@/lib/session";
import { DEFAULT_DAYS, MIN_DAYS } from "@/lib/colortap/guestCleanup";
import { errorResponse, readJson } from "@/lib/colortap/http";
import { colorTap } from "@/lib/colortap/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.discriminatedUnion("kind", [
  // The open tab found a cleanup due (refused unless it is).
  z.object({ kind: z.literal("scheduled") }),
  z.object({
    kind: z.literal("guest_cleanup"),
    // The 30-day floor is enforced here and again in cleanup.ts and guestCleanup.ts.
    days: z.number().int().min(MIN_DAYS, `days must be at least ${MIN_DAYS}`).default(DEFAULT_DAYS),
    dryRun: z.boolean().default(true),
  }),
]);

/**
 * POST /api/admin/colortap/runs — starts a run and returns `runId`.
 * 409 (with `details.runId`) while another run holds the lock; a run whose
 * lease ran out is returned for resuming (`resumed: true`).
 */
export async function POST(req: Request) {
  if (!(await getSession())) return jsonError(401, "Unauthorized");
  try {
    const parsed = bodySchema.safeParse(await readJson(req));
    if (!parsed.success) return jsonError(400, zodErrorMessage(parsed.error), zodErrorDetails(parsed.error));
    const body = parsed.data;
    const result =
      body.kind === "scheduled" ? await colorTap.startScheduled() : await colorTap.startCleanup(body.days, body.dryRun);
    return jsonOk(result, { status: result.created ? 201 : 200 });
  } catch (err) {
    return errorResponse(err);
  }
}
