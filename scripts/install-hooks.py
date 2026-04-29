#!/usr/bin/env python3
"""Install pre-commit hooks for llm-wiki-gen.

This script:
  1. Verifies bun, gitleaks, and pre-commit are on PATH (installs pre-commit if pip is available).
  2. Runs `pre-commit install` to wire .git/hooks/pre-commit.
  3. Runs `pre-commit run --all-files` once for a sanity pass.

Cross-platform (Windows / macOS / Linux). Per project preference, all setup
scripts are Python; the runtime tool itself is Bun.
"""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent


def have(cmd: str) -> bool:
    return shutil.which(cmd) is not None


def run(cmd: list[str], **kwargs) -> int:
    print(f"$ {' '.join(cmd)}")
    return subprocess.call(cmd, cwd=REPO_ROOT, **kwargs)


def ensure_pre_commit() -> None:
    if have("pre-commit"):
        return
    print("pre-commit not found; attempting to install via pip...")
    if not have("pip") and not have("pip3"):
        sys.exit(
            "pre-commit is required but not installed, and pip was not found. "
            "Install pre-commit manually: https://pre-commit.com/#installation"
        )
    pip = "pip3" if have("pip3") else "pip"
    if run([pip, "install", "--user", "pre-commit"]) != 0:
        sys.exit("pip install pre-commit failed")
    if not have("pre-commit"):
        sys.exit(
            "pre-commit was installed but is not on PATH. "
            "Add the user-base bin/ directory to PATH and re-run."
        )


def main() -> int:
    if not have("bun"):
        sys.exit("bun is required: https://bun.sh")
    if not have("gitleaks"):
        print(
            "WARNING: gitleaks is not on PATH. The pre-commit framework will "
            "fetch its own copy, but having gitleaks installed locally is "
            "recommended for ad-hoc scans. https://github.com/gitleaks/gitleaks",
            file=sys.stderr,
        )

    ensure_pre_commit()

    if run(["pre-commit", "install"]) != 0:
        return 1
    if run(["pre-commit", "install", "--hook-type", "commit-msg"]) != 0:
        return 1

    print("\nRunning pre-commit on all files for a sanity pass...")
    rc = run(["pre-commit", "run", "--all-files"])
    if rc != 0:
        print(
            "\nSome hooks reported issues. Fix them and re-run "
            "`pre-commit run --all-files`.",
            file=sys.stderr,
        )
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
