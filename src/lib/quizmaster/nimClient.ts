/**
 * The models the jobs call, on top of `src/lib/nim.ts` (`nimChat`).
 *
 * Python used `NIM_GEN_MODEL` / `NIM_VERIFY_MODEL` / `NIM_TRANSLATE_MODEL`
 * with defaults `nvidia/nemotron-3-ultra-550b-a55b` (generate, translate)
 * and `openai/gpt-oss-20b` (verify). Here they are `QUIZMASTER_*_MODEL`.
 * The verifier must be a different model family from the generator, so it
 * doesn't share the generator's mistakes.
 *
 * Defaults, measured on this key on 2026-11-03 with the real verify prompt
 * (12 questions):
 * - `nvidia/nemotron-3-ultra-550b-a55b` (the old Python generator) still
 *   works: 2–3 s. Kept for generate and translate.
 * - `openai/gpt-oss-20b` (the old verifier) took 90–200 s per batch or timed
 *   out, too slow for a 240 s tick, so verify uses
 *   `deepseek-ai/deepseek-v4.1-flash` (22–40 s, another family).
 * - `nvidia/nemotron-3.5-lightning-30b-a3b` (verified in `nim.ts`) also
 *   works (1.5 s) and is a good fallback generator via QUIZMASTER_GEN_MODEL.
 *
 * Every call is bounded by the tick's deadline: a call that can't finish in
 * the time left throws `DeadlineError`, which ends the tick without
 * counting as a failure; the unit runs again, from its start, next tick.
 */
import "server-only";
import { NIMError, nimChat } from "@/lib/nim";

export const DEFAULT_GEN_MODEL = "nvidia/nemotron-3-ultra-550b-a55b";
export const DEFAULT_VERIFY_MODEL = "deepseek-ai/deepseek-v4.1-flash";
export const DEFAULT_TRANSLATE_MODEL = "nvidia/nemotron-3-ultra-550b-a55b";

export interface Models {
  generate: string;
  verify: string;
  translate: string;
}

/** An unset or empty variable uses the default. */
export function models(env: Record<string, string | undefined> = process.env): Models {
  return {
    generate: env.QUIZMASTER_GEN_MODEL || DEFAULT_GEN_MODEL,
    verify: env.QUIZMASTER_VERIFY_MODEL || DEFAULT_VERIFY_MODEL,
    translate: env.QUIZMASTER_TRANSLATE_MODEL || DEFAULT_TRANSLATE_MODEL,
  };
}

/** `nvidia/x` → `nvidia`: the family check for generator vs verifier. */
export const modelFamily = (model: string) => model.split("/")[0] ?? model;

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}
export interface ChatOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
}
export interface Nim {
  chat(messages: ChatMessage[], opts: ChatOptions): Promise<string>;
}

export class DeadlineError extends Error {
  constructor(message = "out of time in this tick") {
    super(message);
    this.name = "DeadlineError";
  }
}

export const isDeadline = (err: unknown): err is DeadlineError => err instanceof DeadlineError;

/** Longest single NIM request (Python's client used 120 s). */
const CALL_TIMEOUT_MS = 120_000;
/** Don't start a request with less than this left. */
const MIN_CALL_MS = 20_000;

export interface NimClientOptions {
  /** Epoch ms by which the call must be done (default: none). */
  deadline?: number;
  now?: () => number;
  log?: (line: string) => void;
  /** nimChat's wait before its one retry (default 2 s). */
  backoffMs?: number;
  /** Wait before this client's second try (default 4 s). */
  retryDelayMs?: number;
}

export class NimClient implements Nim {
  private deadline: number;
  private now: () => number;
  private log: (line: string) => void;
  private backoffMs: number;
  private retryDelayMs: number;

  constructor(o: NimClientOptions = {}) {
    this.deadline = o.deadline ?? Number.POSITIVE_INFINITY;
    this.now = o.now ?? Date.now;
    this.log = o.log ?? (() => {});
    this.backoffMs = o.backoffMs ?? 2_000;
    this.retryDelayMs = o.retryDelayMs ?? 4_000;
  }

  async chat(messages: ChatMessage[], opts: ChatOptions): Promise<string> {
    const system = messages.find((m) => m.role === "system")?.content ?? "";
    const user = messages.filter((m) => m.role === "user").map((m) => m.content).join("\n");
    for (let attempt = 1; ; attempt++) {
      const remaining = this.deadline - this.now();
      // nimChat makes up to 2 requests (1 retry), so each gets half the time left.
      const timeoutMs = Math.min(CALL_TIMEOUT_MS, Math.floor((remaining - 5_000) / 2));
      if (timeoutMs < MIN_CALL_MS / 2) throw new DeadlineError();
      // A hard stop on top of nimChat's per-request abort: a request that
      // hangs past its abort (seen in practice: one hung for 17 minutes)
      // must never hold the tick beyond its budget.
      const hardMs = 2 * timeoutMs + this.backoffMs + 2_000;
      let hardTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          nimChat(system, user, {
            model: opts.model,
            temperature: opts.temperature ?? 0.4,
            maxTokens: opts.maxTokens ?? 4096,
            timeoutMs,
            retries: 1,
            backoffMs: this.backoffMs,
          }),
          new Promise<never>((_, reject) => {
            hardTimer = setTimeout(
              () => reject(new NIMError(`NIM request timed out after ${Math.round(hardMs / 1000)}s.`, "timeout")),
              hardMs
            );
          }),
        ]);
      } catch (err) {
        if (err instanceof NIMError && err.code === "timeout" && timeoutMs < CALL_TIMEOUT_MS * 0.8) {
          // Cut short by the tick, not a slow model: run it again next tick.
          throw new DeadlineError(`NIM ${opts.model}: request cut short by the tick budget`);
        }
        // 429, 5xx, timeouts and dropped connections are worth another try;
        // other errors (bad request, auth) are not, as in the Python client.
        const clientError = err instanceof NIMError && /status 4\d\d\b/.test(err.message) && err.code !== "rate_limited";
        const retryable =
          err instanceof NIMError && !clientError && ["rate_limited", "server", "network", "timeout"].includes(err.code);
        if (!retryable || attempt >= 2) throw err;
        this.log(`NIM ${opts.model}: ${(err as NIMError).code}, retry ${attempt} in ${(this.retryDelayMs / 1000).toFixed(1)}s`);
        await new Promise((r) => setTimeout(r, this.retryDelayMs));
      } finally {
        clearTimeout(hardTimer);
      }
    }
  }
}
