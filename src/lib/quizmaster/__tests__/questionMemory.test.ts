import { describe, expect, it } from "vitest";
import type { Group } from "../assets";
import { Generator, startState, type GenState } from "../generator";
import { extractList, JsonExtractError } from "../jsonExtract";
import type { ChatMessage, ChatOptions, Models } from "../nimClient";
import { Pipeline } from "../pipeline";
import { PyRandom } from "../pyRandom";
import * as qb from "../questionBank";
import { avoidFor, buildMemory, FactIndex, MAX_AVOID_CHARS, pickTopics, topicCoverage } from "../questionMemory";
import { TOPICS } from "../topics";
import { ALL_CATEGORIES } from "../categories";
import { stepModels } from "../service";
import { FakeNim, MODELS } from "./fakeNim";

const DATE = "2026-10-16";
const CATEGORY = "science";

function group(question: string, difficulty = "easy", answer = "C", subcategory = "misc"): Group {
  return {
    groupId: question,
    difficulty,
    subcategory,
    correctIndex: 2,
    en: { question, options: ["A", "B", answer, "D"], explanation: "x" },
  };
}

const many = (n: number, difficulty: string, prefix: string) =>
  Array.from({ length: n }, (_, i) => group(`${prefix} ${i} is the question here?`, difficulty));

/** A FakeNim that records every generate request and says which model answered. */
class RecordingNim extends FakeNim {
  requests: Array<{ difficulty: string; avoid: string[]; overused_topics?: unknown; overused_patterns?: unknown }> = [];
  override async chat(messages: ChatMessage[], opts: ChatOptions) {
    if (opts.model === "gen") this.requests.push(JSON.parse(messages[messages.length - 1]!.content));
    opts.onAnswer?.(opts.model);
    return super.chat(messages, opts);
  }
}

describe("buildMemory", () => {
  it("puts the asked difficulty first", () => {
    const m = buildMemory([...many(5, "hard", "hard one"), ...many(5, "easy", "easy one")], "r");
    expect(m.known).toBe(10);
    expect(m.avoid.easy.slice(0, 5).every((q) => q.startsWith("easy"))).toBe(true);
    expect(m.avoid.hard.slice(0, 5).every((q) => q.startsWith("hard"))).toBe(true);
    expect(m.avoid.easy).toHaveLength(10);
  });

  it("stays within the budget and counts each question once", () => {
    const groups = many(100, "easy", "easy one");
    const m = buildMemory([...groups, ...groups], "r", 500);
    expect(m.known).toBe(100);
    expect(m.avoid.easy.join("").length).toBeLessThanOrEqual(500);
    expect(m.avoid.easy.length).toBeLessThan(100);
  });

  it("gives old questions a turn when the bank outgrows the budget", () => {
    const groups = many(200, "easy", "easy one");
    const reached = new Set<string>();
    for (let run = 0; run < 40; run++) {
      for (const q of buildMemory(groups, `run ${run}`, 1000).avoid.easy) reached.add(q);
    }
    expect(reached.has(groups[0]!.en.question)).toBe(true);
    expect(reached.size).toBeGreaterThan(190);
    expect(buildMemory(groups, "same", 1000).avoid.easy).toEqual(buildMemory(groups, "same", 1000).avoid.easy);
  });

  it("names the overused topics and openings, not the empty ones", () => {
    const groups = [
      ...Array.from({ length: 6 }, (_, i) => group(`Which district of state ${i} contains park ${i}?`, "easy", "C", "parks")),
      ...Array.from({ length: 6 }, (_, i) => group(`What is the thing ${i}?`, "easy", "C", "things")),
      group("Which lone planet is odd?", "easy", "C", "rare"),
    ];
    const m = buildMemory(groups, "r");
    expect(m.overusedTopics).toEqual({ parks: 6, things: 6 });
    expect(m.overusedPatterns).toEqual({ "which district of": 6 });
  });
});

describe("avoidFor", () => {
  it("puts this run's questions first and doesn't repeat any", () => {
    const m = buildMemory(many(3, "easy", "bank"), "r");
    const out = avoidFor(m, "easy", ["old from run?", "new from run?", m.avoid.easy[0]!]);
    expect(out[0]).toBe(m.avoid.easy[0]);
    expect(out[1]).toBe("new from run?");
    expect(out[2]).toBe("old from run?");
    expect(out).toHaveLength(5);
  });

  it("keeps this run's questions when the budget is tight", () => {
    const m = buildMemory(many(50, "easy", "bank"), "r");
    const out = avoidFor(m, "easy", ["from this run?"], [], 40);
    expect(out[0]).toBe("from this run?");
    expect(out.join("").length).toBeLessThanOrEqual(40);
  });

  it("puts known questions on the call's topics ahead of the rest", () => {
    const m = buildMemory(
      [...many(20, "easy", "Unrelated planet"), group("Which river flows through Cairo in Africa?"), group("Which river is longest?")],
      "r"
    );
    const out = avoidFor(m, "easy", ["from this run?"], ["rivers of Africa"]);
    expect(out[0]).toBe("from this run?");
    expect(out.slice(1, 3).sort()).toEqual(["Which river flows through Cairo in Africa?", "Which river is longest?"]);
  });

  it("stays within what one call may send by default", () => {
    const m = buildMemory(many(600, "easy", "A rather long question about something"), "r");
    expect(avoidFor(m, "easy", []).join("").length).toBeLessThanOrEqual(MAX_AVOID_CHARS);
  });
});

describe("focus topics", () => {
  it("every category has plenty of different topics", () => {
    for (const c of ALL_CATEGORIES) {
      expect(new Set(TOPICS[c]).size, c).toBeGreaterThanOrEqual(25);
    }
  });

  it("counts the questions that mention a topic", () => {
    const coverage = topicCoverage(
      ["rivers of Africa", "volcanoes"],
      [group("Which river is longest?"), group("Which African river is it?"), group("Which volcano erupted?"), group("What is gold?")]
    );
    expect(coverage).toEqual({ "rivers of Africa": 2, volcanoes: 1 });
  });

  it("picks the least covered first and doesn't reuse a topic until all are used", () => {
    const coverage = { a: 9, b: 1, c: 5, d: 0 };
    expect(pickTopics(coverage, [], "r", 2)).toEqual(["d", "b"]);
    expect(pickTopics(coverage, ["d", "b"], "r", 2)).toEqual(["c", "a"]);
    expect(pickTopics(coverage, ["d", "b", "c"], "r", 2)).toEqual(["a", "d"]);
    expect(pickTopics({}, [], "r")).toEqual([]);
  });

  it("settles ties differently from run to run", () => {
    const coverage = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`topic ${i}`, 0]));
    const picks = new Set(Array.from({ length: 10 }, (_, i) => pickTopics(coverage, [], `run ${i}`).join()));
    expect(picks.size).toBeGreaterThan(1);
  });

  it("each call asks about different topics, and the state stays clean afterwards", async () => {
    const nim = new RecordingNim();
    const gen = new Generator({ store: new qb.MemoryBankStore(), nim, models: MODELS, seed: {} });
    let s = startState(CATEGORY, DATE, "am", false, DATE);
    while (s.phase !== "translate" && s.phase !== "done") s = await gen.step(s);
    const asked = nim.requests.map((r) => (r as unknown as { focus_topics: string[] }).focus_topics);
    expect(asked[0]).toHaveLength(3);
    expect(new Set(asked.flat()).size).toBe(asked.flat().length);
    expect(s.topicCounts).toBeUndefined();
    expect(s.usedTopics).toBeUndefined();
  });
});

describe("FactIndex", () => {
  const facts = new FactIndex();
  facts.add("Which state is known as the Land of Five Rivers?", "Punjab");

  it("spots the same fact reworded", () => {
    expect(facts.matches("Which Indian state is known as the Land of Five Rivers?", "punjab")).toBe(true);
    expect(facts.matches("The Land of Five Rivers is which state?", "Punjab")).toBe(true);
  });

  it("keeps a different question with the same answer", () => {
    expect(facts.matches("Which state has Amritsar as its largest city?", "Punjab")).toBe(false);
  });

  it("keeps the same words with a different answer", () => {
    expect(facts.matches("Which state is known as the Land of Five Rivers?", "Haryana")).toBe(false);
  });

  it("is used by the pipeline's duplicate check", () => {
    const logs: string[] = [];
    const pipeline = new Pipeline(new FakeNim(), MODELS, new PyRandom("x"), (l) => logs.push(l));
    const index = new FactIndex();
    index.add("Which river forms the Hogenakkal Falls in Tamil Nadu?", "Kaveri");
    const kept = pipeline.dedupe(
      [
        group("Which river forms the Hogenakkal Falls?", "easy", "Kaveri"),
        group("Which river forms the Shivanasamudra Falls in Karnataka?", "easy", "Kaveri"),
      ],
      new Set(),
      index
    );
    expect(kept.map((g) => g.en.question)).toEqual(["Which river forms the Shivanasamudra Falls in Karnataka?"]);
    expect(logs).toEqual(["dropped (reworded duplicate): 'Which river forms the Hogenakkal Falls?'"]);
  });
});

describe("what the writer is told", () => {
  const stepToEnd = async (gen: Generator, start: GenState) => {
    let s = start;
    while (s.phase !== "done") s = await gen.step(s);
    return s;
  };

  it("draws on the whole bank and the seed, not just the newest 100", async () => {
    const store = new qb.MemoryBankStore();
    const bank = many(200, "easy", "bank easy");
    await qb.appendBatch(store, CATEGORY, "2026-10-01", "am", bank);
    const nim = new RecordingNim();
    const gen = new Generator({ store, nim, models: MODELS, seed: { [CATEGORY]: [group("A seed question here?")] } });
    await gen.run(CATEGORY, DATE, "am");
    const first = nim.requests[0]!;
    expect(first.difficulty).toBe("easy");
    expect(first.avoid).toHaveLength(201);
    expect(first.avoid).toContain(bank[0]!.en.question);
    expect(first.avoid).toContain("A seed question here?");
    expect(first).toHaveProperty("focus_topics");
    expect(first).toHaveProperty("overused_topics");
    expect(first).toHaveProperty("overused_patterns");
  });

  it("tells later difficulties and retries what this run already offered", async () => {
    const nim = new RecordingNim();
    const store = new qb.MemoryBankStore();
    await qb.appendBatch(store, CATEGORY, "2026-10-01", "am", [group("The repeated question here?")]);
    const failed = "A question rejected by the verifier?";
    const reworded = "The repeated question here today?";
    nim.extraItems = [
      { question: failed, options: ["A", "B", "C", "D"], correctIndex: 2, explanation: "x" },
      { question: reworded, options: ["A", "B", "C", "D"], correctIndex: 2, explanation: "x" },
    ];
    // More easy ones fail than the first round's spares, which forces a retry.
    let tries = 0;
    nim.verifierWrong = (q) => q === failed || (q.startsWith("easy") && tries++ < 10);
    const gen = new Generator({ store, nim, models: MODELS, seed: {} });
    await gen.run(CATEGORY, DATE, "am");
    expect(nim.requests[1]!.difficulty).toBe("medium");
    expect(nim.requests[1]!.avoid).toContain(failed);
    expect(nim.requests[1]!.avoid).toContain(reworded);
    const retry = nim.requests[3]!;
    expect(retry.difficulty).toBe("easy");
    expect(retry.avoid).toContain(failed);
    expect(retry.avoid).toContain(reworded);
    const stored = (await qb.loadCategory(store, CATEGORY)).map((g) => g.en.question);
    expect(stored).not.toContain(reworded);
  });

  it("drops the memory when generating is over", async () => {
    const gen = new Generator({ store: new qb.MemoryBankStore(), nim: new FakeNim(), models: MODELS, seed: {} });
    let s = startState(CATEGORY, DATE, "am", false, DATE);
    s = await gen.step(s);
    expect(s.memory).toBeDefined();
    while (s.phase !== "translate" && s.phase !== "done") s = await gen.step(s);
    expect(s.memory).toBeUndefined();
    expect(s.runKnown).toBeUndefined();
  });

  it("finishes a run saved before the memory existed", async () => {
    const nim = new RecordingNim();
    const store = new qb.MemoryBankStore();
    const gen = new Generator({ store, nim, models: MODELS, seed: {} });
    const old = await gen.step(startState(CATEGORY, DATE, "am", false, DATE));
    delete old.memory;
    delete old.runKnown;
    old.avoid = ["An old saved question?"];
    const end = await stepToEnd(gen, old);
    expect(end.status).toBe("published");
    expect(nim.requests[0]!.avoid).toEqual(["An old saved question?"]);
    expect(nim.requests[0]).not.toHaveProperty("overused_topics");
  });
});

describe("which model answered", () => {
  it("each unit reports its own models, even when units overlap", async () => {
    const nim = new RecordingNim();
    const store = new qb.MemoryBankStore();
    const gen = new Generator({ store, nim, models: MODELS, seed: {} });
    const prepared = await gen.step(startState(CATEGORY, DATE, "am", false, DATE));
    const [a, b] = await Promise.all([gen.step(prepared), gen.step(prepared)]);
    expect(prepared.unitModels).toEqual([]);
    expect(a!.unitModels).toEqual(["gen"]);
    expect(b!.unitModels).toEqual(["gen"]);
    let s = a!;
    while (s.phase !== "verify") s = await gen.step(s);
    s = await gen.step(s);
    expect(s.unitModels).toEqual(["ver"]);
  });

  it("reads the models from a step's saved state", () => {
    expect(stepModels(JSON.stringify({ models: ["a/b", 3] }))).toEqual(["a/b"]);
    expect(stepModels("{}")).toEqual([]);
    expect(stepModels("null")).toEqual([]);
    expect(stepModels("not json")).toEqual([]);
  });
});

describe("replies that don't parse as a whole", () => {
  const item = (n: number) => ({
    question: `Which thing is number ${n}?`,
    options: ["A", "B", "C", "D"],
    correctIndex: n % 4,
    explanation: "Because.",
    subcategory: "misc",
    tags: ["x"],
  });
  const list = (n: number) => Array.from({ length: n }, (_, i) => item(i + 1));

  it("reads a whole reply, fenced or not", () => {
    expect(extractList(`Here:\n\`\`\`json\n${JSON.stringify({ questions: list(3) })}\n\`\`\``, "questions")).toEqual({
      items: list(3),
      salvaged: false,
    });
  });

  it("keeps every complete question from a reply cut off mid-question", () => {
    const whole = JSON.stringify({ questions: list(5) });
    const cut = whole.slice(0, whole.lastIndexOf("explanation"));
    const out = extractList(cut, "questions");
    expect(out.salvaged).toBe(true);
    expect(out.items).toEqual(list(4));
  });

  it("skips a malformed question and keeps the rest", () => {
    const broken = `{"questions": [${JSON.stringify(item(1))}, {"question": oops}, ${JSON.stringify(item(3))}]}`;
    const out = extractList(broken, "questions");
    expect(out.salvaged).toBe(true);
    expect(out.items).toEqual([item(1), item(3)]);
  });

  it("accepts a bare list, and refuses a reply with no list", () => {
    expect(extractList(JSON.stringify(list(2)), "questions").items).toEqual(list(2));
    expect(() => extractList('{"answer": 1}', "questions")).toThrow(JsonExtractError);
    expect(() => extractList("sorry, no", "questions")).toThrow(JsonExtractError);
  });

  it("generate keeps a cut-off reply's questions, spares included, up to twice the count", async () => {
    const whole = JSON.stringify({ questions: list(30) });
    const nim = { chat: async () => whole.slice(0, whole.lastIndexOf("explanation")) };
    const logs: string[] = [];
    const pipeline = new Pipeline(nim, MODELS, new PyRandom("x"), (l) => logs.push(l));
    expect(await pipeline.generate("Science", "easy", 22, [])).toHaveLength(29);
    expect(await pipeline.generate("Science", "easy", 10, [])).toHaveLength(20);
    expect(logs).toContain("generate easy: reply was incomplete; kept its 29 complete questions");
  });
});

describe("when failover used up every family", () => {
  it("drops the batch and moves on instead of waiting for a checker", async () => {
    const logs: string[] = [];
    const nim = new FakeNim();
    const models: Models = { generate: "gen/a", verify: "ver/a", translate: "tr/a", pool: ["gen/a", "ver/a"] };
    const pipeline = new Pipeline(nim, models, new PyRandom("x"), (l) => logs.push(l));
    const kept = await pipeline.verifyBatch([group("Who can check this one?")], ["gen", "ver"]);
    expect(kept).toEqual([]);
    expect(nim.calls).toEqual([]);
    expect(logs[0]).toContain("no model left");
  });
});
