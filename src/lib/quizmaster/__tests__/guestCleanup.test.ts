/** Port of quizmaster `tool/test_cleanup_guests.py`, plus the paged unit. */
import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  DEFAULT_DAYS,
  checkDays,
  cleanUsers,
  cleanupPage,
  emptyCounts,
  isStaleGuest,
  lastActiveMs,
  startCleanup,
  type GuestUser,
  type UserAdmin,
} from "../guestCleanup";

const NOW = 1_792_000_000_000; // ms
const daysAgo = (n: number) => NOW - n * DAY_MS;

function user(
  uid: string,
  o: { refreshed?: number; signedIn?: number; created?: number; providers?: unknown[]; email?: string; phone?: string } = {}
): GuestUser {
  return {
    uid,
    providerData: o.providers ?? [],
    email: o.email ?? null,
    phoneNumber: o.phone ?? null,
    createdMs: o.created ?? null,
    lastSignInMs: o.signedIn ?? null,
    lastRefreshMs: o.refreshed ?? null,
  };
}

class FakeDelete {
  calls: string[][] = [];
  constructor(private fail = 0) {}
  fn = async (uids: string[]) => {
    this.calls.push(uids);
    const failed = Math.min(this.fail, uids.length);
    this.fail -= failed;
    return { successCount: uids.length - failed, failureCount: failed };
  };
  get deleted() {
    return this.calls.flat();
  }
}

const run = (users: GuestUser[], del: FakeDelete, o: { days?: number; dryRun?: boolean } = {}) =>
  cleanUsers(users, del.fn, NOW, emptyCounts(), o);

describe("guest cleanup", () => {
  it("deletes guests inactive for over 30 days and keeps recent ones", async () => {
    const users = [
      user("old", { created: daysAgo(400), refreshed: daysAgo(31) }),
      user("recent", { created: daysAgo(400), refreshed: daysAgo(29) }),
      user("new", { created: daysAgo(1) }),
    ];
    const del = new FakeDelete();
    const counts = await run(users, del);
    expect(del.deleted).toEqual(["old"]);
    expect(counts).toEqual({ scanned: 3, guests: 3, stale: 1, deleted: 1, failed: 0 });
  });

  it("real accounts are never deleted, however old", async () => {
    const old = daysAgo(1000);
    const users = [
      user("google", { created: old, providers: [{}] }),
      user("email", { created: old, email: "a@b.in" }),
      user("phone", { created: old, phone: "+911234567890" }),
    ];
    const del = new FakeDelete();
    const counts = await run(users, del);
    expect(del.calls).toEqual([]);
    expect(counts.guests).toBe(0);
  });

  it.each([
    { created: daysAgo(10) },
    { created: daysAgo(400), signedIn: daysAgo(10) },
    { created: daysAgo(400), signedIn: daysAgo(300), refreshed: daysAgo(10) },
    // The newest wins, whichever field it is in.
    { created: daysAgo(400), signedIn: daysAgo(10), refreshed: daysAgo(300) },
  ])("the newest activity counts (%o)", (meta) => {
    expect(isStaleGuest(user("g", meta), NOW)).toBe(false);
  });

  it("a guest with no timestamps is skipped", () => {
    expect(lastActiveMs(user("g"))).toBe(0);
    expect(isStaleGuest(user("g"), NOW)).toBe(false);
  });

  it("a longer window keeps more", async () => {
    const users = [user("g", { created: daysAgo(45) })];
    const del = new FakeDelete();
    expect((await run(users, del, { days: 60 })).stale).toBe(0);
    expect((await run(users, del, { days: 30 })).stale).toBe(1);
  });

  it("a dry run deletes nothing", async () => {
    const users = [0, 1, 2].map((i) => user(`g${i}`, { created: daysAgo(100) }));
    const del = new FakeDelete();
    const counts = await run(users, del, { dryRun: true });
    expect(del.calls).toEqual([]);
    expect(counts.stale).toBe(3);
    expect(counts.deleted).toBe(0);
  });

  it("deletes in batches of 1000", async () => {
    const users = Array.from({ length: 2500 }, (_, i) => user(`g${i}`, { created: daysAgo(100) }));
    const del = new FakeDelete();
    const counts = await run(users, del);
    expect(del.calls.map((c) => c.length)).toEqual([1000, 1000, 500]);
    expect(counts.deleted).toBe(2500);
  });

  it("failures are counted", async () => {
    const users = [0, 1, 2, 3, 4].map((i) => user(`g${i}`, { created: daysAgo(100) }));
    const counts = await run(users, new FakeDelete(2));
    expect(counts.deleted).toBe(3);
    expect(counts.failed).toBe(2);
  });

  it("the default window is 30 days", () => {
    expect(DEFAULT_DAYS).toBe(30);
    expect(isStaleGuest(user("g", { created: daysAgo(31) }), NOW)).toBe(true);
    expect(isStaleGuest(user("g", { created: daysAgo(29) }), NOW)).toBe(false);
  });

  it("refuses fewer than 30 days (the server-side floor)", async () => {
    expect(() => checkDays(10)).toThrow(/at least 30/);
    expect(() => checkDays(29)).toThrow(/at least 30/);
    expect(() => startCleanup(10, true)).toThrow(/at least 30/);
    await expect(run([], new FakeDelete(), { days: 10 })).rejects.toThrow(/at least 30/);
    expect(checkDays(30)).toBe(30);
  });

  it("pages through Auth one listUsers page per unit, then reports", async () => {
    const pages: GuestUser[][] = [
      Array.from({ length: 1000 }, (_, i) => user(`a${i}`, { created: daysAgo(i % 2 ? 100 : 5) })),
      [user("b0", { created: daysAgo(200) }), user("b1", { created: daysAgo(200), email: "x@y.in" })],
    ];
    const del = new FakeDelete();
    const listed: Array<string | undefined> = [];
    const admin: UserAdmin = {
      async listUsers(max, token) {
        expect(max).toBe(1000);
        listed.push(token);
        const i = token ? Number(token) : 0;
        return { users: pages[i]!, pageToken: i + 1 < pages.length ? String(i + 1) : undefined };
      },
      deleteUsers: del.fn,
    };
    const logs: string[] = [];
    let state = startCleanup(30, false);
    state = await cleanupPage(admin, state, NOW, (l) => logs.push(l));
    expect(state.done).toBe(false);
    expect(state.counts).toEqual({ scanned: 1000, guests: 1000, stale: 500, deleted: 500, failed: 0 });
    state = await cleanupPage(admin, JSON.parse(JSON.stringify(state)), NOW, (l) => logs.push(l));
    expect(state.done).toBe(true);
    expect(listed).toEqual([undefined, "1"]);
    expect(state.counts).toEqual({ scanned: 1002, guests: 1001, stale: 501, deleted: 501, failed: 0 });
    expect(logs[logs.length - 1]).toContain("scanned 1002, guests 1001, stale 501, deleted 501, failed 0");
  });
});
