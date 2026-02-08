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
- `--no-<flag>` negation, `-abc` combined short flags, `--key=value` syntax
- `--` passthrough separator
- Environment variable fallbacks for options
- Levenshtein-based "did you mean?" suggestions for typos
- Automatic error handling — thrown errors in handlers are caught and returned as clean `ExecResult` with `exitCode: 1`

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

## Peer dependencies

Requires [`just-bash`](https://www.npmjs.com/package/just-bash) ^2.9.6 — provides the `CommandContext` and `ExecResult` types used throughout.

## Status

This project is in early development. Test coverage exists but is limited — expect gaps, especially around edge cases. Contributions and bug reports are welcome.

## Disclaimer

This project is not affiliated with, endorsed by, or associated with Vercel or the just-bash project.

## License

MIT
