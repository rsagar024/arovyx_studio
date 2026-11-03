/** Port of quizmaster `automation/tests/test_notify.py`. */
import { describe, expect, it } from "vitest";
import { notificationTemplates, type Lang } from "../assets";
import {
  Notifier,
  SendFailed,
  TOPICS,
  checkNotification,
  festival,
  leaks,
  type QuestionDoc,
  type RemoteConfigParameters,
} from "../dailyNotify";
import * as ist from "../ist";
import { DryRunDocStore, MemoryDocStore } from "../writes";
import { FakeMessenger, FakeNim, MODELS } from "./fakeNim";
import { CATEGORY, DATE, MORNING, makeJob } from "./dailyFixtures";

const TEMPLATES = notificationTemplates();
const GOOD = {
  en: { title: "🧠 Quiz time is LIVE!", body: "10 fresh questions and 100 coins up for grabs 🪙" },
  hi: { title: "🧠 आज का क्विज़ आ गया!", body: "आज के 10 सवाल, 100 सिक्के जीतने का मौका 🪙" },
  "hi-Latn": { title: "🧠 Aaj ka Quiz aa gaya!", body: "Aaj ke 10 sawaal, 100 coins jeetne ka mauka 🪙" },
};
const ANSWERS: Record<Lang, string> = { en: "Lord's", hi: "लॉर्ड्स", "hi-Latn": "Lord's" };
const LANGS = Object.keys(TOPICS) as Lang[];

function questionDocs(): QuestionDoc[] {
  return LANGS.map((lang) => ({
    groupId: "g1",
    category: CATEGORY,
    language: lang,
    difficulty: "easy",
    subcategory: "world_cup",
    questionText: "",
    options: ["Eden Gardens", ANSWERS[lang], "Wankhede", "MCG"],
    correctIndex: 1,
  }));
}

function setup(reply: unknown = GOOD, o: { now?: Date; fail?: string[]; force?: boolean; dryRun?: boolean } = {}) {
  const now = o.now ?? MORNING;
  const nim = new FakeNim();
  nim.notifyReply = reply instanceof Error ? reply : JSON.stringify(reply);
  const store = new MemoryDocStore(() => now);
  store.docs.set(`daily_challenges/${DATE}`, { category: CATEGORY, groupIds: ["g1"] });
  const messenger = new FakeMessenger(new Set(o.fail ?? []));
  const logs: string[] = [];
  const notifier = new Notifier({
    nim,
    models: MODELS,
    messenger,
    commit: (w) => store.commit(w),
    now,
    force: o.force,
    dryRun: o.dryRun,
    log: (l) => logs.push(l),
  });
  return { notifier, nim, store, messenger, logs };
}

const run = async (notifier: Notifier, store: MemoryDocStore) =>
  notifier.run(DATE, store.docs.get(`daily_challenges/${DATE}`)!, questionDocs());

function template(lang: Lang): [string, string] {
  const options = TEMPLATES.templates[lang];
  const t = options[ist.dayNumber(ist.fromKey(DATE)) % options.length]!;
  const label = TEMPLATES.categories[CATEGORY]![lang];
  return [t.title.replaceAll("{category}", label), t.body.replaceAll("{category}", label)];
}

const challenge = (store: MemoryDocStore) => store.docs.get(`daily_challenges/${DATE}`)! as Record<string, any>;

describe("daily quiz notify", () => {
  it("one push per language topic, then recorded", async () => {
    const { notifier, nim, store, messenger } = setup();
    await run(notifier, store);
    expect(messenger.sent.map((m) => m.topic)).toEqual(Object.values(TOPICS));
    messenger.sent.forEach((m, i) => {
      const lang = LANGS[i]!;
      expect([m.title, m.body]).toEqual([GOOD[lang].title, GOOD[lang].body]);
      expect(m.data).toEqual({ type: "daily_quiz", date: DATE, route: "/daily-challenge" });
      expect(m.channel).toBe("daily_quiz");
      expect(m.tag).toBe(`daily_quiz_${DATE}`);
      expect(m.ttl).toBe(17 * 3600); // until midnight IST
    });
    const doc = challenge(store);
    expect(doc.notifiedAt).toEqual(MORNING);
    expect(doc.groupIds).toEqual(["g1"]); // the merge keeps the rest of the doc
    for (const lang of LANGS) {
      const record = doc.notification[lang];
      expect(record.origin).toBe("ai");
      expect(record.sentAt).toEqual(MORNING);
      expect(record.title).toBe(GOOD[lang].title);
      expect(record.messageId.startsWith("projects/x/messages/")).toBe(true);
    }
    const payload = nim.notifyPayloads[0] as Record<string, any>;
    expect(payload.category.hi).toBeTruthy();
    expect(payload.reward_coins).toBe(100);
    expect(payload.questions).toBe(1);
    expect(payload.difficulty).toEqual({ easy: 1 });
    expect(payload.theme).toContain("world cup");
    expect(JSON.stringify(payload)).not.toContain(ANSWERS.en); // the writer never sees the answers
  });

  const cases: Array<[string, Lang, Record<string, unknown>]> = [
    ["long title", "en", { title: "🧠 This title is far too long for a phone screen" }],
    ["long body", "en", { body: "x".repeat(121) + " 🪙" }],
    ["hi not Devanagari", "hi", { body: "Aaj ke 10 sawaal, 100 coins jeetne ka mauka 🪙" }],
    ["hi-Latn Devanagari", "hi-Latn", { body: "आज के 10 सवाल 🪙" }],
    ["url", "en", { body: "Play now at quizmaster.in 🪙" }],
    ["no emoji", "en", { title: "Quiz time is LIVE!", body: "10 questions, 100 coins" }],
    ["4 emojis", "en", { body: "10 questions 🪙🎯🔥" }],
    ["en answer leak", "en", { body: "Was the 1983 final at Lord's? Find out 🪙" }],
    ["hi answer leak", "hi", { body: "क्या फाइनल लॉर्ड्स में था? खेलिए 🪙" }],
    ["missing title", "hi-Latn", { title: null }],
  ];
  it.each(cases)("a failing language falls back to a template: %s", async (_name, lang, patch) => {
    const reply = JSON.parse(JSON.stringify(GOOD));
    Object.assign(reply[lang], patch);
    const { notifier, store, messenger, logs } = setup(reply);
    await run(notifier, store);
    const sent = Object.fromEntries(messenger.sent.map((m) => [m.topic, m]));
    const record = challenge(store).notification;
    expect(record[lang].origin).toBe("template");
    expect([sent[TOPICS[lang]]!.title, sent[TOPICS[lang]]!.body]).toEqual(template(lang));
    for (const other of LANGS.filter((l) => l !== lang)) expect(record[other].origin).toBe("ai");
    expect(logs.some((l) => l.includes("rejected"))).toBe(true);
  });

  it("templates everywhere when the model fails", async () => {
    const { notifier, store, messenger } = setup(new Error("NIM down"));
    await run(notifier, store);
    expect(messenger.sent.map((m) => [m.title, m.body])).toEqual(LANGS.map(template));
    expect(challenge(store).notifiedAt).toEqual(MORNING);
  });

  it("nothing is sent twice", async () => {
    const { notifier, store, messenger, logs } = setup();
    await run(notifier, store);
    await run(notifier, store);
    expect(messenger.sent.length).toBe(3);
    expect(logs[logs.length - 1]).toContain("already notified");
  });

  it("no push after noon unless forced", async () => {
    const noon = ist.atTime(MORNING, 12);
    let s = setup(GOOD, { now: noon });
    await run(s.notifier, s.store);
    expect(s.messenger.sent).toEqual([]);
    expect("notifiedAt" in challenge(s.store)).toBe(false);
    s = setup(GOOD, { now: noon, force: true });
    await run(s.notifier, s.store);
    expect(s.messenger.sent.length).toBe(3);
    expect(s.messenger.sent[0]!.ttl).toBe(12 * 3600);
  });

  it("a quiz for another day is not announced today", async () => {
    const { notifier, store, messenger, logs } = setup(GOOD, { now: new Date(MORNING.getTime() - 86_400_000) });
    await run(notifier, store);
    expect(messenger.sent).toEqual([]);
    expect(logs[logs.length - 1]).toContain("isn't today");
  });

  it("a failed topic is retried alone by the next run", async () => {
    const { notifier, store, messenger } = setup(GOOD, { fail: ["new_quiz_hi"] });
    await expect(run(notifier, store)).rejects.toBeInstanceOf(SendFailed);
    const doc = challenge(store);
    expect(new Set(Object.keys(doc.notification))).toEqual(new Set(["en", "hi-Latn"]));
    expect("notifiedAt" in doc).toBe(false);
    messenger.fail.clear();
    await run(notifier, store);
    expect(messenger.sent.map((m) => m.topic)).toEqual(["new_quiz_en", "new_quiz_hi_latn", "new_quiz_hi"]);
    expect(challenge(store).notifiedAt).toEqual(MORNING);
  });

  it("leaks", () => {
    expect(leaks("Was it at Lord's?", ["Lord's"])).toEqual(["Lord's"]);
    expect(leaks("was it at LORD'S", ["Lord's"])).toEqual(["Lord's"]);
    expect(leaks("Indiana Jones night", ["India"])).toEqual([]);
    expect(leaks("भारतीय संस्कृति क्विज़", ["भारत"])).toEqual([]); // a vowel sign continues the word
    expect(leaks("भारत की बारी", ["भारत"])).toEqual(["भारत"]);
    expect(leaks("10 questions, 100 coins", ["10", "100"])).toEqual([]); // expected numbers
    expect(leaks("Since 1983", ["1983"])).toEqual(["1983"]);
  });

  it("check_notification needs both fields", () => {
    expect(checkNotification("en", null, [])).toEqual(["missing"]);
    expect(checkNotification("en", { title: "Hi 🧠" }, [])).toEqual(["empty body"]);
    expect(checkNotification("en", GOOD.en, [])).toEqual([]);
  });

  it("festival hint (from the live Remote Config parameters)", () => {
    const params = (theme: string, until: string): RemoteConfigParameters => ({
      festival_theme: { defaultValue: { value: theme } },
      festival_theme_until: { defaultValue: { value: until } },
    });
    expect(festival(MORNING, params("diwali", "2026-11-10T23:59:00+05:30"))).toBe("diwali");
    expect(festival(MORNING, params("ganesh_chaturthi", ""))).toBe("ganesh chaturthi");
    expect(festival(MORNING, params("diwali", "2026-10-01T00:00:00+05:30"))).toBeNull();
    expect(festival(MORNING, params("default", ""))).toBeNull();
    expect(festival(MORNING, null)).toBeNull(); // Python: a missing template file
    expect(festival(MORNING, params("diwali", "2026-11-10T23:59:00"))).toBeNull(); // no UTC offset
  });

  it("the festival hint reaches the writer", async () => {
    const nim = new FakeNim();
    nim.notifyReply = JSON.stringify(GOOD);
    const store = new MemoryDocStore(() => MORNING);
    store.docs.set(`daily_challenges/${DATE}`, { category: CATEGORY, groupIds: ["g1"] });
    const notifier = new Notifier({
      nim,
      models: MODELS,
      messenger: new FakeMessenger(),
      commit: (w) => store.commit(w),
      now: MORNING,
      remoteConfig: async () => ({ festival_theme: { defaultValue: { value: "diwali" } } }),
    });
    await run(notifier, store);
    expect((nim.notifyPayloads[0] as { theme: string[] }).theme).toContain("festival: diwali");
  });
});

/* --- Wired into the daily job --- */

async function jobWithNotifier(nim: FakeNim, docs: MemoryDocStore | DryRunDocStore, o: { dryRun?: boolean; fail?: string[] } = {}) {
  nim.notifyReply = JSON.stringify(GOOD);
  const messenger = new FakeMessenger(new Set(o.fail ?? []));
  const notifier = new Notifier({ nim, models: MODELS, messenger, commit: (w) => docs.commit(w), now: MORNING, dryRun: o.dryRun });
  const { job } = await makeJob({ docs, notify: (date, c, d) => notifier.run(date, c, d) });
  return { job, messenger };
}

describe("daily quiz job with notify", () => {
  it("the job notifies after publishing, and never twice", async () => {
    const nim = new FakeNim();
    const store = new MemoryDocStore(() => MORNING);
    const { job, messenger } = await jobWithNotifier(nim, store);
    expect(await job.run(DATE)).toBe("published");
    expect(messenger.sent.length).toBe(3);
    expect(challenge(store).notifiedAt).toEqual(MORNING);
    // The 10 correct options in each language were checked against.
    expect((nim.notifyPayloads[0] as { questions: number }).questions).toBe(10);
    const again = await jobWithNotifier(nim, store);
    expect(await again.job.run(DATE)).toBe("exists");
    expect(again.messenger.sent).toEqual([]);
  });

  it("the backup run sends a push the main run missed", async () => {
    const nim = new FakeNim();
    const store = new MemoryDocStore(() => MORNING);
    const first = await jobWithNotifier(nim, store, { fail: Object.values(TOPICS) });
    expect(await first.job.run(DATE)).toBe("notify_failed");
    expect("notifiedAt" in challenge(store)).toBe(false);
    const backup = await jobWithNotifier(nim, store);
    expect(await backup.job.run(DATE)).toBe("exists");
    expect(backup.messenger.sent.length).toBe(3);
    expect(challenge(store).notifiedAt).toEqual(MORNING);
  });

  it("a dry run validates the pushes and writes nothing", async () => {
    const nim = new FakeNim();
    const store = new MemoryDocStore(() => MORNING);
    const dry = new DryRunDocStore(store, () => {});
    const { job, messenger } = await jobWithNotifier(nim, dry, { dryRun: true });
    expect(await job.run(DATE)).toBe("published");
    expect(store.docs.size).toBe(0);
    expect(messenger.dryRuns).toEqual([true, true, true]);
    const paths = dry.writes.filter(([op]) => op === "merge").map(([, path]) => path);
    expect(paths.filter((p) => p === `daily_challenges/${DATE}`).length).toBe(4); // 3 languages + notifiedAt
  });
});
