import type { Ledger, SourceRow, SourceStatus } from "./ledger.ts";
import type { WalkedFile } from "./walker.ts";

export interface ReconcileResult {
  /** Final status assigned to this row after reconciliation. */
  status: SourceStatus;
  /** Ledger row at the end of reconciliation. */
  row: SourceRow;
  /** True if this is the first time the (path, hash) pair has been recorded. */
  firstTime: boolean;
  /** For `moved`: the previous path. */
  movedFrom?: string;
  /** For `duplicate`: the canonical row's id. */
  canonicalId?: number;
}

export interface ReconcileSummary {
  results: ReconcileResult[];
  /** Rows in the ledger marked deleted in this run. */
  deleted: SourceRow[];
}

/**
 * Two-pass reconciler. Given the staged WalkedFile set and the current ledger,
 * decide each row's status (new | unchanged | changed | moved | duplicate)
 * and mark anything no longer present as deleted.
 *
 * Status semantics:
 *   new        — path is unseen, hash is unseen
 *   unchanged  — path matches, hash matches
 *   changed    — path matches, hash differs
 *   moved      — path is unseen, hash matches a previously-live row whose path is now gone
 *   duplicate  — path is unseen, hash matches a still-live (non-duplicate) row
 *   deleted    — was in ledger, no longer in walked set, and not claimed by a move
 *
 * Canonical pick when two new files share the same hash within the same run:
 * lexicographically-smallest path wins.
 */
export function reconcile(
  ledger: Ledger,
  staged: readonly WalkedFile[],
  ts: number,
): ReconcileSummary {
  const stagedByPath = new Map(staged.map((s) => [s.path, s]));
  const stagedByHash = groupByHash(staged);
  const ledgerLive = ledger.liveSources();
  const ledgerByPath = new Map(ledgerLive.map((r) => [r.path, r]));

  // Candidate-deleted: in ledger but absent from staged.
  const candidateDeleted: SourceRow[] = ledgerLive.filter((r) => !stagedByPath.has(r.path));
  const candidateByHash = new Map<string, SourceRow[]>();
  for (const row of candidateDeleted) {
    const list = candidateByHash.get(row.hash) ?? [];
    list.push(row);
    candidateByHash.set(row.hash, list);
  }

  const results: ReconcileResult[] = [];
  const claimedDeletedIds = new Set<number>();

  // Sort hashes so that within a hash group we pick a deterministic canonical.
  const hashes = [...stagedByHash.keys()].sort();
  for (const hash of hashes) {
    const group = stagedByHash.get(hash);
    if (!group) continue;
    // Lexicographically-smallest path wins canonical status.
    group.sort((a, b) => a.path.localeCompare(b.path));

    for (let i = 0; i < group.length; i++) {
      const file = group[i];
      if (!file) continue;
      const existing = ledgerByPath.get(file.path);

      if (existing && existing.hash === file.hash) {
        // unchanged
        results.push({
          status: "unchanged",
          row: ledger.upsertSource({
            path: file.path,
            hash: file.hash,
            size: file.size,
            modified: file.modified,
            content_type: file.contentType,
            status: "unchanged",
            canonical_id: existing.canonical_id,
            last_synced: ts,
          }),
          firstTime: false,
        });
        continue;
      }

      if (existing && existing.hash !== file.hash) {
        // changed
        results.push({
          status: "changed",
          row: ledger.upsertSource({
            path: file.path,
            hash: file.hash,
            size: file.size,
            modified: file.modified,
            content_type: file.contentType,
            status: "changed",
            canonical_id: null,
            last_synced: ts,
          }),
          firstTime: false,
        });
        continue;
      }

      // path is unseen — could be new, moved, or duplicate
      const moveCandidates = candidateByHash.get(file.hash);
      const claimableMove = moveCandidates?.find((c) => !claimedDeletedIds.has(c.source_id));
      if (claimableMove) {
        claimedDeletedIds.add(claimableMove.source_id);
        ledger.movePath(claimableMove.source_id, file.path, ts);
        const row = ledger.getSourceById(claimableMove.source_id);
        if (!row) throw new Error("reconcile: moved row vanished");
        results.push({
          status: "moved",
          row,
          firstTime: false,
          movedFrom: claimableMove.path,
        });
        continue;
      }

      // Hash already canonical-live in the ledger? duplicate.
      const canonical =
        i > 0
          ? // Within this run, the first (lex-smallest) entry is canonical for unseen-hash groups.
            (findCanonicalInResults(results, file.hash) ?? ledger.findCanonicalByHash(file.hash))
          : ledger.findCanonicalByHash(file.hash);

      if (canonical) {
        results.push({
          status: "duplicate",
          row: ledger.upsertSource({
            path: file.path,
            hash: file.hash,
            size: file.size,
            modified: file.modified,
            content_type: file.contentType,
            status: "duplicate",
            canonical_id: canonical.source_id,
            last_synced: ts,
          }),
          firstTime: true,
          canonicalId: canonical.source_id,
        });
        continue;
      }

      // Truly new
      results.push({
        status: "new",
        row: ledger.upsertSource({
          path: file.path,
          hash: file.hash,
          size: file.size,
          modified: file.modified,
          content_type: file.contentType,
          status: "new",
          canonical_id: null,
          last_synced: ts,
        }),
        firstTime: true,
      });
    }
  }

  // Anything in candidateDeleted that wasn't claimed by a move → deleted
  const deleted: SourceRow[] = [];
  for (const row of candidateDeleted) {
    if (claimedDeletedIds.has(row.source_id)) continue;
    ledger.setStatus(row.source_id, "deleted");
    const fresh = ledger.getSourceById(row.source_id);
    if (fresh) deleted.push(fresh);
  }

  return { results, deleted };
}

function groupByHash(files: readonly WalkedFile[]): Map<string, WalkedFile[]> {
  const out = new Map<string, WalkedFile[]>();
  for (const f of files) {
    const list = out.get(f.hash) ?? [];
    list.push(f);
    out.set(f.hash, list);
  }
  return out;
}

function findCanonicalInResults(
  results: readonly ReconcileResult[],
  hash: string,
): SourceRow | null {
  for (const r of results) {
    if (r.row.hash === hash && r.status !== "duplicate" && r.status !== "deleted") {
      return r.row;
    }
  }
  return null;
}
