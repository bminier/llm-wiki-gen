import { readFile } from "node:fs/promises";
import type { Extracted } from "./index.ts";

export async function extractText(filePath: string, contentType: string): Promise<Extracted> {
  const text = await readFile(filePath, "utf-8");
  return { text, contentType };
}
