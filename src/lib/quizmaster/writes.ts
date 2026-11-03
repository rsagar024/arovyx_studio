/**
 * Firestore writes as plain data, so the same list can be committed, logged
 * for a dry run, or applied to the in-memory store in tests.
 * Port of quizmaster `automation/common/writes.py` and the daily quiz store.
 */
import "server-only";
import { pyDumps } from "./pyJson";

class ServerTime {
  toJSON() {
    return "SERVER_TIME";
  }
}
/** Firestore's server timestamp. */
export const SERVER_TIME = new ServerTime();

/** Adds `by` to a numeric field (a missing field counts as 0). */
export class Increment {
  constructor(readonly by: number) {}
  toJSON() {
    return `Increment(${this.by})`;
  }
}

export type WriteOp = "create" | "set" | "merge" | "delete";
export interface Write {
  /** `create` fails if the document exists; `merge` keeps unnamed fields;
   * `delete` ignores `data`. */
  op: WriteOp;
  path: string;
  data: Record<string, unknown>;
}

export const MAX_BATCH = 500; // Firestore's limit on writes in one batch

export type Doc = Record<string, unknown>;

/** What the jobs read from and write to Firestore (outside the bank). */
export interface DocStore {
  /** One doc as a plain object (timestamps as `Date`), or null. */
  read(path: string): Promise<Doc | null>;
  /** Applies all the writes atomically. */
  commit(writes: Write[]): Promise<void>;
  /** Group ids already used by a daily challenge in the category. */
  usedGroupIds(category: string): Promise<Set<string>>;
  /** Whether any score was uploaded in the ISO week (`scores.weekKey`). */
  weekPlayed(week: string): Promise<boolean>;
}

function isMap(v: unknown): v is Doc {
  return typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Date) &&
    !(v instanceof ServerTime) && !(v instanceof Increment) && !Buffer.isBuffer(v);
}

/** Applies `writes` to `docs` (keyed by path) the way a Firestore batch
 * would: all or nothing, nested maps merge, lists are replaced. */
export function applyInMemory(docs: Map<string, Doc>, writes: Write[], now: Date): void {
  if (writes.length > MAX_BATCH) throw new Error(`${writes.length} writes is over Firestore's batch limit`);
  for (const w of writes) {
    if (w.op === "create" && docs.has(w.path)) throw new Error(`${w.path} already exists`);
  }
  const apply = (old: Doc, data: Doc, merge: boolean): Doc => {
    const next: Doc = merge ? { ...old } : {};
    for (const [key, raw] of Object.entries(data)) {
      let value: unknown = raw;
      if (raw === SERVER_TIME) value = now;
      else if (raw instanceof Increment) value = (typeof old[key] === "number" ? (old[key] as number) : 0) + raw.by;
      else if (isMap(raw)) {
        const inner = merge && isMap(old[key]) ? (old[key] as Doc) : {};
        value = apply(inner, raw, merge);
      }
      next[key] = value;
    }
    return next;
  };
  for (const w of writes) {
    if (w.op === "delete") docs.delete(w.path);
    else docs.set(w.path, apply(docs.get(w.path) ?? {}, w.data, w.op === "merge"));
  }
}

/** Documents in a map keyed by path (tests, and a dry run with no key). */
export class MemoryDocStore implements DocStore {
  readonly docs = new Map<string, Doc>();
  readonly commits: Write[][] = [];
  constructor(
    private clock: () => Date = () => new Date(Date.UTC(2000, 0, 1)),
    private played: (week: string) => boolean = () => true
  ) {}

  async read(path: string) {
    return this.docs.get(path) ?? null;
  }

  async commit(writes: Write[]) {
    applyInMemory(this.docs, writes, this.clock());
    this.commits.push([...writes]);
  }

  async usedGroupIds(category: string) {
    const used = new Set<string>();
    for (const [path, doc] of this.docs) {
      if (path.startsWith("daily_challenges/") && doc.category === category) {
        for (const id of (doc.groupIds as string[] | undefined) ?? []) used.add(id);
      }
    }
    return used;
  }

  async weekPlayed(week: string) {
    return this.played(week);
  }
}

/** `[dry-run] {op} {path} {json[:300]}`, as the Python `DryRunWriter` printed. */
export function dryRunLine(op: string, path: string, data: Doc): string {
  return `[dry-run] ${op} ${path} ${pyDumps(JSON.parse(JSON.stringify(data))).slice(0, 300)}`;
}

/** Reads from `inner`, logs writes instead of making them. */
export class DryRunDocStore implements DocStore {
  readonly writes: Array<[string, string, Doc]> = [];
  constructor(private inner: DocStore, private log: (line: string) => void) {}

  read(path: string) {
    return this.inner.read(path);
  }
  usedGroupIds(category: string) {
    return this.inner.usedGroupIds(category);
  }
  weekPlayed(week: string) {
    return this.inner.weekPlayed(week);
  }
  async commit(writes: Write[]) {
    for (const w of writes) {
      this.writes.push([w.op, w.path, w.data]);
      this.log(dryRunLine(w.op, w.path, w.data));
    }
  }
}
