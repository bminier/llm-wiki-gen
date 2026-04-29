import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import pc from "picocolors";
import { type DataviewIssue, lintDataview } from "../obsidian/dataview.ts";
import { type FrontmatterIssue, validateFrontmatter } from "../obsidian/frontmatter.ts";
import { type LintLinkIssue, lintLinks } from "../obsidian/wikilinks.ts";

export type LintMode = "all" | "frontmatter" | "wikilinks" | "dataview";

export interface LintOptions {
  vaultPath: string;
  mode?: LintMode;
  json?: boolean;
  /** Restrict to a specific list of files (used by pre-commit hook). */
  files?: readonly string[];
}

export interface LintReport {
  frontmatter: FrontmatterIssue[];
  wikilinks: LintLinkIssue[];
  dataview: DataviewIssue[];
  exitCode: number;
}

export async function runLint(opts: LintOptions): Promise<LintReport> {
  const mode = opts.mode ?? "all";
  const files = opts.files ?? (await collectMarkdown(opts.vaultPath));

  const fm: FrontmatterIssue[] = [];
  const dv: DataviewIssue[] = [];

  if (mode === "all" || mode === "frontmatter" || mode === "dataview") {
    for (const abs of files) {
      const rel = relative(opts.vaultPath, abs).replace(/\\/g, "/");
      const body = await readFile(abs, "utf-8");
      if (mode === "all" || mode === "frontmatter") {
        fm.push(...validateFrontmatter(rel, body).issues);
      }
      if (mode === "all" || mode === "dataview") {
        dv.push(...lintDataview(rel, body));
      }
    }
  }

  let wl: LintLinkIssue[] = [];
  if (mode === "all" || mode === "wikilinks") {
    wl = await lintLinks(opts.vaultPath);
  }

  const errorCount = fm.length + wl.filter((i) => i.type === "broken-link").length + dv.length;
  const report: LintReport = {
    frontmatter: fm,
    wikilinks: wl,
    dataview: dv,
    exitCode: errorCount > 0 ? 1 : 0,
  };

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    printReport(report);
  }
  return report;
}

function printReport(r: LintReport): void {
  if (r.frontmatter.length === 0 && r.wikilinks.length === 0 && r.dataview.length === 0) {
    process.stdout.write(pc.green("lint: no issues\n"));
    return;
  }
  if (r.frontmatter.length > 0) {
    process.stdout.write(pc.red(`Frontmatter issues (${r.frontmatter.length}):\n`));
    for (const i of r.frontmatter) {
      process.stdout.write(`  ${i.file}  ${i.field}: ${i.message}\n`);
    }
  }
  if (r.wikilinks.length > 0) {
    const broken = r.wikilinks.filter((i) => i.type === "broken-link");
    const orphans = r.wikilinks.filter((i) => i.type === "orphan");
    if (broken.length > 0) {
      process.stdout.write(pc.red(`\nBroken wikilinks (${broken.length}):\n`));
      for (const i of broken) {
        process.stdout.write(`  ${i.file}:${i.line}  [[${i.target}]]\n`);
      }
    }
    if (orphans.length > 0) {
      process.stdout.write(pc.yellow(`\nOrphan pages (${orphans.length}):\n`));
      for (const i of orphans) {
        process.stdout.write(`  ${i.file}\n`);
      }
    }
  }
  if (r.dataview.length > 0) {
    process.stdout.write(pc.red(`\nDataview issues (${r.dataview.length}):\n`));
    for (const i of r.dataview) {
      process.stdout.write(`  ${i.file}:${i.line}  ${i.message}\n`);
    }
  }
}

async function collectMarkdown(root: string): Promise<string[]> {
  const out: string[] = [];
  await walk(root, out);
  return out;
}

async function walk(dir: string, out: string[]): Promise<void> {
  let entries: { name: string; isDirectory: () => boolean; isFile: () => boolean }[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name === ".obsidian" || e.name === ".git") continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) await walk(full, out);
    else if (e.isFile() && e.name.endsWith(".md")) out.push(full);
  }
}
