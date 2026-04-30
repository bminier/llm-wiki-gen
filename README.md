# llm-wiki-gen

Local-first agent-driven Markdown knowledge base. A concrete implementation
of [Karpathy's LLM Wiki pattern][gist] with strong safety rails: a read-only
source allowlist, tiered PII scanning (DENY / WARN / ALLOW), gitleaks for
secrets, and pre-commit hooks for everything that should never reach git.

**Local-first means local-only.** The LLM provider is constrained to
[Ollama](https://ollama.com) running on a loopback address (default
`localhost:11434`; `127.0.0.0/8` and `::1` also accepted), or `none` (off).
There is no remote-API integration and no telemetry. Non-loopback URLs are
rejected at provider construction time, so a typo or malicious config can't
quietly turn the LLM client into an exfiltration channel. Adding a remote
provider requires a code change plus an explicit confirmation per
[SECURITY.md](SECURITY.md).

[gist]: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f

> **Status:** v0.1 (Foundation & Safety) shipped. The synthesis pipeline (LLM
> ingest) lands in v0.2. See
> [GitHub milestones](https://github.com/bminier/llm-wiki-gen/milestones) for
> active scope and [CHANGELOG.md](CHANGELOG.md) for what shipped.

## What it does

```
~/llm-wiki-source/  (read-only)        ~/llm-wiki/  (Obsidian vault)
        │                                       ▲
        ▼                                       │
   sync (walk + scan + ledger)        ingest (LLM, v0.2+)
        │                                       │
        └────────►  ledger.db  ─────────────────┘
                    (SQLite)
```

- **`sync`** scans an allowlisted source folder, hashes every file, detects
  renames and duplicates, runs the PII regex scanner, and updates a SQLite
  ledger. Files with DENY-tier findings are *quarantined* — never advanced
  to the synthesis pipeline.
- **`lint`** validates frontmatter, wikilinks, and Dataview blocks in the
  Obsidian vault. Runs offline; no LLM calls.
- **`init`** scaffolds an empty Obsidian vault that lints clean from day one.
- **`mcp`** starts a stdio MCP server exposing `sync`, `lint`, `status`, and
  `ingest` — useful with Claude Code, Claude Desktop, or any MCP client.
- **`ingest`** is a stub in v0.1; the LLM pipeline lands in v0.2 and runs
  exclusively against an Ollama daemon on `localhost`. No outbound network
  calls; the model weights live on your disk.

## Quickstart

```bash
# 0) Prereqs
#    - Bun 1.3+                                          https://bun.sh
#    - Ollama (only needed for v0.2+; runs locally)      https://ollama.com
#    - gitleaks (recommended, for ad-hoc secret scans)   https://github.com/gitleaks/gitleaks
#
#    Ollama setup, when you reach v0.2:
#       curl -fsSL https://ollama.com/install.sh | sh    # or download installer
#       ollama pull llama3.1:8b                          # ~4.7 GB; one-time
#       ollama serve                                     # listens on localhost:11434

# 1) Clone and install
git clone <this repo> && cd llm-wiki-gen
bun install
bun pm trust @biomejs/biome

# 2) Install pre-commit hooks (Python)
python scripts/install-hooks.py

# 3) Seed an empty Obsidian vault
bun run src/cli.ts init ~/llm-wiki

# 4) Point the tool at your read-only source folder
mkdir -p ~/llm-wiki-source
cp some-notes.md ~/llm-wiki-source/

# 5) Run the safety-first pipeline
bun run src/cli.ts sync
bun run src/cli.ts lint --wiki ~/llm-wiki
```

## Configuration

Default config path: `~/.config/llm-wiki-gen/config.toml`. All keys have
sensible defaults if the file is absent.

```toml
[sources]
allowlist     = ["~/llm-wiki-source"]   # read-only; symlinks resolved before checks
exclude_globs = ["**/.DS_Store", "**/node_modules/**", "**/.git/**"]

[wiki]
path = "~/llm-wiki"

[scanners]
pii_regex                = true
gitleaks                 = true
fail_on_warn             = false        # WARN doesn't block; DENY always does
business_email_domains   = ["mycompany.com"]
business_phone_allowlist = ["+1-800-555-0199"]

[llm]
# provider is restricted by zod to "ollama" or "none". A remote-API provider
# would require a code change plus an explicit confirmation step.
provider = "ollama"
# base_url is enforced loopback at provider construction: localhost,
# 127.0.0.0/8, or ::1 only. Bare-origin only (no path/query/fragment).
base_url = "http://localhost:11434"
model    = "llama3.1:8b"
```

## Commands

| Command | Purpose |
| --- | --- |
| `sync` | Walk allowlist, hash, dedup/move-detect, scan, update ledger |
| `sync --explain-dups` | Print canonical/duplicate path pairs |
| `sync --json` | Emit a machine-readable summary |
| `lint [--wiki <path>]` | Validate frontmatter, wikilinks, Dataview blocks |
| `lint --frontmatter-only` / `--wikilinks-only` / `--dataview-only` | Scoped lint |
| `init [<path>]` | Scaffold a starter Obsidian vault |
| `ingest --dry-run` | Print what an ingest run would do (v0.1 stub) |
| `mcp` | Start the stdio MCP server |
| `--version` / `--help` | Standard |

## How the safety rails fit together

| Layer | What it catches | Where |
| --- | --- | --- |
| Allowlist (`Allowlist`) | Symlink escape; path traversal | `src/core/allowlist.ts` |
| PII regex DENY | SSN, Luhn-CC, ABA-routing, IBAN, AWS/GCP/Azure keys, OpenSSH keys, BIP-39 mnemonics | `src/scanners/rules/deny.ts` |
| PII regex WARN | Phone/email near personal-context tokens | `src/scanners/rules/warn.ts` |
| gitleaks (subprocess) | Credentials, API tokens | `src/scanners/secrets.ts` + `.gitleaks.toml` |
| Pre-commit hooks | Above, applied to staged files | `.pre-commit-config.yaml` |
| CI gitleaks workflow | Full-history scan, weekly schedule | `.github/workflows/gitleaks.yml` |
| Ledger redaction | Findings logged with PII-redacted match | `src/commands/sync.ts` |

Full PII-tier table: [docs/pii-tiers.md](docs/pii-tiers.md). Threat model:
[SECURITY.md](SECURITY.md).

## Status state machine

A source's ledger row transitions through:

```
new ─► unchanged ◄─► changed
     ╲              ╱
      ╲            ╱
       ▼          ▼
       quarantined   (DENY-tier finding; needs human override)

         moved        (rename detected via hash match against a deleted candidate)
         duplicate    (same hash as a still-live row; canonical_id points to the original)
         deleted      (in ledger, missing from source set, not claimed by a move)
```

The dedup/move logic is implemented in `src/core/reconciler.ts` and tested
across all seven status transitions in `tests/unit/reconciler.test.ts`.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md). The short version:

```bash
bun run typecheck
bun test
bun run lint
pre-commit run --all-files
```

## License

MIT — see [LICENSE](LICENSE).
