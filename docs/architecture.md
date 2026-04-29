# Architecture

## Three-layer model

The Karpathy LLM Wiki gist describes a three-layer pattern:

1. **Source layer.** A read-only document lake (OneDrive, Dropbox, a cloned
   repo). Curated by humans; preserves original files.
2. **Synthesis layer.** A versioned Markdown wiki. Source-notes preserve
   evidence; topic pages accumulate cross-cutting understanding.
3. **Schema/curation layer.** A configuration that tells the LLM how to
   maintain the wiki — page types, frontmatter requirements, lint rules.

`llm-wiki-gen` implements all three with concrete choices: filesystem +
allowlist for the source layer, an Obsidian + Dataview vault for the
synthesis layer, and zod-validated TOML + per-folder frontmatter schemas
for the curation layer.

## Data flow (v0.1)

```
~/llm-wiki-source/ (read-only allowlist)
    │
    ▼
walker  ──►  WalkedFile{path, hash, size, modified, contentType}
    │
    ▼
reconciler  ──►  ReconcileResult{status: new|unchanged|changed|moved|duplicate|deleted, row}
    │
    ▼
sync (orchestration)
  ├── ledger.upsertSource / movePath / setStatus / pathHistory
  └── for new/changed:
        extractor → text → pii-regex (DENY blocks; WARN logged)
                          → gitleaks (optional)
    │
    ▼
ledger.db (SQLite) — sources, path_history, scans, runs
```

In v0.2, the additional flow:

```
ledger (status=new|changed)
    │
    ▼
ingest pipeline
    ├── extract (full text)
    ├── pii-llm classifier (refine WARN verdicts)
    ├── ollama: generate source-note
    └── write to ~/llm-wiki/source-notes/<slug>.md  (synthesis layer)
```

## Component map

```
src/
├── cli.ts                       — citty entrypoint, --version, subcommands
├── version.ts                   — package.json version re-export
├── commands/                    — orchestration; no business logic
│   ├── sync.ts                  ─ runSync()
│   ├── ingest.ts                ─ planIngest() / runIngest() (stub in v0.1)
│   ├── lint.ts                  ─ runLint()
│   └── init.ts                  ─ runInit()
├── core/
│   ├── config.ts                — zod TOML config + path expansion
│   ├── allowlist.ts             — symlink-safe containment (Allowlist)
│   ├── ledger.ts                — bun:sqlite, schema, CRUD, transactions
│   ├── walker.ts                — recursive walk + streamed SHA-256
│   ├── reconciler.ts            — two-pass dup/move detection
│   ├── paths.ts                 — ~ expansion
│   └── extractors/              — md, txt, html, csv (pdf/docx in v0.2)
├── scanners/
│   ├── pii-regex.ts             — DENY/WARN/ALLOW dispatcher
│   ├── checksums.ts             — Luhn, ABA
│   ├── rules/deny.ts            — deterministic DENY rules
│   ├── rules/warn.ts            — WARN context heuristics
│   └── secrets.ts               — gitleaks subprocess wrapper
├── obsidian/
│   ├── frontmatter.ts           — per-folder zod schemas
│   ├── wikilinks.ts             — parse, resolve, orphan-detect
│   └── dataview.ts              — fence + top-level keyword sanity
└── mcp/
    └── server.ts                — stdio MCP server, tool registry
```

## Status state machine

```
                   ┌────────────┐
                   │     new    │◄──────── (first observation)
                   └────┬───────┘
                        │ DENY hit
                        ▼
                   ┌────────────┐
                   │ quarantined│   (manual override required to advance)
                   └────────────┘

   ┌─────────────┐   re-sync   ┌──────────┐
   │  unchanged  │◄────────────┤   new    │
   └─────────────┘             └──────────┘

   ┌─────────────┐   hash differs at same path
   │   changed   │◄────────────────────────
   └─────────────┘

   ┌─────────────┐   path gone, hash matches deleted candidate
   │    moved    │◄────────────────────────
   └─────────────┘   (re-uses source_id; path_history entry written)

   ┌─────────────┐   path new, hash matches a still-live row
   │  duplicate  │◄────────────────────────
   └─────────────┘   (canonical_id points at the original)

   ┌─────────────┐   was in ledger, not in staged set, not claimed by a move
   │   deleted   │◄────────────────────────
   └─────────────┘
```

## Why these choices

- **SQLite over JSONL** for the ledger: indexed lookups by `hash` are O(log
  n); move/dup detection needs them on every run. JSONL becomes painful past
  a few thousand sources.
- **Streamed hashing** instead of read-all-then-hash: scans never load whole
  files into memory; useful when source folders contain large PDFs (v0.2).
- **Reconciler is pure** (takes a `Ledger` + staged files; performs writes
  via the ledger interface). This makes it easy to unit-test all seven
  status transitions on an in-memory ledger.
- **Lex-smallest path wins canonical** when two new files share a hash:
  arbitrary but deterministic and stable across reruns.
- **gitleaks for secrets, regex+LLM for PII**: gitleaks is exhaustive and
  battle-tested for credentials but not designed for personal information;
  the regex tier handles deterministic PII (SSN, CC, IBAN), and v0.2's
  LLM-tiered classifier handles the "is this email personal or business?"
  contextual judgments that regex can't make reliably.
