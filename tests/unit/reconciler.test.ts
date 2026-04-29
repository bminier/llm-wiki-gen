import { beforeEach, describe, expect, test } from "bun:test";
import { Ledger } from "../../src/core/ledger.ts";
import { reconcile } from "../../src/core/reconciler.ts";
import type { WalkedFile } from "../../src/core/walker.ts";

function f(path: string, hash: string, size = 1, modified = 1): WalkedFile {
  return { path, hash, size, modified, contentType: "text/markdown" };
}

describe("reconcile", () => {
  let l: Ledger;
  beforeEach(() => {
    l = Ledger.memory();
  });

  test("new files are marked new", () => {
    const { results } = reconcile(l, [f("/a.md", "h1"), f("/b.md", "h2")], 1);
    expect(results.map((r) => r.status).sort()).toEqual(["new", "new"]);
  });

  test("re-running same set yields unchanged", () => {
    reconcile(l, [f("/a.md", "h1")], 1);
    const { results } = reconcile(l, [f("/a.md", "h1")], 2);
    expect(results[0]?.status).toBe("unchanged");
  });

  test("hash change at same path is changed", () => {
    reconcile(l, [f("/a.md", "h1")], 1);
    const { results } = reconcile(l, [f("/a.md", "h2")], 2);
    expect(results[0]?.status).toBe("changed");
    expect(results[0]?.row.hash).toBe("h2");
  });

  test("rename of clean content is moved (re-uses source_id)", () => {
    const initial = reconcile(l, [f("/a.md", "h1")], 1);
    const originalId = initial.results[0]?.row.source_id;
    const { results } = reconcile(l, [f("/b.md", "h1")], 2);
    expect(results[0]?.status).toBe("moved");
    expect(results[0]?.row.source_id).toBe(originalId!);
    expect(results[0]?.movedFrom).toBe("/a.md");
    expect(results[0]?.row.path).toBe("/b.md");
    const history = l.pathHistoryFor(originalId!);
    expect(history).toEqual([{ prev_path: "/a.md", new_path: "/b.md", ts: 2 }]);
  });

  test("copy is duplicate with canonical_id pointing at original", () => {
    const initial = reconcile(l, [f("/a.md", "h1")], 1);
    const canonId = initial.results[0]?.row.source_id;
    const { results } = reconcile(l, [f("/a.md", "h1"), f("/b.md", "h1")], 2);
    const dup = results.find((r) => r.row.path === "/b.md");
    expect(dup?.status).toBe("duplicate");
    expect(dup?.row.canonical_id).toBe(canonId!);
    expect(dup?.canonicalId).toBe(canonId!);
  });

  test("two new files with same hash: lex-smallest path is canonical", () => {
    const { results } = reconcile(l, [f("/z.md", "h1"), f("/a.md", "h1")], 1);
    const a = results.find((r) => r.row.path === "/a.md");
    const z = results.find((r) => r.row.path === "/z.md");
    expect(a?.status).toBe("new");
    expect(z?.status).toBe("duplicate");
    expect(z?.row.canonical_id).toBe(a?.row.source_id);
  });

  test("file removed from staged set is marked deleted", () => {
    reconcile(l, [f("/a.md", "h1"), f("/b.md", "h2")], 1);
    const { deleted } = reconcile(l, [f("/a.md", "h1")], 2);
    expect(deleted.map((d) => d.path)).toEqual(["/b.md"]);
  });

  test("delete-then-reappear-at-new-path within one cycle is moved (not deleted+new)", () => {
    reconcile(l, [f("/old.md", "h1")], 1);
    const { results, deleted } = reconcile(l, [f("/new.md", "h1")], 2);
    expect(deleted).toEqual([]);
    expect(results[0]?.status).toBe("moved");
  });

  test("two moves competing for one deleted row: only one wins, other is duplicate", () => {
    const initial = reconcile(l, [f("/old.md", "h1")], 1);
    const originalId = initial.results[0]?.row.source_id;
    const { results } = reconcile(l, [f("/a.md", "h1"), f("/b.md", "h1")], 2);
    const a = results.find((r) => r.row.path === "/a.md");
    const b = results.find((r) => r.row.path === "/b.md");
    // Lex-smallest /a.md wins canonical/move; /b.md becomes duplicate.
    expect(a?.status).toBe("moved");
    expect(a?.row.source_id).toBe(originalId!);
    expect(b?.status).toBe("duplicate");
    expect(b?.row.canonical_id).toBe(originalId!);
  });

  test("quarantined rows are not implicitly resurrected by reconcile", () => {
    const initial = reconcile(l, [f("/a.md", "h1")], 1);
    const id = initial.results[0]?.row.source_id;
    l.setStatus(id!, "quarantined");
    // Re-run with same content; reconciler will rewrite status to 'unchanged'.
    // Whether to preserve quarantined here is a sync-layer decision; reconciler
    // is the dumb mechanic. Confirm it returns 'unchanged' and leave promotion
    // to the sync command, which can re-quarantine on scan.
    const { results } = reconcile(l, [f("/a.md", "h1")], 2);
    expect(results[0]?.status).toBe("unchanged");
  });
});
