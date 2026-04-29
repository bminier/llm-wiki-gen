import { describe, expect, test } from "bun:test";
import { abaValid, luhnValid } from "../../src/scanners/checksums.ts";

describe("luhnValid", () => {
  test("known valid Visa test number", () => {
    expect(luhnValid("4111111111111111")).toBe(true);
  });
  test("known valid Mastercard test number", () => {
    expect(luhnValid("5555555555554444")).toBe(true);
  });
  test("known invalid number (one digit off)", () => {
    expect(luhnValid("4111111111111112")).toBe(false);
  });
  test("rejects non-digits", () => {
    expect(luhnValid("411A111111111111")).toBe(false);
  });
  test("rejects too-short input", () => {
    expect(luhnValid("4111")).toBe(false);
  });
});

describe("abaValid", () => {
  test("known valid ABA (Bank of America Texas)", () => {
    expect(abaValid("111000025")).toBe(true);
  });
  test("rejects all-same digits even if checksum passes", () => {
    expect(abaValid("000000000")).toBe(false);
  });
  test("rejects wrong length", () => {
    expect(abaValid("12345678")).toBe(false);
  });
  test("rejects bad checksum", () => {
    expect(abaValid("111000026")).toBe(false);
  });
});
