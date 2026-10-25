/**
 * Session-cookie helpers for server components and route handlers (spec §6).
 *
 * Kept separate from `lib/auth.ts` so the middleware bundle stays Edge-safe:
 * `next/headers` only works in the Node runtime.
 */

import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  signSession,
  verifySession,
  type AdminSession,
} from "@/lib/auth";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

/** Current admin session for a server component / route handler, or null. */
export async function getSession(): Promise<AdminSession | null> {
  return verifySession(cookies().get(SESSION_COOKIE)?.value);
}

/** Issue a fresh session and set the HTTP-only cookie on the response. */
export async function createSession(): Promise<void> {
  const token = await signSession();
  cookies().set(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_TTL_SECONDS });
}

/** Expire the session cookie (logout). */
export function clearSession(): void {
  cookies().set(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
}
