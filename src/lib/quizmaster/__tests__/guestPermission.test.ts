/** The Quiz Master key can lack the Firebase Auth role: say so once, clearly. */
import { describe, expect, it } from "vitest";
import { createRun, tick, type EngineDeps, type RunOptions } from "../engine";
import { authError, FirebaseNoPermission } from "../firebase";
import * as qb from "../questionBank";
import { MemoryRunRepo } from "../repo";
import { MemoryDocStore } from "../writes";
import { FakeMessenger, FakeNim, MODELS } from "./fakeNim";

const OPTIONS: RunOptions = {
  date: "2026-10-16",
  force: false,
  dryRun: true,
  categories: [],
  mode: "daily",
  scheduled: false,
  days: 30,
};

function engine(listUsers: () => Promise<never>) {
  const repo = new MemoryRunRepo();
  const deps: EngineDeps = {
    repo,
    clock: () => 1_800_000_000_000,
    makeJobs: () => ({
      bank: new qb.MemoryBankStore(),
      docs: new MemoryDocStore(() => new Date(), () => false),
      messenger: new FakeMessenger() as never,
      nim: new FakeNim(),
      models: MODELS,
      seed: {},
      users: { listUsers, deleteUsers: async () => ({ successCount: 0, failureCount: 0 }) },
      remoteConfig: async () => null,
    }),
  };
  return { repo, deps };
}

describe("authError", () => {
  it("names the role for the SDK's permission error", () => {
    const err = authError(Object.assign(new Error("insufficient permission"), { code: "auth/insufficient-permission" }));
    expect(err).toBeInstanceOf(FirebaseNoPermission);
    expect((err as Error).message).toContain("roles/firebaseauth.admin");
  });

  it("leaves other errors alone", () => {
    const other = Object.assign(new Error("down"), { code: "auth/internal-error" });
    expect(authError(other)).toBe(other);
    expect(authError(null)).toBeNull();
  });
});

describe("guest cleanup without the Auth role", () => {
  it("fails once with the fix in the step's error, not after 3 tries", async () => {
    let calls = 0;
    const { repo, deps } = engine(async () => {
      calls++;
      throw new FirebaseNoPermission();
    });
    const { run } = await createRun(deps, { kind: "guest_cleanup", trigger: "manual", slot: "", options: OPTIONS });
    const result = await tick(deps, run.id);
    expect(result.status).toBe("failed");
    expect(calls).toBe(1);
    const [step] = await repo.steps(run.id);
    expect(step!.status).toBe("failed");
    expect(step!.error).toContain("Firebase Authentication Admin");
  });

  it("still retries an error that may pass", async () => {
    let calls = 0;
    const { deps } = engine(async () => {
      calls++;
      throw new Error("network blip");
    });
    const { run } = await createRun(deps, { kind: "guest_cleanup", trigger: "manual", slot: "", options: OPTIONS });
    await tick(deps, run.id);
    expect(calls).toBe(3);
  });
});
