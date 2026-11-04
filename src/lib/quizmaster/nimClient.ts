/**
 * The models the jobs call, on top of `src/lib/nim.ts` (`nimChat`), with
 * automatic failover: when a model times out or errors, the call moves on to
 * the next one in `MODEL_POOL`.
 *
 * Python used `NIM_GEN_MODEL` / `NIM_VERIFY_MODEL` / `NIM_TRANSLATE_MODEL`.
 * Here they are `QUIZMASTER_*_MODEL`, and each sets a job's first choice. The
 * verifier must be a different model family from the generator, so it doesn't
 * share the generator's mistakes: `excludeFamilies` holds that line through
 * every failover.
 *
 * Defaults, measured on this key on 2026-11-04 with the real prompts (three
 * calls per model at once, 120 s limit):
 * - `nvidia/nemotron-3.5-super-vl-120b-a12b`: 1–4 s for every job, 12/12 on
 *   verify. First choice for generate and translate, but it can't verify its
 *   own questions.
 * - `mistralai/mistral-large-4-1t-a52b` (49 s) and
 *   `minimaxai/minimax-m3.1-flash` (57 s): 12/12 on verify, the only other
 *   models to finish it, so they share the verify work (`spread`).
 * - `google/gemma-4-31b-it` and `z-ai/glm-5.3-flash` timed out on the real
 *   prompts: last resorts.
 * - `deepseek-ai/deepseek-v4.1-flash`, the previous verifier, timed out on
 *   every verify call of a real run.
 *
 * Every call is bounded by the tick's deadline: a call that can't finish in
 * the time left throws `DeadlineError`, which ends the tick without counting
 * as a failure; the unit runs again, from its start, next tick. The same
 * happens when every model has timed out.
 */
import "server-only";
import { NIMError, nimChat } from "@/lib/nim";

export const DEFAULT_GEN_MODEL = "nvidia/nemotron-3.5-super-vl-120b-a12b";
export const DEFAULT_VERIFY_MODEL = "mistralai/mistral-large-4-1t-a52b";
export const DEFAULT_TRANSLATE_MODEL = "nvidia/nemotron-3.5-super-vl-120b-a12b";

/** Failover order, fastest first. A job's first choice is tried before these. */
export const MODEL_POOL = [
  "nvidia/nemotron-3.5-super-vl-120b-a12b",
  "mistralai/mistral-large-4-1t-a52b",
  "minimaxai/minimax-m3.1-flash",
  "google/gemma-4-31b-it",
  "z-ai/glm-5.3-flash",
];

export interface Models {
  generate: string;
  verify: string;
  translate: string;
  /** Where a call goes when its model fails. */
  pool?: string[];
}

/** An unset or empty variable uses the default. */
export function models(env: Record<string, string | undefined> = process.env): Models {
  return {
    generate: env.QUIZMASTER_GEN_MODEL || DEFAULT_GEN_MODEL,
    verify: env.QUIZMASTER_VERIFY_MODEL || DEFAULT_VERIFY_MODEL,
    translate: env.QUIZMASTER_TRANSLATE_MODEL || DEFAULT_TRANSLATE_MODEL,
    pool: MODEL_POOL,
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
  /** Models to try, in order, after `model`. */
  fallbacks?: string[];
  /** Families that must not answer this call (the verifier's rule). */
  excludeFamilies?: string[];
  /** Take turns among the first N models, so concurrent calls don't queue on one. */
  spread?: number;
  /** Told which model answered. */
  onAnswer?: (model: string) => void;
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

/** Longest wait on one model before moving to the next. */
const MODEL_TIMEOUT_MS = 90_000;
/** Don't start a request with less than this left. */
const MIN_CALL_MS = 20_000;
/** A pass over the models, then one more for the ones that may recover (429, 5xx). */
const PASSES = 2;

const shortName = (model: string) => model.split("/").pop() ?? model;

export interface NimClientOptions {
  /** Epoch ms by which the call must be done (default: none). */
  deadline?: number;
  now?: () => number;
  log?: (line: string) => void;
  /** nimChat's wait before its one retry (default 2 s). */
  backoffMs?: number;
  /** Wait before the second pass over the models (default 4 s). */
  retryDelayMs?: number;
}

/** One client lives for one tick, and its calls may overlap (one per category). */
export class NimClient implements Nim {
  private deadline: number;
  private now: () => number;
  private log: (line: string) => void;
  private backoffMs: number;
  private retryDelayMs: number;
  /** Models that timed out or refused a request: skipped until the next tick. */
  private benched = new Set<string>();
  private turn = 0;

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
    const excluded = new Set(opts.excludeFamilies ?? []);
    const allowed = [...new Set([opts.model, ...(opts.fallbacks ?? [])])].filter((m) => !excluded.has(modelFamily(m)));
    const turn = opts.spread && opts.spread > 1 ? this.turn++ : 0;
    /** Models that gave up on this call only (an empty reply). */
    const spent = new Set<string>();

    /** The models still worth trying, with this call's turn among the first few. */
    const remaining = () => {
      const usable = allowed.filter((m) => !this.benched.has(m) && !spent.has(m));
      const n = Math.min(opts.spread ?? 1, usable.length);
      if (n < 2) return usable;
      const k = turn % n;
      return [...usable.slice(k, n), ...usable.slice(0, k), ...usable.slice(n)];
    };

    let last: NIMError | null = null;
    for (let pass = 1; pass <= PASSES; pass++) {
      for (const model of remaining()) {
        if (this.benched.has(model)) continue; // another call just found it down
        const timeoutMs = Math.min(MODEL_TIMEOUT_MS, this.deadline - this.now() - 5_000);
        if (timeoutMs < MIN_CALL_MS) throw new DeadlineError();
        try {
          const reply = await this.ask(model, system, user, opts, timeoutMs);
          opts.onAnswer?.(model);
          return reply;
        } catch (err) {
          if (!(err instanceof NIMError)) throw err;
          // The key is at fault: every model would answer the same.
          if (err.code === "auth" || err.code === "missing_key") throw err;
          if (err.code === "timeout" && timeoutMs < MODEL_TIMEOUT_MS * 0.8) {
            // Cut short by the tick, not a slow model: run it again next tick.
            throw new DeadlineError(`NIM ${model}: request cut short by the tick budget`);
          }
          last = err;
          const refused = /status 4\d\d\b/.test(err.message) && err.code !== "rate_limited";
          if (err.code === "timeout" || refused) this.benched.add(model);
          else if (err.code === "invalid_response") spent.add(model);
          const next = remaining().find((m) => m !== model);
          if (next) this.log(`NIM ${shortName(model)}: ${err.code}, switching to ${shortName(next)}`);
        }
      }
      if (pass < PASSES && remaining().length) {
        this.log(`NIM: no model answered, retry ${pass} in ${(this.retryDelayMs / 1000).toFixed(1)}s`);
        await new Promise((r) => setTimeout(r, this.retryDelayMs));
      }
    }
    // Every model is down for now, which the next tick may not find: not this unit's fault.
    if (!last || last.code === "timeout") throw new DeadlineError("every model timed out in this tick");
    throw last;
  }

  /** One model: `nimChat`, plus a hard stop on top of its per-request abort: a
   * request that hangs past its abort (seen in practice: one hung for 17
   * minutes) must never hold the tick beyond its budget. */
  private async ask(model: string, system: string, user: string, opts: ChatOptions, timeoutMs: number): Promise<string> {
    const hardMs = timeoutMs + this.backoffMs + 2_000;
    let hardTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        nimChat(system, user, {
          model,
          temperature: opts.temperature ?? 0.4,
          maxTokens: opts.maxTokens ?? 4096,
          timeoutMs,
          retries: 1,
          retryOnTimeout: false,
          backoffMs: this.backoffMs,
        }),
        new Promise<never>((_, reject) => {
          hardTimer = setTimeout(
            () => reject(new NIMError(`NIM request timed out after ${Math.round(hardMs / 1000)}s.`, "timeout")),
            hardMs
          );
        }),
      ]);
    } finally {
      clearTimeout(hardTimer);
    }
  }
}
