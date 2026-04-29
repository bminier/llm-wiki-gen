import { beforeEach, describe, expect, test } from "bun:test";
import { Ledger, type SourceRow } from "../../src/core/ledger.ts";

function row(overrides: Partial<Omit<SourceRow, "source_id">> = {}): Omit<SourceRow, "source_id"> {
  return {
    path: "/src/a.md",
    hash: "h1",
    size: 10,
    modified: 1,
    content_type: "text/markdown",
    status: "new",
    canonical_id: null,
    last_synced: 100,
    ...overrides,
  };
}

describe("Ledger", () => {
  let l: Ledger;
  beforeEach(() => {
    l = Ledger.memory();
  });

  test("upsertSource inserts then updates the same path", () => {
    const a = l.upsertSource(row());
    const b = l.upsertSource(row({ hash: "h2", status: "changed" }));
    expect(a.source_id).toBe(b.source_id);
    expect(b.hash).toBe("h2");
    expect(b.status).toBe("changed");
  });

  test("getSourceByPath / getSourceById round-trip", () => {
    const a = l.upsertSource(row());
    expect(l.getSourceByPath("/src/a.md")?.source_id).toBe(a.source_id);
    expect(l.getSourceById(a.source_id)?.path).toBe("/src/a.md");
  });

  test("findCanonicalByHash returns the live, non-duplicate row", () => {
    const a = l.upsertSource(row({ path: "/src/a.md", hash: "shared" }));
    l.upsertSource(
      row({ path: "/src/b.md", hash: "shared", status: "duplicate", canonical_id: a.source_id }),
    );
    const found = l.findCanonicalByHash("shared", "/src/b.md");
    expect(found?.path).toBe("/src/a.md");
  });

  test("findCanonicalByHash skips deleted rows", () => {
    l.upsertSource(row({ path: "/src/a.md", hash: "shared", status: "deleted" }));
    expect(l.findCanonicalByHash("shared")).toBeNull();
  });

  test("movePath updates path and writes path_history", () => {
    const a = l.upsertSource(row({ path: "/src/old.md", hash: "h" }));
    l.movePath(a.source_id, "/src/new.md", 200);
    const updated = l.getSourceById(a.source_id);
    expect(updated?.path).toBe("/src/new.md");
    expect(updated?.status).toBe("moved");
    const history = l.pathHistoryFor(a.source_id);
    expect(history).toEqual([{ prev_path: "/src/old.md", new_path: "/src/new.md", ts: 200 }]);
  });

  test("recordScan + scansFor", () => {
    const a = l.upsertSource(row());
    l.recordScan({
      source_id: a.source_id,
      scanner: "pii-regex",
      severity: "deny",
      finding: "ssn",
      line: 3,
      ts: 1,
    });
    const scans = l.scansFor(a.source_id);
    expect(scans.length).toBe(1);
    expect(scans[0]?.severity).toBe("deny");
  });

  test("startRun + finishRun lifecycle", () => {
    const id = l.startRun("sync", 1);
    expect(id).toBeGreaterThan(0);
    l.finishRun(id, 2, 0, '{"ok":true}');
  });

  test("setStatus updates status in place", () => {
    const a = l.upsertSource(row());
    l.setStatus(a.source_id, "quarantined");
    expect(l.getSourceById(a.source_id)?.status).toBe("quarantined");
  });

  test("liveSources excludes deleted", () => {
    l.upsertSource(row({ path: "/a.md" }));
    l.upsertSource(row({ path: "/b.md", status: "deleted" }));
    expect(l.liveSources().length).toBe(1);
    expect(l.allSources().length).toBe(2);
  });

  test("transactions roll back on throw", () => {
    expect(() =>
      l.tx(() => {
        l.upsertSource(row({ path: "/x.md" }));
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(l.getSourceByPath("/x.md")).toBeNull();
  });
});
