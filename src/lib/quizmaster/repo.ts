/**
 * Where runs, steps and logs live: Postgres through Prisma, behind a small
 * interface so the engine's tests can use an in-memory copy.
 *
 * Two leases keep runs safe when several tabs or devices drive them:
 * - the run lease, `lockedUntil`: one active run per kind. Renewed on every
 *   tick; a run whose lease ran out (no tick for 10 minutes, e.g. the tab
 *   closed) is resumed by the next tab rather than started again.
 * - the tick lease, `tickUntil` + `tickToken`: one tick in flight per run,
 *   taken with `updateMany ... where tickUntil is null or < now`, so two tabs
 *   can never run the same step twice.
 */
import "server-only";
import type { PrismaClient } from "@prisma/client";

export interface RunRow {
  id: string;
  kind: string;
  trigger: string;
  slot: string;
  options: string;
  status: string;
  lockedUntil: Date | null;
  tickUntil: Date | null;
  tickToken: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  summary: string;
  createdAt: Date;
}

export interface StepRow {
  id: string;
  runId: string;
  key: string;
  order: number;
  status: string;
  attempts: number;
  state: string;
  error: string | null;
  updatedAt: Date;
}

export interface LogRow {
  id: string;
  runId: string;
  at: Date;
  level: string;
  message: string;
}

export interface NewRun {
  kind: string;
  trigger: string;
  slot: string;
  options: string;
  summary?: string;
}

export interface NewStep {
  key: string;
  order: number;
  state?: string;
}

export type CreateResult = { run: RunRow; created: true } | { run: RunRow; created: false; live: boolean };

export interface RunRepo {
  /** Creates the run and its first steps unless a run of the same kind is
   * running: then returns that run (`live` while its lease holds). Atomic. */
  createRunIfFree(data: NewRun, steps: NewStep[], now: Date, lockedUntil: Date): Promise<CreateResult>;
  getRun(id: string): Promise<RunRow | null>;
  activeRun(kind?: string): Promise<RunRow | null>;
  listRuns(limit: number): Promise<RunRow[]>;
  updateRun(id: string, data: Partial<Omit<RunRow, "id">>): Promise<void>;
  /** Takes the tick lease if no other tick holds it. Atomic. */
  acquireTick(id: string, token: string, now: Date, tickUntil: Date, lockedUntil: Date): Promise<boolean>;
  /** Renews the run lease while this tick holds the tick lease. */
  renewLock(id: string, token: string, lockedUntil: Date): Promise<void>;
  releaseTick(id: string, token: string): Promise<void>;
  steps(runId: string): Promise<StepRow[]>;
  /** Adds a step; an existing key is returned unchanged (idempotent). */
  addStep(runId: string, step: NewStep): Promise<StepRow>;
  updateStep(id: string, data: Partial<Pick<StepRow, "status" | "attempts" | "state" | "error">>): Promise<void>;
  addLogs(runId: string, logs: Array<{ at: Date; level: string; message: string }>): Promise<void>;
  logs(runId: string, opts?: { after?: Date; limit?: number }): Promise<LogRow[]>;
  /** Deletes runs (with their steps and logs) created before `date`. */
  pruneBefore(date: Date): Promise<number>;
}

/* ------------------------------ Prisma -------------------------------- */

export class PrismaRunRepo implements RunRepo {
  constructor(private db: PrismaClient) {}

  async createRunIfFree(data: NewRun, steps: NewStep[], now: Date, lockedUntil: Date): Promise<CreateResult> {
    return this.db.$transaction(async (tx) => {
      // Serialises run creation per kind across every connection.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"quizrun:" + data.kind}))`;
      const active = await tx.quizRun.findFirst({
        where: { kind: data.kind, status: "running" },
        orderBy: { createdAt: "desc" },
      });
      if (active) {
        return { run: active, created: false as const, live: Boolean(active.lockedUntil && active.lockedUntil > now) };
      }
      const run = await tx.quizRun.create({
        data: { ...data, summary: data.summary ?? "{}", status: "running", lockedUntil, startedAt: now },
      });
      if (steps.length) {
        await tx.quizRunStep.createMany({
          data: steps.map((s) => ({ runId: run.id, key: s.key, order: s.order, state: s.state ?? "{}" })),
        });
      }
      return { run, created: true as const };
    });
  }

  getRun(id: string) {
    return this.db.quizRun.findUnique({ where: { id } });
  }

  activeRun(kind?: string) {
    return this.db.quizRun.findFirst({
      where: { status: "running", ...(kind ? { kind } : {}) },
      orderBy: { createdAt: "desc" },
    });
  }

  listRuns(limit: number) {
    return this.db.quizRun.findMany({ orderBy: { createdAt: "desc" }, take: limit });
  }

  async updateRun(id: string, data: Partial<Omit<RunRow, "id">>) {
    await this.db.quizRun.update({ where: { id }, data });
  }

  async acquireTick(id: string, token: string, now: Date, tickUntil: Date, lockedUntil: Date) {
    const { count } = await this.db.quizRun.updateMany({
      where: { id, status: "running", OR: [{ tickUntil: null }, { tickUntil: { lt: now } }] },
      data: { tickUntil, tickToken: token, lockedUntil },
    });
    return count === 1;
  }

  async renewLock(id: string, token: string, lockedUntil: Date) {
    await this.db.quizRun.updateMany({ where: { id, tickToken: token }, data: { lockedUntil } });
  }

  async releaseTick(id: string, token: string) {
    await this.db.quizRun.updateMany({ where: { id, tickToken: token }, data: { tickUntil: null, tickToken: null } });
  }

  steps(runId: string) {
    return this.db.quizRunStep.findMany({ where: { runId }, orderBy: { order: "asc" } });
  }

  async addStep(runId: string, step: NewStep) {
    return this.db.quizRunStep.upsert({
      where: { runId_key: { runId, key: step.key } },
      create: { runId, key: step.key, order: step.order, state: step.state ?? "{}" },
      update: {},
    });
  }

  async updateStep(id: string, data: Partial<Pick<StepRow, "status" | "attempts" | "state" | "error">>) {
    await this.db.quizRunStep.update({ where: { id }, data });
  }

  async addLogs(runId: string, logs: Array<{ at: Date; level: string; message: string }>) {
    if (logs.length) await this.db.quizLog.createMany({ data: logs.map((l) => ({ runId, ...l })) });
  }

  logs(runId: string, opts: { after?: Date; limit?: number } = {}) {
    return this.db.quizLog.findMany({
      where: { runId, ...(opts.after ? { at: { gt: opts.after } } : {}) },
      orderBy: [{ at: "asc" }, { id: "asc" }],
      take: opts.limit ?? 500,
    });
  }

  async pruneBefore(date: Date) {
    const { count } = await this.db.quizRun.deleteMany({ where: { createdAt: { lt: date }, status: { not: "running" } } });
    return count;
  }
}

/* ------------------------------ Memory -------------------------------- */

let seq = 0;
const nextId = (p: string) => `${p}${(++seq).toString(36).padStart(6, "0")}`;

/** For tests: the same semantics, with each method atomic (single-threaded JS). */
export class MemoryRunRepo implements RunRepo {
  runs = new Map<string, RunRow>();
  stepRows = new Map<string, StepRow>();
  logRows: LogRow[] = [];

  async createRunIfFree(data: NewRun, steps: NewStep[], now: Date, lockedUntil: Date): Promise<CreateResult> {
    const active = [...this.runs.values()].find((r) => r.kind === data.kind && r.status === "running");
    if (active) return { run: { ...active }, created: false, live: Boolean(active.lockedUntil && active.lockedUntil > now) };
    const run: RunRow = {
      id: nextId("run"),
      ...data,
      summary: data.summary ?? "{}",
      status: "running",
      lockedUntil,
      tickUntil: null,
      tickToken: null,
      startedAt: now,
      finishedAt: null,
      createdAt: now,
    };
    this.runs.set(run.id, run);
    for (const s of steps) await this.addStep(run.id, s);
    return { run: { ...run }, created: true };
  }
  async getRun(id: string) {
    const r = this.runs.get(id);
    return r ? { ...r } : null;
  }
  async activeRun(kind?: string) {
    const r = [...this.runs.values()].reverse().find((x) => x.status === "running" && (!kind || x.kind === kind));
    return r ? { ...r } : null;
  }
  async listRuns(limit: number) {
    return [...this.runs.values()].reverse().slice(0, limit).map((r) => ({ ...r }));
  }
  async updateRun(id: string, data: Partial<Omit<RunRow, "id">>) {
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
  async steps(runId: string) {
    return [...this.stepRows.values()].filter((s) => s.runId === runId).sort((a, b) => a.order - b.order).map((s) => ({ ...s }));
  }
  async addStep(runId: string, step: NewStep) {
    const existing = [...this.stepRows.values()].find((s) => s.runId === runId && s.key === step.key);
    if (existing) return { ...existing };
    const row: StepRow = {
      id: nextId("step"),
      runId,
      key: step.key,
      order: step.order,
      status: "pending",
      attempts: 0,
      state: step.state ?? "{}",
      error: null,
      updatedAt: new Date(),
    };
    this.stepRows.set(row.id, row);
    return { ...row };
  }
  async updateStep(id: string, data: Partial<Pick<StepRow, "status" | "attempts" | "state" | "error">>) {
    const s = this.stepRows.get(id);
    if (s) Object.assign(s, data, { updatedAt: new Date() });
  }
  async addLogs(runId: string, logs: Array<{ at: Date; level: string; message: string }>) {
    for (const l of logs) this.logRows.push({ id: nextId("log"), runId, ...l });
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
