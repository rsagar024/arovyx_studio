import { clearSession } from "@/lib/session";
import { jsonOk } from "@/lib/api";

/**
 * POST /api/admin/logout (spec §7) — clear the session cookie.
 * Deliberately reachable without a valid session (middleware exemption)
 * so signing out never fails on an expired token.
 */
export async function POST() {
  clearSession();
  return jsonOk({ message: "Signed out." });
}
