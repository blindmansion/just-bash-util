# just-bash-util

[![npm](https://img.shields.io/npm/v/just-bash-util)](https://www.npmjs.com/package/just-bash-util)
[![GitHub](https://img.shields.io/github/license/blindmansion/just-bash-util)](https://github.com/blindmansion/just-bash-util)

CLI command framework, config file discovery, and path utilities for [just-bash](https://www.npmjs.com/package/just-bash).

## Install

```bash
npm install just-bash-util just-bash
```

## Modules

### `just-bash-util/command` — CLI framework

Type-safe command trees with fluent builders, inherited options, auto-generated help, and typo suggestions.

```ts
import { Bash } from "just-bash";
import { command, o, f, a } from "just-bash-util/command";

const cli = command("mycli", {
  description: "My CLI tool",
});

const serve = cli.command("serve", {
  description: "Start the dev server",
  options: {
    port: o.number().default(3000).alias("p").describe("Port to listen on"),
    host: o.string().describe("Host to bind to"),
    open: f().alias("o").describe("Open browser"),
  },
  args: [a.string().name("entry").describe("Entry file")],
  handler: (args, ctx) => {
    // args is fully typed: { port: number; host: string | undefined; open: boolean; entry: string }
    return { stdout: `Listening on :${args.port}`, stderr: "", exitCode: 0 };
  },
});

const bash = new Bash({ customCommands: [cli.toCommand()] });
await bash.exec("mycli serve app.ts -p 8080");
```

Commands can also be executed directly without just-bash:

```ts
import type { Infer } from "just-bash-util/command";

// Extract handler args type externally (like z.infer)
type ServeArgs = Infer<typeof serve>;

// Execute from CLI tokens
await cli.execute(["serve", "app.ts", "-p", "8080"], ctx);

// Or invoke programmatically with typed args
await serve.invoke({ port: 8080, entry: "app.ts" }, ctx);
```

**Features:**

- Subcommand nesting with automatic option inheritance
- `omitInherited` to exclude parent options from specific subcommands
- `--help` / `-h` auto-generated at every level
- `--no-<flag>` negation, `-abc` combined short flags, `--key=value` syntax, counted flags (`-vvv` → 3)
- `--` end-of-options separator (remaining tokens go to `meta.passthrough` without consuming positional args)
- Environment variable fallbacks for options
- Levenshtein-based "did you mean?" suggestions for typos
- `transformArgs` callback to rewrite tokens before parsing — support non-standard shorthand syntax like `-5` → `-n 5`
- `defaultSubcommand` to name a child as the fallback for bare invocations — supports "dual mode" commands like `git stash` / `git remote`
- Automatic error handling — thrown errors in handlers are caught and returned as clean `ExecResult` with `exitCode: 1`

#### Options and flags

Option keys are written in camelCase and automatically converted to kebab-case for the CLI:

```ts
options: {
  allowEmpty: f(),           // CLI: --allow-empty    handler: args.allowEmpty
  dryRun: f().alias("n"),    // CLI: --dry-run / -n   handler: args.dryRun
  message: o.string().alias("m"), // CLI: --message / -m  handler: args.message
}
```

Flags support counting mode via `.count()`. Repeated occurrences produce a number instead of a boolean — useful for verbosity levels (`-v`, `-vv`, `-vvv`):

```ts
options: {
  verbose: f().alias("v").count().describe("Verbosity level"),
}
// -v → 1, -vv → 2, -vvv → 3, absent → 0
// handler receives args.verbose as number
```

Short flags (single-dash, single-character) require `.alias()`. A single-character key like `b: f()` creates the long flag `--b`, **not** the short flag `-b`. To get `-b`, use a descriptive key with an alias:

```ts
// ✗ b: f()                    → creates --b (long flag), not -b
// ✓ branch: f().alias("b")   → creates --branch and -b
```

#### Positional args

Args are required by default. Use `.optional()` for optional args, and `.variadic()` to collect remaining positionals into an array. Chain `.optional().variadic()` for zero-or-more:

```ts
args: [
  a.string().name("entry"),                         // required single arg
  a.string().name("file").optional(),               // optional single arg
  a.string().name("files").variadic(),              // required: one or more
  a.string().name("paths").optional().variadic(),   // optional: zero or more → string[]
]
```

#### The `--` separator

The `--` token stops all parsing. Tokens after `--` go exclusively into `meta.passthrough` — they are **not** consumed as positional args or parsed as flags. Positional args must appear before `--`:

```ts
// mycli checkout main -- README.md
handler: (args, ctx, meta) => {
  args.target;          // "main" (positional arg before --)
  meta.passthrough;     // ["README.md"] (tokens after --)
}

// mycli checkout -- README.md
handler: (args, ctx, meta) => {
  args.target;          // undefined (no positional before --)
  meta.passthrough;     // ["README.md"]
}
```

#### Token rewriting with `transformArgs`

Commands can define a `transformArgs` callback to rewrite the raw token array before it reaches the parser. This is useful for supporting non-standard shorthand syntax that the parser wouldn't otherwise understand:

```ts
cli.command("log", {
  description: "Show commit log",
  transformArgs: (tokens) =>
    tokens.map((t) => (/^-(\d+)$/.test(t) ? `-n${t.slice(1)}` : t)),
  options: {
    maxCount: o.number().alias("n").describe("Limit output to n commits"),
  },
  handler: (args) => {
    // git log -5  →  tokens rewritten to -n5  →  args.maxCount === 5
    return { stdout: `showing ${args.maxCount} commits`, stderr: "", exitCode: 0 };
  },
});
```

The callback receives a mutable copy of the tokens and returns the rewritten array. It runs only in `execute()` (token-based invocation) — `invoke()` takes typed args directly, so there's nothing to transform.

#### Default subcommand

Commands with a "dual mode" pattern (e.g. `git stash` implicitly pushes, `git remote` lists remotes) can name a child as the fallback for bare invocations. Explicit subcommands still route normally, and typos still get "did you mean?" suggestions:

```ts
const stash = cli.command("stash", {
  description: "Stash changes",
  defaultSubcommand: "push",  // bare "stash" or "stash -m wip" → routes to push
});
stash.command("push", { /* options, handler */ });
stash.command("pop", { /* args, handler */ });
```

`defaultSubcommand` and `handler` are mutually exclusive.

### `just-bash-util/config` — Config file discovery

Cosmiconfig-style config search that walks up the directory tree, trying conventional filenames at each level. Comments and trailing commas are supported out of the box.

```ts
import { searchConfig } from "just-bash-util/config";

// Walks up from cwd trying: .myapprc, .myapprc.json, myapp.config.json
const result = await searchConfig(ctx, { name: "myapp" });
if (result) {
  result.config; // parsed config object
  result.filepath; // absolute path to the file that matched
  result.isEmpty; // true if config is null/undefined/empty object
}

// Find nearest package.json and return its full contents
const pkg = await searchConfig(ctx, { name: "package", searchPlaces: ["package.json"] });

// Extract a tool-specific property from package.json
const result2 = await searchConfig(ctx, {
  name: "myapp",
  searchPlaces: ["package.json", ".myapprc", ".myapprc.json"],
  packageJsonProp: "myapp",
});
```

**Layered / cascading configs** — pass `merge: true` to collect configs from every directory level and deep-merge them (closest wins):

```ts
const result = await searchConfig(ctx, { name: "myapp", merge: true });
// e.g. /project/.myapprc.json  → { indent: 2, rules: { semi: "error" } }
//      /.myapprc.json           → { indent: 4, color: true, rules: { semi: "warn" } }
// result.config                → { indent: 2, color: true, rules: { semi: "error" } }
```

Use `stopWhen` for ESLint-style `root: true` cascading stops:

```ts
const result = await searchConfig(ctx, {
  name: "myapp",
  merge: true,
  stopWhen: (cfg) => cfg.root === true,
});
```

Also exports `loadConfig` for loading a known file path directly (e.g. when the user passes `--config ./path`), and `findUp` for locating files by name up the directory tree.

### `just-bash-util/path` — Path utilities

Pure POSIX path operations with no Node.js dependency.

```ts
import {
  join,
  resolve,
  dirname,
  basename,
  extname,
  relative,
  parse,
  normalize,
  parsePackageSpecifier,
} from "just-bash-util/path";

join("src", "utils", "index.ts"); // "src/utils/index.ts"
dirname("/project/src/index.ts"); // "/project/src"
basename("src/index.ts", ".ts"); // "index"
relative("/a/b/c", "/a/d"); // "../../d"

parsePackageSpecifier("@vue/shared/dist"); // { name: "@vue/shared", subpath: "./dist" }
parsePackageSpecifier("lodash/merge"); // { name: "lodash", subpath: "./merge" }
```

**`join` vs `resolve`** — `join` concatenates segments and normalizes; an absolute second argument is kept as-is (appended, not replacing). `resolve` processes right-to-left and stops at the first absolute path, like Node's `path.resolve` (but without prepending `cwd` when no absolute segment exists):

```ts
join("/repo", "/file.txt");    // "/repo/file.txt" — concatenates with /
resolve("/repo", "/file.txt"); // "/file.txt"      — absolute segment wins
resolve("/repo", "file.txt");  // "/repo/file.txt"
resolve("a", "b");             // "a/b"            — stays relative (no cwd)
```

## Peer dependencies

Requires [`just-bash`](https://www.npmjs.com/package/just-bash) ^2.9.6 — provides the `CommandContext` and `ExecResult` types used throughout.

## Status

This project is in early development. Test coverage exists but is limited — expect gaps, especially around edge cases. Contributions and bug reports are welcome.

## Disclaimer

This project is not affiliated with, endorsed by, or associated with Vercel or the just-bash project.

## License

MIT
