import { readFile } from "node:fs/promises";
import pc from "picocolors";
import { Allowlist } from "../core/allowlist.ts";
import type { ResolvedConfig } from "../core/config.ts";
import { extract, isSupported } from "../core/extractors/index.ts";
import { Ledger } from "../core/ledger.ts";
import { type ReconcileResult, type ReconcileSummary, reconcile } from "../core/reconciler.ts";
import { walk } from "../core/walker.ts";
import { type PiiFinding, scanPii } from "../scanners/pii-regex.ts";

export interface SyncOptions {
  config: ResolvedConfig;
  ledgerPath?: string | undefined;
  json?: boolean;
  explainDups?: boolean;
}

export interface SyncReport {
  counts: {
    new: number;
    unchanged: number;
    changed: number;
    moved: number;
    duplicate: number;
    deleted: number;
    quarantined: number;
  };
  quarantined: { path: string; findings: { ruleId: string; line: number }[] }[];
  duplicates: { canonical: string; duplicate: string; hash: string }[];
  moves: { from: string; to: string }[];
  warnings: { path: string; ruleId: string; line: number }[];
  exitCode: number;
}

export async function runSync(opts: SyncOptions): Promise<SyncReport> {
  const ledger = Ledger.open(opts.ledgerPath);
  const allowlist = new Allowlist(opts.config.sources.allowlist);
  const ts = Date.now();
  const runId = ledger.startRun("sync", ts);

  try {
    const walked = await walk(allowlist, {
      excludeGlobs: opts.config.sources.excludeGlobs,
    });

    const summary = reconcile(ledger, walked, ts);
    const report = await scanResults(summary, ledger, opts.config, ts);

    if (opts.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      printSummary(report, opts.explainDups ?? false);
    }

    ledger.finishRun(runId, Date.now(), report.exitCode, JSON.stringify(report.counts));
    return report;
  } finally {
    ledger.close();
  }
}

async function scanResults(
  summary: ReconcileSummary,
  ledger: Ledger,
  config: ResolvedConfig,
  ts: number,
): Promise<SyncReport> {
  const counts = {
    new: 0,
    unchanged: 0,
    changed: 0,
    moved: 0,
    duplicate: 0,
    deleted: 0,
    quarantined: 0,
  };
  const quarantined: SyncReport["quarantined"] = [];
  const duplicates: SyncReport["duplicates"] = [];
  const moves: SyncReport["moves"] = [];
  const warnings: SyncReport["warnings"] = [];

  for (const r of summary.results) {
    counts[r.status]++;
    if (r.status === "duplicate" && r.canonicalId !== undefined) {
      const canon = ledger.getSourceById(r.canonicalId);
      if (canon)
        duplicates.push({ canonical: canon.path, duplicate: r.row.path, hash: r.row.hash });
    }
    if (r.status === "moved" && r.movedFrom) {
      moves.push({ from: r.movedFrom, to: r.row.path });
    }

    const shouldScan = config.scanners.pii_regex && needsScan(r);
    if (!shouldScan) continue;
    if (!isSupported(r.row.path)) continue;

    let findings: PiiFinding[] = [];
    try {
      const extracted = await extract(r.row.path);
      findings = scanPii(extracted.text, {
        businessEmailDomains: config.scanners.business_email_domains,
        businessPhoneAllowlist: config.scanners.business_phone_allowlist,
      });
    } catch {
      // If extraction fails, fall back to raw text.
      try {
        const raw = await readFile(r.row.path, "utf-8");
        findings = scanPii(raw, {
          businessEmailDomains: config.scanners.business_email_domains,
          businessPhoneAllowlist: config.scanners.business_phone_allowlist,
        });
      } catch {
        // ignore
      }
    }

    const denyHits = findings.filter((f) => f.severity === "deny");
    const warnHits = findings.filter((f) => f.severity === "warn");

    for (const f of findings) {
      ledger.recordScan({
        source_id: r.row.source_id,
        scanner: "pii-regex",
        severity: f.severity,
        finding: `${f.ruleId}: ${redact(f.match)}`,
        line: f.line,
        ts,
      });
    }

    if (denyHits.length > 0) {
      ledger.setStatus(r.row.source_id, "quarantined");
      counts[r.status]--;
      counts.quarantined++;
      quarantined.push({
        path: r.row.path,
        findings: denyHits.map((f) => ({ ruleId: f.ruleId, line: f.line })),
      });
    }

    for (const w of warnHits) {
      warnings.push({ path: r.row.path, ruleId: w.ruleId, line: w.line });
    }
  }

  counts.deleted = summary.deleted.length;

  const exitCode =
    quarantined.length > 0 || (config.scanners.fail_on_warn && warnings.length > 0) ? 1 : 0;

  return { counts, quarantined, duplicates, moves, warnings, exitCode };
}

function needsScan(r: ReconcileResult): boolean {
  if (r.status === "new" || r.status === "changed") return true;
  // Moves of clean content (hash unchanged) skip re-scan; first-time moves
  // never happen — moved implies firstTime=false.
  return false;
}

/** Replace the middle of a match with `…` so logs do not store full PII. */
function redact(s: string): string {
  if (s.length <= 6) return "*".repeat(s.length);
  return `${s.slice(0, 2)}…${s.slice(-2)}`;
}

function printSummary(report: SyncReport, explainDups: boolean): void {
  const c = report.counts;
  const parts = [
    `${pc.green(`+${c.new} new`)}`,
    `${pc.yellow(`~${c.changed} changed`)}`,
    `${pc.cyan(`→${c.moved} moved`)}`,
    `${pc.gray(`=${c.duplicate} duplicate`)}`,
    `${pc.gray(`-${c.deleted} deleted`)}`,
  ];
  if (c.quarantined > 0) parts.push(pc.red(`${c.quarantined} quarantined`));
  process.stdout.write(`${parts.join(", ")}\n`);

  if (report.warnings.length > 0) {
    process.stdout.write(pc.yellow(`\n${report.warnings.length} WARN:\n`));
    for (const w of report.warnings) {
      process.stdout.write(`  ${w.path}:${w.line}  [${w.ruleId}]\n`);
    }
  }

  if (report.quarantined.length > 0) {
    process.stdout.write(pc.red(`\n${report.quarantined.length} QUARANTINED (DENY):\n`));
    for (const q of report.quarantined) {
      process.stdout.write(`  ${q.path}\n`);
      for (const f of q.findings) {
        process.stdout.write(`    line ${f.line}  [${f.ruleId}]\n`);
      }
    }
  }

  if (explainDups && report.duplicates.length > 0) {
    process.stdout.write(pc.gray("\nDuplicates (canonical → duplicate):\n"));
    for (const d of report.duplicates) {
      process.stdout.write(`  ${d.canonical}\n  → ${d.duplicate}  (${d.hash.slice(0, 12)}…)\n`);
    }
  }
}
