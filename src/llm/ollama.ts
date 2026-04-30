import type {
  GenerateChunk,
  GenerateRequest,
  GenerateResponse,
  LlmHealth,
  LlmProvider,
  ProviderOptions,
} from "./index.ts";

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 3;
const RETRY_BASE_MS = 200;

export interface OllamaOptions extends ProviderOptions {
  baseUrl: string;
  model: string;
}

export class OllamaError extends Error {
  /** HTTP status when the failure originated from a non-2xx response. */
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "OllamaError";
    if (status !== undefined) this.status = status;
  }
}

interface OllamaTagsResponse {
  models?: Array<{ name: string }>;
}

interface OllamaGenerateResponse {
  model: string;
  response?: string;
  done?: boolean;
  total_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaProvider implements LlmProvider {
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(opts: OllamaOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.defaultModel = opts.model;
    this.fetchFn = opts.fetch ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  async health(): Promise<LlmHealth> {
    try {
      const res = await this.requestWithRetry(`${this.baseUrl}/api/tags`, { method: "GET" });
      const json = (await res.json()) as OllamaTagsResponse;
      return {
        available: true,
        models: (json.models ?? []).map((m) => m.name),
      };
    } catch (err) {
      return { available: false, models: [], error: (err as Error).message };
    }
  }

  async generate(req: GenerateRequest): Promise<GenerateResponse> {
    const res = await this.requestWithRetry(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(this.generateBody(req, false)),
    });
    const json = (await res.json()) as OllamaGenerateResponse;
    return {
      text: json.response ?? "",
      model: json.model,
      promptTokens: json.prompt_eval_count ?? 0,
      responseTokens: json.eval_count ?? 0,
      totalDurationMs: nsToMs(json.total_duration),
    };
  }

  async *generateStream(req: GenerateRequest): AsyncIterable<GenerateChunk> {
    const res = await this.requestWithRetry(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(this.generateBody(req, true)),
    });
    if (!res.body) throw new OllamaError("Ollama stream response had no body");
    yield* parseNdjsonStream(res.body);
  }

  private generateBody(req: GenerateRequest, stream: boolean): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: req.model ?? this.defaultModel,
      prompt: req.prompt,
      stream,
    };
    if (req.system !== undefined) body.system = req.system;
    if (req.format !== undefined) body.format = req.format;
    if (req.options !== undefined) body.options = req.options;
    return body;
  }

  /**
   * Fetch with: per-attempt AbortController timeout + exponential backoff on
   * transient failures. 4xx is not retried — those indicate a malformed request
   * that retrying won't fix. The total deadline (`timeoutMs`) is shared across
   * the initial attempt and all retries.
   *
   * Once this returns the Response, the body is the caller's responsibility
   * (no further timeout on body read — streaming generation can take minutes).
   */
  private async requestWithRetry(url: string, init: RequestInit): Promise<Response> {
    const deadline = Date.now() + this.timeoutMs;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), remaining);
      try {
        const res = await this.fetchFn(url, { ...init, signal: controller.signal });
        clearTimeout(timer);
        if (res.ok) return res;
        const text = await res.text().catch(() => "");
        const err = new OllamaError(
          `Ollama returned ${res.status}: ${text.trim() || res.statusText}`,
          res.status,
        );
        // Don't retry client errors — the request itself is bad.
        if (res.status >= 400 && res.status < 500) throw err;
        lastErr = err;
      } catch (err) {
        clearTimeout(timer);
        // Re-throw 4xx; everything else is retryable (network errors, abort, 5xx).
        if (err instanceof OllamaError && err.status !== undefined && err.status < 500) {
          throw err;
        }
        lastErr = err;
      }
      if (attempt < this.maxRetries) {
        const backoff = Math.min(deadline - Date.now() - 1, RETRY_BASE_MS * 2 ** attempt);
        if (backoff > 0) await sleep(backoff);
      }
    }
    throw lastErr instanceof Error ? lastErr : new OllamaError("Ollama request failed");
  }
}

function nsToMs(ns: number | undefined): number {
  return ns ? Math.round(ns / 1_000_000) : 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function* parseNdjsonStream(body: ReadableStream<Uint8Array>): AsyncIterable<GenerateChunk> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        const trailing = buffer.trim();
        if (trailing) {
          const parsed = tryParseChunk(trailing);
          if (parsed) yield parsed;
        }
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const parsed = tryParseChunk(line);
        if (parsed) yield parsed;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function tryParseChunk(line: string): GenerateChunk | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let parsed: OllamaGenerateResponse;
  try {
    parsed = JSON.parse(trimmed) as OllamaGenerateResponse;
  } catch {
    return null;
  }
  const text = parsed.response ?? "";
  const done = Boolean(parsed.done);
  if (!done) return { text, done };
  return {
    text,
    done,
    final: {
      promptTokens: parsed.prompt_eval_count ?? 0,
      responseTokens: parsed.eval_count ?? 0,
      totalDurationMs: nsToMs(parsed.total_duration),
    },
  };
}
