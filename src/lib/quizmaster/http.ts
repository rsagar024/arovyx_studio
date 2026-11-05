/** Error → response mapping shared by the Quiz Master API routes. */
import "server-only";
import { jsonError } from "@/lib/api";
import { RunNotFound } from "./engine";
import { FirebaseNoPermission, FirebaseNotConfigured } from "./firebase";
import { cleanLine } from "./log";
import { BadRequest, Conflict } from "./service";

export function errorResponse(err: unknown) {
  if (err instanceof BadRequest) return jsonError(400, err.message);
  if (err instanceof Conflict) return jsonError(409, err.message, err.runId ? { runId: err.runId } : undefined);
  if (err instanceof RunNotFound) return jsonError(404, err.message);
  if (err instanceof FirebaseNotConfigured || err instanceof FirebaseNoPermission) return jsonError(503, err.message);
  console.error("[quizmaster]", err);
  const message = err instanceof Error ? cleanLine(err.message) : "Unexpected error.";
  return jsonError(500, `Quiz Master: ${message}`);
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new BadRequest("Request body must be valid JSON.");
  }
}
