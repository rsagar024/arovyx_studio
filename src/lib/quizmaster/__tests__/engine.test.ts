/**
 * The step engine: lease lock, resumable ticks, the 240 s budget, the pm
 * slot, and how a finished run is recorded. Everything runs against the
 * in-memory repo and Firestore stand-ins with a fake clock.
 */
import { describe, expect, it } from "vitest";
import { seedBank } from "../assets";
import { categoryFor } from "../categories";
import {
  createRun,
  finalStatus,
  planSteps,
  tick,
  TICK_BUDGET_MS,
  type EngineDeps,
  type RunOptions,
} from "../engine";
import * as ist from "../ist";
import { DeadlineError, type ChatMessage, type ChatOptions, type Nim } from "../nimClient";
import * as qb from "../questionBank";
import { MemoryRunRepo } from "../repo";
import type { JobDeps } from "../runtime";
import { MemoryDocStore } from "../writes";
import { FakeMessenger, FakeNim, MODELS } from "./fakeNim";

const DATE = "2026-10-16";
const DAILY = categoryFor(ist.dayNumber(ist.fromKey(DATE))); // the day's quiz category
const MORNING = ist.atTime(ist.fromKey(DATE), 7).getTime();

/** A fake NIM that takes `callMs` of fake time per call and respects the deadline like NimClient. */
class SlowNim implements Nim {
  calls = 0;
  failNext = 0;
  constructor(private inner: FakeNim, private clock: { t: number }, private callMs: number, private deadline: () => number) {}
  async chat(messages: ChatMessage[], opts: ChatOptions) {
    if (this.clock.t + this.callMs > this.deadline()) throw new DeadlineError();
    this.clock.t += this.callMs;
    this.calls++;
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error("NIM exploded");
    }
    return this.inner.chat(messages, opts);
  }
}

function setup(o: { callMs?: number; budgetMs?: number } = {}) {
  const clock = { t: MORNING };
  const repo = new MemoryRunRepo();
  const bank = new qb.MemoryBankStore();
  const docs = new MemoryDocStore(() => new Date(clock.t), () => false);
  const messenger = new FakeMessenger();
  const fake = new FakeNim();
  let deadline = Number.POSITIVE_INFINITY;
  const nim = new SlowNim(fake, clock, o.callMs ?? 1_000, () => deadline);
  const finished: string[] = [];
  const jobs: JobDeps = {
    bank,
    docs,
    messenger: messenger as never,
    nim,
    models: MODELS,
    seed: {},
    users: null,
    remoteConfig: async () => null,
  };
  const deps: EngineDeps = {
    repo,
    clock: () => clock.t,
    budgetMs: o.budgetMs,
    makeJobs: (ctx) => {
      deadline = ctx.deadline;
      return jobs;
    },
    onFinish: async (run) => void finished.push(run.status),
  };
  return { clock, repo, bank, docs, messenger, fake, nim, deps, finished };
}

const options = (over: Partial<RunOptions> = {}): RunOptions => ({
  date: DATE,
  force: false,
  dryRun: false,
  categories: [DAILY],
  mode: "daily",
  scheduled: true,
  ...over,
});

async function runToEnd(deps: EngineDeps, runId: string, maxTicks = 50) {
  for (let i = 0; i < maxTicks; i++) {
    const r = await tick(deps, runId);
    if (r.done) return { ticks: i + 1, result: r };
  }
  throw new Error("run did not finish");
}

describe("planning", () => {
  it("the pm slot skips the daily quiz", () => {
    const keys = (slot: string) => planSteps("question_bank", slot, options({ categories: ["science", "cricket"] })).map((s) => s.key);
    expect(keys("pm")).toEqual(["cricket:prepare", "science:prepare", "publish", "notify"]);
    expect(keys("am")).toEqual(["cricket:prepare", "science:prepare", "publish", "daily_quiz", "notify"]);
    expect(keys("x1730000000")).toContain("daily_quiz");
  });

  it("categories keep the workflow's matrix order; seed mode only seeds and publishes", () => {
    const steps = planSteps("question_bank", "am", options({ categories: ["space", "general_knowledge"] }));
    expect(steps.slice(0, 2).map((s) => s.key)).toEqual(["general_knowledge:prepare", "space:prepare"]);
    expect(planSteps("question_bank", "am", options({ mode: "seed" })).map((s) => s.key)).toEqual(["seed", "publish"]);
  });

  it("guest cleanup joins only when asked, and never under 30 days", () => {
    const withCleanup = planSteps("question_bank", "am", options({ cleanup: { days: 30, dryRun: false } }));
    expect(withCleanup[withCleanup.length - 1]!.key).toBe("guest_cleanup");
    expect(() => planSteps("guest_cleanup", "", options({ days: 7 }))).toThrow(/at least 30/);
  });
});

describe("Run now, many times a day", () => {
  it("every run generates new questions and pushes; only a run's own daily quiz push replaces its push", async () => {
    const { deps, bank, messenger, repo, clock } = setup();
    const runNow = async (slot: string) => {
      const { run } = await createRun(deps, {
        kind: "question_bank",
        trigger: "manual",
        slot,
        options: options({ runNow: true, categories: [DAILY] }),
      });
      await runToEnd(deps, run.id);
      clock.t += 5 * 60_000; // the next click comes minutes later, inside the daily quiz push's hour
      return JSON.parse((await repo.getRun(run.id))!.summary);
    };
    const pushes = () => messenger.sent.filter((m) => m.data.type === "new_questions").length;

    // The first run of the morning publishes the daily quiz: one notification, not two.
    const first = await runNow("x1001");
    expect(first.categories[DAILY].status).toBe("published");
    expect(first.steps.notify.newQuestions).toBe("covered_by_daily_quiz");
    expect(pushes()).toBe(0);

    const second = await runNow("x1002");
    expect(second.categories[DAILY].status).toBe("published");
    expect(second.steps.notify.newQuestions).toBe("sent");
    expect(pushes()).toBe(3); // one per language

    const third = await runNow("x1003");
    expect(third.categories[DAILY].status).toBe("published");
    expect(third.steps.notify.newQuestions).toBe("sent");
    expect(pushes()).toBe(6);

    const groups = await qb.loadCategory(bank, DAILY);
    for (const slot of ["x1001", "x1002", "x1003"]) {
      expect(groups.filter((g) => g.batch === slot).length).toBeGreaterThan(0);
    }
    expect(new Set(groups.map((g) => g.en.question)).size).toBe(groups.length); // nothing repeated
  });

  it("other runs still count any recent daily quiz push", async () => {
    const { deps, repo, clock } = setup();
    const run = async (slot: string) => {
      const { run: r } = await createRun(deps, { kind: "question_bank", trigger: "manual", slot, options: options({ categories: [DAILY] }) });
      await runToEnd(deps, r.id);
      clock.t += 5 * 60_000;
      return JSON.parse((await repo.getRun(r.id))!.summary);
    };
    await run("x2001");
    expect((await run("x2002")).steps.notify.newQuestions).toBe("covered_by_daily_quiz");
  });
});

describe("three tasks at the same time", () => {
  it("up to 3 categories run at once, and never more", async () => {
    const { deps, fake } = setup();
    let inFlight = 0;
    let peak = 0;
    const jobs = deps.makeJobs({ dryRun: false, deadline: Number.POSITIVE_INFINITY, log: () => {} });
    jobs.nim = {
      async chat(messages: ChatMessage[], opts: ChatOptions) {
        peak = Math.max(peak, ++inFlight);
        await new Promise((r) => setTimeout(r, 1)); // a real wait, so the lanes overlap
        inFlight--;
        return fake.chat(messages, opts);
      },
    };
    deps.makeJobs = () => jobs;
    const { run } = await createRun(deps, {
      kind: "question_bank",
      trigger: "manual",
      slot: "pm",
      options: options({ categories: ["science", "cricket", "history", "space", "geography"], scheduled: false }),
    });
    await runToEnd(deps, run.id);
    expect(peak).toBe(3);
  });
});

describe("lease lock", () => {
  it("two concurrent run creations: one wins, the other gets the live run", async () => {
    const { deps } = setup();
    const input = { kind: "question_bank" as const, trigger: "timer" as const, slot: "am", options: options() };
    const [a, b] = await Promise.all([createRun(deps, input), createRun(deps, input)]);
    expect([a.created, b.created].sort()).toEqual([false, true]);
    const loser = a.created ? b : a;
    expect(loser.created === false && loser.live).toBe(true);
    expect(loser.run.id).toBe((a.created ? a : b).run.id);
  });

  it("two concurrent ticks on one run: one works, the other is told it's busy", async () => {
    const { deps } = setup();
    const { run } = await createRun(deps, { kind: "question_bank", trigger: "timer", slot: "am", options: options() });
    const [x, y] = await Promise.all([tick(deps, run.id), tick(deps, run.id)]);
    expect([Boolean(x.busy), Boolean(y.busy)].sort()).toEqual([false, true]);
  });

  it("a run whose lease ran out (tab closed) is offered for resuming, not duplicated", async () => {
    const { deps, clock, repo } = setup();
    const input = { kind: "question_bank" as const, trigger: "timer" as const, slot: "am", options: options() };
    const first = await createRun(deps, input);
    clock.t += 11 * 60_000; // no tick for 11 minutes
    const second = await createRun(deps, input);
    expect(second.created).toBe(false);
    expect(second.created === false && second.live).toBe(false);
    expect(second.run.id).toBe(first.run.id);
    expect((await repo.listRuns(10)).length).toBe(1);
  });
});

describe("ticks", () => {
  it("a run goes from generate to notify over several ticks and ends succeeded", async () => {
    const { deps, bank, docs, messenger, finished, repo } = setup();
    const { run } = await createRun(deps, { kind: "question_bank", trigger: "timer", slot: "am", options: options() });
    const { result } = await runToEnd(deps, run.id);
    expect(result.status).toBe("succeeded");
    expect(finished).toEqual(["succeeded"]);
    expect((await qb.loadCategory(bank, DAILY)).length).toBe(45);
    const challenge = docs.docs.get(`daily_challenges/${DATE}`)!;
    expect((challenge.groupIds as string[]).length).toBe(10);
    expect(challenge.notifiedAt).toBeInstanceOf(Date);
    expect(docs.docs.get(qb.META)).toBeTruthy();
    // The daily quiz push just went out, so no second "new questions" push.
    expect(messenger.sent.map((m) => m.topic)).toEqual(["new_quiz_en", "new_quiz_hi", "new_quiz_hi_latn"]);
    const summary = JSON.parse((await repo.getRun(run.id))!.summary);
    expect(summary.categories[DAILY]).toMatchObject({ status: "published", added: 45 });
    expect(summary.steps.notify.newQuestions).toBe("covered_by_daily_quiz");
    const logs = await repo.logs(run.id);
    expect(logs.some((l) => l.message.includes("added 45 questions"))).toBe(true);
  });

  it("the pm slot run never publishes a daily quiz", async () => {
    const { deps, docs, messenger, clock } = setup();
    clock.t = ist.atTime(ist.fromKey(DATE), 17).getTime();
    const { run } = await createRun(deps, { kind: "question_bank", trigger: "timer", slot: "pm", options: options() });
    const { result } = await runToEnd(deps, run.id);
    expect(result.status).toBe("succeeded");
    expect(docs.docs.has(`daily_challenges/${DATE}`)).toBe(false);
    expect(messenger.sent.map((m) => m.data.type)).toEqual(["new_questions", "new_questions", "new_questions"]);
  });

  it("a tick stops before the 240 s budget and the next tick carries on", async () => {
    const { deps, clock, repo } = setup({ callMs: 50_000 });
    const { run } = await createRun(deps, { kind: "question_bank", trigger: "timer", slot: "am", options: options() });
    const t0 = clock.t;
    const first = await tick(deps, run.id);
    expect(first.done).toBe(false);
    expect(clock.t - t0).toBeLessThanOrEqual(TICK_BUDGET_MS);
    expect(first.progress.done).toBeGreaterThan(0);
    // Progress was saved: the next tick starts where this one stopped.
    const before = (await repo.steps(run.id)).filter((s) => s.status === "done").length;
    const t1 = clock.t;
    await tick(deps, run.id);
    expect(clock.t - t1).toBeLessThanOrEqual(TICK_BUDGET_MS);
    expect((await repo.steps(run.id)).filter((s) => s.status === "done").length).toBeGreaterThan(before);
    const { result } = await runToEnd(deps, run.id);
    expect(result.status).toBe("succeeded");
  });

  it("a unit that throws is retried, then the run resumes from the saved step", async () => {
    const { deps, nim, repo, bank } = setup();
    const { run } = await createRun(deps, { kind: "question_bank", trigger: "timer", slot: "am", options: options() });
    nim.failNext = 1; // the first generate call fails once
    await tick(deps, run.id);
    const steps = await repo.steps(run.id);
    expect(steps.find((s) => s.key === `${DAILY}:prepare`)!.status).toBe("done");
    expect(steps.some((s) => s.attempts === 1)).toBe(true);
    const { result } = await runToEnd(deps, run.id);
    expect(result.status).toBe("succeeded");
    expect((await qb.loadCategory(bank, DAILY)).length).toBe(45);
  });

  it("an interrupted step (crash between saving the next unit and closing this one) resumes once", async () => {
    const { deps, repo, bank, clock } = setup({ callMs: 60_000 });
    const { run } = await createRun(deps, { kind: "question_bank", trigger: "timer", slot: "am", options: options() });
    await tick(deps, run.id); // stops part-way
    // Re-open the last finished category row, as if the process died before closing it.
    const steps = await repo.steps(run.id);
    const cats = steps.filter((s) => s.order < 100_000);
    const head = cats.find((s) => s.status === "pending")!;
    const prev = cats.filter((s) => s.status === "done" && s.order < head.order).pop()!;
    await repo.updateStep(prev.id, { status: "pending" });
    // And the tick lease is still held by the dead process: it expires.
    await repo.updateRun(run.id, { tickUntil: new Date(clock.t + 60_000), tickToken: "dead" });
    expect((await tick(deps, run.id)).busy).toBe(true);
    clock.t += 5 * 60_000;
    const { result } = await runToEnd(deps, run.id);
    expect(result.status).toBe("succeeded");
    expect((await qb.loadCategory(bank, DAILY)).length).toBe(45); // nothing ran twice
  });

  it("a category that keeps failing is recorded and the others go on", async () => {
    const { deps, repo } = setup();
    const fail = new Set(["gen"]);
    const { run } = await createRun(deps, {
      kind: "question_bank",
      trigger: "manual",
      slot: "x1",
      options: options({ categories: ["science", "history"], scheduled: false }),
    });
    // History's generator always fails; science works.
    const original = deps.makeJobs;
    deps.makeJobs = (ctx) => {
      const j = original(ctx);
      const inner = j.nim;
      return {
        ...j,
        nim: {
          chat: async (m: ChatMessage[], o: ChatOptions) => {
            if (fail.has(o.model) && m[m.length - 1]!.content.includes("History")) throw new Error("model down");
            return inner.chat(m, o);
          },
        },
      };
    };
    const { result } = await runToEnd(deps, run.id);
    expect(result.status).toBe("partial");
    const summary = JSON.parse((await repo.getRun(run.id))!.summary);
    expect(summary.categories.history.status).toBe("failed");
    expect(summary.categories.science.status).toBe("published");
    expect(summary.steps.publish.status).toBe("done"); // publish always runs after generate
  });

  it("a dry run against the seed bank leaves Firestore untouched", async () => {
    const { deps, bank, docs, repo } = setup();
    for (const [c, groups] of Object.entries(seedBank())) await bank.put(qb.makeDoc(qb.baseId(c), c, "base", groups));
    const dryBank = new qb.DryRunBankStore(bank);
    const original = deps.makeJobs;
    deps.makeJobs = (ctx) => ({ ...original(ctx), bank: dryBank, docs: new (class extends MemoryDocStore {})() });
    const { run } = await createRun(deps, { kind: "question_bank", trigger: "manual", slot: "am", options: options({ dryRun: true }) });
    const { result } = await runToEnd(deps, run.id);
    expect(result.status).toBe("succeeded");
    expect((await bank.get(qb.baseId(DAILY)))!.count).toBe(45); // the real bank kept only the seed
    expect(docs.docs.size).toBe(0);
    expect((await repo.logs(run.id)).length).toBeGreaterThan(0);
  });

  it("cancelling stops the run", async () => {
    const { deps, repo } = setup({ callMs: 100_000 });
    const { run } = await createRun(deps, { kind: "question_bank", trigger: "timer", slot: "am", options: options() });
    await tick(deps, run.id);
    await repo.updateRun(run.id, { status: "cancelled" });
    const r = await tick(deps, run.id);
    expect(r.done).toBe(true);
    expect(r.status).toBe("cancelled");
  });
});

describe("final status", () => {
  const step = (key: string, status: string) => ({ id: key, runId: "r", key, order: 0, status, attempts: 0, state: "{}", error: null, updatedAt: new Date() });
  it("succeeded, partial and failed", () => {
    expect(finalStatus("question_bank", [step("publish", "done")], { categories: { a: { status: "published" } } })).toBe("succeeded");
    expect(finalStatus("question_bank", [step("publish", "done")], { categories: { a: { status: "exists" } } })).toBe("succeeded");
    expect(finalStatus("question_bank", [step("publish", "done")], { categories: { a: { status: "empty" } } })).toBe("partial");
    expect(finalStatus("question_bank", [step("daily_quiz", "failed")], { categories: { a: { status: "published" } } })).toBe("partial");
    expect(finalStatus("question_bank", [step("publish", "failed")], { categories: { a: { status: "failed" } } })).toBe("failed");
    expect(finalStatus("guest_cleanup", [step("guest_cleanup", "failed")], {})).toBe("failed");
    expect(finalStatus("seed", [step("seed", "done"), step("publish", "done")], {})).toBe("succeeded");
  });
});
