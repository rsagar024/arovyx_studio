/** Every /api/admin/quizmaster/* route answers 401 without an admin session. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const touched: string[] = [];

vi.mock("@/lib/session", () => ({ getSession: vi.fn(async () => null) }));
// Nothing may reach the database (Firestore) or Firebase without a session.
vi.mock("@/lib/firestore", async (orig) => ({
  ...(await orig<typeof import("@/lib/firestore")>()),
  firestore: () =>
    new Proxy(
      {},
      {
        get(_t, prop) {
          touched.push(String(prop));
          throw new Error(`firestore().${String(prop)} used without a session`);
        },
      }
    ),
}));

import * as schedule from "@/app/api/admin/quizmaster/schedule/route";
import * as runs from "@/app/api/admin/quizmaster/runs/route";
import * as run from "@/app/api/admin/quizmaster/runs/[id]/route";
import * as tick from "@/app/api/admin/quizmaster/runs/[id]/tick/route";
import * as cancel from "@/app/api/admin/quizmaster/runs/[id]/cancel/route";

const url = "http://localhost/api/admin/quizmaster";
const params = { params: { id: "run123" } };
const post = (body: unknown) =>
  new Request(url, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  touched.length = 0;
});

describe("Quiz Master API without a session", () => {
  const cases: Array<[string, () => Promise<Response>]> = [
    ["GET schedule", () => schedule.GET()],
    ["PATCH schedule", () => schedule.PATCH(new Request(url, { method: "PATCH", body: '{"action":"pause"}' }))],
    ["GET runs", () => runs.GET()],
    ["POST runs (scheduled)", () => runs.POST(post({ kind: "scheduled", trigger: "now" }))],
    ["POST runs (guest cleanup)", () => runs.POST(post({ kind: "guest_cleanup", days: 30, dryRun: false }))],
    ["GET run", () => run.GET(new Request(`${url}/runs/run123`), params)],
    ["POST tick", () => tick.POST(new Request(`${url}/runs/run123/tick`, { method: "POST" }), params)],
    ["POST cancel", () => cancel.POST(new Request(`${url}/runs/run123/cancel`, { method: "POST" }), params)],
  ];

  it.each(cases)("%s → 401", async (_name, call) => {
    const res = await call();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "Unauthorized" });
    expect(touched).toEqual([]);
  });

  it("long-running routes run on Node with a 300 s limit", () => {
    expect(tick.runtime).toBe("nodejs");
    expect(tick.maxDuration).toBe(300);
    for (const mod of [schedule, runs, run, cancel]) expect(mod.runtime).toBe("nodejs");
  });
});
