/**
 * What the Color Tap API routes call: the settings, starting and driving runs,
 * and the status the Studio tab shows. Replaces the daily GitHub Actions job
 * of the color_tap repo.
 *
 * Nothing external starts a run. Opening the tab starts one when automatic
 * cleanup is on and the last real one is over 24 h old. Automatic cleanup
 * starts off, so the first delete comes after a dry run has been checked.
 *
 * Built from its dependencies so tests can use the in-memory repo; `service.ts`
 * wires up the real ones.
 */
import "server-only";
import { RUN_LEASE_MS, stateOf, tick, type EngineDeps } from "./engine";
import { COLORTAP_PROJECT_ID, ColorTapNotConfigured } from "./firebase";
import { DAY_MS, MIN_DAYS, startState, validDays, type UserAdmin } from "./guestCleanup";
import type { RunRepo, RunRow, ScheduleRow } from "./repo";

/** Automatic runs are at most this far apart. */
export const CLEANUP_EVERY_MS = DAY_MS;
/** A failed or cancelled automatic run waits this long, not until the next page refresh. */
export const AUTO_RETRY_MS = 60 * 60 * 1000;
const RETENTION_DAYS = 60;
/** Runs shown in the history table. */
const HISTORY_RUNS = 12;

export class BadRequest extends Error {}
export class Conflict extends Error {
  constructor(message: string, readonly runId?: string) {
    super(message);
  }
}

/** The earliest automatic run: a day after a real cleanup, an hour after the last attempt. */
export function nextAutoAt(s: Pick<ScheduleRow, "lastCleanupAt" | "lastAutoAt">): Date | null {
  const latest = Math.max(
    s.lastCleanupAt ? s.lastCleanupAt.getTime() + CLEANUP_EVERY_MS : 0,
    s.lastAutoAt ? s.lastAutoAt.getTime() + AUTO_RETRY_MS : 0
  );
  return latest ? new Date(latest) : null;
}

export function autoDue(s: ScheduleRow, now: Date): boolean {
  if (!s.autoEnabled) return false;
  const next = nextAutoAt(s);
  return !next || next.getTime() <= now.getTime();
}

export function runDto(run: RunRow) {
  const state = stateOf(run);
  return {
    id: run.id,
    trigger: run.trigger,
    days: run.days,
    dryRun: run.dryRun,
    status: run.status,
    error: run.error,
    pages: state.pages,
    counts: state.counts,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
  };
}

export type ScheduleChange = { action: "auto"; enabled: boolean } | { action: "days"; days: number };

export interface ColorTapDeps {
  repo: RunRepo;
  makeUsers: () => UserAdmin;
  /** Why the Firebase key can't be used, or null. */
  keyProblem: () => string | null;
  clock?: () => number;
  budgetMs?: number;
}

function checkDays(days: number): number {
  if (!validDays(days)) throw new BadRequest(`days must be at least ${MIN_DAYS} (never remove recently active guests)`);
  return days;
}

export function createColorTapService(deps: ColorTapDeps) {
  const { repo } = deps;
  const clock = deps.clock ?? Date.now;
  const nowDate = () => new Date(clock());
  const engineDeps = (): EngineDeps => ({ repo, makeUsers: deps.makeUsers, clock, budgetMs: deps.budgetMs });

  async function start(trigger: "timer" | "manual", days: number, dryRun: boolean) {
    const problem = deps.keyProblem();
    if (problem) throw new ColorTapNotConfigured(problem);
    checkDays(days);
    const now = nowDate();
    await repo.pruneBefore(new Date(now.getTime() - RETENTION_DAYS * DAY_MS));
    const result = await repo.createRunIfFree(
      { trigger, days, dryRun, state: JSON.stringify(startState()) },
      now,
      new Date(now.getTime() + RUN_LEASE_MS)
    );
    if (!result.created && result.live) throw new Conflict("Another run holds the lock.", result.run.id);
    if (result.created) {
      await repo.addLogs(result.run.id, [
        {
          at: now,
          level: "info",
          message: `run started (${trigger}${dryRun ? ", dry run" : ""}): guests inactive for more than ${days} days`,
        },
      ]);
    }
    return { runId: result.run.id, created: result.created, resumed: !result.created };
  }

  return {
    /** Everything the tab needs on load and on each refresh. */
    async status() {
      const now = nowDate();
      const schedule = await repo.getSchedule();
      // Each run listed is a read on every refresh: keep the table short, and
      // look further for a running run only when the table may not hold it.
      const runs = await repo.listRuns(HISTORY_RUNS);
      const active =
        runs.find((r) => r.status === "running") ?? (runs.length >= HISTORY_RUNS ? await repo.activeRun() : null);
      return {
        serverNow: now.toISOString(),
        projectId: COLORTAP_PROJECT_ID,
        keyProblem: deps.keyProblem(),
        schedule: {
          autoEnabled: schedule.autoEnabled,
          days: schedule.days,
          lastCleanupAt: schedule.lastCleanupAt?.toISOString() ?? null,
          nextAutoAt: nextAutoAt(schedule)?.toISOString() ?? null,
          due: autoDue(schedule, now),
        },
        active: active ? runDto(active) : null,
        runs: runs.map(runDto),
      };
    },

    async changeSchedule(change: ScheduleChange) {
      if (change.action === "auto") return repo.updateSchedule({ autoEnabled: change.enabled });
      return repo.updateSchedule({ days: checkDays(change.days) });
    },

    /** A form submit. */
    startCleanup(days: number, dryRun: boolean) {
      return start("manual", days, dryRun);
    },

    /** Called by the open tab when the status says `due`; refused otherwise. */
    async startScheduled() {
      const schedule = await repo.getSchedule();
      if (!schedule.autoEnabled) throw new Conflict("Automatic cleanup is off.");
      if (!autoDue(schedule, nowDate())) throw new Conflict("The next cleanup isn't due yet.");
      const result = await start("timer", schedule.days, false);
      if (result.created) await repo.updateSchedule({ lastAutoAt: nowDate() });
      return result;
    },

    tickRun(id: string) {
      return tick(engineDeps(), id);
    },

    async runDetail(id: string, after?: Date) {
      const run = await repo.getRun(id);
      if (!run) return null;
      const logs = await repo.logs(id, { after, limit: 500 });
      return {
        run: runDto(run),
        logs: logs.map((l) => ({ at: l.at.toISOString(), level: l.level, message: l.message })),
      };
    },

    async cancelRun(id: string) {
      const run = await repo.getRun(id);
      if (!run) return null;
      if (run.status !== "running") return run;
      const now = nowDate();
      await repo.updateRun(id, { status: "cancelled", finishedAt: now, lockedUntil: null, tickUntil: null, tickToken: null });
      await repo.addLogs(id, [{ at: now, level: "warn", message: "run cancelled from Studio" }]);
      return repo.getRun(id);
    },
  };
}
