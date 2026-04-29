import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lintLinks, parseWikilinks } from "../../src/obsidian/wikilinks.ts";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "llmwiki-wl-"));
}

describe("parseWikilinks", () => {
  test("extracts simple targets", () => {
    const links = parseWikilinks("a.md", "see [[Topic]] and [[Other Page]]");
    expect(links.map((l) => l.target)).toEqual(["Topic", "Other Page"]);
  });

  test("strips alias and heading", () => {
    const links = parseWikilinks("a.md", "[[Topic#Heading|alias]]");
    expect(links[0]?.target).toBe("Topic");
  });

  test("ignores empty links", () => {
    expect(parseWikilinks("a.md", "[[]]")).toEqual([]);
  });

  test("captures line numbers", () => {
    const links = parseWikilinks("a.md", "line 1\n[[X]]\nline 3");
    expect(links[0]?.line).toBe(2);
  });
});

describe("lintLinks", () => {
  test("reports broken links", async () => {
    const root = tmp();
    writeFileSync(join(root, "index.md"), "[[Missing]]");
    writeFileSync(join(root, "real.md"), "");
    const issues = await lintLinks(root);
    const broken = issues.filter((i) => i.type === "broken-link");
    expect(broken.length).toBe(1);
    expect(broken[0]?.target).toBe("Missing");
  });

  test("resolves links by basename", async () => {
    const root = tmp();
    mkdirSync(join(root, "topics"));
    writeFileSync(join(root, "index.md"), "[[Topic A]]");
    writeFileSync(join(root, "topics", "Topic A.md"), "");
    const issues = await lintLinks(root);
    expect(issues.filter((i) => i.type === "broken-link")).toEqual([]);
  });

  test("flags orphans except configured roots", async () => {
    const root = tmp();
    writeFileSync(join(root, "index.md"), "");
    writeFileSync(join(root, "lonely.md"), "");
    const issues = await lintLinks(root);
    const orphans = issues.filter((i) => i.type === "orphan");
    expect(orphans.map((o) => o.file)).toEqual(["lonely.md"]);
  });

  test("unresolvedAllowed suppresses specific broken targets", async () => {
    const root = tmp();
    writeFileSync(join(root, "index.md"), "[[FuturePage]]");
    const issues = await lintLinks(root, { unresolvedAllowed: new Set(["FuturePage"]) });
    expect(issues.filter((i) => i.type === "broken-link")).toEqual([]);
  });
});
