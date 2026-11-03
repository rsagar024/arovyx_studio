/**
 * Run log lines: one line each, capped in length, with anything that looks
 * like a secret removed before it reaches the database or the page.
 */
import "server-only";

export const MAX_LINE = 1000;

const SECRET_ENV = ["NVIDIA_NIM_API_KEY", "QUIZMASTER_FIREBASE_SERVICE_ACCOUNT", "ADMIN_SECRET_KEY", "ADMIN_JWT_SECRET", "DATABASE_URL", "DIRECT_URL"];

const PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\bnvapi-[A-Za-z0-9_-]{8,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /"private_key(_id)?"\s*:\s*"[^"]*"/g,
  /\bpostgres(ql)?:\/\/[^\s"']+/gi,
  /\bAIza[0-9A-Za-z_-]{20,}/g,
];

export function redact(text: string): string {
  let out = text;
  for (const name of SECRET_ENV) {
    const value = process.env[name];
    if (value && value.length >= 8) out = out.split(value).join(`[${name}]`);
  }
  for (const re of PATTERNS) out = out.replace(re, "[redacted]");
  return out;
}

export function cleanLine(text: string): string {
  const line = redact(text).replace(/\s*\n\s*/g, " ⏎ ");
  return line.length > MAX_LINE ? `${line.slice(0, MAX_LINE - 1)}…` : line;
}

export type Level = "info" | "warn" | "error";

export function levelOf(line: string): Level {
  if (/^(warning|the push failed|the weekly push failed)|failed|could not|rejected/i.test(line)) return "warn";
  return "info";
}
