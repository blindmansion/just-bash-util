// Fluent builders
export { o, f, a, OptionBuilder, FlagBuilder, ArgBuilder } from "./builders/index.ts";

// Command
export { command, Command } from "./command.ts";
export type { Infer } from "./command.ts";

// Parsing utility
export { parseArgs } from "./parser.ts";
export type { ParseArgsResult } from "./parser.ts";

// Help generation
export { generateHelp } from "./help.ts";

// Error formatting
export { formatError, formatErrors, findSuggestions, levenshtein } from "./errors.ts";

// Types
export type {
  OptionDef,
  FlagDef,
  ArgDef,
  AnyDef,
  TypeMap,
  TypeName,
  OptionsSchema,
  ArgsSchema,
  InferOptionType,
  InferArgType,
  InferOptions,
  InferArgs,
  Handler,
  ParseError,
  CommandContext,
  ExecResult,
  IFileSystem,
} from "./types.ts";
