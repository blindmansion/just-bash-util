// ============================================================================
// Value type mappings
// ============================================================================

import type { CommandContext, ExecResult, IFileSystem } from "just-bash";

export type { CommandContext, ExecResult, IFileSystem };

export type TypeMap = {
  string: string;
  number: number;
  boolean: boolean;
};

export type TypeName = keyof TypeMap;

// ============================================================================
// Schema descriptor types
// ============================================================================

export interface OptionDef<TOut = unknown> {
  readonly _kind: "option";
  /** Phantom field — only exists at the type level for inference */
  readonly _type: TOut;
  readonly type: TypeName;
  readonly name?: string;
  readonly description?: string;
  readonly short?: string;
  readonly default?: unknown;
  readonly env?: string;
  readonly required?: boolean;
}

export interface FlagDef {
  readonly _kind: "flag";
  readonly description?: string;
  readonly short?: string;
  readonly default?: boolean;
}

export interface ArgDef<TOut = unknown> {
  readonly _kind: "arg";
  /** Phantom field — only exists at the type level for inference */
  readonly _type: TOut;
  readonly type: TypeName;
  readonly name?: string;
  readonly description?: string;
  readonly required: boolean;
  readonly variadic?: boolean;
  readonly default?: unknown;
}

export type AnyDef = OptionDef<any> | FlagDef | ArgDef<any>;

// ============================================================================
// Schema shape types
// ============================================================================

export type OptionsSchema = Record<string, OptionDef<any> | FlagDef>;
export type ArgsSchema = readonly ArgDef<any>[];

// ============================================================================
// Type inference utilities
// ============================================================================

/** Infer the value type of a single option or flag */
export type InferOptionType<T> =
  T extends OptionDef<infer V> ? V
  : T extends FlagDef ? boolean
  : never;

/** Infer the value type of a single positional arg */
export type InferArgType<T> =
  T extends ArgDef<infer V> ? V : never;

/** Infer the full options object from an options schema */
export type InferOptions<T extends OptionsSchema> = {
  [K in keyof T]: InferOptionType<T[K]>;
};

/** Infer positional args as a named object from a tuple of ArgDefs */
export type InferArgs<T extends ArgsSchema> = {
  [K in keyof T as T[K] extends ArgDef<any> & { readonly name: string }
  ? T[K]["name"]
  : never]: T[K] extends ArgDef<infer V> ? V : never;
};

// ============================================================================
// Context & result types
// ============================================================================



export type Handler<TArgs extends object = Record<string, unknown>> = (
  args: TArgs,
  ctx: CommandContext,
) => ExecResult | Promise<ExecResult>;

// ============================================================================
// Parse error types
// ============================================================================

export type ParseError =
  | { type: "unknown_option"; name: string; suggestions: string[] }
  | { type: "invalid_type"; name: string; expected: string; received: string }
  | { type: "missing_required"; name: string; kind: "option" | "arg" }
  | { type: "unexpected_positional"; value: string; maxPositionals: number }
  | { type: "missing_value"; name: string }
  | { type: "unknown_command"; path: string; suggestions: string[] };
