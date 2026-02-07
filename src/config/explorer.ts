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
   * - `"package.json"` (extracts the `name` property)
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
   * Default: the `name` option.
   */
  packageJsonProp?: string | false;
  /** Directory to stop searching at (default: `"/"`) */
  stopAt?: string;
  /** Use JSONC parser (comments + trailing commas) for `.json` files (default: `false`) */
  jsonc?: boolean;
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
  /** Use JSONC parser (comments + trailing commas) for `.json` files (default: `false`) */
  jsonc?: boolean;
}

// ============================================================================
// Built-in loaders
// ============================================================================

const jsonLoader: Loader = (content) => JSON.parse(content);
const jsoncLoader: Loader = (content) => parseJsonc(content);

// ============================================================================
// Helpers
// ============================================================================

function defaultSearchPlaces(name: string): string[] {
  return [
    "package.json",
    `.${name}rc`,
    `.${name}rc.json`,
    `${name}.config.json`,
  ];
}

function buildLoaders(jsonc: boolean): Record<string, Loader> {
  const parser = jsonc ? jsoncLoader : jsonLoader;
  return {
    ".json": parser,
    "noExt": parser,
  };
}

function resolveLoader(
  filepath: string,
  customLoaders: Record<string, Loader> | undefined,
  builtinLoaders: Record<string, Loader>,
): Loader {
  const ext = extname(filepath);
  const key = ext || "noExt";

  if (customLoaders?.[key]) return customLoaders[key]!;
  if (builtinLoaders[key]) return builtinLoaders[key]!;

  return builtinLoaders[".json"] ?? jsonLoader;
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
  builtinLoaders: Record<string, Loader>,
  customLoaders: Record<string, Loader> | undefined,
  packageJsonProp: string | false,
): Promise<ConfigResult<T> | null> {
  const content = await fs.readFile(filepath);
  const loader = resolveLoader(filepath, customLoaders, builtinLoaders);
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

// ============================================================================
// Public API
// ============================================================================

/**
 * Search for a config file by walking up the directory tree from `ctx.cwd`
 * (or `options.from`), trying each search place at every level.
 *
 * ```ts
 * const result = await searchConfig(ctx, { name: "myapp" });
 * if (result) console.log(result.config, result.filepath);
 * ```
 */
export async function searchConfig<T = unknown>(
  ctx: CommandContext,
  options: SearchConfigOptions,
): Promise<ConfigResult<T> | null> {
  const {
    name,
    from = ctx.cwd,
    searchPlaces = defaultSearchPlaces(name),
    loaders: customLoaders,
    packageJsonProp = name,
    stopAt = "/",
    jsonc = false,
  } = options;

  const builtins = buildLoaders(jsonc);
  let dir = from;

  while (true) {
    for (const place of searchPlaces) {
      const filepath = join(dir, place);

      if (!(await ctx.fs.exists(filepath))) continue;

      try {
        const result = await loadFileInternal<T>(ctx.fs, filepath, builtins, customLoaders, packageJsonProp);
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
    jsonc = false,
  } = options ?? {};

  const builtins = buildLoaders(jsonc);
  return loadFileInternal<T>(ctx.fs, filepath, builtins, customLoaders, packageJsonProp);
}
