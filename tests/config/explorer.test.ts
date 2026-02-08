import { describe, it, expect } from "vitest";
import { InMemoryFs, type CommandContext } from "just-bash";
import { searchConfig, loadConfig, type Loader } from "../../src/config";

// ============================================================================
// Helpers
// ============================================================================

function createCtx(files: Record<string, string>, cwd = "/"): CommandContext {
  return { fs: new InMemoryFs(files), cwd, env: new Map(), stdin: "" };
}

// ============================================================================
// searchConfig — basic file discovery
// ============================================================================

describe("searchConfig", () => {
  it("finds a .namerc file", async () => {
    const ctx = createCtx({ "/project/.myapprc": '{"key": "from-rc"}' }, "/project");
    const result = await searchConfig(ctx, { name: "myapp" });

    expect(result).not.toBeNull();
    expect(result!.config).toEqual({ key: "from-rc" });
    expect(result!.filepath).toBe("/project/.myapprc");
  });

  it("finds a .namerc.json file", async () => {
    const ctx = createCtx({ "/project/.myapprc.json": '{"key": "from-rc-json"}' }, "/project");
    const result = await searchConfig(ctx, { name: "myapp" });

    expect(result).not.toBeNull();
    expect(result!.config).toEqual({ key: "from-rc-json" });
    expect(result!.filepath).toBe("/project/.myapprc.json");
  });

  it("finds a name.config.json file", async () => {
    const ctx = createCtx({ "/project/myapp.config.json": '{"key": "from-config"}' }, "/project");
    const result = await searchConfig(ctx, { name: "myapp" });

    expect(result).not.toBeNull();
    expect(result!.config).toEqual({ key: "from-config" });
    expect(result!.filepath).toBe("/project/myapp.config.json");
  });

  it("returns null when no config is found", async () => {
    const ctx = createCtx({}, "/project");
    const result = await searchConfig(ctx, { name: "myapp" });

    expect(result).toBeNull();
  });

  it("uses ctx.cwd as the default starting directory", async () => {
    const ctx = createCtx({ "/deep/src/.myapprc.json": '{"found": true}' }, "/deep/src");
    const result = await searchConfig(ctx, { name: "myapp" });

    expect(result!.filepath).toBe("/deep/src/.myapprc.json");
  });

  it("uses options.from to override starting directory", async () => {
    const ctx = createCtx({
      "/project/.myapprc.json": '{"level": "project"}',
      "/other/.myapprc.json": '{"level": "other"}',
    }, "/project");
    const result = await searchConfig(ctx, { name: "myapp", from: "/other" });

    expect(result!.config).toEqual({ level: "other" });
  });
});

// ============================================================================
// searchConfig — package.json property extraction
// ============================================================================

describe("searchConfig package.json", () => {
  it("extracts the named property from package.json", async () => {
    const ctx = createCtx({
      "/project/package.json": JSON.stringify({
        name: "my-project",
        myapp: { setting: true },
      }),
    }, "/project");
    const result = await searchConfig(ctx, { name: "myapp" });

    expect(result).not.toBeNull();
    expect(result!.config).toEqual({ setting: true });
    expect(result!.filepath).toBe("/project/package.json");
  });

  it("skips package.json when the property is missing", async () => {
    const ctx = createCtx({
      "/project/package.json": JSON.stringify({ name: "my-project" }),
      "/project/.myapprc.json": '{"fallback": true}',
    }, "/project");
    const result = await searchConfig(ctx, { name: "myapp" });

    expect(result).not.toBeNull();
    expect(result!.config).toEqual({ fallback: true });
    expect(result!.filepath).toBe("/project/.myapprc.json");
  });

  it("supports custom packageJsonProp", async () => {
    const ctx = createCtx({
      "/project/package.json": JSON.stringify({ name: "pkg", customKey: { v: 1 } }),
    }, "/project");
    const result = await searchConfig(ctx, {
      name: "myapp",
      packageJsonProp: "customKey",
    });

    expect(result).not.toBeNull();
    expect(result!.config).toEqual({ v: 1 });
  });

  it("disables package.json extraction when packageJsonProp is false", async () => {
    const ctx = createCtx({
      "/project/package.json": JSON.stringify({ name: "pkg", myapp: { v: 1 } }),
    }, "/project");
    const result = await searchConfig(ctx, {
      name: "myapp",
      packageJsonProp: false,
      searchPlaces: ["package.json"],
    });

    expect(result).not.toBeNull();
    expect(result!.config).toEqual({ name: "pkg", myapp: { v: 1 } });
  });
});

// ============================================================================
// searchConfig — priority and directory walking
// ============================================================================

describe("searchConfig priority", () => {
  it("respects search places order (package.json before rc)", async () => {
    const ctx = createCtx({
      "/project/package.json": JSON.stringify({ myapp: { from: "pkg" } }),
      "/project/.myapprc": '{"from": "rc"}',
    }, "/project");
    const result = await searchConfig(ctx, { name: "myapp" });

    expect(result!.config).toEqual({ from: "pkg" });
  });

  it("prefers a match in the starting directory over a parent", async () => {
    const ctx = createCtx({
      "/project/.myapprc.json": '{"level": "parent"}',
      "/project/src/.myapprc.json": '{"level": "child"}',
    }, "/project/src");
    const result = await searchConfig(ctx, { name: "myapp" });

    expect(result!.config).toEqual({ level: "child" });
  });

  it("walks up to a parent directory when nothing found locally", async () => {
    const ctx = createCtx({
      "/project/.myapprc.json": '{"level": "parent"}',
    }, "/project/src/lib");
    const result = await searchConfig(ctx, { name: "myapp" });

    expect(result).not.toBeNull();
    expect(result!.config).toEqual({ level: "parent" });
    expect(result!.filepath).toBe("/project/.myapprc.json");
  });

  it("walks up multiple levels", async () => {
    const ctx = createCtx({
      "/.myapprc.json": '{"level": "root"}',
    }, "/a/b/c/d");
    const result = await searchConfig(ctx, { name: "myapp" });

    expect(result!.config).toEqual({ level: "root" });
    expect(result!.filepath).toBe("/.myapprc.json");
  });
});

// ============================================================================
// searchConfig — stopAt
// ============================================================================

describe("searchConfig stopAt", () => {
  it("stops searching at the stopAt directory", async () => {
    const ctx = createCtx({
      "/.myapprc.json": '{"level": "root"}',
    }, "/project/src");
    const result = await searchConfig(ctx, { name: "myapp", stopAt: "/project" });

    expect(result).toBeNull();
  });

  it("checks the stopAt directory itself", async () => {
    const ctx = createCtx({
      "/project/.myapprc.json": '{"found": true}',
    }, "/project/src");
    const result = await searchConfig(ctx, { name: "myapp", stopAt: "/project" });

    expect(result).not.toBeNull();
    expect(result!.config).toEqual({ found: true });
  });
});

// ============================================================================
// searchConfig — custom search places
// ============================================================================

describe("searchConfig custom searchPlaces", () => {
  it("uses custom search places", async () => {
    const ctx = createCtx({
      "/project/tsconfig.json": '{"compilerOptions": {}}',
    }, "/project");
    const result = await searchConfig(ctx, {
      name: "tsconfig",
      searchPlaces: ["tsconfig.json"],
      packageJsonProp: false,
    });

    expect(result).not.toBeNull();
    expect(result!.config).toEqual({ compilerOptions: {} });
    expect(result!.filepath).toBe("/project/tsconfig.json");
  });

  it("only checks specified search places", async () => {
    const ctx = createCtx({
      "/project/.myapprc": '{"from": "rc"}',
      "/project/myapp.config.json": '{"from": "config"}',
    }, "/project");
    const result = await searchConfig(ctx, {
      name: "myapp",
      searchPlaces: ["myapp.config.json"],
    });

    expect(result!.config).toEqual({ from: "config" });
  });
});

// ============================================================================
// searchConfig — custom loaders
// ============================================================================

describe("searchConfig custom loaders", () => {
  it("uses a custom loader for a given extension", async () => {
    const tomlLoader: Loader = (content) => {
      const result: Record<string, string> = {};
      for (const line of content.split("\n")) {
        const match = line.match(/^(\w+)\s*=\s*"(.*)"/);
        if (match) result[match[1]!] = match[2]!;
      }
      return result;
    };

    const ctx = createCtx({
      "/project/.myapprc.toml": 'key = "value"\nname = "test"',
    }, "/project");
    const result = await searchConfig(ctx, {
      name: "myapp",
      searchPlaces: [".myapprc.toml"],
      loaders: { ".toml": tomlLoader },
    });

    expect(result).not.toBeNull();
    expect(result!.config).toEqual({ key: "value", name: "test" });
  });

  it("custom loader overrides built-in for the same extension", async () => {
    const customJsonLoader: Loader = (content) => {
      const parsed = JSON.parse(content);
      return { ...parsed, _custom: true };
    };

    const ctx = createCtx({
      "/project/.myapprc.json": '{"key": "value"}',
    }, "/project");
    const result = await searchConfig(ctx, {
      name: "myapp",
      loaders: { ".json": customJsonLoader },
    });

    expect(result!.config).toEqual({ key: "value", _custom: true });
  });
});

// ============================================================================
// searchConfig — jsonc mode
// ============================================================================

describe("searchConfig jsonc support", () => {
  it("parses .json files with comments and trailing commas", async () => {
    const ctx = createCtx({
      "/project/.myapprc.json": `{
  // comment
  "key": "value",
}`,
    }, "/project");
    const result = await searchConfig(ctx, { name: "myapp" });

    expect(result).not.toBeNull();
    expect(result!.config).toEqual({ key: "value" });
  });
});

// ============================================================================
// searchConfig — isEmpty
// ============================================================================

describe("searchConfig isEmpty", () => {
  it("marks empty object as isEmpty", async () => {
    const ctx = createCtx({ "/project/.myapprc.json": '{}' }, "/project");
    const result = await searchConfig(ctx, { name: "myapp" });

    expect(result!.isEmpty).toBe(true);
  });

  it("marks null as isEmpty", async () => {
    const ctx = createCtx({ "/project/.myapprc.json": 'null' }, "/project");
    const result = await searchConfig(ctx, { name: "myapp" });

    expect(result!.isEmpty).toBe(true);
  });

  it("marks non-empty object as not isEmpty", async () => {
    const ctx = createCtx({ "/project/.myapprc.json": '{"key": "value"}' }, "/project");
    const result = await searchConfig(ctx, { name: "myapp" });

    expect(result!.isEmpty).toBe(false);
  });
});

// ============================================================================
// searchConfig — error handling
// ============================================================================

describe("searchConfig error handling", () => {
  it("skips files with parse errors and continues searching", async () => {
    const ctx = createCtx({
      "/project/.myapprc": "this is not json",
      "/project/.myapprc.json": '{"valid": true}',
    }, "/project");
    const result = await searchConfig(ctx, { name: "myapp" });

    expect(result).not.toBeNull();
    expect(result!.config).toEqual({ valid: true });
  });

  it("skips unparseable files and walks up", async () => {
    const ctx = createCtx({
      "/project/src/.myapprc.json": "not json!",
      "/project/.myapprc.json": '{"found": true}',
    }, "/project/src");
    const result = await searchConfig(ctx, { name: "myapp" });

    expect(result!.config).toEqual({ found: true });
    expect(result!.filepath).toBe("/project/.myapprc.json");
  });
});

// ============================================================================
// loadConfig
// ============================================================================

describe("loadConfig", () => {
  it("loads and parses a JSON file", async () => {
    const ctx = createCtx({ "/project/config.json": '{"key": "value"}' });
    const result = await loadConfig(ctx, "/project/config.json");

    expect(result).not.toBeNull();
    expect(result!.config).toEqual({ key: "value" });
    expect(result!.filepath).toBe("/project/config.json");
  });

  it("returns full package.json by default (no extraction)", async () => {
    const ctx = createCtx({
      "/project/package.json": JSON.stringify({ name: "pkg", myapp: { v: 1 } }),
    });
    const result = await loadConfig(ctx, "/project/package.json");

    expect(result).not.toBeNull();
    expect(result!.config).toEqual({ name: "pkg", myapp: { v: 1 } });
  });

  it("extracts property from package.json when packageJsonProp is set", async () => {
    const ctx = createCtx({
      "/project/package.json": JSON.stringify({ name: "pkg", myapp: { setting: true } }),
    });
    const result = await loadConfig(ctx, "/project/package.json", {
      packageJsonProp: "myapp",
    });

    expect(result).not.toBeNull();
    expect(result!.config).toEqual({ setting: true });
  });

  it("returns null for package.json without the requested property", async () => {
    const ctx = createCtx({
      "/project/package.json": JSON.stringify({ name: "pkg" }),
    });
    const result = await loadConfig(ctx, "/project/package.json", {
      packageJsonProp: "myapp",
    });

    expect(result).toBeNull();
  });

  it("throws when the file does not exist", async () => {
    const ctx = createCtx({});

    await expect(loadConfig(ctx, "/nonexistent.json")).rejects.toThrow();
  });

  it("throws when the file has invalid JSON", async () => {
    const ctx = createCtx({ "/project/bad.json": "not json!" });

    await expect(loadConfig(ctx, "/project/bad.json")).rejects.toThrow();
  });

  it("parses config files with comments and trailing commas", async () => {
    const ctx = createCtx({
      "/project/config.json": `{
  // comment
  "key": "value",
}`,
    });
    const result = await loadConfig(ctx, "/project/config.json");

    expect(result).not.toBeNull();
    expect(result!.config).toEqual({ key: "value" });
  });

  it("uses custom loaders", async () => {
    const upper: Loader = (content) => ({ text: content.toUpperCase() });
    const ctx = createCtx({ "/project/data.txt": "hello" });
    const result = await loadConfig(ctx, "/project/data.txt", {
      loaders: { ".txt": upper },
    });

    expect(result!.config).toEqual({ text: "HELLO" });
  });
});

// ============================================================================
// Real-world scenarios
// ============================================================================

describe("real-world scenarios", () => {
  it("tsconfig.json search with jsonc", async () => {
    const ctx = createCtx({
      "/project/tsconfig.json": `{
  // TypeScript config
  "compilerOptions": {
    "target": "ESNext",
    "strict": true,
  },
  "include": ["src/**/*.ts"],
}`,
    }, "/project/src/lib");
    const result = await searchConfig(ctx, {
      name: "tsconfig",
      searchPlaces: ["tsconfig.json"],
      packageJsonProp: false,
    });

    expect(result).not.toBeNull();
    expect(result!.filepath).toBe("/project/tsconfig.json");
    expect(result!.config).toEqual({
      compilerOptions: { target: "ESNext", strict: true },
      include: ["src/**/*.ts"],
    });
  });

  it("package.json search (full content, no property extraction)", async () => {
    const ctx = createCtx({
      "/project/package.json": JSON.stringify({ name: "my-project", version: "1.0.0" }),
    }, "/project/src");
    const result = await searchConfig(ctx, {
      name: "package",
      searchPlaces: ["package.json"],
      packageJsonProp: false,
    });

    expect(result!.config).toEqual({ name: "my-project", version: "1.0.0" });
  });

  it("eslint-style config with multiple search places", async () => {
    const ctx = createCtx({
      "/project/package.json": JSON.stringify({ name: "pkg" }),
      "/project/eslint.config.json": '{"rules": {"semi": "error"}}',
    }, "/project");
    const result = await searchConfig(ctx, { name: "eslint" });

    expect(result!.config).toEqual({ rules: { semi: "error" } });
    expect(result!.filepath).toBe("/project/eslint.config.json");
  });

  it("monorepo: child package overrides root config", async () => {
    const ctx = createCtx({
      "/monorepo/.myapprc.json": '{"scope": "root"}',
      "/monorepo/packages/core/.myapprc.json": '{"scope": "core"}',
    });

    const rootResult = await searchConfig(
      { ...ctx, cwd: "/monorepo/packages/web/src" },
      { name: "myapp" },
    );
    expect(rootResult!.config).toEqual({ scope: "root" });

    const coreResult = await searchConfig(
      { ...ctx, cwd: "/monorepo/packages/core/src" },
      { name: "myapp" },
    );
    expect(coreResult!.config).toEqual({ scope: "core" });
  });
});
