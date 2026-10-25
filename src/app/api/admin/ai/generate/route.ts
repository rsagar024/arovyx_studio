import { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { aiGenerateSchema } from "@/lib/validators";
import {
  FetchError,
  describeSource,
  fetchProjectData,
  hasContent,
} from "@/lib/fetchers";
import { NIMError, generateProjectDetails, nimHttpStatus } from "@/lib/nim";
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
 * POST /api/admin/ai/generate (spec §6.1 / §7) — the auto-fill pipeline:
 * fetch the link (Phase 2 `fetchProjectData`) → NVIDIA NIM generates the
 * project draft (`generateProjectDetails`).
 *
 * Body: { url, category?, extraInstruction?, fetchedData? } (aiGenerateSchema;
 * category omitted = AUTO, the AI decides). When `fetchedData` (from a
 * previous response) is echoed back, the fetch phase is skipped so
 * "Regenerate" re-runs the AI on exactly the same content.
 *
 * Response: { ok: true, project, source, sourceLabel, warnings, stars, fetched }
 * Errors:   400 validation · 401 no session · 422 fetch/no-content ·
 *           429 NIM rate limit · 502/503/504 NIM failures (clear message)
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

  const parsed = aiGenerateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, zodErrorMessage(parsed.error), zodErrorDetails(parsed.error));
  }

  const { url, category, extraInstruction, fetchedData } = parsed.data;

  // Step 1 — fetch phase (skipped when the client echoes prior fetch data).
  let fetched;
  if (fetchedData) {
    fetched = fetchedData;
  } else {
    try {
      fetched = await fetchProjectData(url);
    } catch (err) {
      if (err instanceof FetchError) {
        return jsonError(422, `Couldn't fetch the link: ${err.message}`, { url });
      }
      return jsonError(422, "Couldn't fetch the link. Check the URL and try again.", { url });
    }
  }

  if (!hasContent(fetched)) {
    const fetchProblem = fetched.warnings.find((w) => w.startsWith("Fetch problem:"));
    return jsonError(
      422,
      fetchProblem
        ? `Couldn't fetch the link: ${fetchProblem.replace(/^Fetch problem:\s*/, "")}`
        : "Fetched the link, but there wasn't enough content to generate a project from it. You can add the details manually.",
      { url, warnings: fetched.warnings.join(" | ") }
    );
  }

  // Step 2 — AI phase.
  try {
    const project = await generateProjectDetails(fetched, {
      ...(category ? { category } : {}),
      ...(extraInstruction ? { extraInstruction } : {}),
    });

    return jsonOk({
      project,
      source: fetched.source,
      sourceLabel: describeSource(fetched),
      warnings: fetched.warnings,
      stars: fetched.stars,
      fetched,
    });
  } catch (err) {
    if (err instanceof NIMError) {
      return jsonError(nimHttpStatus(err.code), err.message, { code: err.code });
    }
    return jsonError(502, "AI generation failed unexpectedly. Please retry.", {
      code: "unknown",
    });
  }
}
