import type { OptionsSchema, ArgsSchema, Handler } from "./types.ts";
import type { CommandContext, ExecResult } from "./types.ts";
import type { OptionBuilder } from "./builders/option.ts";
import type { FlagBuilder } from "./builders/flag.ts";
import type { ArgBuilder } from "./builders/arg.ts";
import { parseArgs } from "./parser.ts";
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
      return this.handler(parsed.args, ctx);
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
