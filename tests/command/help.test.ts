import { describe, it, expect } from "vitest";
import { generateHelp } from "../../src/command";
import { createTestCli, createNestedCli } from "./fixtures.ts";

// ============================================================================
// Helpers
// ============================================================================

/** Get a child command by path segments (e.g. ["db", "migrate"]) */
function resolve(root: any, ...path: string[]) {
  let cmd = root;
  for (const seg of path) {
    cmd = cmd.children.get(seg);
    if (!cmd) throw new Error(`No child "${seg}"`);
  }
  return cmd;
}

// ============================================================================
// Root help
// ============================================================================

describe("root help", () => {
  it("includes the program name and description", () => {
    const cli = createTestCli();
    const help = generateHelp(cli);
    expect(help).toContain("mycli - Test CLI");
  });

  it("includes a usage line", () => {
    const help = generateHelp(createTestCli());
    expect(help).toContain("Usage:");
    expect(help).toContain("mycli <command>");
  });

  it("lists subcommands", () => {
    const help = generateHelp(createTestCli());
    expect(help).toContain("Commands:");
    expect(help).toContain("ping");
    expect(help).toContain("serve");
    expect(help).toContain("db");
  });
});

// ============================================================================
// Leaf command help
// ============================================================================

describe("leaf command help", () => {
  it("shows command description", () => {
    const cli = createTestCli();
    const serve = resolve(cli, "serve");
    const help = generateHelp(serve);
    expect(help).toContain("mycli serve - Start server");
  });

  it("shows options section", () => {
    const serve = resolve(createTestCli(), "serve");
    const help = generateHelp(serve);
    expect(help).toContain("Options:");
    expect(help).toContain("--port");
    expect(help).toContain("--host");
    expect(help).toContain("--open");
  });

  it("shows short aliases in options", () => {
    const serve = resolve(createTestCli(), "serve");
    const help = generateHelp(serve);
    expect(help).toContain("-p,");
    expect(help).toContain("-o,");
  });

  it("shows arguments section", () => {
    const serve = resolve(createTestCli(), "serve");
    const help = generateHelp(serve);
    expect(help).toContain("Arguments:");
    expect(help).toContain("entry");
  });

  it("shows examples", () => {
    const serve = resolve(createTestCli(), "serve");
    const help = generateHelp(serve);
    expect(help).toContain("Examples:");
    expect(help).toContain("mycli serve index.ts");
    expect(help).toContain("mycli serve index.ts -p 8080");
  });

  it("shows usage line with [options] and <arg>", () => {
    const serve = resolve(createTestCli(), "serve");
    const help = generateHelp(serve);
    expect(help).toMatch(/mycli serve \[options\] <entry>/);
  });
});

// ============================================================================
// Minimal command (no options, no args)
// ============================================================================

describe("minimal command help", () => {
  it("shows help without options or arguments sections", () => {
    const ping = resolve(createTestCli(), "ping");
    const help = generateHelp(ping);
    expect(help).toContain("mycli ping - Health check");
    expect(help).not.toContain("Options:");
    expect(help).not.toContain("Arguments:");
  });
});

// ============================================================================
// Group (namespace) help
// ============================================================================

describe("group command help", () => {
  it("lists subcommands of the group", () => {
    const db = resolve(createTestCli(), "db");
    const help = generateHelp(db);
    expect(help).toContain("Commands:");
    expect(help).toContain("migrate");
    expect(help).toContain("seed");
  });

  it("shows the group's own options", () => {
    const db = resolve(createTestCli(), "db");
    const help = generateHelp(db);
    expect(help).toContain("--connection-string");
    expect(help).toContain("--schema");
  });

  it("shows usage with <command> and [options]", () => {
    const db = resolve(createTestCli(), "db");
    const help = generateHelp(db);
    expect(help).toMatch(/mycli db <command> \[options\]/);
  });
});

// ============================================================================
// Inherited options
// ============================================================================

describe("inherited options in help", () => {
  it("shows inherited options separately for nested commands", () => {
    const migrate = resolve(createTestCli(), "db", "migrate");
    const help = generateHelp(migrate);
    expect(help).toContain("Inherited Options:");
    expect(help).toContain("--connection-string");
    expect(help).toContain("--schema");
  });

  it("shows own options in the Options section", () => {
    const migrate = resolve(createTestCli(), "db", "migrate");
    const help = generateHelp(migrate);
    expect(help).toContain("Options:");
    expect(help).toContain("--steps");
    expect(help).toContain("--dry-run");
  });

  it("shows deeply inherited options", () => {
    const upload = resolve(createNestedCli(), "cloud", "storage", "upload");
    const help = generateHelp(upload);
    // From cloud ancestor
    expect(help).toContain("--region");
    expect(help).toContain("--profile");
    // From storage ancestor
    expect(help).toContain("--bucket");
  });
});

// ============================================================================
// Full path
// ============================================================================

describe("full path in help", () => {
  it("shows full command path for nested commands", () => {
    const migrate = resolve(createTestCli(), "db", "migrate");
    const help = generateHelp(migrate);
    expect(help).toContain("mycli db migrate");
  });

  it("shows deeply nested path", () => {
    const upload = resolve(createNestedCli(), "cloud", "storage", "upload");
    const help = generateHelp(upload);
    expect(help).toContain("root cloud storage upload");
  });
});

// ============================================================================
// Optional and variadic args in usage
// ============================================================================

describe("arg display in help", () => {
  it("shows optional arg in brackets", () => {
    const seed = resolve(createTestCli(), "db", "seed");
    const help = generateHelp(seed);
    expect(help).toContain("[seedFile]");
  });

  it("shows required arg in angle brackets", () => {
    const serve = resolve(createTestCli(), "serve");
    const help = generateHelp(serve);
    expect(help).toContain("<entry>");
  });
});

// ============================================================================
// Default values in help
// ============================================================================

describe("defaults in help", () => {
  it("shows default values for options", () => {
    const serve = resolve(createTestCli(), "serve");
    const help = generateHelp(serve);
    expect(help).toContain("(default: 3000)");
  });

  it("shows default values for group options", () => {
    const db = resolve(createTestCli(), "db");
    const help = generateHelp(db);
    expect(help).toContain('(default: "public")');
  });
});
