/**
 * Script and content checks for generated text (questions, notifications).
 * Port of quizmaster `automation/common/text_checks.py`.
 */
import "server-only";
import { PY_B, PY_WORD } from "./pyText";

const DEVANAGARI = /[ऀ-ॿ]/u;
const DEVANAGARI_ALL = /[ऀ-ॿ]/gu;
const LATIN_ALL = /[A-Za-z]/g;
// Pictographs plus the older symbol and dingbat blocks (☀, ✨, ⚡ ...).
const EMOJI_ALL = /[\u{1F300}-\u{1FAFF}☀-➿]/gu;
const URL = new RegExp(
  `(https?://|www\\.|${PY_B}[${PY_WORD}-]+\\.(com|in|org|net|io|ly)${PY_B})`,
  "iu"
);

export function hasDevanagari(text: string): boolean {
  return DEVANAGARI.test(text);
}

/** True when most script characters are Devanagari. Brand names may stay in
 * Latin script, and digits and emoji don't count either way. */
export function isMostlyDevanagari(text: string, threshold = 0.6): boolean {
  const devanagari = (text.match(DEVANAGARI_ALL) ?? []).length;
  const latin = (text.match(LATIN_ALL) ?? []).length;
  return devanagari > 0 && devanagari / (devanagari + latin) >= threshold;
}

export function hasUrl(text: string): boolean {
  return URL.test(text);
}

export function emojiCount(text: string): number {
  return (text.match(EMOJI_ALL) ?? []).length;
}
