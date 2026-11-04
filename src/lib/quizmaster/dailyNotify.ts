/**
 * The daily quiz's "new quiz" push: one per language topic.
 * Port of quizmaster `automation/jobs/daily_quiz/notify.py`.
 *
 * The generator model writes a playful title and body in `en`, `hi` and
 * `hi-Latn`. A language whose text fails the checks uses a rotating template
 * from `prompts/notification_templates.json` instead. Each language is
 * recorded on `daily_challenges/{date}.notification` as soon as it is sent,
 * and `notifiedAt` once all three are out, so a later run only sends what is
 * still missing and nobody gets the same push twice.
 */
import "server-only";
import { notificationTemplates, prompt, type Lang, type NotificationTemplates } from "./assets";
import { categoryName } from "./categories";
import * as ist from "./ist";
import { extractJson } from "./jsonExtract";
import { SendFailed, type Messenger, type PushMessage } from "./messenger";
import { isDeadline, type Models, type Nim } from "./nimClient";
import { pyDumps } from "./pyJson";
import { PY_WORD, casefold, escapeRegex, pyLen, pyRepr, pyStrip } from "./pyText";
import { emojiCount, hasDevanagari, hasUrl, isMostlyDevanagari } from "./textChecks";
import { SERVER_TIME, type Doc, type Write } from "./writes";

export const TOPICS: Record<Lang, string> = { en: "new_quiz_en", hi: "new_quiz_hi", "hi-Latn": "new_quiz_hi_latn" };
export const LANGS = Object.keys(TOPICS) as Lang[];
export const CHANNEL = "daily_quiz";
export const ROUTE = "/daily-challenge"; // the app's `Routes.dailyChallenge`
export const MAX_TITLE = 40;
export const MAX_BODY = 120;
export const REWARD_COINS = 100;
export const NOON = 12;
// Numbers every message may mention (10 questions, 100 coins), even when one
// happens to be an answer.
const EXPECTED_NUMBERS = new Set(["10", "100"]);
// Devanagari vowel signs aren't `\w`, so they're listed to keep "भारत" from
// matching inside "भारतीय".
const WORD = `${PY_WORD}\\u0900-\\u097F`;

export { SendFailed };

/** The answers that appear in `text` as whole words, ignoring case. */
export function leaks(text: string, answers: string[]): string[] {
  const folded = casefold(text);
  const found: string[] = [];
  for (const answer of answers) {
    const a = casefold(pyStrip(answer));
    if (!a || EXPECTED_NUMBERS.has(a)) continue;
    if (new RegExp(`(?<![${WORD}])${escapeRegex(a)}(?![${WORD}])`, "u").test(folded)) found.push(answer);
  }
  return found;
}

/** Problems with one language's `{title, body}`; empty when it's fine. */
export function checkNotification(lang: Lang, message: unknown, answers: string[]): string[] {
  if (typeof message !== "object" || message === null || Array.isArray(message)) return ["missing"];
  const { title, body } = message as Record<string, unknown>;
  if (typeof title !== "string" || !pyStrip(title)) return ["empty title"];
  if (typeof body !== "string" || !pyStrip(body)) return ["empty body"];
  const problems: string[] = [];
  if (pyLen(title) > MAX_TITLE) problems.push(`title over ${MAX_TITLE} characters`);
  if (pyLen(body) > MAX_BODY) problems.push(`body over ${MAX_BODY} characters`);
  const text = `${title} ${body}`;
  if (lang === "hi") {
    if (!(isMostlyDevanagari(title) && isMostlyDevanagari(body))) problems.push("not mostly Devanagari");
  } else if (hasDevanagari(text)) {
    problems.push("has Devanagari");
  }
  if (hasUrl(text)) problems.push("has a URL");
  const emojis = emojiCount(text);
  if (!(emojis >= 1 && emojis <= 2)) problems.push(`${emojis} emojis`);
  const leaked = leaks(text, answers);
  if (leaked.length) problems.push(`leaks the answer ${pyRepr(leaked[0])}`);
  return problems;
}

/** Remote Config parameters, as in the template JSON / firebase-admin. */
export type RemoteConfigParameters = Record<string, { defaultValue?: { value?: string } } | undefined>;

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

/**
 * The festival theme in Remote Config, if one is on. Python read the
 * template file in the repo; this reads the live template's parameters.
 */
export function festival(now: Date, params: RemoteConfigParameters | null | undefined): string | null {
  const theme = params?.festival_theme?.defaultValue?.value;
  if (typeof theme !== "string") return null;
  const until = params?.festival_theme_until?.defaultValue?.value ?? "";
  if (!theme || theme === "default") return null;
  if (until) {
    // Unreadable, or no UTC offset: off (Python raised and returned None).
    if (!ISO_WITH_OFFSET.test(until)) return null;
    const end = new Date(until.replace(" ", "T"));
    if (Number.isNaN(end.getTime()) || end.getTime() <= now.getTime()) return null;
  }
  return theme.replace(/_/g, " ");
}

export interface QuestionDoc {
  groupId: string;
  category: string;
  subcategory: string;
  difficulty: string;
  language: Lang;
  questionText: string;
  options: string[];
  correctIndex: number;
}

export interface PushRecord {
  title: string;
  body: string;
  origin: "ai" | "template";
}

export interface NotifierOptions {
  nim: Nim;
  models: Models;
  messenger: Messenger;
  commit: (writes: Write[]) => Promise<void>;
  now: Date;
  dryRun?: boolean;
  force?: boolean;
  log?: (line: string) => void;
  templates?: NotificationTemplates;
  /** Live Remote Config parameters, read lazily (null when unavailable). */
  remoteConfig?: () => Promise<RemoteConfigParameters | null>;
}

function mostCommon<T>(items: T[], n: number): T[] {
  const counts = new Map<T, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  // Ties keep first-seen order, like collections.Counter.most_common.
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}

function counter(items: unknown[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of items) {
    const key = item === undefined || item === null ? "null" : String(item);
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

export class Notifier {
  private log: (line: string) => void;
  private templates: NotificationTemplates;
  constructor(private o: NotifierOptions) {
    this.log = o.log ?? (() => {});
    this.templates = o.templates ?? notificationTemplates();
  }

  /** Sends what's still unsent for `date`. Throws `SendFailed` if a topic fails. */
  async run(date: string, challenge: Doc, questions: QuestionDoc[]): Promise<void> {
    const now = this.o.now;
    if (challenge.notifiedAt) {
      this.log(`step 9: ${date} was already notified`);
      return;
    }
    if (date !== ist.dateKey(now)) {
      this.log(`step 9: ${date} isn't today in IST; its own morning run notifies`);
      return;
    }
    if (now.getTime() >= ist.atTime(now, NOON).getTime() && !this.o.force) {
      this.log("step 9: past 12:00 IST; no notification (use --force to send)");
      return;
    }
    const ttl = Math.floor((ist.nextMidnight(now).getTime() - now.getTime()) / 1000);

    const sent = (challenge.notification as Record<string, Doc | undefined> | undefined) ?? {};
    const pending = LANGS.filter((lang) => !sent[lang]?.sentAt);
    const texts = await this.write(challenge.category as string, date, questions);
    const failed: Lang[] = [];
    for (const lang of pending) {
      const text = texts[lang];
      const message: PushMessage = {
        topic: TOPICS[lang],
        title: text.title,
        body: text.body,
        data: { type: "daily_quiz", date, route: ROUTE },
        channel: CHANNEL,
        tag: `daily_quiz_${date}`,
        ttl,
      };
      let messageId: string;
      try {
        messageId = await this.o.messenger.send(message, { dryRun: this.o.dryRun });
      } catch (err) {
        this.log(`step 9: sending to ${TOPICS[lang]} failed: ${errName(err)}: ${errMessage(err)}`);
        failed.push(lang);
        continue;
      }
      this.log(`step 9: sent ${TOPICS[lang]} (${text.origin}): ${text.title} | ${text.body}`);
      const record = { ...text, sentAt: SERVER_TIME, messageId };
      await this.o.commit([{ op: "merge", path: `daily_challenges/${date}`, data: { notification: { [lang]: record } } }]);
    }
    if (failed.length) throw new SendFailed(`not sent: ${failed.map((l) => TOPICS[l]).join(", ")}`);
    await this.o.commit([{ op: "merge", path: `daily_challenges/${date}`, data: { notifiedAt: SERVER_TIME } }]);
  }

  /** `{lang: {title, body, origin}}`, `origin` being `ai` or `template`. */
  async write(category: string, date: string, questions: QuestionDoc[]): Promise<Record<Lang, PushRecord>> {
    const answers: Record<Lang, string[]> = { en: [], hi: [], "hi-Latn": [] };
    for (const q of questions) {
      if (q.language in answers) answers[q.language].push(q.options[q.correctIndex]!);
    }
    const english = questions.filter((q) => q.language === "en");
    const theme = mostCommon(
      english.filter((q) => q.subcategory).map((q) => q.subcategory.replace(/_/g, " ")),
      3
    );
    let params: RemoteConfigParameters | null = null;
    try {
      params = (await this.o.remoteConfig?.()) ?? null;
    } catch (err) {
      this.log(`step 9: no Remote Config (${errName(err)}: ${errMessage(err)}); no festival hint`);
    }
    const hint = festival(this.o.now, params);
    if (hint) theme.push(`festival: ${hint}`);
    const payload = {
      category: Object.fromEntries(LANGS.map((lang) => [lang, categoryName(category, lang)])),
      questions: english.length,
      difficulty: counter(english.map((q) => q.difficulty)),
      reward_coins: REWARD_COINS,
      theme,
    };
    let reply: unknown;
    try {
      reply = extractJson(
        await this.o.nim.chat(
          [
            { role: "system", content: prompt("notify.md") },
            { role: "user", content: pyDumps(payload) },
          ],
          { model: this.o.models.generate, fallbacks: this.o.models.pool, temperature: 0.9, maxTokens: 1024 }
        )
      );
    } catch (err) {
      if (isDeadline(err)) throw err;
      this.log(`step 9: no AI text (${errName(err)}: ${errMessage(err)}); using templates`);
      reply = {};
    }

    const day = ist.dayNumber(ist.fromKey(date));
    const texts = {} as Record<Lang, PushRecord>;
    for (const lang of LANGS) {
      const candidate =
        typeof reply === "object" && reply !== null && !Array.isArray(reply)
          ? (reply as Record<string, unknown>)[lang]
          : undefined;
      const problems = checkNotification(lang, candidate, answers[lang]);
      if (!problems.length) {
        const c = candidate as { title: string; body: string };
        texts[lang] = { title: pyStrip(c.title), body: pyStrip(c.body), origin: "ai" };
        continue;
      }
      if (candidate !== undefined && candidate !== null) {
        this.log(`step 9: ${lang} AI text rejected (${problems.join(", ")}); using a template`);
      }
      const options = this.templates.templates[lang];
      const template = options[day % options.length]!;
      const label = this.templates.categories[category]![lang];
      texts[lang] = {
        title: template.title.replaceAll("{category}", label),
        body: template.body.replaceAll("{category}", label),
        origin: "template",
      };
    }
    return texts;
  }
}

export const errName = (err: unknown) => (err instanceof Error ? err.name : typeof err);
export const errMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));
