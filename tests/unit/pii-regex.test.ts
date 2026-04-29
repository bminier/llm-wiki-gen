import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { scanPii } from "../../src/scanners/pii-regex.ts";

const FIXTURES = join(import.meta.dir, "..", "fixtures", "pii-samples");
const synthetic = readFileSync(join(FIXTURES, "synthetic.txt"), "utf-8");
const clean = readFileSync(join(FIXTURES, "clean.txt"), "utf-8");

describe("scanPii — DENY tier", () => {
  test("flags US SSN", () => {
    const findings = scanPii(synthetic, { denyOnly: true });
    expect(findings.some((f) => f.ruleId === "us-ssn")).toBe(true);
  });

  test("flags Luhn-valid credit card", () => {
    const findings = scanPii(synthetic, { denyOnly: true });
    const cc = findings.find((f) => f.ruleId === "credit-card");
    expect(cc).toBeTruthy();
    expect(cc?.match.replace(/\s/g, "")).toBe("4111111111111111");
  });

  test("does NOT flag Luhn-invalid 16-digit number", () => {
    const findings = scanPii("Bad card: 4111 1111 1111 1112", { denyOnly: true });
    expect(findings.find((f) => f.ruleId === "credit-card")).toBeFalsy();
  });

  test("flags ABA routing number", () => {
    const findings = scanPii(synthetic, { denyOnly: true });
    expect(findings.some((f) => f.ruleId === "aba-routing" && f.match === "111000025")).toBe(true);
  });

  test("does NOT flag a random 9-digit string that fails ABA checksum", () => {
    const findings = scanPii("Random: 123456789", { denyOnly: true });
    expect(findings.find((f) => f.ruleId === "aba-routing")).toBeFalsy();
  });

  test("flags AWS access key", () => {
    const findings = scanPii(synthetic, { denyOnly: true });
    expect(findings.some((f) => f.ruleId === "aws-access-key")).toBe(true);
  });

  test("flags OpenSSH private key header", () => {
    const findings = scanPii(synthetic, { denyOnly: true });
    expect(findings.some((f) => f.ruleId === "openssh-private-key")).toBe(true);
  });

  test("flags BIP-39 12-word mnemonic", () => {
    const findings = scanPii(synthetic, { denyOnly: true });
    expect(findings.some((f) => f.ruleId === "bip39-mnemonic")).toBe(true);
  });

  test("clean text yields no DENY findings", () => {
    const findings = scanPii(clean, { denyOnly: true });
    expect(findings.length).toBe(0);
  });

  test("rejects invalid SSN areas (000, 666, 9xx)", () => {
    expect(
      scanPii("000-12-3456", { denyOnly: true }).find((f) => f.ruleId === "us-ssn"),
    ).toBeFalsy();
    expect(
      scanPii("666-12-3456", { denyOnly: true }).find((f) => f.ruleId === "us-ssn"),
    ).toBeFalsy();
    expect(
      scanPii("900-12-3456", { denyOnly: true }).find((f) => f.ruleId === "us-ssn"),
    ).toBeFalsy();
  });

  test("findings include line numbers", () => {
    const findings = scanPii("ok\nSSN: 123-45-6789", { denyOnly: true });
    const ssn = findings.find((f) => f.ruleId === "us-ssn");
    expect(ssn?.line).toBe(2);
  });
});

describe("scanPii — WARN/ALLOW tier", () => {
  test("personal-context email is WARN", () => {
    const findings = scanPii("Personal email: alice@gmail.com");
    const f = findings.find((x) => x.ruleId === "email");
    expect(f?.severity).toBe("warn");
  });

  test("business-domain email is suppressed", () => {
    const findings = scanPii("Reach me at brian@example.com for questions.", {
      businessEmailDomains: ["example.com"],
    });
    expect(findings.find((x) => x.ruleId === "email")).toBeFalsy();
  });

  test("personal-context phone is WARN", () => {
    const findings = scanPii("My cell phone: (555) 123-4567");
    const f = findings.find((x) => x.ruleId === "phone");
    expect(f?.severity).toBe("warn");
  });

  test("business-context phone is suppressed", () => {
    const findings = scanPii("Sales office: (555) 123-4567");
    expect(findings.find((x) => x.ruleId === "phone")).toBeFalsy();
  });

  test("explicit phone allowlist suppresses match", () => {
    const findings = scanPii("My cell phone: (555) 123-4567", {
      businessPhoneAllowlist: ["(555) 123-4567"],
    });
    expect(findings.find((x) => x.ruleId === "phone")).toBeFalsy();
  });

  test("denyOnly skips WARN tier rules", () => {
    const findings = scanPii("My cell phone: (555) 123-4567", { denyOnly: true });
    expect(findings.find((x) => x.ruleId === "phone")).toBeFalsy();
  });
});
