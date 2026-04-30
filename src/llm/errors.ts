/**
 * Shared error types for the LLM layer. Lives in its own module so
 * `ollama.ts` and `index.ts` can both import from here without creating a
 * runtime circular import (index.ts → ollama.ts → index.ts).
 */

export class LlmDisabledError extends Error {
  constructor() {
    super("LLM provider is set to 'none'; refusing to call.");
    this.name = "LlmDisabledError";
  }
}

/** Constructor-time validation failure (bad base_url, bad config, etc.). */
export class LlmConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmConfigError";
  }
}
