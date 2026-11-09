/**
 * Run storage shared by Quiz Master and Color Tap on Firestore: a run is a
 * document in `{collection}/{runId}` and its logs live in the `logs`
 * subcollection. The two leases (see each repo's header) are taken in
 * transactions.
 *
 * Each app keeps its runs in **its own** Firebase project, never in the
 * site's database. Runs are write-heavy, and on the free plan they used to
 * eat the site's daily quota, taking the public pages down with them.
 *
 * The databases use pessimistic concurrency: a transaction that read a
 * document holds a lock on it until it commits. A tick runs up to 3 lanes at
 * once, and when each lane renewed the lease in its own transaction on the
 * same run document, two of them could wait on each other's lock until
 * Firestore aborted one. So writes to one run go through a per-run queue in
 * this process, and the lease is renewed at most once a minute without a
 * transaction.
 */
import "server-only";
import type { DocumentReference, Firestore, Transaction } from "firebase-admin/firestore";
import { newId, toRow } from "@/lib/firestore";

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

/** Log lines per document: one write per flush, far under the 1 MiB doc limit. */
const LINES_PER_DOC = 200;
/** Don't renew the run lease (10 min) more often than this. */
const RENEW_EVERY_MS = 60_000;

export class FirestoreRuns<Run extends LeaseFields & { id: string }> {
  /** Writes to one run, one at a time (see the header). */
  private queues = new Map<string, Promise<unknown>>();
  private renewedAt = new Map<string, number>();

  constructor(
    private collection: string,
    private getDb: () => Firestore,
    private locksCollection: string
  ) {}

  get db(): Firestore {
    return this.getDb();
  }

  ref(id: string): DocumentReference {
    return this.db.collection(this.collection).doc(id);
  }

  newRef(): DocumentReference {
    return this.ref(newId());
  }

  /** Runs `fn` after every earlier queued write to run `id` has settled. */
  private serial<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(id) ?? Promise.resolve();
    const next = prev.catch(() => {}).then(fn);
    this.queues.set(id, next);
    void next.finally(() => {
      if (this.queues.get(id) === next) this.queues.delete(id);
    }).catch(() => {});
    return next;
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

  updateRun(id: string, data: Partial<Omit<Run, "id">>): Promise<void> {
    return this.serial(id, async () => {
      await this.ref(id).update(data as Record<string, unknown>);
    });
  }

  /**
   * Runs `fn` while holding the creation lock for `name`. Reading and writing
   * the lock document serialises every creator, including those whose query
   * would otherwise see no running run.
   */
  async withCreateLock<T>(name: string, now: Date, fn: (tx: Transaction) => Promise<T>): Promise<T> {
    const lock = this.db.collection(this.locksCollection).doc(name);
    return this.db.runTransaction(async (tx) => {
      await tx.get(lock);
      const out = await fn(tx);
      tx.set(lock, { at: now });
      return out;
    });
  }

  async acquireTick(id: string, token: string, now: Date, tickUntil: Date, lockedUntil: Date): Promise<boolean> {
    const ref = this.ref(id);
    return this.serial(id, () =>
      this.db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return false;
        const run = toRow<Run>(snap);
        if (run.status !== "running" || (run.tickUntil && run.tickUntil >= now)) return false;
        tx.update(ref, { tickUntil, tickToken: token, lockedUntil });
        return true;
      })
    );
  }

  /**
   * Extends the run lease while `token` holds the tick lease. At most once a
   * minute, and not in a transaction: the worst a race can do is extend the
   * lease of a run that another tick has just taken over, which is harmless.
   */
  renewLock(id: string, token: string, lockedUntil: Date): Promise<void> {
    const key = `${id}|${token}`;
    const last = this.renewedAt.get(key) ?? 0;
    if (Date.now() - last < RENEW_EVERY_MS) return Promise.resolve();
    this.renewedAt.set(key, Date.now());
    return this.serial(id, async () => {
      const snap = await this.ref(id).get();
      if (snap.exists && snap.get("tickToken") === token) await snap.ref.update({ lockedUntil });
    });
  }

  async releaseTick(id: string, token: string): Promise<void> {
    this.renewedAt.delete(`${id}|${token}`);
    const ref = this.ref(id);
    await this.serial(id, () =>
      this.db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists && snap.get("tickToken") === token) tx.update(ref, { tickUntil: null, tickToken: null });
      })
    );
  }

  /** Writes the lines as one document per `LINES_PER_DOC` (one write per flush). */
  async addLogs(runId: string, logs: LogEntry[]): Promise<void> {
    if (!logs.length) return;
    const col = this.ref(runId).collection("logs");
    for (let i = 0; i < logs.length; i += LINES_PER_DOC) {
      const lines = logs.slice(i, i + LINES_PER_DOC).map((l) => ({ at: l.at, level: l.level, message: l.message }));
      const first = lines[0]!.at;
      const last = lines[lines.length - 1]!.at;
      await col.doc(newId()).create({ first, last, lines });
    }
  }

  /** Log lines in time order, those after `after` only, at most `limit`. */
  async logs(runId: string, opts: { after?: Date; limit?: number } = {}) {
    const limit = opts.limit ?? 500;
    let q = this.ref(runId).collection("logs").orderBy("last", "asc");
    if (opts.after) q = q.where("last", ">", opts.after);
    const snap = await q.limit(Math.ceil(limit / 10) + 5).get();
    const out: Array<LogEntry & { id: string; runId: string }> = [];
    for (const d of snap.docs) {
      const row = toRow<{ lines?: LogEntry[] }>(d);
      (row.lines ?? []).forEach((l, i) => {
        if (!opts.after || l.at > opts.after) out.push({ ...l, id: `${d.id}:${i}`, runId });
      });
    }
    out.sort((a, b) => a.at.getTime() - b.at.getTime());
    return out.slice(0, limit);
  }

  /** Deletes finished runs created before `date`, with their subcollections. */
  async pruneBefore(date: Date): Promise<number> {
    const snap = await this.db.collection(this.collection).where("createdAt", "<", date).select("status").get();
    const old = snap.docs.filter((d) => d.get("status") !== "running");
    for (const d of old) await this.db.recursiveDelete(d.ref);
    return old.length;
  }
}
