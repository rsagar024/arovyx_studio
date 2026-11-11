/**
 * Runs the Quiz Master jobs as short, resumable steps.
 *
 * A full question-bank run took up to ~40 minutes on GitHub Actions, but a
 * Vercel function stops after ~5. So a run is a list of steps in Firestore,
 * and each `tick` (one API call from the Studio tab) does as many as fit in
 * a 240 s budget, then returns. The page calls `tick` again until the run is
 * done. If the tab closes, the run waits in the database and the next tick,
 * from any tab, carries on.
 *
 * Firestore's free plan counts every document read and written, so a tick
 * reads the run and its pending steps once, works in memory, and saves with
 * one batched write (`repo.commit`): at the end of the tick, right after any
 * unit that changed something outside the run (a category written, publish,
 * a push, a cleanup page), and otherwise at most once a minute, so a killed
 * function loses a minute of work at most.
 *
 * When every model of a unit times out, that's the models' fault, not the
 * unit's: it isn't counted as an attempt. It is a "deferral": the unit is made
 * smaller (`shrinkUnit`) and tried again next tick, and fails only after
 * `MAX_DEFERRALS` of them.
 *
 * Order, as in `question-bank.yml`:
 *   per category (up to 3 at once): prepare → generate → verify → (retries)
 *     → translate hi → translate hi-Latn → write        [generator.ts]
 *   then publish → daily quiz (not on the pm slot) → notify (+ weekly on
 *   Mondays) → guest cleanup (an automatic run, at most once a day)
 * A category that fails is recorded and doesn't stop the others; publish
 * always runs after the categories, like `if: always()` did.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import type { Group } from "./assets";
import { ALL_CATEGORIES } from "./categories";
import { Notifier, SendFailed, errMessage, errName } from "./dailyNotify";
import { DailyJob, NotEnoughQuestions } from "./dailyQuiz";
import { FirebaseNoPermission, FirebaseNotConfigured } from "./firebase";
import { describeUnit, estimateRemaining, Generator, shrinkUnit, startState, unitKey, type GenState } from "./generator";
import { cleanupPage, startCleanup, type CleanupState } from "./guestCleanup";
import { cleanLine, levelOf } from "./log";
import { isDeadline, type DeadlineError } from "./nimClient";
import { notifyNewQuestions } from "./notifyQuestions";
import { publish, seed } from "./publish";
import type { RunRepo, RunRow, StepInfo, StepRow } from "./repo";
import type { JobContext, JobDeps } from "./runtime";
import { weeklySummary } from "./weekly";

export const TICK_BUDGET_MS = 240_000;
/**
 * The tick lease outlives the budget so a slow last unit can't overlap the
 * next tick, but not by much: a tick that was killed (it never released the
 * lease) blocks the run only this long.
 */
export const TICK_LEASE_MS = 270_000;
/** How often a tick re-reads the run to see if it was cancelled. */
const CANCEL_CHECK_MS = 60_000;
/** Save at least this often while a tick works (and always at its end). */
const CHECKPOINT_MS = 60_000;
/** Ticks in which every model of a unit may time out before the unit fails. */
export const MAX_DEFERRALS = 6;
export const RUN_LEASE_MS = 10 * 60_000;
export const MAX_ATTEMPTS = 3;
export const MAX_LANES = 3;
export const RETENTION_DAYS = 60;
/** Don't start a model-free unit with less than this left. */
const MIN_LOCAL_UNIT_MS = 30_000;
/** Don't start a post step (it may call a model and FCM) with less than this. */
const MIN_POST_UNIT_MS = 60_000;
/** A unit that ran out of time although it started with this much left can never fit: count it. */
const FRESH_TICK_MS = 200_000;
const POST = 100_000;

export type RunKind = "question_bank" | "guest_cleanup" | "seed";
export type RunStatus = "queued" | "running" | "succeeded" | "partial" | "failed" | "cancelled";

export interface RunOptions {
  /** IST date of the run (`yyyy-MM-dd`). */
  date: string;
  force: boolean;
  dryRun: boolean;
  categories: string[];
  mode: "daily" | "seed";
  /** A scheduled run (timer or Run now): finishing restarts the countdown. */
  scheduled: boolean;
  /** Pressed Run now: always push, unless this run's own daily quiz push just went out. */
  runNow?: boolean;
  /** Guest cleanup as the last step (automatic runs, once a day). */
  cleanup?: { days: number; dryRun: boolean } | null;
  /** guest_cleanup runs. */
  days?: number;
}

export interface CategoryResult {
  status: "exists" | "published" | "empty" | "failed";
  added?: number;
  doc?: string;
  error?: string;
}

export interface RunSummary {
  categories?: Record<string, CategoryResult>;
  steps?: Record<string, { status: string; error?: string; [k: string]: unknown }>;
  current?: string;
  cleanup?: CleanupState["counts"];
}

export interface Progress {
  done: number;
  total: number;
  current: string;
}

export interface TickResult {
  status: string;
  done: boolean;
  busy?: boolean;
  progress: Progress;
}

export interface EngineDeps {
  repo: RunRepo;
  makeJobs: (ctx: JobContext) => JobDeps;
  clock?: () => number;
  budgetMs?: number;
  /** Called once when a run ends (not on cancel): restart the countdown etc. */
  onFinish?: (run: RunRow, summary: RunSummary) => Promise<void>;
}

const parse = <T>(text: string, fallback: T): T => {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
};

/** The step rows a new run starts with. */
export function planSteps(kind: RunKind, slot: string, options: RunOptions) {
  if (kind === "guest_cleanup") {
    return [{ key: "guest_cleanup", order: POST, state: JSON.stringify(startCleanup(options.days ?? 30, options.dryRun)) }];
  }
  if (kind === "seed" || options.mode === "seed") {
    return [
      { key: "seed", order: POST, state: "{}" },
      { key: "publish", order: POST + 1, state: "{}" },
    ];
  }
  const cats = ALL_CATEGORIES.filter((c) => options.categories.includes(c));
  const steps = cats.map((c, i) => ({
    key: `${c}:prepare`,
    order: i * 1000,
    state: JSON.stringify(startState(c, options.date, slot, options.force)),
  }));
  steps.push({ key: "publish", order: POST + 1, state: "{}" });
  // The daily quiz only runs in the morning, as before.
  if (slot !== "pm") steps.push({ key: "daily_quiz", order: POST + 2, state: "{}" });
  steps.push({ key: "notify", order: POST + 3, state: "{}" });
  if (options.cleanup) {
    steps.push({
      key: "guest_cleanup",
      order: POST + 4,
      state: JSON.stringify(startCleanup(options.cleanup.days, options.cleanup.dryRun)),
    });
  }
  return steps;
}

export async function createRun(
  deps: Pick<EngineDeps, "repo" | "clock">,
  input: { kind: RunKind; trigger: "timer" | "manual"; slot: string; options: RunOptions }
) {
  const now = new Date((deps.clock ?? Date.now)());
  await deps.repo.pruneBefore(new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000));
  const planned = planSteps(input.kind, input.slot, input.options);
  const result = await deps.repo.createRunIfFree(
    {
      kind: input.kind,
      trigger: input.trigger,
      slot: input.slot,
      options: JSON.stringify(input.options),
      summary: "{}",
      progress: JSON.stringify({ done: 0, total: planned.length, current: "" }),
      stepList: JSON.stringify(planned.map((s) => ({ key: s.key, order: s.order, status: "pending", attempts: 0 }))),
    },
    planned,
    now,
    new Date(now.getTime() + RUN_LEASE_MS)
  );
  if (result.created) {
    const what = input.kind === "question_bank" ? `${input.options.mode} ${input.options.date} ${input.slot}` : input.kind;
    await deps.repo.addLogs(result.run.id, [
      {
        at: now,
        level: "info",
        message: cleanLine(
          `run started (${input.trigger}${input.options.dryRun ? ", dry run" : ""}): ${what}` +
            (input.kind === "question_bank" && input.options.mode === "daily" ? ` — ${input.options.categories.join(", ")}` : "")
        ),
      },
    ]);
  }
  return result;
}

const isCategoryStep = (s: { order: number }) => s.order < POST;
const categoryOf = (s: { key: string }) => s.key.split(":")[0]!;
const finished = (s: { status: string }) => s.status !== "pending";

/** The models that answered a finished step; none for older runs or model-free steps. */
export function stepModels(state: string): string[] {
  try {
    const models = (JSON.parse(state) as { models?: unknown } | null)?.models;
    return Array.isArray(models) ? models.filter((m): m is string => typeof m === "string") : [];
  } catch {
    return [];
  }
}

/** A step in brief, for the run doc's `stepList`. */
export function stepInfo(s: StepRow): StepInfo {
  const info: StepInfo = { key: s.key, order: s.order, status: s.status, attempts: s.attempts };
  if (s.deferrals) info.deferrals = s.deferrals;
  if (s.error) info.error = s.error.slice(0, 200);
  if (s.status !== "pending") {
    const models = stepModels(s.state);
    if (models.length) info.models = models;
  }
  return info;
}

/** The run's `stepList`, or null on runs from before it existed. */
export function stepListOf(run: Pick<RunRow, "stepList">): StepInfo[] | null {
  if (!run.stepList) return null;
  const list = parse<StepInfo[] | null>(run.stepList, null);
  return Array.isArray(list) ? list : null;
}

/** Progress for the page, from the steps (pending ones with their state). */
export function progressOf(steps: Array<{ status: string; order: number; state?: string }>, summary: RunSummary): Progress {
  let done = 0;
  let remaining = 0;
  for (const s of steps) {
    if (finished(s)) done++;
    else if (isCategoryStep(s)) remaining += Math.max(1, estimateRemaining(parse<GenState>(s.state ?? "{}", {} as GenState)));
    else remaining += 1;
  }
  return { done, total: done + remaining, current: summary.current ?? "" };
}

/** The progress the last tick saved on the run: no step reads (busy tabs, the status card). */
export function cachedProgress(run: RunRow): Progress {
  const saved = parse<Partial<Progress>>(run.progress ?? "", {});
  const current = parse<RunSummary>(run.summary, {}).current ?? saved.current ?? "";
  const done = saved.done ?? 0;
  const total = Math.max(saved.total ?? 0, done);
  return run.status === "running" ? { done, total, current } : { done: total, total, current: "" };
}

export async function snapshot(repo: RunRepo, runId: string): Promise<TickResult> {
  const run = await repo.getRun(runId);
  if (!run) throw new RunNotFound();
  return { status: run.status, done: run.status !== "running", progress: cachedProgress(run) };
}

export class RunNotFound extends Error {
  constructor() {
    super("Run not found.");
    this.name = "RunNotFound";
  }
}

/** Errors that will fail the same way however often they're retried. */
const isFatal = (err: unknown) =>
  err instanceof NotEnoughQuestions || err instanceof FirebaseNotConfigured || err instanceof FirebaseNoPermission;

/**
 * What a `DeadlineError` means for the unit that hit it:
 * - `stop`: the tick is out of time; the unit runs again next tick, uncounted;
 * - `skip`: this lane's models are all benched for the rest of the tick
 *   (another lane found them slow); go on with other work, uncounted;
 * - `defer`: every model was asked, with a fresh tick's time, and none
 *   answered: count a deferral and make the unit smaller.
 */
function deadlineOutcome(err: DeadlineError, startedWith: number): "stop" | "skip" | "defer" {
  if (err.reason === "benched") return "skip";
  if (err.reason === "timed_out" && startedWith >= FRESH_TICK_MS) return "defer";
  return "stop";
}

export async function tick(deps: EngineDeps, runId: string): Promise<TickResult> {
  const clock = deps.clock ?? Date.now;
  const repo = deps.repo;
  const t0 = clock();
  const deadline = t0 + (deps.budgetMs ?? TICK_BUDGET_MS);
  const run = await repo.getRun(runId);
  if (!run) throw new RunNotFound();
  if (run.status !== "running") return { status: run.status, done: true, progress: cachedProgress(run) };

  const token = randomUUID();
  const acquired = await repo.acquireTick(
    runId,
    token,
    new Date(t0),
    new Date(t0 + TICK_LEASE_MS),
    new Date(t0 + RUN_LEASE_MS)
  );
  // Another tab's tick holds the run: answer from the run doc just read.
  if (!acquired) return { status: run.status, done: false, busy: true, progress: cachedProgress(run) };

  const options = parse<RunOptions>(run.options, {} as RunOptions);
  const summary = parse<RunSummary>(run.summary, {});
  summary.categories ??= {};
  summary.steps ??= {};

  // --- The run's steps, in memory for the whole tick -------------------
  // Pending steps are read in full; finished ones only as the run's
  // `stepList` (runs from before it existed read every step once).
  const infos = new Map<string, StepInfo>();
  const rows = new Map<string, StepRow>();
  const loadAll = async () => {
    infos.clear();
    rows.clear();
    for (const s of await repo.steps(runId)) {
      infos.set(s.key, stepInfo(s));
      if (!finished(s)) rows.set(s.key, s);
    }
  };
  const list = stepListOf(run);
  if (list) {
    for (const i of list) infos.set(i.key, i);
    for (const s of await repo.pendingSteps(runId)) {
      rows.set(s.key, s);
      infos.set(s.key, stepInfo(s));
    }
    // The list and the step docs are saved together, so they agree; if not, trust the docs.
    if ([...infos.values()].some((i) => !finished(i) && !rows.has(i.key))) await loadAll();
  } else {
    await loadAll();
  }
  const dirty = new Set<string>();
  const put = (row: StepRow) => {
    rows.set(row.key, row);
    infos.set(row.key, stepInfo(row));
    dirty.add(row.key);
  };
  const ordered = () => [...infos.values()].sort((a, b) => a.order - b.order);
  const progressNow = () => progressOf(ordered().map((i) => rows.get(i.key) ?? i), summary);

  // Log lines are buffered and saved with the next commit.
  let buffer: Array<{ at: Date; level: string; message: string }> = [];
  const logger = (prefix: string) => (line: string) => {
    const message = cleanLine(prefix ? `[${prefix}] ${line}` : line);
    buffer.push({ at: new Date(clock()), level: levelOf(line), message });
  };

  let progress: Progress = cachedProgress(run);
  let lastCommit = clock();
  /** Saves everything changed so far in one batched write (lanes queue up in the repo). */
  const commitNow = async (extra: Partial<RunRow> = {}) => {
    const steps = [...dirty].map((k) => rows.get(k)!);
    dirty.clear();
    const logs = buffer;
    buffer = [];
    lastCommit = clock();
    progress = progressNow();
    try {
      await repo.commit(runId, {
        steps,
        logs,
        run: {
          summary: JSON.stringify(summary),
          progress: JSON.stringify(progress),
          stepList: JSON.stringify(ordered()),
          // Renew the run lease with the same write, unless Cancel ended the run.
          ...(wasCancelled ? {} : { lockedUntil: new Date(clock() + RUN_LEASE_MS) }),
          ...extra,
        },
      });
    } catch (err) {
      // Not saved: keep it for the next try.
      for (const st of steps) dirty.add(st.key);
      buffer = [...logs, ...buffer];
      throw err;
    }
  };
  const checkpoint = (force = false) => (force || clock() - lastCommit >= CHECKPOINT_MS ? commitNow() : Promise.resolve());

  const timeLeft = () => deadline - clock();
  let cancelCheckedAt = clock();
  let wasCancelled = false;
  const cancelled = async (fresh = false) => {
    if (wasCancelled) return true;
    if (!fresh && clock() - cancelCheckedAt < CANCEL_CHECK_MS) return false;
    cancelCheckedAt = clock();
    wasCancelled = (await repo.getRun(runId))?.status !== "running";
    return wasCancelled;
  };

  let jobs: JobDeps | null = null;
  const jobsFor = (): JobDeps => {
    jobs ??= deps.makeJobs({ dryRun: Boolean(options.dryRun), deadline, log: logger(""), now: clock });
    return jobs;
  };

  /** One line per tick on what it cost in Firestore, to keep an eye on the free plan. */
  const logUsage = () => {
    const u = repo.takeUsage?.(runId);
    const bank = jobs?.usage?.();
    const parts: string[] = [];
    // +1 write: the commit this line goes out with.
    if (u) parts.push(`runs ${u.reads} reads, ${u.writes + 1} writes`);
    if (bank) parts.push(`bank ${bank.reads} reads, ${bank.writes} writes`);
    if (parts.length) logger("")(`firestore this tick (about): ${parts.join("; ")}`);
  };

  /** Counts a deferral (every model timed out); the unit fails after the last one. */
  const defer = (row: StepRow, state: GenState | null, label: string, log: (l: string) => void, err: Error) => {
    const deferrals = (row.deferrals ?? 0) + 1;
    const smaller = state ? shrinkUnit(state) : false;
    const message = `${errName(err)}: ${errMessage(err)}`;
    if (deferrals >= MAX_DEFERRALS) {
      const error = cleanLine(`${message} (in ${deferrals} ticks: the models are too slow right now)`);
      log(`${label} failed: ${error}`);
      const failed: StepRow = { ...row, status: "failed", deferrals, error };
      put(failed);
      return { row: failed, failed: true };
    }
    log(
      `${label}: every model timed out (${deferrals}/${MAX_DEFERRALS}, not counted as an attempt)` +
        (smaller && state ? `; next try is smaller (${describeUnit(state)})` : "; trying again next tick")
    );
    const next: StepRow = { ...row, deferrals, error: cleanLine(message), ...(state ? { state: JSON.stringify(state) } : {}) };
    put(next);
    return { row: next, failed: false };
  };

  let outOfTime = false;
  let finalStatusValue: string | null = null;
  try {
    // --- Category chains, up to 3 at once ------------------------------
    const heads = new Map<string, StepRow>();
    for (const s of [...rows.values()].filter((x) => isCategoryStep(x) && !finished(x)).sort((a, b) => a.order - b.order)) {
      const cat = categoryOf(s);
      const prev = heads.get(cat);
      // An older pending row of the same category was superseded by a
      // crash between "add next" and "mark done": close it.
      if (prev) put({ ...prev, status: "done" });
      heads.set(cat, s);
    }
    const queue = [...heads.values()].sort((a, b) => a.order - b.order);

    /** "done": the category finished; "time": the tick is over; "skip": try it again next tick. */
    const runChain = async (first: StepRow): Promise<"done" | "time" | "skip"> => {
      let row = first;
      const cat = categoryOf(row);
      const log = logger(cat);
      for (;;) {
        if (timeLeft() < MIN_LOCAL_UNIT_MS) return "time";
        if (await cancelled()) return "time";
        const state = parse<GenState>(row.state, startState(cat, options.date, run.slot, options.force));
        const label = describeUnit(state);
        summary.current = `${cat} · ${label}`;
        const startedWith = timeLeft();
        let next: GenState;
        try {
          const j = jobsFor();
          const generator = new Generator({ store: j.bank, nim: j.nim, models: j.models, seed: j.seed, log });
          next = await generator.step(state);
        } catch (err) {
          if (isDeadline(err)) {
            const outcome = deadlineOutcome(err, startedWith);
            if (outcome === "stop") return "time";
            if (outcome === "skip") return "skip";
            const d = defer(row, state, label, log, err);
            if (d.failed) {
              summary.categories![cat] = { status: "failed", error: d.row.error!.slice(0, 300) };
              await checkpoint(true);
              return "done";
            }
            await checkpoint();
            return "skip";
          }
          const attempts = row.attempts + 1;
          const message = `${errName(err)}: ${errMessage(err)}`;
          log(`${label} failed (attempt ${attempts}/${MAX_ATTEMPTS}): ${message}`);
          if (attempts >= MAX_ATTEMPTS || isFatal(err)) {
            put({ ...row, status: "failed", attempts, error: cleanLine(message) });
            summary.categories![cat] = { status: "failed", error: cleanLine(message).slice(0, 300) };
            await checkpoint(true);
            return "done";
          }
          row = { ...row, attempts, error: cleanLine(message) };
          put(row);
          await checkpoint();
          continue;
        }
        if (next.phase === "done") {
          const result: CategoryResult = { status: next.status! };
          if (next.doc) {
            result.added = next.groups.length;
            result.doc = next.doc.id;
          }
          summary.categories![cat] = result;
          put({ ...row, status: "done", state: JSON.stringify({ ...result, models: next.unitModels ?? [] }), error: null });
          // The category may have just been written to the bank: save now.
          await checkpoint(true);
          return "done";
        }
        const key = unitKey(next);
        const existing = rows.get(key);
        const added: StepRow =
          existing && !finished(existing)
            ? existing
            : {
                id: `${runId}|${key}`,
                runId,
                key,
                order: row.order + 1,
                status: "pending",
                attempts: 0,
                deferrals: 0,
                state: JSON.stringify(next),
                error: null,
                updatedAt: new Date(clock()),
              };
        // One commit saves both, so a crash can't leave one without the other.
        put(added);
        put({ ...row, status: "done", state: JSON.stringify({ models: next.unitModels ?? [] }), error: null });
        row = added;
        await checkpoint();
      }
    };

    if (queue.length) {
      await Promise.all(
        Array.from({ length: Math.min(MAX_LANES, queue.length) }, async () => {
          for (;;) {
            if (outOfTime) return;
            const head = queue.shift();
            if (!head) return;
            if ((await runChain(head)) === "time") {
              outOfTime = true;
              return;
            }
          }
        })
      );
    }

    // --- Post steps, in order, once every category is finished --------
    const categoriesLeft = [...infos.values()].some((s) => isCategoryStep(s) && !finished(s));
    if (!outOfTime && !categoriesLeft) {
      for (const info of ordered().filter((s) => !isCategoryStep(s) && !finished(s))) {
        let row = rows.get(info.key)!;
        for (;;) {
          if (timeLeft() < MIN_POST_UNIT_MS || (await cancelled())) {
            outOfTime = true;
            break;
          }
          summary.current = row.key.replace("_", " ");
          const log = logger(row.key);
          const startedWith = timeLeft();
          try {
            const outcome = await runPostUnit(row, jobsFor(), options, run, summary, log, clock);
            if (outcome.more) {
              // A paged unit with more to do: save and go again.
              row = { ...row, state: outcome.state ?? row.state, error: null };
              put(row);
              await checkpoint(true);
              continue;
            }
            put({ ...row, status: "done", error: null, ...(outcome.state ? { state: outcome.state } : {}) });
            // Post steps publish and push: save at once.
            await checkpoint(true);
            break;
          } catch (err) {
            if (isDeadline(err)) {
              if (deadlineOutcome(err, startedWith) === "defer") {
                const d = defer(row, null, row.key, log, err);
                if (d.failed) {
                  summary.steps![row.key] = { ...(summary.steps![row.key] ?? {}), status: "failed", error: d.row.error!.slice(0, 300) };
                  await checkpoint(true);
                  break;
                }
              }
              // The steps run in order: the rest waits for the next tick.
              outOfTime = true;
              break;
            }
            const attempts = row.attempts + 1;
            const message = `${errName(err)}: ${errMessage(err)}`;
            log(`failed (attempt ${attempts}/${MAX_ATTEMPTS}): ${message}`);
            if (attempts >= MAX_ATTEMPTS || isFatal(err)) {
              put({ ...row, status: "failed", attempts, error: cleanLine(message) });
              summary.steps![row.key] = { ...(summary.steps![row.key] ?? {}), status: "failed", error: cleanLine(message).slice(0, 300) };
              await checkpoint(true);
              break;
            }
            row = { ...row, attempts, error: cleanLine(message) };
            put(row);
            await checkpoint();
          }
        }
        if (outOfTime) break;
      }
    }

    // --- Finished? -----------------------------------------------------
    if (![...infos.values()].some((s) => !finished(s)) && !(await cancelled(true))) {
      const status = finalStatus(run.kind as RunKind, ordered(), summary);
      summary.current = "";
      const finishedAt = new Date(clock());
      logger("")(`run finished: ${status}`);
      logUsage();
      finalStatusValue = status;
      const total = progressNow().total;
      await commitNow({ status, finishedAt, lockedUntil: null, progress: JSON.stringify({ done: total, total, current: "" }) });
      progress = { done: total, total, current: "" };
      if (deps.onFinish) {
        await deps.onFinish({ ...run, status, finishedAt, lockedUntil: null, summary: JSON.stringify(summary) }, summary);
      }
    } else {
      logUsage();
      await commitNow();
    }
  } finally {
    if (dirty.size || buffer.length) await commitNow().catch(() => {});
    await repo.releaseTick(runId, token);
  }
  if (finalStatusValue) return { status: finalStatusValue, done: true, progress: { ...progress, done: progress.total, current: "" } };
  if (wasCancelled) return { status: "cancelled", done: true, progress };
  return { status: "running", done: false, progress };
}

/** succeeded: everything worked; partial: something failed; failed: nothing useful happened. */
export function finalStatus(kind: RunKind, steps: Array<Pick<StepRow, "key" | "status">>, summary: RunSummary): RunStatus {
  const failedSteps = steps.filter((s) => s.status === "failed");
  const cats = Object.values(summary.categories ?? {});
  const badCats = cats.filter((c) => c.status === "failed" || c.status === "empty");
  if (kind !== "question_bank" || !cats.length) {
    // seed, guest cleanup: their main step decides.
    if (!failedSteps.length) return "succeeded";
    const main = failedSteps.some((s) => s.key === "seed" || s.key === "publish" || kind === "guest_cleanup");
    return main ? "failed" : "partial";
  }
  const publishFailed = failedSteps.some((s) => s.key === "publish");
  if (publishFailed && badCats.length === cats.length) return "failed";
  if (failedSteps.length || badCats.length) return "partial";
  return "succeeded";
}

interface PostOutcome {
  /** The unit's new state, to save. */
  state?: string;
  /** A paged unit with more to do. */
  more?: boolean;
}

async function runPostUnit(
  row: StepRow,
  jobs: JobDeps,
  options: RunOptions,
  run: RunRow,
  summary: RunSummary,
  log: (line: string) => void,
  clock: () => number
): Promise<PostOutcome> {
  const now = new Date(clock());
  const steps = (summary.steps ??= {});
  switch (row.key) {
    case "seed": {
      await seed(jobs.bank, jobs.seed as Record<string, Group[]>, log);
      steps.seed = { status: "done" };
      return {};
    }
    case "publish": {
      const m = await publish({ store: jobs.bank, commit: (w) => jobs.docs.commit(w), now, log });
      steps.publish = {
        status: "done",
        version: m.version,
        docs: m.files.length,
        groups: Object.values(m.counts).reduce((a, b) => a + b, 0),
      };
      return {};
    }
    case "daily_quiz": {
      const answeredBy = new Set<string>();
      const notifier = new Notifier({
        nim: {
          chat: (messages, opts) =>
            jobs.nim.chat(messages, {
              ...opts,
              onAnswer: (model) => {
                answeredBy.add(model);
                opts.onAnswer?.(model);
              },
            }),
        },
        models: jobs.models,
        messenger: jobs.messenger,
        commit: (w) => jobs.docs.commit(w),
        now,
        dryRun: options.dryRun,
        force: options.force,
        log,
        remoteConfig: jobs.remoteConfig,
      });
      const job = new DailyJob({
        docs: jobs.docs,
        bank: jobs.bank,
        now,
        force: options.force,
        log,
        notify: (date, challenge, docs) => notifier.run(date, challenge, docs),
      });
      try {
        const status = await job.run(options.date);
        steps.daily_quiz = { status };
        if (status === "notify_failed") throw new SendFailed("the daily quiz push failed; retrying the missing languages");
      } catch (err) {
        if (err instanceof NotEnoughQuestions) {
          log(`Not published: ${err.message}. The app falls back to its local quiz at noon.`);
        }
        throw err;
      }
      return { state: JSON.stringify({ models: [...answeredBy] }) };
    }
    case "notify": {
      const problems: string[] = [];
      let newQuestions = "";
      let weekly = "";
      const read = (p: string) => jobs.docs.read(p);
      const commit = (w: Parameters<typeof jobs.docs.commit>[0]) => jobs.docs.commit(w);
      try {
        newQuestions = await notifyNewQuestions(
          {
            bank: jobs.bank,
            messenger: jobs.messenger,
            read,
            commit,
            now,
            dryRun: options.dryRun,
            log,
            dailyQuizCoversFrom: options.runNow ? run.startedAt : undefined,
          },
          options.date,
          run.slot
        );
      } catch (err) {
        if (!(err instanceof SendFailed)) throw err;
        log(`The push failed (${err.message}); retrying.`);
        problems.push("new_questions");
      }
      try {
        weekly = await weeklySummary(
          { messenger: jobs.messenger, read, commit, played: (w) => jobs.docs.weekPlayed(w), dryRun: options.dryRun, log },
          options.date
        );
      } catch (err) {
        if (isDeadline(err)) throw err;
        log(`The weekly push failed (${errName(err)}: ${errMessage(err)}); retrying.`);
        problems.push("weekly");
      }
      steps.notify = { status: problems.length ? "failed" : "done", newQuestions, weekly };
      if (problems.length) throw new SendFailed(`not sent: ${problems.join(", ")}`);
      return {};
    }
    case "guest_cleanup": {
      if (!jobs.users) throw new FirebaseNotConfigured();
      const state = await cleanupPage(jobs.users, parse<CleanupState>(row.state, startCleanup(30, true)), clock(), log);
      summary.cleanup = state.counts;
      steps.guest_cleanup = { status: state.done ? "done" : "running", ...state.counts, days: state.days, dryRun: state.dryRun };
      return { state: JSON.stringify(state), more: !state.done };
    }
    default:
      throw new Error(`unknown step ${row.key}`);
  }
}
