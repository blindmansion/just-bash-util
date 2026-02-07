import { describe, it, expect } from "vitest";
import { a, f, o } from "../../src/command";

// ============================================================================
// Option builders
// ============================================================================

describe("o.string()", () => {
  it("produces an option def with type 'string'", () => {
    const def = o.string()._def;
    expect(def._kind).toBe("option");
    expect(def.type).toBe("string");
  });

  it("is not required by default", () => {
    expect(o.string()._def.required).toBeFalsy();
  });

  it(".describe() sets description", () => {
    expect(o.string().describe("A label")._def.description).toBe("A label");
  });

  it(".short() sets short alias", () => {
    expect(o.string().short("s")._def.short).toBe("s");
  });

  it(".env() sets env var name", () => {
    expect(o.string().env("MY_VAR")._def.env).toBe("MY_VAR");
  });

  it(".required() marks as required", () => {
    expect(o.string().required()._def.required).toBe(true);
  });

  it(".default() sets a default value", () => {
    expect(o.string().default("hi")._def.default).toBe("hi");
  });

  it("chains multiple methods", () => {
    const def = o.string().short("h").describe("Host").default("localhost").env("HOST")._def;
    expect(def.short).toBe("h");
    expect(def.description).toBe("Host");
    expect(def.default).toBe("localhost");
    expect(def.env).toBe("HOST");
  });
});

describe("o.number()", () => {
  it("produces an option def with type 'number'", () => {
    const def = o.number()._def;
    expect(def._kind).toBe("option");
    expect(def.type).toBe("number");
  });

  it(".default() sets a numeric default", () => {
    expect(o.number().default(3000)._def.default).toBe(3000);
  });

  it(".required() marks as required", () => {
    expect(o.number().required()._def.required).toBe(true);
  });
});

// ============================================================================
// Flag builder
// ============================================================================

describe("f()", () => {
  it("produces a flag def", () => {
    expect(f()._def._kind).toBe("flag");
  });

  it("has no short by default", () => {
    expect(f()._def.short).toBeUndefined();
  });

  it(".short() sets short alias", () => {
    expect(f().short("v")._def.short).toBe("v");
  });

  it(".describe() sets description", () => {
    expect(f().describe("Verbose")._def.description).toBe("Verbose");
  });

  it(".default() sets boolean default", () => {
    expect(f().default(true)._def.default).toBe(true);
  });
});

// ============================================================================
// Arg builders
// ============================================================================

describe("a.string()", () => {
  it("produces an arg def with type 'string'", () => {
    const def = a.string()._def;
    expect(def._kind).toBe("arg");
    expect(def.type).toBe("string");
  });

  it("is required by default", () => {
    expect(a.string()._def.required).toBe(true);
  });

  it(".name() sets the arg name", () => {
    expect(a.string().name("file")._def.name).toBe("file");
  });

  it(".describe() sets description", () => {
    expect(a.string().describe("Input file")._def.description).toBe("Input file");
  });

  it(".optional() marks as not required", () => {
    expect(a.string().optional()._def.required).toBe(false);
  });

  it(".variadic() marks as variadic", () => {
    expect(a.string().variadic()._def.variadic).toBe(true);
  });

  it(".default() sets default and makes not required", () => {
    const def = a.string().default("index.ts")._def;
    expect(def.default).toBe("index.ts");
    expect(def.required).toBe(false);
  });

  it("chains multiple methods", () => {
    const def = a.string().name("entry").describe("Entry file").optional()._def;
    expect(def.name).toBe("entry");
    expect(def.description).toBe("Entry file");
    expect(def.required).toBe(false);
  });
});

describe("a.number()", () => {
  it("produces an arg def with type 'number'", () => {
    const def = a.number()._def;
    expect(def._kind).toBe("arg");
    expect(def.type).toBe("number");
  });

  it("is required by default", () => {
    expect(a.number()._def.required).toBe(true);
  });
});
