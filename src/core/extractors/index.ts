import { extname } from "node:path";
import { extractCsv } from "./csv.ts";
import { extractHtml } from "./html.ts";
import { extractText } from "./text.ts";

export interface Extracted {
  text: string;
  contentType: string;
}

export type ExtractorFn = (filePath: string) => Promise<Extracted> | Extracted;

const REGISTRY: Record<string, ExtractorFn> = {
  ".md": (p) => extractText(p, "text/markdown"),
  ".markdown": (p) => extractText(p, "text/markdown"),
  ".txt": (p) => extractText(p, "text/plain"),
  ".log": (p) => extractText(p, "text/plain"),
  ".html": (p) => extractHtml(p),
  ".htm": (p) => extractHtml(p),
  ".csv": (p) => extractCsv(p),
};

export function isSupported(filePath: string): boolean {
  return extname(filePath).toLowerCase() in REGISTRY;
}

export function contentTypeFor(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case ".md":
    case ".markdown":
      return "text/markdown";
    case ".html":
    case ".htm":
      return "text/html";
    case ".csv":
      return "text/csv";
    case ".txt":
    case ".log":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}

export async function extract(filePath: string): Promise<Extracted> {
  const ext = extname(filePath).toLowerCase();
  const fn = REGISTRY[ext];
  if (!fn) throw new Error(`no extractor for ${ext}`);
  return await fn(filePath);
}
