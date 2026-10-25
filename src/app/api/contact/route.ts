import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { contactInputSchema } from "@/lib/validators";
import {
  clientIp,
  jsonError,
  jsonOk,
  rateLimit,
  revalidatePublicPages,
  zodErrorDetails,
  zodErrorMessage,
} from "@/lib/api";

/**
 * POST /api/contact (spec §7) — public contact-form submission.
 *
 * Body: { name, email, subject, message } (validated with Zod).
 * Rate limited per IP (5 per 10-minute sliding window).
 * Writes a `ContactMessage` row with `isRead: false`.
 *
 * Response: { ok: true, message, id } | { ok: false, error, details? }
 */
export async function POST(req: NextRequest) {
  // 1. Parse JSON body (malformed body → 400, never a 500).
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Request body must be valid JSON.");
  }

  // 2. Zod validation → 400 with per-field details.
  const parsed = contactInputSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, zodErrorMessage(parsed.error), zodErrorDetails(parsed.error));
  }

  // 3. Rate limit per IP (checked after validation so bad input doesn't
  //    consume a caller's quota).
  const limit = rateLimit(`contact:${clientIp(req)}`);
  if (!limit.ok) {
    return jsonError(
      429,
      `Too many messages from your network. Try again in ${limit.retryAfterSeconds}s.`,
      undefined,
      { "Retry-After": String(limit.retryAfterSeconds) }
    );
  }

  // 4. Persist + refresh any public page cache.
  const created = await db.contactMessage.create({ data: parsed.data });
  revalidatePublicPages();

  return jsonOk(
    { message: "Message sent — talk soon!", id: created.id },
    { status: 201 }
  );
}
