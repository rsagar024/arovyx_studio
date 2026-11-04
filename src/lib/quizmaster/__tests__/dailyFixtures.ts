/** Shared fixtures for the daily quiz tests (from test_daily_quiz.py). */
import type { Group } from "../assets";
import { categoryFor } from "../categories";
import { DailyJob, type DailyJobOptions } from "../dailyQuiz";
import * as ist from "../ist";
import * as qb from "../questionBank";
import { DryRunDocStore, MemoryDocStore } from "../writes";
import { HI_OPTIONS, OPTIONS } from "./fakeNim";

export const DATE = "2026-10-16";
export const CATEGORY = categoryFor(ist.dayNumber(ist.fromKey(DATE)));
export const MORNING = ist.atTime(ist.fromKey(DATE), 7);

export function group(groupId: string, difficulty: string, langs: string[] = ["en", "hi", "hi-Latn"]): Group {
  const variants: Record<string, unknown> = {
    en: { question: `Question ${groupId}?`, options: OPTIONS, explanation: "Because." },
    hi: { question: `सवाल ${groupId}?`, options: HI_OPTIONS, explanation: "क्योंकि।" },
    "hi-Latn": { question: `Sawaal ${groupId}?`, options: OPTIONS, explanation: "Kyunki." },
  };
  return {
    groupId,
    difficulty,
    subcategory: "trivia",
    tags: [],
    correctIndex: 1,
    ...Object.fromEntries(langs.map((l) => [l, variants[l]])),
  } as unknown as Group;
}

export function dayGroups(date: string, mix: [number, number, number] = [9, 8, 8], category: string = CATEGORY): Group[] {
  const compact = date.replace(/-/g, "");
  const groups: Group[] = [];
  let n = 0;
  (["easy", "medium", "hard"] as const).forEach((difficulty, i) => {
    for (let k = 0; k < mix[i]!; k++) {
      n += 1;
      groups.push(group(`${category}_${compact}_${String(n).padStart(2, "0")}`, difficulty));
    }
  });
  return groups;
}

export async function addDay(bank: qb.BankStore, date: string, groups: Group[], category: string = CATEGORY) {
  for (const g of groups) {
    g.addedOn = date;
    g.batch = "am";
  }
  await qb.appendBatch(bank, category, date, "am", groups);
}

export async function bankWithToday(mix?: [number, number, number]) {
  const bank = new qb.MemoryBankStore();
  await addDay(bank, DATE, dayGroups(DATE, mix));
  return bank;
}

export async function makeJob(
  o: { docs?: MemoryDocStore | DryRunDocStore; bank?: qb.BankStore; now?: Date } & Partial<DailyJobOptions> = {}
) {
  const now = o.now ?? MORNING;
  const logs: string[] = [];
  const docs = o.docs ?? new MemoryDocStore(() => now);
  const job = new DailyJob({ ...o, docs, bank: o.bank ?? (await bankWithToday()), now, log: (l) => logs.push(l) });
  return { job, docs, logs };
}

