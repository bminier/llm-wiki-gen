import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { expandAndResolve, expandHome } from "../../src/core/paths.ts";

describe("expandHome", () => {
  test("expands bare ~", () => {
    expect(expandHome("~")).toBe(homedir());
  });

  test("expands ~/ prefix", () => {
    expect(expandHome("~/foo/bar")).toBe(resolve(homedir(), "foo/bar"));
  });

  test("leaves non-tilde paths alone", () => {
    expect(expandHome("/abs/path")).toBe("/abs/path");
    expect(expandHome("relative/path")).toBe("relative/path");
  });

  test("does not expand mid-string ~", () => {
    expect(expandHome("/foo/~bar")).toBe("/foo/~bar");
  });
});

describe("expandAndResolve", () => {
  test("resolves relative to cwd", () => {
    expect(expandAndResolve("foo", "/base")).toBe(resolve("/base", "foo"));
  });

  test("expands then resolves ~ paths", () => {
    expect(expandAndResolve("~/x", "/ignored")).toBe(resolve(homedir(), "x"));
  });
});
