/**
 * The prompts, push templates and seed bank, copied verbatim from quizmaster
 * `automation/prompts` and `automation/seed/questions`. Read with `fs` from
 * `src/lib/quizmaster/assets`, which `next.config.mjs` adds to the traced
 * files of the Quiz Master API routes so they ship in the Vercel bundle.
 */
import "server-only";
import fs from "node:fs";
import path from "node:path";

export const ASSETS_DIR = path.join(process.cwd(), "src", "lib", "quizmaster", "assets");

const cache = new Map<string, unknown>();

function readText(rel: string): string {
  // Git may check text out with CRLF on Windows; the model sees LF as before.
  return fs.readFileSync(path.join(ASSETS_DIR, rel), "utf8").replace(/\r\n/g, "\n");
}

function cached<T>(key: string, load: () => T): T {
  if (!cache.has(key)) cache.set(key, load());
  return cache.get(key) as T;
}

export type PromptName =
  | "generate.md"
  | "verify.md"
  | "translate_hi.md"
  | "translate_hi_latn.md"
  | "notify.md";

export function prompt(name: PromptName): string {
  return cached(`prompt:${name}`, () => readText(path.join("prompts", name)));
}

export type Lang = "en" | "hi" | "hi-Latn";
export interface PushText {
  title: string;
  body: string;
}
export interface NotificationTemplates {
  categories: Record<string, Record<Lang, string>>;
  templates: Record<Lang, PushText[]>;
  new_questions: Record<Lang, PushText[]>;
}

export function notificationTemplates(): NotificationTemplates {
  return cached("templates", () => JSON.parse(readText("prompts/notification_templates.json")));
}

export function weeklyTemplates(): PushText[] {
  return cached("weekly", () => JSON.parse(readText("prompts/weekly_summary.json")).templates);
}

export type Group = Record<string, unknown> & {
  groupId: string;
  difficulty: string;
  correctIndex: number;
  en: { question: string; options: string[]; explanation: string };
  addedOn?: string;
  batch?: string;
};

/** Question groups by category, in the bank format (`seed_bank.load`). */
export function seedBank(): Record<string, Group[]> {
  return cached("seed", () => {
    const manifest = JSON.parse(readText("seed/questions/manifest.json")) as { files: string[] };
    const bank: Record<string, Group[]> = {};
    for (const file of manifest.files) {
      const data = JSON.parse(readText(path.join("seed", "questions", file))) as {
        category: string;
        questions: Group[];
      };
      bank[data.category] = data.questions;
    }
    return bank;
  });
}
