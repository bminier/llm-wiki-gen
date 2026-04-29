#!/usr/bin/env python3
"""Seed the v0.1 GitHub milestone and its issues via `gh`.

Usage:
    python scripts/new-issues.py <owner/repo>

Idempotent-ish: skips milestones/issues whose titles already exist.
"""
from __future__ import annotations

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
    {"title": "v0.5 — Polish", "description": "watch mode, perf, cookbook docs."},
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


def gh(args: list[str], *, body: str | None = None) -> tuple[int, str]:
    res = subprocess.run(["gh", *args], input=body, text=True, capture_output=True)
    return res.returncode, res.stdout + res.stderr


def existing_milestones(repo: str) -> dict[str, int]:
    rc, out = gh(["api", f"/repos/{repo}/milestones?state=all&per_page=100"])
    if rc != 0:
        sys.exit(f"failed to list milestones: {out}")
    return {m["title"]: m["number"] for m in json.loads(out)}


def existing_issue_titles(repo: str) -> set[str]:
    rc, out = gh(["api", f"/repos/{repo}/issues?state=all&per_page=100"])
    if rc != 0:
        sys.exit(f"failed to list issues: {out}")
    return {i["title"] for i in json.loads(out)}


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


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: new-issues.py <owner/repo>", file=sys.stderr)
        return 2
    repo = sys.argv[1]

    milestones = existing_milestones(repo)
    for m in MILESTONES:
        milestones[m["title"]] = ensure_milestone(repo, m["title"], m["description"], milestones)

    issues = existing_issue_titles(repo)
    v01 = milestones["v0.1 — Foundation & Safety"]
    for i in V01_ISSUES:
        ensure_issue(repo, v01, i, issues)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
