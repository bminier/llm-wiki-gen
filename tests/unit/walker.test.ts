import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Allowlist } from "../../src/core/allowlist.ts";
import { globMatches, walk } from "../../src/core/walker.ts";

// realpathSync: macOS symlinks /var/folders → /private/var/folders, but the
// Allowlist resolves symlinks, so the walker emits the /private/... form.
// Resolve up front so test path comparisons match what walk() returns.
function tmp(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), "llmwiki-walk-")));
}

describe("globMatches", () => {
  test("** matches across slashes", () => {
    expect(globMatches("**/node_modules/**", "deep/path/node_modules/foo.js")).toBe(true);
  });
  test("* does not cross slashes", () => {
    expect(globMatches("*.md", "a/b.md")).toBe(false);
    expect(globMatches("*.md", "b.md")).toBe(true);
  });
  test("exact match", () => {
    expect(globMatches("**/.DS_Store", ".DS_Store")).toBe(true);
    expect(globMatches("**/.DS_Store", "sub/.DS_Store")).toBe(true);
  });
});

describe("walk", () => {
  test("yields supported files with content hashes", async () => {
    const root = tmp();
    writeFileSync(join(root, "a.md"), "alpha");
    writeFileSync(join(root, "b.txt"), "beta");
    writeFileSync(join(root, "c.bin"), Buffer.from([0, 1, 2]));
    const al = new Allowlist([root]);
    const files = await walk(al);
    const names = files.map((f) => f.path).sort();
    expect(names.length).toBe(2);
    for (const f of files) {
      expect(f.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(f.size).toBeGreaterThan(0);
    }
  });

  test("hash is deterministic for identical content", async () => {
    const root = tmp();
    writeFileSync(join(root, "a.md"), "same");
    writeFileSync(join(root, "b.md"), "same");
    const al = new Allowlist([root]);
    const files = await walk(al);
    expect(files[0]?.hash).toBe(files[1]?.hash);
  });

  test("excludeGlobs prunes matching files", async () => {
    const root = tmp();
    mkdirSync(join(root, "node_modules"), { recursive: true });
    writeFileSync(join(root, "node_modules", "x.md"), "ignored");
    writeFileSync(join(root, "keep.md"), "ok");
    const al = new Allowlist([root]);
    const files = await walk(al, { excludeGlobs: ["**/node_modules/**"] });
    expect(files.map((f) => f.path)).toEqual([join(root, "keep.md")]);
  });

  test("recurses into subdirectories", async () => {
    const root = tmp();
    mkdirSync(join(root, "sub"), { recursive: true });
    writeFileSync(join(root, "sub", "x.md"), "x");
    const al = new Allowlist([root]);
    const files = await walk(al);
    expect(files.length).toBe(1);
  });
});
