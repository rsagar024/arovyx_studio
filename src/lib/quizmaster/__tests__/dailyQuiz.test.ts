/** Port of quizmaster `automation/tests/test_daily_quiz.py`. */
import { describe, expect, it } from "vitest";
import { seedBank } from "../assets";
import { FREE_CATEGORIES, categoryFor } from "../categories";
import { NotEnoughQuestions, questionDocs } from "../dailyQuiz";
import * as ist from "../ist";
import * as qb from "../questionBank";
import { DryRunDocStore, MemoryDocStore, type Doc } from "../writes";
import { HI_OPTIONS } from "./fakeNim";
import { CATEGORY, DATE, MORNING, addDay, bankWithToday, dayGroups, group, makeJob } from "./dailyFixtures";

const challenge = (docs: MemoryDocStore) => docs.docs.get(`daily_challenges/${DATE}`)!;

describe("daily quiz", () => {
  it("publishes ten of the day's new questions in the mix", async () => {
    const { job, docs } = await makeJob();
    const store = docs as MemoryDocStore;
    expect(await job.run(DATE)).toBe("published");
    expect(store.commits.length).toBe(1);
    expect(store.commits[0]!.length).toBe(1);
    const c = challenge(store);
    expect(c.category).toBe(CATEGORY);
    expect(c.source).toBe("ai");
    expect(c.difficulty).toBe("medium");
    const ids = c.groupIds as string[];
    expect(ids.length).toBe(10);
    expect(new Set(ids).size).toBe(10);
    expect(ids.every((g) => g.startsWith(`${CATEGORY}_20261016_`))).toBe(true);
    const byId = Object.fromEntries(dayGroups(DATE).map((g) => [g.groupId, g]));
    expect(ids.map((g) => byId[g]!.difficulty)).toEqual([...Array(4).fill("easy"), ...Array(3).fill("medium"), ...Array(3).fill("hard")]);
    expect(c.publishedAt).toEqual(MORNING);
    expect(c.activeFrom).toEqual(MORNING);
    expect(c.activeUntil).toEqual(ist.fromKey("2026-10-17"));
    // No question docs: the content lives in question_files now.
    expect([...store.docs.keys()]).toEqual([`daily_challenges/${DATE}`]);
  });

  it("the same date always picks the same questions", async () => {
    const first = await makeJob();
    const second = await makeJob();
    await first.job.run(DATE);
    await second.job.run(DATE);
    expect(challenge(first.docs as MemoryDocStore).groupIds).toEqual(challenge(second.docs as MemoryDocStore).groupIds);
  });

  it("an existing challenge only runs the notify step", async () => {
    const store = new MemoryDocStore();
    const picked = [{ ...dayGroups(DATE)[0]!, addedOn: DATE }];
    store.docs.set(`daily_challenges/${DATE}`, { category: CATEGORY, groupIds: [picked[0]!.groupId] });
    const notified: Array<[string, unknown]> = [];
    const { job } = await makeJob({ docs: store, notify: async (date, _c, docs) => void notified.push([date, docs]) });
    expect(await job.run(DATE)).toBe("exists");
    expect(store.commits).toEqual([]);
    expect(notified).toEqual([[DATE, questionDocs(picked.map((g) => ({ ...g, batch: "am" })), CATEGORY)]]);
  });

  it("no publishing after noon unless forced", async () => {
    const noon = ist.atTime(ist.fromKey(DATE), 12);
    const { job, docs } = await makeJob({ now: noon });
    expect(await job.run(DATE)).toBe("past_noon");
    expect((docs as MemoryDocStore).commits).toEqual([]);
    const forced = await makeJob({ now: noon, force: true });
    expect(await forced.job.run(DATE)).toBe("published");
    expect(challenge(forced.docs as MemoryDocStore).activeFrom).toEqual(noon);
  });

  it("a future date opens at its own midnight", async () => {
    const bank = new qb.MemoryBankStore();
    const category = categoryFor(ist.dayNumber(ist.fromKey("2026-10-17")));
    await addDay(bank, "2026-10-17", dayGroups("2026-10-17", undefined, category), category);
    const { job, docs } = await makeJob({ bank });
    await job.run("2026-10-17");
    expect((docs as MemoryDocStore).docs.get("daily_challenges/2026-10-17")!.activeFrom).toEqual(ist.fromKey("2026-10-17"));
  });

  it("gaps are filled from older unused questions, newest first", async () => {
    const bank = await bankWithToday([4, 3, 1]);
    await addDay(bank, "2026-10-01", [group("old_01", "hard"), group("old_02", "hard")]);
    await addDay(bank, "2026-09-12", [group("sep_01", "hard"), group("sep_02", "hard")]);
    const store = new MemoryDocStore(() => MORNING);
    store.docs.set("daily_challenges/2026-10-08", { category: CATEGORY, groupIds: ["old_01"] });
    const { job } = await makeJob({ docs: store, bank });
    expect(await job.run(DATE)).toBe("published");
    const c = challenge(store);
    const ids = c.groupIds as string[];
    expect(c.source).toBe("pool");
    expect(ids).not.toContain("old_01"); // already used by a challenge
    expect(ids[8]).toBe("old_02");
    expect(["sep_01", "sep_02"]).toContain(ids[9]);
  });

  it("nothing is published without ten unused questions", async () => {
    const { job, docs } = await makeJob({ bank: await bankWithToday([2, 2, 2]) });
    await expect(job.run(DATE)).rejects.toBeInstanceOf(NotEnoughQuestions);
    expect((docs as MemoryDocStore).commits).toEqual([]);
  });

  it("a dry run writes nothing", async () => {
    const store = new MemoryDocStore();
    const dry = new DryRunDocStore(store, () => {});
    const { job } = await makeJob({ docs: dry, bank: new qb.DryRunBankStore(await bankWithToday()) });
    expect(await job.run(DATE)).toBe("published");
    expect(store.commits).toEqual([]);
    expect(store.docs.size).toBe(0);
    expect(dry.writes.map(([op, path]) => [op, path])).toEqual([["create", `daily_challenges/${DATE}`]]);
  });

  it("question docs skip missing translations", () => {
    const docs = questionDocs([group("g1", "easy", ["en", "hi"])], CATEGORY);
    expect(docs.map((d) => d.language)).toEqual(["en", "hi"]);
    expect(docs[1]!.options).toEqual(HI_OPTIONS);
    expect(docs[1]!.correctIndex).toBe(1);
  });

  it("a racing run cannot overwrite the challenge", async () => {
    const store = new MemoryDocStore();
    store.docs.set(`daily_challenges/${DATE}`, { groupIds: ["a"] } as Doc);
    await expect(
      store.commit([
        { op: "create", path: "meta/x", data: { x: 1 } },
        { op: "create", path: `daily_challenges/${DATE}`, data: { groupIds: ["b"] } },
      ])
    ).rejects.toThrow();
    expect(store.docs.has("meta/x")).toBe(false);
  });

  it("the real seed bank loads", () => {
    const bank = seedBank();
    for (let d = 0; d < FREE_CATEGORIES.length; d++) expect(bank).toHaveProperty([categoryFor(d)]);
    expect(Object.values(bank).every((groups) => groups.length === 45)).toBe(true);
  });
});
