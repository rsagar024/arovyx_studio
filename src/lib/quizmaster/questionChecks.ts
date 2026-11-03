/**
 * Checks for generated questions and their Hindi and Hinglish variants.
 * Port of quizmaster `automation/common/question_checks.py`.
 *
 * 4 unique options, `correctIndex` 0-3, a non-empty explanation, `hi` mostly
 * Devanagari and `hi-Latn` (and `en`) with no Devanagari at all.
 */
import "server-only";
import { createHash } from "node:crypto";
import { PY_B, casefold, isNonEmptyString, isPyInt, pyLen, pyRepr, pyStrip } from "./pyText";
import { hasDevanagari, hasUrl, isMostlyDevanagari } from "./textChecks";

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export const LANGUAGES = ["en", "hi", "hi-Latn"] as const;
export type Language = (typeof LANGUAGES)[number];

export const MAX_QUESTION = 200;
export const MAX_OPTION = 80;
export const MAX_EXPLANATION = 350;
// Devanagari text runs longer than the same sentence in English.
const SCALE: Record<Language, number> = { en: 1.0, hi: 1.5, "hi-Latn": 1.3 };

const CATCH_ALL = new RegExp(`${PY_B}(all|none|both|neither) of (the )?(above|these)${PY_B}`, "iu");
const DEVANAGARI_DIGITS: Record<string, string> = {
  "०": "0", "१": "1", "२": "2", "३": "3", "४": "4",
  "५": "5", "६": "6", "७": "7", "८": "8", "९": "9",
};
// Python's `\d` matches every Unicode decimal digit.
const DIGITS = /\p{Nd}+/gu;

export interface Variant {
  question: string;
  options: string[];
  explanation: string;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function textProblems(lang: Language, v: unknown): string[] {
  if (!isPlainObject(v)) return [`${lang}: not an object`];
  const scale = SCALE[lang];
  const problems: string[] = [];
  const { question, options, explanation } = v;
  if (!isNonEmptyString(question)) problems.push(`${lang}: empty question`);
  else if (pyLen(question) > MAX_QUESTION * scale) problems.push(`${lang}: question too long`);
  if (!isNonEmptyString(explanation)) problems.push(`${lang}: empty explanation`);
  else if (pyLen(explanation) > MAX_EXPLANATION * scale) problems.push(`${lang}: explanation too long`);
  if (!Array.isArray(options) || options.length !== 4 || !options.every((o) => isNonEmptyString(o))) {
    problems.push(`${lang}: needs 4 non-empty options`);
  } else {
    const opts = options as string[];
    if (new Set(opts.map((o) => pyStrip(o).toLowerCase())).size !== 4) {
      problems.push(`${lang}: options not unique`);
    }
    if (opts.some((o) => pyLen(o) > MAX_OPTION * scale)) problems.push(`${lang}: option too long`);
    if (opts.some((o) => CATCH_ALL.test(o))) problems.push(`${lang}: catch-all option`);
  }
  if (problems.length === 0) {
    const text = [question as string, explanation as string, ...(options as string[])].join(" ");
    if (hasUrl(text)) problems.push(`${lang}: contains a URL`);
  }
  return problems;
}

/** Problems with a question group's English side; empty when it's fine. */
export function validateEn(group: Record<string, unknown>): string[] {
  const problems: string[] = [];
  if (!(DIFFICULTIES as readonly unknown[]).includes(group.difficulty)) problems.push("bad difficulty");
  const index = group.correctIndex;
  if (!isPyInt(index) || index < 0 || index > 3) problems.push("correctIndex must be 0-3");
  problems.push(...textProblems("en", group.en));
  if (problems.length === 0) {
    const en = group.en as Variant;
    if (hasDevanagari([en.question, en.explanation, ...en.options].join(" "))) {
      problems.push("en: has Devanagari");
    }
  }
  return problems;
}

/** Problems with a `hi` or `hi-Latn` variant of the English `en`. */
export function validateVariant(lang: Language, variant: unknown, en: Variant): string[] {
  const problems = textProblems(lang, variant);
  if (problems.length) return problems;
  const v = variant as Variant;
  const text = `${v.question} ${v.explanation}`;
  if (lang === "hi" && !isMostlyDevanagari(text)) problems.push("hi: not mostly Devanagari");
  if (lang === "hi-Latn" && hasDevanagari(`${text} ${v.options.join(" ")}`)) {
    problems.push("hi-Latn: has Devanagari");
  }
  // Numbers survive translation, so a numeric option that changed its
  // numbers means the option order was probably changed.
  const count = Math.min(en.options.length, v.options.length);
  for (let i = 0; i < count; i++) {
    const original = en.options[i]!;
    const translated = v.options[i]!.replace(/[०-९]/g, (d) => DEVANAGARI_DIGITS[d] ?? d);
    const a = original.match(DIGITS) ?? [];
    const b = translated.match(DIGITS) ?? [];
    if (a.length !== b.length || a.some((x, k) => x !== b[k])) {
      problems.push(`${lang}: option numbers differ (${pyRepr(original)} vs ${pyRepr(v.options[i])})`);
      break;
    }
  }
  return problems;
}

/** Lowercase, NFKC, punctuation and spacing removed (Python `[\W_]+`). */
export function normalize(text: string): string {
  return casefold(text.normalize("NFKC")).replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Same hash for the same question and answer, whatever the punctuation,
 * case or spacing. */
export function dedupHash(question: string, answer: string): string {
  return createHash("sha1").update(`${normalize(question)}|${normalize(answer)}`, "utf8").digest("hex");
}
