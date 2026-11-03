/**
 * The daily quiz: picks the day's 10 challenge questions from the category's
 * new questions in the bank, publishes `daily_challenges/{date}` and sends
 * the "new quiz" push (`Notifier`, plugged in through `notify`).
 * Port of quizmaster `automation/jobs/daily_quiz/job.py`.
 */
import "server-only";
import type { Group } from "./assets";
import { categoryFor } from "./categories";
import { SendFailed, type QuestionDoc } from "./dailyNotify";
import * as ist from "./ist";
import { loadCategory, type BankStore } from "./questionBank";
import { PyRandom } from "./pyRandom";
import { SERVER_TIME, type Doc, type DocStore, type Write } from "./writes";
import type { Lang } from "./assets";

/** Questions per difficulty, the same as the app's `DailyChallengeService.mix`. */
export const MIX: Record<string, number> = { easy: 4, medium: 3, hard: 3 };
const MIX_TOTAL = 10;
export const NOON = 12; // from here the app plays its local challenge instead
const LANGUAGES: Lang[] = ["en", "hi", "hi-Latn"];

/** The bank doesn't have 10 unused questions for the category. */
export class NotEnoughQuestions extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotEnoughQuestions";
  }
}

/** One flat doc per group and language, the shape the notifier reads. */
export function questionDocs(groups: Group[], category: string): QuestionDoc[] {
  const out: QuestionDoc[] = [];
  for (const g of groups) {
    for (const lang of LANGUAGES) {
      const v = g[lang] as { question: string; options: string[] } | undefined;
      if (!v) continue;
      out.push({
        groupId: g.groupId,
        category,
        subcategory: (g.subcategory as string | undefined) ?? "",
        difficulty: g.difficulty,
        language: lang,
        questionText: v.question,
        options: v.options,
        correctIndex: g.correctIndex,
      });
    }
  }
  return out;
}

/**
 * 10 groups in the 4/3/3 mix, easy first, preferring the day's new ones.
 * Gaps are filled from the category's older questions that no challenge has
 * used, newest day first, the base bank last. Returns the groups and whether
 * any are older than today. `rng` is `random.Random(date)` in Python; the
 * shuffles consume it in exactly the same order.
 */
export async function chooseDaily(
  store: BankStore,
  category: string,
  date: string,
  used: Set<string>,
  rng: PyRandom,
  log: (line: string) => void
): Promise<{ groups: Group[]; older: boolean }> {
  const byDay = new Map<string | null, Group[]>();
  for (const g of await loadCategory(store, category)) {
    if (used.has(g.groupId)) continue;
    const day = g.addedOn ?? null;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(g);
  }
  const olderDays = [...byDay.keys()]
    .filter((d): d is string => Boolean(d) && d !== date)
    .sort()
    .reverse();
  const chosen: Record<string, Group[]> = { easy: [], medium: [], hard: [] };
  let older = false;
  for (const day of [date, ...olderDays, null]) {
    const groups = byDay.get(day) ?? [];
    rng.shuffle(groups);
    for (const g of groups) {
      const bucket = chosen[g.difficulty];
      if (bucket !== undefined && bucket.length < MIX[g.difficulty]!) {
        bucket.push(g);
        older = older || day !== date;
      }
    }
  }
  const total = Object.values(chosen).reduce((n, b) => n + b.length, 0);
  if (total < MIX_TOTAL) {
    throw new NotEnoughQuestions(`only ${total} of ${MIX_TOTAL} unused questions in ${category}`);
  }
  if (older) log("filled the gaps from older questions");
  return { groups: Object.keys(MIX).flatMap((d) => chosen[d]!), older };
}

export function challengeWrite(date: string, category: string, groups: Group[], older: boolean, now: Date): Write {
  const dayStart = ist.fromKey(date);
  return {
    op: "create",
    path: `daily_challenges/${date}`,
    data: {
      category,
      difficulty: "medium",
      groupIds: groups.map((g) => g.groupId),
      source: older ? "pool" : "ai",
      publishedAt: SERVER_TIME,
      activeFrom: new Date(Math.max(now.getTime(), dayStart.getTime())),
      activeUntil: ist.nextMidnight(dayStart),
    },
  };
}

async function groupsById(store: BankStore, category: string, ids: string[]): Promise<Group[]> {
  const wanted = new Set(ids);
  const found = new Map<string, Group>();
  for (const g of await loadCategory(store, category)) if (wanted.has(g.groupId)) found.set(g.groupId, g);
  return ids.filter((id) => found.has(id)).map((id) => found.get(id)!);
}

export type DailyStatus = "exists" | "past_noon" | "published" | "notify_failed";

export interface DailyJobOptions {
  /** Firestore docs; a `DryRunDocStore` under a dry run. */
  docs: DocStore;
  bank: BankStore;
  now: Date;
  force?: boolean;
  log?: (line: string) => void;
  /** `Notifier.run`: the date, the challenge doc and its question docs. */
  notify?: (date: string, challenge: Doc, docs: QuestionDoc[]) => Promise<void>;
}

export class DailyJob {
  private log: (line: string) => void;
  constructor(private o: DailyJobOptions) {
    this.log = o.log ?? (() => {});
  }

  commit = (writes: Write[]) => this.o.docs.commit(writes);

  /** Returns `exists`, `past_noon` or `published`, or `notify_failed` when the
   * quiz is out but a push couldn't be sent. Throws `NotEnoughQuestions`. */
  async run(date: string): Promise<DailyStatus> {
    const existing = await this.o.docs.read(`daily_challenges/${date}`);
    if (existing) {
      this.log(`daily_challenges/${date} already exists; skipping`);
      const category = (existing.category as string | undefined) ?? "";
      const groups = await groupsById(this.o.bank, category, (existing.groupIds as string[] | undefined) ?? []);
      return (await this.notify(date, existing, questionDocs(groups, category))) ? "exists" : "notify_failed";
    }
    const dayStart = ist.fromKey(date);
    if (this.o.now.getTime() >= ist.atTime(dayStart, NOON).getTime() && !this.o.force) {
      this.log(`past 12:00 IST for ${date}; the app plays its local quiz. Use force to publish anyway`);
      return "past_noon";
    }
    const category = categoryFor(ist.dayNumber(dayStart));
    this.log(`${date}: category ${category}`);
    const used = await this.o.docs.usedGroupIds(category);
    const { groups, older } = await chooseDaily(this.o.bank, category, date, used, new PyRandom(date), this.log);
    const challenge = challengeWrite(date, category, groups, older, this.o.now);
    await this.commit([challenge]);
    this.log(`published daily_challenges/${date}: ${groups.length} questions`);
    const notified = await this.notify(date, challenge.data, questionDocs(groups, category));
    return notified ? "published" : "notify_failed";
  }

  private async notify(date: string, challenge: Doc, docs: QuestionDoc[]): Promise<boolean> {
    if (!this.o.notify) return true;
    try {
      await this.o.notify(date, challenge, docs);
    } catch (err) {
      if (!(err instanceof SendFailed)) throw err;
      this.log(`the push failed (${err.message}); the next run retries before noon`);
      return false;
    }
    return true;
  }
}
