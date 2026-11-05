/** Port of quizmaster `automation/tests/test_question_bank.py`. */
import zlib from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { seedBank, type Group } from "../assets";
import { ALL_CATEGORIES } from "../categories";
import { SendFailed, TOPICS } from "../dailyNotify";
import { GENERATION_ROUNDS, Generator, PER_DIFFICULTY, startState, type GenState } from "../generator";
import type { ChatMessage, ChatOptions } from "../nimClient";
import { notifyNewQuestions, recordPath } from "../notifyQuestions";
import { publish, seed } from "../publish";
import * as qb from "../questionBank";
import { applyInMemory, type Doc } from "../writes";
import { FakeMessenger, FakeNim, HI_OPTIONS, MODELS } from "./fakeNim";

const DATE = "2026-10-16"; // a Friday
const CATEGORY = "science";
const MONTH = qb.monthId(DATE, CATEGORY);
const WEEK = qb.weekId(DATE, CATEGORY);
const BASE = qb.baseId(CATEGORY);
const NOW = new Date(Date.UTC(2026, 9, 16, 2, 0));

function makeGenerator(nim: FakeNim, store: qb.BankStore = new qb.MemoryBankStore(), seedGroups: Record<string, Group[]> = {}) {
  const logs: string[] = [];
  const gen = new Generator({ store, nim, models: MODELS, seed: seedGroups, log: (l) => logs.push(l) });
  const run = (category: string, date: string, slot: string, force = false) =>
    gen.run(category, date, slot, { force, rngSeed: DATE });
  return { gen, run, logs, store };
}

/** The groups added on `date` (by the `slot` run, if given). */
async function day(store: qb.BankStore, date = DATE, category = CATEGORY, slot?: string) {
  return (await qb.loadCategory(store, category)).filter((g) => g.addedOn === date && (slot === undefined || g.batch === slot));
}

function group(groupId: string, difficulty = "easy", question?: string, addedOn?: string, batch = "am"): Group {
  const g: Group = {
    groupId,
    difficulty,
    correctIndex: 2,
    en: { question: question ?? `Question ${groupId}?`, options: ["A", "B", "C", "D"], explanation: "x" },
  };
  if (addedOn) {
    g.addedOn = addedOn;
    g.batch = batch;
  }
  return g;
}

const add = (store: qb.BankStore, date: string, groups: Group[], slot = "am", category = CATEGORY) =>
  qb.appendBatch(store, category, date, slot, groups);

afterEach(() => {
  qb.limits.MAX_BYTES = 900_000;
});

/* --- failover ------------------------------------------------------------ */

describe("failover and the verifier's family rule", () => {
  const MODELS_WITH_POOL = { generate: "gen/a", verify: "ver/a", translate: "tr/a", pool: ["gen/a", "ver/a", "other/a"] };

  /** Reports `writer` as the model that answered generate calls, like NimClient. */
  class Recording extends FakeNim {
    excluded: string[][] = [];
    constructor(private writer?: string) {
      super();
    }
    override async chat(messages: ChatMessage[], opts: ChatOptions) {
      if (opts.model === MODELS_WITH_POOL.generate && this.writer) opts.onAnswer?.(this.writer);
      if (opts.model === MODELS_WITH_POOL.verify) this.excluded.push(opts.excludeFamilies ?? []);
      return super.chat(messages, { ...opts, model: opts.model.split("/")[0]! }); // FakeNim's "gen", "ver", "tr"
    }
  }
  const stepsThroughVerify = async (nim: FakeNim, patch?: (s: GenState) => void) => {
    const gen = new Generator({ store: new qb.MemoryBankStore(), nim, models: MODELS_WITH_POOL, seed: {} });
    let s = startState(CATEGORY, DATE, "am", false, DATE);
    while (s.phase !== "verify") s = await gen.step(s);
    patch?.(s);
    const writers = s.genFamilies;
    s = await gen.step(s);
    return { writers, after: s };
  };

  it("the generator's own family is excluded from verifying", async () => {
    const nim = new Recording();
    const { writers } = await stepsThroughVerify(nim);
    expect(writers).toEqual(["gen"]);
    expect(nim.excluded[0]).toEqual(["gen"]);
  });

  it("after generation fails over, the model that really wrote them is the one excluded", async () => {
    const nim = new Recording("other/a");
    const { writers } = await stepsThroughVerify(nim);
    expect(writers).toEqual(["other"]);
    expect(nim.excluded[0]).toEqual(["other"]);
  });

  it("a run saved before failover (no genFamilies) excludes the configured generator", async () => {
    const nim = new Recording();
    await stepsThroughVerify(nim, (s) => delete s.genFamilies);
    expect(nim.excluded[0]).toEqual(["gen"]);
  });

  it("a new round starts its list of writers again", async () => {
    const nim = new Recording();
    const gen = new Generator({ store: new qb.MemoryBankStore(), nim, models: MODELS_WITH_POOL, seed: {} });
    nim.verifierWrong = () => true; // nothing survives, so another round is needed
    let s = startState(CATEGORY, DATE, "am", false, DATE);
    while (s.phase !== "verify") s = await gen.step(s);
    s.genFamilies = ["stale"];
    while (s.phase === "verify") s = await gen.step(s);
    expect(s.phase).toBe("generate");
    expect(s.genFamilies).toEqual([]);
  });
});

/* --- generate ------------------------------------------------------------ */

describe("generate", () => {
  it("week docs start on monday", () => {
    expect(qb.weekPeriod("2026-10-16")).toBe("2026-10-12");
    expect(qb.weekPeriod("2026-10-12")).toBe("2026-10-12");
    expect(qb.weekPeriod("2026-10-18")).toBe("2026-10-12"); // Sunday ends the week
    expect(qb.weekPeriod("2026-11-01")).toBe("2026-10-26"); // weeks cross months
    expect(WEEK).toBe("2026-10-12_science");
  });

  it("the slot follows the IST time", () => {
    const at = (h: number, m: number) => new Date(Date.UTC(2026, 9, 16, h, m));
    expect(qb.slotFor(at(1, 30))).toBe("am"); // 07:00 IST
    expect(qb.slotFor(at(9, 29))).toBe("am"); // 14:59 IST
    expect(qb.slotFor(at(9, 30))).toBe("pm"); // 15:00 IST
    expect(qb.slotFor(at(11, 30))).toBe("pm"); // 17:00 IST
  });

  it("a run adds 15 verified, translated questions per difficulty to the base doc", async () => {
    const { run, store } = makeGenerator(new FakeNim());
    expect(await run(CATEGORY, DATE, "am")).toBe("published");
    const doc = (await store.get(BASE))!;
    expect(doc.period).toBe("base");
    expect(doc.category).toBe(CATEGORY);
    expect((await store.listMeta()).map((d) => d.id)).toEqual([BASE]);
    const body = qb.decode(doc.data);
    const groups = body.questions;
    expect(body.period).toBe("base");
    expect(groups.length).toBe(3 * PER_DIFFICULTY);
    expect(doc.count).toBe(45);
    expect(doc.md5).toBe(qb.md5(doc.data));
    expect(groups.map((g) => g.groupId)).toEqual(
      Array.from({ length: 45 }, (_, i) => `science_20261016am_${String(i + 1).padStart(2, "0")}`)
    );
    for (const d of ["easy", "medium", "hard"]) expect(groups.filter((g) => g.difficulty === d).length).toBe(15);
    for (const g of groups) {
      expect(g.addedOn).toBe(DATE);
      expect(g.batch).toBe("am");
      for (const k of ["en", "hi", "hi-Latn", "correctIndex", "subcategory", "tags"]) expect(g).toHaveProperty([k]);
      expect((g.hi as { options: string[] }).options).toEqual(HI_OPTIONS);
    }
  });

  it("runs merge into the base doc after the seed", async () => {
    const nim = new FakeNim();
    const store = new qb.MemoryBankStore();
    const seedGroups = Array.from({ length: 45 }, (_, i) => group(`sc_${String(i + 1).padStart(3, "0")}`));
    await store.put(qb.makeDoc(BASE, CATEGORY, "base", seedGroups));
    await makeGenerator(nim, store).run(CATEGORY, DATE, "am");
    expect((await store.get(BASE))!.count).toBe(90);
    await makeGenerator(nim, store).run(CATEGORY, DATE, "pm");
    const groups = await qb.loadGroups(store, BASE);
    expect((await store.get(BASE))!.count).toBe(135);
    expect(groups.slice(0, 45)).toEqual(seedGroups); // the old questions stay first
    expect((await store.listMeta()).map((d) => d.id)).toEqual([BASE]);
  });

  it("the evening run adds 45 more next to the morning", async () => {
    const nim = new FakeNim();
    const store = new qb.MemoryBankStore();
    await makeGenerator(nim, store).run(CATEGORY, DATE, "am");
    expect(await makeGenerator(nim, store).run(CATEGORY, DATE, "pm")).toBe("published");
    const groups = await qb.loadGroups(store, BASE);
    expect(groups.length).toBe(90);
    expect((await store.get(BASE))!.count).toBe(90);
    expect((await day(store, DATE, CATEGORY, "am")).length).toBe(45);
    expect((await day(store, DATE, CATEGORY, "pm")).length).toBe(45);
    expect(new Set(groups.map((g) => g.groupId)).size).toBe(90); // ids are unique across the runs
    expect(new Set(groups.map((g) => g.en.question)).size).toBe(90); // the evening doesn't repeat the morning
  });

  it("slots are am, pm or a manual run's own batch", () => {
    expect(qb.isSlot("am") && qb.isSlot("pm")).toBe(true);
    expect(qb.isSlot("x18611234567")).toBe(true);
    for (const bad of ["", "auto", "extra", "x", "xab", "am1", "../x1"]) expect(qb.isSlot(bad), bad).toBe(false);
  });

  it("a manual run adds 45 more even after both scheduled runs", async () => {
    const nim = new FakeNim();
    const store = new qb.MemoryBankStore();
    await makeGenerator(nim, store).run(CATEGORY, DATE, "am");
    await makeGenerator(nim, store).run(CATEGORY, DATE, "pm");
    expect(await makeGenerator(nim, store).run(CATEGORY, DATE, "pm")).toBe("exists");
    expect(await makeGenerator(nim, store).run(CATEGORY, DATE, "x101")).toBe("published");
    const groups = await qb.loadGroups(store, BASE);
    expect(groups.length).toBe(135);
    expect((await day(store, DATE, CATEGORY, "x101")).length).toBe(45);
    expect(new Set(groups.map((g) => g.groupId)).size).toBe(135);
  });

  it("later weeks append to the same doc", async () => {
    const nim = new FakeNim();
    const store = new qb.MemoryBankStore();
    await makeGenerator(nim, store).run(CATEGORY, "2026-10-08", "pm");
    await makeGenerator(nim, store).run(CATEGORY, DATE, "am");
    expect((await store.get(BASE))!.count).toBe(90);
    expect(await store.get(WEEK)).toBeNull();
    expect(await store.get(MONTH)).toBeNull();
  });

  it("a full doc continues in part 2", async () => {
    const nim = new FakeNim();
    const store = new qb.MemoryBankStore();
    await makeGenerator(nim, store).run(CATEGORY, "2026-10-15", "am");
    qb.limits.MAX_BYTES = (await store.get(BASE))!.data.length + 100;
    await makeGenerator(nim, store).run(CATEGORY, DATE, "am");
    const part2 = qb.baseId(CATEGORY, 2);
    expect(part2).toBe("base_science_2");
    expect((await store.get(BASE))!.count).toBe(45);
    expect((await store.get(part2))!.count).toBe(45);
    expect((await store.get(part2))!.period).toBe("base"); // the app always downloads it
    expect((await qb.loadCategory(store, CATEGORY)).length).toBe(90);
    await makeGenerator(nim, store).run(CATEGORY, DATE, "am", true);
    expect((await store.get(BASE))!.count).toBe(45);
    expect((await store.get(part2))!.count).toBe(45); // a forced re-run replaces its own
  });

  it("a run already there is skipped unless forced", async () => {
    const nim = new FakeNim();
    const store = new qb.MemoryBankStore();
    await add(store, DATE, [group("x", "easy", undefined, DATE)], "am");
    await add(store, DATE, [group("z", "easy", undefined, DATE, "pm")], "pm");
    await add(store, "2026-10-15", [group("y", "easy", undefined, "2026-10-15")], "am");
    const g = makeGenerator(nim, store);
    expect(await g.run(CATEGORY, DATE, "am")).toBe("exists");
    expect(nim.calls).toEqual([]);
    expect(await g.run(CATEGORY, DATE, "am", true)).toBe("published");
    const ids = new Set((await qb.loadGroups(store, BASE)).map((x) => x.groupId));
    expect(ids.has("x")).toBe(false); // the forced run replaces its old groups
    expect(ids.has("y") && ids.has("z")).toBe(true); // other runs stay
  });

  it("a morning in an old month doc counts as the am run", async () => {
    const nim = new FakeNim();
    const store = new qb.MemoryBankStore();
    const legacy = group("science_20261016_01", "easy", undefined, DATE);
    delete legacy.batch;
    await store.put(qb.makeDoc(MONTH, CATEGORY, "2026-10", [legacy]));
    const g = makeGenerator(nim, store);
    expect(await g.run(CATEGORY, DATE, "am")).toBe("exists");
    expect(await g.run(CATEGORY, DATE, "pm")).toBe("published");
    expect((await qb.loadCategory(store, CATEGORY)).length).toBe(46); // the month doc is still read
  });

  it("duplicates of the seed and earlier days, and invalid ones, are dropped", async () => {
    const nim = new FakeNim();
    const store = new qb.MemoryBankStore();
    const earlier = group("science_20261015am_01", "easy", "What gas do plants breathe in?", "2026-10-15");
    await add(store, "2026-10-15", [earlier]);
    const seeded = group("sc_001", "easy", "Which planet is the Red Planet?");
    nim.extraItems = [
      { question: "WHICH planet is the red planet", options: ["A", "B", "C", "D"], correctIndex: 2, explanation: "A repeat of a seed question." },
      { question: "What gas do plants breathe in", options: ["A", "B", "C", "D"], correctIndex: 2, explanation: "A repeat of yesterday." },
      { question: "Only three options?", options: ["A", "B", "C"], correctIndex: 0, explanation: "Bad." },
    ];
    const g = makeGenerator(nim, store, { science: [seeded] });
    expect(await g.run(CATEGORY, DATE, "am")).toBe("published");
    const texts = (await day(store)).map((x) => x.en.question);
    expect(texts.some((t) => t.toLowerCase().includes("planet") || t.includes("plants") || t.includes("three options"))).toBe(false);
    expect(g.logs.filter((l) => l.includes("duplicate")).length).toBe(2);
    expect(g.logs.some((l) => l.includes("invalid"))).toBe(true);
  });

  it("questions the verifier answers differently are regenerated", async () => {
    const nim = new FakeNim();
    let tries = 0;
    // More hard ones fail than the first round's spares.
    nim.verifierWrong = (q) => {
      if (!q.startsWith("hard")) return false;
      tries += 1;
      return tries <= 8;
    };
    const g = makeGenerator(nim);
    await g.run(CATEGORY, DATE, "am");
    const groups = await day(g.store);
    expect(groups.filter((x) => x.difficulty === "hard").length).toBe(PER_DIFFICULTY);
    expect(g.logs.some((l) => l.startsWith("retry 1"))).toBe(true);
  });

  it("a short run still adds what survived", async () => {
    const nim = new FakeNim();
    nim.verifierWrong = (q) => !q.startsWith("easy");
    const g = makeGenerator(nim);
    expect(await g.run(CATEGORY, DATE, "am")).toBe("published");
    const groups = await day(g.store);
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.every((x) => x.difficulty === "easy")).toBe(true);
    expect(g.logs.some((l) => l.startsWith("warning: only"))).toBe(true);
  });

  it("nothing is written when nothing survives", async () => {
    const nim = new FakeNim();
    nim.verifierWrong = () => true;
    const g = makeGenerator(nim);
    expect(await g.run(CATEGORY, DATE, "am")).toBe("empty");
    expect(await g.store.get(BASE)).toBeNull();
    expect(nim.calls.filter((c) => c === "gen").length).toBe(3 * GENERATION_ROUNDS); // every round, per difficulty
  });

  it("a batch the verifier leaves empty is verified in halves", async () => {
    const nim = new FakeNim();
    nim.verifierEmpty = (size) => size > 6; // only short batches get answers
    const g = makeGenerator(nim);
    expect(await g.run(CATEGORY, DATE, "am")).toBe("published");
    expect((await day(g.store)).length).toBe(45);
    expect(g.logs.some((l) => l.includes("trying halves"))).toBe(true);
  });

  it("a verifier that never answers writes nothing, without crashing", async () => {
    const nim = new FakeNim();
    nim.verifierEmpty = () => true;
    const g = makeGenerator(nim);
    expect(await g.run(CATEGORY, DATE, "am")).toBe("empty");
    expect(await g.store.get(BASE)).toBeNull();
    expect(g.logs.some((l) => l.includes("verifier gave no answer"))).toBe(true);
  });

  it("a translation that fails twice is left out", async () => {
    const nim = new FakeNim();
    nim.badTranslations["hi-Latn"] = 99;
    const g = makeGenerator(nim);
    await g.run(CATEGORY, DATE, "am");
    for (const x of await day(g.store)) {
      expect("hi" in x).toBe(true);
      expect("hi-Latn" in x).toBe(false);
    }
  });

  it("a dry run writes nothing", async () => {
    const inner = new qb.MemoryBankStore();
    const g = makeGenerator(new FakeNim(), new qb.DryRunBankStore(inner));
    expect(await g.run(CATEGORY, DATE, "am")).toBe("published");
    expect(inner.docs.size).toBe(0);
    expect((await day(g.store)).length).toBeGreaterThan(0); // the dry run still reads its own pretend writes
  });

  it("a doc over the size limit is refused", () => {
    qb.limits.MAX_BYTES = 100;
    expect(() => qb.makeDoc(WEEK, CATEGORY, "2026-10-12", Array.from({ length: 20 }, (_, i) => group(`g${i}`)))).toThrow(
      /over the 100 limit/
    );
  });

  it("the same groups always encode to the same bytes", () => {
    const groups = [group("a"), group("b")];
    expect(qb.encode(CATEGORY, "base", groups).equals(qb.encode(CATEGORY, "base", groups))).toBe(true);
    expect(zlib.gunzipSync(qb.encode(CATEGORY, "base", groups)).length).toBeGreaterThan(0);
  });
});

/* --- publish ------------------------------------------------------------- */

describe("publish", () => {
  it("writes the manifest to meta/questions", async () => {
    const store = new qb.MemoryBankStore();
    await store.put(qb.makeDoc("base_science", "science", "base", [group("sc_001"), group("sc_002")]));
    await add(store, DATE, [group("science_20261016am_01", "easy", undefined, DATE)], "am", "science");
    await add(store, DATE, [group("cricket_20261016am_01", "easy", undefined, DATE)], "am", "cricket");
    const docs = new Map<string, Doc>();
    const published = await publish({ store, commit: async (w) => applyInMemory(docs, w, NOW), now: NOW });
    expect(published.version).toBe(Math.floor(NOW.getTime() / 1000));
    expect(docs.get(qb.META)).toEqual({ ...published, updatedAt: NOW });
    const files = Object.fromEntries(published.files.map((f) => [f.id, f]));
    expect(new Set(Object.keys(files))).toEqual(new Set(["base_cricket", "base_science"]));
    expect(files.base_science).toEqual({
      id: "base_science",
      category: "science",
      period: "base",
      count: 3,
      md5: (await store.get("base_science"))!.md5,
    });
    expect(published.counts).toEqual({ science: 3, cricket: 1 });
  });

  it("folds old date-wise docs into base", async () => {
    const store = new qb.MemoryBankStore();
    await store.put(qb.makeDoc(BASE, CATEGORY, "base", [group("sc_001")]));
    await store.put(qb.makeDoc(MONTH, CATEGORY, "2026-10", [group("science_20261001_01", "easy", undefined, "2026-10-01")]));
    await store.put(
      qb.makeDoc(WEEK, CATEGORY, "2026-10-12", [
        group("science_20261016am_01", "easy", undefined, DATE),
        group("sc_001"), // already in base: not copied twice
      ])
    );
    await store.put(qb.makeDoc("2026-10-19_cricket", "cricket", "2026-10-19", [group("cricket_x", "easy", undefined, "2026-10-19")]));
    const published = await publish({ store, commit: async () => {}, now: NOW });
    expect(published.files.map((f) => f.id)).toEqual(["base_cricket", BASE]);
    expect((await qb.loadGroups(store, BASE)).map((g) => g.groupId)).toEqual([
      "sc_001",
      "science_20261001_01",
      "science_20261016am_01",
    ]); // oldest first, after base
    expect(published.counts).toEqual({ science: 3, cricket: 1 });
    expect(await qb.hasBatch(store, CATEGORY, DATE, "am")).toBe(true); // a folded run still counts as done
  });

  it("a dry-run publish deletes nothing", async () => {
    const inner = new qb.MemoryBankStore();
    await inner.put(qb.makeDoc(WEEK, CATEGORY, "2026-10-12", [group("science_20261016am_01", "easy", undefined, DATE)]));
    const store = new qb.DryRunBankStore(inner);
    await publish({ store, commit: async () => {}, now: NOW });
    expect([...inner.docs.keys()]).toEqual([WEEK]);
    expect((await store.listMeta()).map((d) => d.id)).toEqual([BASE]); // the dry run sees its pretend changes
  });

  it("has_batch sees an old week doc", async () => {
    const store = new qb.MemoryBankStore();
    await store.put(qb.makeDoc(WEEK, CATEGORY, "2026-10-12", [group("science_20261016am_01", "easy", undefined, DATE)]));
    expect(await qb.hasBatch(store, CATEGORY, DATE, "am")).toBe(true);
    expect(await qb.hasBatch(store, CATEGORY, DATE, "pm")).toBe(false);
  });
});

/* --- seed and the answer key ---------------------------------------------- */

describe("seed", () => {
  it("writes every category of the seed bank", async () => {
    const store = new qb.MemoryBankStore();
    await seed(store, seedBank());
    const bank = seedBank();
    expect(new Set(Object.keys(bank))).toEqual(new Set(ALL_CATEGORIES));
    for (const [category, groups] of Object.entries(bank)) {
      const doc = (await store.get(qb.baseId(category)))!;
      expect(doc.period).toBe("base");
      expect(doc.count).toBe(groups.length);
      expect(qb.decode(doc.data).questions).toEqual(groups);
      expect(doc.data.length).toBeLessThan(50_000); // 45 groups in 3 languages pack small
    }
  });

  it("keeps the generated questions", async () => {
    const store = new qb.MemoryBankStore();
    await seed(store, seedBank());
    await makeGenerator(new FakeNim(), store).run(CATEGORY, DATE, "am");
    await seed(store, seedBank());
    const groups = await qb.loadGroups(store, BASE);
    expect(groups.slice(0, 45)).toEqual(seedBank()[CATEGORY]);
    expect(groups.length).toBe(90);
    expect((await day(store)).length).toBe(45);
  });
});

/* --- the "new questions" push ----------------------------------------------- */

const EVENING = new Date(Date.UTC(2026, 9, 16, 11, 30)); // 17:00 IST

function notifier(store: qb.BankStore, messenger: FakeMessenger, docs: Map<string, Doc>) {
  return (date: string, slot: string) =>
    notifyNewQuestions(
      {
        bank: store,
        messenger,
        read: async (p) => docs.get(p) ?? null,
        commit: async (w) => applyInMemory(docs, w, EVENING),
        now: EVENING,
      },
      date,
      slot
    );
}

async function eveningBank() {
  const store = new qb.MemoryBankStore();
  await add(store, DATE, [group("science_20261016pm_01", "easy", undefined, DATE, "pm")], "pm");
  return store;
}

async function morningBank() {
  const store = new qb.MemoryBankStore();
  await add(store, DATE, [group("science_20261016am_01", "easy", undefined, DATE)], "am");
  return store;
}

describe("new questions push", () => {
  it("the evening push goes to every language topic once", async () => {
    const store = await eveningBank();
    const messenger = new FakeMessenger(new Set(), "id-");
    const docs = new Map<string, Doc>();
    expect(await notifier(store, messenger, docs)(DATE, "pm")).toBe("sent");
    expect(messenger.sent.map((m) => m.topic)).toEqual(Object.values(TOPICS));
    for (const m of messenger.sent) {
      expect(m.data).toEqual({ type: "new_questions", date: DATE, slot: "pm" });
      expect(m.title && m.body).toBeTruthy();
      expect(m.tag).toBe(`new_questions_${DATE}`);
      expect(m.ttl > 0 && m.ttl <= 7 * 3600).toBe(true); // expires at midnight IST
    }
    const record = docs.get(recordPath(DATE, "pm"))!;
    expect(record.categories).toEqual(["science"]);
    expect(record.notifiedAt).toEqual(EVENING);
    expect(await notifier(store, messenger, docs)(DATE, "pm")).toBe("already_sent");
    expect(messenger.sent.length).toBe(3);
  });

  it("a morning run sends the push too", async () => {
    const messenger = new FakeMessenger();
    expect(await notifier(await morningBank(), messenger, new Map())(DATE, "am")).toBe("sent");
    expect(messenger.sent.length).toBe(3);
  });

  it("no second push right after the daily quiz push", async () => {
    const docs = new Map<string, Doc>([[`daily_challenges/${DATE}`, { notifiedAt: new Date(EVENING.getTime() - 10 * 60_000) }]]);
    const messenger = new FakeMessenger();
    expect(await notifier(await morningBank(), messenger, docs)(DATE, "am")).toBe("covered_by_daily_quiz");
    expect(messenger.sent).toEqual([]);
  });

  it("a later morning run pushes although the daily quiz went out hours ago", async () => {
    const docs = new Map<string, Doc>([[`daily_challenges/${DATE}`, { notifiedAt: new Date(EVENING.getTime() - 5 * 3600_000) }]]);
    const messenger = new FakeMessenger();
    expect(await notifier(await morningBank(), messenger, docs)(DATE, "am")).toBe("sent");
    expect(messenger.sent.length).toBe(3);
  });

  it("no push when the run added nothing", async () => {
    const messenger = new FakeMessenger();
    expect(await notifier(await morningBank(), messenger, new Map())(DATE, "pm")).toBe("nothing_new");
    expect(messenger.sent).toEqual([]);
  });

  it("a failed topic is retried without resending the others", async () => {
    const store = await eveningBank();
    const docs = new Map<string, Doc>();
    await expect(notifier(store, new FakeMessenger(new Set([TOPICS.hi])), docs)(DATE, "pm")).rejects.toBeInstanceOf(SendFailed);
    expect("notifiedAt" in docs.get(recordPath(DATE, "pm"))!).toBe(false);
    const retry = new FakeMessenger();
    expect(await notifier(store, retry, docs)(DATE, "pm")).toBe("sent");
    expect(retry.sent.map((m) => m.topic)).toEqual([TOPICS.hi]);
  });

  it("a manual run sends its own push after the evening one", async () => {
    const store = await eveningBank();
    const messenger = new FakeMessenger();
    const docs = new Map<string, Doc>();
    await notifier(store, messenger, docs)(DATE, "pm");
    await add(store, DATE, [group("science_20261016x101_01", "easy", undefined, DATE, "x101")], "x101");
    expect(await notifier(store, messenger, docs)(DATE, "x101")).toBe("sent");
    expect(messenger.sent.length).toBe(6);
    expect(docs.get(recordPath(DATE, "x101"))!.notifiedAt).toEqual(EVENING);
  });

  it("a manual run that just sent the daily quiz push sends no second one", async () => {
    const store = new qb.MemoryBankStore();
    await add(store, DATE, [group("science_20261016x101_01", "easy", undefined, DATE, "x101")], "x101");
    const docs = new Map<string, Doc>([[`daily_challenges/${DATE}`, { notifiedAt: new Date(EVENING.getTime() - 10 * 60_000) }]]);
    const messenger = new FakeMessenger();
    expect(await notifier(store, messenger, docs)(DATE, "x101")).toBe("covered_by_daily_quiz");
    expect(messenger.sent).toEqual([]);
  });
});
