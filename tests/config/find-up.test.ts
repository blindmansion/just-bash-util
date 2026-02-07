import { describe, it, expect } from "vitest";
import { InMemoryFs, type CommandContext } from "just-bash";
import { findUp } from "../../src/config";

// ============================================================================
// Helpers
// ============================================================================

function createCtx(files: Record<string, string>, cwd = "/"): CommandContext {
  return { fs: new InMemoryFs(files), cwd, env: new Map(), stdin: "" };
}

// ============================================================================
// findUp
// ============================================================================

describe("findUp", () => {
  it("finds a file in cwd", async () => {
    const ctx = createCtx({ "/project/package.json": '{}' }, "/project");
    const result = await findUp(ctx, "package.json");
    expect(result).toBe("/project/package.json");
  });

  it("finds a file in a parent directory", async () => {
    const ctx = createCtx({ "/project/package.json": '{}' }, "/project/src");
    const result = await findUp(ctx, "package.json");
    expect(result).toBe("/project/package.json");
  });

  it("finds a file several levels up", async () => {
    const ctx = createCtx({ "/package.json": '{}' }, "/project/src/lib");
    const result = await findUp(ctx, "package.json");
    expect(result).toBe("/package.json");
  });

  it("returns null when the file is not found", async () => {
    const ctx = createCtx({}, "/project/src");
    const result = await findUp(ctx, "package.json");
    expect(result).toBeNull();
  });

  it("returns the first match when given an array of names", async () => {
    const ctx = createCtx({
      "/project/.config.json": '{}',
      "/project/.config.yaml": 'key: value',
    }, "/project");
    const result = await findUp(ctx, [".config.json", ".config.yaml"]);
    expect(result).toBe("/project/.config.json");
  });

  it("falls through to later names if earlier ones are absent", async () => {
    const ctx = createCtx({
      "/project/.config.yaml": 'key: value',
    }, "/project");
    const result = await findUp(ctx, [".config.json", ".config.yaml"]);
    expect(result).toBe("/project/.config.yaml");
  });

  it("stops at the stopAt directory", async () => {
    const ctx = createCtx({
      "/package.json": '{}',
    }, "/project/src/lib");
    const result = await findUp(ctx, "package.json", { stopAt: "/project" });
    expect(result).toBeNull();
  });

  it("checks the stopAt directory itself", async () => {
    const ctx = createCtx({
      "/project/package.json": '{}',
    }, "/project/src");
    const result = await findUp(ctx, "package.json", { stopAt: "/project" });
    expect(result).toBe("/project/package.json");
  });

  it("stops at filesystem root", async () => {
    const ctx = createCtx({}, "/a/b/c");
    const result = await findUp(ctx, "nonexistent");
    expect(result).toBeNull();
  });

  it("works when cwd is root", async () => {
    const ctx = createCtx({ "/package.json": '{}' }, "/");
    const result = await findUp(ctx, "package.json");
    expect(result).toBe("/package.json");
  });

  it("returns null when cwd is root with no match", async () => {
    const ctx = createCtx({}, "/");
    const result = await findUp(ctx, "package.json");
    expect(result).toBeNull();
  });

  it("uses options.from to override cwd", async () => {
    const ctx = createCtx({
      "/other/package.json": '{}',
    }, "/project");
    const result = await findUp(ctx, "package.json", { from: "/other" });
    expect(result).toBe("/other/package.json");
  });
});
