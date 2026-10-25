import { ImageResponse } from "next/og";

/**
 * GET /og — default 1200×630 social card (Open Graph / Twitter).
 * Uses the built-in font; no network fetches. Pages reference it via
 * DEFAULT_OG_IMAGE in lib/seo.ts.
 *
 * Edge runtime on purpose: in the Node runtime @vercel/og fails to load its
 * bundled font from a file URL on Windows ("Invalid URL" at build). Edge
 * can't reach Prisma, so the card carries the brand rather than SiteConfig.
 */
export const runtime = "edge";

const SITE_NAME = "Arovyx Studio";
const TAGLINE = "Building apps, games, packages & plugins.";

const CATEGORIES = [
  { label: "APPS", color: "#67e8f9" },
  { label: "GAMES", color: "#bef264" },
  { label: "PACKAGES", color: "#c4b5fd" },
  { label: "PLUGINS", color: "#fcd34d" },
];

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          backgroundColor: "#07090b",
          backgroundImage:
            "radial-gradient(circle at 85% 20%, rgba(34,211,238,0.35), rgba(7,9,11,0) 45%)",
          color: "#e7edf3",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 56, height: 4, backgroundColor: "#22d3ee", borderRadius: 2 }} />
          <div style={{ fontSize: 24, letterSpacing: 6, color: "#22d3ee" }}>DEVELOPER SHOWCASE</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 104, fontWeight: 700, letterSpacing: -4, lineHeight: 1 }}>
            {SITE_NAME}
          </div>
          <div style={{ marginTop: 28, fontSize: 36, color: "#8b97a6", maxWidth: 900 }}>{TAGLINE}</div>
        </div>

        <div style={{ display: "flex", gap: 20 }}>
          {CATEGORIES.map((c) => (
            <div
              key={c.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 20px",
                borderRadius: 999,
                border: `2px solid ${c.color}55`,
                color: c.color,
                fontSize: 22,
                letterSpacing: 3,
              }}
            >
              <div style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.color }} />
              {c.label}
            </div>
          ))}
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
