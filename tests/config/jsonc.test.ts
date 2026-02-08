import { describe, it, expect } from "vitest";
import { stripJsonComments, parseJsonc } from "../../src/config/jsonc.ts";

// ============================================================================
// stripJsonComments
// ============================================================================

describe("stripJsonComments", () => {
  it("returns input unchanged when there are no comments", () => {
    const input = '{"key": "value"}';
    expect(stripJsonComments(input)).toBe(input);
  });

  it("strips line comments", () => {
    const input = `{
  // this is a comment
  "key": "value"
}`;
    const result = stripJsonComments(input);
    expect(result).not.toContain("// this is a comment");
    expect(JSON.parse(result)).toEqual({ key: "value" });
  });

  it("strips block comments", () => {
    const input = `{
  /* block comment */
  "key": "value"
}`;
    const result = stripJsonComments(input);
    expect(result).not.toContain("block comment");
    expect(JSON.parse(result)).toEqual({ key: "value" });
  });

  it("strips multi-line block comments", () => {
    const input = `{
  /*
   * multi-line
   * block comment
   */
  "key": "value"
}`;
    const result = stripJsonComments(input);
    expect(result).not.toContain("multi-line");
    expect(JSON.parse(result)).toEqual({ key: "value" });
  });

  it("preserves // inside string values", () => {
    const input = '{"url": "https://example.com"}';
    expect(stripJsonComments(input)).toBe(input);
  });

  it("preserves /* inside string values", () => {
    const input = '{"pattern": "/* glob */"}';
    expect(stripJsonComments(input)).toBe(input);
  });

  it("handles escaped quotes inside strings", () => {
    const input = '{"msg": "say \\"hello\\"", "key": "val"} // comment';
    const result = stripJsonComments(input);
    expect(result).not.toContain("// comment");
    expect(JSON.parse(result)).toEqual({ msg: 'say "hello"', key: "val" });
  });

  it("handles line comment at end of line with value", () => {
    const input = `{
  "port": 3000 // default port
}`;
    const result = stripJsonComments(input);
    expect(JSON.parse(result)).toEqual({ port: 3000 });
  });

  it("handles inline block comment", () => {
    const input = '{"key": /* inline */ "value"}';
    const result = stripJsonComments(input);
    expect(JSON.parse(result)).toEqual({ key: "value" });
  });

  it("handles empty input", () => {
    expect(stripJsonComments("")).toBe("");
  });

  it("handles input that is only a comment", () => {
    expect(stripJsonComments("// just a comment").trim()).toBe("");
  });
});

// ============================================================================
// parseJsonc
// ============================================================================

describe("parseJsonc", () => {
  it("parses plain JSON", () => {
    expect(parseJsonc('{"a": 1}')).toEqual({ a: 1 });
  });

  it("strips comments and parses", () => {
    const input = `{
  // comment
  "key": "value"
}`;
    expect(parseJsonc(input)).toEqual({ key: "value" });
  });

  it("strips trailing commas in objects", () => {
    const input = `{
  "a": 1,
  "b": 2,
}`;
    expect(parseJsonc(input)).toEqual({ a: 1, b: 2 });
  });

  it("strips trailing commas in arrays", () => {
    const input = `[1, 2, 3,]`;
    expect(parseJsonc(input)).toEqual([1, 2, 3]);
  });

  it("handles comments and trailing commas together", () => {
    const input = `{
  // This is the port
  "port": 3000,
  /* Host setting */
  "host": "localhost",
}`;
    expect(parseJsonc(input)).toEqual({ port: 3000, host: "localhost" });
  });

  it("handles deeply nested trailing commas", () => {
    const input = `{
  "compilerOptions": {
    "target": "es2020",
    "module": "esnext",
    "strict": true,
  },
  "include": [
    "src/**/*",
  ],
}`;
    expect(parseJsonc(input)).toEqual({
      compilerOptions: {
        target: "es2020",
        module: "esnext",
        strict: true,
      },
      include: ["src/**/*"],
    });
  });

  it("parses a realistic tsconfig.json", () => {
    const input = `{
  // TypeScript project configuration
  "compilerOptions": {
    "target": "ESNext",
    "module": "Preserve",
    "moduleResolution": "bundler",
    "strict": true,
    /* Paths */
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
    },
  },
  "include": ["src/**/*.ts"],
  "exclude": [
    "node_modules",
    "dist",
  ],
}`;
    const result = parseJsonc(input);
    expect(result).toEqual({
      compilerOptions: {
        target: "ESNext",
        module: "Preserve",
        moduleResolution: "bundler",
        strict: true,
        baseUrl: ".",
        paths: { "@/*": ["./src/*"] },
      },
      include: ["src/**/*.ts"],
      exclude: ["node_modules", "dist"],
    });
  });

  it("does not strip commas inside string values", () => {
    const input = '{"msg": "a, b,"}';
    expect(parseJsonc(input)).toEqual({ msg: "a, b," });
  });
});
