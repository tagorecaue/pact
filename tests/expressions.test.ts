import { describe, test, expect } from "bun:test";
import { Lexer } from "../src/lexer/lexer";
import { TokenType } from "../src/lexer/tokens";
import { Parser } from "../src/parser/parser";
import { parseExpression } from "../src/parser/expressions";
import type { Expression } from "../src/parser/ast";

function parseExpr(input: string): Expression {
  const tokens = new Lexer(input).tokenize().filter((t) => t.type !== TokenType.COMMENT);
  const parser = new Parser(tokens, input.split("\n"));
  return parseExpression(parser);
}

describe("Expressions", () => {
  test("dotted identifier", () => {
    const e = parseExpr("customer.email");
    expect(e.kind).toBe("DottedIdExpr");
    if (e.kind === "DottedIdExpr") {
      expect(e.parts).toEqual(["customer", "email"]);
    }
  });

  test("simple identifier", () => {
    const e = parseExpr("active");
    expect(e.kind).toBe("DottedIdExpr");
    if (e.kind === "DottedIdExpr") {
      expect(e.parts).toEqual(["active"]);
    }
  });

  test("AND expression", () => {
    const e = parseExpr("customer.persisted & customer.stripe_synced");
    expect(e.kind).toBe("AndExpr");
    if (e.kind === "AndExpr") {
      expect(e.left.kind).toBe("DottedIdExpr");
      expect(e.right.kind).toBe("DottedIdExpr");
    }
  });

  test("comparison: >", () => {
    const e = parseExpr("amount > 0");
    expect(e.kind).toBe("Comparison");
    if (e.kind === "Comparison") {
      expect(e.op).toBe(">");
    }
  });

  test("comparison: =", () => {
    const e = parseExpr("order.status = completed");
    expect(e.kind).toBe("Comparison");
    if (e.kind === "Comparison") {
      expect(e.op).toBe("=");
    }
  });

  test("comparison: >=", () => {
    const e = parseExpr("count >= 50");
    expect(e.kind).toBe("Comparison");
    if (e.kind === "Comparison") {
      expect(e.op).toBe(">=");
    }
  });

  test("NOT expression", () => {
    const e = parseExpr("!active");
    expect(e.kind).toBe("NotExpr");
  });

  test("keyword: unique within", () => {
    const e = parseExpr("email unique within customers");
    expect(e.kind).toBe("Comparison");
    if (e.kind === "Comparison") {
      expect(e.op).toBe("unique");
    }
  });

  test("keyword: matches", () => {
    const e = parseExpr("email matches rfc5322");
    expect(e.kind).toBe("Comparison");
    if (e.kind === "Comparison") {
      expect(e.op).toBe("matches");
    }
  });

  test("keyword: min", () => {
    const e = parseExpr("name min 2");
    expect(e.kind).toBe("Comparison");
    if (e.kind === "Comparison") {
      expect(e.op).toBe("min");
    }
  });

  test("forall quantifier", () => {
    const e = parseExpr("forall item in items : item.quantity > 0");
    expect(e.kind).toBe("Quantified");
    if (e.kind === "Quantified") {
      expect(e.quantifier).toBe("forall");
      expect(e.variable).toBe("item");
      expect(e.predicate.kind).toBe("Comparison");
    }
  });

  test("exists quantifier", () => {
    const e = parseExpr("exists x in orders : x.total > 100");
    expect(e.kind).toBe("Quantified");
    if (e.kind === "Quantified") {
      expect(e.quantifier).toBe("exists");
    }
  });

  test("function call: count(X)", () => {
    const e = parseExpr("count(orders)");
    expect(e.kind).toBe("FunctionCall");
    if (e.kind === "FunctionCall") {
      expect(e.name).toBe("count");
      expect(e.args).toHaveLength(1);
    }
  });

  test("function call with dotted arg: stock(item.product_id)", () => {
    const e = parseExpr("stock(item.product_id)");
    expect(e.kind).toBe("FunctionCall");
    if (e.kind === "FunctionCall") {
      expect(e.name).toBe("stock");
    }
  });

  test("grouped expression", () => {
    const e = parseExpr("(a & b)");
    expect(e.kind).toBe("GroupExpr");
  });

  test("boolean literals", () => {
    expect(parseExpr("true").kind).toBe("LiteralExpr");
    expect(parseExpr("false").kind).toBe("LiteralExpr");
  });

  test("keyword literals", () => {
    expect(parseExpr("now").kind).toBe("LiteralExpr");
    expect(parseExpr("none").kind).toBe("LiteralExpr");
  });

  test("string literal", () => {
    const e = parseExpr('"hello"');
    expect(e.kind).toBe("LiteralExpr");
    if (e.kind === "LiteralExpr") {
      expect(e.value).toBe("hello");
      expect(e.type).toBe("string");
    }
  });

  test("number literal", () => {
    const e = parseExpr("42");
    expect(e.kind).toBe("LiteralExpr");
    if (e.kind === "LiteralExpr") {
      expect(e.value).toBe("42");
      expect(e.type).toBe("number");
    }
  });

  test("complex: A & B | C", () => {
    const e = parseExpr("a & b | c");
    // | has lower precedence than &, so: (a & b) | c
    expect(e.kind).toBe("OrExpr");
  });

  test("implication: doc ? doc matches cpf", () => {
    const e = parseExpr("doc ? doc matches cpf");
    expect(e.kind).toBe("ImplicationExpr");
  });
});
