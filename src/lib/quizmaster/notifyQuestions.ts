/**
 * The "new questions added" push, one per language topic, after every run.
 * Port of quizmaster `automation/jobs/question_bank/notify.py`.
 *
 * A morning or manual run whose daily quiz push just went out skips this
 * one, so players don't get two pushes at once; any other run that added
 * questions tells the players with this one. A manual run has its own slot,
 * `x{run id}`, so its push is never "already sent". The text rotates through
 * `new_questions` in `prompts/notification_templates.json` by IST day
 * number. Each language is recorded on `question_pushes/{date}_{slot}` as
 * soon as it is sent, and `notifiedAt` once all three are out, so a later
 * run only sends what is still missing.
 */
import "server-only";
import { notificationTemplates, type Lang, type PushText } from "./assets";
import { ALL_CATEGORIES } from "./categories";
import { CHANNEL, LANGS, TOPICS, errMessage, errName } from "./dailyNotify";
import * as ist from "./ist";
import { SendFailed, type Messenger, type PushMessage } from "./messenger";
import * as qb from "./questionBank";
import { SERVER_TIME, type Doc, type Write } from "./writes";

export const TYPE = "new_questions";
export const COLLECTION = "question_pushes";
/** A daily quiz push sent this recently already told the players. */
export const DAILY_QUIZ_COVERS_MS = 60 * 60 * 1000;

export const recordPath = (date: string, slot: string) => `${COLLECTION}/${date}_${slot}`;

export type NewQuestionsStatus = "sent" | "already_sent" | "nothing_new" | "covered_by_daily_quiz";

export interface NewQuestionsOptions {
  bank: qb.BankStore;
  messenger: Messenger;
  read: (path: string) => Promise<Doc | null>;
  commit: (writes: Write[]) => Promise<void>;
  now: Date;
  dryRun?: boolean;
  log?: (line: string) => void;
  templates?: Record<Lang, PushText[]>;
}

/** Throws `SendFailed` if a topic fails (the others are still sent and recorded). */
export async function notifyNewQuestions(o: NewQuestionsOptions, date: string, slot: string): Promise<NewQuestionsStatus> {
  const log = o.log ?? (() => {});
  const templates = o.templates ?? notificationTemplates().new_questions;
  const record = (await o.read(recordPath(date, slot))) ?? {};
  if (record.notifiedAt) {
    log(`new questions push for ${date} ${slot} was already sent`);
    return "already_sent";
  }
  const quizSent = ((await o.read(`daily_challenges/${date}`)) ?? {}).notifiedAt;
  if (slot !== "pm" && quizSent instanceof Date && o.now.getTime() - quizSent.getTime() < DAILY_QUIZ_COVERS_MS) {
    log(`the daily quiz push for ${date} just went out; no second push`);
    return "covered_by_daily_quiz";
  }
  const added: string[] = [];
  for (const c of ALL_CATEGORIES) if (await qb.hasBatch(o.bank, c, date, slot)) added.push(c);
  if (!added.length) {
    log(`no category added questions in the ${date} ${slot} run; no push`);
    return "nothing_new";
  }

  const ttl = Math.floor((ist.nextMidnight(o.now).getTime() - o.now.getTime()) / 1000);
  const day = ist.dayNumber(ist.fromKey(date));
  const sent = (record.sent as Record<string, Doc | undefined> | undefined) ?? {};
  const failed: string[] = [];
  for (const lang of LANGS) {
    const topic = TOPICS[lang];
    if (sent[lang]?.sentAt) continue;
    const options = templates[lang];
    const text = options[day % options.length]!;
    const message: PushMessage = {
      topic,
      title: text.title,
      body: text.body,
      // No route: the tap opens Home, and the app downloads the new
      // questions as it opens.
      data: { type: TYPE, date, slot },
      channel: CHANNEL,
      tag: `${TYPE}_${date}`,
      ttl,
    };
    let messageId: string;
    try {
      messageId = await o.messenger.send(message, { dryRun: o.dryRun });
    } catch (err) {
      log(`sending to ${topic} failed: ${errName(err)}: ${errMessage(err)}`);
      failed.push(topic);
      continue;
    }
    log(`sent ${topic}: ${text.title} | ${text.body}`);
    await o.commit([
      { op: "merge", path: recordPath(date, slot), data: { sent: { [lang]: { ...text, sentAt: SERVER_TIME, messageId } } } },
    ]);
  }
  if (failed.length) throw new SendFailed(`not sent: ${failed.join(", ")}`);
  await o.commit([{ op: "merge", path: recordPath(date, slot), data: { categories: added, notifiedAt: SERVER_TIME } }]);
  return "sent";
}
