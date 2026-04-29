import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInit } from "../../src/commands/init.ts";
import { lintLinks } from "../../src/obsidian/wikilinks.ts";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "llmwiki-init-"));
}

describe("runInit", () => {
  test("scaffolds expected folders and files", async () => {
    const dir = join(tmp(), "vault");
    const r = await runInit({ vaultPath: dir });
    expect(existsSync(join(dir, "index.md"))).toBe(true);
    expect(existsSync(join(dir, "log.md"))).toBe(true);
    expect(existsSync(join(dir, "source-notes"))).toBe(true);
    expect(existsSync(join(dir, "topics"))).toBe(true);
    expect(r.created.length).toBeGreaterThan(0);
  });

  test("does not overwrite existing files on second run", async () => {
    const dir = join(tmp(), "vault");
    await runInit({ vaultPath: dir });
    const before = readFileSync(join(dir, "index.md"), "utf-8");
    const r2 = await runInit({ vaultPath: dir });
    const after = readFileSync(join(dir, "index.md"), "utf-8");
    expect(after).toBe(before);
    expect(r2.skipped.length).toBeGreaterThan(0);
  });

  test("scaffolded vault passes lintLinks (no broken links)", async () => {
    const dir = join(tmp(), "vault");
    await runInit({ vaultPath: dir });
    const issues = await lintLinks(dir);
    const broken = issues.filter((i) => i.type === "broken-link");
    expect(broken).toEqual([]);
  });
});
