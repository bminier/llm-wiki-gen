import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type SourceStatus =
  | "new"
  | "unchanged"
  | "changed"
  | "moved"
  | "duplicate"
  | "deleted"
  | "quarantined";

export interface SourceRow {
  source_id: number;
  path: string;
  hash: string;
  size: number;
  modified: number;
  content_type: string;
  status: SourceStatus;
  canonical_id: number | null;
  last_synced: number;
}

export interface ScanRow {
  id: number;
  source_id: number;
  scanner: string;
  severity: "deny" | "warn" | "info";
  finding: string;
  line: number | null;
  ts: number;
}

export interface RunRow {
  id: number;
  command: string;
  started: number;
  finished: number | null;
  exit_code: number | null;
  summary_json: string | null;
}

export function defaultLedgerPath(): string {
  const xdgData = process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
  return join(xdgData, "llm-wiki-gen", "ledger.db");
}

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS sources (
    source_id    INTEGER PRIMARY KEY AUTOINCREMENT,
    path         TEXT NOT NULL UNIQUE,
    hash         TEXT NOT NULL,
    size         INTEGER NOT NULL,
    modified     INTEGER NOT NULL,
    content_type TEXT NOT NULL,
    status       TEXT NOT NULL,
    canonical_id INTEGER NULL REFERENCES sources(source_id) ON DELETE SET NULL,
    last_synced  INTEGER NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS idx_sources_hash ON sources(hash)",
  "CREATE INDEX IF NOT EXISTS idx_sources_status ON sources(status)",
  "CREATE INDEX IF NOT EXISTS idx_sources_canonical ON sources(canonical_id)",
  `CREATE TABLE IF NOT EXISTS path_history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id  INTEGER NOT NULL REFERENCES sources(source_id) ON DELETE CASCADE,
    prev_path  TEXT NOT NULL,
    new_path   TEXT NOT NULL,
    ts         INTEGER NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS idx_path_history_source ON path_history(source_id)",
  `CREATE TABLE IF NOT EXISTS scans (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id  INTEGER NOT NULL REFERENCES sources(source_id) ON DELETE CASCADE,
    scanner    TEXT NOT NULL,
    severity   TEXT NOT NULL CHECK (severity IN ('deny','warn','info')),
    finding    TEXT NOT NULL,
    line       INTEGER NULL,
    ts         INTEGER NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS idx_scans_source ON scans(source_id)",
  "CREATE INDEX IF NOT EXISTS idx_scans_severity ON scans(severity)",
  `CREATE TABLE IF NOT EXISTS runs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    command      TEXT NOT NULL,
    started      INTEGER NOT NULL,
    finished     INTEGER NULL,
    exit_code    INTEGER NULL,
    summary_json TEXT NULL
  )`,
  "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)",
  "INSERT OR IGNORE INTO schema_version (version) VALUES (1)",
];

const PRAGMAS = ["PRAGMA journal_mode = WAL", "PRAGMA foreign_keys = ON"];

export class Ledger {
  private readonly db: Database;
  private readonly runDDL: (sql: string) => void;

  constructor(public readonly path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.runDDL = this.db.exec.bind(this.db);
    for (const p of PRAGMAS) this.runDDL(p);
    for (const s of SCHEMA_STATEMENTS) this.runDDL(s);
  }

  static open(path?: string): Ledger {
    return new Ledger(path ?? defaultLedgerPath());
  }

  static memory(): Ledger {
    return new Ledger(":memory:");
  }

  close(): void {
    this.db.close();
  }

  /** Run a function inside a transaction. */
  tx<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  // ---- sources ---------------------------------------------------------

  upsertSource(row: Omit<SourceRow, "source_id">): SourceRow {
    const stmt = this.db.prepare<
      SourceRow,
      [string, string, number, number, string, SourceStatus, number | null, number]
    >(
      `INSERT INTO sources (path, hash, size, modified, content_type, status, canonical_id, last_synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET
         hash=excluded.hash,
         size=excluded.size,
         modified=excluded.modified,
         content_type=excluded.content_type,
         status=excluded.status,
         canonical_id=excluded.canonical_id,
         last_synced=excluded.last_synced
       RETURNING *`,
    );
    const result = stmt.get(
      row.path,
      row.hash,
      row.size,
      row.modified,
      row.content_type,
      row.status,
      row.canonical_id,
      row.last_synced,
    );
    if (!result) throw new Error("upsertSource: no row returned");
    return result;
  }

  getSourceByPath(path: string): SourceRow | null {
    return (
      this.db.prepare<SourceRow, [string]>("SELECT * FROM sources WHERE path = ?").get(path) ?? null
    );
  }

  getSourceById(id: number): SourceRow | null {
    return (
      this.db.prepare<SourceRow, [number]>("SELECT * FROM sources WHERE source_id = ?").get(id) ??
      null
    );
  }

  /** Find a non-duplicate (canonical) live row by hash, optionally excluding a path. */
  findCanonicalByHash(hash: string, excludePath?: string): SourceRow | null {
    if (excludePath !== undefined) {
      return (
        this.db
          .prepare<SourceRow, [string, string]>(
            `SELECT * FROM sources
             WHERE hash = ? AND status != 'duplicate' AND status != 'deleted' AND path != ?
             ORDER BY source_id ASC LIMIT 1`,
          )
          .get(hash, excludePath) ?? null
      );
    }
    return (
      this.db
        .prepare<SourceRow, [string]>(
          `SELECT * FROM sources
           WHERE hash = ? AND status != 'duplicate' AND status != 'deleted'
           ORDER BY source_id ASC LIMIT 1`,
        )
        .get(hash) ?? null
    );
  }

  allSources(): SourceRow[] {
    return this.db.prepare<SourceRow, []>("SELECT * FROM sources").all();
  }

  liveSources(): SourceRow[] {
    return this.db.prepare<SourceRow, []>("SELECT * FROM sources WHERE status != 'deleted'").all();
  }

  setStatus(sourceId: number, status: SourceStatus): void {
    this.db
      .prepare<unknown, [SourceStatus, number]>("UPDATE sources SET status = ? WHERE source_id = ?")
      .run(status, sourceId);
  }

  /** Move an existing row to a new path (used by move detection). */
  movePath(sourceId: number, newPath: string, ts: number): void {
    const existing = this.getSourceById(sourceId);
    if (!existing) throw new Error(`movePath: source_id ${sourceId} not found`);
    this.tx(() => {
      this.db
        .prepare<unknown, [string, number, number]>(
          "UPDATE sources SET path = ?, status = 'moved', last_synced = ? WHERE source_id = ?",
        )
        .run(newPath, ts, sourceId);
      this.db
        .prepare<unknown, [number, string, string, number]>(
          "INSERT INTO path_history (source_id, prev_path, new_path, ts) VALUES (?, ?, ?, ?)",
        )
        .run(sourceId, existing.path, newPath, ts);
    });
  }

  // ---- scans -----------------------------------------------------------

  recordScan(row: Omit<ScanRow, "id">): void {
    this.db
      .prepare<unknown, [number, string, "deny" | "warn" | "info", string, number | null, number]>(
        `INSERT INTO scans (source_id, scanner, severity, finding, line, ts)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(row.source_id, row.scanner, row.severity, row.finding, row.line, row.ts);
  }

  scansFor(sourceId: number): ScanRow[] {
    return this.db
      .prepare<ScanRow, [number]>("SELECT * FROM scans WHERE source_id = ? ORDER BY id")
      .all(sourceId);
  }

  // ---- runs ------------------------------------------------------------

  startRun(command: string, started: number): number {
    const stmt = this.db.prepare<{ id: number }, [string, number]>(
      "INSERT INTO runs (command, started) VALUES (?, ?) RETURNING id",
    );
    const row = stmt.get(command, started);
    if (!row) throw new Error("startRun: no id returned");
    return row.id;
  }

  finishRun(id: number, finished: number, exitCode: number, summaryJson: string): void {
    this.db
      .prepare<unknown, [number, number, string, number]>(
        "UPDATE runs SET finished = ?, exit_code = ?, summary_json = ? WHERE id = ?",
      )
      .run(finished, exitCode, summaryJson, id);
  }

  pathHistoryFor(sourceId: number): { prev_path: string; new_path: string; ts: number }[] {
    return this.db
      .prepare<{ prev_path: string; new_path: string; ts: number }, [number]>(
        "SELECT prev_path, new_path, ts FROM path_history WHERE source_id = ? ORDER BY id",
      )
      .all(sourceId);
  }
}
