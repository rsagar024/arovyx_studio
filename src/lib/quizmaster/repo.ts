/**
 * Where runs, steps and logs live: the Quiz Master project's own Firestore
 * (`studio_quizRuns/{id}` with `steps` and `logs` subcollections), never the
 * site's database, behind a small interface so the engine's tests
 * can use an in-memory copy.
 *
 * Two leases keep runs safe when several tabs or devices drive them:
 * - the run lease, `lockedUntil`: one active run per kind. Renewed on every
 *   tick; a run whose lease ran out (no tick for 10 minutes, e.g. the tab
 *   closed) is resumed by the next tab rather than started again.
 * - the tick lease, `tickUntil` + `tickToken`: one tick in flight per run,
 *   taken in a transaction that checks `tickUntil is null or < now`, so two
 *   tabs can never run the same step twice.
 */
import "server-only";
import { FirestoreRuns } from "@/lib/firestoreRuns";
import { STUDIO_COL, firestore } from "./firebase";

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
  /** JSON `Progress` saved at the end of each tick (for busy tabs and the status card). */
  progress?: string;
  /** JSON `StepInfo[]`: every step in brief, saved with each commit, so finished
   * step docs never need reading again. Absent on runs from before it existed. */
  stepList?: string;
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
  /** Ticks in which every model of this unit timed out (not counted as attempts). */
  deferrals?: number;
  updatedAt: Date;
}

/** A step in brief, as the run doc's `stepList` keeps it. */
export interface StepInfo {
  key: string;
  order: number;
  status: string;
  attempts: number;
  deferrals?: number;
  error?: string | null;
  /** The models that answered a finished unit. */
  models?: string[];
}

/** One batched save: run fields, step rows to write whole, and new log lines. */
export interface RunChanges {
  run?: Partial<Omit<RunRow, "id">>;
  steps?: StepRow[];
  logs?: Array<{ at: Date; level: string; message: string }>;
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
  progress?: string;
  stepList?: string;
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
  /** Every running run, newest first (one query). */
  runningRuns(): Promise<RunRow[]>;
  listRuns(limit: number): Promise<RunRow[]>;
  updateRun(id: string, data: Partial<Omit<RunRow, "id">>): Promise<void>;
  /** Takes the tick lease if no other tick holds it. Atomic. */
  acquireTick(id: string, token: string, now: Date, tickUntil: Date, lockedUntil: Date): Promise<boolean>;
  /** Renews the run lease while this tick holds the tick lease. */
  renewLock(id: string, token: string, lockedUntil: Date): Promise<void>;
  releaseTick(id: string, token: string): Promise<void>;
  steps(runId: string): Promise<StepRow[]>;
  /** The steps still to run (finished ones are in the run's `stepList`). */
  pendingSteps(runId: string): Promise<StepRow[]>;
  /** Saves run fields, steps and logs in one batched write. */
  commit(runId: string, changes: RunChanges): Promise<void>;
  /** Reads/writes counted for this run since the last call (Firestore only). */
  takeUsage?(runId: string): { reads: number; writes: number };
  /** Adds a step; an existing key is returned unchanged (idempotent). */
  addStep(runId: string, step: NewStep): Promise<StepRow>;
  updateStep(id: string, data: Partial<Pick<StepRow, "status" | "attempts" | "state" | "error">>): Promise<void>;
  addLogs(runId: string, logs: Array<{ at: Date; level: string; message: string }>): Promise<void>;
  logs(runId: string, opts?: { after?: Date; limit?: number }): Promise<LogRow[]>;
  /** Deletes runs (with their steps and logs) created before `date`. */
  pruneBefore(date: Date): Promise<number>;
}

/* ----------------------------- Firestore ------------------------------ */

/** A step's id is `{runId}|{key}`: steps live under their run, keyed by `key`. */
const stepId = (runId: string, key: string) => `${runId}|${key}`;
const stepDocId = (key: string) => encodeURIComponent(key);
function splitStepId(id: string): { runId: string; key: string } {
  const i = id.indexOf("|");
  return { runId: id.slice(0, i), key: id.slice(i + 1) };
}

export class FirestoreRunRepo implements RunRepo {
  private runs = new FirestoreRuns<RunRow>(STUDIO_COL.runs, firestore, STUDIO_COL.locks);

  private stepRef(runId: string, key: string) {
    return this.runs.ref(runId).collection("steps").doc(stepDocId(key));
  }

  private stepRow(runId: string, data: FirebaseFirestore.DocumentData): StepRow {
    const updatedAt = data.updatedAt?.toDate?.() ?? data.updatedAt;
    return {
      id: stepId(runId, data.key),
      runId,
      key: data.key,
      order: data.order,
      status: data.status,
      attempts: data.attempts,
      state: data.state,
      error: data.error ?? null,
      deferrals: data.deferrals ?? 0,
      updatedAt,
    };
  }

  private stepData(s: StepRow) {
    return {
      key: s.key,
      order: s.order,
      status: s.status,
      attempts: s.attempts,
      deferrals: s.deferrals ?? 0,
      state: s.state,
      error: s.error ?? null,
      updatedAt: new Date(),
    };
  }

  async createRunIfFree(data: NewRun, steps: NewStep[], now: Date, lockedUntil: Date): Promise<CreateResult> {
    return this.runs.withCreateLock(`quizrun:${data.kind}`, now, async (tx) => {
      const active = (await this.runs.running(tx)).find((r) => r.kind === data.kind);
      if (active) return { run: active, created: false as const, live: Boolean(active.lockedUntil && active.lockedUntil > now) };
      const ref = this.runs.newRef();
      const run: RunRow = {
        id: ref.id,
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
      const { id: _id, ...doc } = run;
      tx.create(ref, doc);
      for (const st of steps) {
        tx.create(this.stepRef(run.id, st.key), {
          key: st.key, order: st.order, status: "pending", attempts: 0, state: st.state ?? "{}", error: null, updatedAt: now,
        });
      }
      return { run, created: true as const };
    });
  }

  getRun(id: string) {
    return this.runs.getRun(id);
  }

  async activeRun(kind?: string) {
    return (await this.runs.running()).find((r) => !kind || r.kind === kind) ?? null;
  }

  runningRuns() {
    return this.runs.running();
  }

  listRuns(limit: number) {
    return this.runs.listRuns(limit);
  }

  updateRun(id: string, data: Partial<Omit<RunRow, "id">>) {
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

  async steps(runId: string) {
    const snap = await this.runs.ref(runId).collection("steps").orderBy("order", "asc").get();
    this.runs.count(runId, Math.max(1, snap.size));
    return snap.docs.map((d) => this.stepRow(runId, d.data()));
  }

  async pendingSteps(runId: string) {
    const snap = await this.runs.ref(runId).collection("steps").where("status", "==", "pending").get();
    this.runs.count(runId, Math.max(1, snap.size));
    return snap.docs.map((d) => this.stepRow(runId, d.data())).sort((a, b) => a.order - b.order);
  }

  commit(runId: string, changes: RunChanges) {
    return this.runs.commit(runId, {
      run: changes.run as Record<string, unknown> | undefined,
      docs: (changes.steps ?? []).map((s) => ({ ref: this.stepRef(runId, s.key), data: this.stepData(s) })),
      logs: changes.logs,
    });
  }

  takeUsage(runId: string) {
    return this.runs.takeUsage(runId);
  }

  async addStep(runId: string, step: NewStep) {
    const ref = this.stepRef(runId, step.key);
    return this.runs.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) return this.stepRow(runId, snap.data()!);
      const data = {
        key: step.key, order: step.order, status: "pending", attempts: 0, state: step.state ?? "{}", error: null, updatedAt: new Date(),
      };
      tx.create(ref, data);
      return this.stepRow(runId, data);
    });
  }

  async updateStep(id: string, data: Partial<Pick<StepRow, "status" | "attempts" | "state" | "error">>) {
    const { runId, key } = splitStepId(id);
    await this.stepRef(runId, key).update({ ...data, updatedAt: new Date() });
  }

  addLogs(runId: string, logs: Array<{ at: Date; level: string; message: string }>) {
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
  async runningRuns() {
    return [...this.runs.values()].reverse().filter((r) => r.status === "running").map((r) => ({ ...r }));
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
      deferrals: 0,
      updatedAt: new Date(),
    };
    this.stepRows.set(row.id, row);
    return { ...row };
  }
  async updateStep(id: string, data: Partial<Pick<StepRow, "status" | "attempts" | "state" | "error">>) {
    const s = this.stepRows.get(id);
    if (s) Object.assign(s, data, { updatedAt: new Date() });
  }
  async pendingSteps(runId: string) {
    return [...this.stepRows.values()]
      .filter((s) => s.runId === runId && s.status === "pending")
      .sort((a, b) => a.order - b.order)
      .map((s) => ({ ...s }));
  }
  /** Number of commit calls, for tests. */
  commits = 0;
  async commit(runId: string, changes: RunChanges) {
    this.commits++;
    for (const st of changes.steps ?? []) {
      const existing = [...this.stepRows.values()].find((x) => x.runId === runId && x.key === st.key);
      const id = existing?.id ?? nextId("step");
      this.stepRows.set(id, { ...st, id, runId, updatedAt: new Date() });
    }
    if (changes.logs?.length) await this.addLogs(runId, changes.logs);
    if (changes.run) await this.updateRun(runId, changes.run);
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
