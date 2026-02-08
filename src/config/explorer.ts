// ============================================================================
// Config search — cosmiconfig-style config file discovery
// ============================================================================

import type { CommandContext, IFileSystem } from "just-bash";
import { basename, dirname, extname, join } from "../path/index.ts";
import { parseJsonc } from "./jsonc.ts";

// ============================================================================
// Types
// ============================================================================

/** Transforms raw file content into a parsed config value. */
export type Loader = (content: string, filepath: string) => unknown;

/** The result of finding and loading a config file. */
export interface ConfigResult<T = unknown> {
  /** The parsed config value */
  config: T;
  /** Absolute path to the config file that was loaded */
  filepath: string;
  /** True when the config is null, undefined, or an empty object */
  isEmpty: boolean;
}

export interface SearchConfigOptions {
  /** Module/tool name — used to derive default search places and package.json property */
  name: string;
  /**
   * Directory to start searching from (default: `ctx.cwd`).
   */
  from?: string;
  /**
   * Filenames to look for at each directory level, tried in order.
   *
   * Defaults:
   * - `".{name}rc"`
   * - `".{name}rc.json"`
   * - `"{name}.config.json"`
   */
  searchPlaces?: string[];
  /**
   * Custom loaders keyed by file extension (e.g. `".yaml"`) or
   * `"noExt"` for extensionless files. Merged over built-in defaults.
   */
  loaders?: Record<string, Loader>;
  /**
   * Property to extract from `package.json`.
   * Set to `false` to disable property extraction (load full object).
   * Default: `false`.
   */
  packageJsonProp?: string | false;
  /** Directory to stop searching at (default: `"/"`) */
  stopAt?: string;
  /**
   * When `true`, collect configs from **every** directory level and
   * deep-merge them into a single result. Closer configs (nearer to
   * `from`) take precedence over more ancestral ones.
   *
   * Plain objects are merged recursively; everything else (primitives,
   * arrays) is replaced outright — the closer value wins.
   *
   * Default: `false` (return the first match).
   */
  merge?: boolean;
  /**
   * Stop collecting configs when this predicate returns true.
   * The matching config **is** included in the result.
   * Only meaningful when `merge` is `true`; ignored otherwise.
   *
   * Useful for ESLint-style `root: true` cascading stops:
   * ```ts
   * stopWhen: (cfg) => cfg.root === true
   * ```
   */
  stopWhen?: (config: unknown) => boolean;
}

export interface LoadConfigOptions {
  /**
   * Custom loaders keyed by file extension (e.g. `".yaml"`) or
   * `"noExt"` for extensionless files. Merged over built-in defaults.
   */
  loaders?: Record<string, Loader>;
  /**
   * Property to extract from `package.json`.
   * Omit or set to `false` to return the full object.
   */
  packageJsonProp?: string | false;
}

// ============================================================================
// Deep merge (internal)
// ============================================================================

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * Recursively merge two values. Plain objects are merged key-by-key;
 * everything else (primitives, arrays, class instances) is replaced
 * outright — `override` wins.
 */
function deepMerge<T>(base: T, override: T): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override;
  }

  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(override)) {
    result[key] =
      key in result
        ? deepMerge(result[key], override[key])
        : override[key];
  }
  return result as T;
}

// ============================================================================
// Built-in loaders
// ============================================================================

/** Default loader — JSONC (supports comments and trailing commas, strict JSON passes through fine) */
const defaultLoader: Loader = (content) => parseJsonc(content);

// ============================================================================
// Helpers
// ============================================================================

function defaultSearchPlaces(name: string): string[] {
  return [
    `.${name}rc`,
    `.${name}rc.json`,
    `${name}.config.json`,
  ];
}

const builtinLoaders: Record<string, Loader> = {
  ".json": defaultLoader,
  "noExt": defaultLoader,
};

function resolveLoader(
  filepath: string,
  customLoaders: Record<string, Loader> | undefined,
): Loader {
  const ext = extname(filepath);
  const key = ext || "noExt";

  if (customLoaders?.[key]) return customLoaders[key]!;
  if (builtinLoaders[key]) return builtinLoaders[key]!;

  return defaultLoader;
}

function checkEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "object" && Object.keys(value as object).length === 0) return true;
  return false;
}

/** Shared logic: read, parse, and optionally extract package.json property. */
async function loadFileInternal<T>(
  fs: IFileSystem,
  filepath: string,
  customLoaders: Record<string, Loader> | undefined,
  packageJsonProp: string | false,
): Promise<ConfigResult<T> | null> {
  const content = await fs.readFile(filepath);
  const loader = resolveLoader(filepath, customLoaders);
  let config: unknown = loader(content, filepath);

  if (basename(filepath) === "package.json" && packageJsonProp !== false) {
    if (config != null && typeof config === "object" && packageJsonProp in (config as Record<string, unknown>)) {
      config = (config as Record<string, unknown>)[packageJsonProp];
    } else {
      return null;
    }
  }

  return {
    config: config as T,
    filepath,
    isEmpty: checkEmpty(config),
  };
}

/** Collect all matching configs (closest-first), used when `merge` is true. */
async function collectAll<T>(
  ctx: CommandContext,
  options: SearchConfigOptions,
): Promise<ConfigResult<T>[]> {
  const {
    name,
    from = ctx.cwd,
    searchPlaces = defaultSearchPlaces(name),
    loaders: customLoaders,
    packageJsonProp = false,
    stopAt = "/",
    stopWhen,
  } = options;

  const results: ConfigResult<T>[] = [];
  let dir = from;

  while (true) {
    for (const place of searchPlaces) {
      const filepath = join(dir, place);

      if (!(await ctx.fs.exists(filepath))) continue;

      try {
        const result = await loadFileInternal<T>(ctx.fs, filepath, customLoaders, packageJsonProp);
        if (result !== null) {
          results.push(result);

          if (stopWhen?.(result.config)) return results;

          // Only take the first match per directory level
          break;
        }
      } catch {
        continue;
      }
    }

    if (dir === stopAt) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return results;
}

/** Merge an array of results (closest-first) into a single result. */
function mergeResults<T>(results: ConfigResult<T>[]): ConfigResult<T> | null {
  if (results.length === 0) return null;
  if (results.length === 1) return results[0]!;

  // Fold right-to-left: start from the most ancestral config and
  // progressively overlay closer configs on top.
  const merged = results.reduceRight(
    (acc, r) => deepMerge(acc, r.config),
    {} as T,
  );

  return {
    config: merged,
    filepath: results[0]!.filepath,
    isEmpty: checkEmpty(merged),
  };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Search for a config file by walking up the directory tree from `ctx.cwd`
 * (or `options.from`), trying each search place at every level.
 *
 * By default, returns the **first** match. When `merge` is `true`, collects
 * configs from every level and deep-merges them (closest wins).
 *
 * ```ts
 * const result = await searchConfig(ctx, { name: "myapp" });
 * if (result) console.log(result.config, result.filepath);
 *
 * // Find nearest package.json and return its full contents
 * const pkg = await searchConfig(ctx, { name: "package", searchPlaces: ["package.json"] });
 *
 * // Extract a specific property from package.json
 * const result = await searchConfig(ctx, {
 *   name: "myapp",
 *   searchPlaces: ["package.json", ".myapprc", ".myapprc.json"],
 *   packageJsonProp: "myapp",
 * });
 *
 * // Layered / cascading config
 * const merged = await searchConfig(ctx, { name: "myapp", merge: true });
 * ```
 */
export async function searchConfig<T = unknown>(
  ctx: CommandContext,
  options: SearchConfigOptions,
): Promise<ConfigResult<T> | null> {
  if (options.merge) {
    const results = await collectAll<T>(ctx, options);
    return mergeResults(results);
  }

  const {
    name,
    from = ctx.cwd,
    searchPlaces = defaultSearchPlaces(name),
    loaders: customLoaders,
    packageJsonProp = false,
    stopAt = "/",
  } = options;

  let dir = from;

  while (true) {
    for (const place of searchPlaces) {
      const filepath = join(dir, place);

      if (!(await ctx.fs.exists(filepath))) continue;

      try {
        const result = await loadFileInternal<T>(ctx.fs, filepath, customLoaders, packageJsonProp);
        if (result !== null) return result;
        // null → package.json without the property, skip
      } catch {
        // Parse error or read error — skip this candidate
        continue;
      }
    }

    if (dir === stopAt) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}

/**
 * Load and parse a specific config file.
 *
 * Throws if the file does not exist or cannot be parsed.
 * Returns `null` only when the file is `package.json` and the
 * configured `packageJsonProp` is not present.
 *
 * ```ts
 * const result = await loadConfig(ctx, "/project/.myapprc.json");
 * ```
 */
export async function loadConfig<T = unknown>(
  ctx: CommandContext,
  filepath: string,
  options?: LoadConfigOptions,
): Promise<ConfigResult<T> | null> {
  const {
    loaders: customLoaders,
    packageJsonProp = false,
  } = options ?? {};

  return loadFileInternal<T>(ctx.fs, filepath, customLoaders, packageJsonProp);
}
