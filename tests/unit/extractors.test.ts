import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCsv } from "../../src/core/extractors/csv.ts";
import { htmlToText } from "../../src/core/extractors/html.ts";
import { extract } from "../../src/core/extractors/index.ts";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "llmwiki-extract-"));
}

describe("htmlToText", () => {
  test("strips tags and decodes basic entities", () => {
    const out = htmlToText(
      "<html><head><style>a{}</style></head><body><p>Hello&nbsp;<b>world</b> &amp; more</p></body></html>",
    );
    expect(out).toContain("Hello");
    expect(out).toContain("world");
    expect(out).toContain("&");
    expect(out).not.toContain("<");
  });

  test("removes scripts entirely", () => {
    expect(htmlToText("<script>secret=1</script>visible")).not.toContain("secret");
  });
});

describe("parseCsv", () => {
  test("simple rows", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  test("quoted cells with commas", () => {
    expect(parseCsv('a,"b,c",d')).toEqual([["a", "b,c", "d"]]);
  });

  test("escaped quotes", () => {
    expect(parseCsv('"a""b"')).toEqual([['a"b']]);
  });

  test("CRLF line endings", () => {
    expect(parseCsv("a,b\r\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("extract dispatcher", () => {
  test("reads .md as markdown", async () => {
    const dir = tmp();
    const p = join(dir, "x.md");
    writeFileSync(p, "# hi");
    const out = await extract(p);
    expect(out.contentType).toBe("text/markdown");
    expect(out.text).toBe("# hi");
  });

  test("throws on unsupported extension", async () => {
    const dir = tmp();
    const p = join(dir, "x.bin");
    writeFileSync(p, Buffer.from([0, 1, 2]));
    await expect(extract(p)).rejects.toThrow();
  });
});
