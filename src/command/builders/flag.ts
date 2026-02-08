import type { FlagDef } from "../types.ts";

// ============================================================================
// FlagBuilder — always boolean, no generic parameter needed
// ============================================================================

export class FlagBuilder {
  /** @internal */
  readonly _def: FlagDef;

  constructor(def: FlagDef = { _kind: "flag" }) {
    this._def = def;
  }

  /** Add a description */
  describe(text: string): FlagBuilder {
    return new FlagBuilder({ ...this._def, description: text });
  }

  /** Set a short alias (single character, e.g. "v" for -v) */
  alias(short: string): FlagBuilder {
    return new FlagBuilder({ ...this._def, short });
  }

  /** Set a default value */
  default(value: boolean): FlagBuilder {
    return new FlagBuilder({ ...this._def, default: value });
  }

}
