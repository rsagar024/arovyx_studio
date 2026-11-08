/** Which slot a scheduled run gets: Run now a new one each time, the timer am or pm. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const created: Array<{ slot: string; trigger: string; options: string }> = [];

vi.mock("../storage", async () => {
  const { MemoryRunRepo } = await import("../repo");
  type Repo = import("../repo").RunRepo;
  // Every start creates a run (as if none were active), and records its fields.
  class RecordingRepo extends MemoryRunRepo {
    override async listRuns() {
      return [];
    }
    override async activeRun() {
      return null;
    }
    override async createRunIfFree(...args: Parameters<Repo["createRunIfFree"]>) {
      const [data, steps, now, lockedUntil] = args;
      created.push(data);
      this.runs.clear();
      return super.createRunIfFree(data, steps, now, lockedUntil);
    }
  }
  const schedule = {
    id: 1,
    intervalHours: 12,
    nextRunAt: new Date(0), // always due
    paused: false,
    lastCleanupAt: null,
    updatedAt: new Date(0),
  };
  return {
    repo: new RecordingRepo(),
    scheduleDb: {
      quizSchedule: {
        upsert: async () => ({ ...schedule }),
        update: async ({ data }: { data: object }) => ({ ...schedule, ...data }),
      },
    },
  };
});

import { startScheduled } from "../service";

const IST_09_00 = new Date("2026-11-05T03:30:00Z");

beforeEach(() => {
  created.length = 0;
  vi.useFakeTimers();
  vi.setSystemTime(IST_09_00);
});
afterEach(() => vi.useRealTimers());

describe("the slot of a scheduled run", () => {
  it("Run now gets a new slot each time, so it is never skipped as already done", async () => {
    await startScheduled("now");
    vi.advanceTimersByTime(60_000);
    await startScheduled("now");
    const [first, second] = created;
    expect(first!.slot).toMatch(/^x\d+$/);
    expect(second!.slot).toMatch(/^x\d+$/);
    expect(first!.slot).not.toBe(second!.slot);
    expect(first!.trigger).toBe("manual");
    expect(JSON.parse(first!.options).runNow).toBe(true);
    expect(JSON.parse(first!.options).dryRun).toBe(false); // real writes and pushes
  });

  it("the timer keeps one run per morning or evening", async () => {
    await startScheduled("timer");
    expect(created[0]!.slot).toBe("am");
    expect(created[0]!.trigger).toBe("timer");
    expect(JSON.parse(created[0]!.options).runNow).toBe(false);
    vi.setSystemTime(new Date("2026-11-05T11:30:00Z")); // 17:00 IST
    await startScheduled("timer");
    expect(created[1]!.slot).toBe("pm");
  });
});
