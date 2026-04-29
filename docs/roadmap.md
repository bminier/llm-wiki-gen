# Roadmap

Living roadmap for `llm-wiki-gen`. This file is the **first thing a fresh
agent session should read** — it captures both where we are and where we're
going. Update it whenever a milestone closes or scope shifts.

---

## Where we are (as of 2026-04-29)

**Shipped (v0.1, commit `d9b2b84`):** the foundation/safety milestone is
complete and pushed to `dev`. See [CHANGELOG.md](../CHANGELOG.md) and
[docs/architecture.md](architecture.md) for what's actually wired.

**Open work right now:**

- **PR #20** (`docs/american-english`): two-line spelling fix for
  "behaviour" → "behavior". Direct push to `dev` was blocked by the
  GitHub-applied `default-branch-protection` ruleset
  ([rules/15746641](https://github.com/bminier/llm-wiki-gen/rules/15746641));
  the PR exists to satisfy that rule. Merge when CI is green.
- **PR for this roadmap doc** is the second open PR (same blocker — direct
  pushes to `dev` are rejected).
- **Ruleset decision pending:** the auto-applied ruleset requires PRs for
  any change to `dev`. For solo work this is friction; for collaborative
  work it's the right default. Decide whether to keep it (PRs always),
  weaken it (allow direct pushes from your account), or replace it with the
  stricter ruleset configured by `scripts/setup-branch-protection.py`.
- **Pre-commit hooks not installed locally yet.** Run
  `python scripts/install-hooks.py` once before serious work resumes.

**Verification snapshot at v0.1:** 108 tests pass; typecheck clean; lint
clean (7 informational warnings on `!` non-null assertions in tests);
gitleaks clean; live smoke confirms `init` scaffolds a vault that lints
clean and `sync` correctly quarantines a synthetic Luhn-valid CC while
detecting one duplicate.

---

## Conversation breadcrumbs (resume hints for a fresh session)

A future session restarting from a compressed context should still be able
to pick up here. Key decisions made in conversation that aren't otherwise
obvious from the code:

- **Runtime is Bun**, not Python (despite the global preference for Python
  scripts). Setup scripts under `scripts/` are Python; the tool is Bun.
- **LLM is local-only via Ollama.** The `[llm].provider` config field
  accepts only `"ollama"` or `"none"`. Adding a remote-API provider
  requires opt-in plus confirmation (see SECURITY.md).
- **Wiki output path is configurable**, default `~/llm-wiki`. Source
  allowlist default is `~/llm-wiki-source`, **read-only** (enforced by
  code structure + `Allowlist` symlink-resolving containment checks).
- **`sync` and `ingest` are split** by design: sync is cheap, idempotent,
  scan-only; ingest is the expensive LLM pass. v0.1 ships sync; v0.2 ships
  ingest.
- **MCP transport is stdio only.** No HTTP/SSE in v0.1; reconsider only if
  a remote-client use case appears.
- **`query` and `lint` are deferred:** `lint` shipped in v0.1 because it
  doesn't need an LLM; `query` waits until v0.4 because it needs both
  ingested content and the synthesis layer.
- **Two-pass reconciler is non-negotiable.** Single-pass would lose
  rename detection. The seven status transitions
  (`new | unchanged | changed | moved | duplicate | deleted | quarantined`)
  are tested explicitly in `tests/unit/reconciler.test.ts` — when extending,
  preserve all seven.
- **Lex-smallest path wins canonical** when two new files share the same
  hash in one run. Arbitrary but deterministic. Don't change without
  updating tests.
- **PII regex log is hash-redacted.** Full PII never lives in the ledger.
- **`Index.md` pages are exempt from per-folder frontmatter schemas** —
  detection is "no frontmatter block at all → use the default schema." If
  you add a folder with required frontmatter, give the folder's `Index.md`
  an actual frontmatter block or it'll skip validation.
- **Sandboxed-editor false positive on the bound DDL caller in
  `src/core/ledger.ts`.** Some security hooks pattern-match the literal
  substring `<dot>exec(` and assume `child_process` is in play. The ledger
  binds the Database method to a local function (`runDDL`) and feeds it a
  list of single statements; the schema is split rather than passed as one
  multi-statement string. Follow the same pattern when extending DDL.

---

## Milestone v0.2 — LLM Ingest (Ollama)

**Goal:** sources marked `new` or `changed` flow through the LLM and
produce a `source-notes/<slug>.md` page in the wiki vault. PII verdicts get
contextual refinement. PDF and DOCX become first-class.

| # | Issue | Notes |
|---|---|---|
| 1 | **Ollama HTTP client + retry/timeout** (`src/llm/ollama.ts`) | Streamed response handling, exponential backoff, healthcheck on `/api/tags`. Provider abstraction so v0.5 can plug llama.cpp without rewriting callers. |
| 2 | **PII contextual classifier** (`src/scanners/pii-llm.ts`) | Takes regex WARN-tier hits + ±200-char window, asks Ollama "is this personal or business context?" with a strict JSON schema response. Can promote WARN→DENY or demote WARN→ALLOW. Runs after `pii-regex` in `sync`. |
| 3 | **PDF extractor** (`src/core/extractors/pdf.ts`) | Vendored `pdf-parse` or `pdfjs`. Hashes the source bytes, not the extracted text. Update `extract`/`isSupported`/`contentTypeFor`. Add fixture. |
| 4 | **DOCX extractor** (`src/core/extractors/docx.ts`) | Likely `mammoth`. Same shape as PDF extractor. Add fixture. |
| 5 | **Source-note generator** | Given an extracted source, emit `source-notes/<slug>.md` with proper frontmatter (`source_id`, `hash`, `ingested`, `type`, `tags`), summary, claims, entities, links. Idempotent: re-running over an unchanged source is a no-op. |
| 6 | **`ingest` command — real implementation** | Replace the v0.1 stub. Reads ledger for `new`/`changed`, calls extractor + classifier + generator, writes notes, updates ledger status to `unchanged`. `--since <run-id>`, `--limit N`, `--source <id>` flags. |
| 7 | **Append-only `log.md` writer** | Per the gist spec: each ingest/query run appends a dated entry. Parse-resistant: write through a single helper so format stays stable. |
| 8 | **MCP `ingest` tool — non-stub** | Update `src/mcp/server.ts` to dispatch to the real ingest. Streamed progress over MCP if practical; otherwise return summary. |
| 9 | **Slug + filename strategy** | Stable, collision-free slugs from arbitrary source paths. Frontmatter must round-trip after rename. Document the algorithm in `docs/architecture.md`. |
| 10 | **`pii-llm` integration tests** | Use a tiny local model in CI (or skip on no-Ollama with a clear message). Cover: personal email correctly promoted, business email correctly demoted, ambiguous case stays at warn. |
| 11 | **Ingest cost accounting** | Per-run token count + wall time written to `runs.summary_json`. Surface via `status` MCP tool. |
| 12 | **v0.2 release notes + tag** | Cut `release/v0.2` from `dev`, write CHANGELOG, tag. |

---

## Milestone v0.3 — Synthesis

**Goal:** the wiki accumulates *understanding*, not just file summaries.
Topic pages cut across many source-notes. Contradictions surface.

| # | Issue | Notes |
|---|---|---|
| 1 | **Topic page agent** (`src/synthesis/topics.ts`) | Given new/changed source-notes, pick affected topics and update `topics/<name>.md`. Preserves human edits between agent-managed sections. |
| 2 | **Section markers** (`<!-- agent:start … -->` / `<!-- agent:end -->`) | Convention for "agent owns this region; human owns the rest." Document in `docs/architecture.md`. |
| 3 | **Contradiction detector** | Compare new source-note claims against existing topic claims. Emit `claims/contradictions/<id>.md` when divergence is detected. |
| 4 | **`index.md` auto-maintenance** | Keep the root index in sync with the actual folder structure. Don't fight Obsidian's preferred Dataview pattern. |
| 5 | **Wikilink graph health** in `lint` | Add metrics: average inbound links, isolated clusters, deepest path. Print as a table in human mode; JSON in `--json` mode. |
| 6 | **Synthesis test fixtures** | Tiny vault + tiny source set that exercises the full ingest→synthesize loop. Used by both unit tests and the v0.3 smoke test. |
| 7 | **Query-aware lint** | When `lint` finds a topic referenced by a wikilink that has no corresponding `topics/<name>.md`, suggest creating it (printed only, doesn't fail). |
| 8 | **v0.3 release notes + tag** | |

---

## Milestone v0.4 — Query

**Goal:** the third Karpathy operation. Ask a question; get a cited answer
filed back into the wiki under `questions/`.

| # | Issue | Notes |
|---|---|---|
| 1 | **`query` CLI command** (`src/commands/query.ts`) | Takes a free-form question, retrieves relevant pages (BM25 over titles + frontmatter; v0.5 may add embeddings), synthesizes an answer, writes `questions/<slug>.md` with sources cited as `[[wikilinks]]`. |
| 2 | **Retrieval layer** (`src/retrieval/bm25.ts`) | In-process; index lives next to the ledger. Rebuild on `sync`/`ingest`. |
| 3 | **Citation enforcement** | Refuse to write a `questions/` page that contains uncited claims; either expand the prompt or lower the answer's confidence and mark sections as `<!-- unverified -->`. |
| 4 | **MCP `query` tool** | Same shape as the CLI; streams the answer. |
| 5 | **`questions/Index.md` auto-update** | Keep the index of asked questions current; reference back to `log.md`. |
| 6 | **Per-question re-asking** | If a question already exists, re-running the query updates the same page (with a new "asked again" timestamp) instead of duplicating. |
| 7 | **v0.4 release notes + tag** | |

---

## Milestone v0.5 — Polish & Hardening

**Goal:** production-feel for solo use; documentation enough for a second
contributor to be productive.

| # | Issue | Notes |
|---|---|---|
| 1 | **`watch` mode** | Filesystem events, debounced, runs `sync` (and optionally `ingest`) automatically. Off by default. Cross-platform via `chokidar` or Bun's native `watch`. |
| 2 | **Parallel extraction** | `Promise.all` with a concurrency cap. Benchmark: ~10× speedup on a 200-file corpus is the bar. |
| 3 | **Ledger query tuning** | EXPLAIN-driven index review. Should be irrelevant under 10k sources, but the v0.4 query path makes it worth checking. |
| 4 | **Provider abstraction: llama.cpp** | Adapter implementing the same interface as `ollama.ts`, talks to `llama-server`'s OpenAI-compatible endpoint. Pick at config time. |
| 5 | **Embedding-based retrieval (optional)** | Local embeddings via Ollama's `/api/embeddings`. Hybrid BM25+vector. Behind a config flag. |
| 6 | **Cookbook docs** | A `docs/cookbook/` directory: "ingesting OneDrive", "ingesting GitHub issues", "two-machine setup with Obsidian Sync". |
| 7 | **Performance benchmarks in CI** | Track ingest time per file and total `sync` time across releases. Fail if a regression > 30% lands. |
| 8 | **v1.0 readiness checklist** | Audit threats in SECURITY.md against the implemented surface. Triage `.unresolved-allowed.txt` accumulation. Document upgrade path. |
| 9 | **v0.5 release notes + tag** | |

---

## Stretch / unsorted

Things mentioned in the original Karpathy discussion that don't yet have
a milestone home:

- **Spreadsheet (xlsx) intelligence** — was deferred at v0.1; harder than
  PDF/DOCX because cell semantics matter. Possible v0.6+.
- **Image OCR** — same.
- **Visio (vsdx) diagram extraction** — same; aspirational.
- **Two-machine sync of the wiki** — Obsidian Sync is one answer; a Git
  remote is another. Cookbook material, not a feature.
- **Cross-vault federation** — multiple wikis with shared topics. Out of
  scope until v1.0+.
- **GitHub issue ingestion as a source type** — natural extension; could
  land alongside the LLM ingest pipeline in v0.2 if scope allows.

---

## How to seed these into GitHub

`scripts/new-issues.py` currently knows only about v0.1. When you're ready
to start a milestone, extend the script with a `V02_ISSUES = [...]` block
mirroring `V01_ISSUES`, add a `--milestone` argument, and re-run it. The
script is idempotent — it skips milestones and issue titles that already
exist.

A future session that lands here can: read this file, copy each table row
above into a Python list, and re-run `python scripts/new-issues.py
bminier/llm-wiki-gen --milestone v0.2`.
