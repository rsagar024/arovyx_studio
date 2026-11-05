import { describe, expect, it } from "vitest";
import type { Status as ColorTapStatus } from "../../colortap/api";
import type { Status as QuizStatus } from "../../quizmaster/api";
import { colorTapStatus, quizMasterStatus } from "../status";

const NOW = "2026-11-05T10:00:00.000Z";
const LATER = "2026-11-05T20:00:00.000Z";
const EARLIER = "2026-11-05T01:00:00.000Z";

function quiz(overrides: {
  env?: Record<string, boolean>;
  modelsOk?: boolean;
  schedule?: Partial<QuizStatus["schedule"]>;
  activeRuns?: unknown[];
  lastRun?: unknown;
} = {}): QuizStatus {
  return {
    serverNow: NOW,
    schedule: { intervalHours: 12, nextRunAt: LATER, nextRunIst: null, paused: false, overdue: false, lastCleanupAt: null, ...overrides.schedule },
    env: {
      QUIZMASTER_FIREBASE_SERVICE_ACCOUNT: true,
      NVIDIA_NIM_API_KEY: true,
      ...overrides.env,
      models: { generate: "a", verify: "b", translate: "c" },
      modelsOk: overrides.modelsOk ?? true,
    },
    active: null,
    activeRuns: overrides.activeRuns ?? [],
    lastRun: overrides.lastRun ?? null,
    runs: [],
    categories: [],
  } as unknown as QuizStatus;
}

function colorTap(overrides: {
  keyProblem?: string;
  active?: unknown;
  schedule?: Partial<ColorTapStatus["schedule"]>;
  runs?: unknown[];
} = {}): ColorTapStatus {
  return {
    serverNow: NOW,
    projectId: "p",
    keyProblem: overrides.keyProblem ?? null,
    schedule: { autoEnabled: true, days: 90, lastCleanupAt: null, nextAutoAt: LATER, due: false, ...overrides.schedule },
    active: overrides.active ?? null,
    runs: overrides.runs ?? [],
  } as unknown as ColorTapStatus;
}

describe("quizMasterStatus", () => {
  it.each([
    ["the service account is missing", { env: { QUIZMASTER_FIREBASE_SERVICE_ACCOUNT: false } }],
    ["the NIM key is missing", { env: { NVIDIA_NIM_API_KEY: false } }],
    ["the models are from one family", { modelsOk: false }],
  ])("needs attention when %s", (_name, overrides) => {
    expect(quizMasterStatus(quiz(overrides))).toMatchObject({ tone: "attention", label: "Needs attention" });
  });

  it("ignores a missing optional setting", () => {
    expect(quizMasterStatus(quiz({ env: { NVIDIA_NIM_API_KEY_2: false } })).tone).toBe("scheduled");
  });

  it("is running while any run is active", () => {
    expect(quizMasterStatus(quiz({ activeRuns: [{}] }))).toMatchObject({ tone: "running", label: "Running" });
  });

  it("is paused even when the next run has passed", () => {
    expect(quizMasterStatus(quiz({ schedule: { paused: true, nextRunAt: EARLIER } }))).toMatchObject({
      tone: "idle",
      label: "Paused",
    });
  });

  it.each([
    ["has passed", EARLIER],
    ["is not set", null],
  ])("is due when the next run %s", (_name, nextRunAt) => {
    expect(quizMasterStatus(quiz({ schedule: { nextRunAt } }))).toMatchObject({ tone: "due", label: "Due now" });
  });

  it("shows when the next run is", () => {
    const { tone, label } = quizMasterStatus(quiz());
    expect(tone).toBe("scheduled");
    expect(label).toMatch(/^Next run .*IST$/);
  });

  it("reports the last run, falling back to its start time", () => {
    const lastRun = { status: "failed", startedAt: EARLIER, finishedAt: null };
    expect(quizMasterStatus(quiz({ lastRun })).lastRun).toEqual({ status: "failed", at: EARLIER });
    expect(quizMasterStatus(quiz()).lastRun).toBeNull();
  });
});

describe("colorTapStatus", () => {
  it("needs attention when the key has a problem", () => {
    expect(colorTapStatus(colorTap({ keyProblem: "No key." }))).toMatchObject({
      tone: "attention",
      label: "Needs attention",
    });
  });

  it("is running while a run is active", () => {
    expect(colorTapStatus(colorTap({ active: {} }))).toMatchObject({ tone: "running", label: "Running" });
  });

  it("is off when automatic cleanup is off", () => {
    expect(colorTapStatus(colorTap({ schedule: { autoEnabled: false } }))).toMatchObject({
      tone: "idle",
      label: "Auto off",
    });
  });

  it("is due when the schedule says so", () => {
    expect(colorTapStatus(colorTap({ schedule: { due: true } }))).toMatchObject({ tone: "due", label: "Due now" });
  });

  it("shows when the next run is", () => {
    const { tone, label } = colorTapStatus(colorTap());
    expect(tone).toBe("scheduled");
    expect(label).toMatch(/^Next run .*IST$/);
  });

  it("reports the newest finished run, skipping one still running", () => {
    const runs = [
      { status: "running", startedAt: LATER, finishedAt: null },
      { status: "succeeded", startedAt: EARLIER, finishedAt: NOW },
    ];
    expect(colorTapStatus(colorTap({ runs })).lastRun).toEqual({ status: "succeeded", at: NOW });
    expect(colorTapStatus(colorTap()).lastRun).toBeNull();
  });
});
