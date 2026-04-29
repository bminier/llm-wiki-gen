import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { Allowlist } from "./allowlist.ts";
import { contentTypeFor, isSupported } from "./extractors/index.ts";

export interface WalkedFile {
  path: string; // absolute
  hash: string; // sha-256 hex
  size: number;
  modified: number; // ms
  contentType: string;
}

export interface WalkOptions {
  /** Glob-like exclude patterns. v0.1 supports a small subset (see globMatches). */
  excludeGlobs?: readonly string[];
  /** When true, also include files for which we have no extractor (used for e.g. raw scanning). */
  includeUnsupported?: boolean;
}

/**
 * Walk every allowlist root, emitting WalkedFile records (path + content-hash).
 * Streams hashes so we never load whole files into memory.
 */
export async function walk(allowlist: Allowlist, opts: WalkOptions = {}): Promise<WalkedFile[]> {
  const out: WalkedFile[] = [];
  for (const root of allowlist.roots) {
    await walkDir(root, root, allowlist, opts, out);
  }
  return out;
}

async function walkDir(
  root: string,
  dir: string,
  allowlist: Allowlist,
  opts: WalkOptions,
  out: WalkedFile[],
): Promise<void> {
  let entries: { name: string; isDirectory: () => boolean; isFile: () => boolean }[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    const rel = relative(root, full);
    if (matchesAny(rel, opts.excludeGlobs)) continue;
    if (entry.isDirectory()) {
      // Reject if symlink-resolved path escapes the allowlist.
      if (!allowlist.contains(full)) continue;
      await walkDir(root, full, allowlist, opts, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!opts.includeUnsupported && !isSupported(full)) continue;
    if (!allowlist.contains(full)) continue;
    const st = await stat(full);
    const hash = await hashFile(full);
    out.push({
      path: full,
      hash,
      size: st.size,
      modified: Math.floor(st.mtimeMs),
      contentType: contentTypeFor(full),
    });
  }
}

async function hashFile(path: string): Promise<string> {
  const h = createHash("sha256");
  await new Promise<void>((res, rej) => {
    createReadStream(path)
      .on("data", (chunk) => h.update(chunk))
      .on("end", () => res())
      .on("error", rej);
  });
  return h.digest("hex");
}

function matchesAny(rel: string, patterns: readonly string[] | undefined): boolean {
  if (!patterns || patterns.length === 0) return false;
  const norm = rel.split(sep).join("/");
  return patterns.some((p) => globMatches(p, norm));
}

/**
 * Minimal glob matcher: supports `*`, `**`, and exact segments. Good enough
 * for the v0.1 default exclude set; swap for `picomatch` later if needed.
 */
export function globMatches(pattern: string, path: string): boolean {
  const re = globToRegex(pattern);
  return re.test(path);
}

function globToRegex(pattern: string): RegExp {
  let re = "^";
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        re += ".*";
        i += 2;
        if (pattern[i] === "/") i++;
      } else {
        re += "[^/]*";
        i++;
      }
    } else if (c === "?") {
      re += "[^/]";
      i++;
    } else if (c !== undefined && /[.+^${}()|\\]/.test(c)) {
      re += `\\${c}`;
      i++;
    } else {
      re += c;
      i++;
    }
  }
  re += "$";
  return new RegExp(re);
}
