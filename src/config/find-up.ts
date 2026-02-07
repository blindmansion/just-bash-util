// ============================================================================
// findUp — walk up the directory tree looking for a file
// ============================================================================

import type { CommandContext } from "just-bash";
import { dirname, join } from "../path/index.ts";

export interface FindUpOptions {
  /** Directory to start searching from (default: `ctx.cwd`) */
  from?: string;
  /** Directory to stop searching at, inclusive (default: `"/"`) */
  stopAt?: string;
}

/**
 * Walk up from `ctx.cwd` (or `options.from`) toward the filesystem root,
 * checking each directory for a file matching one of the given `names`.
 *
 * Returns the absolute path of the first match, or `null` if nothing
 * is found before reaching `stopAt` (or root).
 *
 * @param ctx   The command context (provides `fs` and `cwd`)
 * @param name  Filename (or array of filenames, tried in order) to look for
 */
export async function findUp(
  ctx: CommandContext,
  name: string | readonly string[],
  options?: FindUpOptions,
): Promise<string | null> {
  const names = Array.isArray(name) ? name : [name];
  const from = options?.from ?? ctx.cwd;
  const stopAt = options?.stopAt ?? "/";

  let dir = from;

  while (true) {
    for (const n of names) {
      const filepath = join(dir, n);
      if (await ctx.fs.exists(filepath)) {
        return filepath;
      }
    }

    if (dir === stopAt) break;
    const parent = dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }

  return null;
}
