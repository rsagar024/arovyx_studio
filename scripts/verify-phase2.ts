/* Phase 2 verification: auth + NIM (mocked server) + fetchers (live network) */

process.env.ADMIN_SECRET_KEY = "test-admin-key-123";
process.env.ADMIN_JWT_SECRET = "test-jwt-secret-456";

import http from "node:http";
import type { AddressInfo } from "node:net";

import {
  signSession,
  verifySession,
  verifyAdminKey,
  timingSafeEqualStr,
} from "../src/lib/auth";
import { extractJson, nimChat, generateProjectDetails, NIMError } from "../src/lib/nim";
import { fetchProjectData, hasContent, extractHtml, detectSource } from "../src/lib/fetchers";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function testAuth() {
  console.log("\n[auth]");

  check("verifyAdminKey correct key", await verifyAdminKey("test-admin-key-123"));
  check("verifyAdminKey wrong key", !(await verifyAdminKey("wrong-key")));
  check("verifyAdminKey empty key", !(await verifyAdminKey("")));
  check("timingSafeEqualStr", timingSafeEqualStr("abc", "abc") && !timingSafeEqualStr("abc", "abd"));

  const token = await signSession();
  const session = await verifySession(token);
  check("sign + verify roundtrip", session?.sub === "admin" && (session?.exp ?? 0) > Date.now() / 1000);

  const tampered = token.slice(0, -3) + (token.endsWith("aaa") ? "bbb" : "aaa");
  check("tampered signature rejected", (await verifySession(tampered)) === null);
  check("garbage token rejected", (await verifySession("not.a.jwt")) === null);
  check("missing token rejected", (await verifySession(null)) === null);

  const expired = await signSession({ sub: "admin" }, -10);
  check("expired token rejected", (await verifySession(expired)) === null);
}

async function testNim() {
  console.log("\n[nim]");

  // Mock NVIDIA NIM server: first call 429 (tests retry), then valid JSON.
  let calls = 0;
  const draft = {
    title: "Mock Project",
    shortDescription: "A short description.",
    longDescription: "Paragraph one.\n\nParagraph two.",
    category: "GAME",
    tags: ["a", "b", "c", "d", "e"],
    techStack: ["TypeScript"],
    features: ["f1", "f2"],
    status: "LIVE",
    version: "1.0.0",
    imageUrl: null,
    demoUrl: null,
  };

  const server = http.createServer((req, res) => {
    calls++;
    if (calls === 1) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "rate limited" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(draft) } }] })
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  process.env.NVIDIA_NIM_BASE_URL = `http://127.0.0.1:${port}/v1`;
  process.env.NVIDIA_NIM_API_KEY = "mock-key";

  // 1. retry on 429 then success
  calls = 0;
  const reply = await nimChat("sys", "user", { retries: 2, backoffMs: 30 });
  check("nimChat retries 429 then succeeds", reply.includes("Mock Project"), `calls=${calls}`);

  // 2. missing API key error
  delete process.env.NVIDIA_NIM_API_KEY;
  let missingKey = false;
  try {
    await nimChat("s", "u");
  } catch (err) {
    missingKey = err instanceof NIMError && err.code === "missing_key";
  }
  check("missing API key → clear NIMError", missingKey);
  process.env.NVIDIA_NIM_API_KEY = "mock-key";

  // 3. JSON extraction variants
  const plain = extractJson(JSON.stringify(draft));
  const fenced = extractJson("```json\n" + JSON.stringify(draft) + "\n```");
  const chatty = extractJson("Sure! Here it is:\n" + JSON.stringify(draft) + "\nHope that helps.");
  check(
    "extractJson (plain/fenced/prose)",
    (plain as typeof draft).title === "Mock Project" &&
      (fenced as typeof draft).title === "Mock Project" &&
      (chatty as typeof draft).title === "Mock Project"
  );

  // 4. full pipeline: FetchedData → validated ProjectDraft (+ AiLog written)
  const aiLogBefore = await (await import("../src/lib/db")).db.aiLog.count();
  const result = await generateProjectDetails({
    url: "https://github.com/example/mock",
    source: "github",
    title: "example/mock",
    description: "A mock repo",
    readme: "# Mock\nA test project",
    topics: ["demo"],
    languages: ["TypeScript"],
    stars: 42,
    downloads: null,
    iconUrl: null,
    bannerUrl: null,
    screenshots: [],
    license: "MIT",
    version: null,
    repositoryUrl: "https://github.com/example/mock",
    homepage: null,
    text: null,
    meta: {},
    warnings: [],
  });
  check(
    "generateProjectDetails returns validated draft",
    result.title === "Mock Project" && result.category === "GAME" && result.tags.length === 5
  );

  // 5. category override (non-AUTO)
  const forced = await generateProjectDetails(
    {
      url: "https://example.com/x",
      source: "html",
      title: "x",
      description: null,
      readme: null,
      topics: [],
      languages: [],
      stars: null,
      downloads: null,
      iconUrl: null,
      bannerUrl: null,
      screenshots: [],
      license: null,
      version: null,
      repositoryUrl: null,
      homepage: null,
      text: "some text",
      meta: {},
      warnings: [],
    },
    { category: "PLUGIN" }
  );
  check("category override applied", forced.category === "PLUGIN");

  const { db } = await import("../src/lib/db");
  const aiLogAfter = await db.aiLog.count();
  check("AiLog rows written", aiLogAfter >= aiLogBefore + 2, `+${aiLogAfter - aiLogBefore}`);

  server.close();
}

async function testFetchers() {
  console.log("\n[fetchers]");

  check("detectSource github", detectSource("https://github.com/vercel/next.js") === "github");
  check("detectSource npm", detectSource("https://www.npmjs.com/package/react") === "npm");
  check("detectSource pypi", detectSource("https://pypi.org/project/requests/") === "pypi");
  check("detectSource gitlab", detectSource("https://gitlab.com/gitlab-org/cli") === "gitlab");
  check("detectSource html", detectSource("https://example.com/project") === "html");

  let threw = false;
  try {
    detectSource("not a url");
  } catch {
    threw = true;
  }
  check("invalid URL throws FetchError", threw);

  const html = `<html><head><title> My App </title>
    <meta name="description" content="A test app">
    <meta property="og:image" content="https://x/img.png"></head>
    <body><script>var x=1;</script><h1>Hello</h1><p>World &amp; more</p></body></html>`;
  const extracted = extractHtml(html);
  check(
    "extractHtml title/description/text",
    extracted.title === "My App" &&
      extracted.description === "A test app" &&
      extracted.text.includes("Hello") &&
      !extracted.text.includes("var x=1") &&
      extracted.text.includes("World & more") &&
      extracted.meta["og:image"] === "https://x/img.png"
  );

  // Live network (best effort — reported, not fatal to the suite)
  const live: Array<[string, string]> = [
    ["github live fetch", "https://github.com/vercel/next.js"],
    ["npm live fetch", "https://www.npmjs.com/package/react"],
    ["generic live fetch", "https://nextjs.org/"],
  ];
  for (const [name, url] of live) {
    try {
      const data = await fetchProjectData(url);
      check(name, hasContent(data), `source=${data.source}${data.title ? ` title=${data.title}` : ""}${data.warnings.length ? ` warnings=${data.warnings.length}` : ""}`);
    } catch (err) {
      check(name, false, `network unavailable: ${err instanceof Error ? err.message : err}`);
    }
  }
}

async function main() {
  await testAuth();
  await testNim();
  await testFetchers();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
