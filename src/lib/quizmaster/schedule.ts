/**
 * The countdown to the next automatic run. It lives in the database
 * (`QuizSchedule`), not the browser, so a reload, another device or a second
 * tab all show the same `nextRunAt`. Runs start only while the Studio tab is
 * open: when the countdown reaches zero, or on open when it is already past
 * (the catch-up).
 */
import "server-only";

export const MIN_INTERVAL_HOURS = 11;
export const MAX_INTERVAL_HOURS = 12;
export const DEFAULT_INTERVAL_HOURS = 12;
const HOUR_MS = 60 * 60 * 1000;

/** Interval in hours, clamped to 11–12 (non-numbers give the default). */
export function clampInterval(hours: unknown): number {
  const n = typeof hours === "number" ? hours : Number(hours);
  if (!Number.isFinite(n)) return DEFAULT_INTERVAL_HOURS;
  return Math.min(MAX_INTERVAL_HOURS, Math.max(MIN_INTERVAL_HOURS, Math.round(n * 60) / 60));
}

/** Next run after a run finished (or the timer was reset) at `from`. */
export function computeNextRun(from: Date, intervalHours: number): Date {
  return new Date(from.getTime() + clampInterval(intervalHours) * HOUR_MS);
}

/** Due now: not paused and `nextRunAt` reached. A missing time is due. */
export function isOverdue(s: { nextRunAt: Date | null; paused: boolean }, now: Date): boolean {
  if (s.paused) return false;
  return !s.nextRunAt || s.nextRunAt.getTime() <= now.getTime();
}

/** Milliseconds left on the countdown (never negative). */
export function msUntil(nextRunAt: Date | null, now: Date): number {
  return nextRunAt ? Math.max(0, nextRunAt.getTime() - now.getTime()) : 0;
}

/** Guest cleanup joins an automatic run once a day at most. */
export const CLEANUP_EVERY_MS = 24 * HOUR_MS;
export function cleanupDue(lastCleanupAt: Date | null, now: Date): boolean {
  return !lastCleanupAt || now.getTime() - lastCleanupAt.getTime() > CLEANUP_EVERY_MS;
}

export interface ScheduleRow {
  id: number;
  intervalHours: number;
  nextRunAt: Date | null;
  paused: boolean;
  lastCleanupAt: Date | null;
  updatedAt: Date;
}

/** Minimal Prisma surface used here (the real client, or a fake in tests). */
export interface ScheduleDb {
  quizSchedule: {
    upsert(args: {
      where: { id: number };
      create: Partial<ScheduleRow> & { id: number };
      update: Partial<ScheduleRow>;
    }): Promise<ScheduleRow>;
    update(args: { where: { id: number }; data: Partial<ScheduleRow> }): Promise<ScheduleRow>;
  };
}

/** The singleton row, created on first use with the first run due now + interval. */
export function getSchedule(db: ScheduleDb, now = new Date()): Promise<ScheduleRow> {
  return db.quizSchedule.upsert({
    where: { id: 1 },
    create: { id: 1, intervalHours: DEFAULT_INTERVAL_HOURS, nextRunAt: computeNextRun(now, DEFAULT_INTERVAL_HOURS) },
    update: {},
  });
}

export async function updateSchedule(db: ScheduleDb, data: Partial<ScheduleRow>): Promise<ScheduleRow> {
  await getSchedule(db);
  return db.quizSchedule.update({ where: { id: 1 }, data });
}
