# Security

`llm-wiki-gen` ingests potentially sensitive personal documents and writes a
synthesized wiki. Security is a first-class concern of the v0.1 design.

## Threat model

The threats this tool defends against, in priority order:

1. **PII leakage into the wiki.** Personal documents — tax forms, financial
   records, medical files, recovery codes — must never end up in a synthesis
   page that gets opened in Obsidian, committed to git, or sent to an LLM.
2. **Source corruption.** A bug or a malicious agent prompt must not write to
   the source allowlist. The source folder is the user's archive of record.
3. **Secret exfiltration via the wiki.** API keys, SSH private keys, and other
   credentials in the source folder must not flow downstream.
4. **Symlink / path-traversal escape.** A symlink inside an allowlisted folder
   that points outside it must not allow the scanner or future ingest pipeline
   to read non-allowlisted content.
5. **Network exfiltration of source content.** Even by accident: PII that hits
   a remote LLM API is a compliance problem.

## Defenses

### Allowlist with symlink resolution

`Allowlist` resolves real paths before every containment check. Symlinks
inside an allowed root that target an outside path are rejected.
See `src/core/allowlist.ts`.

### Read-only source semantics

No code path in the tool opens a source file for write. The allowlist is
checked before every read; future write paths land outside it (the wiki vault
is a separate, configurable directory). This is enforced by code structure,
not by filesystem permissions, but the choice is explicit and tested.

### PII scanner — three tiers

The DENY tier blocks ingest entirely (sources are *quarantined*); WARN
surfaces findings without blocking; ALLOW is suppressed silently. Tiers and
rules are documented in [docs/pii-tiers.md](docs/pii-tiers.md). DENY rules use
checksums (Luhn, ABA) to cut false positives.

### gitleaks pre-commit + CI

A staged-file scan runs on every commit; full-history scans run on every push
and weekly on a schedule. The custom rule for `LLM_WIKI_*` env tokens prevents
project-specific tokens from being committed.

### LLM is local-only by default

The v0.2 ingest pipeline targets Ollama on `localhost:11434`. The provider
field in the config schema accepts only `"ollama"` or `"none"` — we will not
add a remote-API provider without an opt-in flag and a confirmation prompt.

### Hash-redacted scan log

The ledger records that a finding occurred but redacts the matched value
(only the first/last two characters are kept). The full PII never lives in
the ledger.

## Reporting a vulnerability

Open a [GitHub Security Advisory][advisories] (private) on this repository. Do
not file a public issue. The maintainer will respond within seven days.

[advisories]: https://docs.github.com/en/code-security/security-advisories/working-with-repository-security-advisories/about-repository-security-advisories

## Supported versions

v0.1 is in active development; only `dev` and the most recent
`prerelease/*` branch receive security fixes.

## Known limitations (v0.1)

- The PII regex set is deterministic and explainable but has false negatives
  on creative spellings and free-form personal narratives. The LLM-tiered
  contextual classifier in v0.2 (`pii-llm.ts`) will help.
- `pdf` and `docx` extractors are deferred to v0.2. Today these formats are
  not scanned for PII; do not place them under the allowlist until v0.2 ships.
- The `init`-scaffolded vault is git-tracked separately from this tool. The
  user is responsible for not pushing the wiki to a public remote.
