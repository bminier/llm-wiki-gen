import type { ResolvedConfig } from "../core/config.ts";
import { OllamaProvider } from "./ollama.ts";

export interface LlmHealth {
  available: boolean;
  /** Model names the provider reports as available. Empty when unavailable. */
  models: string[];
  /** Populated when `available` is false. */
  error?: string;
}

export interface GenerateRequest {
  /** Optional override; falls back to the provider's configured model. */
  model?: string;
  prompt: string;
  /** Optional system prompt prepended by the provider. */
  system?: string;
  /**
   * Force structured output. `"json"` requests free-form JSON; an object is
   * passed through as a JSON Schema (Ollama supports both). Callers that need
   * a specific shape should pass the schema and validate the response.
   */
  format?: "json" | Record<string, unknown>;
  /** Provider-specific generation options (temperature, top_p, num_ctx, …). */
  options?: Record<string, unknown>;
}

export interface GenerateUsage {
  promptTokens: number;
  responseTokens: number;
  totalDurationMs: number;
}

export interface GenerateResponse extends GenerateUsage {
  text: string;
  model: string;
}

export interface GenerateChunk {
  text: string;
  done: boolean;
  /** Populated only on the final chunk. */
  final?: GenerateUsage;
}

export interface LlmProvider {
  /** Cheap reachability check. Never throws — returns `available: false` on error. */
  health(): Promise<LlmHealth>;
  generate(req: GenerateRequest): Promise<GenerateResponse>;
  generateStream(req: GenerateRequest): AsyncIterable<GenerateChunk>;
}

export class LlmDisabledError extends Error {
  constructor() {
    super("LLM provider is set to 'none'; refusing to call.");
    this.name = "LlmDisabledError";
  }
}

class NoOpProvider implements LlmProvider {
  health(): Promise<LlmHealth> {
    return Promise.resolve({ available: false, models: [], error: "provider=none" });
  }
  generate(): Promise<GenerateResponse> {
    return Promise.reject(new LlmDisabledError());
  }
  // biome-ignore lint/correctness/useYield: intentionally throws before yielding.
  async *generateStream(): AsyncIterable<GenerateChunk> {
    throw new LlmDisabledError();
  }
}

export interface ProviderOptions {
  /** Override fetch (used by tests). */
  fetch?: typeof fetch;
  /** Total per-call deadline in ms (request + retries). Default 60000. */
  timeoutMs?: number;
  /** Max retry attempts for transient failures. Default 3. */
  maxRetries?: number;
}

export function createLlmProvider(
  config: ResolvedConfig["llm"],
  opts: ProviderOptions = {},
): LlmProvider {
  switch (config.provider) {
    case "ollama":
      return new OllamaProvider({
        baseUrl: config.base_url,
        model: config.model,
        ...opts,
      });
    case "none":
      return new NoOpProvider();
  }
}

export { OllamaProvider } from "./ollama.ts";
export { OllamaError } from "./ollama.ts";
