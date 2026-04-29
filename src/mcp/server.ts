import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { runIngest } from "../commands/ingest.ts";
import { runLint } from "../commands/lint.ts";
import { runSync } from "../commands/sync.ts";
import type { ResolvedConfig } from "../core/config.ts";
import { Ledger } from "../core/ledger.ts";
import { VERSION } from "../version.ts";

export interface McpServerOptions {
  config: ResolvedConfig;
  /** Optional override for transport (used by tests). */
  transport?: { connect: (server: Server) => Promise<void> };
}

const TOOL_DEFS = [
  {
    name: "sync",
    description:
      "Walk the source allowlist, update the ledger, run PII regex + secret scanners. Returns counts and any quarantines.",
    inputSchema: {
      type: "object",
      properties: {
        explain_dups: {
          type: "boolean",
          description: "Include canonical/duplicate path pairs in the response",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "ingest",
    description: "Plan a future LLM ingest run (v0.1: stub; returns the plan).",
    inputSchema: {
      type: "object",
      properties: {
        dry_run: {
          type: "boolean",
          description: "If false, the call still returns the plan only in v0.1.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "lint",
    description: "Validate frontmatter, wikilinks, and dataview blocks in the configured vault.",
    inputSchema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["all", "frontmatter", "wikilinks", "dataview"],
          description: "Scope of the lint pass",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "status",
    description: "Read ledger summary: counts by status, recent runs.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
] as const;

type ToolName = (typeof TOOL_DEFS)[number]["name"];

export function buildMcpServer(opts: McpServerOptions): Server {
  const server = new Server(
    { name: "llm-wiki-gen", version: VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFS.map((t) => ({ ...t })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name as ToolName;
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;
    return { content: [{ type: "text", text: await invokeTool(name, args, opts.config) }] };
  });

  return server;
}

async function invokeTool(
  name: string,
  args: Record<string, unknown>,
  config: ResolvedConfig,
): Promise<string> {
  switch (name) {
    case "sync": {
      const r = await runSync({
        config,
        json: true,
        explainDups: !!args.explain_dups,
      });
      // runSync already wrote JSON to stdout; here we want the structured value.
      return JSON.stringify(r);
    }
    case "ingest": {
      const ledger = Ledger.open();
      try {
        const live = ledger.liveSources();
        const plan = live
          .filter((s) => s.status === "new" || s.status === "changed")
          .map((s) => ({ source_id: s.source_id, path: s.path, status: s.status }));
        return JSON.stringify({
          message:
            plan.length === 0
              ? "no sources pending ingest"
              : `would ingest ${plan.length} source(s); v0.1 stub`,
          items: plan,
        });
      } finally {
        ledger.close();
      }
      // touch runIngest reference to keep import tree-shakable but visible to type-checker
      void runIngest;
    }
    case "lint": {
      const mode = (typeof args.mode === "string" ? args.mode : "all") as
        | "all"
        | "frontmatter"
        | "wikilinks"
        | "dataview";
      const r = await runLint({ vaultPath: config.wiki.path, mode, json: true });
      return JSON.stringify(r);
    }
    case "status": {
      const ledger = Ledger.open();
      try {
        const sources = ledger.allSources();
        const counts: Record<string, number> = {};
        for (const s of sources) counts[s.status] = (counts[s.status] ?? 0) + 1;
        return JSON.stringify({ total: sources.length, counts });
      } finally {
        ledger.close();
      }
    }
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

export async function startMcpServer(opts: McpServerOptions): Promise<void> {
  const server = buildMcpServer(opts);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
