import { DENY_RULES, type DenyRule } from "./rules/deny.ts";
import {
  EMAIL_PATTERN,
  PHONE_PATTERN,
  detectAllowList,
  evaluateEmailContext,
  evaluatePhoneContext,
} from "./rules/warn.ts";

export type Severity = "deny" | "warn" | "info";

export interface PiiFinding {
  ruleId: string;
  severity: Severity;
  description: string;
  match: string;
  /** 1-based line number. */
  line: number;
  /** 0-based char index in the file. */
  index: number;
}

export interface ScanOptions {
  /** Business email domains: emails on these are downgraded to ALLOW. */
  businessEmailDomains?: readonly string[];
  /** Phone numbers in this list are downgraded to ALLOW. */
  businessPhoneAllowlist?: readonly string[];
  /** Skip WARN/ALLOW evaluation; only run DENY rules. */
  denyOnly?: boolean;
}

export function scanPii(text: string, opts: ScanOptions = {}): PiiFinding[] {
  const findings: PiiFinding[] = [];

  for (const rule of DENY_RULES) {
    runDenyRule(rule, text, findings);
  }

  if (!opts.denyOnly) {
    runEmailRule(text, opts, findings);
    runPhoneRule(text, opts, findings);
  }

  // Stable order: by index, then ruleId for determinism.
  findings.sort((a, b) => a.index - b.index || a.ruleId.localeCompare(b.ruleId));
  return findings;
}

function runDenyRule(rule: DenyRule, text: string, out: PiiFinding[]): void {
  rule.pattern.lastIndex = 0;
  for (const m of text.matchAll(rule.pattern)) {
    const raw = m[0];
    if (rule.validate && !rule.validate(raw)) continue;
    const idx = m.index ?? 0;
    out.push({
      ruleId: rule.id,
      severity: "deny",
      description: rule.description,
      match: raw,
      line: lineOf(text, idx),
      index: idx,
    });
  }
}

function runEmailRule(text: string, opts: ScanOptions, out: PiiFinding[]): void {
  EMAIL_PATTERN.lastIndex = 0;
  for (const m of text.matchAll(EMAIL_PATTERN)) {
    const email = m[0];
    const idx = m.index ?? 0;
    if (detectAllowList(email, opts.businessPhoneAllowlist)) continue;
    const verdict = evaluateEmailContext(email, text, idx, opts.businessEmailDomains ?? []);
    if (verdict === "allow") continue;
    out.push({
      ruleId: "email",
      severity: verdict,
      description: verdict === "warn" ? "Email near personal-context keywords" : "Email address",
      match: email,
      line: lineOf(text, idx),
      index: idx,
    });
  }
}

function runPhoneRule(text: string, opts: ScanOptions, out: PiiFinding[]): void {
  PHONE_PATTERN.lastIndex = 0;
  for (const m of text.matchAll(PHONE_PATTERN)) {
    const phone = m[0];
    const idx = m.index ?? 0;
    if (detectAllowList(phone, opts.businessPhoneAllowlist)) continue;
    const verdict = evaluatePhoneContext(phone, text, idx);
    if (verdict === "allow") continue;
    out.push({
      ruleId: "phone",
      severity: verdict,
      description:
        verdict === "warn" ? "Phone number near personal-context keywords" : "Phone number",
      match: phone,
      line: lineOf(text, idx),
      index: idx,
    });
  }
}

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}
