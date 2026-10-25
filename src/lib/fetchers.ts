/**
 * Link fetchers (spec §6.1 Step 2).
 * Server-side only. Never throws for source-specific failures — it returns
 * whatever it could gather plus human-readable `warnings`.
 */

const FETCH_TIMEOUT_MS = 15_000;
const TEXT_CAP = 8_000;

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (compatible; ArovyxStudio/1.0; +https://github.com/arovyx-studio)",
  Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
};

export type FetchSource = "github" | "gitlab" | "npm" | "pypi" | "playstore" | "html";

export interface FetchedData {
  url: string;
  source: FetchSource;
  title: string | null;
  description: string | null;
  readme: string | null;
  topics: string[];
  languages: string[];
  stars: number | null;
  /** Install count (Play Store minimum installs). */
  downloads: number | null;
  /** App icon / feature graphic / phone screenshots (Play Store). */
  iconUrl: string | null;
  bannerUrl: string | null;
  screenshots: string[];
  /** "Published by": Play developer, repo owner, package author, site name. */
  publisher: string | null;
  license: string | null;
  version: string | null;
  repositoryUrl: string | null;
  homepage: string | null;
  text: string | null;
  meta: Record<string, string>;
  warnings: string[];
}

export class FetchError extends Error {}

function abortTimeout(ms: number): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

async function get(url: string, headers: Record<string, string> = {}): Promise<Response> {
  const { signal, done } = abortTimeout(FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { ...HEADERS, ...headers }, signal, redirect: "follow" });
    return res;
  } finally {
    done();
  }
}

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await get(url, headers);
  if (!res.ok) throw new FetchError(`HTTP ${res.status} for ${url}`);
  return (await res.json()) as T;
}

async function getText(url: string, headers: Record<string, string> = {}): Promise<string> {
  const res = await get(url, headers);
  if (!res.ok) throw new FetchError(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

/* ------------------------------------------------------------------ */
/* HTML extraction                                                     */
/* ------------------------------------------------------------------ */

function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

function attr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  const value = match?.[2] ?? match?.[3] ?? null;
  return value ? decodeEntities(value).trim() : null;
}

export function extractHtml(html: string): {
  title: string | null;
  description: string | null;
  meta: Record<string, string>;
  text: string;
} {
  const meta: Record<string, string> = {};

  // Open Graph / twitter / description meta tags
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = attr(tag, "property") ?? attr(tag, "name");
    const content = attr(tag, "content");
    if (key && content) meta[key.toLowerCase()] = content;
  }

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1] ? decodeEntities(titleMatch[1]).trim() : null;

  const description =
    meta["og:description"] ?? meta["description"] ?? meta["twitter:description"] ?? null;

  const text = stripToText(html);
  return { title, description, meta, text };
}

export function stripToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<template\b[\s\S]*?<\/template>/gi, " ")
      .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
      .replace(/<\/(p|div|section|article|li|h[1-6]|br|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, TEXT_CAP);
}

/* ------------------------------------------------------------------ */
/* Source-specific fetchers                                            */
/* ------------------------------------------------------------------ */

interface GithubRepo {
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  stargazers_count: number;
  topics?: string[];
  license: { spdx_id?: string; name?: string } | null;
  owner?: { login?: string };
}

async function fetchGithub(repoUrl: string, data: FetchedData): Promise<void> {
  const parts = new URL(repoUrl).pathname.split("/").filter(Boolean);
  const owner = parts[0];
  const repo = parts[1]?.replace(/\.git$/, "");
  if (!owner || !repo) throw new FetchError("Could not parse GitHub repository URL");

  const api = `https://api.github.com/repos/${owner}/${repo}`;

  const info = await getJson<GithubRepo>(api, { Accept: "application/vnd.github+json" });
  data.title = info.full_name;
  data.description = info.description;
  data.publisher = info.owner?.login ?? owner;
  data.stars = info.stargazers_count;
  data.license = info.license?.spdx_id ?? info.license?.name ?? null;
  data.repositoryUrl = info.html_url;
  data.homepage = info.homepage || null;
  data.topics = info.topics ?? [];

  try {
    const langs = await getJson<Record<string, number>>(`${api}/languages`);
    data.languages = Object.keys(langs);
  } catch {
    data.warnings.push("Could not fetch language breakdown from GitHub.");
  }

  try {
    const readme = await getText(`${api}/readme`, {
      Accept: "application/vnd.github.raw+json",
    });
    data.readme = readme.slice(0, 8_000);
  } catch {
    data.warnings.push("No README found on GitHub.");
  }
}

async function fetchGitlab(repoUrl: string, data: FetchedData): Promise<void> {
  const path = new URL(repoUrl).pathname.replace(/^\//, "").replace(/\/-\/.*$/, "");
  const api = `https://gitlab.com/api/v4/projects/${encodeURIComponent(path)}`;

  interface GitlabProject {
    name: string;
    description: string | null;
    web_url: string;
    star_count: number;
    topics?: string[];
    tag_list?: string[];
    homepage?: string;
    namespace?: { name?: string; full_path?: string };
  }

  const info = await getJson<GitlabProject>(api);
  data.title = info.name;
  data.description = info.description;
  data.publisher = info.namespace?.name ?? info.namespace?.full_path ?? null;
  data.stars = info.star_count;
  data.repositoryUrl = info.web_url;
  data.homepage = info.homepage ?? null;
  data.topics = info.topics ?? info.tag_list ?? [];

  try {
    data.readme = (
      await getText(`${api}/repository/files/README.md/raw?ref=HEAD`)
    ).slice(0, 8_000);
  } catch {
    data.warnings.push("No README found on GitLab.");
  }
}

async function fetchNpm(packageName: string, data: FetchedData): Promise<void> {
  const registryUrl = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;
  interface NpmPackage {
    name: string;
    description?: string;
    keywords?: string[];
    license?: string;
    homepage?: string;
    repository?: { url?: string };
    author?: string | { name?: string };
    maintainers?: Array<{ name?: string }>;
    "dist-tags"?: { latest?: string };
    versions?: Record<string, { version?: string }>;
  }

  const pkg = await getJson<NpmPackage>(registryUrl);
  const latest = pkg["dist-tags"]?.latest;

  data.title = pkg.name ?? packageName;
  data.description = pkg.description ?? null;
  data.publisher =
    (typeof pkg.author === "string" ? pkg.author.replace(/\s*[<(].*$/, "") : pkg.author?.name) ||
    pkg.maintainers?.[0]?.name ||
    null;
  data.version = latest ?? null;
  data.topics = pkg.keywords ?? [];
  data.license = typeof pkg.license === "string" ? pkg.license : null;
  data.homepage = pkg.homepage ?? null;
  data.repositoryUrl = pkg.repository?.url?.replace(/^git\+/, "").replace(/\.git$/, "") ?? null;
  data.text = `npm package: ${pkg.name}\nVersion: ${latest ?? "unknown"}\n${
    pkg.description ?? ""
  }`.trim();
}

async function fetchPypi(packageName: string, data: FetchedData): Promise<void> {
  interface PypiPackage {
    info: {
      name: string;
      summary?: string;
      keywords?: string;
      license?: string;
      home_page?: string;
      project_urls?: Record<string, string>;
      version?: string;
      author?: string;
      maintainer?: string;
    };
  }

  const pkg = await getJson<PypiPackage>(
    `https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`
  );
  const info = pkg.info;

  data.title = info.name ?? packageName;
  data.description = info.summary ?? null;
  data.publisher = info.author || info.maintainer || null;
  data.version = info.version ?? null;
  data.license = info.license ?? null;
  data.homepage = info.home_page || Object.values(info.project_urls ?? {})[0] || null;
  data.topics = (info.keywords ?? "")
    .split(/[,\s]+/)
    .map((k) => k.trim())
    .filter(Boolean);
  data.text = `PyPI package: ${info.name}\nVersion: ${info.version ?? "unknown"}\n${
    info.summary ?? ""
  }`.trim();
}

/* ------------------------------------------------------------------ */
/* Google Play Store                                                    */
/* ------------------------------------------------------------------ */

// Play serves reduced markup (no structured data) to bot user agents.
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

const MAX_SCREENSHOTS = 8;
/** Phone screenshots are tall/wide (≥1.7, e.g. 1920×1080); tablet & Chromebook ones are ~1.33–1.6. */
const PHONE_RATIO = 1.7;

/** play-lh.googleusercontent.com URLs take a size suffix (`=s512`, `=w1024`, `=h720`). */
function playImage(url: string, size: string): string {
  return `${url.replace(/=[a-z0-9-]+$/i, "")}=${size}`;
}

/** Safe nested lookup into Play's positional arrays. */
function pick(root: unknown, path: number[]): unknown {
  let node = root;
  for (const key of path) {
    if (!Array.isArray(node)) return undefined;
    node = node[key];
  }
  return node;
}

/**
 * The app details block (`ds:5`) that Play embeds in the page.
 * Unofficial and positional — every read is guarded, and callers fall back
 * to plain HTML when it's missing or its shape changes.
 */
function playDetails(html: string): unknown[] | null {
  const match = html.match(
    /AF_initDataCallback\(\{key: 'ds:5'[\s\S]*?data:([\s\S]*?), sideChannel: \{\}\}\);<\/script/
  );
  if (!match?.[1]) return null;
  try {
    const details = pick(JSON.parse(match[1]), [1, 2]);
    return Array.isArray(details) ? details : null;
  } catch {
    return null;
  }
}

async function fetchPlayStore(url: string, data: FetchedData): Promise<void> {
  const appId = new URL(url).searchParams.get("id");
  if (!appId) throw new FetchError("Play Store URL has no app id (?id=…)");

  const pageUrl = `https://play.google.com/store/apps/details?id=${encodeURIComponent(appId)}&hl=en&gl=US`;
  const html = await getText(pageUrl, { "User-Agent": BROWSER_UA, "Accept-Language": "en-US,en;q=0.9" });

  const extracted = extractHtml(html);
  data.title = extracted.title?.replace(/ - Apps on Google Play$/i, "") ?? null;
  data.description = extracted.description;
  data.meta = extracted.meta;
  data.text = extracted.text;
  data.homepage = pageUrl;

  const details = playDetails(html);
  if (details) {
    const title = pick(details, [0, 0]);
    if (typeof title === "string") data.title = title;

    const icon = pick(details, [95, 0, 3, 2]);
    if (typeof icon === "string") data.iconUrl = playImage(icon, "s512");

    const banner = pick(details, [96, 0, 3, 2]);
    if (typeof banner === "string") data.bannerUrl = playImage(banner, "w1024");

    const developer = pick(details, [68, 0]);
    if (typeof developer === "string") data.publisher = developer;

    // Store genre (e.g. "Productivity") — a useful tag hint for the AI
    const genre = pick(details, [79, 0, 0, 0]);
    if (typeof genre === "string") data.topics = [...new Set([...data.topics, genre])];

    const installs = pick(details, [13, 1]);
    if (typeof installs === "number") data.downloads = installs;

    const shots = (pick(details, [78, 0]) as unknown[] | undefined) ?? [];
    const parsed = (Array.isArray(shots) ? shots : [])
      .map((shot) => ({
        url: pick(shot, [3, 2]),
        dims: pick(shot, [2]),
      }))
      .filter((s): s is { url: string; dims: unknown } => typeof s.url === "string");
    const isPhone = (dims: unknown) => {
      if (!Array.isArray(dims) || dims.length < 2) return false;
      const [a, b] = dims as number[];
      if (!a || !b) return false;
      return Math.max(a, b) / Math.min(a, b) >= PHONE_RATIO;
    };
    const phone = parsed.filter((s) => isPhone(s.dims));
    data.screenshots = [...new Set((phone.length ? phone : parsed).map((s) => playImage(s.url, "h720")))].slice(
      0,
      MAX_SCREENSHOTS
    );
  } else {
    data.warnings.push("Play Store structured data not found — used page metadata only.");
  }

  // Fallbacks from plain HTML when the structured block was missing or incomplete.
  if (!data.iconUrl) {
    const og = extracted.meta["og:image"];
    if (og?.includes("googleusercontent.com")) data.iconUrl = playImage(og, "s512");
  }
  if (!data.screenshots.length) {
    const urls = [...html.matchAll(/<img[^>]*alt="Screenshot image"[^>]*>/gi)]
      .map((m) => attr(m[0], "src"))
      .filter((u): u is string => Boolean(u?.includes("googleusercontent.com")))
      .map((u) => playImage(u, "h720"));
    data.screenshots = [...new Set(urls)].slice(0, MAX_SCREENSHOTS);
  }
}

/* ------------------------------------------------------------------ */
/* Public entry point                                                  */
/* ------------------------------------------------------------------ */

/** Detect what kind of link this is. */
export function detectSource(url: string): FetchSource {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new FetchError(`"${url}" is not a valid URL.`);
  }

  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

  if (host === "github.com") return "github";
  if (host === "gitlab.com") return "gitlab";
  if (host === "npmjs.com" || host === "npmjs.org") return "npm";
  if (host === "pypi.org") return "pypi";
  if (host === "play.google.com" && parsed.pathname.startsWith("/store/apps/details")) {
    return "playstore";
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new FetchError(`Only http(s) links are supported (got "${parsed.protocol}").`);
  }
  return "html";
}

/** Fetch and normalize whatever the link points at. */
export async function fetchProjectData(url: string): Promise<FetchedData> {
  const source = detectSource(url);

  const data: FetchedData = {
    url,
    source,
    title: null,
    description: null,
    readme: null,
    topics: [],
    languages: [],
    stars: null,
    downloads: null,
    iconUrl: null,
    bannerUrl: null,
    screenshots: [],
    publisher: null,
    license: null,
    version: null,
    repositoryUrl: null,
    homepage: null,
    text: null,
    meta: {},
    warnings: [],
  };

  try {
    if (source === "github") {
      await fetchGithub(url, data);
    } else if (source === "gitlab") {
      await fetchGitlab(url, data);
    } else if (source === "npm") {
      const match = url.match(/npmjs\.com\/(?:package|~)\/([^/?#]+)/);
      await fetchNpm(match?.[1] ?? new URL(url).pathname.split("/").filter(Boolean).pop()!, data);
    } else if (source === "pypi") {
      const match = url.match(/pypi\.org\/project\/([^/?#]+)/);
      await fetchPypi(match?.[1] ?? new URL(url).pathname.split("/").filter(Boolean).pop()!, data);
    } else if (source === "playstore") {
      await fetchPlayStore(url, data);
    } else {
      const html = await getText(url);
      const extracted = extractHtml(html);
      data.title = extracted.title;
      data.description = extracted.description;
      data.meta = extracted.meta;
      data.text = extracted.text;
      data.homepage = url;
      data.publisher = extracted.meta["og:site_name"] ?? null;
      if (!extracted.title && !extracted.description && !extracted.text) {
        data.warnings.push("Page contained no readable text.");
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    data.warnings.push(`Fetch problem: ${message}`);
  }

  return data;
}

/** True if there is enough signal to send the data to the AI. */
export function hasContent(data: FetchedData): boolean {
  return Boolean(
    data.description ?? data.readme ?? data.text ?? data.title ?? data.topics.length
  );
}

/** Human-readable one-line summary for logs/toasts. */
export function describeSource(data: FetchedData): string {
  const bits = [data.source === "playstore" ? "GOOGLE PLAY" : data.source.toUpperCase()];
  if (data.title) bits.push(data.title);
  if (data.stars != null) bits.push(`${data.stars}★`);
  if (data.version) bits.push(`v${data.version}`);
  return bits.join(" · ");
}
