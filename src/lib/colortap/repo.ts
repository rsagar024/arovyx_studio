/**
 * Where Color Tap's settings, runs and logs live: Postgres through Prisma,
 * behind a small interface so the tests can use an in-memory copy.
 *
 * Two leases keep runs safe when several tabs or devices drive them:
 * - the run lease, `lockedUntil`: one active run at a time. Renewed on every
 *   tick; a run whose lease ran out (no tick for 10 minutes, e.g. the tab
 *   closed) is resumed by the next tab rather than started again.
 * - the tick lease, `tickUntil` + `tickToken`: one tick in flight per run,
 *   taken with `updateMany ... where tickUntil is null or < now`, so two tabs
 *   can never handle the same page twice.
 */
import "server-only";
import type { PrismaClient } from "@prisma/client";

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

/* ------------------------------ Prisma -------------------------------- */

export class PrismaRunRepo implements RunRepo {
  constructor(private db: PrismaClient) {}

  getSchedule() {
    return this.db.colorTapSchedule.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  }

  async updateSchedule(data: Partial<Omit<ScheduleRow, "id">>) {
    await this.getSchedule();
    return this.db.colorTapSchedule.update({ where: { id: 1 }, data });
  }

  async createRunIfFree(data: NewRun, now: Date, lockedUntil: Date): Promise<CreateResult> {
    return this.db.$transaction(async (tx) => {
      // Serialises run creation across every connection.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('colortap:run'))`;
      const active = await tx.colorTapRun.findFirst({ where: { status: "running" }, orderBy: { createdAt: "desc" } });
      if (active) {
        return { run: active, created: false as const, live: Boolean(active.lockedUntil && active.lockedUntil > now) };
      }
      const run = await tx.colorTapRun.create({ data: { ...data, status: "running", lockedUntil, startedAt: now } });
      return { run, created: true as const };
    });
  }

  getRun(id: string) {
    return this.db.colorTapRun.findUnique({ where: { id } });
  }

  activeRun() {
    return this.db.colorTapRun.findFirst({ where: { status: "running" }, orderBy: { createdAt: "desc" } });
  }

  listRuns(limit: number) {
    return this.db.colorTapRun.findMany({ orderBy: { createdAt: "desc" }, take: limit });
  }

  async updateRun(id: string, data: RunChange) {
    await this.db.colorTapRun.update({ where: { id }, data });
  }

  async acquireTick(id: string, token: string, now: Date, tickUntil: Date, lockedUntil: Date) {
    const { count } = await this.db.colorTapRun.updateMany({
      where: { id, status: "running", OR: [{ tickUntil: null }, { tickUntil: { lt: now } }] },
      data: { tickUntil, tickToken: token, lockedUntil },
    });
    return count === 1;
  }

  async renewLock(id: string, token: string, lockedUntil: Date) {
    await this.db.colorTapRun.updateMany({ where: { id, tickToken: token }, data: { lockedUntil } });
  }

  async releaseTick(id: string, token: string) {
    await this.db.colorTapRun.updateMany({ where: { id, tickToken: token }, data: { tickUntil: null, tickToken: null } });
  }

  async addLogs(runId: string, logs: NewLog[]) {
    if (logs.length) await this.db.colorTapLog.createMany({ data: logs.map((l) => ({ runId, ...l })) });
  }

  logs(runId: string, opts: { after?: Date; limit?: number } = {}) {
    return this.db.colorTapLog.findMany({
      where: { runId, ...(opts.after ? { at: { gt: opts.after } } : {}) },
      orderBy: [{ at: "asc" }, { id: "asc" }],
      take: opts.limit ?? 500,
    });
  }

  async pruneBefore(date: Date) {
    const { count } = await this.db.colorTapRun.deleteMany({ where: { createdAt: { lt: date }, status: { not: "running" } } });
    return count;
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
