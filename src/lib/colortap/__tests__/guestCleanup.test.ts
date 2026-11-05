/** Port of color_tap `tool/test_cleanup_guests.py`, plus the paged unit. */
import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  cleanupPage,
  isGuest,
  isStaleGuest,
  startState,
  type GuestUser,
  type UserAdmin,
} from "../guestCleanup";

const NOW = 1_800_000_000_000;
const ago = (days?: number) => (days === undefined ? null : NOW - days * DAY_MS);

function user(
  uid: string,
  o: { created?: number; signedIn?: number; refreshed?: number; email?: string; phone?: string; providers?: unknown[] } = {}
): GuestUser {
  return {
    uid,
    providerData: o.providers ?? [],
    email: o.email ?? null,
    phoneNumber: o.phone ?? null,
    createdMs: ago(o.created),
    lastSignInMs: ago(o.signedIn),
    lastRefreshMs: ago(o.refreshed),
  };
}

describe("stale guests", () => {
  it("an inactive guest is stale", () => {
    expect(isStaleGuest(user("g", { created: 200, signedIn: 200, refreshed: 120 }), NOW, 90)).toBe(true);
  });

  it("a recent token refresh keeps an old guest", () => {
    expect(isStaleGuest(user("g", { created: 400, signedIn: 400, refreshed: 1 }), NOW, 90)).toBe(false);
  });

  it("a new guest is kept", () => {
    expect(isStaleGuest(user("g", { created: 5 }), NOW, 90)).toBe(false);
  });

  it("missing timestamps fall back to creation", () => {
    expect(isStaleGuest(user("g", { created: 91 }), NOW, 90)).toBe(true);
    expect(isStaleGuest(user("g", { created: 89 }), NOW, 90)).toBe(false);
  });

  it("a guest with no timestamps at all is kept", () => {
    expect(isStaleGuest(user("g"), NOW, 90)).toBe(false);
  });

  it("registered accounts are never guests", () => {
    const old = { created: 999, signedIn: 999, refreshed: 999 };
    for (const u of [
      user("e", { ...old, email: "a@b.co" }),
      user("p", { ...old, phone: "+911234567890" }),
      user("google", { ...old, providers: [{ providerId: "google.com" }] }),
    ]) {
      expect(isGuest(u)).toBe(false);
      expect(isStaleGuest(u, NOW, 90)).toBe(false);
    }
  });
});

describe("one page", () => {
  const users = [
    user("stale1", { created: 300 }),
    user("active", { created: 300, refreshed: 2 }),
    user("reg", { created: 300, email: "a@b.co" }),
    user("stale2", { created: 100, refreshed: 95 }),
  ];

  function admin(failures = 0, token?: string) {
    const deleted: string[][] = [];
    const fake: UserAdmin = {
      listUsers: async () => ({ users, pageToken: token }),
      deleteUsers: async (uids) => {
        deleted.push(uids);
        return { successCount: uids.length - failures, failureCount: failures };
      },
    };
    return { fake, deleted };
  }

  it("deletes only stale guests", async () => {
    const { fake, deleted } = admin();
    const s = await cleanupPage(fake, startState(), { days: 90, dryRun: false, nowMs: NOW });
    expect(deleted).toEqual([["stale1", "stale2"]]);
    expect(s.counts).toEqual({ scanned: 4, guests: 3, stale: 2, deleted: 2, failed: 0 });
    expect(s.done).toBe(true);
  });

  it("a dry run deletes nothing", async () => {
    const { fake, deleted } = admin();
    const s = await cleanupPage(fake, startState(), { days: 90, dryRun: true, nowMs: NOW });
    expect(deleted).toEqual([]);
    expect(s.counts).toMatchObject({ stale: 2, deleted: 0 });
  });

  it("counts failures and warns about them", async () => {
    const { fake } = admin(1);
    const lines: string[] = [];
    const s = await cleanupPage(fake, startState(), { days: 90, dryRun: false, nowMs: NOW, log: (l) => lines.push(l) });
    expect(s.counts).toMatchObject({ deleted: 1, failed: 1 });
    expect(lines.some((l) => l.startsWith("warning"))).toBe(true);
  });

  it("carries on from the page token and adds to the counts", async () => {
    const { fake } = admin(0, "next");
    const first = await cleanupPage(fake, startState(), { days: 90, dryRun: true, nowMs: NOW });
    expect(first).toMatchObject({ done: false, pageToken: "next", pages: 1 });
    const second = await cleanupPage(fake, first, { days: 90, dryRun: true, nowMs: NOW });
    expect(second.counts.scanned).toBe(8);
    expect(second.pages).toBe(2);
  });

  it("never runs with fewer than 30 days", async () => {
    const { fake, deleted } = admin();
    await expect(cleanupPage(fake, startState(), { days: 29, dryRun: false, nowMs: NOW })).rejects.toThrow("at least 30");
    expect(deleted).toEqual([]);
  });
});
