#!/usr/bin/env python3
"""Seed GitHub milestones and issues for llm-wiki-gen via `gh`.

Usage:
    python scripts/new-issues.py <owner/repo>
    python scripts/new-issues.py <owner/repo> --milestone v0.2
    python scripts/new-issues.py <owner/repo> --milestone all

Idempotent: skips milestones/issues whose titles already exist.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys


MILESTONES = [
    {
        "title": "v0.1 — Foundation & Safety",
        "description": (
            "Shippable safety/plumbing skeleton. No LLM calls. `sync` works "
            "end-to-end on a real source folder; `lint` works on a real vault."
        ),
    },
    {"title": "v0.2 — LLM Ingest (Ollama)", "description": "Source-note generator + LLM-tiered PII contextual classifier + pdf/docx extractors."},
    {"title": "v0.3 — Synthesis", "description": "Topic page agent, contradiction detection, index.md auto-maintenance."},
    {"title": "v0.4 — Query", "description": "`query` command + MCP `query` tool."},
    {"title": "v0.5 — Polish", "description": "watch mode, perf, cookbook docs, MCP client compatibility."},
    {"title": "v0.6 — Source types beyond files", "description": "Non-file source types: chat transcripts, GitHub issues. Reframes the source allowlist from 'a folder of files' to 'a list of typed source streams'."},
    {"title": "v0.7 — More source streams", "description": "More typed source streams: email (local mbox/Maildir), meeting transcripts, calendar (iCal), voice memos, highlights (Readwise/Kindle/Hypothesis), browser read-side capture, Slack/Discord exports. Generalises v0.6's source-id provenance scheme and adds the local audio-to-text pipeline."},
    {"title": "v0.7.5 — Live source pulls (OAuth)", "description": "Token vault + OAuth flows so v0.7's local-export source streams can pull live where users opt in. Inference + ledger storage stay local-only; ingestion network egress is opt-in per source with explicit consent. SECURITY.md reworked to scope the local-only guarantee."},
    {"title": "v0.8 — Team vault (one-way promotion)", "description": "First federation slice. Personal vaults publish curated notes to a team vault via git, with attribution, boundary PII scanning, and cross-vault contradiction surfacing. One-way promotion only; bidirectional flow + signed-commit identity defer to v0.9."},
    {"title": "v0.9 — Full federation", "description": "Federation completion: bidirectional flow (harvest team-vault knowledge back into personal vaults), signed-commit identity at promotion, per-contributor trust gradient, audit log, time-travel queries. Org-vaults / team-of-teams stay out of scope (revisit v1.0+)."},
]

V01_ISSUES: list[dict] = [
    {"title": "Repo scaffolding + all docs", "body": "package.json, tsconfig, bunfig, .gitignore, LICENSE, README, SECURITY, CLAUDE, CONTRIBUTING, CHANGELOG, docs/architecture.md, docs/pii-tiers.md.", "labels": ["chore", "v0.1"]},
    {"title": "Config loader + allowlist resolver", "body": "src/core/config.ts, src/core/allowlist.ts. Zod schema, path expansion, symlink-safe containment.", "labels": ["feat", "v0.1"]},
    {"title": "Ledger (bun:sqlite)", "body": "src/core/ledger.ts. sources, path_history, scans, runs tables. canonical_id + indexes on hash, status.", "labels": ["feat", "v0.1"]},
    {"title": "Walker + extractors (md/txt/html/csv)", "body": "src/core/walker.ts, src/core/extractors/*. Streamed SHA-256 hashing. Glob-style excludes.", "labels": ["feat", "v0.1"]},
    {"title": "Two-pass sync reconciler with dup + move detection", "body": "src/core/reconciler.ts. Tests cover all 7 status transitions: new/unchanged/changed/moved/duplicate/deleted/quarantined.", "labels": ["feat", "v0.1"]},
    {"title": "PII regex scanner — DENY tier", "body": "src/scanners/pii-regex.ts + rules/deny.ts. SSN, CC (Luhn), ABA, IBAN, AWS/GCP/Azure keys, OpenSSH header, BIP-39, account-near-keyword.", "labels": ["feat", "security", "v0.1"]},
    {"title": "PII regex scanner — WARN/ALLOW tiers", "body": "Phone/email context heuristics, business-domain allowlist, business-phone allowlist.", "labels": ["feat", "security", "v0.1"]},
    {"title": "gitleaks wrapper + .gitleaks.toml", "body": "src/scanners/secrets.ts: spawn gitleaks (no shell), parse JSON. Custom LLM_WIKI_* token rule.", "labels": ["feat", "security", "v0.1"]},
    {"title": "sync command", "body": "src/commands/sync.ts. JSON output, --explain-dups, integration tests for new/changed/moved/duplicate/quarantined.", "labels": ["feat", "v0.1"]},
    {"title": "lint command — frontmatter", "body": "src/obsidian/frontmatter.ts. Per-folder zod schemas (source-notes, topics, questions). Tests.", "labels": ["feat", "v0.1"]},
    {"title": "lint command — wikilinks + orphans", "body": "src/obsidian/wikilinks.ts. Resolve [[link]] by relpath/basename. Orphan detection. .unresolved-allowed.txt.", "labels": ["feat", "v0.1"]},
    {"title": "lint command — dataview block sanity", "body": "src/obsidian/dataview.ts. Validate fence shape and top-level keyword (TABLE/LIST/TASK/CALENDAR).", "labels": ["feat", "v0.1"]},
    {"title": "ingest stub command", "body": "src/commands/ingest.ts. Reads ledger, prints plan, exits 2 unless --dry-run. v0.2 lands the real pipeline.", "labels": ["chore", "v0.1"]},
    {"title": "init command — scaffold empty Obsidian vault", "body": "src/commands/init.ts. starter index.md, log.md, source-notes/, topics/, ... lints clean from a fresh init.", "labels": ["feat", "v0.1"]},
    {"title": "MCP stdio server", "body": "src/mcp/server.ts. Tools: sync, ingest (stub), lint, status. Smoke test.", "labels": ["feat", "v0.1"]},
    {"title": "CLI ergonomics", "body": "src/cli.ts. citty subcommands; --json, --config, --dry-run, --version, color output via picocolors.", "labels": ["feat", "v0.1"]},
    {"title": "Pre-commit config + install-hooks.py", "body": ".pre-commit-config.yaml, scripts/install-hooks.py, scripts/pii-precommit.ts. Verify on a fresh clone.", "labels": ["chore", "security", "v0.1"]},
    {"title": "CI workflow + gitleaks workflow", "body": ".github/workflows/{ci,gitleaks}.yml. Matrix typecheck/test/lint on Ubuntu/macOS/Windows. Issue + PR templates. Branch-protection script.", "labels": ["chore", "v0.1"]},
    {"title": "v0.1 release notes + tag from release/v0.1", "body": "Cut release/v0.1 from dev, write CHANGELOG entries, tag, publish.", "labels": ["release", "v0.1"]},
]

V02_ISSUES: list[dict] = [
    {"title": "Ollama HTTP client + retry/timeout", "body": "src/llm/ollama.ts. Streamed response handling, exponential backoff, healthcheck on /api/tags. Provider abstraction so v0.5 can plug llama.cpp without rewriting callers.", "labels": ["feat", "v0.2"]},
    {"title": "PII contextual classifier (LLM)", "body": "src/scanners/pii-llm.ts. Takes regex WARN-tier hits + ±200-char window, asks the configured LLM provider 'is this personal or business context?' with a strict JSON schema response. Can promote WARN→DENY or demote WARN→ALLOW. Runs after pii-regex in `sync`. **Opt-in only**: defaults to `[scanners].pii_llm = false` so most users never load a model for ingest. Rationale: regex DENY+WARN tiers cover ~90% of cases; the LLM step is sharpening for ambiguous WARN hits and shouldn't be a mandatory dependency. Stays local-only (Ollama or none) — never proxies to a host LLM, since routing PII through the host's chat would leak.", "labels": ["feat", "security", "v0.2"]},
    {"title": "PDF extractor", "body": "src/core/extractors/pdf.ts. Vendored pdf-parse or pdfjs. Hashes the source bytes, not the extracted text. Update extract/isSupported/contentTypeFor. Add fixture under tests/fixtures/.", "labels": ["feat", "v0.2"]},
    {"title": "DOCX extractor", "body": "src/core/extractors/docx.ts. Likely `mammoth`. Same shape as the PDF extractor. Add fixture under tests/fixtures/.", "labels": ["feat", "v0.2"]},
    {"title": "Source-note generator", "body": "Given an extracted source, emit source-notes/<slug>.md with proper frontmatter (source_id, hash, ingested, type, tags), summary, claims, entities, links. Idempotent: re-running over an unchanged source is a no-op. LLM driver picked at runtime via the LlmProvider abstraction: prefers MCP sampling when running under an MCP host that supports it (so a Claude Code plugin run uses Claude rather than Ollama), falls back to the configured local provider for autonomous CLI runs. Output schema is identical regardless of which provider generated it.", "labels": ["feat", "v0.2"]},
    {"title": "ingest command — real implementation", "body": "Replace the v0.1 stub. Reads ledger for new/changed sources, calls extractor + classifier + generator, writes notes, updates ledger status to `unchanged`. Flags: --since <run-id>, --limit N, --source <id>.", "labels": ["feat", "v0.2"]},
    {"title": "Append-only log.md writer", "body": "Per the gist spec: each ingest/query run appends a dated entry to log.md. Parse-resistant: write through a single helper so format stays stable.", "labels": ["feat", "v0.2"]},
    {"title": "MCP ingest tool — non-stub", "body": "Update src/mcp/server.ts to dispatch to the real ingest pipeline. Stream progress over MCP if practical; otherwise return summary.", "labels": ["feat", "v0.2"]},
    {"title": "Slug + filename strategy", "body": "Stable, collision-free slugs from arbitrary source paths. Frontmatter must round-trip after rename. Document the algorithm in docs/architecture.md.", "labels": ["feat", "v0.2"]},
    {"title": "pii-llm integration tests", "body": "Use a tiny local model in CI (or skip on no-Ollama with a clear message). Cover: personal email correctly promoted, business email correctly demoted, ambiguous case stays at warn.", "labels": ["test", "security", "v0.2"]},
    {"title": "Ingest cost accounting", "body": "Per-run token count + wall time written to runs.summary_json. Surface via `status` MCP tool.", "labels": ["feat", "v0.2"]},
    {"title": "Nightly Ollama integration tests in CI", "body": "Add `.github/workflows/llm-integration.yml`. Triggers: `workflow_dispatch` + nightly `schedule:` cron on `dev`. Steps: install Ollama via the upstream installer, pull a small model (`qwen2:0.5b` or similar, < 1 GB), cache the model directory between runs, then run `bun test tests/integration/llm/` against the running daemon. Push and pull_request CI stays mocked-fetch only — the live job's job is to catch Ollama API drift the unit tests can't see. Pre-req: skip-if-no-server integration tests already implied by #31 and #59; this issue is just the CI plumbing + cache strategy.", "labels": ["chore", "test", "v0.2"]},
    {"title": "PII WARN-tier literal-keyword scanner", "body": "Extend src/scanners/rules/warn.ts with a literal-keyword sublist that flags occurrences of `routing number`, `recovery code`, `account number`, `api_key`, `password`, `secret`, `private key` adjacent to suspicious-looking values. Pre-LLM-classifier nudge so the v0.2 pii-llm has more candidate WARN hits to refine. Per the karpathy-doc pre-ingestion checklist.", "labels": ["feat", "security", "v0.2"]},
    {"title": "compromise.js NER for entity-tier PII detection", "body": "src/scanners/pii-ner.ts. Adds entity recognition (PERSON/ORG/GPE/DATE) using compromise.js — pure-JS, ~150KB, no model download, deterministic. Strengthens the regex tier without adding an LLM dependency. Catches PII the regex layer misses (e.g., a person's full name in a free-text paragraph). Output feeds the same WARN/DENY/ALLOW tier system. Runs before pii-llm; combined with the literal-keyword scanner this should make the LLM classifier optional for most users. Native Bun fit, no shell-out.", "labels": ["feat", "security", "v0.2"]},
    {"title": "MCP-sampling LlmProvider", "body": "Third LlmProvider type alongside `ollama` and `none`: `mcp-sampling`. When running as an MCP server with a sampling-capable client (Claude Code, Claude Desktop), proxies completions to the host LLM via `sampling/createMessage` rather than calling Ollama. Selection logic: if config requests `mcp-sampling` and the connected client advertises sampling support → use it; else fall back to the configured fallback provider; else error. Not all MCP clients implement sampling (Cursor/Cline TBD) — graceful fallback is non-negotiable. Tests cover: sampling round-trip with mocked client, fallback when sampling unavailable, error path when no fallback configured. Restriction: pii-llm never uses mcp-sampling — PII content must stay local. Pre-req: existing LlmProvider abstraction in src/llm/index.ts.", "labels": ["feat", "v0.2"]},
    {"title": "Automated tests for v0.2 ingest pipeline", "body": "Unit + integration coverage for: Ollama client (mocked + skip-if-no-Ollama live), PDF/DOCX extractors (golden bytes), source-note generator (idempotency), `ingest` end-to-end, `log.md` round-trip, MCP `ingest` tool, slug strategy, cost accounting. Excludes pii-llm (own issue).", "labels": ["test", "v0.2"]},
    {"title": "Update docs for v0.2", "body": "README LLM-ingest section, CHANGELOG, docs/architecture.md (extractor pipeline + slug algorithm + log.md format), docs/pii-tiers.md (LLM promotion/demotion rules).", "labels": ["docs", "v0.2"]},
    {"title": "v0.2 release notes + tag", "body": "Cut release/v0.2 from dev, write CHANGELOG entries, tag, publish.", "labels": ["release", "v0.2"]},
]

V03_ISSUES: list[dict] = [
    {"title": "Topic page agent", "body": "src/synthesis/topics.ts. Given new/changed source-notes, pick affected topics and update topics/<name>.md. Preserves human edits between agent-managed sections. LLM driver picked at runtime via the LlmProvider abstraction: prefers MCP sampling when running under an MCP host (so a Claude Code plugin run uses Claude rather than a local 7B model), falls back to the configured local provider for autonomous CLI runs.", "labels": ["feat", "v0.3"]},
    {"title": "Section markers (agent:start/agent:end)", "body": "Convention for 'agent owns this region; human owns the rest' using <!-- agent:start ... --> / <!-- agent:end --> comments. Document in docs/architecture.md.", "labels": ["feat", "v0.3"]},
    {"title": "Contradiction detector", "body": "Compare new source-note claims against existing topic claims. Emit claims/contradictions/<id>.md when divergence is detected. LLM driver picked at runtime via the LlmProvider abstraction: prefers MCP sampling when running under an MCP host, falls back to the configured local provider for autonomous CLI runs. The reasoning task (does claim A contradict claim B?) benefits meaningfully from the host model's higher capability when available.", "labels": ["feat", "v0.3"]},
    {"title": "index.md auto-maintenance", "body": "Keep the root index in sync with the actual folder structure. Don't fight Obsidian's preferred Dataview pattern.", "labels": ["feat", "v0.3"]},
    {"title": "Wikilink graph health in lint", "body": "Add metrics: average inbound links, isolated clusters, deepest path. Print as a table in human mode; JSON in --json mode.", "labels": ["feat", "v0.3"]},
    {"title": "Synthesis test fixtures", "body": "Tiny vault + tiny source set that exercises the full ingest→synthesize loop. Used by both unit tests and the v0.3 smoke test.", "labels": ["test", "v0.3"]},
    {"title": "Query-aware lint", "body": "When `lint` finds a topic referenced by a wikilink that has no corresponding topics/<name>.md, suggest creating it (printed only, doesn't fail).", "labels": ["feat", "v0.3"]},
    {"title": "Extended agent signal taxonomy", "body": "The Karpathy doc lists ten signals an LLM-driven wiki should emit beyond raw summarisation: new idea, changed opinion, duplicate concept, contradiction, stale source, related project, action item, business opportunity, claim needing verification, implementation candidate. Contradiction is already its own issue. Add the remaining nine as detection rules in src/synthesis/. Each emits an entry under claims/<signal>/<id>.md with provenance back to the source-note(s) that triggered it. Document the taxonomy in docs/architecture.md. LLM driver picked at runtime via the LlmProvider abstraction: prefers MCP sampling when running under an MCP host, falls back to the configured local provider for autonomous CLI runs.", "labels": ["feat", "v0.3"]},
    {"title": "MCP synthesis results return to host (contradictions, signals, topic updates)", "body": "When llm-wiki-gen runs as an MCP server, synthesis tasks return structured findings to the host (Claude Code, Claude Desktop, etc.) as tool-call results — not only as files in the vault. Canonical case: contradiction detection. When the contradiction detector runs via the MCP `synthesize` tool and finds a divergence, the tool response includes the contradiction (claim A, claim B, sources, confidence) so Claude can surface it in conversation, ask the user follow-ups, and accept/reject the finding interactively. Same shape applies to the nine other agent signals (#83) and topic-update summaries (#76): file-write to vault is the durable record; tool-result is the conversational surface. Both happen by default; CLI mode emits files only. Update src/mcp/server.ts to register a `synthesize` tool returning structured JSON and add result schemas to docs/architecture.md.", "labels": ["feat", "v0.3"]},
    {"title": "review CLI verb", "body": "src/commands/review.ts. Surfaces pending wiki-vault changes (new source-notes, updated topic pages, agent-emitted signals) for human approval before they're committed to the vault git repo. The karpathy-doc pipeline is `update-topic → review → commit`; this is the human-in-the-loop step between synthesis and persistence. Diff renderer + accept/reject/defer flow per change.", "labels": ["feat", "v0.3"]},
    {"title": "commit CLI verb", "body": "src/commands/commit.ts. Wraps `git -C <wiki-path> commit` with structured commit messages tied to ingest/synthesis run-ids. Pairs with `review`: only changes the human accepted via `review` are committed. v0.1 leaves the vault uncommitted; this verb closes the loop.", "labels": ["feat", "v0.3"]},
    {"title": "Default wiki folder taxonomy", "body": "The Karpathy doc names a richer folder taxonomy than v0.1's `topics/`/`source-notes/`/`questions/`. Extend `init` and the synthesis layer to scaffold and recognise: `people/`, `companies/`, `timelines/`, `concepts/`, `claims/`, plus root-level `architecture-decisions.md`, `open-questions.md`, `claims-needing-verification.md`. Per-folder frontmatter schemas in src/obsidian/frontmatter.ts. Index.md exemption preserved per existing convention.", "labels": ["feat", "v0.3"]},
    {"title": "Automated tests for v0.3 synthesis", "body": "Use the synthesis fixtures to drive: topic-page agent (round-trip through <!-- agent:start/end -->), contradiction detector (golden divergence cases), index.md auto-maintenance, wikilink-graph metrics, query-aware lint suggestions.", "labels": ["test", "v0.3"]},
    {"title": "Update docs for v0.3", "body": "README synthesis section, CHANGELOG, docs/architecture.md (topic-agent contract, section-marker convention, contradiction format).", "labels": ["docs", "v0.3"]},
    {"title": "v0.3 release notes + tag", "body": "Cut release/v0.3 from dev, write CHANGELOG entries, tag, publish.", "labels": ["release", "v0.3"]},
]

V04_ISSUES: list[dict] = [
    {"title": "query CLI command", "body": "src/commands/query.ts. Takes a free-form question, retrieves relevant pages (BM25 over titles + frontmatter; v0.5 may add embeddings), synthesizes an answer, writes questions/<slug>.md with sources cited as [[wikilinks]].", "labels": ["feat", "v0.4"]},
    {"title": "Retrieval layer (BM25)", "body": "src/retrieval/bm25.ts. In-process; index lives next to the ledger. Rebuild on `sync`/`ingest`.", "labels": ["feat", "v0.4"]},
    {"title": "Citation enforcement", "body": "Refuse to write a questions/ page that contains uncited claims; either expand the prompt or lower the answer's confidence and mark sections as <!-- unverified -->.", "labels": ["feat", "v0.4"]},
    {"title": "MCP query tool", "body": "Same shape as the CLI; streams the answer over MCP.", "labels": ["feat", "v0.4"]},
    {"title": "questions/Index.md auto-update", "body": "Keep the index of asked questions current; reference back to log.md.", "labels": ["feat", "v0.4"]},
    {"title": "Per-question re-asking", "body": "If a question already exists, re-running the query updates the same page (with a new 'asked again' timestamp) instead of duplicating.", "labels": ["feat", "v0.4"]},
    {"title": "Automated tests for v0.4 query", "body": "`query` CLI golden Q&A, BM25 retrieval correctness, citation enforcement (refusal cases for uncited claims), MCP `query` tool, re-asking idempotency.", "labels": ["test", "v0.4"]},
    {"title": "Update docs for v0.4", "body": "README query workflow, CHANGELOG, docs/architecture.md (retrieval layer + citation rules).", "labels": ["docs", "v0.4"]},
    {"title": "v0.4 release notes + tag", "body": "Cut release/v0.4 from dev, write CHANGELOG entries, tag, publish.", "labels": ["release", "v0.4"]},
]

V05_ISSUES: list[dict] = [
    {"title": "watch mode", "body": "Filesystem events, debounced, runs `sync` (and optionally `ingest`) automatically. Off by default. Cross-platform via chokidar or Bun's native watch.", "labels": ["feat", "v0.5"]},
    {"title": "Parallel extraction", "body": "Promise.all with a concurrency cap. Benchmark target: ~10× speedup on a 200-file corpus.", "labels": ["feat", "v0.5"]},
    {"title": "Ledger query tuning", "body": "EXPLAIN-driven index review. Should be irrelevant under 10k sources, but the v0.4 query path makes it worth checking.", "labels": ["chore", "v0.5"]},
    {"title": "Provider abstraction: llama.cpp", "body": "Adapter implementing the same interface as ollama.ts, talks to llama-server's OpenAI-compatible endpoint. Pick at config time.", "labels": ["feat", "v0.5"]},
    {"title": "Embedding-based retrieval (optional)", "body": "Local embeddings via Ollama's /api/embeddings. Hybrid BM25+vector. Behind a config flag.", "labels": ["feat", "v0.5"]},
    {"title": "Cookbook docs", "body": "A docs/cookbook/ directory: 'ingesting OneDrive', 'ingesting GitHub issues', 'two-machine setup with Obsidian Sync'.", "labels": ["docs", "v0.5"]},
    {"title": "Performance benchmarks in CI", "body": "Track ingest time per file and total `sync` time across releases. Fail if a regression > 30% lands.", "labels": ["chore", "v0.5"]},
    {"title": "Dependabot: weekly bumps for npm + github-actions", "body": "Add .github/dependabot.yml watching npm (package.json) and github-actions (workflow `uses:` versions). Weekly cadence; group minor/patch into one PR per ecosystem; majors stay separate. Do NOT enable auto-merge — supply-chain attacks (event-stream, colors.js, xz-utils) bypass code review when CI green is treated as 'safe'. Manual review is the floor, not the ceiling.", "labels": ["chore", "security", "v0.5"]},
    {"title": "Bandit pre-commit hook for scripts/*.py", "body": "Add `bandit` to .pre-commit-config.yaml scoped to scripts/*.py. Defensive lint for the project's own Python (install-hooks.py, new-issues.py, setup-branch-protection.py, pii-precommit.ts is TS — excluded). Catches subprocess(shell=True), eval, hardcoded credentials, weak crypto. Not a content scanner; complements gitleaks (which scans content) and the existing TS lint stack. Configure to skip rules that don't apply to setup-script idioms (e.g., B404 subprocess-import is fine for these scripts). Document in docs/architecture.md security section.", "labels": ["chore", "security", "v0.5"]},
    {"title": "CodeQL static analysis for JS/TS", "body": "Add .github/workflows/codeql.yml. Triggers: push to dev, pull_request against dev, weekly cron. Earns its slot because the codebase has several class-of-bug attack surfaces CodeQL is good at: src/core/allowlist.ts symlink-resolving containment (path traversal), src/scanners/secrets.ts gitleaks spawn (command injection), regex-heavy PII rules (regex DoS), MCP server tool dispatch (prototype pollution). Findings auto-upload SARIF to the GitHub Security tab.", "labels": ["chore", "security", "v0.5"]},
    {"title": "v1.0 readiness checklist", "body": "Audit threats in SECURITY.md against the implemented surface. Triage .unresolved-allowed.txt accumulation. Document upgrade path.", "labels": ["chore", "security", "v0.5"]},
    {"title": "MCP client compatibility", "body": "Verify the stdio MCP server works with Copilot, Codex CLI, Cursor, and Claude Desktop. Provide per-client config snippets (mcp.json / settings.json). Confirm tool descriptions are clear enough for agents to use without hand-holding. Smoke-test each client against the live server.", "labels": ["feat", "docs", "v0.5"]},
    {"title": "Package as a Claude Code plugin", "body": "Distribute llm-wiki-gen as a one-command install for Claude Code users. Verify the current Claude Code plugin format at implementation time (it has evolved). Bundle: plugin manifest, pre-configured MCP server registration pointing at `bun run src/cli.ts mcp`, slash commands wrapping the common workflows (/llm-wiki sync, /llm-wiki ingest, /llm-wiki lint, /llm-wiki status), bundled skills (separate issue).", "labels": ["feat", "v0.5"]},
    {"title": "Author bundled Claude Code skills", "body": "SKILL.md files shipped with the plugin: llm-wiki-sync (flags + JSON output + exit-code semantics, esp. exit 1 = quarantined-finding not tool failure), llm-wiki-ingest (allowlist preconditions + Ollama healthcheck + cost-accounting), llm-wiki-lint (frontmatter/wikilink/dataview violations + .unresolved-allowed.txt workflow), llm-wiki-troubleshoot (Ollama down, ledger locked, allowlist symlink rejection, PII DENY). Each skill discoverable by triggering pattern AND reachable via slash command.", "labels": ["feat", "docs", "v0.5"]},
    {"title": "Smoke-test the Claude Code plugin end-to-end", "body": "workflow_dispatch CI job analogous to the nightly Ollama job: installs Claude Code in a fresh runner, installs the plugin from the current branch, scaffolds a tiny fixture vault, drives each bundled skill/slash command, asserts expected output or side-effects. Plugin smoke tests packaging + skill loading + MCP registration; live LLM generation stays under the nightly Ollama job.", "labels": ["test", "chore", "v0.5"]},
    {"title": "Automated tests for v0.5 features", "body": "watch-mode debounce, parallel-extraction concurrency cap, ledger queries under load, llama.cpp adapter parity with Ollama, embedding retrieval, MCP-client smoke tests. Excludes perf benchmarks (own issue).", "labels": ["test", "v0.5"]},
    {"title": "Update docs for v0.5", "body": "README, CHANGELOG, docs/architecture.md (provider abstraction + watch mode + MCP client config). Cookbook is its own issue.", "labels": ["docs", "v0.5"]},
    {"title": "v0.5 release notes + tag", "body": "Cut release/v0.5 from dev, write CHANGELOG entries, tag, publish.", "labels": ["release", "v0.5"]},
]

V06_ISSUES: list[dict] = [
    {"title": "Source-id provenance scheme (file/onedrive/github/chat)", "body": "v0.2 ledger keys on absolute path + content hash. v0.6 needs a stable `source_id` that survives the ingestion path moving: `file:<absolute-path>` (default), `onedrive:<rel-path>`, `github:<owner>/<repo>/issues/<n>`, `chat:<provider>/<conversation-id>`. Add a `source_scheme` column (or extend `source_id` itself); existing rows migrate to `file:`. Document the scheme in docs/architecture.md.", "labels": ["feat", "v0.6"]},
    {"title": "GitHub-issue ingestion as a source type", "body": "Extend the source allowlist from 'folders of files' to typed source streams. Each GitHub issue becomes a synthetic source, hashed by body + comment thread, ingested through the same source-note pipeline as files. Canonical path: `github:<owner>/<repo>/issues/<n>`. Mocked-API tests; live tests skip without GH_TOKEN. Pre-req: source-id provenance scheme.", "labels": ["feat", "v0.6"]},
    {"title": "Chat-transcript ingestion as a source type", "body": "Per the karpathy doc, chat transcripts (Claude Code, ChatGPT exports, etc.) are first-class sources alongside files and issues. Canonical path: `chat:<provider>/<conversation-id>`. Transcript-specific extractor preserves turn boundaries and roles. Pre-req: source-id provenance scheme.", "labels": ["feat", "v0.6"]},
    {"title": "Automated tests for v0.6 source types", "body": "Unit + integration coverage for: source-id round-trip after a path change, GitHub-issue ingestion (mocked API + idempotent re-runs), chat-transcript extractor (turn boundaries preserved). Live API tests skip-if-no-token.", "labels": ["test", "v0.6"]},
    {"title": "Update docs for v0.6", "body": "README source-types section, CHANGELOG, docs/architecture.md (typed sources + source-id provenance scheme). Cookbook entries for ingesting GitHub Issues and chat exports.", "labels": ["docs", "v0.6"]},
    {"title": "v0.6 release notes + tag", "body": "Cut release/v0.6 from dev, write CHANGELOG entries, tag, publish.", "labels": ["release", "v0.6"]},
]


V07_ISSUES: list[dict] = [
    {"title": "Ledger: source_time column for event-time vs ingest-time", "body": "Most v0.7 streams are temporal: an email's send time, a meeting's start, a calendar event, a highlight's saved-at. The current ledger only tracks `ingested_at` (when *we* saw it). Add a nullable `source_time` column distinct from `ingested_at`, indexed for range queries. Migrate existing rows with `source_time = NULL` (file streams have no canonical event time; populating from mtime is misleading). Document in docs/architecture.md alongside the v0.6 provenance scheme.", "labels": ["feat", "v0.7"]},
    {"title": "Source-id scheme: extend to v0.7 streams", "body": "Generalise v0.6's source-id scheme (#125) to cover v0.7 streams: `email:<message-id>`, `meeting:<provider>/<id>`, `cal:<calendar>/<uid>`, `highlight:<provider>/<book-id>/<location>`, `voice:<sha256>`, `bookmark:<provider>/<id>`. Doc-only if v0.6 leaves the column open-ended; otherwise enum extension + migration. Pre-req: v0.6 source-id provenance scheme.", "labels": ["feat", "v0.7"]},
    {"title": "Local Whisper.cpp integration for STT", "body": "src/llm/whisper.ts (or src/stt/whisper.ts). Vendored or shelled-out whisper.cpp binary; model downloaded once and cached under XDG data dir. Local-only, no Whisper-cloud API. Used by the audio extractor (next issue). Health check + model-presence detection, similar shape to OllamaProvider. Document model-size tradeoffs (tiny/base/small/medium) in docs/cookbook.", "labels": ["feat", "v0.7"]},
    {"title": "Audio extractor + content-type detection", "body": "src/core/extractors/audio.ts. Accepts m4a/mp3/wav/ogg/flac. Hashes source bytes (not transcript text) so re-running over an unchanged audio file is a no-op. Dispatches to Whisper (previous issue) and caches the transcript next to the ledger. Update extract/isSupported/contentTypeFor. Used by voice-memo ingestion and the meeting-transcript audio fallback. Pre-req: Whisper integration.", "labels": ["feat", "v0.7"]},
    {"title": "Email ingestion (mbox/Maildir)", "body": "Extractor for local Gmail Takeout `.mbox` and Thunderbird/mu Maildir trees. Per-message records keyed by `Message-ID` (fallback: hash of From+Date+Subject when missing). Strips quoted-reply chains, preserves attachments-as-references. Source-id `email:<message-id>`. PII-dense: full DENY+WARN+LLM-classifier runs before any text reaches the ledger; the ledger never stores raw email bodies in cleartext beyond the synthesised source-note. No IMAP, no Gmail API. Pre-reqs: source_time column, source-id scheme.", "labels": ["feat", "security", "v0.7"]},
    {"title": "Meeting-transcript ingestion", "body": "Extractor for `.vtt`/`.srt`/`.json` transcripts from Zoom, Teams, otter, Whisper output. Speaker-turn aware (preserves `[Speaker: Alex]` boundaries through to the source-note generator). Optional fallback path: raw audio file → audio extractor → Whisper. Source-id `meeting:<provider>/<id>` with provider inferred from filename or frontmatter hint. Pre-reqs: source_time column, audio extractor (for fallback path).", "labels": ["feat", "v0.7"]},
    {"title": "Calendar ingestion (iCal/.ics)", "body": "Extractor for local `.ics` files (Google/Outlook/Apple Calendar exports). Each `VEVENT` becomes a record; recurrence rules flattened into individual events bounded by a config window (default: ±2 years). Attendees, location, organiser preserved in frontmatter. Source-id `cal:<calendar>/<uid>`. Pairs with meetings: a calendar event and a meeting transcript with the same time window can be cross-linked downstream. Pre-reqs: source_time column, source-id scheme.", "labels": ["feat", "v0.7"]},
    {"title": "Voice memo ingestion", "body": "Audio-file walker for a configured `voice` source folder (typical case: phone export of `.m4a` files synced to a local directory). Bytes → audio extractor → Whisper → transcript record. Source-id `voice:<sha256>` since voice memos rarely have stable IDs. Re-import after a re-record is treated as a new source, not an update. Pre-reqs: audio extractor, Whisper.", "labels": ["feat", "v0.7"]},
    {"title": "Highlights ingestion (Readwise/Kindle/Hypothesis)", "body": "Extractor for highlight exports: Readwise CSV/JSON, Kindle `My Clippings.txt`, Hypothesis JSON. Each highlight is a record; the parent book/article appears as a synthesised parent source-note (one per book) so `[[wikilink]]` resolution from highlights to books works. Source-id `highlight:<provider>/<book-id>/<location>`. High signal-per-byte — exactly the surface a personal wiki should pull on aggressively.", "labels": ["feat", "v0.7"]},
    {"title": "Browser read-side capture", "body": "Read-only ingestion of browser history + read-later: Firefox `places.sqlite`, Chrome `History` (both copied to a temp file before reading — the live DB is locked while the browser runs), Pocket export JSON, Instapaper CSV. Captures what the user *read*, not what they wrote. Noisy: include a per-domain allowlist/denylist in config so social-media noise can be filtered out. Source-id `bookmark:<provider>/<id>` for read-later; `browser:<profile>/<url-hash>` for raw history.", "labels": ["feat", "v0.7"]},
    {"title": "Slack/Discord export ingestion", "body": "Distinct from v0.6's generic chat-transcript work (which targets Claude Code / ChatGPT JSON exports). Slack export is a zip of per-channel JSON; Discord uses DiscordChatExporter's JSON format. Per-message records under `chat:slack/<workspace>/<channel>/<ts>` and `chat:discord/<guild>/<channel>/<id>`. Reactions and threads preserved as frontmatter. Pre-req: v0.6 chat-transcript ingestion (shares the chat-transcript extractor scaffolding).", "labels": ["feat", "v0.7"]},
    {"title": "Automated tests for v0.7 source streams", "body": "Unit + integration coverage: source_time column round-trip, source-id scheme extensions, Whisper integration (skip-if-no-binary), audio extractor (golden bytes → cached transcript), email extractor (Message-ID dedup, quoted-reply stripping, PII-dense fixture run), meeting transcripts (speaker-turn preservation across vtt/srt/json), iCal recurrence flattening, voice-memo idempotency, highlights parent-source synthesis, browser-history locked-DB copy strategy, Slack/Discord export roundtrip. Live STT tests skip without Whisper present.", "labels": ["test", "v0.7"]},
    {"title": "Update docs for v0.7", "body": "README streams section (table of supported source streams + status), CHANGELOG, docs/architecture.md (source_time column, audio pipeline, source-id scheme extensions), docs/cookbook/ recipes: Gmail Takeout import, local Whisper setup + model selection, Slack/Discord export workflow, Readwise/Kindle highlight pipeline.", "labels": ["docs", "v0.7"]},
    {"title": "v0.7 release notes + tag", "body": "Cut release/v0.7 from dev, write CHANGELOG entries, tag, publish.", "labels": ["release", "v0.7"]},
]


V075_ISSUES: list[dict] = [
    {"title": "OS-keychain token vault", "body": "src/auth/token-vault.ts. Cross-platform secret storage abstraction over Windows Credential Manager, macOS Keychain, and Secret Service (libsecret) on Linux. OAuth refresh tokens, API keys, and per-source credentials never live in the config file or the ledger. Probably wraps `keytar` or `node-keytar` (vendored). Tokens are scoped per-source-id so revoking Gmail doesn't touch Calendar. Document the threat model in docs/architecture.md.", "labels": ["feat", "security", "v0.7.5"]},
    {"title": "OAuth PKCE flow handler for desktop", "body": "src/auth/oauth.ts. PKCE-compatible OAuth 2.0 flow targeting desktop apps: ephemeral loopback redirect server (random high port), state + code_verifier generation, browser hand-off via system-default browser. Refresh-token rotation handled centrally so connectors don't reimplement it. No headless flow — every grant requires a real browser approval the user can audit.", "labels": ["feat", "security", "v0.7.5"]},
    {"title": "Per-source consent gate + outbound-egress audit log", "body": "First live pull from a source writes a manifest entry the user must explicitly confirm (interactive prompt or `llm-wiki-gen consent <source-id>` for non-interactive cases). Subsequent pulls log every outbound request to ~/.local/share/llm-wiki-gen/egress.log with timestamp, source-id, host, byte count. The local-only stance is now opt-in-per-source rather than absolute; the audit log is what makes that auditable.", "labels": ["feat", "security", "v0.7.5"]},
    {"title": "Gmail API connector", "body": "src/connectors/gmail.ts. Live alternative to the v0.7 mbox extractor. Uses the Gmail API with `gmail.readonly` scope (never write, never modify). Per-message records keyed by `Message-ID`, ledger-deduped against any existing mbox-imported messages of the same ID. Incremental pull via `historyId`. PII pipeline runs identically to mbox path. Pre-reqs: token vault, OAuth handler, consent gate.", "labels": ["feat", "v0.7.5"]},
    {"title": "Google Calendar API connector", "body": "src/connectors/google-calendar.ts. Live alternative to v0.7's iCal extractor. `calendar.readonly` scope. Each `VEVENT` becomes a record under `cal:google/<calendar-id>/<uid>`. Recurrence flattening reuses the v0.7 iCal pipeline. Incremental pull via `syncToken`. Pre-reqs: token vault, OAuth handler, consent gate.", "labels": ["feat", "v0.7.5"]},
    {"title": "SECURITY.md rework: local-only scope clarification", "body": "Today SECURITY.md says 'no outbound network calls'. After v0.7.5 that's no longer absolutely true: ingestion can opt in per source. Rework the threat model section to explicitly partition the guarantees: (a) inference is local-only (Ollama loopback, llama.cpp), (b) ledger + wiki vault storage is local-only, (c) ingestion is local-by-default with per-source opt-in for OAuth-backed connectors. Document the egress audit log + consent gate as enforcement primitives. Remove or update README claims that conflict.", "labels": ["docs", "security", "v0.7.5"]},
    {"title": "Automated tests for v0.7.5 OAuth + connectors", "body": "Unit + integration coverage: token vault round-trip per platform (mocked keychain backend in CI; real keychain in a manual job), OAuth PKCE flow against a stubbed authorization server, consent gate (refuses without explicit confirmation), egress audit log (every outbound request appears), Gmail/Calendar connectors against recorded fixtures. Live API smoke tests gated on `GOOGLE_OAUTH_TEST=1` env so CI doesn't accidentally hit Google.", "labels": ["test", "security", "v0.7.5"]},
    {"title": "Update docs for v0.7.5", "body": "README live-pull section, CHANGELOG, docs/architecture.md (token vault + OAuth flow + consent gate + egress audit), docs/cookbook/ recipes: Gmail OAuth setup, Google Calendar OAuth setup, revoking tokens, reading the egress log. Cross-link from SECURITY.md.", "labels": ["docs", "v0.7.5"]},
    {"title": "v0.7.5 release notes + tag", "body": "Cut release/v0.7.5 from dev, write CHANGELOG entries, tag, publish.", "labels": ["release", "v0.7.5"]},
]

V08_ISSUES: list[dict] = [
    {"title": "contributor_id field across frontmatter, ledger, source-notes", "body": "Add `contributor_id` (typically `<user>@<host>` or a user-chosen handle) as a first-class field. Frontmatter on every source-note and topic page. Ledger column on `sources` and `runs`. Default value pulled from config (`[user].id`) so single-vault use is no-op. Pre-req for every other v0.8 issue. Document in docs/architecture.md.", "labels": ["feat", "v0.8"]},
    {"title": "Source-id scheme: team-vault-as-source", "body": "Extend the v0.6 provenance scheme (#125) and v0.7 extension to cover team vaults: `team:<vault-id>/<original-source-id>`. The team vault appears as a source stream from a personal vault's perspective once v0.9 lands the harvest direction; v0.8 only needs the scheme defined and the canonical-id round-trip tested. Pre-req: contributor_id field.", "labels": ["feat", "v0.8"]},
    {"title": "Promotion eligibility: share tag + shared/ folder convention", "body": "Two opt-in mechanisms with documented precedence: (1) frontmatter `share: team` (per-note opt-in, takes precedence), (2) `shared/` folder convention (any note under shared/ is promotion-eligible by default unless `share: false` overrides). Eligibility is necessary but not sufficient — promotion still goes through the boundary PII scanner and review workflow. Document in docs/architecture.md.", "labels": ["feat", "v0.8"]},
    {"title": "Boundary PII scanner (stricter than ingest)", "body": "src/scanners/pii-boundary.ts. Distinct module from the existing src/scanners/pii-regex.ts. Runs at the personal→team-vault boundary. WARN-tier blocks promotion (vs. ingest, where WARN is informational). Re-runs the LLM contextual classifier with team-vault policy as system prompt. Failed scans land in `claims/promotion-blocked/<id>.md` with the redacted hash trail so the author can see what blocked without re-exposing PII. Pre-req: contributor_id field.", "labels": ["feat", "security", "v0.8"]},
    {"title": "Team policy file (.llm-wiki/policy.toml)", "body": "Per-team-vault policy file. Zod schema. Fields: PII tier overrides, allowed_contributors list, required_reviewers count (default 1), retention rules (e.g., archive promoted notes older than N years), denied frontmatter keys (e.g., disallow `private: true` from being promoted). Loaded by promote/review-promotions. Document the schema in docs/architecture.md and provide a starter file via `init --team`.", "labels": ["feat", "security", "v0.8"]},
    {"title": "promote CLI verb (author-side)", "body": "src/commands/promote.ts. Marks notes for promotion: validates frontmatter eligibility, runs the boundary PII scanner, emits a structured promotion proposal (Markdown + frontmatter) into the team vault's `promotions/queue/<run-id>/<note-slug>.md`. Idempotent: re-promoting an unchanged note is a no-op. Flags: --target <team-vault-path>, --note <path-or-glob>, --dry-run. Pre-reqs: contributor_id, eligibility rules, boundary PII scanner, team policy.", "labels": ["feat", "v0.8"]},
    {"title": "review-promotions CLI verb (curator-side)", "body": "src/commands/review-promotions.ts. Curator-side counterpart to `promote`. Diff renderer for each queued promotion vs. existing team-vault state. Per-promotion accept/reject/edit/defer. Accept moves the note to its destination folder + records contributor_id + appends to log.md. Reject moves to `promotions/rejected/<run-id>/` with curator note. Pairs with v0.3's `review` and `commit` verbs. Pre-req: contributor_id field.", "labels": ["feat", "v0.8"]},
    {"title": "Cross-vault contradiction surfacing", "body": "Extend the v0.3 contradiction detector (#82) with contributor attribution. When promoted claims contradict existing team-vault claims, the contradiction record names both contributors (`brian@laptop` says X, `alex@desktop` says Y) and preserves both views in `claims/contested/<id>.md` rather than auto-resolving. Cross-vault contradictions never auto-resolve; curator decides via review-promotions. Pre-reqs: contributor_id field, v0.3 contradiction detector.", "labels": ["feat", "v0.8"]},
    {"title": "Topic aliasing across vaults", "body": "Two contributors might title the same topic differently (`topics/database-migrations.md` vs. `topics/db-migration-strategy.md`). Add `aliases:` frontmatter for explicit human-marked synonyms. LLM-suggested merges surface through `review-promotions` rather than auto-merging — surprising merges are worse than missed merges. Document the convention in docs/architecture.md.", "labels": ["feat", "v0.8"]},
    {"title": "MCP tools for promote and review-promotions", "body": "Add `promote` and `review_promotions` to src/mcp/server.ts. Same shape as the CLI verbs. Streaming progress for review-promotions if practical. Updates the MCP tool catalog in docs.", "labels": ["feat", "v0.8"]},
    {"title": "Automated tests for v0.8 team-vault flow", "body": "Unit + integration coverage: contributor_id round-trip through frontmatter/ledger/source-notes, share-tag + shared/-folder eligibility precedence, boundary PII scanner (WARN blocks at boundary, DENY blocks earlier), team policy loading + zod validation, promote → review-promotions end-to-end on a fixture pair of vaults, cross-vault contradiction surfacing with both-sides preservation, topic aliasing precedence (explicit aliases vs. LLM suggestions). Excludes harvest direction (v0.9).", "labels": ["test", "v0.8"]},
    {"title": "Update docs for v0.8", "body": "README team-vault section, CHANGELOG, docs/architecture.md (federation-lite: contributor_id, eligibility, boundary PII, policy, promotion + review). docs/cookbook/team-vault-setup.md walkthrough: two contributors, one team vault, end-to-end promotion flow.", "labels": ["docs", "v0.8"]},
    {"title": "v0.8 release notes + tag", "body": "Cut release/v0.8 from dev, write CHANGELOG entries, tag, publish.", "labels": ["release", "v0.8"]},
]

V09_ISSUES: list[dict] = [
    {"title": "Team-vault-as-source-stream (harvest direction)", "body": "Personal vault consumes a team vault as a read-only source stream. Closes the federation loop: knowledge promoted up by one contributor flows back down to others. Each personal vault tracks per-team-vault sync state in the ledger. Source-id `team:<vault-id>/<original-id>` from v0.8 #88 is the canonical key. Conflicts with locally-edited copies of the same note resolve via the v0.1 reconciler patterns (changed/duplicate/quarantined). Pre-req: v0.8 contributor_id + source-id scheme.", "labels": ["feat", "v0.9"]},
    {"title": "Signed-commit identity at promotion", "body": "Team policy can require `require_signed_commits: true` in .llm-wiki/policy.toml. When set, `review-promotions` refuses to accept proposals from unsigned heads on the contributor's wiki repo. Surfaces git's existing signature verification rather than reimplementing it. Document key-management in docs/cookbook (gpg vs. ssh-signing, GitHub-hosted keys, etc.).", "labels": ["feat", "security", "v0.9"]},
    {"title": "Per-contributor trust gradient", "body": "Team policy adds `trusted_contributors:` list. Trusted contributors' promotions auto-merge if they pass boundary PII + reviewer count is met. Untrusted contributors always require curator review even if PII clears. Trust is a binary in v0.9 (in or out of the list); finer-grained levels can come later. Pre-req: team policy file from v0.8.", "labels": ["feat", "security", "v0.9"]},
    {"title": "Promotion audit log", "body": "Append-only signed log per team vault: `audit/promotions.log`. Every promote/accept/reject/revert event recorded with timestamp, contributor_id, curator_id, note slug, decision rationale (free text from review-promotions). Compliance-friendly: log is git-tracked, lines are signed, never edited in place. v0.3's log.md handles per-vault append-only history; this is its team-scope cousin.", "labels": ["feat", "security", "v0.9"]},
    {"title": "Time-travel queries (--as-of)", "body": "Extend `query` (v0.4 #93) and `lint` to support `--as-of <date>` flag: traverse the wiki vault at a historical git commit. Useful for 'what did the team think about X in March?' and for compliance/audit ('what did we know on the day this decision was made?'). Implementation leans on git's existing object database; the tool just needs to point its readers at a specific tree. Pre-req: v0.4 query.", "labels": ["feat", "v0.9"]},
    {"title": "Promotion conflict resolution UX", "body": "When two contributors promote conflicting claims to the same topic in the same review window, the curator workflow surfaces both side-by-side rather than picking one arbitrarily (vs. the v0.1 reconciler's lex-smallest-path-wins for new files). Curator picks one, both, or sends back for revision. Records both as `claims/contested/<id>.md` if neither is chosen. Pre-req: v0.8 cross-vault contradiction surfacing.", "labels": ["feat", "v0.9"]},
    {"title": "Federation MCP tools (harvest, promote-stream)", "body": "Add `harvest` (pull team-vault updates into personal vault) and `promote_stream` (continuous-mode promotion for trusted contributors) to src/mcp/server.ts. Streaming progress where practical. Updates the MCP tool catalog in docs.", "labels": ["feat", "v0.9"]},
    {"title": "Automated tests for v0.9 federation", "body": "Unit + integration coverage: harvest direction round-trip (promote → harvest preserves contributor_id and source-id), signed-commit verification (acceptance vs. refusal cases), trusted-contributor auto-merge gates (PII still blocks even for trusted), audit log append-only invariant (no rewrites, signed lines), --as-of queries against a multi-commit fixture vault, conflict resolution UX (both-sides preservation, curator pick path).", "labels": ["test", "v0.9"]},
    {"title": "Update docs for v0.9", "body": "README federation section, CHANGELOG, docs/architecture.md (full federation: harvest, signed identity, trust gradient, audit log, time-travel). docs/cookbook/ recipes: configuring signed commits, setting up trusted contributors, reading the audit log, querying historical state. SECURITY.md updated for federation threat model.", "labels": ["docs", "v0.9"]},
    {"title": "v0.9 release notes + tag", "body": "Cut release/v0.9 from dev, write CHANGELOG entries, tag, publish.", "labels": ["release", "v0.9"]},
]


ISSUE_SETS: dict[str, tuple[str, list[dict]]] = {
    "v0.1": ("v0.1 — Foundation & Safety", V01_ISSUES),
    "v0.2": ("v0.2 — LLM Ingest (Ollama)", V02_ISSUES),
    "v0.3": ("v0.3 — Synthesis", V03_ISSUES),
    "v0.4": ("v0.4 — Query", V04_ISSUES),
    "v0.5": ("v0.5 — Polish", V05_ISSUES),
    "v0.6": ("v0.6 — Source types beyond files", V06_ISSUES),
    "v0.7": ("v0.7 — More source streams", V07_ISSUES),
    "v0.7.5": ("v0.7.5 — Live source pulls (OAuth)", V075_ISSUES),
    "v0.8": ("v0.8 — Team vault (one-way promotion)", V08_ISSUES),
    "v0.9": ("v0.9 — Full federation", V09_ISSUES),
}


def gh(args: list[str], *, body: str | None = None) -> tuple[int, str]:
    # Force UTF-8 for both stdin (POST bodies) and stdout. Without this, Python on
    # Windows uses cp1252 for the gh subprocess, which mojibakes em-dashes in
    # milestone/issue titles before they reach the GitHub API.
    res = subprocess.run(
        ["gh", *args],
        input=body,
        capture_output=True,
        encoding="utf-8",
    )
    return res.returncode, res.stdout + res.stderr


def existing_milestones(repo: str) -> dict[str, int]:
    rc, out = gh(["api", f"/repos/{repo}/milestones?state=all&per_page=100"])
    if rc != 0:
        sys.exit(f"failed to list milestones: {out}")
    return {m["title"]: m["number"] for m in json.loads(out)}


def existing_issue_titles(repo: str) -> set[str]:
    """Return all issue titles across pages. /issues includes PRs but that's fine for dedup."""
    titles: set[str] = set()
    page = 1
    while True:
        rc, out = gh(["api", f"/repos/{repo}/issues?state=all&per_page=100&page={page}"])
        if rc != 0:
            sys.exit(f"failed to list issues: {out}")
        batch = json.loads(out)
        if not batch:
            break
        titles.update(i["title"] for i in batch)
        if len(batch) < 100:
            break
        page += 1
    return titles


def ensure_milestone(repo: str, title: str, description: str, existing: dict[str, int]) -> int:
    if title in existing:
        print(f"[milestone] exists: {title}")
        return existing[title]
    rc, out = gh(
        ["api", "-X", "POST", f"/repos/{repo}/milestones", "--input", "-"],
        body=json.dumps({"title": title, "description": description, "state": "open"}),
    )
    if rc != 0:
        sys.exit(f"create milestone failed: {out}")
    number = json.loads(out)["number"]
    print(f"[milestone] created: {title} (#{number})")
    return number


def ensure_issue(repo: str, milestone: int, issue: dict, existing: set[str]) -> None:
    title = issue["title"]
    if title in existing:
        print(f"[issue] exists: {title}")
        return
    body = json.dumps(
        {
            "title": title,
            "body": issue["body"],
            "labels": issue.get("labels", []),
            "milestone": milestone,
        }
    )
    rc, out = gh(["api", "-X", "POST", f"/repos/{repo}/issues", "--input", "-"], body=body)
    if rc != 0:
        sys.exit(f"create issue failed for {title}: {out}")
    print(f"[issue] created: {title}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("repo", help="GitHub repo in owner/name form, e.g. bminier/llm-wiki-gen")
    parser.add_argument(
        "--milestone",
        choices=[*ISSUE_SETS.keys(), "all"],
        default="all",
        help="Which milestone's issues to seed (default: all). Milestones themselves are always ensured.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repo = args.repo

    milestones = existing_milestones(repo)
    for m in MILESTONES:
        milestones[m["title"]] = ensure_milestone(repo, m["title"], m["description"], milestones)

    selected = list(ISSUE_SETS.keys()) if args.milestone == "all" else [args.milestone]
    issues = existing_issue_titles(repo)
    for key in selected:
        milestone_title, issue_list = ISSUE_SETS[key]
        milestone_num = milestones[milestone_title]
        print(f"\n=== seeding {key} ({len(issue_list)} issues) ===")
        for i in issue_list:
            ensure_issue(repo, milestone_num, i, issues)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
