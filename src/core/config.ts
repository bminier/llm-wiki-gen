import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { z } from "zod";
import { expandAndResolve } from "./paths.ts";

const SourcesSchema = z.object({
  allowlist: z.array(z.string().min(1)).default(["~/llm-wiki-source"]),
  exclude_globs: z.array(z.string()).default(["**/.DS_Store", "**/node_modules/**", "**/.git/**"]),
});

const WikiSchema = z.object({
  path: z.string().default("~/llm-wiki"),
});

const ScannersSchema = z.object({
  pii_regex: z.boolean().default(true),
  gitleaks: z.boolean().default(true),
  fail_on_warn: z.boolean().default(false),
  business_email_domains: z.array(z.string()).default([]),
  business_phone_allowlist: z.array(z.string()).default([]),
});

const LlmSchema = z.object({
  provider: z.enum(["ollama", "none"]).default("ollama"),
  base_url: z.string().url().default("http://localhost:11434"),
  model: z.string().default("llama3.1:8b"),
});

const RawConfigSchema = z.object({
  sources: SourcesSchema.default(SourcesSchema.parse({})),
  wiki: WikiSchema.default(WikiSchema.parse({})),
  scanners: ScannersSchema.default(ScannersSchema.parse({})),
  llm: LlmSchema.default(LlmSchema.parse({})),
});

export type RawConfig = z.infer<typeof RawConfigSchema>;

export interface ResolvedConfig {
  sources: {
    allowlist: string[]; // absolute paths
    excludeGlobs: string[];
  };
  wiki: {
    path: string; // absolute
  };
  scanners: z.infer<typeof ScannersSchema>;
  llm: z.infer<typeof LlmSchema>;
  /** Path of the config file that was loaded, or null if defaults were used. */
  configPath: string | null;
}

export function defaultConfigPath(): string {
  const xdgConfig = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return join(xdgConfig, "llm-wiki-gen", "config.toml");
}

export function loadConfig(opts: { configPath?: string | undefined } = {}): ResolvedConfig {
  const explicitPath = opts.configPath;
  const candidate = explicitPath ?? defaultConfigPath();
  let raw: unknown;
  let configPath: string | null = null;

  try {
    const text = readFileSync(candidate, "utf-8");
    raw = parseToml(text);
    configPath = candidate;
  } catch (err) {
    if (explicitPath) {
      throw new Error(`config not found at ${candidate}: ${(err as Error).message}`);
    }
    raw = {};
  }

  const parsed = RawConfigSchema.parse(raw);
  return {
    sources: {
      allowlist: parsed.sources.allowlist.map((p) => expandAndResolve(p)),
      excludeGlobs: parsed.sources.exclude_globs,
    },
    wiki: {
      path: expandAndResolve(parsed.wiki.path),
    },
    scanners: parsed.scanners,
    llm: parsed.llm,
    configPath,
  };
}
