import { NextRequest } from "next/server";
import { loginInputSchema } from "@/lib/validators";
import { verifyAdminKey } from "@/lib/auth";
import { createSession } from "@/lib/session";
import { clientIp, jsonError, jsonOk, rateLimit } from "@/lib/api";

/**
 * POST /api/admin/login (spec §7) — verify the admin key and issue a
 * signed, HTTP-only session cookie.
 *
 * Body: { key: string }. The key is compared in constant time against
 * ADMIN_SECRET_KEY. Login attempts are rate limited per IP (10 per
 * 15-minute window) to slow brute force.
 *
 * Response: { ok: true, message } | { ok: false, error }
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Request body must be valid JSON.");
  }

  const parsed = loginInputSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Admin key is required.");
  }

  const limit = rateLimit(`login:${clientIp(req)}`, {
    windowMs: 15 * 60 * 1000,
    max: 10,
  });
  if (!limit.ok) {
    return jsonError(
      429,
      `Too many login attempts. Try again in ${limit.retryAfterSeconds}s.`,
      undefined,
      { "Retry-After": String(limit.retryAfterSeconds) }
    );
  }

  if (!(await verifyAdminKey(parsed.data.key))) {
    return jsonError(401, "Invalid admin key.");
  }

  await createSession();
  return jsonOk({ message: "Welcome back." });
}
