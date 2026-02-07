import type { OptionsSchema, ArgsSchema, Handler, HandlerMeta } from "./types.ts";
import type { CommandContext, ExecResult } from "./types.ts";
import type { OptionBuilder } from "./builders/option.ts";
import type { FlagBuilder } from "./builders/flag.ts";
import type { ArgBuilder } from "./builders/arg.ts";
import { parseArgs, camelToKebab } from "./parser.ts";
import { generateHelp } from "./help.ts";
import { formatErrors, findSuggestions } from "./errors.ts";

// ============================================================================
// Type utilities
// ============================================================================

/** Flatten intersections for clean hover display */
type Prettify<T> = { [K in keyof T as string extends K ? never : K]: T[K] } & {};

/** Builder input types — what the user passes in config */
type OptionInput = OptionBuilder<any> | FlagBuilder;
type OptionsInput = Record<string, OptionInput>;
type ArgsInput = readonly ArgBuilder<any, any>[];

/** Infer the value types from option builder instances */
type InferOptionsFromInput<T extends OptionsInput> = {
  [K in keyof T]: T[K] extends OptionBuilder<infer V>
  ? V
  : T[K] extends FlagBuilder
  ? boolean
  : never;
};

/** Infer positional arg types from arg builder instances */
type InferArgsFromInput<T extends ArgsInput> = {
  [I in keyof T & `${number}` as
  T[I] extends ArgBuilder<any, infer N extends string> ? N : never
  ]: T[I] extends ArgBuilder<infer V, any> ? V : never;
};

// ============================================================================
// Runtime helpers — extract defs from builder instances
// ============================================================================

function resolveOptionsInput(input: OptionsInput | undefined): OptionsSchema {
  if (!input) return {};
  const result: Record<string, any> = {};
  for (const [key, builder] of Object.entries(input)) {
    result[key] = builder._def;
  }
  return result;
}

function resolveArgsInput(input: ArgsInput | undefined): ArgsSchema {
  if (!input) return [];
  return input.map((builder) => builder._def);
}

// ============================================================================
// Command class
// ============================================================================

export class Command<TAccOpts extends OptionsInput = {}, TAccArgs extends ArgsInput = []> {
  readonly name: string;
  readonly description: string;
  readonly options: OptionsSchema;
  readonly args: ArgsSchema;
  readonly examples: readonly string[];
  readonly omitInherited: ReadonlySet<string>;
  readonly handler?: Handler<any>;
  readonly children = new Map<string, Command<any, any>>();
  parent?: Command<any, any>;

  /** @internal — accumulated builder types for generic inference */
  readonly _accOpts: TAccOpts;
  /** @internal — args builder types for generic inference */
  readonly _accArgs: TAccArgs;

  /** @internal */
  constructor(
    name: string,
    description: string,
    options: OptionsSchema,
    args: ArgsSchema,
    examples: readonly string[],
    omitInherited: ReadonlySet<string>,
    handler: Handler<any> | undefined,
    accOpts: TAccOpts,
    accArgs: TAccArgs,
  ) {
    this.name = name;
    this.description = description;
    this.options = options;
    this.args = args;
    this.examples = examples;
    this.omitInherited = omitInherited;
    this.handler = handler;
    this._accOpts = accOpts;
    this._accArgs = accArgs;
  }

  // --------------------------------------------------------------------------
  // Tree building
  // --------------------------------------------------------------------------

  /** Add a subcommand. Returns the child command for further nesting. */
  command<
    TOpts extends OptionsInput = {},
    const TArgs extends ArgsInput = [],
    const TOmit extends string[] = [],
  >(
    name: string,
    config: {
      readonly description: string;
      readonly options?: TOpts;
      readonly args?: TArgs;
      readonly examples?: readonly string[];
      readonly omitInherited?: TOmit;
      readonly handler?: Handler<
        Prettify<
          Omit<InferOptionsFromInput<TAccOpts>, TOmit[number]> &
          InferOptionsFromInput<TOpts> &
          InferArgsFromInput<TArgs>
        >
      >;
    },
  ): Command<Omit<TAccOpts, TOmit[number]> & TOpts, TArgs> {
    type ChildAcc = Omit<TAccOpts, TOmit[number]> & TOpts;
    const omitSet = new Set(config.omitInherited ?? []);
    const parentAcc = { ...this._accOpts };
    for (const key of omitSet) delete (parentAcc as any)[key];
    const accOpts = { ...parentAcc, ...(config.options ?? {}) } as unknown as ChildAcc;

    const child = new Command<ChildAcc, TArgs>(
      name,
      config.description,
      resolveOptionsInput(config.options),
      resolveArgsInput(config.args),
      config.examples ?? [],
      omitSet,
      config.handler as Handler<any> | undefined,
      accOpts,
      (config.args ?? []) as unknown as TArgs,
    );
    child.parent = this;
    this.children.set(name, child);
    return child;
  }

  // --------------------------------------------------------------------------
  // Computed properties
  // --------------------------------------------------------------------------

  /** Full path from root (e.g. "mycli db migrate") */
  get fullPath(): string {
    const segments: string[] = [];
    let current: Command<any, any> | undefined = this;
    while (current) {
      segments.unshift(current.name);
      current = current.parent;
    }
    return segments.join(" ");
  }

  /** Options inherited from ancestor commands */
  get inheritedOptions(): OptionsSchema {
    const inherited: OptionsSchema = {};
    // Build full chain from root → this
    const chain: Command<any, any>[] = [];
    let current: Command<any, any> | undefined = this;
    while (current) {
      chain.unshift(current);
      current = current.parent;
    }
    // Walk from root: at each node, apply its omit set then add its options.
    // This means a child's omit filters what was inherited from above,
    // while its own options are still added for grandchildren to inherit.
    for (const cmd of chain) {
      for (const key of cmd.omitInherited) {
        delete inherited[key];
      }
      if (cmd !== this) {
        Object.assign(inherited, cmd.options);
      }
    }
    return inherited;
  }

  /** All options available to this command (inherited + own) */
  get allOptions(): OptionsSchema {
    return { ...this.inheritedOptions, ...this.options };
  }

  // --------------------------------------------------------------------------
  // Programmatic invocation
  // --------------------------------------------------------------------------

  /**
   * Serialize a typed args object into CLI tokens.
   *
   * Produces tokens that, when parsed, reproduce the given args.
   * Useful for building commands to pass to `execute()` or composing
   * with `fullPath` for string-based execution.
   *
   * Only explicitly-provided values are serialized — omit a key to let
   * the parser apply its default or env fallback as usual.
   *
   * @example
   * ```ts
   * const tokens = serve.toTokens({ port: 8080, entry: "app.ts" });
   * await cli.execute(["serve", ...tokens], ctx);
   * ```
   */
  toTokens(
    args: Partial<Prettify<InferOptionsFromInput<TAccOpts> & InferArgsFromInput<TAccArgs>>>,
  ): string[] {
    const tokens: string[] = [];
    const allOpts = this.allOptions;
    const input = args as Record<string, unknown>;

    // Options and flags
    for (const [key, def] of Object.entries(allOpts)) {
      const value = input[key];
      const kebab = camelToKebab(key);

      if (def._kind === "flag") {
        if (value === true) {
          tokens.push(`--${kebab}`);
        } else if (value === false && def.default === true) {
          // Only emit --no-<flag> when explicitly negating a default-true flag
          tokens.push(`--no-${kebab}`);
        }
      } else if (def._kind === "option") {
        if (value !== undefined) {
          tokens.push(`--${kebab}`, String(value));
        }
      }
    }

    // Positional args (in schema order)
    for (const argDef of this.args) {
      const argName = argDef.name ?? "arg";
      const value = input[argName];
      if (value === undefined) continue;

      if (argDef.variadic && Array.isArray(value)) {
        for (const v of value) {
          tokens.push(String(v));
        }
      } else {
        tokens.push(String(value));
      }
    }

    return tokens;
  }

  /**
   * Call this command's handler directly with typed args.
   *
   * Applies defaults for any omitted keys and validates required fields,
   * then invokes the handler without parsing CLI tokens. This gives you
   * type-safe inter-command calls without serialization overhead.
   *
   * @example
   * ```ts
   * const result = await serve.invoke({ port: 8080, entry: "app.ts" }, ctx);
   * ```
   */
  async invoke(
    args: Partial<Prettify<InferOptionsFromInput<TAccOpts> & InferArgsFromInput<TAccArgs>>>,
    ctx: CommandContext,
  ): Promise<ExecResult> {
    if (!this.handler) {
      return {
        stdout: "",
        stderr: `Command "${this.fullPath}" has no handler`,
        exitCode: 1,
      };
    }

    const resolved: Record<string, unknown> = { ...(args as Record<string, unknown>) };
    const allOpts = this.allOptions;

    // Apply defaults for missing options/flags
    for (const [key, def] of Object.entries(allOpts)) {
      if (resolved[key] === undefined) {
        if (def._kind === "flag") {
          resolved[key] = def.default ?? false;
        } else if (def._kind === "option") {
          if (def.default !== undefined) {
            resolved[key] = def.default;
          } else if (def.required) {
            return {
              stdout: "",
              stderr: `Missing required option "${key}"`,
              exitCode: 1,
            };
          }
        }
      }
    }

    // Apply defaults for missing positional args
    for (const argDef of this.args) {
      const argName = argDef.name ?? "arg";
      if (resolved[argName] === undefined) {
        if (argDef.default !== undefined) {
          resolved[argName] = argDef.default;
        } else if (argDef.required) {
          return {
            stdout: "",
            stderr: `Missing required arg "${argName}"`,
            exitCode: 1,
          };
        }
      }
    }

    return this.handler(resolved, ctx, { passthrough: [] });
  }

  // --------------------------------------------------------------------------
  // Execution
  // --------------------------------------------------------------------------

  /**
   * Execute this command tree with the given tokens.
   *
   * Tokens flow through the tree: each level consumes the subcommand name
   * and passes the rest deeper. When no subcommand matches, the current
   * node either parses and runs its handler, or returns help/error.
   */
  async execute(
    tokens: readonly string[],
    ctx: CommandContext,
  ): Promise<ExecResult> {
    const env = ctx?.env ? Object.fromEntries(ctx.env) : {};
    const firstToken = tokens[0];

    // Try to match a subcommand (must come before flags)
    if (firstToken && !firstToken.startsWith("-") && this.children.has(firstToken)) {
      return this.children.get(firstToken)!.execute(tokens.slice(1), ctx);
    }

    // No subcommand matched — check for --help
    if (hasHelpFlag(tokens)) {
      return { stdout: generateHelp(this), stderr: "", exitCode: 0 };
    }

    // Has a handler — parse remaining tokens and run it
    if (this.handler) {
      const parsed = parseArgs(this.allOptions, this.args, [...tokens], env);
      if (!parsed.ok) {
        return { stdout: "", stderr: formatErrors(parsed.errors), exitCode: 1 };
      }
      return this.handler(parsed.args, ctx, { passthrough: parsed.passthrough });
    }

    // No handler — check for unknown subcommand
    if (firstToken && !firstToken.startsWith("-")) {
      const suggestions = findSuggestions(firstToken, [...this.children.keys()]);
      return {
        stdout: "",
        stderr: formatErrors([{
          type: "unknown_command",
          path: `${this.fullPath} ${firstToken}`,
          suggestions,
        }]),
        exitCode: 1,
      };
    }

    // Bare invocation, no handler — show help
    return { stdout: generateHelp(this), stderr: "", exitCode: 0 };
  }
}

// ============================================================================
// Factory function
// ============================================================================

/** Create a command (typically the root of your CLI) */
export function command<TOpts extends OptionsInput = {}, const TArgs extends ArgsInput = []>(
  name: string,
  config: {
    readonly description: string;
    readonly options?: TOpts;
    readonly args?: TArgs;
    readonly examples?: readonly string[];
    readonly handler?: Handler<
      Prettify<InferOptionsFromInput<TOpts> & InferArgsFromInput<TArgs>>
    >;
  },
): Command<TOpts, TArgs> {
  return new Command<TOpts, TArgs>(
    name,
    config.description,
    resolveOptionsInput(config.options),
    resolveArgsInput(config.args),
    config.examples ?? [],
    new Set(),
    config.handler as Handler<any> | undefined,
    (config.options ?? {}) as TOpts,
    (config.args ?? []) as unknown as TArgs,
  );
}

// ============================================================================
// Type inference utility
// ============================================================================

/**
 * Infer the handler args type from a Command instance.
 *
 * Works like Zod's `z.infer` — extract the fully-resolved args type
 * (inherited options + own options + positional args) from a command.
 *
 * @example
 * ```ts
 * const serve = cli.command("serve", {
 *   options: { port: o.number().default(3000) },
 *   args: [a.string().name("entry")],
 *   handler: (args) => { ... },
 * });
 *
 * type ServeArgs = Infer<typeof serve>;
 * //   ^? { port: number; entry: string }
 * ```
 */
export type Infer<T extends Command<any, any>> = Prettify<
  InferOptionsFromInput<T["_accOpts"]> & InferArgsFromInput<T["_accArgs"]>
>;

// ============================================================================
// Helpers
// ============================================================================

function hasHelpFlag(tokens: readonly string[]): boolean {
  return tokens.some((t) => t === "--help" || t === "-h");
}
