/**
 * Runs the Quiz Master jobs as short, resumable steps.
 *
 * A full question-bank run took up to ~40 minutes on GitHub Actions, but a
 * Vercel function stops after ~5. So a run is a list of steps in Postgres,
 * and each `tick` (one API call from the Studio tab) does as many as fit in
 * a 240 s budget, saving after every unit, then returns. The page calls
 * `tick` again until the run is done. If the tab closes, the run waits in
 * the database and the next tick, from any tab, carries on.
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
import { FirebaseNotConfigured } from "./firebase";
import { describeUnit, estimateRemaining, Generator, startState, unitKey, type GenState } from "./generator";
import { cleanupPage, startCleanup, type CleanupState } from "./guestCleanup";
import { cleanLine, levelOf } from "./log";
import { isDeadline } from "./nimClient";
import { notifyNewQuestions } from "./notifyQuestions";
import { publish, seed } from "./publish";
import type { RunRepo, RunRow, StepRow } from "./repo";
import type { JobContext, JobDeps } from "./runtime";
import { weeklySummary } from "./weekly";

export const TICK_BUDGET_MS = 240_000;
/** The tick lease outlives the budget so a slow last unit can't overlap the next tick. */
export const TICK_LEASE_MS = 290_000;
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
  const result = await deps.repo.createRunIfFree(
    {
      kind: input.kind,
      trigger: input.trigger,
      slot: input.slot,
      options: JSON.stringify(input.options),
      summary: "{}",
    },
    planSteps(input.kind, input.slot, input.options),
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

const isCategoryStep = (s: StepRow) => s.order < POST;
const categoryOf = (s: StepRow) => s.key.split(":")[0]!;
const finished = (s: StepRow) => s.status !== "pending";

/** Progress for the page, from the step rows. */
export function progressOf(steps: StepRow[], summary: RunSummary): Progress {
  let done = 0;
  let remaining = 0;
  for (const s of steps) {
    if (finished(s)) done++;
    else if (isCategoryStep(s)) remaining += Math.max(1, estimateRemaining(parse<GenState>(s.state, {} as GenState)));
    else remaining += 1;
  }
  return { done, total: done + remaining, current: summary.current ?? "" };
}

export async function snapshot(repo: RunRepo, runId: string): Promise<TickResult> {
  const run = await repo.getRun(runId);
  if (!run) throw new RunNotFound();
  const steps = await repo.steps(runId);
  return {
    status: run.status,
    done: run.status !== "running",
    progress: progressOf(steps, parse<RunSummary>(run.summary, {})),
  };
}

export class RunNotFound extends Error {
  constructor() {
    super("Run not found.");
    this.name = "RunNotFound";
  }
}

/** Errors that will fail the same way however often they're retried. */
const isFatal = (err: unknown) => err instanceof NotEnoughQuestions || err instanceof FirebaseNotConfigured;

export async function tick(deps: EngineDeps, runId: string): Promise<TickResult> {
  const clock = deps.clock ?? Date.now;
  const repo = deps.repo;
  const t0 = clock();
  const deadline = t0 + (deps.budgetMs ?? TICK_BUDGET_MS);
  const run = await repo.getRun(runId);
  if (!run) throw new RunNotFound();
  if (run.status !== "running") return snapshot(repo, runId);

  const token = randomUUID();
  const acquired = await repo.acquireTick(
    runId,
    token,
    new Date(t0),
    new Date(t0 + TICK_LEASE_MS),
    new Date(t0 + RUN_LEASE_MS)
  );
  if (!acquired) return { ...(await snapshot(repo, runId)), busy: true };

  const options = parse<RunOptions>(run.options, {} as RunOptions);
  const summary = parse<RunSummary>(run.summary, {});
  summary.categories ??= {};
  summary.steps ??= {};

  // Log lines are buffered and written after every unit.
  let buffer: Array<{ at: Date; level: string; message: string }> = [];
  const logger = (prefix: string) => (line: string) => {
    const message = cleanLine(prefix ? `[${prefix}] ${line}` : line);
    buffer.push({ at: new Date(clock()), level: levelOf(line), message });
  };
  const flush = async () => {
    const lines = buffer;
    buffer = [];
    await repo.addLogs(runId, lines);
  };
  const saveSummary = async () => {
    await repo.updateRun(runId, { summary: JSON.stringify(summary) });
    await repo.renewLock(runId, token, new Date(clock() + RUN_LEASE_MS));
  };
  const timeLeft = () => deadline - clock();
  const cancelled = async () => (await repo.getRun(runId))?.status !== "running";

  let jobs: JobDeps | null = null;
  const jobsFor = (): JobDeps => {
    jobs ??= deps.makeJobs({ dryRun: Boolean(options.dryRun), deadline, log: logger(""), now: clock });
    return jobs;
  };

  let outOfTime = false;
  try {
    // --- Category chains, up to 3 at once ------------------------------
    let steps = await repo.steps(runId);
    const heads = new Map<string, StepRow>();
    for (const s of steps.filter((x) => isCategoryStep(x) && !finished(x))) {
      const cat = categoryOf(s);
      const prev = heads.get(cat);
      if (!prev || s.order > prev.order) {
        // An older pending row of the same category was superseded by a
        // crash between "add next" and "mark done": close it.
        if (prev) await repo.updateStep(prev.id, { status: "done" });
        heads.set(cat, s);
      } else {
        await repo.updateStep(s.id, { status: "done" });
      }
    }
    const queue = [...heads.values()].sort((a, b) => a.order - b.order);

    const runChain = async (first: StepRow): Promise<boolean> => {
      let row = first;
      const cat = categoryOf(row);
      const log = logger(cat);
      for (;;) {
        if (timeLeft() < MIN_LOCAL_UNIT_MS) return false;
        if (await cancelled()) return false;
        const state = parse<GenState>(row.state, startState(cat, options.date, run.slot, options.force));
        summary.current = `${cat} · ${describeUnit(state)}`;
        const startedWith = timeLeft();
        let next: GenState;
        try {
          const j = jobsFor();
          const generator = new Generator({ store: j.bank, nim: j.nim, models: j.models, seed: j.seed, log });
          next = await generator.step(state);
        } catch (err) {
          if (isDeadline(err) && startedWith < FRESH_TICK_MS) {
            await flush();
            return false;
          }
          const attempts = row.attempts + 1;
          const message = `${errName(err)}: ${errMessage(err)}`;
          log(`${describeUnit(state)} failed (attempt ${attempts}/${MAX_ATTEMPTS}): ${message}`);
          if (attempts >= MAX_ATTEMPTS || isFatal(err)) {
            await repo.updateStep(row.id, { status: "failed", attempts, error: cleanLine(message) });
            summary.categories![cat] = { status: "failed", error: cleanLine(message).slice(0, 300) };
            await flush();
            await saveSummary();
            return true;
          }
          await repo.updateStep(row.id, { attempts, error: cleanLine(message) });
          row = { ...row, attempts };
          await flush();
          continue;
        }
        if (next.phase === "done") {
          const result: CategoryResult = { status: next.status! };
          if (next.doc) {
            result.added = next.groups.length;
            result.doc = next.doc.id;
          }
          summary.categories![cat] = result;
          await repo.updateStep(row.id, {
            status: "done",
            state: JSON.stringify({ ...result, models: next.unitModels ?? [] }),
            error: null,
          });
          await flush();
          await saveSummary();
          return true;
        }
        // Add the next unit first, then close this one: a crash in between
        // leaves two pending rows, and the newer one wins (above).
        const added = await repo.addStep(runId, { key: unitKey(next), order: row.order + 1, state: JSON.stringify(next) });
        await repo.updateStep(row.id, { status: "done", state: JSON.stringify({ models: next.unitModels ?? [] }), error: null });
        row = added;
        await flush();
        await saveSummary();
      }
    };

    if (queue.length) {
      await Promise.all(
        Array.from({ length: Math.min(MAX_LANES, queue.length) }, async () => {
          for (;;) {
            if (outOfTime) return;
            const head = queue.shift();
            if (!head) return;
            if (!(await runChain(head))) {
              outOfTime = true;
              return;
            }
          }
        })
      );
    }

    // --- Post steps, in order, once every category is finished --------
    steps = await repo.steps(runId);
    const categoriesLeft = steps.some((s) => isCategoryStep(s) && !finished(s));
    if (!outOfTime && !categoriesLeft) {
      for (const step of steps.filter((s) => !isCategoryStep(s) && !finished(s))) {
        let row = step;
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
              await repo.updateStep(row.id, { state: outcome.state ?? row.state, error: null });
              row = { ...row, state: outcome.state ?? row.state };
              await flush();
              await saveSummary();
              continue;
            }
            await repo.updateStep(row.id, { status: "done", error: null, ...(outcome.state ? { state: outcome.state } : {}) });
            await flush();
            await saveSummary();
            break;
          } catch (err) {
            if (isDeadline(err) && startedWith < FRESH_TICK_MS) {
              outOfTime = true;
              await flush();
              break;
            }
            const attempts = row.attempts + 1;
            const message = `${errName(err)}: ${errMessage(err)}`;
            log(`failed (attempt ${attempts}/${MAX_ATTEMPTS}): ${message}`);
            if (attempts >= MAX_ATTEMPTS || isFatal(err)) {
              await repo.updateStep(row.id, { status: "failed", attempts, error: cleanLine(message) });
              summary.steps![row.key] = { ...(summary.steps![row.key] ?? {}), status: "failed", error: cleanLine(message).slice(0, 300) };
              await flush();
              await saveSummary();
              break;
            }
            await repo.updateStep(row.id, { attempts, error: cleanLine(message) });
            row = { ...row, attempts };
            await flush();
          }
        }
        if (outOfTime) break;
      }
    }

    // --- Finished? -----------------------------------------------------
    steps = await repo.steps(runId);
    if (!steps.some((s) => !finished(s)) && !(await cancelled())) {
      const status = finalStatus(run.kind as RunKind, steps, summary);
      summary.current = "";
      const finishedAt = new Date(clock());
      logger("")(`run finished: ${status}`);
      await flush();
      await repo.updateRun(runId, {
        status,
        finishedAt,
        lockedUntil: null,
        summary: JSON.stringify(summary),
      });
      const final = await repo.getRun(runId);
      if (final && deps.onFinish) await deps.onFinish(final, summary);
    } else {
      await flush();
      await saveSummary();
    }
  } finally {
    await flush().catch(() => {});
    await repo.releaseTick(runId, token);
  }
  return snapshot(repo, runId);
}

/** succeeded: everything worked; partial: something failed; failed: nothing useful happened. */
export function finalStatus(kind: RunKind, steps: StepRow[], summary: RunSummary): RunStatus {
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
