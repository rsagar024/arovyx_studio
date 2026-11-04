/**
 * `json.dumps(value, ensure_ascii=False)` as Python writes it: `", "` between
 * items and `": "` after keys (JSON.stringify adds no spaces). Used for the
 * packed question docs, whose md5 the app compares, and for the user
 * messages sent to the models, so both stay byte-identical to the Python jobs.
 * String escaping is the same in both languages for valid UTF-16 text.
 */
import "server-only";

export function pyDumps(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("NaN/Infinity is not JSON");
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return value.length ? `[${value.map(pyDumps).join(", ")}]` : "[]";
  }
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
    return entries.length
      ? `{${entries.map(([k, v]) => `${JSON.stringify(k)}: ${pyDumps(v)}`).join(", ")}}`
      : "{}";
  }
  throw new Error(`cannot serialise ${typeof value}`);
}
