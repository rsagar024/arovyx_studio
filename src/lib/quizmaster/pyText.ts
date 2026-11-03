/**
 * Small emulations of Python `str`/`re` behaviour the ported checks rely on.
 *
 * - Python's Unicode `\w` is "alphanumeric or underscore", where
 *   alphanumeric means Unicode letters (L*) and numbers (N*). Combining marks
 *   (e.g. Devanagari vowel signs) are NOT `\w`. JavaScript's `\w` is ASCII.
 * - Python's `\b` is the boundary between `\w` and non-`\w` characters.
 * - `len()` counts code points, not UTF-16 units.
 * - `str.casefold()` folds more than `toLowerCase()` (ß → ss, ς → σ, ﬁ → fi).
 */
import "server-only";

/** Python's Unicode `\w`, as a character-class body. */
export const PY_WORD = "\\p{L}\\p{N}_";
/** Python's `\b`, for regexes built with the `u` flag. */
export const PY_B = `(?:(?<=[${PY_WORD}])(?![${PY_WORD}])|(?<![${PY_WORD}])(?=[${PY_WORD}]))`;

/** Python `len(text)`: code points. */
export function pyLen(text: string): number {
  let n = 0;
  for (const _ of text) n++;
  return n;
}

/** Python `str.casefold()`, close enough for quiz text. */
export function casefold(text: string): string {
  return text.toUpperCase().toLowerCase().replace(/ς/g, "σ");
}

/** Python `str.strip()` (whitespace only). */
export function pyStrip(text: string): string {
  return text.replace(/^[\s\x1c-\x1f\x85]+|[\s\x1c-\x1f\x85]+$/gu, "");
}

/** `re.escape`, for building a JavaScript regex from literal text. */
export function escapeRegex(text: string): string {
  // Only syntax characters: other escapes are errors under the `u` flag.
  return text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

/** Python `isinstance(x, int) and not isinstance(x, bool)` on parsed JSON. */
export function isPyInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && pyStrip(value).length > 0;
}

/** Python `repr()` of a string, for log lines that quote it the same way. */
export function pyRepr(value: unknown): string {
  if (typeof value !== "string") return value === null || value === undefined ? "None" : String(value);
  const quote = value.includes("'") && !value.includes('"') ? '"' : "'";
  const body = value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
  return quote + (quote === "'" ? body.replace(/'/g, "\\'") : body) + quote;
}
