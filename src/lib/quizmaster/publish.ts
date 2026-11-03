/**
 * Tell the phones what's in the bank, and write the seed bank.
 * Port of quizmaster `automation/jobs/question_bank/publish.py` and the
 * `seed` command in `__main__.py`.
 *
 * Publish first folds any old week or month docs into the category's
 * `base_*` docs (and deletes them), so the bank stays one doc per category.
 * Then it sets Firestore `meta/questions` to `{version, files, counts,
 * updatedAt}`, `files` listing every `question_files` doc with its `md5`.
 * Phones read only this document on each open and download the docs whose
 * `md5` changed.
 */
import "server-only";
import type { Group } from "./assets";
import * as qb from "./questionBank";
import { SERVER_TIME, type Write } from "./writes";

export interface Manifest {
  version: number;
  files: Array<{ id: string; category: string; period: string; count: number; md5: string }>;
  counts: Record<string, number>;
}

export async function manifest(store: qb.BankStore, version: number): Promise<Manifest> {
  const files = (await store.listMeta()).map((d) => ({
    id: d.id,
    category: d.category,
    period: d.period,
    count: d.count,
    md5: d.md5,
  }));
  const counts: Record<string, number> = {};
  for (const f of files) counts[f.category] = (counts[f.category] ?? 0) + f.count;
  return { version, files, counts };
}

export interface PublisherOptions {
  store: qb.BankStore;
  commit: (writes: Write[]) => Promise<void>;
  now: Date;
  log?: (line: string) => void;
}

/** Returns the manifest it published. */
export async function publish(o: PublisherOptions): Promise<Manifest> {
  const log = o.log ?? (() => {});
  const categories = [...new Set((await o.store.listMeta()).map((d) => d.category))].sort();
  for (const category of categories) {
    for (const docId of await qb.foldIntoBase(o.store, category)) {
      log(`folded ${qb.COLLECTION}/${docId} into base_${category}`);
    }
  }
  // Seconds since the epoch: always larger than the last run's.
  const published = await manifest(o.store, Math.floor(o.now.getTime() / 1000));
  await o.commit([{ op: "set", path: qb.META, data: { ...published, updatedAt: SERVER_TIME } }]);
  const total = Object.values(published.counts).reduce((a, b) => a + b, 0);
  log(`published ${qb.META} v${published.version}: ${published.files.length} docs, ${total} question groups`);
  return published;
}

/** Writes every category of the seed bank to its `base_*` doc. */
export async function seed(store: qb.BankStore, bank: Record<string, Group[]>, log: (line: string) => void = () => {}) {
  for (const [category, groups] of Object.entries(bank)) {
    const doc = await qb.writeSeed(store, category, groups);
    log(`wrote ${qb.COLLECTION}/${doc.id}: ${doc.count} questions`);
  }
}
