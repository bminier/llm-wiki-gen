import { spawn } from "node:child_process";

export interface GitleaksFinding {
  ruleId: string;
  description: string;
  match: string;
  file: string;
  line: number;
  secret: string;
}

export interface RunGitleaksOptions {
  /** Repository or directory to scan. Defaults to cwd. */
  cwd?: string;
  /** Path to .gitleaks.toml. Defaults to <cwd>/.gitleaks.toml if present. */
  configPath?: string;
  /** Mode: full history (`detect`) or staged-only protect (`protect`). */
  mode?: "detect" | "protect";
}

/**
 * Shells out to the `gitleaks` binary and parses its JSON report.
 * The binary must be on $PATH; pre-commit handles installation per repo.
 */
export async function runGitleaks(opts: RunGitleaksOptions = {}): Promise<GitleaksFinding[]> {
  const mode = opts.mode ?? "detect";
  const cwd = opts.cwd ?? process.cwd();
  const args: string[] = [mode, "--report-format", "json", "--report-path", "-", "--no-banner"];
  if (opts.configPath) args.push("--config", opts.configPath);
  if (mode === "detect") args.push("--source", cwd);

  const stdout = await runCmd("gitleaks", args, cwd);
  return parseGitleaksJson(stdout);
}

export function parseGitleaksJson(json: string): GitleaksFinding[] {
  const trimmed = json.trim();
  if (!trimmed) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: GitleaksFinding[] = [];
  for (const r of parsed) {
    if (!r || typeof r !== "object") continue;
    const rec = r as Record<string, unknown>;
    out.push({
      ruleId: String(rec.RuleID ?? ""),
      description: String(rec.Description ?? ""),
      match: String(rec.Match ?? ""),
      file: String(rec.File ?? ""),
      line: Number(rec.StartLine ?? 0),
      secret: String(rec.Secret ?? ""),
    });
  }
  return out;
}

function runCmd(cmd: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"], shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      // gitleaks exits 1 when leaks are found — treat as success.
      if (code === 0 || code === 1) resolve(stdout);
      else reject(new Error(`gitleaks exited ${code}: ${stderr.trim() || stdout.trim()}`));
    });
  });
}
