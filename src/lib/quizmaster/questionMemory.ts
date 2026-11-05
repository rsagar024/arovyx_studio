/**
 * What the question writer is told about the bank, so it writes something new
 * instead of having its work thrown away by the duplicate check afterwards.
 *
 * - `buildMemory` picks, for each difficulty, as many known questions as fit a
 *   size budget (that difficulty first, as that's where repeats come from) and
 *   the topics and question openings the category already has too many of.
 *   When the bank outgrows the budget the pick changes from run to run, so old
 *   questions still get their turn.
 * - `FactIndex` is the second duplicate check: the same answer with mostly the
 *   same words is the same fact reworded, which `dedupHash` can't see.
 */
import "server-only";
import { createHash } from "node:crypto";
import type { Group } from "./assets";
import { casefold } from "./pyText";
import { DIFFICULTIES, normalize, type Difficulty } from "./questionChecks";

/** About 6k tokens, which every model in the pool takes with room to reply. */
export const MAX_AVOID_CHARS = 24_000;
/** Share of content words two questions need in common to be the same fact. */
export const REWORD_SIMILARITY = 0.7;
/** A question this short says too little to count as contained in another. */
const MIN_WORDS_FOR_CONTAINED = 3;
const MAX_TOPICS = 12;
const MAX_PATTERNS = 8;
const MIN_TOPIC_COUNT = 3;
const MIN_PATTERN_COUNT = 5;
const PATTERN_WORDS = 3;

const STOPWORDS = new Set(
  (
    "a an and are as at be by did do does for from has have in is it its known called name named of on or the " +
    "this that these those to was were what when where which who whom whose why how"
  ).split(" ")
);

export interface QuestionMemory {
  /** Different questions the category has. */
  known: number;
  avoid: Record<Difficulty, string[]>;
  overusedTopics: Record<string, number>;
  overusedPatterns: Record<string, number>;
}

/** A question this run already generated, whatever became of it. */
export interface KnownFact {
  question: string;
  answer: string;
}

const words = (text: string) =>
  casefold(text.normalize("NFKC"))
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

const contentWords = (text: string) => new Set(words(text).filter((w) => !STOPWORDS.has(w)));

/** Mostly the same words, or one question is the other with more added ("…
 * Hogenakkal Falls?" and "… Hogenakkal Falls in Tamil Nadu?"). */
function sameFact(a: Set<string>, b: Set<string>): boolean {
  if (!a.size || !b.size) return false;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  if (shared / (a.size + b.size - shared) >= REWORD_SIMILARITY) return true;
  const smaller = Math.min(a.size, b.size);
  return smaller >= MIN_WORDS_FOR_CONTAINED && shared === smaller;
}

/** The most frequent entries, commonest first, ties in the order first seen. */
function top(counts: Map<string, number>, min: number, limit: number): Record<string, number> {
  const entries = [...counts.entries()].filter(([, n]) => n >= min).sort((x, y) => y[1] - x[1]);
  return Object.fromEntries(entries.slice(0, limit));
}

function bump(counts: Map<string, number>, key: string) {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

/** Fills the budget from `questions`, in order. */
function fit(questions: string[], budget: number): string[] {
  const out: string[] = [];
  let used = 0;
  for (const q of questions) {
    if (used + q.length > budget) break;
    out.push(q);
    used += q.length;
  }
  return out;
}

/** `rotation` (date and slot) reorders the questions, so each run's pick differs. */
export function buildMemory(groups: Group[], rotation: string, budget = MAX_AVOID_CHARS): QuestionMemory {
  const unique = new Map<string, Group>();
  for (const g of groups) {
    const key = normalize(g.en.question);
    if (!unique.has(key)) unique.set(key, g);
  }
  const rank = (q: string) => createHash("sha1").update(`${rotation}|${q}`, "utf8").digest("hex");
  const known = [...unique.values()]
    .map((g) => ({ question: g.en.question, difficulty: g.difficulty, rank: rank(g.en.question) }))
    .sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0));

  const topics = new Map<string, number>();
  const patterns = new Map<string, number>();
  for (const g of unique.values()) {
    if (typeof g.subcategory === "string" && g.subcategory) bump(topics, g.subcategory);
    const opening = words(g.en.question).slice(0, PATTERN_WORDS);
    // "what is the" says nothing; "which district of" does.
    if (opening.length === PATTERN_WORDS && opening.some((w) => !STOPWORDS.has(w))) bump(patterns, opening.join(" "));
  }

  const avoid = Object.fromEntries(
    DIFFICULTIES.map((d) => {
      const same = known.filter((k) => k.difficulty === d).map((k) => k.question);
      const other = known.filter((k) => k.difficulty !== d).map((k) => k.question);
      return [d, fit([...same, ...other], budget)];
    })
  ) as Record<Difficulty, string[]>;

  return {
    known: known.length,
    avoid,
    overusedTopics: top(topics, MIN_TOPIC_COUNT, MAX_TOPICS),
    overusedPatterns: top(patterns, MIN_PATTERN_COUNT, MAX_PATTERNS),
  };
}

/** This run's questions, newest first, then the bank's, within the budget. */
export function avoidFor(
  memory: QuestionMemory,
  difficulty: Difficulty,
  runQuestions: string[],
  budget = MAX_AVOID_CHARS
): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const q of [...[...runQuestions].reverse(), ...memory.avoid[difficulty]]) {
    const key = normalize(q);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(q);
  }
  return fit(merged, budget);
}

/** Questions by normalised answer, to catch the same fact in other words. */
export class FactIndex {
  private byAnswer = new Map<string, Array<Set<string>>>();

  add(question: string, answer: string) {
    const key = normalize(answer);
    const list = this.byAnswer.get(key);
    if (list) list.push(contentWords(question));
    else this.byAnswer.set(key, [contentWords(question)]);
  }

  /** Whether a known question with this answer says mostly the same thing. */
  matches(question: string, answer: string): boolean {
    const list = this.byAnswer.get(normalize(answer));
    if (!list) return false;
    const mine = contentWords(question);
    return list.some((other) => sameFact(mine, other));
  }
}
