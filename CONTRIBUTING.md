# Contributing

## Setup

```bash
git clone <this repo> && cd llm-wiki-gen
bun install
bun pm trust @biomejs/biome   # one-time, allows Biome to install its platform binary
python scripts/install-hooks.py
```

`install-hooks.py` checks for `bun`, `gitleaks`, and `pre-commit`. It will
attempt `pip install --user pre-commit` if that's missing.

## Branching

- All work merges into **`dev`** via PR. There is no `main` branch.
- Cut `release/<name>` and `prerelease/<name>` from `dev` for staging /
  release.
- For follow-up work on someone else's open PR, prefer
  `git worktree add` over switching the working tree.

## Local dev loop

```bash
bun run typecheck
bun test
bun run lint
bun run src/cli.ts sync         # smoke-test the CLI against your own source folder
```

Before pushing:

```bash
pre-commit run --all-files
```

## Adding code

- **No real PII** in fixtures or commits. Use synthetic values; the existing
  fixtures are safe to copy from.
- New extractors: add `src/core/extractors/<type>.ts`, register it in
  `extractors/index.ts`, ship a fixture and tests.
- New PII rules: add to `src/scanners/rules/{deny,warn}.ts`, add a test in
  `tests/unit/pii-regex.test.ts`, document in `docs/pii-tiers.md`.
- New commands: register in `src/cli.ts` (citty) **and** expose over MCP if
  useful (`src/mcp/server.ts`).

## Commit messages

Conventional Commits:

```
feat(scanner): add IBAN check for Spanish accounts
fix(reconciler): preserve canonical_id across re-runs
docs(security): clarify allowlist symlink semantics
chore(ci): bump setup-bun to v2
```

## Tests

- Unit tests live in `tests/unit/` mirroring the `src/` layout.
- Integration tests under `tests/integration/` create temp dirs and a
  fresh in-memory or temp-file ledger.
- Coverage isn't enforced in v0.1 but will be in v0.3+. Aim for the happy
  path *and* one corner case per feature.

## Running the MCP server

```bash
bun run src/cli.ts mcp
```

Then point an MCP-aware client at it. Tools: `sync`, `ingest`, `lint`,
`status`. v0.4 adds `query`.
