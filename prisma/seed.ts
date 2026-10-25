import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const projects = [
  {
    slug: "pulseboard",
    title: "PulseBoard",
    shortDescription: "A realtime analytics dashboard for indie makers with live charts and alerting.",
    longDescription: `PulseBoard is a lightweight, realtime analytics dashboard built for indie developers who want product insight without wiring up a heavyweight analytics stack.

It ingests events over a single WebSocket connection, aggregates them in memory, and renders live charts with sub-second latency. The UI is keyboard-first: every panel can be focused, pinned, or rearranged without touching the mouse.

Setup takes under two minutes — drop in a tiny script tag, and your first dashboard populates instantly. Alerts can be routed to email or Discord when a metric crosses a threshold you define.

The whole thing is built on Next.js with a pluggable storage layer, so you can start on SQLite and move to Postgres without changing a line of application code.`,
    category: "APP",
    tags: ["analytics", "dashboard", "realtime", "saas", "indie"],
    techStack: ["Next.js", "TypeScript", "Tailwind CSS", "WebSocket", "Recharts"],
    features: [
      "Live event stream with sub-second chart updates",
      "Keyboard-first panel navigation and pinning",
      "Threshold alerts via email and Discord webhooks",
      "Script-tag install — first data in under 2 minutes",
      "Pluggable storage: SQLite to Postgres without code changes",
      "Shareable read-only dashboard links",
    ],
    status: "LIVE",
    version: "1.4.2",
    sourceUrl: "https://github.com/arovyx/pulseboard",
    demoUrl: "https://pulseboard.example.com",
    imageUrl: null,
    stars: 428,
    downloads: null,
    isPublished: true,
    aiGenerated: false,
  },
  {
    slug: "nebula-drift",
    title: "Nebula Drift",
    shortDescription: "A neon canvas arcade racer where you surf collapsing wormholes at light speed.",
    longDescription: `Nebula Drift is a fast, unforgiving browser arcade game about momentum. You pilot a light-sailer through procedurally generated nebulae, riding shockwaves from collapsing wormholes to chain multipliers.

There are no levels — only runs. Each run seeds a new sector from a shared RNG seed, so leaderboards stay fair while the geometry never repeats.

Everything renders on a single 2D canvas with a custom particle system: no engine, no sprite sheets, just code. The physics loop runs at a fixed 120Hz tick with interpolation, keeping controls razor sharp on any display.

Controls are deliberately minimal — arrow keys and one boost button — so a run can be learned in thirty seconds and chased for weeks.`,
    category: "GAME",
    tags: ["arcade", "canvas", "procedural", "gamedev", "pixel"],
    techStack: ["TypeScript", "Canvas 2D", "Vite", "Web Audio API"],
    features: [
      "Procedurally generated sectors from a shared RNG seed",
      "Fixed 120Hz physics tick with render interpolation",
      "Wormhole shockwave chaining and multiplier system",
      "Global leaderboard with deterministic seeds",
      "Original synth soundtrack via Web Audio API",
      "Gamepad and keyboard support",
    ],
    status: "LIVE",
    version: "0.9.0",
    sourceUrl: "https://github.com/arovyx/nebula-drift",
    demoUrl: "https://nebula-drift.itch.io",
    imageUrl: null,
    stars: 211,
    downloads: null,
    isPublished: true,
    aiGenerated: false,
  },
  {
    slug: "tinyfetch",
    title: "tinyfetch",
    shortDescription: "A 1.2 kB fetch wrapper with retries, timeouts, and typed JSON parsing.",
    longDescription: `**tinyfetch** strips fetch down to the parts you actually use: a timeout that really aborts, retries with exponential backoff on 429/5xx, and a typed json() helper that fails loudly instead of returning undefined.

The entire library is 1.2 kB min+gzipped with zero dependencies. It ships ESM and CJS builds plus full TypeScript definitions, so it drops into anything from a Next.js server route to a browser extension.

Interceptors are plain functions, not classes — log a request, attach a bearer token, or normalize an error envelope by composing two-liners.

It is deliberately boring: no global state, no polyfills, no config file. Just a better fetch library, one import away.`,
    category: "PACKAGE",
    tags: ["fetch", "http", "typescript", "networking", "utility"],
    techStack: ["TypeScript", "Vitest", "tsup", "ESM"],
    features: [
      "1.2 kB min+gzipped, zero dependencies",
      "Real request timeouts via AbortController",
      "Exponential-backoff retries for 429 and 5xx responses",
      "Typed json() parser with strict error handling",
      "Composable request/response interceptors",
      "Ships ESM + CJS with full type definitions",
    ],
    status: "LIVE",
    version: "2.1.0",
    sourceUrl: "https://github.com/arovyx/tinyfetch",
    demoUrl: "https://www.npmjs.com/package/tinyfetch",
    imageUrl: null,
    stars: 1032,
    downloads: 24500,
    isPublished: true,
    aiGenerated: false,
  },
];

const siteConfig = {
  id: 1,
  siteName: "Arovyx Studio",
  ownerName: "Arovyx Studio Owner", // ← edit this
  tagline: "Building apps, games, packages & plugins.",
  bio: "Arovyx Studio is the personal workshop where I ship small, sharp software — apps that remove friction, games that respect your time, packages other developers reuse, and plugins that extend the tools we live in.",
  email: "hello@example.com", // ← edit this (dummy address)
  githubUrl: "https://github.com/your-handle", // ← edit this (dummy link)
  linkedinUrl: "https://www.linkedin.com/in/your-handle", // ← edit this (dummy link)
  instagramUrl: "https://www.instagram.com/your-handle", // ← edit this (dummy link)
  avatarUrl: "",
  resumeUrl: "",
};

async function main() {
  // `--if-empty` (used by the predev/prestart hooks): seed only a fresh
  // database, so normal runs never overwrite edits or resurrect deletions.
  if (process.argv.includes("--if-empty")) {
    const [projectCount, configCount] = await Promise.all([
      prisma.project.count(),
      prisma.siteConfig.count(),
    ]);
    if (projectCount > 0 || configCount > 0) {
      console.log("Arovyx Studio: database already seeded — skipping.");
      return;
    }
  }

  console.log("Seeding Arovyx Studio…");

  await prisma.siteConfig.upsert({
    where: { id: 1 },
    update: {},
    create: siteConfig,
  });
  console.log("  ✓ SiteConfig defaults");

  for (const project of projects) {
    const { tags, techStack, features, category, status, ...rest } = project;
    const data = {
      ...rest,
      category,
      status,
      tags: JSON.stringify(tags),
      techStack: JSON.stringify(techStack),
      features: JSON.stringify(features),
    };

    await prisma.project.upsert({
      where: { slug: project.slug },
      update: data,
      create: data,
    });
    console.log(`  ✓ Project: ${project.title}`);
  }

  const [projectCount, configCount] = await Promise.all([
    prisma.project.count(),
    prisma.siteConfig.count(),
  ]);
  console.log(`Done. projects=${projectCount} siteConfig=${configCount}`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
