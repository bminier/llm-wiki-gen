import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Allowlist, AllowlistViolation } from "../../src/core/allowlist.ts";

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "llmwiki-allowlist-"));
}

describe("Allowlist", () => {
  test("contains() is true for files under a root", () => {
    const root = makeTempDir();
    writeFileSync(join(root, "a.txt"), "x");
    const al = new Allowlist([root]);
    expect(al.contains(join(root, "a.txt"))).toBe(true);
  });

  test("contains() is false for sibling paths", () => {
    const a = makeTempDir();
    const b = makeTempDir();
    const al = new Allowlist([a]);
    expect(al.contains(join(b, "x.txt"))).toBe(false);
  });

  test("assertContains() throws AllowlistViolation for outsiders", () => {
    const root = makeTempDir();
    const al = new Allowlist([root]);
    expect(() => al.assertContains("/definitely/not/here")).toThrow(AllowlistViolation);
  });

  test("symlink that escapes the root is rejected", () => {
    const root = makeTempDir();
    const outside = makeTempDir();
    writeFileSync(join(outside, "secret.txt"), "x");
    const linkPath = join(root, "escape");
    try {
      symlinkSync(outside, linkPath, "dir");
    } catch {
      // Windows without dev-mode/admin can't symlink. Skip silently.
      return;
    }
    const al = new Allowlist([root]);
    expect(al.contains(join(linkPath, "secret.txt"))).toBe(false);
  });

  test("nested directory is contained", () => {
    const root = makeTempDir();
    const nested = join(root, "a", "b", "c");
    mkdirSync(nested, { recursive: true });
    const al = new Allowlist([root]);
    expect(al.contains(nested)).toBe(true);
  });
});
