import { describe, expect, test } from "bun:test";
import { OllamaError, OllamaProvider, createLlmProvider } from "../../../src/llm/index.ts";

function mockFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): typeof fetch {
  return ((url: string | URL | Request, init?: RequestInit) =>
    Promise.resolve(handler(String(url), init))) as typeof fetch;
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
