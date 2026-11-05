/**
 * Port of quizmaster `automation/tests/test_nim_client.py`, against the
 * `nimChat`-based client. Differences from Python's client, by design:
 * - up to 4 requests (nimChat's 1 retry, twice) instead of 5, with shorter
 *   waits, because every call has to fit in a 240 s tick;
 * - `chat_template_kwargs.enable_thinking=false` is sent to every model (the
 *   way `src/lib/nim.ts` already works) and dropped once if a model answers
 *   400, instead of only for `nvidia/nemotron*`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_GEN_MODEL,
  DEFAULT_VERIFY_MODEL,
  DeadlineError,
  MODEL_POOL,
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

// These tests count requests with one key; a local .env may hold the backup.
beforeEach(() => {
  vi.stubEnv("NVIDIA_NIM_API_KEY_2", "");
});

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
    expect(defaults.generate).toBe("nvidia/nemotron-3.5-super-vl-120b-a12b");
    expect(defaults.verify).toBe("mistralai/mistral-large-4-1t-a52b");
    expect(defaults.translate).toBe("nvidia/nemotron-3.5-super-vl-120b-a12b");
    expect(defaults.pool).toEqual(MODEL_POOL);
    expect(MODEL_POOL).toContain(defaults.generate);
    expect(MODEL_POOL).toContain(defaults.verify);
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

describe("failover", () => {
  /** Answers by model: an HTTP status, "hang" (only the abort ends it), or a reply. */
  function byModel(replies: Record<string, number | "hang" | "empty">) {
    const called: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string; signal: AbortSignal }) => {
        const model = JSON.parse(init.body).model as string;
        called.push(model);
        const r = replies[model];
        if (r === "hang") {
          return new Promise<Response>((_, reject) => {
            init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
          });
        }
        if (typeof r === "number") return new Response("{}", { status: r });
        const content = r === "empty" ? "" : `from ${model}`;
        return new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }] }), { status: 200 });
      })
    );
    return called;
  }

  /** Runs `fn` on fake timers, advancing until it settles, so 90 s timeouts pass at once. */
  async function settle<T>(fn: () => Promise<T>): Promise<T> {
    vi.useFakeTimers();
    try {
      const out = fn().then(
        (value) => ({ value }),
        (error: unknown) => ({ error })
      );
      await vi.advanceTimersByTimeAsync(600_000);
      const r = (await out) as { value?: T; error?: unknown };
      if ("error" in r) throw r.error;
      return r.value as T;
    } finally {
      vi.useRealTimers();
    }
  }

  const POOL = ["a/1", "b/1", "c/1"];
  const fast = (log?: (l: string) => void) => new NimClient({ backoffMs: 0, retryDelayMs: 0, log });

  it("a slow model gets company after 45 s, and the first answer wins", async () => {
    vi.stubEnv("NVIDIA_NIM_API_KEY", "k");
    const called = byModel({ "a/1": "hang" });
    const logs: string[] = [];
    let answered = "";
    vi.useFakeTimers();
    try {
      const start = Date.now();
      let at = 0;
      const done = fast((l) => logs.push(l))
        .chat(MESSAGES, { model: "a/1", fallbacks: POOL, onAnswer: (m) => (answered = m) })
        .then((r) => {
          at = Date.now();
          return r;
        });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(await done).toBe("from b/1");
      expect(at - start).toBe(45_000);
    } finally {
      vi.useRealTimers();
    }
    expect(called).toEqual(["a/1", "b/1"]);
    expect(answered).toBe("b/1");
    expect(logs.join("\n")).toContain("no answer after 45s, also asking 1");
  });

  it("a slow model isn't abandoned: it can still win after the next one is asked", async () => {
    vi.stubEnv("NVIDIA_NIM_API_KEY", "k");
    const answerAt: Record<string, number> = { "a/1": 60_000, "b/1": 170_000, "c/1": 170_000 };
    const signals: Record<string, AbortSignal> = {};
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: { body: string; signal: AbortSignal }) => {
        const model = JSON.parse(init.body).model as string;
        signals[model] = init.signal;
        return new Promise<Response>((resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
          setTimeout(
            () => resolve(new Response(JSON.stringify({ choices: [{ message: { content: `from ${model}` }, finish_reason: "stop" }] }))),
            answerAt[model]
          );
        });
      })
    );
    const reply = await settle(() => fast().chat(MESSAGES, { model: "a/1", fallbacks: POOL }));
    expect(reply).toBe("from a/1");
    expect(signals["b/1"]!.aborted).toBe(true); // the loser's request is cancelled
  });

  it("hedge asks several models from the start", async () => {
    vi.stubEnv("NVIDIA_NIM_API_KEY", "k");
    const called = byModel({ "a/1": "hang", "b/1": "hang", "c/1": "hang" });
    vi.useFakeTimers();
    try {
      const out = fast()
        .chat(MESSAGES, { model: "a/1", fallbacks: POOL, hedge: 2 })
        .catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(called).toEqual(["a/1", "b/1"]);
      await vi.advanceTimersByTimeAsync(600_000);
      await out;
    } finally {
      vi.useRealTimers();
    }
  });

  it("no request outlives the tick, however many models are asked", async () => {
    vi.stubEnv("NVIDIA_NIM_API_KEY", "k");
    byModel({ "a/1": "hang", "b/1": "hang", "c/1": "hang" });
    vi.useFakeTimers();
    try {
      const start = Date.now();
      let at = 0;
      const c = new NimClient({ deadline: start + 240_000, backoffMs: 0, retryDelayMs: 0 });
      const out = c
        .chat(MESSAGES, { model: "a/1", fallbacks: POOL })
        .catch((e: unknown) => e)
        .then((e) => {
          at = Date.now();
          return e;
        });
      await vi.advanceTimersByTimeAsync(300_000);
      expect(await out).toBeInstanceOf(DeadlineError);
      expect(at - start).toBeLessThanOrEqual(240_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([404, 410, 429, 500, 503])("status %i moves to the next model", async (status) => {
    vi.stubEnv("NVIDIA_NIM_API_KEY", "k");
    byModel({ "a/1": status });
    expect(await fast().chat(MESSAGES, { model: "a/1", fallbacks: POOL })).toBe("from b/1");
  });

  it("an empty reply moves to the next model", async () => {
    vi.stubEnv("NVIDIA_NIM_API_KEY", "k");
    const called = byModel({ "a/1": "empty" });
    expect(await fast().chat(MESSAGES, { model: "a/1", fallbacks: POOL })).toBe("from b/1");
    expect(called).toEqual(["a/1", "b/1"]);
  });

  it("a bad key doesn't fail over: every model would answer the same", async () => {
    vi.stubEnv("NVIDIA_NIM_API_KEY", "k");
    const called = byModel({ "a/1": 401 });
    await expect(fast().chat(MESSAGES, { model: "a/1", fallbacks: POOL })).rejects.toMatchObject({ code: "auth" });
    expect(called).toEqual(["a/1"]);
  });

  it("an excluded family is never called, even as the first choice", async () => {
    vi.stubEnv("NVIDIA_NIM_API_KEY", "k");
    const called = byModel({});
    const reply = await fast().chat(MESSAGES, { model: "b/1", fallbacks: ["b/2", ...POOL], excludeFamilies: ["b"] });
    expect(reply).toBe("from a/1");
    expect(called).toEqual(["a/1"]);
  });

  it("failover never reaches an excluded family, even when the others fail", async () => {
    vi.stubEnv("NVIDIA_NIM_API_KEY", "k");
    const called = byModel({ "a/1": 500, "c/1": 500 });
    await expect(fast().chat(MESSAGES, { model: "a/1", fallbacks: POOL, excludeFamilies: ["b"] })).rejects.toMatchObject({
      code: "server",
    });
    expect(called).not.toContain("b/1");
  });

  it("models that timed out are skipped by later calls in the tick", async () => {
    vi.stubEnv("NVIDIA_NIM_API_KEY", "k");
    const called = byModel({ "a/1": "hang", "b/1": "hang", "c/1": "hang" });
    const c = fast();
    await expect(settle(() => c.chat(MESSAGES, { model: "a/1", fallbacks: POOL }))).rejects.toBeInstanceOf(DeadlineError);
    called.length = 0;
    await expect(c.chat(MESSAGES, { model: "a/1", fallbacks: POOL })).rejects.toBeInstanceOf(DeadlineError);
    expect(called).toEqual([]);
    // A new client is a new tick: they get another chance.
    byModel({});
    expect(await fast().chat(MESSAGES, { model: "a/1", fallbacks: POOL })).toBe("from a/1");
  });

  it("a model that refused a request is skipped by later calls in the tick", async () => {
    vi.stubEnv("NVIDIA_NIM_API_KEY", "k");
    const called = byModel({ "a/1": 404 });
    const c = fast();
    await c.chat(MESSAGES, { model: "a/1", fallbacks: POOL });
    called.length = 0;
    expect(await c.chat(MESSAGES, { model: "a/1", fallbacks: POOL })).toBe("from b/1");
    expect(called).toEqual(["b/1"]);
  });

  it("every model timing out ends the tick rather than failing the unit", async () => {
    vi.stubEnv("NVIDIA_NIM_API_KEY", "k");
    const called = byModel({ "a/1": "hang", "b/1": "hang", "c/1": "hang" });
    await expect(settle(() => fast().chat(MESSAGES, { model: "a/1", fallbacks: POOL }))).rejects.toBeInstanceOf(DeadlineError);
    expect(called).toEqual(POOL); // each once
  });

  it("a model that errors gets a second pass, 429s and 5xx may recover", async () => {
    vi.stubEnv("NVIDIA_NIM_API_KEY", "k");
    const called = byModel({ "a/1": 503, "b/1": 503 });
    await expect(fast().chat(MESSAGES, { model: "a/1", fallbacks: ["b/1"] })).rejects.toMatchObject({ code: "server" });
    expect(called.length).toBe(8); // 2 requests per model, 2 passes
  });

  it("a request cut short by the tick doesn't count against the model", async () => {
    vi.stubEnv("NVIDIA_NIM_API_KEY", "k");
    const called = byModel({ "a/1": "hang" });
    vi.useFakeTimers();
    try {
      const c = new NimClient({ deadline: Date.now() + 40_000, backoffMs: 0, retryDelayMs: 0 });
      const out = c.chat(MESSAGES, { model: "a/1", fallbacks: POOL }).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(40_000);
      expect(await out).toBeInstanceOf(DeadlineError);
      expect(called).toEqual(["a/1"]); // no switch: the next tick tries a/1 again
    } finally {
      vi.useRealTimers();
    }
  });
});
