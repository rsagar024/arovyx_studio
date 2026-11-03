/**
 * Port of quizmaster `automation/tests/test_nim_client.py`, against the
 * `nimChat`-based client. Differences from Python's client, by design:
 * - up to 4 requests (nimChat's 1 retry, twice) instead of 5, with shorter
 *   waits, because every call has to fit in a 240 s tick;
 * - `chat_template_kwargs.enable_thinking=false` is sent to every model (the
 *   way `src/lib/nim.ts` already works) and dropped once if a model answers
 *   400, instead of only for `nvidia/nemotron*`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_GEN_MODEL,
  DEFAULT_VERIFY_MODEL,
  DeadlineError,
  NimClient,
  modelFamily,
  models,
} from "../nimClient";

const MESSAGES = [
  { role: "system" as const, content: "sys" },
  { role: "user" as const, content: "hi" },
];

type Reply = number | "ok" | "drop";

function fakeFetch(replies: Reply[], answer = "ok") {
  const calls: Array<Record<string, unknown>> = [];
  const fn = vi.fn(async (_url: string, init: { body: string }) => {
    calls.push(JSON.parse(init.body));
    const r = replies.shift() ?? "ok";
    if (r === "drop") throw new TypeError("fetch failed");
    if (r === "ok") {
      return new Response(JSON.stringify({ choices: [{ message: { content: answer }, finish_reason: "stop" }] }), {
        status: 200,
      });
    }
    return new Response("{}", { status: r });
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

const client = () => new NimClient({ backoffMs: 0, retryDelayMs: 0 });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("NIM client", () => {
  it.each([429, 500, 502, 503])("retries rate limits and server errors (%i)", async (code) => {
    vi.stubEnv("NVIDIA_NIM_API_KEY", "test-key");
    const calls = fakeFetch([code], '{"ok": true}');
    expect(await client().chat(MESSAGES, { model: "m" })).toBe('{"ok": true}');
    expect(calls.length).toBe(2);
  });

  it("retries dropped connections", async () => {
    vi.stubEnv("NVIDIA_NIM_API_KEY", "test-key");
    const calls = fakeFetch(["drop"]);
    expect(await client().chat(MESSAGES, { model: "m" })).toBe("ok");
    expect(calls.length).toBe(2);
  });

  it("does not retry auth errors (401)", async () => {
    vi.stubEnv("NVIDIA_NIM_API_KEY", "test-key");
    const calls = fakeFetch([401]);
    await expect(client().chat(MESSAGES, { model: "m" })).rejects.toMatchObject({ code: "auth" });
    expect(calls.length).toBe(1);
  });

  it("a 400 only drops chat_template_kwargs once, then gives up", async () => {
    vi.stubEnv("NVIDIA_NIM_API_KEY", "test-key");
    const calls = fakeFetch([400, 400, 400, 400]);
    await expect(client().chat(MESSAGES, { model: "m" })).rejects.toThrow(/400/);
    expect(calls.length).toBe(2);
    expect(calls[0]).toHaveProperty("chat_template_kwargs");
    expect(calls[1]).not.toHaveProperty("chat_template_kwargs");
  });

  it("gives up after four tries", async () => {
    vi.stubEnv("NVIDIA_NIM_API_KEY", "test-key");
    const calls = fakeFetch([503, 503, 503, 503, 503]);
    await expect(client().chat(MESSAGES, { model: "m" })).rejects.toMatchObject({ code: "server" });
    expect(calls.length).toBe(4);
  });

  it("request shape", async () => {
    vi.stubEnv("NVIDIA_NIM_API_KEY", "test-key");
    const calls = fakeFetch([]);
    await client().chat(MESSAGES, { model: "meta/llama", temperature: 0.1, maxTokens: 1024 });
    const call = calls[0]!;
    expect(call.model).toBe("meta/llama");
    expect(call.temperature).toBe(0.1);
    expect(call.max_tokens).toBe(1024);
    expect(call.messages).toEqual(MESSAGES);
    expect(call).not.toHaveProperty("response_format");
  });

  it("nemotron answers without thinking first", async () => {
    vi.stubEnv("NVIDIA_NIM_API_KEY", "test-key");
    const calls = fakeFetch([]);
    await client().chat(MESSAGES, { model: "nvidia/nemotron-3.5-lightning-30b-a3b" });
    expect(calls[0]!.chat_template_kwargs).toEqual({ enable_thinking: false });
  });

  it("model ids come from variables, with defaults", () => {
    const defaults = models({});
    expect(defaults.generate).toBe("nvidia/nemotron-3-ultra-550b-a55b");
    expect(defaults.verify).toBe("deepseek-ai/deepseek-v4.1-flash");
    expect(defaults.translate).toBe("nvidia/nemotron-3-ultra-550b-a55b");
    const custom = models({ QUIZMASTER_GEN_MODEL: "x/y", QUIZMASTER_VERIFY_MODEL: "" });
    expect(custom.generate).toBe("x/y");
    expect(custom.verify).toBe(defaults.verify); // an empty variable uses the default
  });

  it("generator and verifier are different families", () => {
    expect(modelFamily(DEFAULT_GEN_MODEL)).not.toBe(modelFamily(DEFAULT_VERIFY_MODEL));
    const m = models({});
    expect(modelFamily(m.generate)).not.toBe(modelFamily(m.verify));
  });

  it("needs an API key", async () => {
    vi.stubEnv("NVIDIA_NIM_API_KEY", "");
    fakeFetch([]);
    await expect(client().chat(MESSAGES, { model: "m" })).rejects.toMatchObject({ code: "missing_key" });
  });

  it("a request that hangs past its abort still ends before the tick deadline", async () => {
    vi.stubEnv("NVIDIA_NIM_API_KEY", "test-key");
    vi.useFakeTimers();
    try {
      // A fetch that never settles and ignores the abort signal.
      vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
      const start = Date.now();
      const c = new NimClient({ deadline: start + 60_000, backoffMs: 0 });
      const result = c.chat(MESSAGES, { model: "m" }).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(60_000);
      const err = await result;
      expect(err).toBeInstanceOf(DeadlineError);
      expect(Date.now() - start).toBeLessThanOrEqual(60_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a call that can't fit before the tick deadline isn't started", async () => {
    vi.stubEnv("NVIDIA_NIM_API_KEY", "test-key");
    const calls = fakeFetch([]);
    const now = 1_000_000;
    const c = new NimClient({ deadline: now + 15_000, now: () => now });
    await expect(c.chat(MESSAGES, { model: "m" })).rejects.toBeInstanceOf(DeadlineError);
    expect(calls.length).toBe(0);
  });
});
