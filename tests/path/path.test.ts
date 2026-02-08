import { describe, it, expect } from "vitest";
import {
  sep,
  delimiter,
  isAbsolute,
  normalize,
  join,
  resolve,
  dirname,
  basename,
  extname,
  parse,
  format,
  relative,
  parsePackageSpecifier,
} from "../../src/path";

// ============================================================================
// Constants
// ============================================================================

describe("sep", () => {
  it("is /", () => {
    expect(sep).toBe("/");
  });
});

describe("delimiter", () => {
  it("is :", () => {
    expect(delimiter).toBe(":");
  });
});

// ============================================================================
// isAbsolute
// ============================================================================

describe("isAbsolute", () => {
  it("returns true for /", () => {
    expect(isAbsolute("/")).toBe(true);
  });

  it("returns true for /foo/bar", () => {
    expect(isAbsolute("/foo/bar")).toBe(true);
  });

  it("returns false for relative paths", () => {
    expect(isAbsolute("foo/bar")).toBe(false);
    expect(isAbsolute("./foo")).toBe(false);
    expect(isAbsolute("../foo")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isAbsolute("")).toBe(false);
  });
});

// ============================================================================
// normalize
// ============================================================================

describe("normalize", () => {
  it("returns . for empty string", () => {
    expect(normalize("")).toBe(".");
  });

  it("returns / for root", () => {
    expect(normalize("/")).toBe("/");
  });

  it("collapses repeated slashes", () => {
    expect(normalize("/foo//bar///baz")).toBe("/foo/bar/baz");
  });

  it("resolves . segments", () => {
    expect(normalize("/foo/./bar/./baz")).toBe("/foo/bar/baz");
  });

  it("resolves .. segments", () => {
    expect(normalize("/foo/bar/../baz")).toBe("/foo/baz");
  });

  it("does not go above root for absolute paths", () => {
    expect(normalize("/foo/../..")).toBe("/");
    expect(normalize("/..")).toBe("/");
  });

  it("preserves leading .. for relative paths", () => {
    expect(normalize("../../foo")).toBe("../../foo");
    expect(normalize("../..")).toBe("../..");
  });

  it("resolves relative . and ..", () => {
    expect(normalize("foo/./bar/../baz")).toBe("foo/baz");
  });

  it("returns . for paths that normalize to nothing", () => {
    expect(normalize(".")).toBe(".");
    expect(normalize("./")).toBe("./");
    expect(normalize("foo/..")).toBe(".");
  });

  it("preserves trailing slash", () => {
    expect(normalize("/foo/bar/")).toBe("/foo/bar/");
    expect(normalize("foo/bar/")).toBe("foo/bar/");
  });

  it("collapses multiple trailing slashes", () => {
    expect(normalize("/foo///")).toBe("/foo/");
  });
});

// ============================================================================
// join
// ============================================================================

describe("join", () => {
  it("returns . for no arguments", () => {
    expect(join()).toBe(".");
  });

  it("returns . for all-empty arguments", () => {
    expect(join("", "")).toBe(".");
  });

  it("joins two segments", () => {
    expect(join("foo", "bar")).toBe("foo/bar");
  });

  it("joins absolute path with relative", () => {
    expect(join("/foo", "bar")).toBe("/foo/bar");
  });

  it("normalizes the result", () => {
    expect(join("/foo", "./bar", "../baz")).toBe("/foo/baz");
  });

  it("skips empty segments", () => {
    expect(join("foo", "", "bar")).toBe("foo/bar");
  });

  it("handles many segments", () => {
    expect(join("a", "b", "c", "d")).toBe("a/b/c/d");
  });
});

// ============================================================================
// resolve
// ============================================================================

describe("resolve", () => {
  it("returns . for no arguments", () => {
    expect(resolve()).toBe(".");
  });

  it("normalizes a single absolute path", () => {
    expect(resolve("/foo/bar")).toBe("/foo/bar");
  });

  it("resolves relative against absolute", () => {
    expect(resolve("/foo", "bar")).toBe("/foo/bar");
  });

  it("later absolute path wins", () => {
    expect(resolve("/foo", "/bar")).toBe("/bar");
  });

  it("stops at the rightmost absolute path", () => {
    expect(resolve("/a", "b", "/c", "d")).toBe("/c/d");
  });

  it("resolves .. segments", () => {
    expect(resolve("/foo", "bar", "..", "baz")).toBe("/foo/baz");
  });

  it("stays relative when no absolute segment exists", () => {
    expect(resolve("foo", "bar")).toBe("foo/bar");
  });

  it("skips empty segments", () => {
    expect(resolve("/foo", "", "bar")).toBe("/foo/bar");
  });
});

// ============================================================================
// dirname
// ============================================================================

describe("dirname", () => {
  it("returns . for empty string", () => {
    expect(dirname("")).toBe(".");
  });

  it("returns / for root", () => {
    expect(dirname("/")).toBe("/");
  });

  it("returns / for file in root", () => {
    expect(dirname("/foo")).toBe("/");
  });

  it("returns parent directory", () => {
    expect(dirname("/foo/bar")).toBe("/foo");
  });

  it("strips trailing slashes", () => {
    expect(dirname("/foo/bar/")).toBe("/foo");
  });

  it("returns . for bare filename", () => {
    expect(dirname("foo")).toBe(".");
  });

  it("handles relative paths", () => {
    expect(dirname("foo/bar")).toBe("foo");
  });

  it("handles deeply nested paths", () => {
    expect(dirname("/a/b/c/d")).toBe("/a/b/c");
  });
});

// ============================================================================
// basename
// ============================================================================

describe("basename", () => {
  it("returns empty for empty string", () => {
    expect(basename("")).toBe("");
  });

  it("returns empty for root /", () => {
    expect(basename("/")).toBe("");
  });

  it("returns the last segment", () => {
    expect(basename("/foo/bar")).toBe("bar");
  });

  it("strips trailing slashes", () => {
    expect(basename("/foo/bar/")).toBe("bar");
  });

  it("returns the whole string for bare filename", () => {
    expect(basename("foo")).toBe("foo");
  });

  it("strips the provided extension", () => {
    expect(basename("/foo/bar.txt", ".txt")).toBe("bar");
  });

  it("does not strip if ext does not match", () => {
    expect(basename("/foo/bar.txt", ".md")).toBe("bar.txt");
  });

  it("does not strip if base equals ext", () => {
    expect(basename(".txt", ".txt")).toBe(".txt");
  });

  it("handles dotfiles", () => {
    expect(basename("/home/.bashrc")).toBe(".bashrc");
  });
});

// ============================================================================
// extname
// ============================================================================

describe("extname", () => {
  it("returns extension with dot", () => {
    expect(extname("file.txt")).toBe(".txt");
  });

  it("returns last extension only", () => {
    expect(extname("file.tar.gz")).toBe(".gz");
  });

  it("returns empty for no extension", () => {
    expect(extname("file")).toBe("");
  });

  it("returns empty for dotfiles", () => {
    expect(extname(".bashrc")).toBe("");
  });

  it("returns extension for dotfiles with extension", () => {
    expect(extname(".bash.rc")).toBe(".rc");
  });

  it("returns . for trailing dot", () => {
    expect(extname("file.")).toBe(".");
  });

  it("returns empty for empty string", () => {
    expect(extname("")).toBe("");
  });

  it("returns empty for . and ..", () => {
    expect(extname(".")).toBe("");
    expect(extname("..")).toBe("");
  });

  it("works on full paths", () => {
    expect(extname("/foo/bar/baz.txt")).toBe(".txt");
  });
});

// ============================================================================
// parse
// ============================================================================

describe("parse", () => {
  it("parses an absolute path with extension", () => {
    expect(parse("/foo/bar.txt")).toEqual({
      root: "/",
      dir: "/foo",
      base: "bar.txt",
      name: "bar",
      ext: ".txt",
    });
  });

  it("parses a bare filename", () => {
    expect(parse("file.js")).toEqual({
      root: "",
      dir: "",
      base: "file.js",
      name: "file",
      ext: ".js",
    });
  });

  it("parses a path with no extension", () => {
    expect(parse("/foo/bar")).toEqual({
      root: "/",
      dir: "/foo",
      base: "bar",
      name: "bar",
      ext: "",
    });
  });

  it("parses root file", () => {
    expect(parse("/file.txt")).toEqual({
      root: "/",
      dir: "/",
      base: "file.txt",
      name: "file",
      ext: ".txt",
    });
  });

  it("parses empty string", () => {
    expect(parse("")).toEqual({
      root: "",
      dir: "",
      base: "",
      name: "",
      ext: "",
    });
  });

  it("strips trailing slashes", () => {
    expect(parse("/foo/bar/")).toEqual({
      root: "/",
      dir: "/foo",
      base: "bar",
      name: "bar",
      ext: "",
    });
  });

  it("parses a dotfile", () => {
    expect(parse("/home/.bashrc")).toEqual({
      root: "/",
      dir: "/home",
      base: ".bashrc",
      name: ".bashrc",
      ext: "",
    });
  });

  it("parses a dotfile with extension", () => {
    expect(parse("/home/.config.json")).toEqual({
      root: "/",
      dir: "/home",
      base: ".config.json",
      name: ".config",
      ext: ".json",
    });
  });
});

// ============================================================================
// format
// ============================================================================

describe("format", () => {
  it("round-trips through parse", () => {
    const paths = ["/foo/bar.txt", "/file.js", "relative.md", "/home/.bashrc"];
    for (const p of paths) {
      expect(format(parse(p))).toBe(p);
    }
  });

  it("uses dir over root when both present", () => {
    expect(format({ root: "/", dir: "/foo", base: "bar.txt" })).toBe("/foo/bar.txt");
  });

  it("uses root when dir is absent", () => {
    expect(format({ root: "/", base: "bar.txt" })).toBe("/bar.txt");
  });

  it("builds base from name + ext", () => {
    expect(format({ dir: "/foo", name: "bar", ext: ".txt" })).toBe("/foo/bar.txt");
  });

  it("prefers base over name + ext", () => {
    expect(format({ dir: "/foo", base: "bar.txt", name: "ignored", ext: ".md" })).toBe(
      "/foo/bar.txt",
    );
  });

  it("returns empty for empty object", () => {
    expect(format({})).toBe("");
  });

  it("handles dir equal to root (no double slash)", () => {
    expect(format({ root: "/", dir: "/", base: "foo" })).toBe("/foo");
  });
});

// ============================================================================
// relative
// ============================================================================

describe("relative", () => {
  it("returns empty for identical paths", () => {
    expect(relative("/foo/bar", "/foo/bar")).toBe("");
  });

  it("returns empty for paths that normalize to the same thing", () => {
    expect(relative("/foo/bar", "/foo/./bar")).toBe("");
  });

  it("computes sibling path", () => {
    expect(relative("/foo/bar", "/foo/baz")).toBe("../baz");
  });

  it("computes path going up multiple levels", () => {
    expect(relative("/foo/bar/baz", "/foo/qux")).toBe("../../qux");
  });

  it("computes descending path", () => {
    expect(relative("/foo", "/foo/bar/baz")).toBe("bar/baz");
  });

  it("computes path from root", () => {
    expect(relative("/", "/foo/bar")).toBe("foo/bar");
  });

  it("computes path to root", () => {
    expect(relative("/foo/bar", "/")).toBe("../..");
  });

  it("works with relative paths", () => {
    expect(relative("a/b", "a/c")).toBe("../c");
  });
});

// ============================================================================
// parsePackageSpecifier
// ============================================================================

describe("parsePackageSpecifier", () => {
  it("parses a bare unscoped package", () => {
    expect(parsePackageSpecifier("lodash")).toEqual({
      name: "lodash",
      subpath: ".",
    });
  });

  it("parses an unscoped package with subpath", () => {
    expect(parsePackageSpecifier("lodash/merge")).toEqual({
      name: "lodash",
      subpath: "./merge",
    });
  });

  it("parses an unscoped package with deep subpath", () => {
    expect(parsePackageSpecifier("lodash/fp/merge")).toEqual({
      name: "lodash",
      subpath: "./fp/merge",
    });
  });

  it("parses a bare scoped package", () => {
    expect(parsePackageSpecifier("@vue/shared")).toEqual({
      name: "@vue/shared",
      subpath: ".",
    });
  });

  it("parses a scoped package with subpath", () => {
    expect(parsePackageSpecifier("@vue/shared/dist")).toEqual({
      name: "@vue/shared",
      subpath: "./dist",
    });
  });

  it("parses a scoped package with deep subpath", () => {
    expect(parsePackageSpecifier("@org/pkg/lib/utils/index.js")).toEqual({
      name: "@org/pkg",
      subpath: "./lib/utils/index.js",
    });
  });

  it("handles bare scope without package name", () => {
    expect(parsePackageSpecifier("@scope")).toEqual({
      name: "@scope",
      subpath: ".",
    });
  });
});
