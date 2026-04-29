#!/usr/bin/env bun
import { defineCommand, runMain } from "citty";
import { runIngest } from "./commands/ingest.ts";
import { runInit } from "./commands/init.ts";
import { type LintMode, runLint } from "./commands/lint.ts";
import { runSync } from "./commands/sync.ts";
import { loadConfig } from "./core/config.ts";
import { startMcpServer } from "./mcp/server.ts";
import { VERSION } from "./version.ts";

const sync = defineCommand({
  meta: {
    name: "sync",
    description: "Walk source allowlist, update ledger, run scanners.",
  },
  args: {
    config: { type: "string", description: "Path to config.toml" },
    json: { type: "boolean", description: "Emit JSON instead of human output" },
    "explain-dups": { type: "boolean", description: "Print canonical/duplicate path pairs" },
    ledger: { type: "string", description: "Path to ledger.db (overrides default)" },
  },
  async run({ args }) {
    const cfg = loadConfig(args.config ? { configPath: args.config } : {});
    const r = await runSync({
      config: cfg,
      ledgerPath: args.ledger ? args.ledger : undefined,
      json: !!args.json,
      explainDups: !!args["explain-dups"],
    });
    process.exit(r.exitCode);
  },
});

const ingest = defineCommand({
  meta: {
    name: "ingest",
    description: "Run the LLM ingest pipeline. v0.1: stub (use --dry-run).",
  },
  args: {
    config: { type: "string", description: "Path to config.toml" },
    "dry-run": { type: "boolean", description: "Print plan and exit 0" },
    json: { type: "boolean", description: "Emit JSON" },
    ledger: { type: "string", description: "Path to ledger.db" },
  },
  async run({ args }) {
    const cfg = loadConfig(args.config ? { configPath: args.config } : {});
    const code = runIngest({
      config: cfg,
      ledgerPath: args.ledger ? args.ledger : undefined,
      dryRun: !!args["dry-run"],
      json: !!args.json,
    });
    process.exit(code);
  },
});

const lint = defineCommand({
  meta: {
    name: "lint",
    description: "Validate frontmatter, wikilinks, and dataview blocks in the wiki vault.",
  },
  args: {
    config: { type: "string", description: "Path to config.toml" },
    wiki: { type: "string", description: "Override the wiki vault path" },
    json: { type: "boolean", description: "Emit JSON" },
    "frontmatter-only": { type: "boolean" },
    "wikilinks-only": { type: "boolean" },
    "dataview-only": { type: "boolean" },
  },
  async run({ args }) {
    const cfg = loadConfig(args.config ? { configPath: args.config } : {});
    const mode: LintMode = args["frontmatter-only"]
      ? "frontmatter"
      : args["wikilinks-only"]
        ? "wikilinks"
        : args["dataview-only"]
          ? "dataview"
          : "all";
    const r = await runLint({
      vaultPath: args.wiki ? String(args.wiki) : cfg.wiki.path,
      mode,
      json: !!args.json,
    });
    process.exit(r.exitCode);
  },
});

const init = defineCommand({
  meta: {
    name: "init",
    description: "Scaffold an empty Obsidian vault for use with this tool.",
  },
  args: {
    path: {
      type: "positional",
      required: false,
      description: "Vault directory (defaults to wiki.path from config)",
    },
    config: { type: "string" },
  },
  async run({ args }) {
    const cfg = loadConfig(args.config ? { configPath: args.config } : {});
    const target = args.path ? String(args.path) : cfg.wiki.path;
    await runInit({ vaultPath: target });
  },
});

const mcp = defineCommand({
  meta: {
    name: "mcp",
    description: "Start the MCP stdio server.",
  },
  args: {
    config: { type: "string" },
  },
  async run({ args }) {
    const cfg = loadConfig(args.config ? { configPath: args.config } : {});
    await startMcpServer({ config: cfg });
  },
});

const main = defineCommand({
  meta: {
    name: "llm-wiki-gen",
    version: VERSION,
    description:
      "Local-first agent-driven Markdown knowledge base. Implements the Karpathy LLM Wiki pattern.",
  },
  subCommands: { sync, ingest, lint, init, mcp },
});

if (import.meta.main) {
  runMain(main);
}
