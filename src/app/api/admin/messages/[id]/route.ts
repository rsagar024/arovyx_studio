import { NextRequest } from "next/server";
import { deleteMessage, getMessage, updateMessage } from "@/lib/store";
import { messageUpdateSchema } from "@/lib/validators";
import { getSession } from "@/lib/session";
import {
  jsonError,
  jsonOk,
  zodErrorDetails,
  zodErrorMessage,
} from "@/lib/api";

/** PATCH /api/admin/messages/[id] — mark read/unread. Body: { isRead } */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) return jsonError(401, "Unauthorized");

  const existing = await getMessage(params.id);
  if (!existing) return jsonError(404, "Message not found.");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Request body must be valid JSON.");
  }

  const parsed = messageUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, zodErrorMessage(parsed.error), zodErrorDetails(parsed.error));
  }

  const message = await updateMessage(existing.id, { isRead: parsed.data.isRead });

  return jsonOk({ message });
}

/** DELETE /api/admin/messages/[id] — remove a message from the inbox. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) return jsonError(401, "Unauthorized");

  const existing = await getMessage(params.id);
  if (!existing) return jsonError(404, "Message not found.");

  await deleteMessage(existing.id);
  return jsonOk({ message: "Message deleted.", id: existing.id });
}
