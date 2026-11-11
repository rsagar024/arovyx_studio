/**
 * One category's new questions for a run, as a resumable state machine.
 * Port of quizmaster `automation/jobs/question_bank/generate.py`.
 *
 * Each run generates 45 groups (15 each easy, medium and hard), drops
 * duplicates of anything already in the bank, keeps only the ones a second
 * model answers the same way, translates them and merges them into the
 * category's doc, `question_files/base_{category}`, after the questions
 * already there. Re-running a run that's already there does nothing unless
 * forced.
 *
 * Python did all of that in one 40-minute process. Here the same work is
 * split into units small enough for one serverless call (one model request,
 * or a few for a verify batch the verifier leaves empty):
 *
 *     prepare → generate:{round}:{difficulty} (×3) → verify:{round}:{n}
 *       (batches of 12) → next round (up to 3) → translate:{lang}:{attempt}:{n}
 *       (chunks of 6) → write
 *
 * `GenState` is plain JSON and carries everything between units, including
 * the verify shuffle's random state, so the result is the same as one
 * uninterrupted Python run with the same model replies.
 */
import "server-only";
import type { Group } from "./assets";
import { categoryName } from "./categories";
import { modelFamily, type Models, type Nim } from "./nimClient";
import { groupHash, Pipeline, TRANSLATE_BATCH, TRANSLATIONS, VERIFY_BATCH } from "./pipeline";
import { PyRandom, type PyRandomState } from "./pyRandom";
import { pyRepr } from "./pyText";
import * as qb from "./questionBank";
import { DIFFICULTIES, type Difficulty } from "./questionChecks";
import { avoidFor, buildMemory, FactIndex, pickTopics, topicCoverage, type KnownFact, type QuestionMemory } from "./questionMemory";
import { TOPICS } from "./topics";

export const PER_DIFFICULTY = 15;
export const GENERATION_ROUNDS = 6; // the first try plus up to 5 retries
export const RECENT_IN_PROMPT = 100;

export type GenStatus = "exists" | "published" | "empty";
export type GenPhase = "prepare" | "generate" | "verify" | "translate" | "write" | "done";

export interface GenState {
  category: string;
  date: string;
  slot: string;
  force: boolean;
  phase: GenPhase;
  status?: GenStatus;
  round: number;
  /** Difficulties still to generate this round, with how many are short. */
  genQueue: Array<[Difficulty, number]>;
  /** This round's generated groups, before dedupe. */
  fresh: Group[];
  /** The model families that wrote this round's groups, which may not verify
   * them (failover can change the writer). Absent on runs saved before failover. */
  genFamilies?: string[];
  /** This round's deduped groups, verified `verifyPos` at a time. */
  toVerify: Group[];
  verifyPos: number;
  chosen: Record<Difficulty, Group[]>;
  /** What the writer is told about the bank. Absent on runs saved before it
   * existed, which keep using `avoid`; gone once generating is over. */
  memory?: QuestionMemory;
  /** Everything this run has generated so far, so retries don't repeat it. */
  runKnown?: KnownFact[];
  /** Known questions per topic, and the topics this run has asked about. */
  topicCounts?: Record<string, number>;
  usedTopics?: string[];
  /** The models that answered the last unit, for its step row. */
  unitModels?: string[];
  /** Runs saved before `memory`: the newest questions, first 100 only. */
  avoid: string[];
  /** Hashes this run added to `seen` (the rest is re-read from the bank). */
  runSeen: string[];
  rng: PyRandomState;
  /** The final groups, numbered, being translated. */
  groups: Group[];
  tr: { lang: number; attempt: 1 | 2; pending: number[]; pos: number; failed: number[] };
  /** Verify / translate batch sizes, halved when the models keep timing out (default VERIFY_BATCH / TRANSLATE_BATCH). */
  verifyBatch?: number;
  translateBatch?: number;
  /** Where the groups went, once written. */
  doc?: { id: string; count: number };
}

export interface GeneratorDeps {
  store: qb.BankStore;
  nim: Nim;
  models: Models;
  seed: Record<string, Group[]>;
  log?: (line: string) => void;
}

/** The smallest batch a slow model is asked for. */
export const MIN_BATCH = 3;
const vBatch = (s: GenState) => s.verifyBatch ?? VERIFY_BATCH;
const tBatch = (s: GenState) => s.translateBatch ?? TRANSLATE_BATCH;

/**
 * Makes the next unit smaller after its models all timed out: a verify or
 * translate batch is halved (12 → 6 → 3), so a slow model can answer in time.
 * Returns false when there was nothing left to shrink.
 */
export function shrinkUnit(s: GenState): boolean {
  if (s.phase === "verify" && vBatch(s) > MIN_BATCH) {
    s.verifyBatch = Math.max(MIN_BATCH, Math.floor(vBatch(s) / 2));
    return true;
  }
  if (s.phase === "translate" && tBatch(s) > MIN_BATCH) {
    s.translateBatch = Math.max(MIN_BATCH, Math.floor(tBatch(s) / 2));
    return true;
  }
  return false;
}

export function startState(
  category: string,
  date: string,
  slot: string,
  force: boolean,
  rngSeed = `${date}/${slot}/${category}`
): GenState {
  return {
    category,
    date,
    slot,
    force,
    phase: "prepare",
    round: 0,
    genQueue: [],
    fresh: [],
    toVerify: [],
    verifyPos: 0,
    chosen: { easy: [], medium: [], hard: [] },
    avoid: [],
    runSeen: [],
    rng: new PyRandom(rngSeed).getState(),
    groups: [],
    tr: { lang: 0, attempt: 1, pending: [], pos: 0, failed: [] },
  };
}

/** A short label for the unit `step` will run next, e.g. `verify 2/4`. */
export function describeUnit(s: GenState): string {
  switch (s.phase) {
    case "generate":
      return `generate ${s.genQueue[0]?.[0] ?? ""}${s.round ? ` (retry ${s.round})` : ""}`;
    case "verify":
      return `verify ${Math.floor(s.verifyPos / vBatch(s)) + 1}/${Math.max(1, Math.ceil(s.toVerify.length / vBatch(s)))}`;
    case "translate": {
      const lang = TRANSLATIONS[s.tr.lang]?.[0] ?? "";
      return `translate ${lang} ${Math.floor(s.tr.pos / tBatch(s)) + 1}/${Math.max(1, Math.ceil(s.tr.pending.length / tBatch(s)))}${s.tr.attempt === 2 ? " (retry)" : ""}`;
    }
    default:
      return s.phase;
  }
}

/** Key for the step row of the unit `step` will run next. */
export function unitKey(s: GenState): string {
  switch (s.phase) {
    case "generate":
      return `${s.category}:generate:${s.round}:${s.genQueue[0]?.[0] ?? "x"}`;
    case "verify":
      return `${s.category}:verify:${s.round}:${Math.floor(s.verifyPos / vBatch(s)) + 1}`;
    case "translate":
      return `${s.category}:translate_${TRANSLATIONS[s.tr.lang]?.[0] ?? "x"}:${s.tr.attempt}:${Math.floor(s.tr.pos / tBatch(s)) + 1}`;
    default:
      return `${s.category}:${s.phase}`;
  }
}

/** Units still to run, roughly, for the progress counter. */
export function estimateRemaining(s: GenState): number {
  const translateUnits = (n: number) => 2 * Math.ceil(n / TRANSLATE_BATCH);
  const target = 3 * PER_DIFFICULTY;
  switch (s.phase) {
    case "prepare":
      return 1 + 3 + Math.ceil(54 / VERIFY_BATCH) + translateUnits(target) + 1;
    case "generate":
      return s.genQueue.length + Math.ceil((s.fresh.length + s.genQueue.reduce((n, [, c]) => n + c * 1.5, 0)) / VERIFY_BATCH) + translateUnits(target) + 1;
    case "verify":
      return Math.ceil((s.toVerify.length - s.verifyPos) / VERIFY_BATCH) + translateUnits(target) + 1;
    case "translate": {
      const n = s.groups.length;
      const left = Math.ceil((s.tr.pending.length - s.tr.pos) / TRANSLATE_BATCH);
      return left + (s.tr.lang === 0 ? Math.ceil(n / TRANSLATE_BATCH) : 0) + 1;
    }
    case "write":
      return 1;
    default:
      return 0;
  }
}

function missingNow(s: GenState): Array<[Difficulty, number]> {
  return DIFFICULTIES.filter((d) => s.chosen[d].length < PER_DIFFICULTY).map(
    (d) => [d, PER_DIFFICULTY - s.chosen[d].length] as [Difficulty, number]
  );
}

/** What's worth a verifier call: per difficulty, what's still needed plus half
 * again as spares for the verifier to reject. */
function spareTrimmed(groups: Group[], s: GenState): Group[] {
  const room = new Map<string, number>(
    DIFFICULTIES.map((d) => {
      const short = PER_DIFFICULTY - s.chosen[d].length;
      return [d, short + Math.ceil(short / 2)] as [string, number];
    })
  );
  return groups.filter((g) => {
    const left = room.get(g.difficulty) ?? 0;
    room.set(g.difficulty, left - 1);
    return left > 0;
  });
}

export class Generator {
  private log: (line: string) => void;
  constructor(private deps: GeneratorDeps) {
    this.log = deps.log ?? (() => {});
  }

  /** Runs every unit to the end in one go (tests, and short local runs). */
  async run(category: string, date: string, slot = "am", opts: { force?: boolean; rngSeed?: string } = {}): Promise<GenStatus> {
    let state = startState(category, date, slot, Boolean(opts.force), opts.rngSeed);
    while (state.phase !== "done") state = await this.step(state);
    return state.status!;
  }

  /** Runs the next unit. Returns the new state (the input is not reused). */
  async step(input: GenState): Promise<GenState> {
    const s: GenState = JSON.parse(JSON.stringify(input));
    const rng = new PyRandom(s.rng);
    const pipeline = new Pipeline(this.deps.nim, this.deps.models, rng, this.log);
    switch (s.phase) {
      case "prepare":
        await this.prepare(s);
        break;
      case "generate":
        await this.generate(s, pipeline);
        break;
      case "verify":
        await this.verify(s, pipeline);
        break;
      case "translate":
        await this.translate(s, pipeline);
        break;
      case "write":
        await this.write(s);
        break;
      case "done":
        break;
    }
    s.rng = rng.getState();
    s.unitModels = pipeline.answeredBy;
    return s;
  }

  /** The bank's groups other than this run's. */
  private async existing(s: GenState): Promise<Group[]> {
    return (await qb.loadCategory(this.deps.store, s.category)).filter((g) => !qb.inBatch(g, s.date, s.slot));
  }

  private async prepare(s: GenState) {
    const { category, date, slot } = s;
    if ((await qb.hasBatch(this.deps.store, category, date, slot)) && !s.force) {
      this.log(`${category} already has the ${slot} questions for ${date}; skipping (use force to replace them)`);
      s.status = "exists";
      s.phase = "done";
      return;
    }
    const existing = await this.existing(s);
    const known = [...existing, ...(this.deps.seed[category] ?? [])];
    s.memory = buildMemory(known, `${date}/${slot}`);
    s.runKnown = [];
    s.topicCounts = topicCoverage(TOPICS[category] ?? [], known);
    s.usedTopics = [];
    this.log(`${date} ${slot} ${category}: aiming for ${3 * PER_DIFFICULTY} {'easy': 15, 'medium': 15, 'hard': 15}`);
    this.log(
      `memory: ${s.memory.known} known questions; sent ${DIFFICULTIES.map((d) => `${d} ${s.memory!.avoid[d].length}`).join(", ")}`
    );
    this.startRound(s, 0);
  }

  private startRound(s: GenState, round: number) {
    s.round = round;
    const missing = round < GENERATION_ROUNDS ? missingNow(s) : [];
    if (!missing.length) {
      this.finishGenerate(s);
      return;
    }
    if (round) {
      this.log(`retry ${round}: still need {${missing.map(([d, n]) => `'${d}': ${n}`).join(", ")}}`);
    }
    s.genQueue = missing;
    s.genFamilies = [];
    s.fresh = [];
    s.toVerify = [];
    s.verifyPos = 0;
    s.phase = "generate";
  }

  private async generate(s: GenState, pipeline: Pipeline) {
    const [difficulty, short] = s.genQueue[0]!;
    // Ask for extra: some fail the checks or the verifier.
    const count = s.round === 0 ? short + Math.max(2, Math.floor(short / 2)) : short * 2;
    const runQuestions = [...(s.runKnown ?? []).map((k) => k.question), ...s.fresh.map((g) => g.en.question)];
    const topics = pickTopics(s.topicCounts ?? {}, s.usedTopics ?? [], `${s.date}/${s.slot}`);
    const avoid = s.memory ? avoidFor(s.memory, difficulty, runQuestions, topics) : s.avoid.slice(0, RECENT_IN_PROMPT);
    const hints = s.memory
      ? {
          ...(topics.length ? { focus_topics: topics } : {}),
          overused_topics: s.memory.overusedTopics,
          overused_patterns: s.memory.overusedPatterns,
        }
      : {};
    s.fresh.push(...(await pipeline.generate(categoryName(s.category), difficulty, count, avoid, hints)));
    const all = Object.keys(s.topicCounts ?? {});
    const used = [...new Set([...(s.usedTopics ?? []), ...topics])];
    s.usedTopics = used.length >= all.length ? [] : used;
    s.genFamilies = [...new Set([...(s.genFamilies ?? []), pipeline.generatedBy])];
    s.genQueue.shift();
    if (s.genQueue.length) return;
    // Every difficulty is in: drop duplicates of the seed bank (all
    // categories), the category's other questions and this run's.
    const existing = await this.existing(s);
    const seen = new Set<string>(s.runSeen);
    for (const groups of Object.values(this.deps.seed)) for (const g of groups) seen.add(groupHash(g));
    for (const g of existing) seen.add(groupHash(g));
    const facts = new FactIndex();
    for (const g of [...existing, ...(this.deps.seed[s.category] ?? [])]) {
      facts.add(g.en.question, g.en.options[g.correctIndex]!);
    }
    for (const k of s.runKnown ?? []) facts.add(k.question, k.answer);
    const before = new Set(seen);
    s.toVerify = spareTrimmed(pipeline.dedupe(s.fresh, seen, facts), s);
    for (const h of seen) if (!before.has(h)) s.runSeen.push(h);
    // Kept or not, the writer shouldn't offer these again.
    s.runKnown = [
      ...(s.runKnown ?? []),
      ...s.fresh.map((g) => ({ question: g.en.question, answer: g.en.options[g.correctIndex]! })),
    ];
    s.fresh = [];
    s.verifyPos = 0;
    s.phase = "verify";
    if (!s.toVerify.length) this.startRound(s, s.round + 1);
  }

  private async verify(s: GenState, pipeline: Pipeline) {
    const batch = s.toVerify.slice(s.verifyPos, s.verifyPos + vBatch(s));
    const writers = s.genFamilies?.length ? s.genFamilies : [modelFamily(this.deps.models.generate)];
    for (const group of await pipeline.verifyBatch(batch, writers)) {
      const bucket = s.chosen[group.difficulty as Difficulty];
      if (bucket && bucket.length < PER_DIFFICULTY) {
        bucket.push(group);
        s.avoid.unshift(group.en.question);
        s.avoid = s.avoid.slice(0, RECENT_IN_PROMPT);
      }
    }
    s.verifyPos += vBatch(s);
    if (s.verifyPos >= s.toVerify.length) {
      s.toVerify = [];
      this.startRound(s, s.round + 1);
    }
  }

  private finishGenerate(s: GenState) {
    const target = 3 * PER_DIFFICULTY;
    const groups = DIFFICULTIES.flatMap((d) => s.chosen[d]);
    s.chosen = { easy: [], medium: [], hard: [] };
    s.genQueue = [];
    // Generating is over: keep the state row small.
    delete s.memory;
    delete s.runKnown;
    delete s.topicCounts;
    delete s.usedTopics;
    if (!groups.length) {
      this.log(`${s.category}: no questions survived; nothing written`);
      s.status = "empty";
      s.phase = "done";
      return;
    }
    if (groups.length < target) {
      this.log(`warning: only ${groups.length} of ${target} questions survived for ${s.category}`);
    }
    const compact = s.date.replace(/-/g, "");
    groups.forEach((g, i) => {
      g.groupId = `${s.category}_${compact}${s.slot}_${String(i + 1).padStart(2, "0")}`;
      g.addedOn = s.date;
      g.batch = s.slot;
    });
    s.groups = groups;
    s.tr = { lang: 0, attempt: 1, pending: groups.map((_, i) => i), pos: 0, failed: [] };
    s.phase = "translate";
  }

  private async translate(s: GenState, pipeline: Pipeline) {
    const [lang, name] = TRANSLATIONS[s.tr.lang]!;
    const chunk = s.tr.pending.slice(s.tr.pos, s.tr.pos + tBatch(s));
    s.tr.failed.push(...(await pipeline.translateChunk(s.groups, chunk, lang, name)));
    s.tr.pos += tBatch(s);
    if (s.tr.pos < s.tr.pending.length) return;
    // This pass over `pending` is done.
    if (s.tr.failed.length && s.tr.attempt === 1) {
      this.log(`${lang}: retrying ${s.tr.failed.length} variant(s)`);
      s.tr = { lang: s.tr.lang, attempt: 2, pending: s.tr.failed, pos: 0, failed: [] };
      return;
    }
    for (const i of s.tr.failed) this.log(`${lang}: skipped for ${pyRepr(s.groups[i]!.en.question)}`);
    if (s.tr.lang + 1 < TRANSLATIONS.length) {
      s.tr = { lang: s.tr.lang + 1, attempt: 1, pending: s.groups.map((_, i) => i), pos: 0, failed: [] };
    } else {
      s.phase = "write";
    }
  }

  private async write(s: GenState) {
    const doc = await qb.appendBatch(this.deps.store, s.category, s.date, s.slot, s.groups);
    this.log(`added ${s.groups.length} questions to ${qb.COLLECTION}/${doc.id} (${doc.count} in all)`);
    s.doc = { id: doc.id, count: doc.count };
    s.status = "published";
    s.phase = "done";
    s.groups = s.groups.map((g) => ({ groupId: g.groupId }) as Group); // keep the state row small
  }
}
