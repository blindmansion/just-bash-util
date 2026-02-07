import { describe, it, expect } from "vitest";
import { command, o, f } from "../../src/command";
import { createTestCli, createNestedCli, createTestContext } from "./fixtures.ts";


// ============================================================================
// Tree building
// ============================================================================

describe("command tree building", () => {
  it("creates a root command with name and description", () => {
    const cli = command("mycli", { description: "My CLI" });
    expect(cli.name).toBe("mycli");
    expect(cli.description).toBe("My CLI");
  });

  it("has no parent at the root", () => {
    const cli = command("mycli", { description: "Root" });
    expect(cli.parent).toBeUndefined();
  });

  it("registers child commands", () => {
    const cli = createTestCli();
    expect(cli.children.has("ping")).toBe(true);
    expect(cli.children.has("serve")).toBe(true);
    expect(cli.children.has("db")).toBe(true);
  });

  it("sets parent on child commands", () => {
    const cli = createTestCli();
    const serve = cli.children.get("serve")!;
    expect(serve.parent).toBe(cli);
  });

  it("supports nested children", () => {
    const cli = createTestCli();
    const db = cli.children.get("db")!;
    expect(db.children.has("migrate")).toBe(true);
    expect(db.children.has("seed")).toBe(true);
  });

  it("sets grandparent chain correctly", () => {
    const cli = createTestCli();
    const migrate = cli.children.get("db")!.children.get("migrate")!;
    expect(migrate.parent?.name).toBe("db");
    expect(migrate.parent?.parent?.name).toBe("mycli");
  });
});

// ============================================================================
// fullPath
// ============================================================================

describe("fullPath", () => {
  it("returns just the name for root", () => {
    const cli = command("mycli", { description: "Root" });
    expect(cli.fullPath).toBe("mycli");
  });

  it("returns parent + child for one level deep", () => {
    const cli = createTestCli();
    const serve = cli.children.get("serve")!;
    expect(serve.fullPath).toBe("mycli serve");
  });

  it("returns full chain for deeply nested", () => {
    const root = createNestedCli();
    const upload = root.children.get("cloud")!.children.get("storage")!.children.get("upload")!;
    expect(upload.fullPath).toBe("root cloud storage upload");
  });
});

// ============================================================================
// inheritedOptions / allOptions
// ============================================================================

describe("option inheritance", () => {
  it("root has no inherited options", () => {
    const cli = createTestCli();
    expect(Object.keys(cli.inheritedOptions)).toHaveLength(0);
  });

  it("child inherits parent options", () => {
    const cli = createTestCli();
    const migrate = cli.children.get("db")!.children.get("migrate")!;
    const inherited = migrate.inheritedOptions;
    expect(inherited).toHaveProperty("connectionString");
    expect(inherited).toHaveProperty("schema");
  });

  it("allOptions merges inherited + own", () => {
    const cli = createTestCli();
    const migrate = cli.children.get("db")!.children.get("migrate")!;
    const all = migrate.allOptions;
    // Own
    expect(all).toHaveProperty("steps");
    expect(all).toHaveProperty("dryRun");
    // Inherited
    expect(all).toHaveProperty("connectionString");
    expect(all).toHaveProperty("schema");
  });

  it("deeply nested commands accumulate options from all ancestors", () => {
    const root = createNestedCli();
    const upload = root.children.get("cloud")!.children.get("storage")!.children.get("upload")!;
    const all = upload.allOptions;
    // From cloud
    expect(all).toHaveProperty("region");
    expect(all).toHaveProperty("profile");
    // From storage
    expect(all).toHaveProperty("bucket");
    // Own
    expect(all).toHaveProperty("public");
  });

  it("omitInherited removes specific inherited options", () => {
    const cli = command("root", { description: "Root" });
    const parent = cli.command("parent", {
      description: "Parent",
      options: {
        verbose: f().describe("Verbose"),
        format: o.string().default("json").describe("Output format"),
      },
    });
    const child = parent.command("child", {
      description: "Child",
      omitInherited: ["verbose"],
      handler: () => ({ stdout: "ok", stderr: "", exitCode: 0 }),
    });
    expect(child.inheritedOptions).not.toHaveProperty("verbose");
    expect(child.inheritedOptions).toHaveProperty("format");
    expect(child.allOptions).not.toHaveProperty("verbose");
    expect(child.allOptions).toHaveProperty("format");
  });

  it("omitInherited cascades to grandchildren", () => {
    const cli = command("root", { description: "Root" });
    const parent = cli.command("parent", {
      description: "Parent",
      options: {
        verbose: f().describe("Verbose"),
        format: o.string().default("json"),
      },
    });
    const child = parent.command("child", {
      description: "Child",
      omitInherited: ["verbose"],
    });
    const grandchild = child.command("grandchild", {
      description: "Grandchild",
      handler: () => ({ stdout: "ok", stderr: "", exitCode: 0 }),
    });
    // verbose was omitted at child level, so grandchild's accumulated
    // options (from child's _accOpts) no longer include it.
    // But inheritedOptions walks ancestors directly, so grandchild
    // would still see verbose from parent unless it also omits it.
    // The cascading works through _accOpts for type inference,
    // but at runtime grandchild needs its own omit if it doesn't
    // want the option.
    expect(grandchild.allOptions).not.toHaveProperty("verbose");
    expect(grandchild.allOptions).toHaveProperty("format");
  });

  it("omitInherited does not affect the command's own options", () => {
    const cli = command("root", { description: "Root" });
    const parent = cli.command("parent", {
      description: "Parent",
      options: {
        verbose: f().describe("Verbose"),
      },
    });
    const child = parent.command("child", {
      description: "Child",
      options: { verbose: f().describe("Own verbose") },
      omitInherited: ["verbose"],
      handler: () => ({ stdout: "ok", stderr: "", exitCode: 0 }),
    });
    // Own verbose should still be present even though inherited verbose is omitted
    expect(child.allOptions).toHaveProperty("verbose");
    expect(child.inheritedOptions).not.toHaveProperty("verbose");
  });
});

// ============================================================================
// execute() — subcommand routing
// ============================================================================

describe("execute() routing", () => {
  it("routes to the correct subcommand", async () => {
    const cli = createTestCli();
    const result = await cli.execute(["ping"], createTestContext());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("pong");
  });

  it("routes to nested subcommands", async () => {
    const cli = createTestCli();
    const result = await cli.execute([
      "db",
      "migrate",
      "--connection-string",
      "pg://localhost/test",
      "--steps",
      "3",
    ], createTestContext());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("[public] migrating 3 steps");
    expect(result.stdout).toContain("connected to: pg://localhost/test");
  });

  it("passes options and args to handler", async () => {
    const cli = createTestCli();
    const result = await cli.execute(["serve", "app.ts", "--port", "8080", "--open"], createTestContext());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("serving app.ts on port 8080");
    expect(result.stdout).toContain("opening browser");
  });
});

// ============================================================================
// execute() — help
// ============================================================================

describe("execute() help", () => {
  it("shows help for --help on root", async () => {
    const cli = createTestCli();
    const result = await cli.execute(["--help"], createTestContext());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("mycli - Test CLI");
    expect(result.stdout).toContain("Commands:");
  });

  it("shows help for -h on root", async () => {
    const cli = createTestCli();
    const result = await cli.execute(["-h"], createTestContext());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("mycli - Test CLI");
  });

  it("shows help when root is invoked with no args and no handler", async () => {
    const cli = createTestCli();
    const result = await cli.execute([], createTestContext());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Commands:");
  });

  it("shows help for subcommand --help", async () => {
    const cli = createTestCli();
    const result = await cli.execute(["serve", "--help"], createTestContext());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("mycli serve - Start server");
    expect(result.stdout).toContain("--port");
  });

  it("shows help for bare namespace (no handler)", async () => {
    const cli = createTestCli();
    const result = await cli.execute(["db"], createTestContext());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("migrate");
    expect(result.stdout).toContain("seed");
  });

  it("shows help for namespace --help", async () => {
    const cli = createTestCli();
    const result = await cli.execute(["db", "--help"], createTestContext());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("mycli db - Database operations");
  });
});

// ============================================================================
// execute() — errors
// ============================================================================

describe("execute() errors", () => {
  it("returns error for missing required option", async () => {
    const cli = command("test", {
      description: "Test",
      options: {
        target: o.string().required(),
      },
      handler: () => ({ stdout: "ok", stderr: "", exitCode: 0 }),
    });
    const result = await cli.execute([], createTestContext());
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Missing required option "--target"');
  });

  it("returns error for unknown subcommand with suggestion", async () => {
    const cli = createTestCli();
    const result = await cli.execute(["servve"], createTestContext());
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Unknown command");
    expect(result.stderr).toContain("serve");
  });

  it("returns error for unknown nested subcommand", async () => {
    const cli = createTestCli();
    const result = await cli.execute(["db", "migarte"], createTestContext());
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Unknown command");
    expect(result.stderr).toContain("migrate");
  });

  it("returns error for unknown option in a command", async () => {
    const cli = createTestCli();
    const result = await cli.execute(["serve", "app.ts", "--prot", "8080"], createTestContext());
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Unknown option");
  });

  it("returns error for missing option value", async () => {
    const cli = createTestCli();
    const result = await cli.execute(["serve", "app.ts", "--port"], createTestContext());
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("requires a value");
  });
});

// ============================================================================
// execute() — deeply nested with inherited options
// ============================================================================

describe("execute() with deep nesting", () => {
  it("passes inherited options to deeply nested handler", async () => {
    const root = createNestedCli();
    const result = await root.execute([
      "cloud",
      "storage",
      "upload",
      "photo.jpg",
      "images/photo.jpg",
      "-b",
      "my-bucket",
      "-r",
      "eu-west-1",
    ], createTestContext());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("[eu-west-1]");
    expect(result.stdout).toContain("s3://my-bucket/images/photo.jpg");
  });

  it("uses default inherited option values", async () => {
    const root = createNestedCli();
    const result = await root.execute([
      "cloud",
      "storage",
      "upload",
      "file.txt",
      "-b",
      "bkt",
    ], createTestContext());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("[us-east-1]"); // default region
    expect(result.stdout).toContain("s3://bkt/file.txt");
  });

  it("shows help for deeply nested bare namespace", async () => {
    const root = createNestedCli();
    const result = await root.execute(["cloud", "storage"], createTestContext());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("upload");
  });
});

// ============================================================================
// Handler return values
// ============================================================================

describe("handler return values", () => {
  it("returns handler exit code", async () => {
    const cli = command("test", {
      description: "Test",
      handler: () => ({ stdout: "", stderr: "boom", exitCode: 42 }),
    });
    const result = await cli.execute([], createTestContext());
    expect(result.exitCode).toBe(42);
    expect(result.stderr).toBe("boom");
  });

  it("supports async handlers", async () => {
    const cli = command("test", {
      description: "Test",
      handler: async () => {
        await new Promise((r) => setTimeout(r, 1));
        return { stdout: "async done", stderr: "", exitCode: 0 };
      },
    });
    const result = await cli.execute([], createTestContext());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("async done");
  });
});
