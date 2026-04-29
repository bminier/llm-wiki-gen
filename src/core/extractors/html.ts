import { readFile } from "node:fs/promises";
import type { Extracted } from "./index.ts";

/**
 * Pragmatic HTML → plaintext for v0.1: strips scripts/styles and tags.
 * Good enough for PII scanning of source HTML; v0.2 may swap in a real parser.
 */
export async function extractHtml(filePath: string): Promise<Extracted> {
  const raw = await readFile(filePath, "utf-8");
  const text = htmlToText(raw);
  return { text, contentType: "text/html" };
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
