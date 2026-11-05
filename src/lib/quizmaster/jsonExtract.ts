/**
 * Reads the JSON a model replied with, even when it is wrapped in a code
 * fence, preceded by a sentence, or follows a `<think>` block.
 * Port of quizmaster `automation/common/json_extract.py`: the first value
 * that parses, starting at each `[` or `{` in turn (Python's `raw_decode`).
 */
import "server-only";
import { pyRepr } from "./pyText";

const THINK = /<think>[\s\S]*?<\/think>/gi;

/** The end (exclusive) of the bracketed value starting at `start`, or -1. */
function balancedEnd(text: string, start: number): number {
  const stack: string[] = [];
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i]!;
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") stack.push("}");
    else if (c === "[") stack.push("]");
    else if (c === "}" || c === "]") {
      if (stack.pop() !== c) return -1;
      if (stack.length === 0) return i + 1;
    }
  }
  return -1;
}

export class JsonExtractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValueError";
  }
}

/** The first JSON object or array in `text`. Throws `JsonExtractError` if none. */
export function extractJson(input: string): unknown {
  const text = input.replace(THINK, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c !== "[" && c !== "{") continue;
    const end = balancedEnd(text, i);
    if (end < 0) continue;
    try {
      return JSON.parse(text.slice(i, end));
    } catch {
      continue;
    }
  }
  throw new JsonExtractError(`no JSON in model reply: ${pyRepr(text.slice(0, 200))}`);
}

/**
 * The list under `key` in a reply like `{"questions": [{...}, {...}]}`.
 *
 * A reply cut off by the token limit, or with one malformed item, doesn't parse
 * as a whole, and `extractJson` would then return its first item alone. Here
 * every complete item is kept instead (`salvaged`). Throws `JsonExtractError`
 * if the reply has no such list.
 */
export function extractList(input: string, key: string): { items: unknown[]; salvaged: boolean } {
  const text = input.replace(THINK, "");
  const opening = new RegExp(`"${key}"\\s*:\\s*\\[`).exec(text);
  if (!opening) {
    const whole = extractJson(text);
    if (Array.isArray(whole)) return { items: whole, salvaged: false };
    throw new JsonExtractError(`no "${key}" list in model reply: ${pyRepr(text.slice(0, 200))}`);
  }
  const listStart = opening.index + opening[0].length - 1;
  const listEnd = balancedEnd(text, listStart);
  if (listEnd >= 0) {
    try {
      const items: unknown = JSON.parse(text.slice(listStart, listEnd));
      if (Array.isArray(items)) return { items, salvaged: false };
    } catch {
      // A malformed item: keep the others, below.
    }
  }
  const items: unknown[] = [];
  let at = text.indexOf("{", listStart);
  while (at >= 0) {
    const end = balancedEnd(text, at);
    if (end < 0) break; // the item the reply was cut off in
    try {
      items.push(JSON.parse(text.slice(at, end)));
    } catch {
      // This item is malformed; the next may not be.
    }
    at = text.indexOf("{", end);
  }
  return { items, salvaged: true };
}
