#!/usr/bin/env python3
"""Seed GitHub milestones and issues for llm-wiki-gen via `gh`.

Usage:
    python scripts/new-issues.py <owner/repo>
    python scripts/new-issues.py <owner/repo> --milestone v0.2
    python scripts/new-issues.py <owner/repo> --milestone all

Idempotent: skips milestones/issues whose titles already exist.

Issue bodies mirror the per-milestone tables in docs/roadmap.md. Update
the roadmap first, then update the corresponding V0X_ISSUES block here.
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
    {"title": "PII contextual classifier (LLM)", "body": "src/scanners/pii-llm.ts. Takes regex WARN-tier hits + ±200-char window, asks Ollama 'is this personal or business context?' with a strict JSON schema response. Can promote WARN→DENY or demote WARN→ALLOW. Runs after pii-regex in `sync`.", "labels": ["feat", "security", "v0.2"]},
    {"title": "PDF extractor", "body": "src/core/extractors/pdf.ts. Vendored pdf-parse or pdfjs. Hashes the source bytes, not the extracted text. Update extract/isSupported/contentTypeFor. Add fixture under tests/fixtures/.", "labels": ["feat", "v0.2"]},
    {"title": "DOCX extractor", "body": "src/core/extractors/docx.ts. Likely `mammoth`. Same shape as the PDF extractor. Add fixture under tests/fixtures/.", "labels": ["feat", "v0.2"]},
    {"title": "Source-note generator", "body": "Given an extracted source, emit source-notes/<slug>.md with proper frontmatter (source_id, hash, ingested, type, tags), summary, claims, entities, links. Idempotent: re-running over an unchanged source is a no-op.", "labels": ["feat", "v0.2"]},
    {"title": "ingest command — real implementation", "body": "Replace the v0.1 stub. Reads ledger for new/changed sources, calls extractor + classifier + generator, writes notes, updates ledger status to `unchanged`. Flags: --since <run-id>, --limit N, --source <id>.", "labels": ["feat", "v0.2"]},
    {"title": "Append-only log.md writer", "body": "Per the gist spec: each ingest/query run appends a dated entry to log.md. Parse-resistant: write through a single helper so format stays stable.", "labels": ["feat", "v0.2"]},
    {"title": "MCP ingest tool — non-stub", "body": "Update src/mcp/server.ts to dispatch to the real ingest pipeline. Stream progress over MCP if practical; otherwise return summary.", "labels": ["feat", "v0.2"]},
    {"title": "Slug + filename strategy", "body": "Stable, collision-free slugs from arbitrary source paths. Frontmatter must round-trip after rename. Document the algorithm in docs/architecture.md.", "labels": ["feat", "v0.2"]},
    {"title": "pii-llm integration tests", "body": "Use a tiny local model in CI (or skip on no-Ollama with a clear message). Cover: personal email correctly promoted, business email correctly demoted, ambiguous case stays at warn.", "labels": ["test", "security", "v0.2"]},
    {"title": "Ingest cost accounting", "body": "Per-run token count + wall time written to runs.summary_json. Surface via `status` MCP tool.", "labels": ["feat", "v0.2"]},
    {"title": "Automated tests for v0.2 ingest pipeline", "body": "Unit + integration coverage for: Ollama client (mocked + skip-if-no-Ollama live), PDF/DOCX extractors (golden bytes), source-note generator (idempotency), `ingest` end-to-end, `log.md` round-trip, MCP `ingest` tool, slug strategy, cost accounting. Excludes pii-llm (own issue).", "labels": ["test", "v0.2"]},
    {"title": "Update docs for v0.2", "body": "README LLM-ingest section, CHANGELOG, docs/architecture.md (extractor pipeline + slug algorithm + log.md format), docs/pii-tiers.md (LLM promotion/demotion rules). Mark v0.2 done in docs/roadmap.md.", "labels": ["docs", "v0.2"]},
    {"title": "v0.2 release notes + tag", "body": "Cut release/v0.2 from dev, write CHANGELOG entries, tag, publish.", "labels": ["release", "v0.2"]},
]

V03_ISSUES: list[dict] = [
    {"title": "Topic page agent", "body": "src/synthesis/topics.ts. Given new/changed source-notes, pick affected topics and update topics/<name>.md. Preserves human edits between agent-managed sections.", "labels": ["feat", "v0.3"]},
    {"title": "Section markers (agent:start/agent:end)", "body": "Convention for 'agent owns this region; human owns the rest' using <!-- agent:start ... --> / <!-- agent:end --> comments. Document in docs/architecture.md.", "labels": ["feat", "v0.3"]},
    {"title": "Contradiction detector", "body": "Compare new source-note claims against existing topic claims. Emit claims/contradictions/<id>.md when divergence is detected.", "labels": ["feat", "v0.3"]},
    {"title": "index.md auto-maintenance", "body": "Keep the root index in sync with the actual folder structure. Don't fight Obsidian's preferred Dataview pattern.", "labels": ["feat", "v0.3"]},
    {"title": "Wikilink graph health in lint", "body": "Add metrics: average inbound links, isolated clusters, deepest path. Print as a table in human mode; JSON in --json mode.", "labels": ["feat", "v0.3"]},
    {"title": "Synthesis test fixtures", "body": "Tiny vault + tiny source set that exercises the full ingest→synthesize loop. Used by both unit tests and the v0.3 smoke test.", "labels": ["test", "v0.3"]},
    {"title": "Query-aware lint", "body": "When `lint` finds a topic referenced by a wikilink that has no corresponding topics/<name>.md, suggest creating it (printed only, doesn't fail).", "labels": ["feat", "v0.3"]},
    {"title": "Automated tests for v0.3 synthesis", "body": "Use the synthesis fixtures to drive: topic-page agent (round-trip through <!-- agent:start/end -->), contradiction detector (golden divergence cases), index.md auto-maintenance, wikilink-graph metrics, query-aware lint suggestions.", "labels": ["test", "v0.3"]},
    {"title": "Update docs for v0.3", "body": "README synthesis section, CHANGELOG, docs/architecture.md (topic-agent contract, section-marker convention, contradiction format). Mark v0.3 done in docs/roadmap.md.", "labels": ["docs", "v0.3"]},
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
    {"title": "Update docs for v0.4", "body": "README query workflow, CHANGELOG, docs/architecture.md (retrieval layer + citation rules). Mark v0.4 done in docs/roadmap.md.", "labels": ["docs", "v0.4"]},
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
    {"title": "v1.0 readiness checklist", "body": "Audit threats in SECURITY.md against the implemented surface. Triage .unresolved-allowed.txt accumulation. Document upgrade path.", "labels": ["chore", "security", "v0.5"]},
    {"title": "MCP client compatibility", "body": "Verify the stdio MCP server works with Copilot, Codex CLI, Cursor, and Claude Desktop. Provide per-client config snippets (mcp.json / settings.json). Confirm tool descriptions are clear enough for agents to use without hand-holding. Smoke-test each client against the live server.", "labels": ["feat", "docs", "v0.5"]},
    {"title": "Automated tests for v0.5 features", "body": "watch-mode debounce, parallel-extraction concurrency cap, ledger queries under load, llama.cpp adapter parity with Ollama, embedding retrieval, MCP-client smoke tests. Excludes perf benchmarks (own issue).", "labels": ["test", "v0.5"]},
    {"title": "Update docs for v0.5", "body": "README, CHANGELOG, docs/architecture.md (provider abstraction + watch mode + MCP client config). Mark v0.5 done in docs/roadmap.md. Cookbook is its own issue.", "labels": ["docs", "v0.5"]},
    {"title": "v0.5 release notes + tag", "body": "Cut release/v0.5 from dev, write CHANGELOG entries, tag, publish.", "labels": ["release", "v0.5"]},
]


ISSUE_SETS: dict[str, tuple[str, list[dict]]] = {
    "v0.1": ("v0.1 — Foundation & Safety", V01_ISSUES),
    "v0.2": ("v0.2 — LLM Ingest (Ollama)", V02_ISSUES),
    "v0.3": ("v0.3 — Synthesis", V03_ISSUES),
    "v0.4": ("v0.4 — Query", V04_ISSUES),
    "v0.5": ("v0.5 — Polish", V05_ISSUES),
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
