/**
 * Run storage shared by Quiz Master and Color Tap on Firestore: a run is a
 * document in `{collection}/{runId}` and its logs live in the `logs`
 * subcollection. The two leases (see each repo's header) are taken in
 * transactions. The database uses pessimistic concurrency, so a transaction
 * that read a document holds it until it commits. Two tabs can't both win.
 */
import "server-only";
import type { DocumentReference, Firestore, Transaction } from "firebase-admin/firestore";
import { COL, firestore, newId, timeId, toRow } from "@/lib/firestore";

interface LeaseFields {
  status: string;
  lockedUntil: Date | null;
  tickUntil: Date | null;
  tickToken: string | null;
  createdAt: Date;
}

export interface LogEntry {
  at: Date;
  level: string;
  message: string;
}

const MAX_BATCH = 450; // under Firestore's 500 writes per batch

export class FirestoreRuns<Run extends LeaseFields & { id: string }> {
  constructor(private collection: string) {}

  get db(): Firestore {
    return firestore();
  }

  ref(id: string): DocumentReference {
    return this.db.collection(this.collection).doc(id);
  }

  newRef(): DocumentReference {
    return this.ref(newId());
  }

  async getRun(id: string): Promise<Run | null> {
    const snap = await this.ref(id).get();
    return snap.exists ? toRow<Run>(snap) : null;
  }

  /** Running runs, newest first (few at a time, so filtered in memory). */
  async running(tx?: Transaction): Promise<Run[]> {
    const q = this.db.collection(this.collection).where("status", "==", "running");
    const snap = tx ? await tx.get(q) : await q.get();
    return snap.docs.map((d) => toRow<Run>(d)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async listRuns(limit: number): Promise<Run[]> {
    const snap = await this.db.collection(this.collection).orderBy("createdAt", "desc").limit(limit).get();
    return snap.docs.map((d) => toRow<Run>(d));
  }

  async updateRun(id: string, data: Partial<Omit<Run, "id">>): Promise<void> {
    await this.ref(id).update(data as Record<string, unknown>);
  }

  /**
   * Runs `fn` while holding the creation lock for `name`. Reading and writing
   * the lock document serialises every creator, including those whose query
   * would otherwise see no running run.
   */
  async withCreateLock<T>(name: string, now: Date, fn: (tx: Transaction) => Promise<T>): Promise<T> {
    const lock = this.db.collection(COL.locks).doc(name);
    return this.db.runTransaction(async (tx) => {
      await tx.get(lock);
      const out = await fn(tx);
      tx.set(lock, { at: now });
      return out;
    });
  }

  async acquireTick(id: string, token: string, now: Date, tickUntil: Date, lockedUntil: Date): Promise<boolean> {
    const ref = this.ref(id);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return false;
      const run = toRow<Run>(snap);
      if (run.status !== "running" || (run.tickUntil && run.tickUntil >= now)) return false;
      tx.update(ref, { tickUntil, tickToken: token, lockedUntil });
      return true;
    });
  }

  async renewLock(id: string, token: string, lockedUntil: Date): Promise<void> {
    await this.ifToken(id, token, { lockedUntil });
  }

  async releaseTick(id: string, token: string): Promise<void> {
    await this.ifToken(id, token, { tickUntil: null, tickToken: null });
  }

  private async ifToken(id: string, token: string, data: Record<string, unknown>) {
    const ref = this.ref(id);
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists && snap.get("tickToken") === token) tx.update(ref, data);
    });
  }

  async addLogs(runId: string, logs: LogEntry[]): Promise<void> {
    const col = this.ref(runId).collection("logs");
    for (let i = 0; i < logs.length; i += MAX_BATCH) {
      const batch = this.db.batch();
      logs.slice(i, i + MAX_BATCH).forEach((l, j) => batch.create(col.doc(timeId(l.at, i + j)), { ...l }));
      await batch.commit();
    }
  }

  async logs(runId: string, opts: { after?: Date; limit?: number } = {}) {
    let q = this.ref(runId).collection("logs").orderBy("at", "asc");
    if (opts.after) q = q.where("at", ">", opts.after);
    const snap = await q.limit(opts.limit ?? 500).get();
    return snap.docs.map((d) => ({ ...toRow<LogEntry & { id: string }>(d), runId }));
  }

  /** Deletes finished runs created before `date`, with their subcollections. */
  async pruneBefore(date: Date): Promise<number> {
    const snap = await this.db.collection(this.collection).where("createdAt", "<", date).get();
    const old = snap.docs.filter((d) => d.get("status") !== "running");
    for (const d of old) await this.db.recursiveDelete(d.ref);
    return old.length;
  }
}
