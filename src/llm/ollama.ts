import { isIP } from "node:net";
import { LlmConfigError } from "./errors.ts";
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

/**
 * Loopback origins the OllamaProvider will accept. The README/SECURITY
 * promise is "no outbound network calls"; enforce that in code so a typo
 * or malicious config can't quietly turn the LLM client into an exfil
 * channel. Allowing a remote endpoint requires a code change here.
 *
 * Validates: hostname is a real loopback (uses node:net `isIP` so
 * "127.999.0.1" is rejected as invalid IPv4), and the URL is bare-origin
 * (no path/query/fragment, since later code joins "/api/...").
 */
function assertLoopbackUrl(urlStr: string): void {
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    throw new LlmConfigError(`Ollama baseUrl is not a valid URL: ${urlStr}`);
  }
  // URL.hostname keeps IPv6 brackets in some runtimes and strips them in
  // others. Normalize so isIP() sees the bare address.
  const host = url.hostname.replace(/^\[/, "").replace(/]$/, "");
  const ipv = isIP(host);
  const isLoopback =
    host === "localhost" || (ipv === 4 && host.startsWith("127.")) || (ipv === 6 && host === "::1");
  if (!isLoopback) {
    throw new LlmConfigError(
      `Ollama baseUrl must be loopback (localhost, 127.0.0.0/8, ::1); got "${url.hostname}". Remote LLM endpoints require an explicit code change — see SECURITY.md.`,
    );
  }
  // Reject non-origin URLs: "/api/..." is appended downstream, so a path
  // like "/foo" would silently produce ".../foo/api/tags" (broken request,
  // confusing error). Force the user to supply just the origin.
  if ((url.pathname !== "" && url.pathname !== "/") || url.search || url.hash) {
    throw new LlmConfigError(
      `Ollama baseUrl must be a bare origin (no path/query/fragment); got "${urlStr}".`,
    );
  }
}

export class OllamaProvider implements LlmProvider {
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(opts: OllamaOptions) {
    assertLoopbackUrl(opts.baseUrl);
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
      throw new LlmConfigError(
        `Ollama provider timeoutMs must be a positive integer; got ${timeoutMs}`,
      );
    }
    const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
    if (!Number.isInteger(maxRetries) || maxRetries < 0) {
      throw new LlmConfigError(
        `Ollama provider maxRetries must be a non-negative integer; got ${maxRetries}`,
      );
    }
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.defaultModel = opts.model;
    this.fetchFn = opts.fetch ?? fetch;
    this.timeoutMs = timeoutMs;
    this.maxRetries = maxRetries;
  }

  async health(): Promise<LlmHealth> {
    try {
      const json = await this.requestJson<OllamaTagsResponse>(`${this.baseUrl}/api/tags`, {
        method: "GET",
      });
      return {
        available: true,
        models: (json.models ?? []).map((m) => m.name),
      };
    } catch (err) {
      return { available: false, models: [], error: (err as Error).message };
    }
  }

  async generate(req: GenerateRequest): Promise<GenerateResponse> {
    const json = await this.requestJson<OllamaGenerateResponse>(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(this.generateBody(req, false)),
    });
    return {
      text: json.response ?? "",
      model: json.model,
      promptTokens: json.prompt_eval_count ?? 0,
      responseTokens: json.eval_count ?? 0,
      totalDurationMs: nsToMs(json.total_duration),
    };
  }

  async *generateStream(req: GenerateRequest): AsyncIterable<GenerateChunk> {
    const res = await this.requestStream(`${this.baseUrl}/api/generate`, {
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
   * Non-streaming request: fetch + body read happen inside the same retry
   * attempt, so the per-attempt deadline bounds *both* phases. A stalled
   * body would otherwise hang past the configured timeoutMs.
   */
  private requestJson<T>(url: string, init: RequestInit): Promise<T> {
    return this.withRetry(async (signal) => {
      const res = await this.fetchFn(url, { ...init, signal });
      if (!res.ok) throw await this.toResponseError(res);
      return (await res.json()) as T;
    }, url);
  }

  /**
   * Streaming request: the deadline applies to the fetch initiation only
   * (header arrival). Once the Response is in hand the abort timer is
   * cleared — caller is on its own for body-drain time, which is
   * intentional because generation can legitimately take minutes.
   */
  private requestStream(url: string, init: RequestInit): Promise<Response> {
    return this.withRetry(async (signal) => {
      const res = await this.fetchFn(url, { ...init, signal });
      if (!res.ok) throw await this.toResponseError(res);
      return res;
    }, url);
  }

  private async toResponseError(res: Response): Promise<OllamaError> {
    const text = await res.text().catch(() => "");
    return new OllamaError(
      `Ollama returned ${res.status}: ${text.trim() || res.statusText}`,
      res.status,
    );
  }

  /**
   * Shared deadline + exponential backoff. The deadline (`timeoutMs`) covers
   * the initial attempt and all retries combined; each attempt receives the
   * remaining budget as its individual abort signal. 4xx errors are not
   * retried — they signal a bad request, not a transient failure. Abort-like
   * errors are rewrapped into an OllamaError that carries URL + timeout +
   * attempt count so failures are actionable.
   */
  private async withRetry<T>(
    attempt: (signal: AbortSignal) => Promise<T>,
    url: string,
  ): Promise<T> {
    const deadline = Date.now() + this.timeoutMs;
    let lastErr: unknown;
    for (let i = 0; i <= this.maxRetries; i++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), remaining);
      try {
        const result = await attempt(controller.signal);
        clearTimeout(timer);
        return result;
      } catch (err) {
        clearTimeout(timer);
        // Narrow retry policy to *transient* failures only:
        //   - abort/timeout (wrap with context)
        //   - server error (OllamaError with status ≥ 500)
        //   - network failure (fetch throws TypeError)
        // Anything else — JSON parse errors, ReferenceError, malformed-NDJSON
        // OllamaError, 4xx — is non-transient. Surface immediately so
        // permanent bugs don't burn retry budget on the way to the same
        // failure.
        if (isAbortLikeError(err)) {
          lastErr = new OllamaError(
            `Ollama request to ${url} timed out after ${this.timeoutMs}ms (attempt ${i + 1}/${this.maxRetries + 1})`,
          );
        } else if (err instanceof OllamaError && err.status !== undefined && err.status >= 500) {
          lastErr = err;
        } else if (err instanceof TypeError) {
          lastErr = err;
        } else {
          throw err;
        }
      }
      if (i < this.maxRetries) {
        const backoff = Math.min(deadline - Date.now() - 1, RETRY_BASE_MS * 2 ** i);
        if (backoff > 0) await sleep(backoff);
      }
    }
    throw lastErr instanceof Error ? lastErr : new OllamaError(`Ollama request to ${url} failed`);
  }
}

function isAbortLikeError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === "AbortError" || err.name === "TimeoutError";
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
        // Flush any pending bytes the decoder is holding (incomplete
        // multi-byte sequence at the tail). Without this, a non-ASCII
        // character split across chunks could be lost.
        buffer += decoder.decode();
        const trailing = buffer.trim();
        if (trailing) yield parseChunk(trailing);
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        yield parseChunk(trimmed);
      }
    }
  } finally {
    // Signal to the underlying body that we don't want any more bytes —
    // important when the consumer breaks out of the for-await early so the
    // HTTP connection closes promptly. cancel() releases the reader lock
    // implicitly. Swallow rejection: the stream may already be done.
    reader.cancel().catch(() => {});
  }
}

function parseChunk(line: string): GenerateChunk {
  let parsed: OllamaGenerateResponse;
  try {
    parsed = JSON.parse(line) as OllamaGenerateResponse;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Non-empty unparseable line is a protocol violation — surface it
    // instead of silently dropping (which would manifest as missing tokens
    // or a missing `final` chunk and look like a model bug).
    throw new OllamaError(`Failed to parse Ollama NDJSON chunk: ${msg}`);
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
