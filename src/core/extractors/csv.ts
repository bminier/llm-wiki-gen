import { readFile } from "node:fs/promises";
import type { Extracted } from "./index.ts";

/**
 * Minimal CSV reader for PII scanning: collapses each row to a single
 * tab-separated line so cell content stays grep-able. Honors RFC 4180-style
 * double-quoted cells with embedded commas/newlines/escaped quotes.
 */
export async function extractCsv(filePath: string): Promise<Extracted> {
  const raw = await readFile(filePath, "utf-8");
  const rows = parseCsv(raw);
  const text = rows.map((r) => r.join("\t")).join("\n");
  return { text, contentType: "text/csv" };
}

export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cur.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      cur.push(cell);
      rows.push(cur);
      cur = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || cur.length > 0) {
    cur.push(cell);
    rows.push(cur);
  }
  return rows;
}
