import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { messageBulkDeleteSchema } from "@/lib/validators";
import { getSession } from "@/lib/session";
import { jsonError, jsonOk, zodErrorDetails, zodErrorMessage } from "@/lib/api";

/**
 * GET /api/admin/messages (spec §7) — contact inbox, newest first,
 * with an unread count for the header badge.
 *
 * Response: { ok: true, count, unreadCount, messages }
 */
export async function GET() {
  const session = await getSession();
  if (!session) return jsonError(401, "Unauthorized");

  const [messages, unreadCount] = await Promise.all([
    db.contactMessage.findMany({ orderBy: { createdAt: "desc" } }),
    db.contactMessage.count({ where: { isRead: false } }),
  ]);

  return jsonOk({ count: messages.length, unreadCount, messages });
}

/**
 * DELETE /api/admin/messages (spec §7) — bulk delete.
 * Body: { ids: string[] } (1–100). Unknown ids are ignored.
 *
 * Response: { ok: true, deleted }
 */
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return jsonError(401, "Unauthorized");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Request body must be valid JSON.");
  }

  const parsed = messageBulkDeleteSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, zodErrorMessage(parsed.error), zodErrorDetails(parsed.error));
  }

  const { count } = await db.contactMessage.deleteMany({
    where: { id: { in: parsed.data.ids } },
  });
  return jsonOk({ deleted: count });
}
