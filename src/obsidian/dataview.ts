/**
 * Lightweight sanity checker for Dataview code blocks. v0.1 is intentionally
 * shallow — it confirms the fence is well-formed and the query body looks
 * structurally plausible. v0.3 may add semantic validation against the wiki
 * frontmatter schemas.
 */

export interface DataviewIssue {
  file: string;
  line: number;
  message: string;
}

export type DataviewKind = "dataview" | "dataviewjs";

const FENCE_RE = /^```(dataview|dataviewjs)\s*\n([\s\S]*?)\n```/gm;

const TOP_LEVEL_DV = /^\s*(?:TABLE|TABLE WITHOUT ID|LIST|TASK|CALENDAR)\b/i;

export function lintDataview(fileRel: string, body: string): DataviewIssue[] {
  const issues: DataviewIssue[] = [];
  FENCE_RE.lastIndex = 0;
  for (const m of body.matchAll(FENCE_RE)) {
    const kind = m[1] as DataviewKind;
    const inner = m[2] ?? "";
    const fenceLine = lineOf(body, m.index ?? 0);

    if (inner.trim().length === 0) {
      issues.push({ file: fileRel, line: fenceLine, message: `empty ${kind} block` });
      continue;
    }

    if (kind === "dataview") {
      if (!TOP_LEVEL_DV.test(inner)) {
        issues.push({
          file: fileRel,
          line: fenceLine,
          message: "dataview query must start with TABLE, LIST, TASK, or CALENDAR",
        });
      }
    } else {
      // dataviewjs: must reference dv.* somewhere — otherwise it is just JS that
      // will silently do nothing in Obsidian.
      if (!/\bdv\./.test(inner)) {
        issues.push({
          file: fileRel,
          line: fenceLine,
          message: "dataviewjs block does not reference dv.* — likely a no-op",
        });
      }
    }
  }
  return issues;
}

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}
