import type { ArgDef, TypeName, TypeMap } from "../types.ts";

// ============================================================================
// ArgBuilder — fluent class for positional args
//
// Args are required by default. Call .optional() to allow undefined.
// TName carries the literal arg name through the chain for typed handler access.
// ============================================================================

export class ArgBuilder<TOut, TName extends string = never> {
  /** @internal */
  readonly _def: ArgDef<TOut>;

  constructor(def: ArgDef<TOut>) {
    this._def = def;
  }

  /** Set the positional arg name (used for named access in the handler) */
  name<const N extends string>(name: N): ArgBuilder<TOut, N> {
    return new ArgBuilder<TOut, N>({
      ...this._def,
      name,
    } as ArgDef<TOut>);
  }

  /** Add a description */
  describe(text: string): ArgBuilder<TOut, TName> {
    return new ArgBuilder<TOut, TName>({ ...this._def, description: text });
  }

  /** Mark as optional — adds undefined to TOut */
  optional(): ArgBuilder<TOut | undefined, TName> {
    return new ArgBuilder<TOut | undefined, TName>({
      ...this._def,
      required: false,
    } as unknown as ArgDef<TOut | undefined>);
  }

  /** Mark as variadic — collects all remaining positionals into an array */
  variadic(): ArgBuilder<TOut[], TName> {
    return new ArgBuilder<TOut[], TName>({
      ...this._def,
      variadic: true,
    } as unknown as ArgDef<TOut[]>);
  }

  /** Set a default value (also makes the arg optional at parse time) */
  default(value: TOut): ArgBuilder<TOut, TName> {
    return new ArgBuilder<TOut, TName>({
      ...this._def,
      required: false,
      default: value,
    });
  }

}

// ============================================================================
// Entry points
// ============================================================================

function createArg<T extends TypeName>(type: T): ArgBuilder<TypeMap[T]> {
  return new ArgBuilder<TypeMap[T]>({
    _kind: "arg",
    type,
    required: true,
  } as ArgDef<TypeMap[T]>);
}

/** Create a required string positional arg */
export function string(): ArgBuilder<string> {
  return createArg("string");
}

/** Create a required number positional arg */
export function number(): ArgBuilder<number> {
  return createArg("number");
}
