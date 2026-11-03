/**
 * Generate, check, cross-verify and translate questions with NVIDIA NIM.
 * Port of quizmaster `automation/jobs/question_bank/pipeline.py`.
 *
 * Questions move through the pipeline as groups in the bundled-bank format:
 *
 *     {"difficulty", "subcategory", "tags", "correctIndex",
 *      "en": {"question", "options", "explanation"}, "hi": {...}, "hi-Latn": {...}}
 *
 * The methods are the units the resumable generator calls one at a time.
 */
import "server-only";
import { prompt, type Group, type PromptName } from "./assets";
import { extractJson, JsonExtractError } from "./jsonExtract";
import { isDeadline, type Models, type Nim } from "./nimClient";
import { pyDumps } from "./pyJson";
import type { PyRandom } from "./pyRandom";
import { pyRepr } from "./pyText";
import { dedupHash, validateEn, validateVariant, type Language, type Variant } from "./questionChecks";
import { errMessage, errName } from "./dailyNotify";

export const LETTERS = "ABCD";
export const VERIFY_BATCH = 12;
export const TRANSLATE_BATCH = 6;
export const TRANSLATIONS: Array<[Exclude<Language, "en">, PromptName]> = [
  ["hi", "translate_hi.md"],
  ["hi-Latn", "translate_hi_latn.md"],
];

export function groupHash(group: Group): string {
  const en = group.en;
  return dedupHash(en.question, en.options[group.correctIndex]!);
}

/** Python `str(x)` for the JSON values a model may put in `tags`. */
function pyStr(x: unknown): string {
  if (x === null || x === undefined) return "None";
  if (x === true) return "True";
  if (x === false) return "False";
  if (typeof x === "string") return x;
  if (typeof x === "number") return String(x);
  return pyDumps(x);
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export class Pipeline {
  constructor(
    private nim: Nim,
    private models: Models,
    private rng: PyRandom,
    private log: (line: string) => void = () => {}
  ) {}

  private async ask(name: PromptName, payload: unknown, model: string, temperature: number): Promise<unknown> {
    const reply = await this.nim.chat(
      [
        { role: "system", content: prompt(name) },
        { role: "user", content: pyDumps(payload) },
      ],
      { model, temperature }
    );
    return extractJson(reply);
  }

  /* --- Steps 2 and 3: generate and validate --- */

  /** Up to `count` new English groups that pass `validateEn`. */
  async generate(categoryName: string, difficulty: string, count: number, avoid: string[]): Promise<Group[]> {
    let reply: unknown;
    try {
      reply = await this.ask(
        "generate.md",
        { category: categoryName, difficulty, count, avoid },
        this.models.generate,
        0.8
      );
    } catch (err) {
      if (!(err instanceof JsonExtractError)) throw err;
      this.log(`generate ${difficulty}: ${err.message}`);
      return [];
    }
    const items = isObject(reply) && Array.isArray(reply.questions) ? reply.questions : [];
    const groups: Group[] = [];
    for (const item of items.slice(0, count)) {
      if (!isObject(item)) continue;
      const tags = item.tags;
      const group = {
        difficulty,
        subcategory: item.subcategory ? pyStr(item.subcategory) : "",
        tags: Array.isArray(tags) ? tags.map(pyStr).slice(0, 4) : [],
        correctIndex: item.correctIndex ?? null,
        en: {
          question: item.question ?? null,
          options: item.options ?? null,
          explanation: item.explanation ?? null,
        },
      } as unknown as Group;
      const problems = validateEn(group);
      if (problems.length) this.log(`dropped (invalid): ${pyRepr(item.question)}: ${problems.join(", ")}`);
      else groups.push(group);
    }
    return groups;
  }

  /* --- Step 4: remove duplicates --- */

  /** Groups whose question and answer aren't in `seen`; adds the kept ones. */
  dedupe(groups: Group[], seen: Set<string>): Group[] {
    const kept: Group[] = [];
    for (const group of groups) {
      const h = groupHash(group);
      if (seen.has(h)) {
        this.log(`dropped (duplicate): ${pyRepr(group.en.question)}`);
        continue;
      }
      seen.add(h);
      kept.push(group);
    }
    return kept;
  }

  /* --- Step 5: cross-check with a second model --- */

  /** All of `groups`, batch by batch (the generator calls `verifyBatch` per unit). */
  async verify(groups: Group[]): Promise<Group[]> {
    const kept: Group[] = [];
    for (let start = 0; start < groups.length; start += VERIFY_BATCH) {
      kept.push(...(await this.verifyBatch(groups.slice(start, start + VERIFY_BATCH))));
    }
    return kept;
  }

  /** The groups the verifier answers correctly without seeing the answer,
   * with the options shuffled. */
  async verifyBatch(batch: Group[]): Promise<Group[]> {
    const payload: Array<{ id: string; question: string; options: Record<string, string> }> = [];
    const expected: Record<string, string> = {};
    batch.forEach((group, i) => {
      const options = group.en.options;
      const order = [0, 1, 2, 3];
      this.rng.shuffle(order);
      const qid = `q${i + 1}`;
      payload.push({
        id: qid,
        question: group.en.question,
        options: Object.fromEntries(order.map((o, k) => [LETTERS[k]!, options[o]!])),
      });
      expected[qid] = LETTERS[order.indexOf(group.correctIndex)]!;
    });
    const answers = await this.verifyAnswers(payload);
    if (answers === null) {
      // A long batch can run the verifier out of tokens: try halves.
      if (batch.length > 1) {
        const half = Math.floor(batch.length / 2);
        this.log(`verify: no answers for ${batch.length} questions; trying halves`);
        return [...(await this.verifyBatch(batch.slice(0, half))), ...(await this.verifyBatch(batch.slice(half)))];
      }
      this.log(`dropped (verifier gave no answer): ${pyRepr(batch[0]!.en.question)}`);
      return [];
    }
    const kept: Group[] = [];
    batch.forEach((group, i) => {
      const qid = `q${i + 1}`;
      if (answers[qid] === expected[qid]) kept.push(group);
      else {
        this.log(
          `dropped (verifier said ${answers[qid] ?? "nothing"}, expected ${expected[qid]}): ${pyRepr(group.en.question)}`
        );
      }
    });
    return kept;
  }

  /** The verifier's letters by id, or null if it gave no readable reply. */
  private async verifyAnswers(payload: unknown[]): Promise<Record<string, string> | null> {
    for (const attempt of [1, 2]) {
      try {
        const reply = await this.ask("verify.md", { questions: payload }, this.models.verify, 0.0);
        if (!isObject(reply)) throw new TypeError("'list' object has no attribute 'get'");
        const list = Array.isArray(reply.answers) ? reply.answers : [];
        const out: Record<string, string> = {};
        for (const a of list) {
          if (!isObject(a)) continue;
          out[pyStr(a.id)] = ("answer" in a ? pyStr(a.answer) : "").trim().toUpperCase().slice(0, 1);
        }
        return out;
      } catch (err) {
        if (isDeadline(err)) throw err;
        this.log(`verify attempt ${attempt}: ${errName(err)}: ${errMessage(err)}`);
      }
    }
    return null;
  }

  /* --- Step 7: translate into natural Hindi and Hinglish --- */

  /** Translates groups[i] for i in `chunk`; returns the ones that failed. */
  async translateChunk(groups: Group[], chunk: number[], lang: Exclude<Language, "en">, name: PromptName): Promise<number[]> {
    const payload = chunk.map((i) => ({
      id: `t${i}`,
      question: groups[i]!.en.question,
      options: groups[i]!.en.options,
      explanation: groups[i]!.en.explanation,
    }));
    let items: Map<string, Record<string, unknown>>;
    try {
      const reply = await this.ask(name, { questions: payload }, this.models.translate, 0.3);
      if (!isObject(reply)) throw new TypeError("'list' object has no attribute 'get'");
      items = new Map();
      for (const item of Array.isArray(reply.questions) ? reply.questions : []) {
        if (isObject(item)) items.set(pyStr(item.id), item);
      }
    } catch (err) {
      if (!(err instanceof JsonExtractError) && !(err instanceof TypeError)) throw err;
      this.log(`${lang}: ${err.message}`);
      return [...chunk];
    }
    const failed: number[] = [];
    for (const i of chunk) {
      const item = items.get(`t${i}`);
      const variant = item
        ? { question: item.question ?? null, options: item.options ?? null, explanation: item.explanation ?? null }
        : null;
      const problems = validateVariant(lang, variant, groups[i]!.en as Variant);
      if (problems.length) {
        this.log(`${lang} rejected: ${problems.join(", ")}`);
        failed.push(i);
      } else {
        (groups[i] as Record<string, unknown>)[lang] = variant;
      }
    }
    return failed;
  }
}
