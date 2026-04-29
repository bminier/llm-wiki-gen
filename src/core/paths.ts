import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";

/** Expand a leading `~` or `~/` to the user's home directory. */
export function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return resolve(homedir(), p.slice(2));
  }
  return p;
}

/** Expand `~` then resolve to an absolute path against `cwd`. */
export function expandAndResolve(p: string, cwd: string = process.cwd()): string {
  const expanded = expandHome(p);
  return isAbsolute(expanded) ? resolve(expanded) : resolve(cwd, expanded);
}
