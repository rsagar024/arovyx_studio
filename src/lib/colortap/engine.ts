/**
 * Runs a cleanup as short, resumable slices. A Vercel function stops after
 * ~5 minutes and a project can hold many users, so each `tick` (one API call
 * from the Studio tab) handles as many pages as fit in a 240 s budget, saving
 * after every page, then returns. The page calls `tick` again until the run is
 * done. If the tab closes, the run waits in the database and the next tick,
 * from any tab, carries on.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { ColorTapNotConfigured } from "./firebase";
import { cleanupPage, startState, type CleanupCounts, type CleanupState, type UserAdmin } from "./guestCleanup";
import type { NewLog, RunRepo, RunRow } from "./repo";

export const TICK_BUDGET_MS = 240_000;
/** The tick lease outlives the budget so a slow last page can't overlap the next tick. */
export const TICK_LEASE_MS = 290_000;
export const RUN_LEASE_MS = 10 * 60_000;
export const MAX_ATTEMPTS = 3;
/** Don't start a page with less than this left. */
const MIN_PAGE_MS = 30_000;

export interface EngineDeps {
  repo: RunRepo;
  /** Called inside a tick, so a bad key fails the run rather than the request. */
  makeUsers: () => UserAdmin;
  clock?: () => number;
  budgetMs?: number;
}

export interface TickResult {
  status: string;
  done: boolean;
  busy?: boolean;
  pages: number;
  counts: CleanupCounts;
}

export class RunNotFound extends Error {
  constructor() {
    super("Run not found.");
    this.name = "RunNotFound";
  }
}

export function stateOf(run: Pick<RunRow, "state">): CleanupState {
  try {
    const state = JSON.parse(run.state) as Partial<CleanupState>;
    return { ...startState(), ...state };
  } catch {
    return startState();
  }
}

const resultOf = (run: RunRow): TickResult => {
  const state = stateOf(run);
  return { status: run.status, done: run.status !== "running", pages: state.pages, counts: state.counts };
};

/** Log lines stay on one line and a sensible length. */
const cleanLine = (line: string) => line.replace(/\s+/g, " ").trim().slice(0, 500);
const errText = (err: unknown) => cleanLine(err instanceof Error ? `${err.name}: ${err.message}` : String(err));

export async function tick(deps: EngineDeps, runId: string): Promise<TickResult> {
  const { repo } = deps;
  const clock = deps.clock ?? Date.now;
  const t0 = clock();
  const deadline = t0 + (deps.budgetMs ?? TICK_BUDGET_MS);

  const run = await repo.getRun(runId);
  if (!run) throw new RunNotFound();
  if (run.status !== "running") return resultOf(run);

  const token = randomUUID();
  const acquired = await repo.acquireTick(runId, token, new Date(t0), new Date(t0 + TICK_LEASE_MS), new Date(t0 + RUN_LEASE_MS));
  if (!acquired) return { ...resultOf(run), busy: true };

  const logLine = (level: string, message: string): NewLog => ({ at: new Date(clock()), level, message: cleanLine(message) });

  const fail = async (message: string) => {
    await repo.addLogs(runId, [logLine("error", `run finished: failed (${message})`)]);
    await repo.updateRun(runId, { status: "failed", finishedAt: new Date(clock()), lockedUntil: null, error: message });
  };

  try {
    let state = stateOf(run);
    let attempts = run.attempts;
    let users: UserAdmin | null = null;

    while (deadline - clock() >= MIN_PAGE_MS) {
      // Cancelled from Studio since the last page.
      if ((await repo.getRun(runId))?.status !== "running") break;

      const lines: NewLog[] = [];
      try {
        users ??= deps.makeUsers();
        state = await cleanupPage(users, state, {
          days: run.days,
          dryRun: run.dryRun,
          nowMs: clock(),
          log: (line) => lines.push(logLine(line.startsWith("warning") ? "warn" : "info", line)),
        });
      } catch (err) {
        attempts += 1;
        const message = errText(err);
        await repo.addLogs(runId, [logLine("warn", `page failed (attempt ${attempts}/${MAX_ATTEMPTS}): ${message}`)]);
        if (attempts >= MAX_ATTEMPTS || err instanceof ColorTapNotConfigured) {
          await repo.updateRun(runId, { attempts });
          await fail(message);
          break;
        }
        await repo.updateRun(runId, { attempts, error: message });
        continue;
      }

      attempts = 0;
      await repo.addLogs(runId, lines);
      await repo.updateRun(runId, { state: JSON.stringify(state), attempts: 0, error: null });
      await repo.renewLock(runId, token, new Date(clock() + RUN_LEASE_MS));

      if (state.done) {
        if ((await repo.getRun(runId))?.status !== "running") break;
        const finishedAt = new Date(clock());
        await repo.addLogs(runId, [logLine("info", "run finished: succeeded")]);
        await repo.updateRun(runId, { status: "succeeded", finishedAt, lockedUntil: null });
        // Only a real cleanup moves the clock: a dry run leaves it where it is.
        if (!run.dryRun) await repo.updateSchedule({ lastCleanupAt: finishedAt });
        break;
      }
    }
  } finally {
    await repo.releaseTick(runId, token);
  }
  const final = await repo.getRun(runId);
  if (!final) throw new RunNotFound();
  return resultOf(final);
}
