import type { NextRequest } from "next/server";

/**
 * GET /api/img?u=<url> — cached pass-through for Play Store artwork.
 *
 * Hot-linking play-lh.googleusercontent.com directly gets visitors
 * rate-limited (HTTP 429) and shows broken images. Proxying lets Vercel's
 * CDN cache each image for a year, so Google sees one request per image.
 * Only Google's image hosts are allowed — this is not an open proxy.
 */
export const runtime = "edge";

const ALLOWED_HOSTS = new Set(["play-lh.googleusercontent.com", "lh3.googleusercontent.com"]);
const FETCH_TIMEOUT_MS = 10_000;

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("u");
  let target: URL;
  try {
    target = new URL(raw ?? "");
  } catch {
    return new Response("Invalid image URL", { status: 400 });
  }
  if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname)) {
    return new Response("Image host not allowed", { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch {
    return new Response("Image fetch failed", { status: 502, headers: { "Cache-Control": "no-store" } });
  }

  const type = upstream.headers.get("content-type") ?? "";
  if (!upstream.ok || !type.startsWith("image/")) {
    // never cache failures (e.g. a transient 429) — the next request retries
    return new Response("Image unavailable", { status: 502, headers: { "Cache-Control": "no-store" } });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
