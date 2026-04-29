#!/usr/bin/env bun
/**
 * Pre-commit shim: receives staged file paths via argv and runs the DENY-tier
 * PII regex scan against each. Exits non-zero on any DENY finding.
 */
import { readFile } from "node:fs/promises";
import { scanPii } from "../src/scanners/pii-regex.ts";

const files = process.argv.slice(2);
if (files.length === 0) process.exit(0);

let hits = 0;
for (const f of files) {
  let text = "";
  try {
    text = await readFile(f, "utf-8");
  } catch {
    continue;
  }
  const findings = scanPii(text, { denyOnly: true });
  for (const fnd of findings) {
    process.stderr.write(`${f}:${fnd.line}  [${fnd.ruleId}]  ${fnd.description}\n`);
    hits++;
  }
}

if (hits > 0) {
  process.stderr.write(`\nPII pre-commit: ${hits} DENY-tier finding(s); commit blocked.\n`);
  process.exit(1);
}
process.exit(0);
