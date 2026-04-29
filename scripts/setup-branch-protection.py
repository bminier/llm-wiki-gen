#!/usr/bin/env python3
"""Apply branch-protection rules to the llm-wiki-gen repo via the GitHub API.

Usage:
    python scripts/setup-branch-protection.py <owner/repo>

Requires `gh` CLI to be authenticated. Idempotent.
"""
from __future__ import annotations

import json
import subprocess
import sys


def gh_api(method: str, path: str, body: dict | None = None) -> tuple[int, str]:
    args = ["gh", "api", "-X", method, path]
    if body is not None:
        args.extend(["--input", "-"])
    res = subprocess.run(
        args,
        input=json.dumps(body) if body is not None else None,
        text=True,
        capture_output=True,
    )
    return res.returncode, (res.stdout + res.stderr)


def protect_branch(repo: str, branch: str, *, allow_force_push: bool) -> None:
    body = {
        "required_status_checks": {
            "strict": True,
            "contexts": [
                "test (ubuntu-latest)",
                "test (macos-latest)",
                "test (windows-latest)",
                "pre-commit hooks",
            ],
        },
        "enforce_admins": False,
        "required_pull_request_reviews": {
            "required_approving_review_count": 1,
            "dismiss_stale_reviews": True,
        },
        "restrictions": None,
        "allow_force_pushes": allow_force_push,
        "allow_deletions": False,
        "required_conversation_resolution": True,
    }
    rc, out = gh_api("PUT", f"/repos/{repo}/branches/{branch}/protection", body)
    print(f"[{branch}] rc={rc}: {out.strip()[:200]}")


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: setup-branch-protection.py <owner/repo>", file=sys.stderr)
        return 2
    repo = sys.argv[1]

    # Solo-friendly: dev requires CI green but not 1+ external reviewers.
    # Adjust manually after the project gains contributors.
    protect_branch(repo, "dev", allow_force_push=False)
    print(
        "\nNote: release/* branches are not enforced here — protect them when "
        "you cut your first release.",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
