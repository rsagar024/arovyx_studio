/** Every /api/admin/colortap/* route answers 401 without an admin session. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const touched: string[] = [];

vi.mock("@/lib/session", () => ({ getSession: vi.fn(async () => null) }));
// Nothing may reach the database (or Firebase) without a session.
vi.mock("@/lib/db", () => ({
  db: new Proxy(
    {},
    {
      get(_t, prop) {
        touched.push(String(prop));
        throw new Error(`db.${String(prop)} used without a session`);
      },
    }
  ),
}));

import * as status from "@/app/api/admin/colortap/status/route";
import * as runs from "@/app/api/admin/colortap/runs/route";
import * as run from "@/app/api/admin/colortap/runs/[id]/route";
import * as tick from "@/app/api/admin/colortap/runs/[id]/tick/route";
import * as cancel from "@/app/api/admin/colortap/runs/[id]/cancel/route";

const url = "http://localhost/api/admin/colortap";
const params = { params: { id: "run123" } };
const post = (body: unknown) =>
  new Request(url, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  touched.length = 0;
});

describe("Color Tap API without a session", () => {
  const cases: Array<[string, () => Promise<Response>]> = [
    ["GET status", () => status.GET()],
    ["PATCH status", () => status.PATCH(new Request(url, { method: "PATCH", body: '{"action":"auto","enabled":true}' }))],
    ["POST runs (scheduled)", () => runs.POST(post({ kind: "scheduled" }))],
    ["POST runs (guest cleanup)", () => runs.POST(post({ kind: "guest_cleanup", days: 90, dryRun: false }))],
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
});
