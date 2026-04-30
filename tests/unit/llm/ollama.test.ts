import { describe, expect, test } from "bun:test";
import {
  LlmConfigError,
  OllamaError,
  OllamaProvider,
  createLlmProvider,
} from "../../../src/llm/index.ts";

function mockFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): typeof fetch {
  // Real fetch never throws synchronously — every failure surfaces as a
  // promise rejection. Mirror that here so handler-throws (used to fake
  // network errors) become rejections, not sync throws that could mask
  // real-vs-mock divergence in callers.
  return ((url: string | URL | Request, init?: RequestInit) => {
    try {
      return Promise.resolve(handler(String(url), init));
    } catch (err) {
      return Promise.reject(err);
    }
  }) as typeof fetch;
}

/**
 * Returns a fetch that resolves with headers immediately but whose body
 * never produces data — and errors out when the AbortSignal fires. This is
 * the fetch-spec behavior for an aborted request mid-body-read; we simulate
 * it so we can test that timeoutMs bounds body reads on non-streaming calls.
 */
function hangingBodyFetch(): typeof fetch {
  return ((_url: string | URL | Request, init?: RequestInit) => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const signal = init?.signal;
        if (signal?.aborted) {
          controller.error(new DOMException("aborted", "AbortError"));
          return;
        }
        signal?.addEventListener("abort", () => {
          controller.error(new DOMException("aborted", "AbortError"));
        });
        // Never enqueue — caller hangs until abort fires.
      },
    });
    return Promise.resolve(new Response(stream, { status: 200 }));
  }) as typeof fetch;
}

function makeProvider(opts: {
  fetch: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
}): OllamaProvider {
  return new OllamaProvider({
    baseUrl: "http://localhost:11434",
    model: "llama3.1:8b",
    fetch: opts.fetch,
    ...(opts.timeoutMs !== undefined && { timeoutMs: opts.timeoutMs }),
    ...(opts.maxRetries !== undefined && { maxRetries: opts.maxRetries }),
  });
}

describe("OllamaProvider constructor", () => {
  const noopFetch = mockFetch(() => new Response(JSON.stringify({ models: [] }), { status: 200 }));

  test("accepts localhost", () => {
    expect(
      () =>
        new OllamaProvider({
          baseUrl: "http://localhost:11434",
          model: "x",
          fetch: noopFetch,
        }),
    ).not.toThrow();
  });

  test("accepts 127.0.0.1 (and the wider 127.0.0.0/8 block)", () => {
    expect(
      () => new OllamaProvider({ baseUrl: "http://127.0.0.1:11434", model: "x", fetch: noopFetch }),
    ).not.toThrow();
    expect(
      () => new OllamaProvider({ baseUrl: "http://127.5.6.7:11434", model: "x", fetch: noopFetch }),
    ).not.toThrow();
  });

  test("accepts IPv6 ::1", () => {
    expect(
      () => new OllamaProvider({ baseUrl: "http://[::1]:11434", model: "x", fetch: noopFetch }),
    ).not.toThrow();
  });

  test("rejects a remote hostname", () => {
    expect(
      () =>
        new OllamaProvider({
          baseUrl: "https://api.openai.com",
          model: "x",
          fetch: noopFetch,
        }),
    ).toThrow(LlmConfigError);
  });

  test("rejects 0.0.0.0 (wildcard, not loopback)", () => {
    expect(
      () => new OllamaProvider({ baseUrl: "http://0.0.0.0:11434", model: "x", fetch: noopFetch }),
    ).toThrow(LlmConfigError);
  });

  test("rejects malformed URL", () => {
    expect(
      () => new OllamaProvider({ baseUrl: "not a url", model: "x", fetch: noopFetch }),
    ).toThrow(LlmConfigError);
  });

  test("rejects non-http(s) schemes (ws/ftp/file/etc.)", () => {
    // zod's .url() validator accepts any scheme; we only want fetch-able
    // schemes so a typo fails at construction with an actionable message.
    for (const url of ["ws://localhost:11434", "ftp://127.0.0.1:11434", "file:///tmp/socket"]) {
      expect(() => new OllamaProvider({ baseUrl: url, model: "x", fetch: noopFetch })).toThrow(
        LlmConfigError,
      );
    }
  });

  test("accepts https://localhost (TLS proxy in front of Ollama)", () => {
    expect(
      () =>
        new OllamaProvider({ baseUrl: "https://localhost:11434", model: "x", fetch: noopFetch }),
    ).not.toThrow();
  });

  test("rejects numeric-but-invalid 127.* hostnames (e.g. 127.999.0.1)", () => {
    // The previous regex check accepted any "127.\d{1,3}.\d{1,3}.\d{1,3}",
    // which would let "127.999.0.1" through despite not being a valid IPv4
    // address — and could route off-loopback if some resolver accepted it.
    expect(
      () =>
        new OllamaProvider({ baseUrl: "http://127.999.0.1:11434", model: "x", fetch: noopFetch }),
    ).toThrow(LlmConfigError);
    expect(
      () =>
        new OllamaProvider({ baseUrl: "http://127.0.0.300:11434", model: "x", fetch: noopFetch }),
    ).toThrow(LlmConfigError);
  });

  test("rejects baseUrl with a path", () => {
    // "/api/..." is appended downstream; a non-origin baseUrl would
    // silently produce ".../foo/api/tags" instead of ".../api/tags".
    expect(
      () =>
        new OllamaProvider({
          baseUrl: "http://localhost:11434/foo",
          model: "x",
          fetch: noopFetch,
        }),
    ).toThrow(LlmConfigError);
  });

  test("rejects non-positive timeoutMs", () => {
    expect(
      () =>
        new OllamaProvider({
          baseUrl: "http://localhost:11434",
          model: "x",
          fetch: noopFetch,
          timeoutMs: 0,
        }),
    ).toThrow(LlmConfigError);
    expect(
      () =>
        new OllamaProvider({
          baseUrl: "http://localhost:11434",
          model: "x",
          fetch: noopFetch,
          timeoutMs: -100,
        }),
    ).toThrow(LlmConfigError);
    expect(
      () =>
        new OllamaProvider({
          baseUrl: "http://localhost:11434",
          model: "x",
          fetch: noopFetch,
          timeoutMs: 1.5,
        }),
    ).toThrow(LlmConfigError);
  });

  test("rejects negative maxRetries", () => {
    expect(
      () =>
        new OllamaProvider({
          baseUrl: "http://localhost:11434",
          model: "x",
          fetch: noopFetch,
          maxRetries: -1,
        }),
    ).toThrow(LlmConfigError);
    expect(
      () =>
        new OllamaProvider({
          baseUrl: "http://localhost:11434",
          model: "x",
          fetch: noopFetch,
          maxRetries: 1.5,
        }),
    ).toThrow(LlmConfigError);
  });

  test("accepts maxRetries: 0 (no retries, single attempt only)", () => {
    expect(
      () =>
        new OllamaProvider({
          baseUrl: "http://localhost:11434",
          model: "x",
          fetch: noopFetch,
          maxRetries: 0,
        }),
    ).not.toThrow();
  });

  test("rejects baseUrl with a query or fragment", () => {
    expect(
      () =>
        new OllamaProvider({
          baseUrl: "http://localhost:11434/?x=1",
          model: "x",
          fetch: noopFetch,
        }),
    ).toThrow(LlmConfigError);
    expect(
      () =>
        new OllamaProvider({
          baseUrl: "http://localhost:11434/#frag",
          model: "x",
          fetch: noopFetch,
        }),
    ).toThrow(LlmConfigError);
  });
});

describe("OllamaProvider.health", () => {
  test("returns model list on 200", async () => {
    const provider = makeProvider({
      fetch: mockFetch(
        () =>
          new Response(JSON.stringify({ models: [{ name: "llama3.1:8b" }, { name: "phi3" }] }), {
            status: 200,
          }),
      ),
    });
    const r = await provider.health();
    expect(r.available).toBe(true);
    expect(r.models).toEqual(["llama3.1:8b", "phi3"]);
  });

  test("returns unavailable on connection error (does not throw)", async () => {
    const provider = makeProvider({
      maxRetries: 0,
      fetch: mockFetch(() => {
        throw new TypeError("fetch failed");
      }),
    });
    const r = await provider.health();
    expect(r.available).toBe(false);
    expect(r.error).toContain("fetch failed");
  });

  test("hits /api/tags", async () => {
    let seenUrl = "";
    const provider = makeProvider({
      fetch: mockFetch((url) => {
        seenUrl = url;
        return new Response(JSON.stringify({ models: [] }), { status: 200 });
      }),
    });
    await provider.health();
    expect(seenUrl).toBe("http://localhost:11434/api/tags");
  });
});

describe("OllamaProvider.generate", () => {
  test("returns text + token counts + duration in ms", async () => {
    const provider = makeProvider({
      fetch: mockFetch(
        () =>
          new Response(
            JSON.stringify({
              model: "llama3.1:8b",
              response: "hello",
              done: true,
              prompt_eval_count: 10,
              eval_count: 5,
              total_duration: 1_500_000_000, // 1.5s in ns
            }),
            { status: 200 },
          ),
      ),
    });
    const r = await provider.generate({ prompt: "say hi" });
    expect(r.text).toBe("hello");
    expect(r.model).toBe("llama3.1:8b");
    expect(r.promptTokens).toBe(10);
    expect(r.responseTokens).toBe(5);
    expect(r.totalDurationMs).toBe(1500);
  });

  test("forwards model/system/format/options in request body", async () => {
    let seenBody: Record<string, unknown> = {};
    const provider = makeProvider({
      fetch: mockFetch((_url, init) => {
        seenBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ model: "x", response: "ok", done: true }), {
          status: 200,
        });
      }),
    });
    await provider.generate({
      model: "phi3",
      prompt: "p",
      system: "s",
      format: "json",
      options: { temperature: 0 },
    });
    expect(seenBody).toEqual({
      model: "phi3",
      prompt: "p",
      stream: false,
      system: "s",
      format: "json",
      options: { temperature: 0 },
    });
  });

  test("retries 5xx and eventually succeeds", async () => {
    let calls = 0;
    const provider = makeProvider({
      timeoutMs: 5000,
      maxRetries: 2,
      fetch: mockFetch(() => {
        calls++;
        if (calls < 2) return new Response("Internal Server Error", { status: 500 });
        return new Response(JSON.stringify({ model: "x", response: "ok", done: true }), {
          status: 200,
        });
      }),
    });
    const r = await provider.generate({ prompt: "test" });
    expect(r.text).toBe("ok");
    expect(calls).toBe(2);
  });

  test("does not retry on JSON parse failure (non-transient)", async () => {
    // res.json() throws SyntaxError; that's a content/protocol bug, not a
    // transient network failure. Burning retries on it just delays the
    // inevitable.
    let calls = 0;
    const provider = makeProvider({
      maxRetries: 3,
      fetch: mockFetch(() => {
        calls++;
        return new Response("definitely {{not json", { status: 200 });
      }),
    });
    await expect(provider.generate({ prompt: "test" })).rejects.toThrow();
    expect(calls).toBe(1);
  });

  test("does not retry 4xx", async () => {
    let calls = 0;
    const provider = makeProvider({
      maxRetries: 3,
      fetch: mockFetch(() => {
        calls++;
        return new Response("model not found", { status: 404 });
      }),
    });
    await expect(provider.generate({ prompt: "test" })).rejects.toBeInstanceOf(OllamaError);
    expect(calls).toBe(1);
  });

  test("retries network errors and gives up after maxRetries", async () => {
    let calls = 0;
    const provider = makeProvider({
      timeoutMs: 5000,
      maxRetries: 2,
      fetch: mockFetch(() => {
        calls++;
        throw new TypeError("ECONNREFUSED");
      }),
    });
    await expect(provider.generate({ prompt: "test" })).rejects.toThrow(/ECONNREFUSED/);
    // 1 initial + 2 retries
    expect(calls).toBe(3);
  });

  test("respects timeoutMs across retries", async () => {
    const start = Date.now();
    const provider = makeProvider({
      timeoutMs: 250,
      maxRetries: 5,
      fetch: mockFetch(() => {
        throw new TypeError("ECONNREFUSED");
      }),
    });
    await expect(provider.generate({ prompt: "test" })).rejects.toThrow();
    const elapsed = Date.now() - start;
    // Deadline is 250ms; allow generous slack for CI scheduling jitter.
    expect(elapsed).toBeLessThan(2000);
  });

  test("body-read timeout aborts a hanging non-streaming response", async () => {
    // fetch returns 200 but the body never produces — only the body-read
    // deadline can save us. If withRetry cleared the abort timer on header
    // arrival (the previous bug), this test would hang past timeoutMs.
    const provider = makeProvider({
      timeoutMs: 200,
      maxRetries: 0,
      fetch: hangingBodyFetch(),
    });
    const start = Date.now();
    await expect(provider.generate({ prompt: "x" })).rejects.toBeInstanceOf(OllamaError);
    expect(Date.now() - start).toBeLessThan(2000);
  });

  test("wraps aborts with URL + timeout + attempt count context", async () => {
    const provider = makeProvider({
      timeoutMs: 80,
      maxRetries: 1,
      fetch: hangingBodyFetch(),
    });
    try {
      await provider.generate({ prompt: "x" });
      throw new Error("expected provider.generate to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OllamaError);
      const msg = (err as Error).message;
      expect(msg).toContain("/api/generate");
      expect(msg).toMatch(/80ms/);
      expect(msg).toMatch(/attempt \d+\/\d+/);
    }
  });
});

describe("OllamaProvider.generateStream", () => {
  test("yields chunks and a final chunk with usage", async () => {
    const ndjson = [
      JSON.stringify({ model: "x", response: "Hello", done: false }),
      JSON.stringify({ model: "x", response: " world", done: false }),
      JSON.stringify({
        model: "x",
        response: "",
        done: true,
        prompt_eval_count: 4,
        eval_count: 2,
        total_duration: 2_000_000_000,
      }),
      "",
    ].join("\n");
    const provider = makeProvider({
      fetch: mockFetch(() => new Response(ndjson, { status: 200 })),
    });
    const chunks = [];
    for await (const c of provider.generateStream({ prompt: "test" })) chunks.push(c);
    expect(chunks.length).toBe(3);
    expect(chunks[0]?.text).toBe("Hello");
    expect(chunks[0]?.done).toBe(false);
    expect(chunks[0]?.final).toBeUndefined();
    expect(chunks[1]?.text).toBe(" world");
    expect(chunks[2]?.done).toBe(true);
    expect(chunks[2]?.final).toEqual({
      promptTokens: 4,
      responseTokens: 2,
      totalDurationMs: 2000,
    });
  });

  test("handles partial JSON across chunks (split mid-line)", async () => {
    // Body comes back as two pieces with the split happening mid-JSON-line.
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('{"model":"x","resp'));
        c.enqueue(
          new TextEncoder().encode(
            'onse":"hi","done":true,"eval_count":1,"prompt_eval_count":2}\n',
          ),
        );
        c.close();
      },
    });
    const provider = makeProvider({
      fetch: mockFetch(() => new Response(stream, { status: 200 })),
    });
    const chunks = [];
    for await (const c of provider.generateStream({ prompt: "test" })) chunks.push(c);
    expect(chunks.length).toBe(1);
    expect(chunks[0]?.text).toBe("hi");
    expect(chunks[0]?.done).toBe(true);
    expect(chunks[0]?.final?.responseTokens).toBe(1);
  });

  test("throws OllamaError on a malformed NDJSON line", async () => {
    const provider = makeProvider({
      fetch: mockFetch(() => new Response("this is not json\n", { status: 200 })),
    });
    const drain = async () => {
      for await (const _ of provider.generateStream({ prompt: "x" })) {
        // drain
      }
    };
    await expect(drain()).rejects.toBeInstanceOf(OllamaError);
  });

  test("flushes the UTF-8 decoder on stream end (multi-byte split across chunks)", async () => {
    // Encode a final NDJSON line whose response contains a 3-byte UTF-8
    // character (€), then split the bytes so the multi-byte char straddles
    // two chunks. Without decoder flush on `done`, the trailing bytes
    // would be lost and the JSON would fail to parse.
    const fullJson = `${JSON.stringify({ model: "x", response: "€", done: true })}\n`;
    const fullBytes = new TextEncoder().encode(fullJson);
    // The € sign is at the byte position right after `"response":"`. Split
    // mid-multi-byte regardless of where exactly that is — find the first
    // 0xE2 byte (€'s leading byte) and split right after it.
    const splitAt = fullBytes.indexOf(0xe2) + 1;
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(fullBytes.slice(0, splitAt));
        c.enqueue(fullBytes.slice(splitAt));
        c.close();
      },
    });
    const provider = makeProvider({
      fetch: mockFetch(() => new Response(stream, { status: 200 })),
    });
    const chunks = [];
    for await (const c of provider.generateStream({ prompt: "x" })) chunks.push(c);
    expect(chunks.length).toBe(1);
    expect(chunks[0]?.text).toBe("€");
  });

  test("sends stream:true in request body", async () => {
    let seenBody: Record<string, unknown> = {};
    const provider = makeProvider({
      fetch: mockFetch((_url, init) => {
        seenBody = JSON.parse(String(init?.body));
        return new Response('{"model":"x","response":"","done":true}\n', { status: 200 });
      }),
    });
    for await (const _ of provider.generateStream({ prompt: "p" })) {
      // drain
    }
    expect(seenBody.stream).toBe(true);
  });
});

describe("createLlmProvider factory", () => {
  test("provider=ollama returns OllamaProvider", () => {
    const p = createLlmProvider({
      provider: "ollama",
      base_url: "http://localhost:11434",
      model: "x",
    });
    expect(p).toBeInstanceOf(OllamaProvider);
  });

  test("provider=none returns a no-op that reports unavailable and throws on generate", async () => {
    const p = createLlmProvider({
      provider: "none",
      base_url: "http://localhost:11434",
      model: "x",
    });
    const h = await p.health();
    expect(h.available).toBe(false);
    expect(h.error).toContain("provider=none");
    await expect(p.generate({ prompt: "x" })).rejects.toThrow(/none/);
  });
});
