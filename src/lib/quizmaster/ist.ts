/**
 * India Standard Time helpers. Port of quizmaster `automation/common/ist.py`
 * (itself a port of the app's `lib/core/utils/ist.dart`).
 *
 * The daily quiz, leaderboard weeks and streaks roll over at midnight IST
 * whatever the server's time zone, so the jobs and the app agree on the date.
 * Instants are plain `Date`s (UTC); IST is always +05:30 (no DST).
 */
import "server-only";

export const OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface WallClock {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** Python's `weekday()`: Monday = 0 … Sunday = 6. */
  weekday: number;
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** The instant's fields as read on an IST wall clock. */
export function wallClock(instant: Date): WallClock {
  const shifted = new Date(instant.getTime() + OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    weekday: (shifted.getUTCDay() + 6) % 7,
  };
}

/** `yyyy-MM-dd` of the IST date containing `instant`. */
export function dateKey(instant: Date): string {
  const w = wallClock(instant);
  return `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)}`;
}

/** Days since 1970-01-01 in IST (the daily category rotation uses it). */
export function dayNumber(instant: Date): number {
  return Math.floor((instant.getTime() + OFFSET_MS) / DAY_MS);
}

/** The instant at hour:minute IST on the IST date containing `instant`. */
export function atTime(instant: Date, hour: number, minute = 0): Date {
  const w = wallClock(instant);
  return new Date(Date.UTC(w.year, w.month - 1, w.day, hour, minute) - OFFSET_MS);
}

/** The next midnight IST after `instant`. */
export function nextMidnight(instant: Date): Date {
  return new Date(atTime(instant, 0).getTime() + DAY_MS);
}

/** ISO-8601 year and week of a calendar date (given as UTC midnight). */
function isoWeek(dateUtc: Date): { year: number; week: number } {
  const d = new Date(dateUtc.getTime());
  const weekday = (d.getUTCDay() + 6) % 7; // Monday = 0
  // The week's Thursday decides the ISO year.
  d.setUTCDate(d.getUTCDate() - weekday + 3);
  const year = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const firstWeekday = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstWeekday + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * DAY_MS));
  return { year, week };
}

function istDateUtc(instant: Date): Date {
  const w = wallClock(instant);
  return new Date(Date.UTC(w.year, w.month - 1, w.day));
}

/** ISO-8601 week of the IST date, e.g. `2026-W42` (weeks start Monday). */
export function isoWeekKey(instant: Date): string {
  const { year, week } = isoWeek(istDateUtc(instant));
  return `${year}-W${pad(week)}`;
}

/** The ISO week before the IST week containing `instant`. */
export function previousIsoWeekKey(instant: Date): string {
  const d = istDateUtc(instant);
  const weekday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - (weekday + 1));
  const { year, week } = isoWeek(d);
  return `${year}-W${pad(week)}`;
}

export function dateKeyDaysAgo(instant: Date, days: number): string {
  return dateKey(new Date(instant.getTime() - days * DAY_MS));
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date written `yyyy-MM-dd`. */
export function isDateKey(key: string): boolean {
  const m = DATE_RE.exec(key);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** Midnight IST at the start of the `yyyy-MM-dd` date `key`. */
export function fromKey(key: string): Date {
  if (!isDateKey(key)) throw new Error(`Invalid isoformat string: '${key}'`);
  const m = DATE_RE.exec(key)!;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - OFFSET_MS);
}

/** e.g. `Tue, 03 Nov 2026, 19:00 IST`, for the Studio page. */
export function formatIst(instant: Date): string {
  const w = wallClock(instant);
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[w.weekday]}, ${pad(w.day)} ${months[w.month - 1]} ${w.year}, ${pad(w.hour)}:${pad(w.minute)} IST`;
}
