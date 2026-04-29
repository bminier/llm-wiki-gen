import { describe, expect, test } from "bun:test";
import { lintDataview } from "../../src/obsidian/dataview.ts";

describe("lintDataview", () => {
  test("accepts a TABLE query", () => {
    const body = "```dataview\nTABLE file.name FROM #x\n```";
    expect(lintDataview("a.md", body)).toEqual([]);
  });

  test("flags missing top-level keyword", () => {
    const body = "```dataview\nWHERE file.name\n```";
    const issues = lintDataview("a.md", body);
    expect(issues.length).toBe(1);
    expect(issues[0]?.message).toMatch(/TABLE/);
  });

  test("flags empty block", () => {
    const body = "```dataview\n\n```";
    expect(lintDataview("a.md", body)[0]?.message).toMatch(/empty/);
  });

  test("flags dataviewjs without dv. references", () => {
    const body = "```dataviewjs\nconsole.log('hi')\n```";
    expect(lintDataview("a.md", body)[0]?.message).toMatch(/dv\.\*/);
  });

  test("accepts dataviewjs that uses dv.", () => {
    const body = "```dataviewjs\ndv.list([1,2])\n```";
    expect(lintDataview("a.md", body)).toEqual([]);
  });

  test("ignores non-dataview fences", () => {
    expect(lintDataview("a.md", "```js\nconsole.log(1)\n```")).toEqual([]);
  });
});
