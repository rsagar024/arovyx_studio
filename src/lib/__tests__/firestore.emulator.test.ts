/**
 * The Firestore repos and store against the local emulator: the lease races
 * that the in-memory repos can't exercise. Skipped unless the emulator runs:
 *
 *   npx firebase-tools emulators:exec --only firestore --project demo-arovyx "npx vitest run firestore.emulator"
 */
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const d = enabled ? describe : describe.skip;

async function clear() {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const project = process.env.GCLOUD_PROJECT || "demo-arovyx";
  await fetch(`http://${host}/emulator/v1/projects/${project}/databases/(default)/documents`, { method: "DELETE" });
}

const now = () => new Date();
const later = (ms: number) => new Date(Date.now() + ms);

d("Quiz Master FirestoreRunRepo", () => {
  beforeEach(clear);

  it("creates one run per kind, even when two tabs start at once", async () => {
    const { FirestoreRunRepo } = await import("../quizmaster/repo");
    const repo = new FirestoreRunRepo();
    const data = { kind: "question_bank", trigger: "manual", slot: "am", options: "{}" };
    const steps = [{ key: "science:prepare", order: 0 }, { key: "publish", order: 1 }];
    const [a, b] = await Promise.all([
      repo.createRunIfFree(data, steps, now(), later(600_000)),
      repo.createRunIfFree(data, steps, now(), later(600_000)),
    ]);
    expect([a.created, b.created].filter(Boolean)).toHaveLength(1);
    expect(a.run.id).toBe(b.run.id);
    expect((await repo.steps(a.run.id)).map((s) => s.key)).toEqual(["science:prepare", "publish"]);
    // a different kind isn't blocked
    const other = await repo.createRunIfFree({ ...data, kind: "guest_cleanup" }, [], now(), later(600_000));
    expect(other.created).toBe(true);
  });

  it("lets only one tick hold the lease, and only the holder release it", async () => {
    const { FirestoreRunRepo } = await import("../quizmaster/repo");
    const repo = new FirestoreRunRepo();
    const { run } = await repo.createRunIfFree(
      { kind: "seed", trigger: "manual", slot: "", options: "{}" }, [], now(), later(600_000)
    );
    const wins = await Promise.all(
      ["t1", "t2", "t3"].map((t) => repo.acquireTick(run.id, t, now(), later(240_000), later(600_000)))
    );
    expect(wins.filter(Boolean)).toHaveLength(1);
    const holder = ["t1", "t2", "t3"][wins.indexOf(true)]!;
    await repo.releaseTick(run.id, "not-the-holder");
    expect((await repo.getRun(run.id))!.tickToken).toBe(holder);
    await repo.releaseTick(run.id, holder);
    expect((await repo.getRun(run.id))!.tickToken).toBeNull();
    expect(await repo.acquireTick(run.id, "t4", now(), later(240_000), later(600_000))).toBe(true);
  });

  it("lets three lanes save to one run at once without a lock stall", async () => {
    const { FirestoreRunRepo } = await import("../quizmaster/repo");
    const repo = new FirestoreRunRepo();
    const { run } = await repo.createRunIfFree(
      { kind: "seed", trigger: "manual", slot: "", options: "{}" }, [], now(), later(600_000)
    );
    expect(await repo.acquireTick(run.id, "tok", now(), later(240_000), later(600_000))).toBe(true);
    const started = Date.now();
    await Promise.all(
      [1, 2, 3].flatMap((n) =>
        Array.from({ length: 4 }, (_, i) => [
          repo.updateRun(run.id, { summary: JSON.stringify({ lane: n, i }) }),
          repo.renewLock(run.id, "tok", later(600_000 + n * 1000 + i)),
          repo.addLogs(run.id, [{ at: new Date(), level: "info", message: `lane ${n} unit ${i}` }]),
        ]).flat()
      )
    );
    expect(Date.now() - started).toBeLessThan(10_000);
    expect((await repo.logs(run.id)).length).toBe(12);
    await repo.releaseTick(run.id, "tok");
    expect((await repo.getRun(run.id))!.tickToken).toBeNull();
  });

  it("keeps steps idempotent, logs in order, and prunes finished runs with their children", async () => {
    const { FirestoreRunRepo } = await import("../quizmaster/repo");
    const repo = new FirestoreRunRepo();
    const { run } = await repo.createRunIfFree(
      { kind: "seed", trigger: "manual", slot: "", options: "{}" }, [], new Date(Date.now() - 10 * 86_400_000), later(1)
    );
    const s1 = await repo.addStep(run.id, { key: "a:b/c", order: 0 });
    const s2 = await repo.addStep(run.id, { key: "a:b/c", order: 5 });
    expect(s2.id).toBe(s1.id);
    await repo.updateStep(s1.id, { status: "done", attempts: 1 });
    expect((await repo.steps(run.id))[0]).toMatchObject({ key: "a:b/c", status: "done", attempts: 1, order: 0 });

    const t = new Date();
    await repo.addLogs(run.id, [
      { at: t, level: "info", message: "one" },
      { at: t, level: "info", message: "two" },
      { at: new Date(t.getTime() + 5), level: "warn", message: "three" },
    ]);
    expect((await repo.logs(run.id)).map((l) => l.message)).toEqual(["one", "two", "three"]);
    expect((await repo.logs(run.id, { after: t })).map((l) => l.message)).toEqual(["three"]);

    expect(await repo.pruneBefore(new Date())).toBe(0); // still running
    await repo.updateRun(run.id, { status: "succeeded", finishedAt: new Date() });
    expect(await repo.pruneBefore(new Date())).toBe(1);
    expect(await repo.getRun(run.id)).toBeNull();
    expect(await repo.steps(run.id)).toEqual([]);
    expect(await repo.logs(run.id)).toEqual([]);
  });
});

d("Color Tap FirestoreRunRepo", () => {
  beforeEach(clear);

  it("creates the schedule with defaults, and one run at a time", async () => {
    const { FirestoreRunRepo } = await import("../colortap/repo");
    const repo = new FirestoreRunRepo();
    expect(await repo.getSchedule()).toMatchObject({ id: 1, autoEnabled: false, days: 90, lastCleanupAt: null });
    expect(await repo.updateSchedule({ autoEnabled: true })).toMatchObject({ autoEnabled: true, days: 90 });
    const data = { trigger: "manual", days: 90, dryRun: true, state: "{}" };
    const [a, b] = await Promise.all([
      repo.createRunIfFree(data, now(), later(600_000)),
      repo.createRunIfFree(data, now(), later(600_000)),
    ]);
    expect([a.created, b.created].filter(Boolean)).toHaveLength(1);
    expect((await repo.activeRun())!.id).toBe(a.run.id);
  });
});

d("site store", () => {
  beforeEach(clear);

  it("keeps slugs unique, and round-trips projects, messages and settings", async () => {
    const store = await import("../store");
    const base = { title: "T", shortDescription: "s", sourceUrl: "https://x.dev" };
    const p = await store.createProject({ ...base, slug: "same" });
    // ids must pass the cuid checks on project ids (Hero / Featured pickers)
    expect(z.string().cuid().safeParse(p.id).success).toBe(true);
    await expect(store.createProject({ ...base, slug: "same" })).rejects.toBeInstanceOf(store.SlugTaken);
    const q = await store.createProject({ ...base, slug: "other", isPublished: false });
    await expect(store.updateProject(q.id, { slug: "same" })).rejects.toBeInstanceOf(store.SlugTaken);
    expect((await store.updateProject(p.id, { title: "New" })).title).toBe("New");
    expect((await store.getProjectBySlugRow("same"))!.createdAt).toBeInstanceOf(Date);
    expect((await store.listProjects({ publishedOnly: true })).map((x) => x.slug)).toEqual(["same"]);

    const m = await store.createMessage({ name: "A", email: "a@x.dev", subject: "s", message: "m" });
    expect(await store.countUnreadMessages()).toBe(1);
    await store.updateMessage(m.id, { isRead: true });
    expect(await store.countUnreadMessages()).toBe(0);
    expect(await store.deleteMessages([m.id, "missing"])).toBe(1);

    expect(await store.readSiteConfig()).toBeNull();
    expect((await store.saveSiteConfig({ siteName: "X" })).siteName).toBe("X");
    expect((await store.readSiteConfig())!.tagline).toBe(store.SITE_CONFIG_DEFAULTS.tagline);

    await store.createAiLog({ url: "u", action: "generate", success: true, error: null, model: null });
    await store.createAiLog({ url: "u", action: "generate", success: false, error: "e", model: null });
    expect(await store.aiLogCounts(new Date(Date.now() - 60_000))).toEqual({ success: 1, failure: 1 });
  });
});
