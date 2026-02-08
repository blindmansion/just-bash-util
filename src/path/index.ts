// ============================================================================
// Constants
// ============================================================================

/** Path segment separator (POSIX) */
export const sep = "/";

/** Path list delimiter, e.g. for $PATH (POSIX) */
export const delimiter = ":";

// ============================================================================
// Core utilities
// ============================================================================

/** Check whether a path is absolute */
export function isAbsolute(path: string): boolean {
  return path.charCodeAt(0) === 47; /* / */
}

/** Normalize a path, resolving `.` and `..` segments and collapsing slashes */
export function normalize(path: string): string {
  if (path === "") return ".";
  if (path === "/") return "/";

  const isAbs = path.charCodeAt(0) === 47;
  const trailingSlash = path.charCodeAt(path.length - 1) === 47;

  const segments = path.split("/");
  const result: string[] = [];

  for (const seg of segments) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (isAbs) {
        result.pop(); // can't go above root
      } else if (result.length > 0 && result[result.length - 1] !== "..") {
        result.pop();
      } else {
        result.push("..");
      }
    } else {
      result.push(seg);
    }
  }

  let out = result.join("/");

  if (isAbs) {
    out = "/" + out;
  }

  if (trailingSlash && out.length > 1 && !out.endsWith("/")) {
    out += "/";
  }

  return out || (isAbs ? "/" : trailingSlash ? "./" : ".");
}

/** Join path segments and normalize the result */
export function join(...paths: string[]): string {
  if (paths.length === 0) return ".";
  const joined = paths.filter((p) => p !== "").join("/");
  if (joined === "") return ".";
  return normalize(joined);
}

/**
 * Resolve a sequence of paths into a single normalized path.
 *
 * Processes right-to-left. Stops as soon as an absolute path is encountered.
 * Unlike Node's `path.resolve`, this does NOT prepend a working directory
 * when no absolute segment is found — the result stays relative.
 */
export function resolve(...paths: string[]): string {
  let resolved = "";

  for (let i = paths.length - 1; i >= 0; i--) {
    const p = paths[i];
    if (!p) continue;
    resolved = resolved ? `${p}/${resolved}` : p;
    if (p.charCodeAt(0) === 47) break;
  }

  return normalize(resolved || ".");
}

// ============================================================================
// Decomposition
// ============================================================================

/** Return the directory portion of a path */
export function dirname(path: string): string {
  if (path === "") return ".";
  if (path === "/") return "/";

  // Strip trailing slashes
  let end = path.length;
  while (end > 1 && path.charCodeAt(end - 1) === 47) end--;

  const trimmed = path.slice(0, end);
  const i = trimmed.lastIndexOf("/");

  if (i === -1) return ".";
  if (i === 0) return "/";
  return trimmed.slice(0, i);
}

/** Return the last segment of a path, optionally stripping a suffix */
export function basename(path: string, ext?: string): string {
  if (path === "") return "";

  // Strip trailing slashes (unless the entire path is "/")
  let end = path.length;
  while (end > 1 && path.charCodeAt(end - 1) === 47) end--;

  const trimmed = path.slice(0, end);

  // Root "/" → empty basename
  if (trimmed === "/") return "";

  const i = trimmed.lastIndexOf("/");
  const base = i === -1 ? trimmed : trimmed.slice(i + 1);

  if (ext && base.endsWith(ext) && base.length > ext.length) {
    return base.slice(0, base.length - ext.length);
  }

  return base;
}

/** Return the extension of a path (including the leading dot) */
export function extname(path: string): string {
  const base = basename(path);
  if (base === "" || base === "." || base === "..") return "";

  const i = base.lastIndexOf(".");
  if (i <= 0) return ""; // no dot, or leading dot (dotfile like .bashrc)

  return base.slice(i);
}

// ============================================================================
// Structured parse / format
// ============================================================================

export interface ParsedPath {
  root: string;
  dir: string;
  base: string;
  name: string;
  ext: string;
}

/** Parse a path into its components */
export function parse(path: string): ParsedPath {
  if (path === "") return { root: "", dir: "", base: "", name: "", ext: "" };

  const root = isAbsolute(path) ? "/" : "";

  // Strip trailing slashes
  let end = path.length;
  while (end > 1 && path.charCodeAt(end - 1) === 47) end--;
  const p = path.slice(0, end);

  const lastSlash = p.lastIndexOf("/");

  let dir: string;
  let base: string;

  if (lastSlash === -1) {
    dir = "";
    base = p;
  } else if (lastSlash === 0) {
    dir = "/";
    base = p.slice(1);
  } else {
    dir = p.slice(0, lastSlash);
    base = p.slice(lastSlash + 1);
  }

  const ext = extname(base);
  const name = ext ? base.slice(0, base.length - ext.length) : base;

  return { root, dir, base, name, ext };
}

/** Build a path string from components (inverse of `parse`) */
export function format(pathObject: Partial<ParsedPath>): string {
  const { root = "", dir, base, name, ext } = pathObject;

  const resolvedBase = base || `${name || ""}${ext || ""}`;

  if (dir) {
    // When dir is just the root (e.g. "/"), don't double up the separator
    if (dir === root) {
      return `${dir}${resolvedBase}`;
    }
    return `${dir}/${resolvedBase}`;
  }

  return `${root}${resolvedBase}`;
}

// ============================================================================
// Package specifier parsing
// ============================================================================

export interface PackageSpecifier {
  /** Package name (e.g. `"pkg"` or `"@scope/pkg"`) */
  name: string;
  /** Subpath within the package (e.g. `"./sub/path"`), or `"."` for the root */
  subpath: string;
}

/**
 * Parse a bare package specifier into its package name and subpath.
 *
 * Handles both scoped (`@scope/pkg/sub`) and unscoped (`pkg/sub`) specifiers.
 * The subpath is normalized to start with `"./"` (or `"."` for the root).
 *
 * ```ts
 * parsePackageSpecifier("lodash/merge")     // { name: "lodash", subpath: "./merge" }
 * parsePackageSpecifier("@vue/shared/dist") // { name: "@vue/shared", subpath: "./dist" }
 * parsePackageSpecifier("react")            // { name: "react", subpath: "." }
 * ```
 */
export function parsePackageSpecifier(specifier: string): PackageSpecifier {
  if (specifier.startsWith("@")) {
    // Scoped: first slash separates scope from name, second separates name from subpath
    const firstSlash = specifier.indexOf("/");
    if (firstSlash === -1) {
      // Bare scope with no name — unusual but return as-is
      return { name: specifier, subpath: "." };
    }
    const secondSlash = specifier.indexOf("/", firstSlash + 1);
    if (secondSlash === -1) {
      return { name: specifier, subpath: "." };
    }
    return {
      name: specifier.slice(0, secondSlash),
      subpath: `.${specifier.slice(secondSlash)}`,
    };
  }

  // Unscoped: first slash separates name from subpath
  const firstSlash = specifier.indexOf("/");
  if (firstSlash === -1) {
    return { name: specifier, subpath: "." };
  }
  return {
    name: specifier.slice(0, firstSlash),
    subpath: `.${specifier.slice(firstSlash)}`,
  };
}

// ============================================================================
// Relative path computation
// ============================================================================

/** Compute the relative path from `from` to `to` */
export function relative(from: string, to: string): string {
  const fromNorm = normalize(from);
  const toNorm = normalize(to);

  if (fromNorm === toNorm) return "";

  const fromParts = fromNorm === "/" ? [""] : fromNorm.split("/");
  const toParts = toNorm === "/" ? [""] : toNorm.split("/");

  // Skip common root "" for absolute paths
  const fromAbs = fromNorm.charCodeAt(0) === 47;
  const toAbs = toNorm.charCodeAt(0) === 47;

  // Both must be of the same type (both absolute or both relative)
  // to produce a meaningful relative path.
  const startIdx = fromAbs && toAbs ? 1 : 0;

  // Find the common prefix length
  let common = startIdx;
  const minLen = Math.min(fromParts.length, toParts.length);
  while (common < minLen && fromParts[common] === toParts[common]) {
    common++;
  }

  // Number of ".." hops to get from `from` up to the common ancestor
  const ups = fromParts.length - common;
  const rest = toParts.slice(common);

  const parts: string[] = [];
  for (let i = 0; i < ups; i++) parts.push("..");
  for (const r of rest) parts.push(r);

  return parts.join("/") || ".";
}
