/**
 * What the Quiz Master API routes call: the schedule, starting and driving
 * runs, and the status the Studio tab shows. Server-only.
 */
import "server-only";
import { ALL_CATEGORIES, isCategory } from "./categories";
import { cachedProgress, createRun, progressOf, tick, type EngineDeps, type RunKind, type RunOptions, type RunSummary } from "./engine";
import { firebaseConfigured } from "./firebase";
import * as ist from "./ist";
import { modelFamily, models } from "./nimClient";
import { extraSlot, isSlot, slotFor } from "./questionBank";
import type { RunRow } from "./repo";
import { makeJobDeps } from "./runtime";
import {
  cleanupDue,
  clampInterval,
  computeNextRun,
  getSchedule,
  isOverdue,
  updateSchedule,
  type ScheduleRow,
} from "./schedule";
import { repo, scheduleDb } from "./storage";

export { repo };

const parse = <T>(text: string, fallback: T): T => {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
};

/** When a run ends: restart the countdown (scheduled runs) and note a real cleanup. */
async function onFinish(run: RunRow, summary: RunSummary) {
  const options = parse<Partial<RunOptions>>(run.options, {});
  const finishedAt = run.finishedAt ?? new Date();
  const data: Partial<ScheduleRow> = {};
  if (options.scheduled) {
    const schedule = await getSchedule(scheduleDb);
    data.nextRunAt = computeNextRun(finishedAt, schedule.intervalHours);
  }
  const cleanup = summary.steps?.guest_cleanup;
  if (cleanup && cleanup.status === "done" && cleanup.dryRun === false) data.lastCleanupAt = finishedAt;
  if (Object.keys(data).length) await updateSchedule(scheduleDb, data);
}

export const engineDeps = (): EngineDeps => ({ repo, makeJobs: makeJobDeps, onFinish });

/** Which settings are present (never their values). */
export function envCheck() {
  const m = models();
  return {
    QUIZMASTER_FIREBASE_SERVICE_ACCOUNT: firebaseConfigured(),
    QUIZMASTER_FIREBASE_PROJECT_ID: Boolean(process.env.QUIZMASTER_FIREBASE_PROJECT_ID),
    QUIZMASTER_GEN_MODEL: Boolean(process.env.QUIZMASTER_GEN_MODEL),
    QUIZMASTER_VERIFY_MODEL: Boolean(process.env.QUIZMASTER_VERIFY_MODEL),
    QUIZMASTER_TRANSLATE_MODEL: Boolean(process.env.QUIZMASTER_TRANSLATE_MODEL),
    NVIDIA_NIM_API_KEY: Boolean(process.env.NVIDIA_NIM_API_KEY),
    NVIDIA_NIM_API_KEY_2: Boolean(process.env.NVIDIA_NIM_API_KEY_2),
    NVIDIA_NIM_BASE_URL: Boolean(process.env.NVIDIA_NIM_BASE_URL),
    models: m,
    modelsOk: modelFamily(m.generate) !== modelFamily(m.verify),
  };
}

export function runDto(run: RunRow) {
  return {
    id: run.id,
    kind: run.kind,
    trigger: run.trigger,
    slot: run.slot,
    status: run.status,
    options: parse<Record<string, unknown>>(run.options, {}),
    summary: parse<RunSummary>(run.summary, {}),
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    lockedUntil: run.lockedUntil?.toISOString() ?? null,
    tickActive: Boolean(run.tickUntil && run.tickUntil > new Date()),
  };
}

function scheduleDto(s: ScheduleRow, now: Date) {
  return {
    intervalHours: s.intervalHours,
    nextRunAt: s.nextRunAt?.toISOString() ?? null,
    nextRunIst: s.nextRunAt ? ist.formatIst(s.nextRunAt) : null,
    paused: s.paused,
    overdue: isOverdue(s, now),
    lastCleanupAt: s.lastCleanupAt?.toISOString() ?? null,
  };
}

/** Everything the tab needs on load and on each refresh. */
export async function statusPayload() {
  const now = new Date();
  const schedule = await getSchedule(scheduleDb, now);
  const recent = await repo.listRuns(30);
  const running = recent.filter((r) => r.status === "running");
  for (const kind of ["question_bank", "seed", "guest_cleanup"]) {
    if (!running.some((r) => r.kind === kind)) {
      const older = await repo.activeRun(kind);
      if (older) running.push(older);
    }
  }
  const activeRuns = await Promise.all(
    running.map(async (r) => ({ ...runDto(r), progress: cachedProgress(r) }))
  );
  const lastFinished = recent.find((r) => r.status !== "running") ?? null;
  return {
    serverNow: now.toISOString(),
    schedule: scheduleDto(schedule, now),
    env: envCheck(),
    active: activeRuns[0] ?? null,
    activeRuns,
    lastRun: lastFinished ? runDto(lastFinished) : null,
    runs: recent.map(runDto),
    categories: [...ALL_CATEGORIES],
  };
}

export type ScheduleAction =
  | { action: "pause" }
  | { action: "resume" }
  | { action: "reset" }
  | { action: "interval"; intervalHours: number }
  | { action: "setNext"; nextRunAt: string };

export async function changeSchedule(change: ScheduleAction) {
  const now = new Date();
  const s = await getSchedule(scheduleDb, now);
  switch (change.action) {
    case "pause":
      return updateSchedule(scheduleDb, { paused: true });
    case "resume":
      return updateSchedule(scheduleDb, { paused: false });
    case "reset":
      return updateSchedule(scheduleDb, { nextRunAt: computeNextRun(now, s.intervalHours) });
    case "interval": {
      const intervalHours = clampInterval(change.intervalHours);
      // Keep the countdown's start: move the end by the difference.
      const nextRunAt = s.nextRunAt
        ? new Date(s.nextRunAt.getTime() + (intervalHours - s.intervalHours) * 3_600_000)
        : computeNextRun(now, intervalHours);
      return updateSchedule(scheduleDb, { intervalHours, nextRunAt });
    }
    case "setNext": {
      const at = new Date(change.nextRunAt);
      // Up to a day ahead, so the timer can be lined up with, say, 07:00 IST.
      const latest = now.getTime() + 24 * 3_600_000;
      if (Number.isNaN(at.getTime())) throw new BadRequest("nextRunAt is not a date.");
      if (at.getTime() > latest) throw new BadRequest("The next run can be at most 24 hours away.");
      return updateSchedule(scheduleDb, { nextRunAt: new Date(Math.max(at.getTime(), now.getTime())) });
    }
  }
}

export class BadRequest extends Error {}
export class Conflict extends Error {
  constructor(message: string, readonly runId?: string) {
    super(message);
  }
}

export interface ManualQuestionBank {
  slot: "auto" | "am" | "pm" | "extra";
  date?: string;
  force: boolean;
  dryRun: boolean;
  mode: "daily" | "seed";
  confirm?: string;
  categories?: string[];
}

/** The scheduled run: every category, guest cleanup when the last real one is
 * over 24 h old. The timer uses the `auto` slot, so at most one run per slot.
 * Run now gets a new slot each time, so every click generates new questions
 * and pushes, as many times a day as it is pressed. */
export async function startScheduled(trigger: "timer" | "now") {
  const now = new Date();
  const s = await getSchedule(scheduleDb, now);
  if (trigger === "timer" && !isOverdue(s, now)) {
    throw new Conflict(s.paused ? "The schedule is paused." : "The next run isn't due yet.");
  }
  const options: RunOptions = {
    date: ist.dateKey(now),
    force: false,
    dryRun: false,
    categories: [...ALL_CATEGORIES],
    mode: "daily",
    scheduled: true,
    runNow: trigger === "now",
    cleanup: cleanupDue(s.lastCleanupAt, now) ? { days: 30, dryRun: false } : null,
  };
  return trigger === "timer"
    ? start("question_bank", "timer", slotFor(now), options)
    : start("question_bank", "manual", extraSlot(now), options);
}

export async function startManual(body: ManualQuestionBank) {
  const now = new Date();
  const date = body.date || ist.dateKey(now);
  if (!ist.isDateKey(date)) throw new BadRequest("date must be a real yyyy-MM-dd date.");
  if (body.mode === "seed" && body.confirm !== "SEED") {
    throw new BadRequest('Seeding rewrites every base_* doc: type SEED to confirm.');
  }
  const slot =
    body.slot === "auto" ? slotFor(now) : body.slot === "extra" ? extraSlot(now) : body.slot;
  if (!isSlot(slot)) throw new BadRequest("Bad slot.");
  const categories = (body.categories?.length ? body.categories : [...ALL_CATEGORIES]).filter(isCategory);
  if (!categories.length) throw new BadRequest("Pick at least one category.");
  const options: RunOptions = {
    date,
    force: body.force,
    dryRun: body.dryRun,
    categories,
    mode: body.mode,
    scheduled: false,
    cleanup: null,
  };
  return start(body.mode === "seed" ? "seed" : "question_bank", "manual", slot, options);
}

export async function startCleanup(days: number, dryRun: boolean) {
  const options: RunOptions = {
    date: ist.dateKey(new Date()),
    force: false,
    dryRun,
    categories: [],
    mode: "daily",
    scheduled: false,
    days,
  };
  return start("guest_cleanup", "manual", "", options);
}

async function start(kind: RunKind, trigger: "timer" | "manual", slot: string, options: RunOptions) {
  // A seed run and a question-bank run both write the bank: one at a time
  // (they were one concurrency group in the workflow).
  const other = kind === "seed" ? "question_bank" : kind === "question_bank" ? "seed" : null;
  if (other) {
    const busy = await repo.activeRun(other);
    if (busy && busy.lockedUntil && busy.lockedUntil > new Date()) {
      throw new Conflict(`A ${other.replace("_", " ")} run is in progress.`, busy.id);
    }
  }
  const result = await createRun(engineDeps(), { kind, trigger, slot, options });
  if (!result.created && result.live) throw new Conflict("Another run holds the lock.", result.run.id);
  return { runId: result.run.id, created: result.created, resumed: !result.created };
}

/** The models that answered a finished step; none for older runs or model-free steps. */
export function stepModels(state: string): string[] {
  try {
    const models = (JSON.parse(state) as { models?: unknown } | null)?.models;
    return Array.isArray(models) ? models.filter((m): m is string => typeof m === "string") : [];
  } catch {
    return [];
  }
}

export async function runDetail(id: string, after?: Date) {
  const run = await repo.getRun(id);
  if (!run) return null;
  const steps = await repo.steps(id);
  const logs = await repo.logs(id, { after, limit: 500 });
  return {
    run: runDto(run),
    progress: run.status === "running" ? progressOf(steps, parse<RunSummary>(run.summary, {})) : cachedProgress(run),
    steps: steps.map((s) => ({
      key: s.key,
      order: s.order,
      status: s.status,
      attempts: s.attempts,
      error: s.error,
      models: stepModels(s.state),
    })),
    logs: logs.map((l) => ({ at: l.at.toISOString(), level: l.level, message: l.message })),
  };
}

export function tickRun(id: string) {
  return tick(engineDeps(), id);
}

export async function cancelRun(id: string) {
  const run = await repo.getRun(id);
  if (!run) return null;
  if (run.status !== "running") return run;
  const now = new Date();
  await repo.updateRun(id, { status: "cancelled", finishedAt: now, lockedUntil: null, tickUntil: null, tickToken: null });
  await repo.addLogs(id, [{ at: now, level: "warn", message: "run cancelled from Studio" }]);
  const options = parse<Partial<RunOptions>>(run.options, {});
  // A cancelled scheduled run waits a full interval, rather than restarting at once.
  if (options.scheduled) {
    const s = await getSchedule(scheduleDb, now);
    await updateSchedule(scheduleDb, { nextRunAt: computeNextRun(now, s.intervalHours) });
  }
  return repo.getRun(id);
}
