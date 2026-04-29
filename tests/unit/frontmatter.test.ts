import { describe, expect, test } from "bun:test";
import { validateFrontmatter } from "../../src/obsidian/frontmatter.ts";

describe("validateFrontmatter", () => {
  test("source-notes requires source_id, hash, ingested", () => {
    const raw = "---\ntitle: missing required\n---\nbody";
    const r = validateFrontmatter("source-notes/x.md", raw);
    expect(r.issues.length).toBeGreaterThan(0);
  });

  test("source-notes with valid frontmatter passes", () => {
    const raw = "---\nsource_id: 42\nhash: abcd1234ef567890\ningested: 2026-04-29\n---\nbody";
    const r = validateFrontmatter("source-notes/x.md", raw);
    expect(r.issues).toEqual([]);
  });

  test("topics requires title", () => {
    const r = validateFrontmatter("topics/x.md", "---\naliases: [a]\n---\n");
    expect(r.issues.some((i) => i.field === "title")).toBe(true);
  });

  test("default schema is permissive", () => {
    expect(validateFrontmatter("misc/x.md", "---\nfoo: bar\n---\n").issues).toEqual([]);
  });

  test("malformed YAML produces a single root issue", () => {
    const r = validateFrontmatter("topics/x.md", "---\n: : :\n---\n");
    expect(r.issues.length).toBeGreaterThan(0);
  });

  test("hash must be hex of length 16+", () => {
    const r = validateFrontmatter(
      "source-notes/x.md",
      "---\nsource_id: 1\nhash: short\ningested: 2026-01-01\n---\n",
    );
    expect(r.issues.some((i) => i.field === "hash")).toBe(true);
  });
});
