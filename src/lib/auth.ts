/**
 * Admin auth (spec §6): constant-time admin-key verification and a
 * signed, HTTP-only session cookie.
 *
 * Built on Web Crypto so the same code runs in Node (API routes) and the
 * Edge runtime (middleware).
 */

export const SESSION_COOKIE = "arovyx_admin_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours
export const SESSION_ALGO = "HS256";

export interface AdminSession {
  sub: "admin";
  iat: number;
  exp: number;
}

const encoder = new TextEncoder();

/* ------------------------------------------------------------------ */
/* Encoding helpers                                                    */
/* ------------------------------------------------------------------ */

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toBase64Url(input: string): string {
  return base64UrlEncode(encoder.encode(input));
}

function fromBase64Url(input: string): string {
  return new TextDecoder().decode(base64UrlDecode(input));
}

/** Constant-time string comparison (length-independent). */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const bytesA = encoder.encode(a);
  const bytesB = encoder.encode(b);
  const length = Math.max(bytesA.length, bytesB.length);
  let diff = bytesA.length ^ bytesB.length;
  for (let i = 0; i < length; i++) {
    diff |= (bytesA[i] ?? 0) ^ (bytesB[i] ?? 0);
  }
  return diff === 0;
}

async function hmacSha256(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return base64UrlEncode(new Uint8Array(signature));
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ------------------------------------------------------------------ */
/* Admin key                                                           */
/* ------------------------------------------------------------------ */

/**
 * Verify the entered admin key against ADMIN_SECRET_KEY in constant time.
 * Both sides are hashed first so the comparison never leaks the key's length.
 */
export async function verifyAdminKey(candidate: string): Promise<boolean> {
  const expected = process.env.ADMIN_SECRET_KEY;
  if (!candidate || !expected) return false;
  const [a, b] = await Promise.all([sha256Hex(candidate), sha256Hex(expected)]);
  return timingSafeEqualStr(a, b);
}

/* ------------------------------------------------------------------ */
/* Session tokens                                                      */
/* ------------------------------------------------------------------ */

export async function signSession(
  session: Omit<AdminSession, "iat" | "exp"> = { sub: "admin" },
  ttlSeconds: number = SESSION_TTL_SECONDS
): Promise<string> {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret) throw new Error("ADMIN_JWT_SECRET is not set");

  const now = Math.floor(Date.now() / 1000);
  const payload: AdminSession = { ...session, iat: now, exp: now + ttlSeconds };

  const header = toBase64Url(JSON.stringify({ alg: SESSION_ALGO, typ: "JWT" }));
  const body = toBase64Url(JSON.stringify(payload));
  const message = `${header}.${body}`;
  const signature = await hmacSha256(secret, message);
  return `${message}.${signature}`;
}

export async function verifySession(token: string | undefined | null): Promise<AdminSession | null> {
  if (!token) return null;
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts as [string, string, string];

  const expected = await hmacSha256(secret, `${header}.${body}`);
  if (!timingSafeEqualStr(signature, expected)) return null;

  try {
    const headerJson = JSON.parse(fromBase64Url(header)) as { alg?: string };
    if (headerJson.alg !== SESSION_ALGO) return null;

    const payload = JSON.parse(fromBase64Url(body)) as AdminSession;
    if (payload.sub !== "admin") return null;
    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
