import { string as oString, number as oNumber } from "./option.ts";
import { FlagBuilder } from "./flag.ts";
import { string as aString, number as aNumber } from "./arg.ts";

// ============================================================================
// Namespaced entry points: o.string(), o.number(), f(), a.string(), a.number()
// ============================================================================

/** Option builders */
export const o = {
  string: oString,
  number: oNumber,
} as const;

/** Flag builder */
export function f(): FlagBuilder {
  return new FlagBuilder();
}

/** Arg builders */
export const a = {
  string: aString,
  number: aNumber,
} as const;

// Re-export classes for advanced use
export { OptionBuilder } from "./option.ts";
export { FlagBuilder } from "./flag.ts";
export { ArgBuilder } from "./arg.ts";
