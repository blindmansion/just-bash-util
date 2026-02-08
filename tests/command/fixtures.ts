/**
 * Shared fixtures for tests.
 *
 * Provides reusable option/arg schemas (raw defs for parser tests)
 * and pre-built command trees (for command/help tests).
 */

import { o, f, a, command } from "../../src/command";
import { InMemoryFs, type CommandContext } from "just-bash";
import type { OptionsSchema, ArgsSchema } from "../../src/command/types.ts";

// ============================================================================
// Raw schemas — for parseArgs() tests (already-resolved defs)
// ============================================================================

/** A simple schema: --port <number>, --host <string>, --open (flag) */
export const serveOptions: OptionsSchema = {
  port: { _kind: "option", _type: undefined as unknown as number, type: "number", short: "p", default: 3000 },
  host: { _kind: "option", _type: undefined as unknown as string, type: "string" },
  open: { _kind: "flag", short: "o" },
};

/** A schema with a required option */
export const deployOptions: OptionsSchema = {
  target: { _kind: "option", _type: undefined as unknown as string, type: "string", short: "t", required: true },
  replicas: { _kind: "option", _type: undefined as unknown as number, type: "number", default: 1 },
  dryRun: { _kind: "flag", short: "n" },
};

/** A single required string arg */
export const singleStringArg: ArgsSchema = [
  { _kind: "arg", _type: undefined as unknown as string, type: "string", name: "entry", required: true },
];

/** An optional string arg */
export const optionalStringArg: ArgsSchema = [
  { _kind: "arg", _type: undefined as unknown as string, type: "string", name: "file", required: false },
];

/** A variadic string arg (required — at least one value needed) */
export const variadicStringArgs: ArgsSchema = [
  { _kind: "arg", _type: undefined as unknown as string[], type: "string", name: "files", required: true, variadic: true },
];

/** An optional variadic string arg (zero or more values) */
export const optionalVariadicStringArgs: ArgsSchema = [
  { _kind: "arg", _type: undefined as unknown as string[], type: "string", name: "packages", required: false, variadic: true },
];

/** Two positional args: required source, optional destination */
export const twoPositionalArgs: ArgsSchema = [
  { _kind: "arg", _type: undefined as unknown as string, type: "string", name: "source", required: true },
  { _kind: "arg", _type: undefined as unknown as string, type: "string", name: "dest", required: false },
];

/** A required number arg */
export const numberArg: ArgsSchema = [
  { _kind: "arg", _type: undefined as unknown as number, type: "number", name: "count", required: true },
];

/** Empty schemas */
export const emptyOptions: OptionsSchema = {};
export const emptyArgs: ArgsSchema = [];

// ============================================================================
// Command tree factories — for command/help tests
// ============================================================================

/**
 * Creates a minimal CLI tree:
 *
 *   mycli
 *   ├── ping       (no options, no args)
 *   ├── serve      (options + args + handler)
 *   └── db         (group with inherited options)
 *       ├── migrate (own options + inherited)
 *       └── seed    (own arg + inherited)
 */
export function createTestCli() {
  const cli = command("mycli", {
    description: "Test CLI",
  });

  cli.command("ping", {
    description: "Health check",
    handler: () => ({ stdout: "pong", stderr: "", exitCode: 0 }),
  });

  cli.command("serve", {
    description: "Start server",
    options: {
      port: o.number().default(3000).alias("p").describe("Port"),
      host: o.string().describe("Host"),
      open: f().alias("o").describe("Open browser"),
    },
    args: [a.string().name("entry").describe("Entry file")],
    examples: ["mycli serve index.ts", "mycli serve index.ts -p 8080"],
    handler: (args, ctx) => {
      const lines = [`serving ${args.entry} on port ${args.port}`];
      if (args.open) lines.push("opening browser");
      return { stdout: lines.join("\n"), stderr: "", exitCode: 0 };
    },
  });

  const db = cli.command("db", {
    description: "Database operations",
    options: {
      connectionString: o.string().describe("Connection URL"),
      schema: o.string().default("public").describe("Schema"),
    },
  });

  db.command("migrate", {
    description: "Run migrations",
    options: {
      steps: o.number().default(0).describe("Migration steps"),
      dryRun: f().alias("n").describe("Dry run"),
    },
    handler: (args) => {
      const lines = [`[${args.schema}] migrating ${args.steps || "all"} steps`];
      if (args.connectionString) lines.push(`connected to: ${args.connectionString}`);
      if (args.dryRun) lines.push("(dry run)");
      return { stdout: lines.join("\n"), stderr: "", exitCode: 0 };
    },
  });

  db.command("seed", {
    description: "Seed database",
    args: [a.string().name("seedFile").optional().describe("Seed file path")],
    handler: (args) => ({
      stdout: `seeding from ${args.seedFile ?? "defaults"}`,
      stderr: "",
      exitCode: 0,
    }),
  });

  return cli;
}

/**
 * Creates a deeply nested tree for inheritance tests:
 *
 *   root
 *   └── cloud (--region, --profile)
 *       └── storage (--bucket required)
 *           └── upload (--public flag, <source> <dest?> args)
 */
export function createNestedCli() {
  const root = command("root", { description: "Root" });

  const cloud = root.command("cloud", {
    description: "Cloud ops",
    options: {
      region: o.string().default("us-east-1").alias("r").describe("Region"),
      profile: o.string().describe("Profile"),
    },
  });

  const storage = cloud.command("storage", {
    description: "Storage ops",
    options: {
      bucket: o.string().required().alias("b").describe("Bucket"),
    },
  });

  storage.command("upload", {
    description: "Upload files",
    options: {
      public: f().describe("Public access"),
    },
    args: [
      a.string().name("source").describe("Local path"),
      a.string().name("destination").optional().describe("Remote path"),
    ],
    handler: (args) => ({
      stdout: `[${args.region}] upload ${args.source} -> s3://${args.bucket}/${args.destination ?? args.source}`,
      stderr: "",
      exitCode: 0,
    }),
  });

  return root;
}

export function createTestContext(): CommandContext {
  return {
    env: new Map(),
    cwd: process.cwd(),
    fs: new InMemoryFs(),
    stdin: "",
  };
}