// Fluent builders
export { o, f, a } from "./builders/index.ts";

// Command
export { command, Command } from "./command.ts";
export type { Infer } from "./command.ts";

// Parsing utility
export { parseArgs } from "./parser.ts";
export type { ParseArgsResult } from "./parser.ts";

// Help generation
export { generateHelp } from "./help.ts";

// Error formatting
export { formatError, formatErrors } from "./errors.ts";

// Types
export type { Handler, ParseError } from "./types.ts";
