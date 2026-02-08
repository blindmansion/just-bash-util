# just-util

CLI command framework, config file discovery, and path utilities for [just-bash](https://www.npmjs.com/package/just-bash).

## Install

```bash
bun add just-util just-bash
```

## Modules

### `just-util/command` — CLI framework

Type-safe command trees with fluent builders, inherited options, auto-generated help, and typo suggestions.

```ts
import { command, o, f, a } from "just-util/command";
import type { Infer } from "just-util/command";

const cli = command("mycli", {
  description: "My CLI tool",
});

const serve = cli.command("serve", {
  description: "Start the dev server",
  options: {
    port: o.number().default(3000).short("p").describe("Port to listen on"),
    host: o.string().describe("Host to bind to"),
    open: f().short("o").describe("Open browser"),
  },
  args: [a.string().name("entry").describe("Entry file")],
  handler: (args, ctx) => {
    // args is fully typed: { port: number; host: string | undefined; open: boolean; entry: string }
    return { stdout: `Listening on :${args.port}`, stderr: "", exitCode: 0 };
  },
});

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
- `--no-<flag>` negation, `-abc` combined short flags, `--key=value` syntax
- `--` passthrough separator
- Environment variable fallbacks for options
- Levenshtein-based "did you mean?" suggestions for typos
- One-line integration with just-bash:

```ts
import { Bash } from "just-bash";

const bash = new Bash({ customCommands: [cli.toCommand()] });
await bash.exec("mycli serve app.ts -p 8080");
```

### `just-util/config` — Config file discovery

Cosmiconfig-style config search that walks up the directory tree, trying conventional filenames at each level. Comments and trailing commas are supported out of the box.

```ts
import { searchConfig } from "just-util/config";

// Walks up from cwd trying: package.json#myapp, .myapprc, .myapprc.json, myapp.config.json
const result = await searchConfig(ctx, { name: "myapp" });
if (result) {
  result.config;    // parsed config object
  result.filepath;  // absolute path to the file that matched
  result.isEmpty;   // true if config is null/undefined/empty object
}

// Customize search places, starting directory, or add custom loaders
const result2 = await searchConfig(ctx, {
  name: "myapp",
  from: "/specific/start/dir",
  searchPlaces: [".myapprc.json", "myapp.config.json"],
});
```

Also exports `loadConfig` for loading a known file path directly (e.g. when the user passes `--config ./path`), and `findUp` for locating files by name up the directory tree.

### `just-util/path` — Path utilities

Pure POSIX path operations with no Node.js dependency.

```ts
import { join, resolve, dirname, basename, extname, relative, parse, normalize } from "just-util/path";

join("src", "utils", "index.ts");  // "src/utils/index.ts"
dirname("/project/src/index.ts");  // "/project/src"
basename("src/index.ts", ".ts");   // "index"
relative("/a/b/c", "/a/d");       // "../../d"
```

## Peer dependencies

Requires [`just-bash`](https://www.npmjs.com/package/just-bash) ^2.9.6 — provides the `CommandContext` and `ExecResult` types used throughout.

## License

MIT
