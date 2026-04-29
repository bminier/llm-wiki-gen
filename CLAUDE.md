# CLAUDE.md — llm-wiki-gen

Notes for Claude Code (and other agents) working in this repo.

## Branch model

- Default working branch is **`dev`**, not `main`/`master`. There is no `main`.
- Promotion path: `dev` → `prerelease/<name>` → `release/<name>`.
- For any operation that isn't on the current checked-out branch, use
  `git worktree add` rather than switching the working tree.

## Conventions

- Runtime: **Bun + TypeScript**. Setup scripts (under `scripts/`) are Python
  for portability — but the tool itself is pure Bun.
- Strict TypeScript (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  etc.). Don't relax these.
- Linter/formatter: **Biome**. Run `bun run lint`. Do not introduce ESLint or
  Prettier alongside it.
- Tests: **`bun:test`**. Co-locate fixture data under `tests/fixtures/`.
- Commit style: **Conventional Commits** (`feat:`, `fix:`, `chore:`,
  `docs:`, `test:`, `refactor:`).

## What goes where

```
src/core/        ledger, walker, reconciler, allowlist, config — no IO outside these
src/scanners/    pii-regex (deterministic), pii-llm (v0.2), secrets (gitleaks)
src/obsidian/    frontmatter, wikilinks, dataview block sanity
src/commands/    sync, ingest, lint, init — orchestration only; logic lives in core/
src/mcp/         stdio MCP server; thin shell over commands/
src/cli.ts       citty entrypoint
scripts/         Python setup scripts; one Bun shim (pii-precommit.ts)
tests/unit/      one file per src module
tests/integration/ end-to-end runs that touch the filesystem and ledger
tests/fixtures/  pii-samples/, vaults/, sources/
```

## Where state lives

- **Ledger**: `~/.local/share/llm-wiki-gen/ledger.db` (XDG; override with
  `--ledger`). SQLite via `bun:sqlite`. Schema in `src/core/ledger.ts`.
- **Config**: `~/.config/llm-wiki-gen/config.toml` (XDG; override with
  `--config`). Validated by zod (`src/core/config.ts`).
- **Wiki vault**: configurable, default `~/llm-wiki`. Separate from this repo.
- **Source allowlist**: configurable, default `~/llm-wiki-source`. **Read-only**.

## Running things

```bash
bun run typecheck          # tsc --noEmit
bun test                   # all tests
bun run lint               # Biome check
bun run src/cli.ts <cmd>   # invoke the CLI in dev
pre-commit run --all-files # full hook stack
```

The pre-commit suite runs typecheck + tests + lint + gitleaks + PII DENY scan.
A failed hook means a real issue — investigate, don't bypass with `--no-verify`.

## What NOT to commit

- **No real PII.** Test fixtures under `tests/fixtures/pii-samples/` use
  synthetic values (the canonical Visa test number `4111 1111 1111 1111`,
  the canonical BIP-39 abandon-mnemonic, etc.).
- **No `.env`** with real keys. The repo's `.gitignore` blocks them; gitleaks
  will catch escapees.
- **No PDF/DOCX fixtures** until v0.2 lands extractors for them.
- **No generated wikis.** The Obsidian vault is a separate repo on the user's
  machine.

## Gotchas

- The ledger's DDL is split into individual statements and applied via a
  bound method (`runDDL`) in `src/core/ledger.ts`. Some sandboxed editors
  flag multi-statement SQLite calls because the substring resembles a shell
  function name; the bind-and-loop pattern sidesteps the heuristic without
  changing semantics. Keep that pattern when extending the schema.
- The hash for `tests/fixtures/pii-samples/synthetic.txt` is **deliberately
  hot** — it contains DENY-tier strings. Pre-commit allowlist excludes
  `tests/fixtures/pii-samples/.*` from gitleaks.
- Glob-matching in `src/core/walker.ts` is a tiny bespoke implementation
  (`globMatches`). It supports `*`, `**`, and `?`. If a real glob need shows
  up, swap in `picomatch`; don't grow the bespoke version further.

## When extending

- **New extractor**: add `src/core/extractors/<type>.ts` + register in
  `extractors/index.ts`. Update `contentTypeFor` and add a fixture in
  `tests/fixtures/`.
- **New PII rule**: add to `src/scanners/rules/deny.ts` (or `warn.ts`) with a
  test case in `tests/unit/pii-regex.test.ts` and an entry in
  `docs/pii-tiers.md`.
- **New CLI flag**: add to the relevant `defineCommand` block in
  `src/cli.ts` and propagate through to the command function. Add an MCP
  tool argument if the flag is meaningful over MCP.
