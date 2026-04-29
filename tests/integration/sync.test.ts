import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSync } from "../../src/commands/sync.ts";
import type { ResolvedConfig } from "../../src/core/config.ts";

function tmp(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `llmwiki-sync-${prefix}-`));
}

function buildConfig(sourceDir: string): ResolvedConfig {
  return {
    sources: { allowlist: [sourceDir], excludeGlobs: [] },
    wiki: { path: join(sourceDir, "..", "wiki") },
    scanners: {
      pii_regex: true,
      gitleaks: false,
      fail_on_warn: false,
      business_email_domains: [],
      business_phone_allowlist: [],
    },
    llm: { provider: "ollama", base_url: "http://localhost:11434", model: "test" },
    configPath: null,
  };
}

describe("runSync — end to end", () => {
  let dir: string;
  let ledgerDir: string;
  let ledgerPath: string;

  beforeEach(() => {
    dir = tmp("src");
    ledgerDir = tmp("led");
    ledgerPath = join(ledgerDir, "ledger.db");
  });

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
      rmSync(ledgerDir, { recursive: true, force: true });
    } catch {}
  });

  test("clean source is fully ingested with zero quarantined", async () => {
    writeFileSync(join(dir, "a.md"), "# clean note\n\nNothing sensitive here.");
    writeFileSync(join(dir, "b.txt"), "ordinary text");

    const r = await runSync({ config: buildConfig(dir), ledgerPath, json: true });
    expect(r.counts.new).toBe(2);
    expect(r.counts.quarantined).toBe(0);
    expect(r.exitCode).toBe(0);
  });

  test("synthetic CC quarantines the file and exits non-zero", async () => {
    writeFileSync(join(dir, "leaky.md"), "Card: 4111 1111 1111 1111\n");

    const r = await runSync({ config: buildConfig(dir), ledgerPath, json: true });
    expect(r.counts.quarantined).toBe(1);
    expect(r.quarantined[0]?.path).toBe(join(dir, "leaky.md"));
    expect(r.exitCode).toBe(1);
  });

  test("rename is reported as moved, not delete+new", async () => {
    writeFileSync(join(dir, "a.md"), "stable content");
    await runSync({ config: buildConfig(dir), ledgerPath, json: true });

    rmSync(join(dir, "a.md"));
    writeFileSync(join(dir, "b.md"), "stable content");

    const r2 = await runSync({ config: buildConfig(dir), ledgerPath, json: true });
    expect(r2.counts.moved).toBe(1);
    expect(r2.counts.deleted).toBe(0);
    expect(r2.moves[0]?.from).toMatch(/a\.md$/);
    expect(r2.moves[0]?.to).toMatch(/b\.md$/);
  });

  test("copy is reported as duplicate with canonical pointer", async () => {
    writeFileSync(join(dir, "a.md"), "shared");
    await runSync({ config: buildConfig(dir), ledgerPath, json: true });

    writeFileSync(join(dir, "b.md"), "shared");
    const r2 = await runSync({ config: buildConfig(dir), ledgerPath, json: true });
    expect(r2.counts.duplicate).toBe(1);
    expect(r2.duplicates[0]?.canonical).toMatch(/a\.md$/);
    expect(r2.duplicates[0]?.duplicate).toMatch(/b\.md$/);
  });

  test("re-running on unchanged input is a no-op", async () => {
    writeFileSync(join(dir, "a.md"), "x");
    await runSync({ config: buildConfig(dir), ledgerPath, json: true });
    const r2 = await runSync({ config: buildConfig(dir), ledgerPath, json: true });
    expect(r2.counts.unchanged).toBe(1);
    expect(r2.counts.new).toBe(0);
  });
});
