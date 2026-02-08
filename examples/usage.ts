import { o, f, a, command } from "../src/command/index.ts";
import type { Infer } from "../src/command/index.ts";
import type { CommandContext } from "../src/command/types.ts";
import { InMemoryFs } from "just-bash";

// ============================================================================
// Root command — this IS the program
// ============================================================================

const cli = command("mycli", {
  description: "A fictional CLI to demonstrate the v3 API",
});

// ============================================================================
// 1. Simple command with options, flags, and a positional arg
// ============================================================================

const serve = cli.command("serve", {
  description: "Start the development server",
  options: {
    port: o.number().default(3000).alias("p").describe("Port to listen on"),
    host: o.string().describe("Host to bind to"),
    open: f().alias("o").describe("Open browser automatically"),
  },
  args: [
    a.string().name("entry").describe("Entry file to serve"),
  ],
  examples: [
    "mycli serve index.ts",
    "mycli serve index.ts -p 8080 --open",
  ],
  handler: (args, ctx) => {
    // Hover over `args` to see:
    // {
    //   port: number
    //   host: string | undefined
    //   open: boolean
    //   entry: string
    // }
    const lines: string[] = [];
    lines.push(`Serving ${args.entry} on ${args.host ?? "localhost"}:${args.port}`);
    if (args.open) lines.push("Opening browser...");
    return { stdout: lines.join("\n"), stderr: "", exitCode: 0 };
  },
});

// ============================================================================
// Type inference — extract the handler args type from any command
// ============================================================================

// You can use Infer<typeof cmd> to extract the type externally, without
// needing to be inside the handler. Useful for helper functions, tests, etc.
type ServeArgs = Infer<typeof serve>;
//   ^? { port: number; host: string | undefined; open: boolean; entry: string }

// ============================================================================
// 2. Command with a required option
// ============================================================================

cli.command("deploy", {
  description: "Deploy the application",
  options: {
    target: o.string().required().alias("t").describe("Deployment target"),
    replicas: o.number().default(1).describe("Number of replicas"),
    dryRun: f().alias("n").describe("Preview without executing"),
  },
  handler: (args) => {
    // Hover over `args`:
    // {
    //   target: string
    //   replicas: number
    //   dryRun: boolean
    // }
    const lines = [`Deploying to ${args.target} with ${args.replicas} replica(s)`];
    if (args.dryRun) lines.push("(dry run)");
    return { stdout: lines.join("\n"), stderr: "", exitCode: 0 };
  },
});

// ============================================================================
// 3. Optional and variadic positional args
// ============================================================================

cli.command("rm", {
  description: "Remove files",
  options: {
    force: f().alias("f").describe("Force removal"),
    recursive: f().alias("r").describe("Remove directories recursively"),
  },
  args: [
    a.string().name("files").variadic().describe("Files to remove"),
  ],
  handler: (args) => {
    // Hover over `args`:
    // {
    //   force: boolean
    //   recursive: boolean
    //   files: string[]
    // }
    const flags = [args.recursive && "-r", args.force && "-f"].filter(Boolean).join(" ");
    return { stdout: `rm ${flags} ${args.files.join(" ")}`, stderr: "", exitCode: 0 };
  },
});

// ============================================================================
// 4. Group with inherited options — the key feature
//
//    db.command() merges the parent's options into the handler type.
//    No separate "group" concept needed.
// ============================================================================

const db = cli.command("db", {
  description: "Database operations",
  options: {
    connectionString: o.string().env("DATABASE_URL").describe("Database connection URL"),
    schema: o.string().default("public").describe("Database schema"),
  },
});

db.command("migrate", {
  description: "Run pending migrations",
  options: {
    steps: o.number().default(0).describe("Number of migrations (0 = all)"),
    dryRun: f().alias("n").describe("Preview SQL without executing"),
  },
  examples: [
    "mycli db migrate",
    "mycli db migrate --steps 3 --dry-run",
    "mycli db migrate --connection-string postgres://localhost/mydb",
  ],
  handler: (args) => {
    // Hover over `args`:
    // {
    //   connectionString: string | undefined  ← inherited from db
    //   schema: string                        ← inherited from db
    //   steps: number                         ← own option
    //   dryRun: boolean                       ← own flag
    // }
    const lines: string[] = [];
    if (args.connectionString) lines.push(`Connected to: ${args.connectionString}`);
    lines.push(`[${args.schema}] Migrating ${args.steps || "all"} steps`);
    if (args.dryRun) lines.push("(dry run)");
    return { stdout: lines.join("\n"), stderr: "", exitCode: 0 };
  },
});

db.command("seed", {
  description: "Seed the database with test data",
  args: [
    a.string().name("seedFile").optional().describe("Path to seed file"),
  ],
  handler: (args) => {
    // Hover over `args`:
    // {
    //   connectionString: string | undefined  ← inherited from db
    //   schema: string                        ← inherited from db
    //   seedFile: string | undefined          ← own arg
    // }
    return {
      stdout: `Seeding ${args.connectionString ?? "default db"} from ${args.seedFile ?? "default seeds"}`,
      stderr: "",
      exitCode: 0,
    };
  },
});

// ============================================================================
// 5. Deeply nested commands — options accumulate through the chain
// ============================================================================

const cloud = cli.command("cloud", {
  description: "Cloud infrastructure management",
  options: {
    region: o.string().default("us-east-1").alias("r").describe("Cloud region"),
    profile: o.string().describe("Named credential profile"),
  },
});

const storage = cloud.command("storage", {
  description: "Object storage operations",
  options: {
    bucket: o.string().required().alias("b").describe("Bucket name"),
  },
});

storage.command("upload", {
  description: "Upload files to cloud storage",
  options: {
    public: f().describe("Make the object publicly readable"),
  },
  args: [
    a.string().name("source").describe("Local file path"),
    a.string().name("destination").optional().describe("Remote key/path"),
  ],
  examples: [
    "mycli cloud storage upload photo.jpg images/ -b my-bucket",
    "mycli cloud storage upload index.html --public -b site -r eu-west-1",
  ],
  handler: (args) => {
    // Hover over `args`:
    // {
    //   region: string              ← from cloud
    //   profile: string | undefined ← from cloud
    //   bucket: string              ← from storage
    //   public: boolean             ← own flag
    //   source: string              ← own arg
    //   destination: string | undefined ← own arg
    // }
    const dest = args.destination ?? args.source;
    const lines = [`[${args.region}] Uploading ${args.source} → s3://${args.bucket}/${dest}`];
    if (args.public) lines.push("(public)");
    if (args.profile) lines.push(`Using profile: ${args.profile}`);
    return { stdout: lines.join("\n"), stderr: "", exitCode: 0 };
  },
});

storage.command("list", {
  description: "List objects in a bucket",
  options: {
    prefix: o.string().describe("Filter by key prefix"),
    limit: o.number().default(100).describe("Max results"),
  },
  handler: (args) => {
    // Hover over `args`:
    // {
    //   region: string
    //   profile: string | undefined
    //   bucket: string
    //   prefix: string | undefined
    //   limit: number
    // }
    return {
      stdout: `[${args.region}] Listing s3://${args.bucket}/${args.prefix ?? ""}  (limit: ${args.limit})`,
      stderr: "",
      exitCode: 0,
    };
  },
});

// ============================================================================
// 6. Minimal command (no options, no args)
// ============================================================================

cli.command("ping", {
  description: "Check if the server is reachable",
  handler: () => ({ stdout: "pong", stderr: "", exitCode: 0 }),
});

// ============================================================================
// 7. Programmatic invocation — invoke() with typed args
//
//    Hover over `serve.invoke(...)` to see the typed signature.
//    Required options/args are mandatory; defaulted/optional ones are optional.
// ============================================================================

async function invokeExample(ctx: CommandContext) {
  // Hover over invoke() — args are fully typed:
  //   { entry: string; port?: number; host?: string; open?: boolean }
  const result = await serve.invoke(
    { entry: "app.ts", port: 8080 },
    ctx,
  );
  return result;
}

// ============================================================================
// Run examples
// ============================================================================

/** Simulated environment for demonstrating env fallbacks */
const simulatedEnv: Record<string, string> = {
  DATABASE_URL: "postgres://localhost/demo",
};

const ctx: CommandContext = {
  env: new Map(Object.entries(simulatedEnv)),
  cwd: process.cwd(),
  fs: new InMemoryFs(),
  stdin: "",
};

async function run(argv: string[]) {
  const display = argv.length > 0 ? argv.join(" ") : "(no args)";
  console.log(`\n$ mycli ${display}`);
  console.log("─".repeat(50));
  const result = await cli.execute(argv, ctx);
  if (result.stdout) console.log(result.stdout);
  if (result.stderr) console.log(`[error] ${result.stderr}`);
}

// --- Successful commands ---
await run(["serve", "index.ts", "--port", "8080", "--open"]);
await run(["deploy", "--target", "production", "--replicas", "3", "-n"]);
await run(["rm", "-rf", "dist", "tmp", ".cache"]);
await run(["ping"]);

// --- Inherited options flow through ---
await run(["db", "migrate", "--connection-string", "postgres://localhost/mydb", "--steps", "3"]);
await run(["db", "seed", "--connection-string", "postgres://localhost/mydb", "data/seed.sql"]);

// --- Env var fallback (DATABASE_URL is set in simulated env) ---
await run(["db", "migrate", "--steps", "1"]);            // connectionString resolved from DATABASE_URL
await run(["db", "seed"]);                                // same — no --connection-string needed

// --- Deeply nested with accumulated options ---
await run(["cloud", "storage", "upload", "photo.jpg", "images/photo.jpg", "-b", "my-bucket", "-r", "eu-west-1"]);
await run(["cloud", "storage", "list", "-b", "my-bucket", "--prefix", "images/", "--limit", "10"]);

// --- Passthrough ---
await run(["serve", "index.ts", "--", "--inspect", "--watch"]);

// --- Help: various contexts ---
await run([]);                                          // root help (no args)
await run(["--help"]);                                  // root help (flag)
await run(["serve", "--help"]);                         // command help
await run(["db"]);                                      // bare namespace → help
await run(["db", "--help"]);                            // namespace help (explicit)
await run(["db", "migrate", "--help"]);                 // subcommand help (shows inherited opts)
await run(["cloud", "storage"]);                        // nested namespace → help
await run(["cloud", "storage", "upload", "--help"]);    // deeply nested command help

// --- Errors ---
await run(["deploy"]);                                  // missing required --target
await run(["serve", "--prot", "8080"]);                 // typo → suggestion
await run(["bild"]);                                    // unknown command → suggestion
await run(["db", "migarte"]);                           // unknown subcommand → suggestion
await run(["serve", "--port"]);                         // missing option value
