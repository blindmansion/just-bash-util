import { describe, it, expect } from "vitest";
import { formatError, formatErrors, type ParseError } from "../../src/command";
import { levenshtein, findSuggestions } from "../../src/command/errors.ts";

// ============================================================================
// Levenshtein distance
// ============================================================================

describe("levenshtein()", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("hello", "hello")).toBe(0);
  });

  it("returns length of other string when one is empty", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
  });

  it("returns 0 for two empty strings", () => {
    expect(levenshtein("", "")).toBe(0);
  });

  it("returns 1 for single character difference", () => {
    expect(levenshtein("cat", "car")).toBe(1);
  });

  it("returns 1 for single insertion", () => {
    expect(levenshtein("cat", "cats")).toBe(1);
  });

  it("returns 1 for single deletion", () => {
    expect(levenshtein("cats", "cat")).toBe(1);
  });

  it("handles transpositions (counts as 2)", () => {
    // 'ab' -> 'ba' requires 2 ops in standard levenshtein (delete + insert)
    // actually: a→b, b→a = 2 substitutions
    expect(levenshtein("ab", "ba")).toBe(2);
  });

  it("computes known distance for 'kitten' vs 'sitting'", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
  });
});

// ============================================================================
// findSuggestions()
// ============================================================================

describe("findSuggestions()", () => {
  const candidates = ["port", "host", "open", "verbose", "config"];

  it("finds close matches", () => {
    const result = findSuggestions("prot", candidates);
    expect(result).toContain("port");
  });

  it("returns empty for completely unrelated input", () => {
    const result = findSuggestions("zzzzzzzzz", candidates);
    expect(result).toEqual([]);
  });

  it("returns at most 2 suggestions", () => {
    const result = findSuggestions("o", ["a", "b", "c", "d", "e"]);
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it("does not include exact matches (distance 0)", () => {
    const result = findSuggestions("port", candidates);
    expect(result).not.toContain("port");
  });

  it("respects custom maxDistance", () => {
    const result = findSuggestions("xyz", candidates, 1);
    expect(result).toEqual([]);
  });

  it("sorts by distance (closest first)", () => {
    const result = findSuggestions("hst", ["host", "hist", "hastily"]);
    // "host" has distance 1, "hist" has distance 1 — both closer than "hastily"
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toBe("host"); // or "hist" — both distance 1
  });
});

// ============================================================================
// formatError()
// ============================================================================

describe("formatError()", () => {
  it("formats unknown_option", () => {
    const err: ParseError = { type: "unknown_option", name: "--prot", suggestions: ["--port"] };
    expect(formatError(err)).toBe('Unknown option "--prot". Did you mean "--port"?');
  });

  it("formats unknown_option with no suggestions", () => {
    const err: ParseError = { type: "unknown_option", name: "--xyz", suggestions: [] };
    expect(formatError(err)).toBe('Unknown option "--xyz".');
  });

  it("formats unknown_option with multiple suggestions", () => {
    const err: ParseError = {
      type: "unknown_option",
      name: "--hos",
      suggestions: ["--host", "--hot"],
    };
    expect(formatError(err)).toBe('Unknown option "--hos". Did you mean "--host" or "--hot"?');
  });

  it("formats invalid_type", () => {
    const err: ParseError = {
      type: "invalid_type",
      name: "port",
      expected: "number",
      received: "abc",
    };
    expect(formatError(err)).toBe('Invalid value for "port": expected number, got "abc".');
  });

  it("formats missing_required option", () => {
    const err: ParseError = { type: "missing_required", name: "target", kind: "option" };
    expect(formatError(err)).toBe('Missing required option "--target".');
  });

  it("formats missing_required arg", () => {
    const err: ParseError = { type: "missing_required", name: "file", kind: "arg" };
    expect(formatError(err)).toBe("Missing required argument <file>.");
  });

  it("formats unexpected_positional with 0 max", () => {
    const err: ParseError = { type: "unexpected_positional", value: "foo", maxPositionals: 0 };
    expect(formatError(err)).toBe(
      'Unexpected argument "foo". This command takes no positional arguments.',
    );
  });

  it("formats unexpected_positional with nonzero max", () => {
    const err: ParseError = { type: "unexpected_positional", value: "bar", maxPositionals: 2 };
    expect(formatError(err)).toBe(
      'Unexpected argument "bar". Expected at most 2 positional arguments.',
    );
  });

  it("formats unexpected_positional with max 1 (singular)", () => {
    const err: ParseError = { type: "unexpected_positional", value: "x", maxPositionals: 1 };
    expect(formatError(err)).toBe(
      'Unexpected argument "x". Expected at most 1 positional argument.',
    );
  });

  it("formats missing_value", () => {
    const err: ParseError = { type: "missing_value", name: "port" };
    expect(formatError(err)).toBe('Option "--port" requires a value.');
  });

  it("formats unknown_command", () => {
    const err: ParseError = {
      type: "unknown_command",
      path: "mycli bild",
      suggestions: ["build"],
    };
    expect(formatError(err)).toBe('Unknown command "mycli bild". Did you mean "build"?');
  });

  it("formats unknown_command with no suggestions", () => {
    const err: ParseError = { type: "unknown_command", path: "mycli xyz", suggestions: [] };
    expect(formatError(err)).toBe('Unknown command "mycli xyz".');
  });
});

// ============================================================================
// formatErrors()
// ============================================================================

describe("formatErrors()", () => {
  it("joins multiple errors with newlines", () => {
    const errors: ParseError[] = [
      { type: "unknown_option", name: "--xyz", suggestions: [] },
      { type: "missing_required", name: "file", kind: "arg" },
    ];
    const output = formatErrors(errors);
    expect(output).toBe(
      'Unknown option "--xyz".\nMissing required argument <file>.',
    );
  });

  it("returns single error as-is", () => {
    const errors: ParseError[] = [
      { type: "missing_value", name: "port" },
    ];
    expect(formatErrors(errors)).toBe('Option "--port" requires a value.');
  });
});
