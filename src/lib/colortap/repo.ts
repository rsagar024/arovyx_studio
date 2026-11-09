/**
 * Where Color Tap's settings, runs and logs live: Color Tap's own Firestore
 * (`studio_config/colorTapSchedule`, `studio_colorTapRuns/{id}` with a `logs`
 * subcollection), never the site's database,
 * behind a small interface so the tests can use an in-memory copy.
 *
 * Two leases keep runs safe when several tabs or devices drive them:
 * - the run lease, `lockedUntil`: one active run at a time. Renewed on every
 *   tick; a run whose lease ran out (no tick for 10 minutes, e.g. the tab
 *   closed) is resumed by the next tab rather than started again.
 * - the tick lease, `tickUntil` + `tickToken`: one tick in flight per run,
 *   taken in a transaction that checks `tickUntil is null or < now`, so two
 *   tabs can never handle the same page twice.
 */
import "server-only";
import { toRow } from "@/lib/firestore";
import { FirestoreRuns } from "@/lib/firestoreRuns";
import { STUDIO_COL, colorTapDb } from "./firebase";

export interface ScheduleRow {
  id: number;
  autoEnabled: boolean;
  days: number;
  lastCleanupAt: Date | null;
  lastAutoAt: Date | null;
  updatedAt: Date;
}

export interface RunRow {
  id: string;
  trigger: string;
  days: number;
  dryRun: boolean;
  status: string;
  state: string;
  attempts: number;
  error: string | null;
  lockedUntil: Date | null;
  tickUntil: Date | null;
  tickToken: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  createdAt: Date;
}

export interface LogRow {
  id: string;
  runId: string;
  at: Date;
  level: string;
  message: string;
}

export interface NewRun {
  trigger: string;
  days: number;
  dryRun: boolean;
  state: string;
}

export type NewLog = Pick<LogRow, "at" | "level" | "message">;
export type RunChange = Partial<Omit<RunRow, "id">>;
export type CreateResult = { run: RunRow; created: true } | { run: RunRow; created: false; live: boolean };

export interface RunRepo {
  /** The single settings row, created with the defaults on first use. */
  getSchedule(): Promise<ScheduleRow>;
  updateSchedule(data: Partial<Omit<ScheduleRow, "id">>): Promise<ScheduleRow>;
  /** Creates the run unless one is running: then returns that (`live` while its lease holds). Atomic. */
  createRunIfFree(data: NewRun, now: Date, lockedUntil: Date): Promise<CreateResult>;
  getRun(id: string): Promise<RunRow | null>;
  activeRun(): Promise<RunRow | null>;
  listRuns(limit: number): Promise<RunRow[]>;
  updateRun(id: string, data: RunChange): Promise<void>;
  /** Takes the tick lease if no other tick holds it. Atomic. */
  acquireTick(id: string, token: string, now: Date, tickUntil: Date, lockedUntil: Date): Promise<boolean>;
  /** Renews the run lease while this tick holds the tick lease. */
  renewLock(id: string, token: string, lockedUntil: Date): Promise<void>;
  releaseTick(id: string, token: string): Promise<void>;
  addLogs(runId: string, logs: NewLog[]): Promise<void>;
  logs(runId: string, opts?: { after?: Date; limit?: number }): Promise<LogRow[]>;
  /** Deletes finished runs (with their logs) created before `date`. */
  pruneBefore(date: Date): Promise<number>;
}

/* ----------------------------- Firestore ------------------------------ */

const SCHEDULE_DEFAULTS = { autoEnabled: false, days: 90, lastCleanupAt: null, lastAutoAt: null };

export class FirestoreRunRepo implements RunRepo {
  private runs = new FirestoreRuns<RunRow>(STUDIO_COL.runs, colorTapDb, STUDIO_COL.locks);
  private scheduleRef = () => colorTapDb().collection(STUDIO_COL.config).doc("colorTapSchedule");

  async getSchedule(): Promise<ScheduleRow> {
    const ref = this.scheduleRef();
    const snap = await ref.get();
    if (snap.exists) return { ...SCHEDULE_DEFAULTS, ...toRow<ScheduleRow>(snap), id: 1 };
    const row = { ...SCHEDULE_DEFAULTS, updatedAt: new Date() };
    await ref.set(row, { merge: true });
    return { ...row, id: 1 };
  }

  async updateSchedule(data: Partial<Omit<ScheduleRow, "id">>) {
    await this.getSchedule();
    await this.scheduleRef().set({ ...data, updatedAt: new Date() }, { merge: true });
    return this.getSchedule();
  }

  async createRunIfFree(data: NewRun, now: Date, lockedUntil: Date): Promise<CreateResult> {
    return this.runs.withCreateLock("colortap:run", now, async (tx) => {
      const [active] = await this.runs.running(tx);
      if (active) return { run: active, created: false as const, live: Boolean(active.lockedUntil && active.lockedUntil > now) };
      const ref = this.runs.newRef();
      const run: RunRow = {
        id: ref.id,
        ...data,
        status: "running",
        attempts: 0,
        error: null,
        lockedUntil,
        tickUntil: null,
        tickToken: null,
        startedAt: now,
        finishedAt: null,
        createdAt: now,
      };
      const { id: _id, ...doc } = run;
      tx.create(ref, doc);
      return { run, created: true as const };
    });
  }

  getRun(id: string) {
    return this.runs.getRun(id);
  }

  async activeRun() {
    return (await this.runs.running())[0] ?? null;
  }

  listRuns(limit: number) {
    return this.runs.listRuns(limit);
  }

  updateRun(id: string, data: RunChange) {
    return this.runs.updateRun(id, data);
  }

  acquireTick(id: string, token: string, now: Date, tickUntil: Date, lockedUntil: Date) {
    return this.runs.acquireTick(id, token, now, tickUntil, lockedUntil);
  }

  renewLock(id: string, token: string, lockedUntil: Date) {
    return this.runs.renewLock(id, token, lockedUntil);
  }

  releaseTick(id: string, token: string) {
    return this.runs.releaseTick(id, token);
  }

  addLogs(runId: string, logs: NewLog[]) {
    return this.runs.addLogs(runId, logs);
  }

  logs(runId: string, opts: { after?: Date; limit?: number } = {}) {
    return this.runs.logs(runId, opts);
  }

  pruneBefore(date: Date) {
    return this.runs.pruneBefore(date);
  }
}

/* ------------------------------ Memory -------------------------------- */

let seq = 0;
const nextId = () => `run${(++seq).toString(36).padStart(6, "0")}`;

/** For tests: the same semantics, with each method atomic (single-threaded JS). */
export class MemoryRunRepo implements RunRepo {
  schedule: ScheduleRow;
  runs = new Map<string, RunRow>();
  logRows: LogRow[] = [];

  constructor(schedule: Partial<ScheduleRow> = {}) {
    this.schedule = {
      id: 1,
      autoEnabled: false,
      days: 90,
      lastCleanupAt: null,
      lastAutoAt: null,
      updatedAt: new Date(0),
      ...schedule,
    };
  }

  async getSchedule() {
    return { ...this.schedule };
  }
  async updateSchedule(data: Partial<Omit<ScheduleRow, "id">>) {
    Object.assign(this.schedule, data);
    return { ...this.schedule };
  }
  async createRunIfFree(data: NewRun, now: Date, lockedUntil: Date): Promise<CreateResult> {
    const active = [...this.runs.values()].find((r) => r.status === "running");
    if (active) return { run: { ...active }, created: false, live: Boolean(active.lockedUntil && active.lockedUntil > now) };
    const run: RunRow = {
      id: nextId(),
      ...data,
      status: "running",
      attempts: 0,
      error: null,
      lockedUntil,
      tickUntil: null,
      tickToken: null,
      startedAt: now,
      finishedAt: null,
      createdAt: now,
    };
    this.runs.set(run.id, run);
    return { run: { ...run }, created: true };
  }
  async getRun(id: string) {
    const r = this.runs.get(id);
    return r ? { ...r } : null;
  }
  async activeRun() {
    const r = [...this.runs.values()].reverse().find((x) => x.status === "running");
    return r ? { ...r } : null;
  }
  async listRuns(limit: number) {
    return [...this.runs.values()].reverse().slice(0, limit).map((r) => ({ ...r }));
  }
  async updateRun(id: string, data: RunChange) {
    const r = this.runs.get(id);
    if (r) Object.assign(r, data);
  }
  async acquireTick(id: string, token: string, now: Date, tickUntil: Date, lockedUntil: Date) {
    const r = this.runs.get(id);
    if (!r || r.status !== "running" || (r.tickUntil && r.tickUntil >= now)) return false;
    Object.assign(r, { tickUntil, tickToken: token, lockedUntil });
    return true;
  }
  async renewLock(id: string, token: string, lockedUntil: Date) {
    const r = this.runs.get(id);
    if (r && r.tickToken === token) r.lockedUntil = lockedUntil;
  }
  async releaseTick(id: string, token: string) {
    const r = this.runs.get(id);
    if (r && r.tickToken === token) Object.assign(r, { tickUntil: null, tickToken: null });
  }
  async addLogs(runId: string, logs: NewLog[]) {
    for (const l of logs) this.logRows.push({ id: nextId(), runId, ...l });
  }
  async logs(runId: string, opts: { after?: Date; limit?: number } = {}) {
    return this.logRows
      .filter((l) => l.runId === runId && (!opts.after || l.at > opts.after))
      .slice(0, opts.limit ?? 500);
  }
  async pruneBefore(date: Date) {
    let n = 0;
    for (const [id, r] of this.runs) {
      if (r.createdAt < date && r.status !== "running") {
        this.runs.delete(id);
        n++;
      }
    }
    return n;
  }
}
