import { readFile, readdir, stat } from "node:fs/promises";
import { basename, join, relative } from "node:path";

export interface ParsedLink {
  /** Raw target as written, e.g. "Topic Name" or "folder/Page#heading|alias". */
  raw: string;
  /** Normalized target after stripping heading and alias. */
  target: string;
  /** Source file (relative to vault root). */
  inFile: string;
  /** 1-based line number. */
  line: number;
}

const WIKILINK = /\[\[([^\[\]\n]+?)\]\]/g;

export function parseWikilinks(fileRel: string, body: string): ParsedLink[] {
  const out: ParsedLink[] = [];
  WIKILINK.lastIndex = 0;
  for (const m of body.matchAll(WIKILINK)) {
    const raw = m[1] ?? "";
    const target = raw.split("#")[0]?.split("|")[0]?.trim() ?? "";
    if (target.length === 0) continue;
    out.push({
      raw,
      target,
      inFile: fileRel,
      line: lineOf(body, m.index ?? 0),
    });
  }
  return out;
}

export interface LintLinkIssue {
  type: "broken-link" | "orphan";
  file: string;
  line?: number;
  target?: string;
}

export interface VaultIndex {
  /** Absolute paths of every .md file in the vault. */
  files: string[];
  /** Map basename (without extension) → relative paths that match. */
  byBasename: Map<string, string[]>;
  /** Map relative path → relative path (identity, normalized to forward slashes). */
  byRelPath: Map<string, string>;
}

export async function indexVault(vaultRoot: string): Promise<VaultIndex> {
  const files: string[] = [];
  await walkVault(vaultRoot, files);
  const byBasename = new Map<string, string[]>();
  const byRelPath = new Map<string, string>();
  for (const abs of files) {
    const rel = relative(vaultRoot, abs).replace(/\\/g, "/");
    byRelPath.set(rel, rel);
    const name = basename(rel, ".md");
    const list = byBasename.get(name) ?? [];
    list.push(rel);
    byBasename.set(name, list);
  }
  return { files, byBasename, byRelPath };
}

export interface LintLinksOptions {
  /** Targets here will not be reported as broken (e.g. external/aspirational pages). */
  unresolvedAllowed?: ReadonlySet<string>;
  /** Files to skip when computing orphans (e.g. "index.md", "log.md"). */
  orphanRoots?: ReadonlySet<string>;
}

export async function lintLinks(
  vaultRoot: string,
  opts: LintLinksOptions = {},
): Promise<LintLinkIssue[]> {
  const idx = await indexVault(vaultRoot);
  const issues: LintLinkIssue[] = [];
  const inboundCount = new Map<string, number>();
  for (const rel of idx.byRelPath.keys()) inboundCount.set(rel, 0);

  for (const abs of idx.files) {
    const rel = relative(vaultRoot, abs).replace(/\\/g, "/");
    const body = await readFile(abs, "utf-8");
    for (const link of parseWikilinks(rel, body)) {
      const resolved = resolveLink(link.target, idx);
      if (!resolved) {
        if (!opts.unresolvedAllowed?.has(link.target)) {
          issues.push({ type: "broken-link", file: rel, line: link.line, target: link.target });
        }
        continue;
      }
      inboundCount.set(resolved, (inboundCount.get(resolved) ?? 0) + 1);
    }
  }

  const roots = opts.orphanRoots ?? new Set(["index.md", "log.md", "README.md"]);
  for (const [rel, count] of inboundCount) {
    if (count === 0 && !roots.has(rel)) {
      issues.push({ type: "orphan", file: rel });
    }
  }

  return issues;
}

function resolveLink(target: string, idx: VaultIndex): string | null {
  const norm = target.replace(/\\/g, "/").trim();
  if (idx.byRelPath.has(norm)) return norm;
  if (idx.byRelPath.has(`${norm}.md`)) return `${norm}.md`;
  const matches = idx.byBasename.get(norm);
  const first = matches?.[0];
  if (first !== undefined) return first;
  return null;
}

async function walkVault(dir: string, out: string[]): Promise<void> {
  let entries: { name: string; isDirectory: () => boolean; isFile: () => boolean }[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === ".obsidian" || e.name === ".git") continue;
      await walkVault(full, out);
    } else if (e.isFile() && e.name.endsWith(".md")) {
      out.push(full);
    }
  }
}

async function _exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}
void _exists;

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}
