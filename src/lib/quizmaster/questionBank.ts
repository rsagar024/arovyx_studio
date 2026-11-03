/**
 * The question bank in Firestore: document ids, the packed format and the
 * manifest the app reads. Port of quizmaster `automation/common/question_bank.py`.
 *
 *     question_files/base_{category}        a category's whole bank: the seed
 *                                           bank, then 45 new groups (15 per
 *                                           difficulty) per run
 *     question_files/base_{category}_{n}    more of the same once a doc is full
 *     question_files/{monday}_{category}    old week and month docs from
 *     question_files/{yyyy-MM}_{category}   before; read, never written,
 *                                           folded into base by `publish`
 *     meta/questions                        `{version, files, counts}`
 *
 * Each `question_files` doc holds `category`, `period`, `count`, `md5` and
 * `data`: gzip JSON `{"category", "period", "questions": [group, ...]}` as
 * Bytes. The JSON is written exactly like Python's `json.dumps(...,
 * ensure_ascii=False)` and the gzip header like `gzip.compress(...,
 * mtime=0)`, so the same groups give the same bytes and the same md5.
 */
import "server-only";
import { createHash } from "node:crypto";
import zlib from "node:zlib";
import { deflateRaw } from "pako";
import type { Group } from "./assets";
import * as ist from "./ist";
import { pyDumps } from "./pyJson";

export const COLLECTION = "question_files";
export const META = "meta/questions";
/** Refuse to write a doc this big; Firestore's limit is 1 MiB. Mutable for tests. */
export const limits = { MAX_BYTES: 900_000 };

export function baseId(category: string, part = 1): string {
  return part === 1 ? `base_${category}` : `base_${category}_${part}`;
}

export interface BankDoc {
  id: string;
  category: string;
  /** `base`, or for old docs a week's Monday or a month. */
  period: string;
  count: number;
  md5: string;
  /** Empty when listed through `listMeta`. */
  data: Buffer;
}

export const isBase = (d: BankDoc) => d.period === "base";

export function basePart(doc: BankDoc): number {
  const suffix = doc.id.slice(baseId(doc.category).length);
  return suffix.startsWith("_") && /^\d+$/.test(suffix.slice(1)) ? Number(suffix.slice(1)) : 1;
}

/** The doc for the month of `date` (`yyyy-MM-dd` or `yyyy-MM`). */
export function monthId(date: string, category: string): string {
  return `${date.slice(0, 7)}_${category}`;
}

/** The Monday (`yyyy-MM-dd`) of the week containing `date`. */
export function weekPeriod(date: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const day = new Date(Date.UTC(y, m - 1, d));
  const weekday = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - weekday);
  return day.toISOString().slice(0, 10);
}

export function weekId(date: string, category: string): string {
  return `${weekPeriod(date)}_${category}`;
}

export const SLOTS = ["am", "pm"] as const;
/** Runs from 15:00 IST on add the evening (`pm`) batch. */
export const EVENING_FROM = 15;
const EXTRA_SLOT = /^x\d+$/;

/** `am`, `pm`, or an extra batch like `x123`. */
export function isSlot(value: string): boolean {
  return (SLOTS as readonly string[]).includes(value) || EXTRA_SLOT.test(value);
}

/** `am` for the morning run, `pm` from 15:00 IST. */
export function slotFor(now: Date): "am" | "pm" {
  return ist.wallClock(now).hour >= EVENING_FROM ? "pm" : "am";
}

/* ---------------------------- packing ---------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Python's `gzip.compress(data, compresslevel=9, mtime=0)`: a fixed header
 * (no name, mtime 0, XFL 2 = best compression, OS 255 = unknown), a raw
 * deflate stream, then CRC-32 and size.
 *
 * The deflate stream comes from pako, a port of stock zlib, because Node's
 * bundled zlib (Chromium's fork) compresses differently. The Python jobs ran
 * on GitHub's Ubuntu runners with stock zlib, so pako reproduces their bytes
 * and md5 exactly (checked against stock zlib 1.2.13 in the tests). */
export function gzipLikePython(data: Buffer): Buffer {
  const header = Buffer.from("1f8b08000000000002ff", "hex");
  const body = Buffer.from(deflateRaw(data, { level: 9 }));
  const trailer = Buffer.alloc(8);
  trailer.writeUInt32LE(crc32(data), 0);
  trailer.writeUInt32LE(data.length >>> 0, 4);
  return Buffer.concat([header, body, trailer]);
}

export function encode(category: string, period: string, groups: Group[]): Buffer {
  const body = { category, period, questions: groups };
  return gzipLikePython(Buffer.from(pyDumps(body), "utf8"));
}

export function decode(data: Buffer): { category: string; period: string; questions: Group[] } {
  return JSON.parse(zlib.gunzipSync(data).toString("utf8"));
}

export function md5(data: Buffer): string {
  return createHash("md5").update(data).digest("hex");
}

export class DocTooBig extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValueError";
  }
}

export function makeDoc(docId: string, category: string, period: string, groups: Group[]): BankDoc {
  const data = encode(category, period, groups);
  if (data.length > limits.MAX_BYTES) {
    throw new DocTooBig(`${docId} would be ${data.length} bytes, over the ${limits.MAX_BYTES} limit`);
  }
  return { id: docId, category, period, count: groups.length, md5: md5(data), data };
}

/* ----------------------------- stores ---------------------------------- */

export interface BankStore {
  /** The doc with its data, or null. */
  get(docId: string): Promise<BankDoc | null>;
  /** Creates or replaces the doc. */
  put(doc: BankDoc): Promise<void>;
  /** Every doc without its data, sorted by id. */
  listMeta(): Promise<BankDoc[]>;
  /** Removes the doc, if there. */
  delete(docId: string): Promise<void>;
}

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export class MemoryBankStore implements BankStore {
  readonly docs = new Map<string, BankDoc>();
  async get(docId: string) {
    return this.docs.get(docId) ?? null;
  }
  async put(doc: BankDoc) {
    this.docs.set(doc.id, doc);
  }
  async listMeta() {
    return [...this.docs.values()].map((d) => ({ ...d, data: Buffer.alloc(0) })).sort(byId);
  }
  async delete(docId: string) {
    this.docs.delete(docId);
  }
}

/** Reads from `inner`, logs writes instead of making them. Later reads see
 * the pretend writes, so a dry run behaves like a real one. */
export class DryRunBankStore implements BankStore {
  private pending = new MemoryBankStore();
  private deleted = new Set<string>();
  constructor(private inner: BankStore, private log: (line: string) => void = () => {}) {}

  async get(docId: string) {
    if (this.deleted.has(docId)) return null;
    return (await this.pending.get(docId)) ?? (await this.inner.get(docId));
  }
  async put(doc: BankDoc) {
    this.log(`[dry-run] set ${COLLECTION}/${doc.id} (${doc.count} questions, ${doc.data.length} bytes)`);
    this.deleted.delete(doc.id);
    await this.pending.put(doc);
  }
  async listMeta() {
    const docs = new Map<string, BankDoc>();
    for (const d of await this.inner.listMeta()) docs.set(d.id, d);
    for (const d of await this.pending.listMeta()) docs.set(d.id, d);
    return [...docs.values()].filter((d) => !this.deleted.has(d.id)).sort(byId);
  }
  async delete(docId: string) {
    this.log(`[dry-run] delete ${COLLECTION}/${docId}`);
    await this.pending.delete(docId);
    this.deleted.add(docId);
  }
}

/* ----------------------------- helpers --------------------------------- */

export async function loadGroups(store: BankStore, docId: string): Promise<Group[]> {
  const doc = await store.get(docId);
  return doc && doc.data.length ? decode(doc.data).questions : [];
}

/** The category's docs: base parts in order, then old weeks and months oldest first. */
export async function categoryDocs(store: BankStore, category: string): Promise<BankDoc[]> {
  const docs = (await store.listMeta()).filter((d) => d.category === category);
  const key = (d: BankDoc): [number, number, string] => [isBase(d) ? 0 : 1, isBase(d) ? basePart(d) : 0, d.period];
  return docs.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka[0] !== kb[0]) return ka[0] - kb[0];
    if (ka[1] !== kb[1]) return ka[1] - kb[1];
    return ka[2] < kb[2] ? -1 : ka[2] > kb[2] ? 1 : 0;
  });
}

export async function baseParts(store: BankStore, category: string): Promise<BankDoc[]> {
  return (await categoryDocs(store, category)).filter(isBase);
}

/** Every group of a category, oldest first. */
export async function loadCategory(store: BankStore, category: string, skipBase = false): Promise<Group[]> {
  const out: Group[] = [];
  for (const d of await categoryDocs(store, category)) {
    if (skipBase && isBase(d)) continue;
    out.push(...(await loadGroups(store, d.id)));
  }
  return out;
}

export function inBatch(group: Group, date: string, slot: string): boolean {
  return group.addedOn === date && (group.batch ?? "am") === slot;
}

/** Whether the `slot` run on `date` already added questions: in the base
 * docs, or the old week or month doc. */
export async function hasBatch(store: BankStore, category: string, date: string, slot: string): Promise<boolean> {
  const ids = (await baseParts(store, category)).map((d) => d.id);
  ids.push(weekId(date, category), monthId(date, category));
  for (const id of ids) {
    if ((await loadGroups(store, id)).some((g) => inBatch(g, date, slot))) return true;
  }
  return false;
}

/** Adds `groups` to the end of the category's bank, first removing the groups
 * `drop` matches. Starts a new part when the last one is full. Returns the
 * doc the groups went into. */
export async function mergeIntoBase(
  store: BankStore,
  category: string,
  groups: Group[],
  drop: (g: Group) => boolean = () => false
): Promise<BankDoc> {
  const parts: Array<[string, Group[], boolean]> = [];
  for (const d of await baseParts(store, category)) {
    const old = await loadGroups(store, d.id);
    const kept = old.filter((g) => !drop(g));
    parts.push([d.id, kept, kept.length !== old.length]);
  }
  if (!parts.length) parts.push([baseId(category), [], true]);
  const [lastId, last] = parts[parts.length - 1]!;
  let target: BankDoc;
  try {
    target = makeDoc(lastId, category, "base", [...last, ...groups]);
  } catch (err) {
    if (!(err instanceof DocTooBig)) throw err;
    target = makeDoc(baseId(category, parts.length + 1), category, "base", groups);
  }
  for (const [docId, kept, changed] of parts) {
    if (changed && docId !== target.id) await store.put(makeDoc(docId, category, "base", kept));
  }
  await store.put(target);
  return target;
}

/** Moves the groups of the category's old week and month docs into its bank
 * (ones already there are skipped), then deletes those docs. Returns the ids
 * deleted. */
export async function foldIntoBase(store: BankStore, category: string): Promise<string[]> {
  const old = (await categoryDocs(store, category)).filter((d) => !isBase(d));
  if (!old.length) return [];
  const have = new Set<string>();
  for (const d of await baseParts(store, category)) {
    for (const g of await loadGroups(store, d.id)) have.add(g.groupId);
  }
  const groups: Group[] = [];
  for (const d of old) {
    for (const g of await loadGroups(store, d.id)) {
      if (!have.has(g.groupId)) {
        have.add(g.groupId);
        groups.push(g);
      }
    }
  }
  if (groups.length) await mergeIntoBase(store, category, groups);
  for (const d of old) await store.delete(d.id);
  return old.map((d) => d.id);
}

/** Puts the seed bank at the start of the category's bank, replacing earlier
 * copies of its groups and keeping every other group. */
export async function writeSeed(store: BankStore, category: string, seed: Group[]): Promise<BankDoc> {
  const ids = new Set(seed.map((g) => g.groupId));
  const parts = await baseParts(store, category);
  const first = parts.length
    ? [...seed, ...(await loadGroups(store, parts[0]!.id)).filter((g) => !ids.has(g.groupId))]
    : seed;
  const doc = makeDoc(baseId(category), category, "base", first);
  await store.put(doc);
  for (const d of parts.slice(1)) {
    const old = await loadGroups(store, d.id);
    const kept = old.filter((g) => !ids.has(g.groupId));
    if (kept.length !== old.length) await store.put(makeDoc(d.id, category, "base", kept));
  }
  return doc;
}

/** Merges a run's groups into the category's bank, replacing any earlier
 * groups of the same run (a forced re-run). Everything else stays. */
export function appendBatch(store: BankStore, category: string, date: string, slot: string, groups: Group[]) {
  return mergeIntoBase(store, category, groups, (g) => inBatch(g, date, slot));
}
