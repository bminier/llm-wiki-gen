import pc from "picocolors";
import type { ResolvedConfig } from "../core/config.ts";
import { Ledger } from "../core/ledger.ts";

export interface IngestOptions {
  config: ResolvedConfig;
  ledgerPath?: string | undefined;
  dryRun?: boolean;
  json?: boolean;
}

export interface IngestPlanItem {
  source_id: number;
  path: string;
  status: string;
}

export interface IngestPlan {
  items: IngestPlanItem[];
  message: string;
}

/**
 * v0.1 stub. Reads the ledger, prints the items that would be ingested by a
 * future LLM pipeline, and exits with code 2 unless `--dry-run` is passed.
 *
 * Real implementation lands in v0.2 (milestone: LLM Ingest).
 */
export function planIngest(opts: IngestOptions): IngestPlan {
  const ledger = Ledger.open(opts.ledgerPath);
  try {
    const sources = ledger
      .liveSources()
      .filter((s) => s.status === "new" || s.status === "changed")
      .map((s) => ({ source_id: s.source_id, path: s.path, status: s.status }));
    return {
      items: sources,
      message:
        sources.length === 0
          ? "no sources are pending ingest"
          : `would ingest ${sources.length} source(s) — actual ingest is not implemented in v0.1 (see v0.2 milestone)`,
    };
  } finally {
    ledger.close();
  }
}

export function runIngest(opts: IngestOptions): number {
  const plan = planIngest(opts);

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  } else {
    process.stdout.write(`${pc.bold("ingest plan")}: ${plan.message}\n`);
    for (const item of plan.items) {
      process.stdout.write(`  [${item.status}] ${item.path}\n`);
    }
  }

  if (opts.dryRun) return 0;
  process.stderr.write(
    pc.yellow("ingest is a stub in v0.1; pass --dry-run to print the plan, or wait for v0.2.\n"),
  );
  return 2;
}
