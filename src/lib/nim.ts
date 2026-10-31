/**
 * NVIDIA NIM AI service (spec §8). Server-side only — the API key never
 * reaches the client. Uses plain `fetch`, no SDK.
 */
import { z } from "zod";
import { db } from "@/lib/db";
import type { FetchedData } from "@/lib/fetchers";
import {
  projectDraftSchema,
  type Category,
  type ProjectDraft,
} from "@/lib/validators";

// Note: hosted NIM retires models (HTTP 410 Gone — e.g. the llama-3.1/3.3
// instruct family) and only entitles accounts to a subset of the catalog
// (others return 404 — meta/llama-3.2-11b-vision-instruct started 404ing
// 2026-10-31). Verified working on a standard build.nvidia.com key on
// 2026-10-31: nvidia/nemotron-3.5-lightning-30b-a3b (fast, clean JSON) and
// openai/gpt-oss-20b. Override via NVIDIA_NIM_MODEL.
//
// Nemotron 3.5 is a reasoning model: hidden `reasoning_content` tokens count
// against max_tokens, and on large fetched inputs they used the whole budget,
// leaving `content` empty. nimChat therefore sends
// chat_template_kwargs.enable_thinking=false (0 reasoning tokens, ~4 s vs
// ~25 s, verified 2026-10-31); `/no_think` and reasoning_effort did NOT work.
const DEFAULT_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b";
const DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";
const DEFAULT_TIMEOUT_MS = 60_000;

export class NIMError extends Error {
  constructor(
    message: string,
    readonly code: "missing_key" | "rate_limited" | "auth" | "timeout" | "server" | "invalid_response" | "network"
  ) {
    super(message);
    this.name = "NIMError";
  }
}

/** NIM failure class → HTTP status API routes should respond with. */
export function nimHttpStatus(code: NIMError["code"]): number {
  switch (code) {
    case "missing_key":
      return 503;
    case "rate_limited":
      return 429;
    case "timeout":
      return 504;
    case "auth":
    case "server":
    case "invalid_response":
    case "network":
    default:
      return 502;
  }
}

function baseUrl(): string {
  return (process.env.NVIDIA_NIM_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function model(): string {
  return process.env.NVIDIA_NIM_MODEL || DEFAULT_MODEL;
}

/* ------------------------------------------------------------------ */
/* Low-level chat                                                      */
/* ------------------------------------------------------------------ */

export interface NimOptions {
  temperature?: number;
  /** Ask the API for a JSON object response (if the model supports it). */
  json?: boolean;
  timeoutMs?: number;
  /** Automatic retries on 429/5xx/network errors. Default 2. */
  retries?: number;
  backoffMs?: number;
}

export async function nimChat(
  system: string,
  user: string,
  opts: NimOptions = {}
): Promise<string> {
  const apiKey = process.env.NVIDIA_NIM_API_KEY;
  if (!apiKey) {
    throw new NIMError(
      "NVIDIA_NIM_API_KEY is not set on the server. Add it to .env and restart the dev server.",
      "missing_key"
    );
  }

  const temperature = opts.temperature ?? 0.4;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = opts.retries ?? 2;
  const backoffMs = opts.backoffMs ?? 1_000;

  const body: Record<string, unknown> = {
    model: model(),
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature,
    // Explicit cap — hosted endpoints otherwise apply a small default that
    // truncates mid-JSON.
    max_tokens: 8192,
    // Turn off hidden reasoning on thinking models (Nemotron 3.x etc.) so the
    // token budget goes to the answer. Ignored by models without it.
    chat_template_kwargs: { enable_thinking: false },
    ...(opts.json ? { response_format: { type: "json_object" } } : {}),
  };

  let useResponseFormat = Boolean(opts.json);
  let useTemplateKwargs = true;
  let lastError: NIMError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${baseUrl()}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (res.ok) {
        const payload = (await res.json()) as {
          choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
        };
        const choice = payload.choices?.[0];
        if (choice?.finish_reason && choice.finish_reason !== "stop") {
          // Diagnostics: a non-"stop" reason means the model was cut off
          // (likely mid-JSON), which the parser will surface anyway.
          console.error(`[nim] finish_reason=${choice.finish_reason}`);
        }
        const content = choice?.message?.content;
        if (typeof content !== "string" || content.trim().length === 0) {
          if (choice?.finish_reason === "length") {
            throw new NIMError(
              "The AI ran out of output tokens before answering — retry, or pick a non-reasoning model via NVIDIA_NIM_MODEL.",
              "invalid_response"
            );
          }
          throw new NIMError("NIM returned an empty response.", "invalid_response");
        }
        return content;
      }

      // Models that reject chat_template_kwargs — retry once without it.
      if (res.status === 400 && useTemplateKwargs) {
        useTemplateKwargs = false;
        delete body.chat_template_kwargs;
        continue;
      }

      // Some deployments reject response_format — retry once without it.
      if (res.status === 400 && useResponseFormat) {
        useResponseFormat = false;
        delete body.response_format;
        continue;
      }

      if (res.status === 401 || res.status === 403) {
        throw new NIMError(
          "NIM rejected the API key (401). Check NVIDIA_NIM_API_KEY.",
          "auth"
        );
      }
      if (res.status === 429) {
        lastError = new NIMError("NIM rate limit hit (429). Try again shortly.", "rate_limited");
      } else {
        lastError = new NIMError(`NIM request failed with status ${res.status}.`, "server");
      }
    } catch (err) {
      if (err instanceof NIMError && !["rate_limited", "server"].includes(err.code)) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        lastError = new NIMError(
          `NIM request timed out after ${Math.round(timeoutMs / 1000)}s.`,
          "timeout"
        );
      } else if (err instanceof NIMError) {
        lastError = err;
      } else {
        lastError = new NIMError(
          `Could not reach the NIM API: ${err instanceof Error ? err.message : String(err)}`,
          "network"
        );
      }
    } finally {
      clearTimeout(timer);
    }

    if (attempt < maxRetries) {
      const wait = backoffMs * 2 ** attempt;
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  throw lastError ?? new NIMError("NIM request failed.", "server");
}

/**
 * Chat → parse JSON, re-asking the model once if it answered with prose
 * instead of JSON (small models occasionally ignore the JSON-only
 * instruction even with `response_format`). Transport errors/status codes
 * are already retried inside `nimChat`; this only covers parse failures.
 */
async function nimJson(
  system: string,
  user: string,
  opts: NimOptions = {}
): Promise<unknown> {
  let lastInvalid: NIMError | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    let content: string;
    try {
      content = await nimChat(system, user, opts);
    } catch (err) {
      if (err instanceof NIMError && err.code === "invalid_response") {
        lastInvalid = err;
        continue;
      }
      throw err;
    }
    try {
      return extractJson(content);
    } catch (err) {
      if (err instanceof NIMError && err.code === "invalid_response") {
        // Failure-only diagnostics: keep a short prefix of what the model
        // actually said so parse failures are debuggable in server logs.
        console.error(
          `[nim] unparseable model output (attempt ${attempt + 1}/${2}): ${JSON.stringify(
            content.slice(0, 400)
          )}`
        );
        lastInvalid = err;
        continue;
      }
      throw err;
    }
  }
  throw lastInvalid ?? new NIMError("AI returned invalid JSON twice.", "invalid_response");
}

/* ------------------------------------------------------------------ */
/* JSON parsing (defensive — strips fences, tolerates prose around it) */
/* ------------------------------------------------------------------ */

export function extractJson(content: string): unknown {
  let text = content.trim();

  // Strip only a WRAPPING code fence at the content boundaries. The old
  // non-greedy ```…``` match truncated at the first inner code block
  // (README-style ```sh fences inside longDescription), which looked like
  // truncated JSON. Backticks inside JSON strings are legal, so the inner
  // fences must survive.
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  // Common small-model defects: Python-style `"""…"""` strings for long
  // values, raw control characters inside string literals, and output that
  // stops before the final closing braces. Candidates escalate repairs.
  const repaired = escapeControlCharsInStrings(restoreTripleQuotedStrings(text));
  const closed = closeTruncatedJson(repaired);
  const candidates = closed !== null ? [text, repaired, closed] : [text, repaired];
  const attemptErrors: string[] = [];
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (err) {
      attemptErrors.push(`direct: ${err instanceof Error ? err.message : String(err)}`);
    }
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch (err) {
        attemptErrors.push(`slice: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      attemptErrors.push("slice: no balanced braces");
    }
  }

  // Failure-only diagnostics for server logs.
  console.error(
    `[nim] JSON parse failed (${attemptErrors.join(" | ")}) — full content follows:\n${text}`
  );

  if (!text.includes("{")) {
    throw new NIMError("AI response did not contain JSON.", "invalid_response");
  }
  throw new NIMError("AI response contained invalid JSON.", "invalid_response");
}

/**
 * Close a JSON document the model stopped writing before the final braces
 * (returns null when the structure is already balanced — nothing to fix).
 */
function closeTruncatedJson(text: string): string | null {
  const stack: Array<"}" | "]"> = [];
  let inString = false;
  let escaped = false;

  for (const ch of text) {
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }

  if (stack.length === 0 && !inString) return null;

  let out = text;
  if (inString) out += '"';
  while (stack.length > 0) out += stack.pop();
  return out;
}

/**
 * Rewrite Python-style triple-quoted strings (`"""\n…\n"""`) as proper
 * JSON strings — the model uses them for long multi-line values.
 */
function restoreTripleQuotedStrings(text: string): string {
  return text.replace(/"""([\s\S]*?)"""/g, (_match, body: string) => JSON.stringify(body));
}

/**
 * Escape raw control characters that appear inside JSON string literals
 * (structure outside strings is left untouched). Handles backslash escapes
 * so `\"` sequences don't confuse the scanner.
 */
function escapeControlCharsInStrings(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;

  for (const ch of text) {
    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        out += ch;
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
        out += ch;
        continue;
      }
      const code = ch.charCodeAt(0);
      if (code < 0x20) {
        out +=
          ch === "\n"
            ? "\\n"
            : ch === "\r"
              ? "\\r"
              : ch === "\t"
                ? "\\t"
                : `\\u${code.toString(16).padStart(4, "0")}`;
        continue;
      }
      out += ch;
      continue;
    }
    if (ch === '"') inString = true;
    out += ch;
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Logging (spec §8)                                                   */
/* ------------------------------------------------------------------ */

export async function logAiUse(entry: {
  url: string;
  action: "generate" | "improve";
  success: boolean;
  error?: string;
}): Promise<void> {
  try {
    await db.aiLog.create({
      data: {
        url: entry.url,
        action: entry.action,
        success: entry.success,
        error: entry.error ?? null,
        model: model(),
      },
    });
  } catch (err) {
    // Logging must never break the feature.
    console.error("[nim] failed to write AiLog:", err);
  }
}

/* ------------------------------------------------------------------ */
/* Feature 1: project auto-fill (spec §6.1 Step 3)                     */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT =
  'You are the content engine for Arovyx Studio, a developer portfolio. Given raw fetched data from a project link, generate polished portfolio content. Respond ONLY with valid JSON matching the schema: { title, shortDescription, longDescription (markdown, 3-5 paragraphs), category (APP|GAME|PACKAGE|PLUGIN), tags (5-10), techStack (array), features (5-8 bullet strings), status (LIVE|IN_DEVELOPMENT|ARCHIVED), version, imageUrl, demoUrl }. Never invent facts not supported by the input; if unknown, use null.';

function buildUserPrompt(data: FetchedData, extra?: string, category?: Category): string {
  const lines: string[] = [
    `Original URL: ${data.url}`,
    `Detected source: ${data.source}`,
  ];

  if (category) lines.push(`Required category: ${category} (the admin overrode AUTO).`);
  if (data.title) lines.push(`Title: ${data.title}`);
  if (data.description) lines.push(`Description: ${data.description}`);
  if (data.repositoryUrl) lines.push(`Repository: ${data.repositoryUrl}`);
  if (data.homepage) lines.push(`Homepage: ${data.homepage}`);
  if (data.version) lines.push(`Latest version: ${data.version}`);
  if (data.publisher) lines.push(`Published by: ${data.publisher}`);
  if (data.license) lines.push(`License: ${data.license}`);
  if (data.stars != null) lines.push(`Stars: ${data.stars}`);
  if (data.downloads != null) lines.push(`Installs: ${data.downloads.toLocaleString("en-US")}+`);
  if (data.topics.length) lines.push(`Topics/keywords: ${data.topics.join(", ")}`);
  if (data.languages.length) lines.push(`Languages: ${data.languages.join(", ")}`);

  const metaKeys = Object.entries(data.meta)
    .slice(0, 8)
    .map(([k, v]) => `${k}: ${v}`);
  if (metaKeys.length) lines.push(`Page metadata:\n${metaKeys.join("\n")}`);

  if (data.readme) lines.push(`README:\n${data.readme.slice(0, 6000)}`);
  if (data.text) lines.push(`Page text:\n${data.text.slice(0, 4000)}`);

  if (extra?.trim()) lines.push(`Extra instruction from the admin: ${extra.trim()}`);

  return lines.join("\n\n");
}

export interface GenerateOptions {
  /** Non-AUTO category chosen by the admin — forces the AI's output. */
  category?: Category;
  extraInstruction?: string;
}

export async function generateProjectDetails(
  data: FetchedData,
  opts: GenerateOptions = {}
): Promise<ProjectDraft> {
  const user = buildUserPrompt(data, opts.extraInstruction, opts.category);

  try {
    const raw = await nimJson(SYSTEM_PROMPT, user, { json: true, temperature: 0.4 });
    const parsed = projectDraftSchema.safeParse(raw);

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new NIMError(
        `AI returned an invalid project payload (${issue?.path.join(".") ?? "unknown field"}: ${
          issue?.message ?? "validation failed"
        }).`,
        "invalid_response"
      );
    }

    const draft: ProjectDraft = parsed.data;
    if (opts.category) draft.category = opts.category;
    if (!draft.title.trim()) {
      draft.title = data.title ?? new URL(data.url).hostname;
    }

    await logAiUse({ url: data.url, action: "generate", success: true });
    return draft;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logAiUse({ url: data.url, action: "generate", success: false, error: message });
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* Feature 2: AI description improver (spec §8)                        */
/* ------------------------------------------------------------------ */

const improveSchema = z.object({
  shortDescription: z.string().min(1),
  longDescription: z.string().min(1),
});

export async function improveDescription(input: {
  url: string;
  title: string;
  shortDescription: string;
  longDescription: string;
}): Promise<{ shortDescription: string; longDescription: string }> {
  const system =
    "You are the copy editor for Arovyx Studio, a developer portfolio. Improve/expand this description while keeping facts accurate. Respond ONLY with valid JSON: { shortDescription, longDescription }. The shortDescription is 1-2 lines; the longDescription is markdown with 3-5 paragraphs. Do not invent facts that are not present or implied by the input.";

  const user = `Title: ${input.title}\nSource URL: ${input.url}\n\nCurrent shortDescription:\n${input.shortDescription}\n\nCurrent longDescription:\n${input.longDescription}`;

  try {
    const raw = await nimJson(system, user, { json: true, temperature: 0.5 });
    const parsed = improveSchema.safeParse(raw);
    if (!parsed.success) {
      throw new NIMError("AI returned an invalid improvement payload.", "invalid_response");
    }
    await logAiUse({ url: input.url, action: "improve", success: true });
    return parsed.data;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logAiUse({ url: input.url, action: "improve", success: false, error: message });
    throw err;
  }
}
