/**
 * The service and engine on the in-memory repo: the key check, when an
 * automatic run may start, resuming, retries and the leases.
 */
import { describe, expect, it } from "vitest";
import type { UserRecord } from "firebase-admin/auth";
import { BadRequest, Conflict, autoDue, createColorTapService } from "../cleanup";
import { RunNotFound, TICK_BUDGET_MS, TICK_LEASE_MS } from "../engine";
import { COLORTAP_PROJECT_ID, ColorTapNotConfigured, keyProblem, toGuestUser } from "../firebase";
import { DAY_MS, type GuestUser, type UserAdmin } from "../guestCleanup";
import { MemoryRunRepo, type ScheduleRow } from "../repo";

const NOW = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;
const guest = (uid: string, days: number): GuestUser => ({ uid, providerData: [], createdMs: NOW - days * DAY_MS });

class FakeUsers implements UserAdmin {
  deleted: string[] = [];
  lists = 0;
  failLists = 0;
  constructor(
    private pages: GuestUser[][] = [[guest("stale", 91), guest("recent", 89)]],
    private onList?: () => void
  ) {}
  listUsers = async (_max: number, token?: string) => {
    this.lists++;
    this.onList?.();
    if (this.failLists > 0) {
      this.failLists--;
      throw new Error("auth exploded");
    }
    const i = token ? Number(token) : 0;
    return { users: this.pages[i]!, pageToken: i + 1 < this.pages.length ? String(i + 1) : undefined };
  };
  deleteUsers = async (uids: string[]) => {
    this.deleted.push(...uids);
    return { successCount: uids.length, failureCount: 0 };
  };
}

function setup(schedule: Partial<ScheduleRow> = {}, o: { users?: FakeUsers; problem?: string; budgetMs?: number } = {}) {
  const clock = { t: NOW };
  const repo = new MemoryRunRepo(schedule);
  const users = o.users ?? new FakeUsers();
  const service = createColorTapService({
    repo,
    makeUsers: () => users,
    keyProblem: () => o.problem ?? null,
    clock: () => clock.t,
    budgetMs: o.budgetMs,
  });
  const finish = async (runId: string) => {
    for (let i = 0; i < 20; i++) {
      const res = await service.tickRun(runId);
      if (res.done) return res;
      clock.t += 1000;
    }
    throw new Error("run did not finish");
  };
  return { clock, repo, users, service, finish };
}

const key = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: "service_account",
    project_id: COLORTAP_PROJECT_ID,
    client_email: "a@b.iam.gserviceaccount.com",
    private_key: "SECRET-PRIVATE-KEY",
    ...over,
  });

describe("key check", () => {
  it("accepts a key for Color Tap's project", () => {
    expect(keyProblem(key())).toBeNull();
  });

  it("refuses another project's key, naming the project but not the secret", () => {
    const problem = keyProblem(key({ project_id: "quizmaster-3be48" }));
    expect(problem).toContain("quizmaster-3be48");
    expect(problem).not.toContain("SECRET-PRIVATE-KEY");
  });

  it("refuses a missing, broken or non-service-account key", () => {
    expect(keyProblem("")).toContain("Set COLORTAP_FIREBASE_SERVICE_ACCOUNT");
    expect(keyProblem("{not json")).toContain("not valid JSON");
    expect(keyProblem("null")).toContain("not a service-account key");
    expect(keyProblem(key({ type: "authorized_user" }))).toContain("not a service-account key");
    expect(keyProblem(key({ private_key: "" }))).toContain("not a service-account key");
  });
});

describe("Auth records", () => {
  it("reads the last refresh, which is what keeps an active guest", () => {
    const record = {
      uid: "g",
      providerData: [],
      metadata: {
        creationTime: "Tue, 03 Nov 2026 10:00:00 GMT",
        lastSignInTime: "Tue, 03 Nov 2026 10:00:00 GMT",
        lastRefreshTime: "Wed, 04 Nov 2026 10:00:00 GMT",
      },
    } as unknown as UserRecord;
    expect(toGuestUser(record)).toMatchObject({
      uid: "g",
      createdMs: Date.parse("2026-11-03T10:00:00Z"),
      lastRefreshMs: Date.parse("2026-11-04T10:00:00Z"),
    });
  });
});

describe("when an automatic run is due", () => {
  const row = (o: Partial<ScheduleRow>): ScheduleRow => ({
    id: 1,
    autoEnabled: true,
    days: 90,
    lastCleanupAt: null,
    lastAutoAt: null,
    updatedAt: new Date(NOW),
    ...o,
  });
  const now = new Date(NOW);

  it("never while automatic cleanup is off, which is how it starts", () => {
    expect(autoDue(row({ autoEnabled: false }), now)).toBe(false);
    expect(new MemoryRunRepo().schedule.autoEnabled).toBe(false);
  });

  it("at once when it has never run", () => {
    expect(autoDue(row({}), now)).toBe(true);
  });

  it("a day after the last real cleanup", () => {
    expect(autoDue(row({ lastCleanupAt: new Date(NOW - 23 * HOUR) }), now)).toBe(false);
    expect(autoDue(row({ lastCleanupAt: new Date(NOW - DAY_MS - 1) }), now)).toBe(true);
  });

  it("an hour after a failed attempt, not on the next refresh", () => {
    expect(autoDue(row({ lastAutoAt: new Date(NOW - 59 * 60_000) }), now)).toBe(false);
    expect(autoDue(row({ lastAutoAt: new Date(NOW - HOUR - 1) }), now)).toBe(true);
  });
});

describe("starting runs", () => {
  it("refuses an automatic run while it is off", async () => {
    const { service, repo } = setup();
    await expect(service.startScheduled()).rejects.toBeInstanceOf(Conflict);
    expect(await repo.listRuns(10)).toEqual([]);
  });

  it("refuses an automatic run that isn't due", async () => {
    const { service } = setup({ autoEnabled: true, lastCleanupAt: new Date(NOW - HOUR) });
    await expect(service.startScheduled()).rejects.toThrow("isn't due");
  });

  it("an automatic run really deletes, using the saved 90-day window", async () => {
    const { service, users, repo, finish } = setup({ autoEnabled: true });
    const { runId, created } = await service.startScheduled();
    expect(created).toBe(true);
    expect(repo.schedule.lastAutoAt).toEqual(new Date(NOW));
    expect((await finish(runId)).status).toBe("succeeded");
    expect(users.deleted).toEqual(["stale"]);
    expect(repo.schedule.lastCleanupAt).not.toBeNull();
    expect((await repo.getRun(runId))?.days).toBe(90);
  });

  it("a dry run deletes nothing and leaves the automatic clock alone", async () => {
    const { service, users, repo, finish } = setup();
    const { runId } = await service.startCleanup(90, true);
    const res = await finish(runId);
    expect(res.status).toBe("succeeded");
    expect(res.counts).toMatchObject({ scanned: 2, guests: 2, stale: 1, deleted: 0 });
    expect(users.deleted).toEqual([]);
    expect(repo.schedule.lastCleanupAt).toBeNull();
  });

  it("a real manual run moves the clock", async () => {
    const { service, repo, finish } = setup();
    const { runId } = await service.startCleanup(90, false);
    await finish(runId);
    expect(repo.schedule.lastCleanupAt).not.toBeNull();
  });

  it("refuses fewer than 30 days, for a run and for the saved setting", async () => {
    const { service, repo } = setup();
    await expect(service.startCleanup(29, true)).rejects.toBeInstanceOf(BadRequest);
    await expect(service.changeSchedule({ action: "days", days: 29 })).rejects.toBeInstanceOf(BadRequest);
    expect(repo.schedule.days).toBe(90);
  });

  it("refuses to start with a bad key, even for a dry run", async () => {
    const { service, repo } = setup({}, { problem: "key is for another project" });
    await expect(service.startCleanup(90, true)).rejects.toBeInstanceOf(ColorTapNotConfigured);
    expect(await repo.listRuns(10)).toEqual([]);
  });

  it("one run at a time: a live run answers 409 with its id", async () => {
    const { service } = setup();
    const { runId } = await service.startCleanup(90, true);
    await expect(service.startCleanup(90, true)).rejects.toMatchObject({ runId });
  });

  it("a run whose lease ran out is resumed, not started again", async () => {
    const { service, clock, repo } = setup();
    const { runId } = await service.startCleanup(90, true);
    clock.t += 11 * 60_000;
    expect(await service.startCleanup(90, true)).toEqual({ runId, created: false, resumed: true });
    expect((await repo.listRuns(10)).length).toBe(1);
  });

  it("drops runs older than 60 days when a new one starts", async () => {
    const { service, clock, repo, finish } = setup();
    const old = await service.startCleanup(90, true);
    await finish(old.runId);
    clock.t += 61 * DAY_MS;
    const fresh = await service.startCleanup(90, true);
    expect((await repo.listRuns(10)).map((r) => r.id)).toEqual([fresh.runId]);
  });
});

describe("ticks", () => {
  it("stops at the budget, saves its place and carries on in the next tick", async () => {
    const clock = { t: NOW };
    const pages = [[guest("a", 200)], [guest("b", 200)], [guest("c", 200)]];
    const users = new FakeUsers(pages, () => {
      clock.t += TICK_BUDGET_MS - 20_000; // the second page wouldn't leave enough time
    });
    const repo = new MemoryRunRepo();
    const service = createColorTapService({ repo, makeUsers: () => users, keyProblem: () => null, clock: () => clock.t });
    const { runId } = await service.startCleanup(90, false);

    const first = await service.tickRun(runId);
    expect(first).toMatchObject({ done: false, pages: 1 });
    expect(users.deleted).toEqual(["a"]);

    clock.t += 1000;
    await service.tickRun(runId);
    clock.t += 1000;
    const last = await service.tickRun(runId);
    expect(last).toMatchObject({ done: true, status: "succeeded", pages: 3 });
    expect(users.deleted).toEqual(["a", "b", "c"]);
  });

  it("saves about once a minute, not after every page, and checks for Cancel as rarely", async () => {
    const clock = { t: NOW };
    const pages = Array.from({ length: 20 }, (_, i) => [guest(`g${i}`, 200)]);
    const users = new FakeUsers(pages, () => {
      clock.t += 5_000; // 20 pages × 5 s = 100 s
    });
    const repo = new MemoryRunRepo();
    const service = createColorTapService({ repo, makeUsers: () => users, keyProblem: () => null, clock: () => clock.t });
    const { runId } = await service.startCleanup(90, false);
    let reads = 0;
    const getRun = repo.getRun.bind(repo);
    repo.getRun = async (id) => (reads++, getRun(id));
    const before = repo.commits;
    const r = await service.tickRun(runId);
    expect(r).toMatchObject({ done: true, status: "succeeded", pages: 20 });
    expect(users.deleted.length).toBe(20);
    expect(repo.commits - before).toBeLessThanOrEqual(3);
    expect(reads).toBeLessThanOrEqual(4); // start, a minute in, before finishing (+ the route's own)
    expect((await repo.logs(runId)).some((l) => l.message.includes("run finished: succeeded"))).toBe(true);
  });

  it("retries a failed page, and the run still succeeds", async () => {
    const { service, users, finish } = setup();
    users.failLists = 2;
    const { runId } = await service.startCleanup(90, false);
    expect((await finish(runId)).status).toBe("succeeded");
    expect(users.deleted).toEqual(["stale"]);
  });

  it("fails after three attempts and records why, without moving the clock", async () => {
    const { service, users, repo, finish } = setup();
    users.failLists = 3;
    const { runId } = await service.startCleanup(90, false);
    expect((await finish(runId)).status).toBe("failed");
    expect(users.lists).toBe(3);
    expect((await repo.getRun(runId))?.error).toContain("auth exploded");
    expect(repo.schedule.lastCleanupAt).toBeNull();
  });

  it("a key that goes bad mid-run fails at once instead of retrying", async () => {
    const repo = new MemoryRunRepo();
    let calls = 0;
    const service = createColorTapService({
      repo,
      makeUsers: () => {
        calls++;
        throw new ColorTapNotConfigured("no key");
      },
      keyProblem: () => null,
      clock: () => NOW,
    });
    const { runId } = await service.startCleanup(90, false);
    expect((await service.tickRun(runId)).status).toBe("failed");
    expect(calls).toBe(1);
  });

  it("a second tick waits while one is in flight, until its lease runs out", async () => {
    const { service, repo, clock, users } = setup();
    const { runId } = await service.startCleanup(90, false);
    await repo.acquireTick(runId, "other-tab", new Date(NOW), new Date(NOW + TICK_LEASE_MS), new Date(NOW + TICK_LEASE_MS));
    expect(await service.tickRun(runId)).toMatchObject({ busy: true, done: false });
    expect(users.lists).toBe(0);
    clock.t += TICK_LEASE_MS + 1;
    expect((await service.tickRun(runId)).done).toBe(true);
  });

  it("a cancelled run does no more work", async () => {
    const { service, users } = setup();
    const { runId } = await service.startCleanup(90, false);
    expect((await service.cancelRun(runId))?.status).toBe("cancelled");
    expect((await service.tickRun(runId)).status).toBe("cancelled");
    expect(users.lists).toBe(0);
    expect((await service.status()).active).toBeNull();
  });

  it("an unknown run is not found", async () => {
    const { service } = setup();
    await expect(service.tickRun("nope")).rejects.toBeInstanceOf(RunNotFound);
    expect(await service.runDetail("nope")).toBeNull();
    expect(await service.cancelRun("nope")).toBeNull();
  });
});

describe("the tab's status", () => {
  it("shows settings, the key problem and the runs, never the key", async () => {
    const { service, finish } = setup({ autoEnabled: true });
    const { runId } = await service.startCleanup(90, true);
    await finish(runId);
    const s = await service.status();
    expect(s.projectId).toBe(COLORTAP_PROJECT_ID);
    expect(s.schedule).toMatchObject({ autoEnabled: true, days: 90, due: true });
    expect(s.runs.map((r) => r.id)).toEqual([runId]);
    expect(s.runs[0]!.counts.stale).toBe(1);
    expect(JSON.stringify(s)).not.toContain("private_key");
  });
});
