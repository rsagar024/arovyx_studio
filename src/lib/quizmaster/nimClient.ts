/**
 * The models the jobs call, on top of `src/lib/nim.ts` (`nimChat`), with
 * automatic failover over `MODEL_POOL`. A model that errors is replaced at
 * once. A model that is merely slow keeps going while the next one is asked
 * too, and the first answer wins: response times on this key swing from
 * seconds to minutes, so cancelling a slow request would throw away the wait.
 *
 * Python used `NIM_GEN_MODEL` / `NIM_VERIFY_MODEL` / `NIM_TRANSLATE_MODEL`.
 * Here they are `QUIZMASTER_*_MODEL`, and each sets a job's first choice. The
 * verifier must be a different model family from the generator, so it doesn't
 * share the generator's mistakes: `excludeFamilies` holds that line through
 * every failover.
 *
 * The pool, measured on this key on 2026-11-05 against the real question bank:
 * - `nvidia/nemotron-3.5-super-vl-120b-a12b`: generates and translates. It won a
 *   head-to-head (45/45 on geography and science, 11 duplicates across three
 *   categories, against 176 for lightning), so the owner's "use the best" put
 *   it first though it isn't on their list.
 * - `nvidia/nemotron-3.5-lightning-30b-a3b` and `nvidia/nemotron-3.5-bolt-e4b`:
 *   the owner's choices, kept as fallbacks. Lightning overruns the token limit
 *   and both repeat questions. None of the three may verify another's work, as
 *   they're one family.
 * - `mistralai/mistral-large-4-1t-a52b` and `google/gemma-4-31b-it`: the only
 *   other families, and slow, so verify asks both at once (`hedge`).
 *
 * The rest of the owner's list answers HTTP 404 or 410.
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

/** Failover order. A job's first choice is tried before these. */
export const MODEL_POOL = [
  "nvidia/nemotron-3.5-super-vl-120b-a12b",
  "nvidia/nemotron-3.5-lightning-30b-a3b",
  "nvidia/nemotron-3.5-bolt-e4b",
  "mistralai/mistral-large-4-1t-a52b",
  "google/gemma-4-31b-it",
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
  /** How many models to ask at once from the start (default 1). The first answer wins. */
  hedge?: number;
  /** Told which model answered. */
  onAnswer?: (model: string) => void;
}
export interface Nim {
  chat(messages: ChatMessage[], opts: ChatOptions): Promise<string>;
}

/**
 * Why a call gave up without an answer:
 * - `time`: the tick has too little time left (the unit runs again next tick);
 * - `timed_out`: every allowed model was asked and none answered in time;
 * - `benched`: every allowed model already timed out or refused earlier in
 *   this tick (another lane found out), so none was asked.
 */
export type DeadlineReason = "time" | "timed_out" | "benched";

export class DeadlineError extends Error {
  constructor(
    message = "out of time in this tick",
    readonly reason: DeadlineReason = "time"
  ) {
    super(message);
    this.name = "DeadlineError";
  }
}

export const isDeadline = (err: unknown): err is DeadlineError => err instanceof DeadlineError;

/** Longest wait on one model's request. */
const MODEL_TIMEOUT_MS = 180_000;
/** With no answer after this long, ask the next model too. */
const HEDGE_AFTER_MS = 45_000;
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
    /** Models that gave up on this call only (an empty reply). */
    const spent = new Set<string>();
    const remaining = () => allowed.filter((m) => !this.benched.has(m) && !spent.has(m));

    let last: NIMError | null = null;
    let asked = false;
    for (let pass = 1; pass <= PASSES; pass++) {
      const candidates = remaining();
      if (!candidates.length) break;
      asked = true;
      const outcome = await this.race(candidates, system, user, opts, spent);
      if (outcome.reply !== undefined) return outcome.reply;
      last = outcome.error ?? last;
      if (pass < PASSES && remaining().length) {
        this.log(`NIM: no model answered, retry ${pass} in ${(this.retryDelayMs / 1000).toFixed(1)}s`);
        await new Promise((r) => setTimeout(r, this.retryDelayMs));
      }
    }
    // Every model is down for now, which the next tick may not find: not this unit's fault.
    const names = allowed.map(shortName).join(", ");
    if (!asked) throw new DeadlineError(`no model left to ask in this tick (${names} timed out or refused)`, "benched");
    if (!last || last.code === "timeout") throw new DeadlineError(`${names}: every model timed out in this tick`, "timed_out");
    throw last;
  }

  /**
   * Asks `candidates` in order: `hedge` of them at once, then one more each
   * time a model fails or `HEDGE_AFTER_MS` passes with no answer. The first
   * answer wins and the other requests are aborted. Resolves with the last
   * error when none answers.
   */
  private race(
    candidates: string[],
    system: string,
    user: string,
    opts: ChatOptions,
    spent: Set<string>
  ): Promise<{ reply?: string; error?: NIMError }> {
    return new Promise((resolve, reject) => {
      const abort = new AbortController();
      let next = 0;
      let inFlight = 0;
      let settled = false;
      let cutShort = false;
      let lastError: NIMError | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        abort.abort();
        fn();
      };
      const finishIfIdle = () => {
        if (inFlight > 0) return;
        settle(() => {
          // Cut short by the tick, not a slow model: run it again next tick.
          if (cutShort) reject(new DeadlineError("NIM: request cut short by the tick budget"));
          else resolve({ error: lastError });
        });
      };
      /** The next model not asked yet, skipping any benched since this race began. */
      const peek = () => candidates.slice(next).find((m) => !this.benched.has(m));

      const launch = () => {
        clearTimeout(timer);
        const model = peek();
        if (!model) return finishIfIdle();
        // The last model to ask may use all the time left: nothing comes after
        // it, and the slow verifiers often need more than 3 minutes.
        const isLast = !candidates.slice(candidates.indexOf(model) + 1).some((m) => !this.benched.has(m));
        const cap = isLast && Number.isFinite(this.deadline) ? Number.POSITIVE_INFINITY : MODEL_TIMEOUT_MS;
        const timeoutMs = Math.min(cap, this.deadline - this.now() - 5_000);
        if (timeoutMs < MIN_CALL_MS) {
          if (inFlight === 0) settle(() => reject(new DeadlineError()));
          return;
        }
        next = candidates.indexOf(model) + 1;
        inFlight++;
        if (peek()) {
          timer = setTimeout(() => {
            const waiting = peek();
            if (waiting) {
              this.log(`NIM ${shortName(model)}: no answer after ${HEDGE_AFTER_MS / 1000}s, also asking ${shortName(waiting)}`);
            }
            launch();
          }, HEDGE_AFTER_MS);
        }
        const askedAt = this.now();
        this.ask(model, system, user, opts, timeoutMs, abort.signal).then(
          (reply) => {
            inFlight--;
            settle(() => {
              opts.onAnswer?.(model);
              resolve({ reply });
            });
          },
          (err: unknown) => {
            inFlight--;
            if (settled) return;
            const secs = Math.round((this.now() - askedAt) / 1000);
            // Every failure in the log: slow verifies were impossible to diagnose without it.
            this.log(`NIM ${shortName(model)} failed after ${secs}s: ${err instanceof NIMError ? err.code : "error"} (${String((err as Error)?.message ?? err).slice(0, 120)})`);
            // Not a model problem, or the key is at fault: every model would answer the same.
            if (!(err instanceof NIMError) || err.code === "auth" || err.code === "missing_key") {
              settle(() => reject(err));
              return;
            }
            if (err.code === "timeout" && timeoutMs < MODEL_TIMEOUT_MS * 0.8) {
              cutShort = true;
            } else {
              lastError = err;
              const refused = /status 4\d\d\b/.test(err.message) && err.code !== "rate_limited";
              if (err.code === "timeout" || refused) this.benched.add(model);
              else if (err.code === "invalid_response") spent.add(model);
              const replacement = peek();
              if (replacement) this.log(`NIM ${shortName(model)}: ${err.code}, switching to ${shortName(replacement)}`);
            }
            // A failed model is replaced at once rather than after the wait.
            launch();
            finishIfIdle();
          }
        );
      };

      const atOnce = Math.min(opts.hedge ?? 1, candidates.length);
      for (let i = 0; i < atOnce && !settled; i++) launch();
    });
  }

  /** One model: `nimChat`, plus a hard stop on top of its per-request abort: a
   * request that hangs past its abort (seen in practice: one hung for 17
   * minutes) must never hold the tick beyond its budget. */
  private async ask(
    model: string,
    system: string,
    user: string,
    opts: ChatOptions,
    timeoutMs: number,
    signal: AbortSignal
  ): Promise<string> {
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
          signal,
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
