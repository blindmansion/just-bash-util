import { describe, it, expect } from "vitest";
import { InMemoryFs, type CommandContext } from "just-bash";
import { searchConfig } from "../../src/config";

// ============================================================================
// Helpers
// ============================================================================

function createCtx(files: Record<string, string>, cwd = "/"): CommandContext {
  return { fs: new InMemoryFs(files), cwd, env: new Map(), stdin: "" };
}

// ============================================================================
// searchConfig merge — basic merging
// ============================================================================

describe("searchConfig merge", () => {
  it("returns null when no configs found", async () => {
    const ctx = createCtx({}, "/project/src");
    const result = await searchConfig(ctx, { name: "myapp", merge: true });

    expect(result).toBeNull();
  });

  it("returns a single config as-is", async () => {
    const ctx = createCtx({
      "/project/.myapprc.json": '{"a": 1}',
    }, "/project");
    const result = await searchConfig(ctx, { name: "myapp", merge: true });

    expect(result).not.toBeNull();
    expect(result!.config).toEqual({ a: 1 });
    expect(result!.filepath).toBe("/project/.myapprc.json");
  });

  it("merges configs from multiple directory levels", async () => {
    const ctx = createCtx({
      "/project/src/.myapprc.json": '{"indent": 2}',
      "/project/.myapprc.json": '{"indent": 4, "color": true}',
    }, "/project/src");
    const result = await searchConfig(ctx, { name: "myapp", merge: true });

    expect(result).not.toBeNull();
    expect(result!.config).toEqual({ indent: 2, color: true });
  });

  it("closer config wins for conflicting keys", async () => {
    const ctx = createCtx({
      "/a/b/c/.myapprc.json": '{"level": "child"}',
      "/a/.myapprc.json": '{"level": "root", "extra": true}',
    }, "/a/b/c");
    const result = await searchConfig(ctx, { name: "myapp", merge: true });

    expect(result!.config).toEqual({ level: "child", extra: true });
  });

  it("deep-merges nested objects", async () => {
    const ctx = createCtx({
      "/project/src/.myapprc.json": '{"rules": {"semi": "error"}}',
      "/project/.myapprc.json": '{"rules": {"semi": "warn", "quotes": "double"}, "indent": 4}',
    }, "/project/src");
    const result = await searchConfig(ctx, { name: "myapp", merge: true });

    expect(result!.config).toEqual({
      rules: { semi: "error", quotes: "double" },
      indent: 4,
    });
  });

  it("replaces arrays outright (no concatenation)", async () => {
    const ctx = createCtx({
      "/project/src/.myapprc.json": '{"plugins": ["local-plugin"]}',
      "/project/.myapprc.json": '{"plugins": ["base-plugin"]}',
    }, "/project/src");
    const result = await searchConfig(ctx, { name: "myapp", merge: true });

    expect(result!.config).toEqual({ plugins: ["local-plugin"] });
  });

  it("merges three levels with correct precedence", async () => {
    const ctx = createCtx({
      "/a/b/c/.myapprc.json": '{"c": 30}',
      "/a/b/.myapprc.json": '{"b": 20, "c": 3}',
      "/a/.myapprc.json": '{"a": 1, "b": 2, "c": 0}',
    }, "/a/b/c");
    const result = await searchConfig(ctx, { name: "myapp", merge: true });

    expect(result!.config).toEqual({ a: 1, b: 20, c: 30 });
  });

  it("uses filepath from the closest config", async () => {
    const ctx = createCtx({
      "/project/src/.myapprc.json": '{"a": 1}',
      "/project/.myapprc.json": '{"b": 2}',
    }, "/project/src");
    const result = await searchConfig(ctx, { name: "myapp", merge: true });

    expect(result!.filepath).toBe("/project/src/.myapprc.json");
  });

  it("sets isEmpty correctly for merged result", async () => {
    const ctx = createCtx({
      "/project/src/.myapprc.json": '{}',
      "/project/.myapprc.json": '{"key": "value"}',
    }, "/project/src");
    const result = await searchConfig(ctx, { name: "myapp", merge: true });

    expect(result!.isEmpty).toBe(false);
  });

  it("isEmpty is true when all configs are empty", async () => {
    const ctx = createCtx({
      "/project/src/.myapprc.json": '{}',
      "/project/.myapprc.json": '{}',
    }, "/project/src");
    const result = await searchConfig(ctx, { name: "myapp", merge: true });

    expect(result!.isEmpty).toBe(true);
  });
});

// ============================================================================
// searchConfig merge — first-match-per-level semantics
// ============================================================================

describe("searchConfig merge per-level priority", () => {
  it("takes only the first match per directory level", async () => {
    const ctx = createCtx({
      "/project/.myapprc": '{"from": "rc"}',
      "/project/.myapprc.json": '{"from": "rc-json"}',
    }, "/project");
    const result = await searchConfig(ctx, { name: "myapp", merge: true });

    // .myapprc is first in default search places
    expect(result!.config).toEqual({ from: "rc" });
  });

  it("takes first match per level with custom search places including package.json", async () => {
    const ctx = createCtx({
      "/project/package.json": JSON.stringify({ myapp: { from: "pkg" } }),
      "/project/.myapprc": '{"from": "rc"}',
    }, "/project");
    const result = await searchConfig(ctx, {
      name: "myapp",
      merge: true,
      searchPlaces: ["package.json", ".myapprc"],
      packageJsonProp: "myapp",
    });

    expect(result!.config).toEqual({ from: "pkg" });
  });

  it("skips package.json when property is missing and finds next candidate", async () => {
    const ctx = createCtx({
      "/project/package.json": JSON.stringify({ name: "pkg" }),
      "/project/.myapprc.json": '{"from": "rc-json"}',
    }, "/project");
    const result = await searchConfig(ctx, {
      name: "myapp",
      merge: true,
      searchPlaces: ["package.json", ".myapprc.json"],
      packageJsonProp: "myapp",
    });

    expect(result!.config).toEqual({ from: "rc-json" });
  });

  it("skips unparseable files and continues", async () => {
    const ctx = createCtx({
      "/project/src/.myapprc": "not valid json",
      "/project/src/.myapprc.json": '{"valid": true}',
      "/project/.myapprc.json": '{"parent": true}',
    }, "/project/src");
    const result = await searchConfig(ctx, { name: "myapp", merge: true });

    expect(result!.config).toEqual({ valid: true, parent: true });
  });
});

// ============================================================================
// searchConfig merge — stopAt
// ============================================================================

describe("searchConfig merge stopAt", () => {
  it("stops at the stopAt directory", async () => {
    const ctx = createCtx({
      "/project/src/.myapprc.json": '{"level": "child"}',
      "/project/.myapprc.json": '{"level": "parent"}',
      "/.myapprc.json": '{"level": "root"}',
    }, "/project/src");
    const result = await searchConfig(ctx, {
      name: "myapp",
      merge: true,
      stopAt: "/project",
    });

    // Should include child + parent, but not root
    expect(result!.config).toEqual({ level: "child" });
  });

  it("checks the stopAt directory itself", async () => {
    const ctx = createCtx({
      "/project/.myapprc.json": '{"found": true}',
    }, "/project/src");
    const result = await searchConfig(ctx, {
      name: "myapp",
      merge: true,
      stopAt: "/project",
    });

    expect(result).not.toBeNull();
    expect(result!.config).toEqual({ found: true });
  });
});

// ============================================================================
// searchConfig merge — stopWhen
// ============================================================================

describe("searchConfig merge stopWhen", () => {
  it("stops merging when stopWhen returns true", async () => {
    const ctx = createCtx({
      "/project/src/.myapprc.json": '{"level": "child"}',
      "/project/.myapprc.json": '{"level": "parent", "root": true}',
      "/.myapprc.json": '{"level": "root"}',
    }, "/project/src");
    const result = await searchConfig(ctx, {
      name: "myapp",
      merge: true,
      stopWhen: (cfg) => (cfg as any).root === true,
    });

    expect(result!.config).toEqual({ level: "child", root: true });
  });

  it("includes the matching config in the merged result", async () => {
    const ctx = createCtx({
      "/project/.myapprc.json": '{"root": true, "setting": "value"}',
      "/.myapprc.json": '{"should": "not appear"}',
    }, "/project");
    const result = await searchConfig(ctx, {
      name: "myapp",
      merge: true,
      stopWhen: (cfg) => (cfg as any).root === true,
    });

    expect(result!.config).toEqual({ root: true, setting: "value" });
    expect((result!.config as any).should).toBeUndefined();
  });

  it("merges all configs when stopWhen never returns true", async () => {
    const ctx = createCtx({
      "/project/src/.myapprc.json": '{"a": 1}',
      "/project/.myapprc.json": '{"b": 2}',
    }, "/project/src");
    const result = await searchConfig(ctx, {
      name: "myapp",
      merge: true,
      stopWhen: () => false,
    });

    expect(result!.config).toEqual({ a: 1, b: 2 });
  });

  it("is ignored when merge is not set", async () => {
    const ctx = createCtx({
      "/project/src/.myapprc.json": '{"level": "child"}',
      "/project/.myapprc.json": '{"level": "parent"}',
    }, "/project/src");
    // stopWhen is provided but merge is not — should behave like normal searchConfig
    const result = await searchConfig(ctx, {
      name: "myapp",
      stopWhen: (cfg) => (cfg as any).root === true,
    });

    expect(result!.config).toEqual({ level: "child" });
  });
});

// ============================================================================
// searchConfig merge — options pass-through
// ============================================================================

describe("searchConfig merge options", () => {
  it("uses options.from to override starting directory", async () => {
    const ctx = createCtx({
      "/other/.myapprc.json": '{"from": "other"}',
      "/project/.myapprc.json": '{"from": "project"}',
    }, "/project");
    const result = await searchConfig(ctx, {
      name: "myapp",
      merge: true,
      from: "/other",
    });

    expect(result!.config).toEqual({ from: "other" });
  });

  it("supports custom search places", async () => {
    const ctx = createCtx({
      "/project/myapp.config.json": '{"custom": true}',
      "/project/.myapprc.json": '{"should": "be ignored"}',
    }, "/project");
    const result = await searchConfig(ctx, {
      name: "myapp",
      merge: true,
      searchPlaces: ["myapp.config.json"],
    });

    expect(result!.config).toEqual({ custom: true });
  });

  it("supports custom loaders", async () => {
    const csvLoader = (content: string) => content.split(",");
    const ctx = createCtx({
      "/project/.myapprc.csv": "a,b,c",
    }, "/project");
    const result = await searchConfig(ctx, {
      name: "myapp",
      merge: true,
      searchPlaces: [".myapprc.csv"],
      loaders: { ".csv": csvLoader },
    });

    expect(result!.config).toEqual(["a", "b", "c"]);
  });
});

// ============================================================================
// End-to-end scenarios
// ============================================================================

describe("searchConfig merge end-to-end", () => {
  it("merges layered configs from a monorepo", async () => {
    const ctx = createCtx({
      "/monorepo/.myapprc.json": '{"indent": 4, "color": true, "rules": {"semi": "warn"}}',
      "/monorepo/packages/core/.myapprc.json": '{"indent": 2, "rules": {"semi": "error"}}',
    }, "/monorepo/packages/core/src");
    const result = await searchConfig(ctx, { name: "myapp", merge: true });

    expect(result).not.toBeNull();
    expect(result!.config).toEqual({
      indent: 2,
      color: true,
      rules: { semi: "error" },
    });
    expect(result!.filepath).toBe("/monorepo/packages/core/.myapprc.json");
  });

  it("respects root: true to stop cascading", async () => {
    const ctx = createCtx({
      "/.myapprc.json": '{"global": true}',
      "/monorepo/.myapprc.json": '{"root": true, "base": "mono"}',
      "/monorepo/packages/core/.myapprc.json": '{"local": true}',
    }, "/monorepo/packages/core");
    const result = await searchConfig(ctx, {
      name: "myapp",
      merge: true,
      stopWhen: (cfg) => (cfg as any).root === true,
    });

    expect(result).not.toBeNull();
    expect(result!.config).toEqual({ root: true, base: "mono", local: true });
    // Global config should NOT be included
    expect((result!.config as any).global).toBeUndefined();
  });

  it("handles case where only ancestral configs exist", async () => {
    const ctx = createCtx({
      "/.myapprc.json": '{"from": "root"}',
    }, "/a/b/c/d");
    const result = await searchConfig(ctx, { name: "myapp", merge: true });

    expect(result).not.toBeNull();
    expect(result!.config).toEqual({ from: "root" });
  });
});
