import { describe, it, expect } from "vitest";
import { command, o, f, a } from "../../src/command";
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

// ============================================================================
// execute() — error handling (thrown errors)
// ============================================================================

describe("execute() error handling", () => {
  it("catches sync errors thrown by handlers", async () => {
    const cli = command("test", {
      description: "Test",
      handler: () => {
        throw new Error("handler blew up");
      },
    });
    const result = await cli.execute([], createTestContext());
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("handler blew up");
    expect(result.stdout).toBe("");
  });

  it("catches async errors thrown by handlers", async () => {
    const cli = command("test", {
      description: "Test",
      handler: async () => {
        await new Promise((r) => setTimeout(r, 1));
        throw new Error("async failure");
      },
    });
    const result = await cli.execute([], createTestContext());
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("async failure");
  });

  it("catches non-Error thrown values", async () => {
    const cli = command("test", {
      description: "Test",
      handler: () => {
        throw "string error";
      },
    });
    const result = await cli.execute([], createTestContext());
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("string error");
  });

  it("catches errors in nested subcommand handlers", async () => {
    const root = command("root", { description: "Root" });
    root.command("sub", {
      description: "Sub",
      args: [a.string().name("file")],
      handler: () => {
        throw new Error("nested boom");
      },
    });
    const result = await root.execute(["sub", "test.txt"], createTestContext());
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("nested boom");
  });
});

// ============================================================================
// transformArgs
// ============================================================================

describe("transformArgs", () => {
  it("rewrites tokens before parsing", async () => {
    const cli = command("git", { description: "Git" });
    cli.command("log", {
      description: "Show log",
      transformArgs: (tokens) =>
        tokens.map((t) => (/^-(\d+)$/.test(t) ? `-n${t.slice(1)}` : t)),
      options: {
        maxCount: o.number().alias("n"),
      },
      handler: (args) => ({
        stdout: String(args.maxCount),
        stderr: "",
        exitCode: 0,
      }),
    });
    const result = await cli.execute(["log", "-5"], createTestContext());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("5");
  });

  it("does not affect parsing when absent", async () => {
    const cli = command("test", {
      description: "Test",
      options: { name: o.string().alias("n") },
      handler: (args) => ({
        stdout: String(args.name),
        stderr: "",
        exitCode: 0,
      }),
    });
    const result = await cli.execute(["-n", "hello"], createTestContext());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("hello");
  });

  it("receives a copy of the tokens (does not mutate originals)", async () => {
    const original = ["-5"];
    const cli = command("test", {
      description: "Test",
      transformArgs: (tokens) => {
        tokens[0] = "-n5";
        return tokens;
      },
      options: { maxCount: o.number().alias("n") },
      handler: (args) => ({
        stdout: String(args.maxCount),
        stderr: "",
        exitCode: 0,
      }),
    });
    await cli.execute(original, createTestContext());
    expect(original[0]).toBe("-5");
  });

  it("works on root commands with handlers", async () => {
    const cli = command("test", {
      description: "Test",
      transformArgs: (tokens) =>
        tokens.map((t) => (t === "+verbose" ? "--verbose" : t)),
      options: { verbose: f() },
      handler: (args) => ({
        stdout: String(args.verbose),
        stderr: "",
        exitCode: 0,
      }),
    });
    const result = await cli.execute(["+verbose"], createTestContext());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("true");
  });
});

// ============================================================================
// defaultSubcommand
// ============================================================================

describe("defaultSubcommand", () => {
  function createStashCli() {
    const git = command("git", { description: "Git" });
    const stash = git.command("stash", {
      description: "Stash changes in a dirty working directory",
      defaultSubcommand: "push",
    });
    stash.command("push", {
      description: "Save changes to the stash",
      options: {
        message: o.string().alias("m").describe("Stash message"),
        includeUntracked: f().alias("u").describe("Include untracked files"),
      },
      handler: (args) => ({
        stdout: `pushed${args.message ? `: ${args.message}` : ""}${args.includeUntracked ? " (with untracked)" : ""}`,
        stderr: "",
        exitCode: 0,
      }),
    });
    stash.command("pop", {
      description: "Remove and apply a stash entry",
      args: [a.string().name("ref").optional().describe("Stash ref")],
      handler: (args) => ({
        stdout: `popped ${args.ref ?? "stash@{0}"}`,
        stderr: "",
        exitCode: 0,
      }),
    });
    stash.command("list", {
      description: "List stash entries",
      handler: () => ({
        stdout: "stash@{0}: WIP on main",
        stderr: "",
        exitCode: 0,
      }),
    });
    return git;
  }

  it("routes bare invocation to the default subcommand", async () => {
    const git = createStashCli();
    const result = await git.execute(["stash"], createTestContext());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("pushed");
  });

  it("routes flag-only invocation to the default subcommand", async () => {
    const git = createStashCli();
    const result = await git.execute(["stash", "-m", "wip", "-u"], createTestContext());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("pushed: wip (with untracked)");
  });

  it("still routes explicit subcommand names normally", async () => {
    const git = createStashCli();
    const result = await git.execute(["stash", "pop"], createTestContext());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("popped stash@{0}");
  });

  it("still routes explicit subcommand names with args", async () => {
    const git = createStashCli();
    const result = await git.execute(["stash", "pop", "stash@{2}"], createTestContext());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("popped stash@{2}");
  });

  it("shows typo suggestions for mistyped subcommands", async () => {
    const git = createStashCli();
    const result = await git.execute(["stash", "psh"], createTestContext());
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Unknown command");
    expect(result.stderr).toContain("push");
  });

  it("shows help with (default) annotation", async () => {
    const git = createStashCli();
    const result = await git.execute(["stash", "--help"], createTestContext());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("(default)");
    expect(result.stdout).toContain("push");
    expect(result.stdout).toContain("pop");
    expect(result.stdout).toContain("list");
  });

  it("throws when combined with a handler on the child command() method", () => {
    const root = command("root", { description: "Root" });
    expect(() =>
      root.command("bad", {
        description: "Bad",
        defaultSubcommand: "sub",
        handler: () => ({ stdout: "", stderr: "", exitCode: 0 }),
      }),
    ).toThrow("cannot have both a handler and a defaultSubcommand");
  });

  it("throws when combined with a handler on the factory function", () => {
    expect(() =>
      command("bad", {
        description: "Bad",
        defaultSubcommand: "sub",
        handler: () => ({ stdout: "", stderr: "", exitCode: 0 }),
      }),
    ).toThrow("cannot have both a handler and a defaultSubcommand");
  });

  it("returns error when defaultSubcommand names a nonexistent child", async () => {
    const cli = command("test", {
      description: "Test",
      defaultSubcommand: "nonexistent",
    });
    cli.command("real", {
      description: "Real",
      handler: () => ({ stdout: "ok", stderr: "", exitCode: 0 }),
    });
    const result = await cli.execute([], createTestContext());
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('defaultSubcommand "nonexistent"');
    expect(result.stderr).toContain("real");
  });

  it("works with inherited options passed through to default subcommand", async () => {
    const cli = command("cli", { description: "CLI" });
    const remote = cli.command("remote", {
      description: "Manage remotes",
      options: {
        verbose: f().alias("v").describe("Verbose output"),
      },
      defaultSubcommand: "list",
    });
    remote.command("list", {
      description: "List remotes",
      handler: (args) => ({
        stdout: args.verbose ? "origin\thttps://github.com/..." : "origin",
        stderr: "",
        exitCode: 0,
      }),
    });
    remote.command("add", {
      description: "Add a remote",
      args: [
        a.string().name("name").describe("Remote name"),
        a.string().name("url").describe("Remote URL"),
      ],
      handler: (args) => ({
        stdout: `added ${args.name} -> ${args.url}`,
        stderr: "",
        exitCode: 0,
      }),
    });

    // Bare invocation → default "list"
    const bare = await cli.execute(["remote"], createTestContext());
    expect(bare.exitCode).toBe(0);
    expect(bare.stdout).toBe("origin");

    // Flag-only → default "list" with inherited verbose
    const verbose = await cli.execute(["remote", "-v"], createTestContext());
    expect(verbose.exitCode).toBe(0);
    expect(verbose.stdout).toContain("https://github.com/");

    // Explicit subcommand still works
    const add = await cli.execute(["remote", "add", "upstream", "https://upstream.example"], createTestContext());
    expect(add.exitCode).toBe(0);
    expect(add.stdout).toBe("added upstream -> https://upstream.example");
  });
});
