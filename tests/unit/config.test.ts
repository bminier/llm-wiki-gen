import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/core/config.ts";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "llmwiki-cfg-"));
}

describe("loadConfig", () => {
  test("returns defaults when no config file exists", () => {
    const cfg = loadConfig({ configPath: undefined });
    expect(cfg.scanners.pii_regex).toBe(true);
    expect(cfg.scanners.gitleaks).toBe(true);
    expect(cfg.llm.provider).toBe("ollama");
    expect(cfg.sources.allowlist.length).toBe(1);
  });

  test("throws when explicit configPath does not exist", () => {
    expect(() => loadConfig({ configPath: "/nonexistent/cfg.toml" })).toThrow();
  });

  test("parses a real TOML file", () => {
    const dir = tmp();
    const path = join(dir, "config.toml");
    writeFileSync(
      path,
      `
[sources]
allowlist = ["${dir.replace(/\\/g, "/")}/sources"]

[wiki]
path = "${dir.replace(/\\/g, "/")}/wiki"

[scanners]
pii_regex = false
gitleaks = true
fail_on_warn = true
business_email_domains = ["example.com"]
`,
    );
    const cfg = loadConfig({ configPath: path });
    expect(cfg.scanners.pii_regex).toBe(false);
    expect(cfg.scanners.fail_on_warn).toBe(true);
    expect(cfg.scanners.business_email_domains).toEqual(["example.com"]);
    expect(cfg.configPath).toBe(path);
  });
});
