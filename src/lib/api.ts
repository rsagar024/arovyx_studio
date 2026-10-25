/**
 * Shared helpers for API routes (spec §7):
 * - consistent JSON success/error shapes
 * - Zod issue → field-details mapping
 * - simple IP/time-window rate limiting
 * - admin-session detection for public routes
 * - public page revalidation after mutations
 */

import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

/* ------------------------------------------------------------------ */
/* Response shapes                                                     */
/*                                                                     */
/*   success → { ok: true,  ...payload }                               */
/*   error   → { ok: false, error: string, details?: Record<...> }     */
/* ------------------------------------------------------------------ */

type JsonInit = { status?: number; headers?: Record<string, string> };

export function jsonOk(data: Record<string, unknown> = {}, init?: JsonInit) {
  return NextResponse.json(
    { ok: true, ...data },
    {
      status: init?.status ?? 200,
      headers: { "Cache-Control": "no-store", ...init?.headers },
    }
  );
}

export function jsonError(
  status: number,
  error: string,
  details?: Record<string, string>,
  headers?: Record<string, string>
) {
  return NextResponse.json(
    { ok: false, error, ...(details && Object.keys(details).length ? { details } : {}) },
    { status, headers: { "Cache-Control": "no-store", ...headers } }
  );
}

/* ------------------------------------------------------------------ */
/* Zod error mapping                                                   */
/* ------------------------------------------------------------------ */

/** `{ "email": "Invalid email address", ... }` — first message wins per field. */
export function zodErrorDetails(err: ZodError): Record<string, string> {
  const details: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    if (!details[key]) details[key] = issue.message;
  }
  return details;
}

/** Human-readable message for the first issue (used as the top-level `error`). */
export function zodErrorMessage(err: ZodError): string {
  const first = err.issues[0];
  if (!first) return "Validation failed.";
  const key = first.path.join(".");
  return key ? `${key}: ${first.message}` : first.message;
}

/* ------------------------------------------------------------------ */
/* Auth probe (public routes that vary by admin status)                */
/* ------------------------------------------------------------------ */

/** True when the request carries a valid admin session cookie. */
export async function isAdminRequest(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  return (await verifySession(token)) !== null;
}

/* ------------------------------------------------------------------ */
/* Rate limiting (IP / time-window, in-memory)                         */
/* ------------------------------------------------------------------ */

export const RATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
export const RATE_MAX = 5; // 5 submissions per window per IP

interface RateStore {
  hits: Map<string, number[]>;
}

// Survive dev hot-reload (same pattern as the Prisma singleton).
const globalStore = globalThis as unknown as { __arovyxRateLimit?: RateStore };
const store: RateStore = globalStore.__arovyxRateLimit ?? { hits: new Map() };
globalStore.__arovyxRateLimit = store;

const MAX_KEYS = 1000;

export interface RateResult {
  ok: boolean;
  retryAfterSeconds: number;
}

/**
 * Sliding-window rate limiter. Records a hit only when under the limit;
 * returns how long the caller should wait when over it.
 */
export function rateLimit(
  key: string,
  opts?: { windowMs?: number; max?: number }
): RateResult {
  const windowMs = opts?.windowMs ?? RATE_WINDOW_MS;
  const max = opts?.max ?? RATE_MAX;
  const now = Date.now();

  const timestamps = (store.hits.get(key) ?? []).filter((t) => now - t < windowMs);

  if (timestamps.length >= max) {
    const oldest = timestamps[0]!;
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    };
  }

  timestamps.push(now);
  store.hits.set(key, timestamps);

  // Opportunistic cleanup so the map never grows unbounded.
  if (store.hits.size > MAX_KEYS) {
    for (const [k, times] of store.hits) {
      if (times.every((t) => now - t >= windowMs)) store.hits.delete(k);
    }
  }

  return { ok: true, retryAfterSeconds: 0 };
}

/** Best-effort client IP: first `x-forwarded-for` hop, then `x-real-ip`. */
export function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;
  return req.headers.get("x-real-ip") ?? "unknown";
}

/* ------------------------------------------------------------------ */
/* Cache revalidation after mutations                                  */
/* ------------------------------------------------------------------ */

/**
 * Revalidate the public pages so DB mutations show up without a restart.
 * Pass extra paths (e.g. `/projects/my-slug`) when a single page changes.
 */
export function revalidatePublicPages(extraPaths: string[] = []) {
  for (const path of ["/", "/projects", ...extraPaths]) {
    revalidatePath(path);
  }
}
