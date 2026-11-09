/** Error → response mapping shared by the Color Tap API routes. */
import "server-only";
import { jsonError, quotaMessage } from "@/lib/api";
import { BadRequest, Conflict } from "./cleanup";
import { RunNotFound } from "./engine";
import { ColorTapNotConfigured } from "./firebase";

export function errorResponse(err: unknown) {
  if (err instanceof BadRequest) return jsonError(400, err.message);
  if (err instanceof Conflict) return jsonError(409, err.message, err.runId ? { runId: err.runId } : undefined);
  if (err instanceof RunNotFound) return jsonError(404, err.message);
  if (err instanceof ColorTapNotConfigured) return jsonError(503, err.message);
  const quota = quotaMessage(err);
  if (quota) return jsonError(503, `Color Tap: ${quota}`);
  console.error("[colortap]", err);
  return jsonError(500, `Color Tap: ${err instanceof Error ? err.message : "Unexpected error."}`);
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new BadRequest("Request body must be valid JSON.");
  }
}
