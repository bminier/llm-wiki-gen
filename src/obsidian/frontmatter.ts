import matter from "gray-matter";
import { type ZodTypeAny, z } from "zod";

/**
 * Per-folder frontmatter schemas. Top-level keys match the first folder under
 * the wiki root. Pages outside listed folders fall back to the `_default`
 * schema, which is permissive.
 */
const SOURCE_NOTE_SCHEMA = z
  .object({
    source_id: z.union([z.string(), z.number()]),
    hash: z.string().regex(/^[0-9a-f]{16,}$/i, "hash must be hex"),
    ingested: z.union([z.string(), z.date()]),
    type: z.enum(["pdf", "docx", "md", "txt", "html", "csv", "other"]).optional(),
    tags: z.array(z.string()).optional(),
  })
  .passthrough();

const TOPIC_SCHEMA = z
  .object({
    title: z.string().min(1),
    aliases: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    updated: z.union([z.string(), z.date()]).optional(),
  })
  .passthrough();

const QUESTION_SCHEMA = z
  .object({
    question: z.string().min(1),
    asked: z.union([z.string(), z.date()]).optional(),
    status: z.enum(["open", "answered", "abandoned"]).optional(),
  })
  .passthrough();

const DEFAULT_SCHEMA = z.object({}).passthrough();

const SCHEMAS: Record<string, ZodTypeAny> = {
  "source-notes": SOURCE_NOTE_SCHEMA,
  topics: TOPIC_SCHEMA,
  questions: QUESTION_SCHEMA,
  _default: DEFAULT_SCHEMA,
};

export interface FrontmatterIssue {
  file: string;
  field: string;
  message: string;
}

export interface FrontmatterResult {
  file: string;
  data: Record<string, unknown>;
  issues: FrontmatterIssue[];
}

export function schemaForFolder(folder: string): ZodTypeAny {
  return SCHEMAS[folder] ?? DEFAULT_SCHEMA;
}

export function validateFrontmatter(fileRel: string, raw: string): FrontmatterResult {
  const folder = fileRel.split(/[\\/]/)[0] ?? "_default";
  const issues: FrontmatterIssue[] = [];
  let data: Record<string, unknown> = {};

  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(raw);
    data = (parsed.data ?? {}) as Record<string, unknown>;
  } catch (err) {
    issues.push({ file: fileRel, field: "<frontmatter>", message: (err as Error).message });
    return { file: fileRel, data: {}, issues };
  }

  // Pages without any frontmatter block are treated as navigation/indexes and
  // exempt from the per-folder schema. The folder schema applies only when the
  // author has opted in by writing a frontmatter block.
  const hasFrontmatter = Object.keys(data).length > 0 || /^---\s*\n/.test(raw);
  const schema = hasFrontmatter ? schemaForFolder(folder) : DEFAULT_SCHEMA;
  const result = schema.safeParse(data);
  if (!result.success) {
    for (const e of result.error.issues) {
      issues.push({
        file: fileRel,
        field: e.path.join(".") || "<root>",
        message: e.message,
      });
    }
  }

  return { file: fileRel, data, issues };
}
