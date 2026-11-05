import { afterEach, describe, expect, it, vi } from "vitest";
import { NIMError, nimChat } from "../nim";

vi.mock("@/lib/db", () => ({ db: {} }));

/** Replies in order, and records the key each request used. */
function fakeFetch(replies: number[]) {
  const keys: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { headers: Record<string, string> }) => {
      keys.push(init.headers.Authorization!.replace("Bearer ", ""));
      const status = replies.shift() ?? 200;
      if (status !== 200) return new Response("{}", { status });
      return new Response(JSON.stringify({ choices: [{ message: { content: "hello" }, finish_reason: "stop" }] }), { status });
    })
  );
  return keys;
}

const ask = () => nimChat("sys", "hi", { retries: 1, backoffMs: 0 });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("backup NIM key", () => {
  it("uses only the first key while it works", async () => {
    vi.stubEnv("NVIDIA_NIM_API_KEY", "healthy-1");
    vi.stubEnv("NVIDIA_NIM_API_KEY_2", "healthy-2");
    const keys = fakeFetch([200]);
    expect(await ask()).toBe("hello");
    expect(keys).toEqual(["healthy-1"]);
  });

  it.each([429, 401, 403])("switches to the backup at once on %i", async (status) => {
    vi.stubEnv("NVIDIA_NIM_API_KEY", `first-${status}`);
    vi.stubEnv("NVIDIA_NIM_API_KEY_2", `second-${status}`);
    const keys = fakeFetch([status, 200]);
    expect(await ask()).toBe("hello");
    expect(keys).toEqual([`first-${status}`, `second-${status}`]);
  });

  it("passes over a key that just hit its limit, then returns to it after the rest", async () => {
    vi.stubEnv("NVIDIA_NIM_API_KEY", "resting-1");
    vi.stubEnv("NVIDIA_NIM_API_KEY_2", "resting-2");
    const keys = fakeFetch([429, 200, 200, 200]);
    await ask();
    await ask();
    expect(keys).toEqual(["resting-1", "resting-2", "resting-2"]);
    const later = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 61_000);
    await ask();
    later.mockRestore();
    expect(keys[3]).toBe("resting-1");
  });

  it("reports the limit when both keys are out, without looping", async () => {
    vi.stubEnv("NVIDIA_NIM_API_KEY", "out-1");
    vi.stubEnv("NVIDIA_NIM_API_KEY_2", "out-2");
    const keys = fakeFetch([429, 429, 429, 429, 429, 429]);
    await expect(ask()).rejects.toMatchObject({ code: "rate_limited" });
    expect(keys.length).toBe(4); // both keys, on each of the 2 attempts
  });

  it("reports a refused key when there is no backup", async () => {
    vi.stubEnv("NVIDIA_NIM_API_KEY", "alone");
    vi.stubEnv("NVIDIA_NIM_API_KEY_2", "");
    const keys = fakeFetch([401]);
    await expect(ask()).rejects.toBeInstanceOf(NIMError);
    expect(keys).toEqual(["alone"]);
  });

  it("works with only the backup set", async () => {
    vi.stubEnv("NVIDIA_NIM_API_KEY", "");
    vi.stubEnv("NVIDIA_NIM_API_KEY_2", "only-backup");
    const keys = fakeFetch([200]);
    expect(await ask()).toBe("hello");
    expect(keys).toEqual(["only-backup"]);
  });

  it("still fails clearly with no key at all", async () => {
    vi.stubEnv("NVIDIA_NIM_API_KEY", "");
    vi.stubEnv("NVIDIA_NIM_API_KEY_2", "");
    await expect(ask()).rejects.toMatchObject({ code: "missing_key" });
  });
});
