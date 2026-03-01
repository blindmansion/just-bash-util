import { describe, it, expect } from "vitest";
import { parseArgs } from "../../src/command";
import type { OptionsSchema } from "../../src/command/types.ts";
import {
  serveOptions,
  deployOptions,
  verboseOptions,
  singleStringArg,
  optionalStringArg,
  variadicStringArgs,
  optionalVariadicStringArgs,
  twoPositionalArgs,
  numberArg,
  emptyOptions,
  emptyArgs,
} from "./fixtures.ts";

// ============================================================================
// Helpers
// ============================================================================

function expectOk(result: ReturnType<typeof parseArgs>) {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected ok");
  return result;
}

function expectFail(result: ReturnType<typeof parseArgs>) {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("Expected failure");
  return result;
}

// ============================================================================
// Long options
// ============================================================================

describe("long options", () => {
  it("parses --key value form", () => {
    const result = expectOk(parseArgs(serveOptions, emptyArgs, ["--port", "8080"]));
    expect(result.args.port).toBe(8080);
  });

  it("parses --key=value form", () => {
    const result = expectOk(parseArgs(serveOptions, emptyArgs, ["--port=8080"]));
    expect(result.args.port).toBe(8080);
  });

  it("converts camelCase keys to kebab-case", () => {
    const result = expectOk(
      parseArgs(deployOptions, emptyArgs, ["--target", "prod", "--dry-run"]),
    );
    expect(result.args.target).toBe("prod");
    expect(result.args.dryRun).toBe(true);
  });

  it("parses string options", () => {
    const result = expectOk(parseArgs(serveOptions, emptyArgs, ["--host", "0.0.0.0"]));
    expect(result.args.host).toBe("0.0.0.0");
  });

  it("parses flag (boolean toggle)", () => {
    const result = expectOk(parseArgs(serveOptions, emptyArgs, ["--open"]));
    expect(result.args.open).toBe(true);
  });

  it("flags default to false when not provided", () => {
    const result = expectOk(parseArgs(serveOptions, emptyArgs, []));
    expect(result.args.open).toBe(false);
  });

  it("negates a flag with --no- prefix", () => {
    const result = expectOk(parseArgs(serveOptions, emptyArgs, ["--no-open"]));
    expect(result.args.open).toBe(false);
  });

  it("negates a kebab-case flag with --no- prefix", () => {
    const result = expectOk(parseArgs(deployOptions, emptyArgs, ["--target", "prod", "--dry-run", "--no-dry-run"]));
    expect(result.args.dryRun).toBe(false);
  });

  it("--no- on a non-flag option is an unknown option error", () => {
    const result = expectFail(parseArgs(serveOptions, emptyArgs, ["--no-port"]));
    expect(result.errors[0]).toMatchObject({
      type: "unknown_option",
      name: "--no-port",
    });
  });

  it("--no- with no matching flag is an unknown option error", () => {
    const result = expectFail(parseArgs(serveOptions, emptyArgs, ["--no-missing"]));
    expect(result.errors[0]).toMatchObject({
      type: "unknown_option",
      name: "--no-missing",
    });
  });
});

// ============================================================================
// Short options
// ============================================================================

describe("short options", () => {
  it("parses -p value form", () => {
    const result = expectOk(parseArgs(serveOptions, emptyArgs, ["-p", "9090"]));
    expect(result.args.port).toBe(9090);
  });

  it("parses -p<value> (no space) form", () => {
    const result = expectOk(parseArgs(serveOptions, emptyArgs, ["-p9090"]));
    expect(result.args.port).toBe(9090);
  });

  it("parses combined short flags", () => {
    const result = expectOk(
      parseArgs(deployOptions, emptyArgs, ["--target", "prod", "-n"]),
    );
    expect(result.args.dryRun).toBe(true);
  });

  it("parses short flag alias", () => {
    const result = expectOk(parseArgs(serveOptions, emptyArgs, ["-o"]));
    expect(result.args.open).toBe(true);
  });
});

// ============================================================================
// Positional arguments
// ============================================================================

describe("positional arguments", () => {
  it("parses a single required positional arg", () => {
    const result = expectOk(parseArgs(emptyOptions, singleStringArg, ["index.ts"]));
    expect(result.args.entry).toBe("index.ts");
  });

  it("errors on missing required positional arg", () => {
    const result = expectFail(parseArgs(emptyOptions, singleStringArg, []));
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      type: "missing_required",
      name: "entry",
      kind: "arg",
    });
  });

  it("accepts an optional arg when provided", () => {
    const result = expectOk(parseArgs(emptyOptions, optionalStringArg, ["readme.md"]));
    expect(result.args.file).toBe("readme.md");
  });

  it("does not error when optional arg is omitted", () => {
    const result = expectOk(parseArgs(emptyOptions, optionalStringArg, []));
    expect(result.args.file).toBeUndefined();
  });

  it("parses variadic args into an array", () => {
    const result = expectOk(
      parseArgs(emptyOptions, variadicStringArgs, ["a.ts", "b.ts", "c.ts"]),
    );
    expect(result.args.files).toEqual(["a.ts", "b.ts", "c.ts"]);
  });

  it("errors on missing required variadic arg", () => {
    const result = expectFail(parseArgs(emptyOptions, variadicStringArgs, []));
    expect(result.errors[0]).toMatchObject({
      type: "missing_required",
      name: "files",
      kind: "arg",
    });
  });

  it("returns empty array for optional variadic with no values", () => {
    const result = expectOk(parseArgs(emptyOptions, optionalVariadicStringArgs, []));
    expect(result.args.packages).toEqual([]);
  });

  it("returns populated array for optional variadic with values", () => {
    const result = expectOk(
      parseArgs(emptyOptions, optionalVariadicStringArgs, ["lodash", "nanoid"]),
    );
    expect(result.args.packages).toEqual(["lodash", "nanoid"]);
  });

  it("parses two positional args", () => {
    const result = expectOk(
      parseArgs(emptyOptions, twoPositionalArgs, ["src.ts", "dst.ts"]),
    );
    expect(result.args.source).toBe("src.ts");
    expect(result.args.dest).toBe("dst.ts");
  });

  it("allows second positional to be omitted when optional", () => {
    const result = expectOk(parseArgs(emptyOptions, twoPositionalArgs, ["src.ts"]));
    expect(result.args.source).toBe("src.ts");
    expect(result.args.dest).toBeUndefined();
  });

  it("coerces a number arg", () => {
    const result = expectOk(parseArgs(emptyOptions, numberArg, ["42"]));
    expect(result.args.count).toBe(42);
  });

  it("errors on invalid number arg", () => {
    const result = expectFail(parseArgs(emptyOptions, numberArg, ["abc"]));
    expect(result.errors[0]).toMatchObject({
      type: "invalid_type",
      name: "count",
      expected: "number",
    });
  });

  it("errors on unexpected extra positionals", () => {
    const result = expectFail(
      parseArgs(emptyOptions, singleStringArg, ["one", "two"]),
    );
    expect(result.errors[0]).toMatchObject({
      type: "unexpected_positional",
      value: "two",
    });
  });
});

// ============================================================================
// Defaults
// ============================================================================

describe("defaults", () => {
  it("applies option defaults when not provided", () => {
    const result = expectOk(parseArgs(serveOptions, emptyArgs, []));
    expect(result.args.port).toBe(3000);
  });

  it("overrides defaults with explicit values", () => {
    const result = expectOk(parseArgs(serveOptions, emptyArgs, ["--port", "9090"]));
    expect(result.args.port).toBe(9090);
  });

  it("applies deploy option defaults", () => {
    const result = expectOk(
      parseArgs(deployOptions, emptyArgs, ["--target", "staging"]),
    );
    expect(result.args.replicas).toBe(1);
    expect(result.args.dryRun).toBe(false);
  });
});

// ============================================================================
// Passthrough (-- separator)
// ============================================================================

describe("passthrough", () => {
  it("keeps pre-- positionals and sends post-- tokens to passthrough only", () => {
    const result = expectOk(
      parseArgs(serveOptions, variadicStringArgs, [
        "index.ts",
        "--port",
        "3000",
        "--",
        "--inspect",
        "--watch",
      ]),
    );
    expect(result.args.files).toEqual(["index.ts"]);
    expect(result.args.port).toBe(3000);
    expect(result.passthrough).toEqual(["--inspect", "--watch"]);
  });

  it("returns empty passthrough when -- is not present", () => {
    const result = expectOk(parseArgs(serveOptions, emptyArgs, ["--port", "3000"]));
    expect(result.passthrough).toEqual([]);
  });

  it("returns empty passthrough when -- has no trailing tokens", () => {
    const result = expectOk(parseArgs(serveOptions, emptyArgs, ["--"]));
    expect(result.passthrough).toEqual([]);
  });

  it("does not feed tokens after -- into positional args", () => {
    const result = expectFail(
      parseArgs(emptyOptions, singleStringArg, ["--", "README.md"]),
    );
    expect(result.errors[0]).toMatchObject({
      type: "missing_required",
      name: "entry",
      kind: "arg",
    });
  });

  it("does not feed tokens after -- into variadic positional args", () => {
    const result = expectFail(
      parseArgs(emptyOptions, variadicStringArgs, ["--", "a.ts", "b.ts"]),
    );
    expect(result.errors[0]).toMatchObject({
      type: "missing_required",
      name: "files",
      kind: "arg",
    });
  });

  it("pre-- positionals stay in args, post-- tokens go only to passthrough", () => {
    const result = expectOk(
      parseArgs(serveOptions, variadicStringArgs, [
        "a.ts",
        "--port",
        "3000",
        "--",
        "b.ts",
        "c.ts",
      ]),
    );
    expect(result.args.files).toEqual(["a.ts"]);
    expect(result.args.port).toBe(3000);
    expect(result.passthrough).toEqual(["b.ts", "c.ts"]);
  });

  it("tokens after -- are not parsed as flags or positionals", () => {
    const result = expectOk(
      parseArgs(serveOptions, optionalVariadicStringArgs, [
        "--",
        "--open",
        "-p",
        "3000",
      ]),
    );
    expect(result.args.packages).toEqual([]);
    expect(result.args.open).toBe(false);
    expect(result.passthrough).toEqual(["--open", "-p", "3000"]);
  });
});

// ============================================================================
// Required option validation
// ============================================================================

describe("required options", () => {
  it("errors when a required option is missing", () => {
    const result = expectFail(parseArgs(deployOptions, emptyArgs, []));
    expect(result.errors).toContainEqual(
      expect.objectContaining({ type: "missing_required", name: "target", kind: "option" }),
    );
  });

  it("passes when a required option is provided", () => {
    const result = expectOk(
      parseArgs(deployOptions, emptyArgs, ["--target", "production"]),
    );
    expect(result.args.target).toBe("production");
  });
});

// ============================================================================
// Error accumulation
// ============================================================================

describe("error accumulation", () => {
  it("collects multiple errors in a single parse", () => {
    const result = expectFail(
      parseArgs(deployOptions, singleStringArg, ["--unknown", "--port", "abc"]),
    );
    // Should have at least: unknown_option for --unknown, missing_required for --target, missing_required for entry
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it("reports unknown options with suggestions", () => {
    const result = expectFail(
      parseArgs(serveOptions, emptyArgs, ["--prot", "8080"]),
    );
    const unknownErr = result.errors.find((e) => e.type === "unknown_option");
    expect(unknownErr).toBeDefined();
    expect(unknownErr!.type === "unknown_option" && unknownErr!.name).toBe("--prot");
  });
});

// ============================================================================
// Type coercion errors
// ============================================================================

describe("type coercion", () => {
  it("errors on non-numeric value for number option", () => {
    const result = expectFail(
      parseArgs(serveOptions, emptyArgs, ["--port", "abc"]),
    );
    expect(result.errors[0]).toMatchObject({
      type: "invalid_type",
      name: "port",
      expected: "number",
      received: "abc",
    });
  });

  it("errors when option value is missing (end of tokens)", () => {
    const result = expectFail(parseArgs(serveOptions, emptyArgs, ["--port"]));
    expect(result.errors[0]).toMatchObject({
      type: "missing_value",
      name: "port",
    });
  });

  it("errors when short option value is missing", () => {
    const result = expectFail(parseArgs(serveOptions, emptyArgs, ["-p"]));
    expect(result.errors[0]).toMatchObject({
      type: "missing_value",
      name: "port",
    });
  });
});

// ============================================================================
// Mixed options and positionals
// ============================================================================

describe("mixed options and positionals", () => {
  it("handles options and positionals interleaved", () => {
    const result = expectOk(
      parseArgs(serveOptions, singleStringArg, ["--port", "4000", "app.ts", "--open"]),
    );
    expect(result.args.port).toBe(4000);
    expect(result.args.entry).toBe("app.ts");
    expect(result.args.open).toBe(true);
  });

  it("handles positionals before options", () => {
    const result = expectOk(
      parseArgs(serveOptions, singleStringArg, ["app.ts", "--port", "4000"]),
    );
    expect(result.args.entry).toBe("app.ts");
    expect(result.args.port).toBe(4000);
  });
});

// ============================================================================
// Counted flags
// ============================================================================

describe("counted flags", () => {
  it("defaults to 0 when absent", () => {
    const result = expectOk(parseArgs(verboseOptions, emptyArgs, []));
    expect(result.args.verbose).toBe(0);
  });

  it("returns 1 for a single --verbose", () => {
    const result = expectOk(parseArgs(verboseOptions, emptyArgs, ["--verbose"]));
    expect(result.args.verbose).toBe(1);
  });

  it("returns 1 for a single -v", () => {
    const result = expectOk(parseArgs(verboseOptions, emptyArgs, ["-v"]));
    expect(result.args.verbose).toBe(1);
  });

  it("counts repeated long flags: --verbose --verbose => 2", () => {
    const result = expectOk(parseArgs(verboseOptions, emptyArgs, ["--verbose", "--verbose"]));
    expect(result.args.verbose).toBe(2);
  });

  it("counts combined short flags: -vv => 2", () => {
    const result = expectOk(parseArgs(verboseOptions, emptyArgs, ["-vv"]));
    expect(result.args.verbose).toBe(2);
  });

  it("counts -vvv => 3", () => {
    const result = expectOk(parseArgs(verboseOptions, emptyArgs, ["-vvv"]));
    expect(result.args.verbose).toBe(3);
  });

  it("counts mixed long and short: -v --verbose => 2", () => {
    const result = expectOk(parseArgs(verboseOptions, emptyArgs, ["-v", "--verbose"]));
    expect(result.args.verbose).toBe(2);
  });

  it("counts combined short + separate short: -vv -v => 3", () => {
    const result = expectOk(parseArgs(verboseOptions, emptyArgs, ["-vv", "-v"]));
    expect(result.args.verbose).toBe(3);
  });

  it("--no-verbose resets counted flag to 0", () => {
    const result = expectOk(parseArgs(verboseOptions, emptyArgs, ["-vvv", "--no-verbose"]));
    expect(result.args.verbose).toBe(0);
  });

  it("non-counted flags still produce boolean alongside counted flags", () => {
    const result = expectOk(parseArgs(verboseOptions, emptyArgs, ["-vv", "-q"]));
    expect(result.args.verbose).toBe(2);
    expect(result.args.quiet).toBe(true);
  });

  it("mixes counted and non-counted in combined short flags", () => {
    const result = expectOk(parseArgs(verboseOptions, emptyArgs, ["-vqv"]));
    expect(result.args.verbose).toBe(2);
    expect(result.args.quiet).toBe(true);
  });
});

// ============================================================================
// Bug reproduction: -- separator should not feed positional args
// ============================================================================

describe("-- separator stops positional consumption", () => {
  it("optional single arg: checkout -- foo.txt", () => {
    const result = expectOk(
      parseArgs(emptyOptions, optionalStringArg, ["--", "foo.txt"]),
    );
    expect(result.args.file).toBeUndefined();
    expect(result.passthrough).toEqual(["foo.txt"]);
  });

  it("optional variadic arg: log -- README.md", () => {
    const result = expectOk(
      parseArgs(emptyOptions, optionalVariadicStringArgs, ["--", "README.md"]),
    );
    expect(result.args.packages).toEqual([]);
    expect(result.passthrough).toEqual(["README.md"]);
  });

  it("positional before -- stays positional, tokens after -- go to passthrough only", () => {
    const result = expectOk(
      parseArgs(emptyOptions, optionalStringArg, ["main", "--", "README.md"]),
    );
    expect(result.args.file).toBe("main");
    expect(result.passthrough).toEqual(["README.md"]);
  });

  it("variadic positional before -- stays positional, tokens after -- go to passthrough only", () => {
    const result = expectOk(
      parseArgs(emptyOptions, optionalVariadicStringArgs, ["lodash", "nanoid", "--", "README.md"]),
    );
    expect(result.args.packages).toEqual(["lodash", "nanoid"]);
    expect(result.passthrough).toEqual(["README.md"]);
  });
});

// ============================================================================
// Edge cases
// ============================================================================

describe("edge cases", () => {
  it("parses with no options and no args", () => {
    const result = expectOk(parseArgs(emptyOptions, emptyArgs, []));
    expect(result.args).toEqual({});
    expect(result.passthrough).toEqual([]);
  });

  it("errors when positionals given but none expected", () => {
    const result = expectFail(parseArgs(emptyOptions, emptyArgs, ["unexpected"]));
    expect(result.errors[0]).toMatchObject({
      type: "unexpected_positional",
      value: "unexpected",
      maxPositionals: 0,
    });
  });

  it("unknown short option reports error", () => {
    const result = expectFail(parseArgs(serveOptions, emptyArgs, ["-z"]));
    expect(result.errors[0]).toMatchObject({
      type: "unknown_option",
      name: "-z",
    });
  });

  it("unknown short flag suggests matching long option", () => {
    // Schema has a "dryRun" key (long: --dry-run, short: "n").
    // Using -d (no alias registered) should suggest --d if a "d" long option existed.
    // More realistically: a single-char key like `b: flag()` creates --b but not -b.
    const schemaWithSingleCharKey: OptionsSchema = {
      b: { _kind: "flag" },
    };
    const result = expectFail(parseArgs(schemaWithSingleCharKey, emptyArgs, ["-b"]));
    expect(result.errors[0]).toMatchObject({
      type: "unknown_option",
      name: "-b",
      suggestions: ["--b"],
    });
  });

  it("unknown short flag with no matching long option has empty suggestions", () => {
    const result = expectFail(parseArgs(serveOptions, emptyArgs, ["-z"]));
    expect(result.errors[0]).toMatchObject({
      type: "unknown_option",
      name: "-z",
      suggestions: [],
    });
  });
});
