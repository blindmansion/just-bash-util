import { describe, it, expect } from "vitest";
import { command, o, f, a } from "../../src/command";
import { createTestCli, createNestedCli, createTestContext } from "./fixtures.ts";

// ============================================================================
// toTokens()
// ============================================================================

describe("toTokens()", () => {
  it("serializes options as --kebab-case value pairs", () => {
    const cli = createTestCli();
    const serve = cli.children.get("serve")!;
    const tokens = serve.toTokens({ port: 8080, host: "localhost" });
    expect(tokens).toContain("--port");
    expect(tokens).toContain("8080");
    expect(tokens).toContain("--host");
    expect(tokens).toContain("localhost");
  });

  it("converts camelCase keys to kebab-case", () => {
    const cli = createTestCli();
    const db = cli.children.get("db")!;
    const migrate = db.children.get("migrate")!;
    const tokens = migrate.toTokens({ connectionString: "pg://localhost/test" });
    expect(tokens).toContain("--connection-string");
    expect(tokens).not.toContain("--connectionString");
  });

  it("serializes true flags as --name", () => {
    const cli = createTestCli();
    const serve = cli.children.get("serve")!;
    const tokens = serve.toTokens({ open: true });
    expect(tokens).toContain("--open");
  });

  it("omits false flags when default is false", () => {
    const cli = createTestCli();
    const serve = cli.children.get("serve")!;
    const tokens = serve.toTokens({ open: false });
    expect(tokens).not.toContain("--open");
    expect(tokens).not.toContain("--no-open");
  });

  it("emits --no-name for false when default is true", () => {
    const cli = command("test", {
      description: "Test",
      options: {
        verbose: f().default(true),
      },
      handler: () => ({ stdout: "", stderr: "", exitCode: 0 }),
    });
    const tokens = cli.toTokens({ verbose: false });
    expect(tokens).toContain("--no-verbose");
  });

  it("serializes positional args in schema order", () => {
    const cli = command("cp", {
      description: "Copy",
      args: [
        a.string().name("source"),
        a.string().name("dest"),
      ],
      handler: () => ({ stdout: "", stderr: "", exitCode: 0 }),
    });
    const tokens = cli.toTokens({ source: "a.txt", dest: "b.txt" });
    expect(tokens).toEqual(["a.txt", "b.txt"]);
  });

  it("spreads variadic args", () => {
    const cli = command("rm", {
      description: "Remove",
      args: [a.string().name("files").variadic()],
      handler: () => ({ stdout: "", stderr: "", exitCode: 0 }),
    });
    const tokens = cli.toTokens({ files: ["a.txt", "b.txt", "c.txt"] });
    expect(tokens).toEqual(["a.txt", "b.txt", "c.txt"]);
  });

  it("omits undefined values", () => {
    const cli = createTestCli();
    const serve = cli.children.get("serve")!;
    const tokens = serve.toTokens({ port: 8080 });
    expect(tokens).toContain("--port");
    expect(tokens).not.toContain("--host");
    expect(tokens).not.toContain("undefined");
  });

  it("places options before positional args", () => {
    const cli = createTestCli();
    const serve = cli.children.get("serve")!;
    const tokens = serve.toTokens({ port: 8080, entry: "app.ts" });
    const portIdx = tokens.indexOf("--port");
    const entryIdx = tokens.indexOf("app.ts");
    expect(portIdx).toBeLessThan(entryIdx);
  });

  it("includes inherited options for nested commands", () => {
    const root = createNestedCli();
    const upload = root.children.get("cloud")!.children.get("storage")!.children.get("upload")!;
    const tokens = upload.toTokens({
      region: "eu-west-1",
      bucket: "my-bucket",
      source: "photo.jpg",
    });
    expect(tokens).toContain("--region");
    expect(tokens).toContain("eu-west-1");
    expect(tokens).toContain("--bucket");
    expect(tokens).toContain("my-bucket");
    expect(tokens).toContain("photo.jpg");
  });

  it("stringifies number values", () => {
    const cli = createTestCli();
    const serve = cli.children.get("serve")!;
    const tokens = serve.toTokens({ port: 3000 });
    expect(tokens).toEqual(["--port", "3000"]);
  });

  it("returns empty array when no args provided", () => {
    const cli = createTestCli();
    const serve = cli.children.get("serve")!;
    const tokens = serve.toTokens({});
    expect(tokens).toEqual([]);
  });
});

// ============================================================================
// toTokens() → execute() round-trip
// ============================================================================

describe("toTokens → execute round-trip", () => {
  it("round-trips a simple command", async () => {
    const cli = createTestCli();
    const serve = cli.children.get("serve")!;
    const tokens = serve.toTokens({ port: 8080, entry: "app.ts", open: true });
    const result = await cli.execute(["serve", ...tokens], createTestContext());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("serving app.ts on port 8080");
    expect(result.stdout).toContain("opening browser");
  });

  it("round-trips a nested command with inherited options", async () => {
    const root = createNestedCli();
    const upload = root.children.get("cloud")!.children.get("storage")!.children.get("upload")!;
    const tokens = upload.toTokens({
      region: "eu-west-1",
      bucket: "my-bucket",
      source: "photo.jpg",
      destination: "images/photo.jpg",
    });
    const result = await root.execute(["cloud", "storage", "upload", ...tokens], createTestContext());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("[eu-west-1]");
    expect(result.stdout).toContain("s3://my-bucket/images/photo.jpg");
  });

  it("round-trips with defaults omitted", async () => {
    const cli = createTestCli();
    const serve = cli.children.get("serve")!;
    // Omit port — parser will apply default 3000
    const tokens = serve.toTokens({ entry: "index.ts" });
    const result = await cli.execute(["serve", ...tokens], createTestContext());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("serving index.ts on port 3000");
  });
});

// ============================================================================
// invoke()
// ============================================================================

describe("invoke()", () => {
  it("calls the handler with provided args", async () => {
    const cli = createTestCli();
    const serve = cli.children.get("serve")!;
    const result = await serve.invoke(
      { port: 9090, entry: "main.ts", open: true },
      createTestContext(),
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("serving main.ts on port 9090");
    expect(result.stdout).toContain("opening browser");
  });

  it("applies option defaults for omitted keys", async () => {
    const cli = createTestCli();
    const serve = cli.children.get("serve")!;
    const result = await serve.invoke({ entry: "app.ts" }, createTestContext());
    expect(result.exitCode).toBe(0);
    // port defaults to 3000, open defaults to false
    expect(result.stdout).toContain("serving app.ts on port 3000");
    expect(result.stdout).not.toContain("opening browser");
  });

  it("applies flag default of false", async () => {
    const cli = createTestCli();
    const db = cli.children.get("db")!;
    const migrate = db.children.get("migrate")!;
    const result = await migrate.invoke(
      { connectionString: "pg://localhost/test", steps: 5 },
      createTestContext(),
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("(dry run)");
  });

  it("applies inherited option defaults for nested commands", async () => {
    const root = createNestedCli();
    const upload = root.children.get("cloud")!.children.get("storage")!.children.get("upload")!;
    const result = await upload.invoke(
      { bucket: "my-bucket", source: "file.txt" },
      createTestContext(),
    );
    expect(result.exitCode).toBe(0);
    // region defaults to us-east-1
    expect(result.stdout).toContain("[us-east-1]");
    expect(result.stdout).toContain("s3://my-bucket/file.txt");
  });

  it("returns error for missing required option", async () => {
    const root = createNestedCli();
    const upload = root.children.get("cloud")!.children.get("storage")!.children.get("upload")!;
    // bucket is required
    const result = await upload.invoke(
      { source: "file.txt" },
      createTestContext(),
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Missing required option "bucket"');
  });

  it("returns error for missing required arg", async () => {
    const cli = createTestCli();
    const serve = cli.children.get("serve")!;
    // entry is required
    const result = await serve.invoke({ port: 3000 }, createTestContext());
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Missing required arg "entry"');
  });

  it("returns error for commands with no handler", async () => {
    const cli = createTestCli();
    const db = cli.children.get("db")!;
    const result = await db.invoke({}, createTestContext());
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("has no handler");
  });

  it("supports async handlers", async () => {
    const cli = command("test", {
      description: "Test",
      handler: async () => {
        await new Promise((r) => setTimeout(r, 1));
        return { stdout: "async done", stderr: "", exitCode: 0 };
      },
    });
    const result = await cli.invoke({}, createTestContext());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("async done");
  });

  it("applies arg defaults", async () => {
    const cli = command("greet", {
      description: "Greet",
      args: [a.string().name("name").default("world")],
      handler: (args) => ({
        stdout: `hello ${args.name}`,
        stderr: "",
        exitCode: 0,
      }),
    });
    const result = await cli.invoke({}, createTestContext());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("hello world");
  });
});

// ============================================================================
// invoke() ↔ execute() equivalence
// ============================================================================

describe("invoke/execute equivalence", () => {
  it("invoke produces the same result as execute for equivalent args", async () => {
    const cli = createTestCli();
    const serve = cli.children.get("serve")!;
    const ctx = createTestContext();

    const invokeResult = await serve.invoke(
      { port: 4000, entry: "index.ts", open: true },
      ctx,
    );
    const executeResult = await cli.execute(
      ["serve", "--port", "4000", "--open", "index.ts"],
      ctx,
    );

    expect(invokeResult.exitCode).toBe(executeResult.exitCode);
    expect(invokeResult.stdout).toBe(executeResult.stdout);
    expect(invokeResult.stderr).toBe(executeResult.stderr);
  });

  it("invoke matches execute for nested commands with inherited options", async () => {
    const root = createNestedCli();
    const upload = root.children.get("cloud")!.children.get("storage")!.children.get("upload")!;
    const ctx = createTestContext();

    const invokeResult = await upload.invoke(
      { region: "eu-west-1", bucket: "bkt", source: "a.jpg", destination: "b.jpg", public: true },
      ctx,
    );
    const executeResult = await root.execute(
      ["cloud", "storage", "upload", "-r", "eu-west-1", "-b", "bkt", "--public", "a.jpg", "b.jpg"],
      ctx,
    );

    expect(invokeResult.exitCode).toBe(executeResult.exitCode);
    expect(invokeResult.stdout).toBe(executeResult.stdout);
  });
});
