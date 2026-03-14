import { describe, test, expect } from "bun:test";
import { Lexer } from "../src/lexer/lexer";
import { TokenType } from "../src/lexer/tokens";
import { PactLexError } from "../src/errors";

function tokenTypes(source: string): TokenType[] {
  return new Lexer(source)
    .tokenize()
    .filter(
      (t) => t.type !== TokenType.NEWLINE && t.type !== TokenType.COMMENT && t.type !== TokenType.EOF,
    )
    .map((t) => t.type);
}

function tokenValues(source: string): string[] {
  return new Lexer(source)
    .tokenize()
    .filter(
      (t) =>
        t.type !== TokenType.NEWLINE &&
        t.type !== TokenType.COMMENT &&
        t.type !== TokenType.EOF &&
        t.type !== TokenType.INDENT &&
        t.type !== TokenType.DEDENT,
    )
    .map((t) => t.value);
}

describe("Lexer", () => {
  describe("sections", () => {
    test("recognizes all section tokens", () => {
      const sections = "CIEKXVTFDSPMRLN";
      for (const s of sections) {
        const tokens = new Lexer(`@${s}`).tokenize();
        expect(tokens[0]!.type).toBe((`SECTION_${s}` as TokenType));
        expect(tokens[0]!.value).toBe(`@${s}`);
      }
    });

    test("@C with positional args", () => {
      const vals = tokenValues("@C customer.create 1.0.0");
      expect(vals).toEqual(["@C", "customer", ".", "create", "1.0.0"]);
    });
  });

  describe("operators", () => {
    test("multi-char operators", () => {
      const types = tokenTypes(">> >= <= != ?? ?! ~> <> <- =>");
      expect(types).toEqual([
        TokenType.OP_PIPE,
        TokenType.OP_GTE,
        TokenType.OP_LTE,
        TokenType.OP_NEQ,
        TokenType.OP_MATCH,
        TokenType.OP_ELSE,
        TokenType.OP_ASYNC,
        TokenType.OP_EXCHANGE,
        TokenType.OP_BIND,
        TokenType.OP_TRANSFORM,
      ]);
    });

    test("@> delegate operator", () => {
      const types = tokenTypes("@> #inventory.reserve");
      expect(types).toEqual([
        TokenType.OP_DELEGATE,
        TokenType.HASH,
        TokenType.IDENTIFIER,
        TokenType.DOT,
        TokenType.IDENTIFIER,
      ]);
    });

    test("single-char operators", () => {
      const types = tokenTypes("> < | ? ! * ~ ^ = &");
      expect(types).toEqual([
        TokenType.OP_THEN,
        TokenType.OP_LT,
        TokenType.OP_PARALLEL,
        TokenType.OP_IF,
        TokenType.OP_NOT,
        TokenType.OP_LOOP,
        TokenType.OP_TILDE,
        TokenType.OP_INDEX,
        TokenType.OP_EQ,
        TokenType.OP_AMP,
      ]);
    });

    test("delimiters", () => {
      const types = tokenTypes("( ) [ ] , : . #");
      expect(types).toEqual([
        TokenType.LPAREN,
        TokenType.RPAREN,
        TokenType.LBRACKET,
        TokenType.RBRACKET,
        TokenType.COMMA,
        TokenType.COLON,
        TokenType.DOT,
        TokenType.HASH,
      ]);
    });
  });

  describe("literals", () => {
    test("strings", () => {
      const tokens = new Lexer('"hello world"').tokenize();
      expect(tokens[0]!.type).toBe(TokenType.STRING);
      expect(tokens[0]!.value).toBe("hello world");
    });

    test("strings with escapes", () => {
      const tokens = new Lexer('"say \\"hi\\" to me"').tokenize();
      expect(tokens[0]!.type).toBe(TokenType.STRING);
      expect(tokens[0]!.value).toBe('say "hi" to me');
    });

    test("integers", () => {
      const tokens = new Lexer("42").tokenize();
      expect(tokens[0]!.type).toBe(TokenType.NUMBER);
      expect(tokens[0]!.value).toBe("42");
    });

    test("decimals", () => {
      const tokens = new Lexer("199.90").tokenize();
      expect(tokens[0]!.type).toBe(TokenType.NUMBER);
      expect(tokens[0]!.value).toBe("199.90");
    });

    test("timestamps", () => {
      const tokens = new Lexer("2026-03-13T10:00:00Z").tokenize();
      expect(tokens[0]!.type).toBe(TokenType.TIMESTAMP);
      expect(tokens[0]!.value).toBe("2026-03-13T10:00:00Z");
    });

    test("timestamps with milliseconds", () => {
      const tokens = new Lexer("2026-03-13T10:00:00.100Z").tokenize();
      expect(tokens[0]!.type).toBe(TokenType.TIMESTAMP);
      expect(tokens[0]!.value).toBe("2026-03-13T10:00:00.100Z");
    });

    test("durations", () => {
      for (const [input, expected] of [
        ["10s", "10s"],
        ["5m", "5m"],
        ["2h", "2h"],
        ["14d", "14d"],
        ["500ms", "500ms"],
      ] as const) {
        const tokens = new Lexer(input).tokenize();
        expect(tokens[0]!.type).toBe(TokenType.DURATION);
        expect(tokens[0]!.value).toBe(expected);
      }
    });

    test("semver", () => {
      const tokens = new Lexer("1.0.0").tokenize();
      expect(tokens[0]!.type).toBe(TokenType.SEMVER);
      expect(tokens[0]!.value).toBe("1.0.0");
    });

    test("semver 2.1.0", () => {
      const tokens = new Lexer("2.1.0").tokenize();
      expect(tokens[0]!.type).toBe(TokenType.SEMVER);
      expect(tokens[0]!.value).toBe("2.1.0");
    });

    test("identifiers", () => {
      const tokens = new Lexer("customer_id").tokenize();
      expect(tokens[0]!.type).toBe(TokenType.IDENTIFIER);
      expect(tokens[0]!.value).toBe("customer_id");
    });
  });

  describe("indentation", () => {
    test("INDENT and DEDENT", () => {
      const src = "@C\n  domain commerce\n  author me\n@I";
      const types = tokenTypes(src);
      expect(types).toContain(TokenType.INDENT);
      expect(types).toContain(TokenType.DEDENT);
    });

    test("nested indentation", () => {
      const src = "@E\n  customer\n    id id\n    name str\n@I";
      const types = tokenTypes(src);
      const indents = types.filter((t) => t === TokenType.INDENT).length;
      const dedents = types.filter((t) => t === TokenType.DEDENT).length;
      expect(indents).toBe(2);
      expect(dedents).toBe(2);
    });

    test("blank lines are skipped", () => {
      const src = "@C\n  domain commerce\n\n  author me";
      // Should not crash — blank lines are skipped
      const tokens = new Lexer(src).tokenize();
      expect(tokens.length).toBeGreaterThan(0);
    });
  });

  describe("comments", () => {
    test("line comment", () => {
      const tokens = new Lexer("-- this is a comment").tokenize();
      expect(tokens[0]!.type).toBe(TokenType.COMMENT);
    });

    test("inline comment", () => {
      const src = "@C customer.create 1.0.0 -- identity";
      const tokens = new Lexer(src).tokenize();
      const comment = tokens.find((t) => t.type === TokenType.COMMENT);
      expect(comment).toBeDefined();
    });
  });

  describe("error cases", () => {
    test("rejects CRLF", () => {
      expect(() => new Lexer("pact v1\r\n").tokenize()).toThrow(PactLexError);
    });

    test("rejects tabs", () => {
      expect(() => new Lexer("@C\n\tdomain foo").tokenize()).toThrow(PactLexError);
    });

    test("rejects BOM", () => {
      expect(() => new Lexer("\uFEFFpact v1").tokenize()).toThrow(PactLexError);
    });

    test("rejects unterminated string", () => {
      expect(() => new Lexer('"hello').tokenize()).toThrow(PactLexError);
    });
  });

  describe("complex sequences", () => {
    test("version header", () => {
      const vals = tokenValues("pact v1");
      expect(vals).toEqual(["pact", "v1"]);
    });

    test("entity field with modifiers", () => {
      const vals = tokenValues("email str !*^");
      expect(vals).toEqual(["email", "str", "!", "*", "^"]);
    });

    test("enum type", () => {
      const vals = tokenValues("enum(active,inactive)");
      expect(vals).toEqual(["enum", "(", "active", ",", "inactive", ")"]);
    });

    test("default value", () => {
      const vals = tokenValues("=active");
      expect(vals).toEqual(["=", "active"]);
    });

    test("constraint expression", () => {
      const vals = tokenValues("customer.persisted & customer.stripe_synced");
      expect(vals).toEqual([
        "customer",
        ".",
        "persisted",
        "&",
        "customer",
        ".",
        "stripe_synced",
      ]);
    });

    test("flow with pipe and exchange", () => {
      const vals = tokenValues("<> stripe.customers.create");
      expect(vals).toEqual(["<>", "stripe", ".", "customers", ".", "create"]);
    });

    test("contract reference with version", () => {
      const vals = tokenValues("#inventory.reserve >=1.0.0");
      expect(vals).toEqual(["#", "inventory", ".", "reserve", ">=", "1.0.0"]);
    });

    test("rate limit as string value", () => {
      // rate_limit 100/min — the spec shows this as a bare value
      // The / character isn't a Pact operator, so in practice this is quoted or parsed differently
      // For now, the lexer handles "100/min" as a quoted string
      const vals = tokenValues('"100/min"');
      expect(vals).toEqual(["100/min"]);
    });
  });
});
