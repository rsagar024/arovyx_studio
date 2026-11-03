/**
 * The Monday `weekly_summary` push.
 * Port of quizmaster `automation/jobs/question_bank/weekly.py`.
 *
 * The app reads the leaderboards live from `scores`, so last week's board is
 * final as soon as the week ends (Monday 00:00 IST). The first Monday run
 * tells the players, once: the push is recorded on
 * `question_pushes/weekly_{week}` and a later run sends nothing. A week
 * nobody played gets no push. One topic for every language, so the text
 * (`prompts/weekly_summary.json`) is English, rotated by week number, and it
 * never names a player.
 */
import "server-only";
import { weeklyTemplates, type PushText } from "./assets";
import { CHANNEL } from "./dailyNotify";
import * as ist from "./ist";
import type { Messenger, PushMessage } from "./messenger";
import { COLLECTION } from "./notifyQuestions";
import { pyLen } from "./pyText";
import { SERVER_TIME, type Doc, type Write } from "./writes";

export const TITLE_MAX = 40;
export const BODY_MAX = 120;
export const TOPIC = "weekly_summary";
export const TYPE = "weekly_summary";
export const TTL_SECONDS = 24 * 60 * 60; // stale after a day
const MONDAY = 0;

export const recordPath = (week: string) => `${COLLECTION}/weekly_${week}`;

/** The push for `week` (`yyyy-Www`), with a template rotated by week. */
export function weeklyMessage(week: string, templates: PushText[]): PushMessage {
  const number = Number(week.split("-W")[1]);
  const template = templates[number % templates.length]!;
  const fill = (s: string) => s.replaceAll("{week}", String(number));
  return {
    topic: TOPIC,
    title: fill(template.title),
    body: fill(template.body),
    data: { type: TYPE, week, route: "/leaderboard" },
    channel: CHANNEL,
    tag: `weekly_${week}`,
    ttl: TTL_SECONDS,
  };
}

export type WeeklyStatus = "not_monday" | "sent" | "already_sent" | "empty";

export interface WeeklyOptions {
  messenger: Messenger;
  read: (path: string) => Promise<Doc | null>;
  commit: (writes: Write[]) => Promise<void>;
  played: (week: string) => Promise<boolean>;
  dryRun?: boolean;
  log?: (line: string) => void;
  templates?: PushText[];
}

/** `date` is the run's IST date. */
export async function weeklySummary(o: WeeklyOptions, date: string): Promise<WeeklyStatus> {
  const log = o.log ?? (() => {});
  const day = ist.fromKey(date);
  if (ist.wallClock(day).weekday !== MONDAY) return "not_monday";
  const week = ist.previousIsoWeekKey(day);
  if (!/^\d{4}-W\d{2}$/.test(week)) throw new Error(`bad week '${week}'`);
  if (((await o.read(recordPath(week))) ?? {}).notifiedAt) {
    log(`the weekly push for ${week} was already sent`);
    return "already_sent";
  }
  if (!(await o.played(week))) {
    log(`nobody played in ${week}; no weekly push`);
    return "empty";
  }
  const msg = weeklyMessage(week, o.templates ?? weeklyTemplates());
  if (pyLen(msg.title) > TITLE_MAX || pyLen(msg.body) > BODY_MAX) throw new Error("weekly template too long");
  const messageId = await o.messenger.send(msg, { dryRun: o.dryRun });
  log(`sent ${TOPIC}: ${msg.title} | ${msg.body}`);
  await o.commit([
    {
      op: "merge",
      path: recordPath(week),
      data: { week, title: msg.title, body: msg.body, messageId, notifiedAt: SERVER_TIME },
    },
  ]);
  return "sent";
}
