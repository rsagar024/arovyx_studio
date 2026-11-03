/** The countdown maths and the schedule row. */
import { describe, expect, it } from "vitest";
import {
  cleanupDue,
  clampInterval,
  computeNextRun,
  getSchedule,
  isOverdue,
  msUntil,
  updateSchedule,
  type ScheduleDb,
  type ScheduleRow,
} from "../schedule";

const H = 3_600_000;
const NOW = new Date(Date.UTC(2026, 10, 3, 1, 30)); // 07:00 IST

describe("schedule maths", () => {
  it("the interval is clamped to 11-12 h", () => {
    expect(clampInterval(12)).toBe(12);
    expect(clampInterval(11.5)).toBe(11.5);
    expect(clampInterval(11)).toBe(11);
    expect(clampInterval(10)).toBe(11);
    expect(clampInterval(0)).toBe(11);
    expect(clampInterval(13)).toBe(12);
    expect(clampInterval(48)).toBe(12);
    expect(clampInterval("11.25")).toBe(11.25);
    expect(clampInterval("nope")).toBe(12);
    expect(clampInterval(Number.NaN)).toBe(12);
  });

  it("overdue detection", () => {
    expect(isOverdue({ nextRunAt: new Date(NOW.getTime() - 1), paused: false }, NOW)).toBe(true);
    expect(isOverdue({ nextRunAt: NOW, paused: false }, NOW)).toBe(true);
    expect(isOverdue({ nextRunAt: new Date(NOW.getTime() + 1), paused: false }, NOW)).toBe(false);
    expect(isOverdue({ nextRunAt: new Date(NOW.getTime() - H), paused: true }, NOW)).toBe(false); // paused never runs
    expect(isOverdue({ nextRunAt: null, paused: false }, NOW)).toBe(true);
  });

  it("the next run is computed from when a run finishes", () => {
    const finished = new Date(NOW.getTime() + 37 * 60_000); // a 37-minute run
    expect(computeNextRun(finished, 12)).toEqual(new Date(finished.getTime() + 12 * H));
    expect(computeNextRun(finished, 11.5)).toEqual(new Date(finished.getTime() + 11.5 * H));
    expect(computeNextRun(finished, 20)).toEqual(new Date(finished.getTime() + 12 * H)); // clamped
  });

  it("the countdown is wall-clock based and never negative", () => {
    expect(msUntil(new Date(NOW.getTime() + 90_000), NOW)).toBe(90_000);
    expect(msUntil(new Date(NOW.getTime() - 90_000), NOW)).toBe(0);
    expect(msUntil(null, NOW)).toBe(0);
  });

  it("guest cleanup joins an automatic run at most once a day", () => {
    expect(cleanupDue(null, NOW)).toBe(true);
    expect(cleanupDue(new Date(NOW.getTime() - 23 * H), NOW)).toBe(false);
    expect(cleanupDue(new Date(NOW.getTime() - 24 * H - 1), NOW)).toBe(true);
  });
});

describe("schedule row", () => {
  function fakeDb(): ScheduleDb & { row: ScheduleRow | null } {
    const db = {
      row: null as ScheduleRow | null,
      quizSchedule: {
        async upsert(args: { create: Partial<ScheduleRow> }) {
          db.row ??= {
            id: 1,
            intervalHours: 12,
            nextRunAt: null,
            paused: false,
            lastCleanupAt: null,
            updatedAt: new Date(),
            ...args.create,
          } as ScheduleRow;
          return { ...db.row };
        },
        async update(args: { data: Partial<ScheduleRow> }) {
          Object.assign(db.row!, args.data);
          return { ...db.row! };
        },
      },
    };
    return db as never;
  }

  it("is created once, 12 h out, and then only updated", async () => {
    const db = fakeDb();
    const first = await getSchedule(db, NOW);
    expect(first.intervalHours).toBe(12);
    expect(first.nextRunAt).toEqual(new Date(NOW.getTime() + 12 * H));
    const later = await getSchedule(db, new Date(NOW.getTime() + 5 * H));
    expect(later.nextRunAt).toEqual(first.nextRunAt);
    const paused = await updateSchedule(db, { paused: true });
    expect(paused.paused).toBe(true);
  });
});
