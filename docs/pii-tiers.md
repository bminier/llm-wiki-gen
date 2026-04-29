# PII Tiers

`llm-wiki-gen` classifies findings into three severity tiers. The action
each tier triggers is the same across every scanner.

| Tier | Scanner action | Effect on `sync` |
| --- | --- | --- |
| **DENY** | Mark source as `quarantined` | Exit code 1; ingest blocked until human override |
| **WARN** | Log + report in summary | Exit 0 unless `scanners.fail_on_warn = true` |
| **ALLOW** | Suppressed | None |

Findings are recorded in the ledger's `scans` table with the matched value
**redacted** (only the first/last two characters are kept).

## DENY rules

These rules quarantine a source. Each combines a regex with an optional
post-match validator (checksum) to cut false positives.

| Rule ID | What it matches | Validator |
| --- | --- | --- |
| `us-ssn` | US Social Security Number, `NNN-NN-NNNN` form | Rejects area `000`, `666`, `9xx`; group `00`; serial `0000` |
| `credit-card` | 13–19 digit runs, optionally with spaces or dashes | Luhn |
| `aba-routing` | 9-digit run | ABA checksum + reject all-same-digit |
| `iban` | Two-letter country code + 2 check digits + 11–30 alphanumerics | — |
| `aws-access-key` | `AKIA…/ASIA…/AGPA…/AIDA…/AROA…/AIPA…/ANPA…/ANVA…` followed by 16 chars | — |
| `aws-secret-key` | `aws_secret_access_key = …` 40-char base64-ish | — |
| `gcp-service-account` | JSON marker `"type": "service_account"` | — |
| `azure-storage-key` | 88-char base64 ending `==` | — |
| `openssh-private-key` | `-----BEGIN (OPENSSH|RSA|DSA|EC|PGP) PRIVATE KEY-----` | — |
| `bip39-mnemonic` | 12 or 24 lowercase words separated by single spaces | Word count 12 or 24 |
| `us-passport` | 9-char alphanumeric near `passport`/`passport #`/`passport number` keyword | — |
| `account-number` | 6–17 digit run near `account #`/`acct no`/`a/c` keyword | — |

These rules are intentionally deterministic. They will miss creative
formatting (e.g. an SSN written as `123 45 6789`) and they will not
catch *contextual* leaks like a paragraph describing someone's medical
diagnosis. v0.2's `pii-llm.ts` adds a contextual classifier on top.

## WARN rules

These rules surface findings without blocking. The verdict comes from a
±120-character context window around the match.

### `email`

- **WARN** if the window contains any of: `personal`, `home`, `private`,
  `spouse`, `wife`, `husband`, `kid`, `child`, `daughter`, `son`, `mother`,
  `father`, `mom`, `dad`, `family`, `emergency contact`.
- **ALLOW** if the email's domain (or any parent domain) is in
  `scanners.business_email_domains`.
- **ALLOW** if the window contains business tokens (`office`, `work`,
  `support`, `sales`, `billing`, `inquiries`, `press`, `info@`, `contact`,
  `hr`, `team`).
- Default if neither set hits: ALLOW (suppressed).

### `phone`

- **WARN** if the window contains any of the personal tokens above.
- **ALLOW** if the window contains business tokens.
- **ALLOW** if the exact phone string appears in
  `scanners.business_phone_allowlist`.
- Default: ALLOW.

The patterns themselves require at least one separator (space, dot, dash,
parens) or a leading `+`, so pure 9- or 10-digit runs (which would more
likely be account numbers) don't match `phone`.

## ALLOW lists

Two configuration knobs explicitly downgrade matches to ALLOW:

```toml
[scanners]
business_email_domains   = ["mycompany.com", "personalbrand.com"]
business_phone_allowlist = ["+1-800-555-0199"]
```

`business_email_domains` matches an email's full domain or any suffix
(`a.b.mycompany.com` matches `mycompany.com`). `business_phone_allowlist`
matches the exact string of the phone match.

## Tuning

A scanner that's silent on real PII or screams about business contacts is
worse than no scanner. Tune by:

1. **Adding business tokens** to `business_email_domains` /
   `business_phone_allowlist` — the cheapest fix.
2. **Adding rules** to `src/scanners/rules/{deny,warn}.ts` and a test fixture
   in `tests/fixtures/pii-samples/` — see CLAUDE.md for the recipe.
3. Filing a v0.2 issue to extend `pii-llm.ts` with the contextual judgment
   the regex tier can't make.

## Defense in depth

The PII scanner is one layer. The full safety stack:

- **Allowlist** — content the tool can never reach is the cheapest defense.
- **Regex PII (DENY/WARN/ALLOW)** — this document.
- **gitleaks** — credential-specific; complements PII rules.
- **Pre-commit hook** — DENY tier runs on staged files before any commit.
- **CI gitleaks workflow** — full-history scan on every push and weekly.
- **No-network LLM** — v0.2 ingest never sends content to a remote API.
