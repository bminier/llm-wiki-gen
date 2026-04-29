import { realpathSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";

export class AllowlistViolation extends Error {
  constructor(
    public readonly path: string,
    public readonly resolvedPath: string,
    public readonly roots: readonly string[],
  ) {
    super(
      `path is outside the source allowlist: ${path} (resolved to ${resolvedPath}; allowed roots: ${roots.join(", ") || "<none>"})`,
    );
    this.name = "AllowlistViolation";
  }
}

/**
 * Encapsulates the read-only source allowlist. Resolves symlinks before each
 * containment check so a symlink inside an allowed root cannot escape.
 */
export class Allowlist {
  private readonly resolvedRoots: string[];

  constructor(roots: readonly string[]) {
    this.resolvedRoots = roots.map((r) => safeRealpath(resolve(r)));
  }

  /** Real, resolved roots (after symlink resolution). */
  get roots(): readonly string[] {
    return this.resolvedRoots;
  }

  /** True if `path` (after symlink resolution) is inside any allowlist root. */
  contains(path: string): boolean {
    const real = safeRealpath(resolve(path));
    return this.resolvedRoots.some((root) => isInside(real, root));
  }

  /** Throws AllowlistViolation if `path` is outside the allowlist. */
  assertContains(path: string): void {
    const real = safeRealpath(resolve(path));
    if (!this.resolvedRoots.some((root) => isInside(real, root))) {
      throw new AllowlistViolation(path, real, this.resolvedRoots);
    }
  }
}

function isInside(child: string, parent: string): boolean {
  if (child === parent) return true;
  const p = parent.endsWith(sep) ? parent : parent + sep;
  return child.startsWith(p);
}

/**
 * realpath that gracefully handles non-existent paths by walking up to the
 * deepest existing ancestor and re-appending the missing tail. Needed because
 * we may want to validate a target path before creating it.
 */
function safeRealpath(p: string): string {
  try {
    statSync(p);
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}
