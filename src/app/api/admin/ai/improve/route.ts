import { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { improveInputSchema } from "@/lib/validators";
import { NIMError, improveDescription, nimHttpStatus } from "@/lib/nim";
import {
  jsonError,
  jsonOk,
  zodErrorDetails,
  zodErrorMessage,
} from "@/lib/api";

// NIM calls can take ~45 s and retry on 429/5xx — allow beyond the
// serverless default (Vercel caps this at the plan maximum).
export const maxDuration = 300;

/**
 * POST /api/admin/ai/improve (spec §8) — the "AI Description Improver":
 * rewrites the short + long description while keeping facts accurate.
 *
 * Body: { url, title, shortDescription, longDescription }
 * Response: { ok: true, shortDescription, longDescription }
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return jsonError(401, "Unauthorized");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Request body must be valid JSON.");
  }

  const parsed = improveInputSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, zodErrorMessage(parsed.error), zodErrorDetails(parsed.error));
  }

  try {
    const improved = await improveDescription(parsed.data);
    return jsonOk({ ...improved });
  } catch (err) {
    if (err instanceof NIMError) {
      return jsonError(nimHttpStatus(err.code), err.message, { code: err.code });
    }
    return jsonError(502, "AI improvement failed unexpectedly. Please retry.", {
      code: "unknown",
    });
  }
}
