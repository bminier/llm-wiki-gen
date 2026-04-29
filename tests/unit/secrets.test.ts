import { describe, expect, test } from "bun:test";
import { parseGitleaksJson } from "../../src/scanners/secrets.ts";

describe("parseGitleaksJson", () => {
  test("returns empty array for empty input", () => {
    expect(parseGitleaksJson("")).toEqual([]);
    expect(parseGitleaksJson("   ")).toEqual([]);
  });

  test("returns empty array for malformed JSON", () => {
    expect(parseGitleaksJson("{not json")).toEqual([]);
  });

  test("returns empty array for non-array JSON", () => {
    expect(parseGitleaksJson('{"foo":1}')).toEqual([]);
  });

  test("parses gitleaks v8 finding shape", () => {
    const json = JSON.stringify([
      {
        RuleID: "aws-access-token",
        Description: "AWS",
        Match: "AKIAIOSFODNN7EXAMPLE",
        File: "src/foo.ts",
        StartLine: 12,
        Secret: "AKIAIOSFODNN7EXAMPLE",
      },
    ]);
    const out = parseGitleaksJson(json);
    expect(out).toEqual([
      {
        ruleId: "aws-access-token",
        description: "AWS",
        match: "AKIAIOSFODNN7EXAMPLE",
        file: "src/foo.ts",
        line: 12,
        secret: "AKIAIOSFODNN7EXAMPLE",
      },
    ]);
  });
});
