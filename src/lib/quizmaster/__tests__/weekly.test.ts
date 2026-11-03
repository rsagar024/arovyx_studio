/** Port of quizmaster `automation/tests/test_weekly_summary.py`. */
import { describe, expect, it } from "vitest";
import { weeklyTemplates } from "../assets";
import * as ist from "../ist";
import { pyLen } from "../pyText";
import { BODY_MAX, TITLE_MAX, recordPath, weeklyMessage, weeklySummary } from "../weekly";
import { applyInMemory, type Doc } from "../writes";
import { FakeMessenger } from "./fakeNim";

const MONDAY = "2026-10-19";
const LAST_WEEK = "2026-W42";
const NOW = new Date(Date.UTC(2026, 9, 19, 1, 30)); // 07:00 IST

function make(docs: Map<string, Doc>, played: string[] = [LAST_WEEK], dryRun = false) {
  const messenger = new FakeMessenger();
  const run = (date: string) =>
    weeklySummary(
      {
        messenger,
        read: async (p) => docs.get(p) ?? null,
        commit: async (w) => applyInMemory(docs, w, NOW),
        played: async (week) => played.includes(week),
        dryRun,
      },
      date
    );
  return { run, messenger };
}

describe("weekly summary", () => {
  it.each<[Date, string]>([
    [new Date(Date.UTC(2026, 9, 18, 18, 35)), "2026-W42"], // Monday 00:05 IST
    [new Date(Date.UTC(2026, 9, 18, 18, 25)), "2026-W41"], // Sunday 23:55 IST is still in W42
    [new Date(Date.UTC(2027, 0, 3, 18, 35)), "2026-W53"], // Monday 2027-01-04 IST
    [new Date(Date.UTC(2026, 0, 4, 18, 35)), "2026-W01"], // Monday 2026-01-05 IST
  ])("previous week in IST (%s)", (now, week) => {
    expect(ist.previousIsoWeekKey(now)).toBe(week);
  });

  it("a Monday run pushes last week once", async () => {
    const docs = new Map<string, Doc>();
    const { run, messenger } = make(docs);
    expect(await run(MONDAY)).toBe("sent");
    expect(messenger.sent.length).toBe(1);
    const msg = messenger.sent[0]!;
    expect(msg.topic).toBe("weekly_summary");
    expect(msg.data).toEqual({ type: "weekly_summary", week: LAST_WEEK, route: "/leaderboard" });
    expect(msg.tag).toBe(`weekly_${LAST_WEEK}`);
    expect(msg.ttl).toBe(24 * 3600);
    expect(msg.title + msg.body).toContain("42");
    const record = docs.get(recordPath(LAST_WEEK))!;
    expect(record.notifiedAt).toEqual(NOW);
    expect(record.messageId).toBe("projects/x/messages/1");

    const again = make(docs);
    expect(await again.run(MONDAY)).toBe("already_sent");
    expect(again.messenger.sent).toEqual([]);
  });

  it.each(["2026-10-18", "2026-10-20", "2026-10-24"])("other days send nothing (%s)", async (date) => {
    const docs = new Map<string, Doc>();
    const { run, messenger } = make(docs);
    expect(await run(date)).toBe("not_monday");
    expect(messenger.sent).toEqual([]);
    expect(docs.size).toBe(0);
  });

  it("a week nobody played sends nothing", async () => {
    const docs = new Map<string, Doc>();
    const { run, messenger } = make(docs, []);
    expect(await run(MONDAY)).toBe("empty");
    expect(messenger.sent).toEqual([]);
    expect(docs.size).toBe(0);
  });

  it("a dry run validates the push", async () => {
    const { run, messenger } = make(new Map(), [LAST_WEEK], true);
    expect(await run(MONDAY)).toBe("sent");
    expect(messenger.dryRuns).toEqual([true]);
  });

  it("every template fits", () => {
    const templates = weeklyTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(5);
    for (const number of [1, 9, 42, 53]) {
      for (let i = 0; i < templates.length; i++) {
        const rotated = [...templates.slice(i), ...templates.slice(0, i)];
        const msg = weeklyMessage(`2026-W${String(number).padStart(2, "0")}`, rotated);
        expect(pyLen(msg.title)).toBeLessThanOrEqual(TITLE_MAX);
        expect(pyLen(msg.body)).toBeLessThanOrEqual(BODY_MAX);
        expect(msg.title + msg.body).not.toContain("{");
        expect(msg.title + msg.body).not.toContain("http");
      }
    }
  });

  it("runs a day apart only push on Monday", async () => {
    const docs = new Map<string, Doc>();
    let day = ist.fromKey("2026-10-17");
    const results: string[] = [];
    for (let i = 0; i < 4; i++) {
      results.push(await make(docs).run(ist.dateKey(day)));
      day = new Date(day.getTime() + 86_400_000);
    }
    expect(results).toEqual(["not_monday", "not_monday", "sent", "not_monday"]);
  });
});
