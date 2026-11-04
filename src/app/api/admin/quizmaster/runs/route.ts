import { z } from "zod";
import { jsonError, jsonOk, zodErrorDetails, zodErrorMessage } from "@/lib/api";
import { getSession } from "@/lib/session";
import { ALL_CATEGORIES } from "@/lib/quizmaster/categories";
import { MIN_DAYS } from "@/lib/quizmaster/guestCleanup";
import { errorResponse, readJson } from "@/lib/quizmaster/http";
import { repo, runDto, startCleanup, startManual, startScheduled } from "@/lib/quizmaster/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/admin/quizmaster/runs — the last 30 runs. */
export async function GET() {
  if (!(await getSession())) return jsonError(401, "Unauthorized");
  try {
    return jsonOk({ runs: (await repo.listRuns(30)).map(runDto) });
  } catch (err) {
    return errorResponse(err);
  }
}

const bodySchema = z.discriminatedUnion("kind", [
  // The countdown reached zero (refused unless due), or "Run now".
  z.object({ kind: z.literal("scheduled"), trigger: z.enum(["timer", "now"]) }),
  // The old workflow_dispatch inputs, plus a categories filter.
  z.object({
    kind: z.literal("question_bank"),
    slot: z.enum(["auto", "am", "pm", "extra"]).default("extra"),
    date: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use yyyy-MM-dd")]).optional(),
    force: z.boolean().default(false),
    dryRun: z.boolean().default(false),
    mode: z.enum(["daily", "seed"]).default("daily"),
    confirm: z.string().optional(),
    categories: z.array(z.enum(ALL_CATEGORIES)).optional(),
  }),
  z.object({
    kind: z.literal("guest_cleanup"),
    // The 30-day floor is enforced here and again in guestCleanup.ts.
    days: z.number().int().min(MIN_DAYS, `days must be at least ${MIN_DAYS}`).default(30),
    dryRun: z.boolean().default(true),
  }),
]);

/**
 * POST /api/admin/quizmaster/runs — starts a run and returns `runId`.
 * 409 (with `details.runId`) while another run of the kind holds the lock;
 * a run whose lease ran out is returned for resuming (`resumed: true`).
 */
export async function POST(req: Request) {
  if (!(await getSession())) return jsonError(401, "Unauthorized");
  try {
    const parsed = bodySchema.safeParse(await readJson(req));
    if (!parsed.success) return jsonError(400, zodErrorMessage(parsed.error), zodErrorDetails(parsed.error));
    const body = parsed.data;
    const result =
      body.kind === "scheduled"
        ? await startScheduled(body.trigger)
        : body.kind === "question_bank"
          ? await startManual({ ...body, date: body.date || undefined })
          : await startCleanup(body.days, body.dryRun);
    return jsonOk(result, { status: result.created ? 201 : 200 });
  } catch (err) {
    return errorResponse(err);
  }
}
