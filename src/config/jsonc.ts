// ============================================================================
// JSONC — JSON with Comments & trailing commas
// ============================================================================

/**
 * Strip `//` line comments and `/* * /` block comments from a string.
 * Comments inside JSON string literals are left untouched.
 */
export function stripJsonComments(input: string): string {
  let result = "";
  let i = 0;

  while (i < input.length) {
    const ch = input[i]!;

    // ── String literal — pass through, respecting escapes ──
    if (ch === '"') {
      let str = '"';
      i++;
      while (i < input.length) {
        const c = input[i]!;
        str += c;
        if (c === "\\" && i + 1 < input.length) {
          str += input[i + 1];
          i += 2;
          continue;
        }
        i++;
        if (c === '"') break;
      }
      result += str;
      continue;
    }

    // ── Line comment ──
    if (ch === "/" && input[i + 1] === "/") {
      i += 2;
      while (i < input.length && input[i] !== "\n") i++;
      continue;
    }

    // ── Block comment ──
    if (ch === "/" && input[i + 1] === "*") {
      i += 2;
      while (i < input.length && !(input[i] === "*" && input[i + 1] === "/")) i++;
      i += 2; // skip closing */
      continue;
    }

    result += ch;
    i++;
  }

  return result;
}

/**
 * Parse a JSONC string (JSON with Comments and trailing commas).
 *
 * Strips `//` and block comments, removes trailing commas
 * before `}` or `]`, then delegates to `JSON.parse`.
 */
export function parseJsonc(input: string): unknown {
  const withoutComments = stripJsonComments(input);
  const withoutTrailingCommas = withoutComments.replace(/,\s*([}\]])/g, "$1");
  return JSON.parse(withoutTrailingCommas);
}
