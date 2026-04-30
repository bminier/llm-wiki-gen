# Changelog

All notable changes to this project will be documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [SemVer](https://semver.org/) where the first stable release
will be `v1.0.0`.

## [Unreleased]

### Added — v0.1 (Foundation & Safety)

- Project scaffolding: Bun + TypeScript, Biome, strict tsconfig, MIT license.
- Config loader (`src/core/config.ts`): zod-validated TOML at
  `~/.config/llm-wiki-gen/config.toml`, path expansion, business-domain
  allowlists.
- Read-only source allowlist (`src/core/allowlist.ts`) with symlink-resolving
  containment checks and `AllowlistViolation` exception.
- SQLite ledger (`src/core/ledger.ts`) with `sources`, `path_history`,
  `scans`, and `runs` tables. Indexes on `hash`, `status`, `canonical_id`.
- Walker + extractors: streamed SHA-256 hashing, glob-style excludes;
  `md`/`txt`/`html`/`csv` extractors (pdf/docx deferred to v0.2).
- Two-pass sync reconciler (`src/core/reconciler.ts`) with content-hash
  duplicate detection and rename/move detection. Status set:
  `new | unchanged | changed | moved | duplicate | deleted | quarantined`.
- PII regex scanner with DENY/WARN/ALLOW tiers (`src/scanners/pii-regex.ts`):
  SSN, Luhn-validated credit cards, ABA-checksummed routing numbers, IBAN,
  AWS/GCP/Azure keys, OpenSSH private key headers, BIP-39 mnemonics, and
  bank account numbers near contextual keywords.
- WARN-tier context heuristics for emails and phone numbers; configurable
  business-domain and business-phone allowlists.
- gitleaks wrapper (`src/scanners/secrets.ts`) and `.gitleaks.toml` with a
  custom `LLM_WIKI_*` token rule.
- `sync` command: end-to-end pipeline with `--json`, `--explain-dups`,
  hash-redacted scan log, and quarantine-on-DENY behavior.
- `lint` command: per-folder zod frontmatter schemas, wikilink resolution
  with orphan detection, and Dataview block sanity check.
- `init` command: scaffolds an Obsidian-ready vault that lints clean.
- `ingest` stub: prints the ledger plan, exits 2 unless `--dry-run`.
- MCP stdio server (`src/mcp/server.ts`) exposing `sync`, `ingest`, `lint`,
  and `status` tools.
- Pre-commit suite: gitleaks, frontmatter/wikilink/Dataview checks via the
  CLI, Biome, typecheck, full test suite, and a DENY-tier PII shim.
- CI: matrix typecheck/test/lint on Ubuntu/macOS/Windows; gitleaks workflow
  on push, PR, and a weekly schedule.
- Issue and PR templates; `scripts/setup-branch-protection.py`;
  `scripts/new-issues.py` to seed the v0.1 milestone.
- Documentation: README, SECURITY, CLAUDE, CONTRIBUTING,
  `docs/architecture.md`, `docs/pii-tiers.md`.

### Notes

- PDF and DOCX extractors are intentionally deferred to v0.2.
- The `ingest` command is a stub in v0.1; the LLM pipeline lands in v0.2.
