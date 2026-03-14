import { describe, test, expect } from "bun:test";
import { Lexer } from "../src/lexer/lexer";
import { TokenType } from "../src/lexer/tokens";
import { Parser } from "../src/parser/parser";
import { parseTypeExpr } from "../src/parser/types";
import type { TypeExpr } from "../src/parser/ast";

function parseType(input: string): TypeExpr {
  const tokens = new Lexer(input).tokenize().filter((t) => t.type !== TokenType.COMMENT);
  const parser = new Parser(tokens, input.split("\n"));
  return parseTypeExpr(parser);
}

describe("Type expressions", () => {
  test("primitive types", () => {
    for (const name of ["str", "int", "dec", "bool", "ts", "dur", "id", "any"]) {
      const t = parseType(name);
      expect(t.kind).toBe("PrimitiveType");
      if (t.kind === "PrimitiveType") expect(t.name).toBe(name);
    }
  });

  test("ref[T]", () => {
    const t = parseType("ref[customer]");
    expect(t.kind).toBe("RefType");
    if (t.kind === "RefType") {
      expect(t.inner.kind).toBe("PrimitiveType");
    }
  });

  test("list[T]", () => {
    const t = parseType("list[str]");
    expect(t.kind).toBe("ListType");
    if (t.kind === "ListType") {
      expect(t.inner.kind).toBe("PrimitiveType");
    }
  });

  test("map[K,V]", () => {
    const t = parseType("map[str,int]");
    expect(t.kind).toBe("MapType");
    if (t.kind === "MapType") {
      expect(t.key.kind).toBe("PrimitiveType");
      expect(t.value.kind).toBe("PrimitiveType");
    }
  });

  test("opt[T]", () => {
    const t = parseType("opt[str]");
    expect(t.kind).toBe("OptType");
    if (t.kind === "OptType") {
      expect(t.inner.kind).toBe("PrimitiveType");
    }
  });

  test("enum(a,b,c)", () => {
    const t = parseType("enum(active,inactive,blocked)");
    expect(t.kind).toBe("EnumType");
    if (t.kind === "EnumType") {
      expect(t.variants).toEqual(["active", "inactive", "blocked"]);
    }
  });

  test("nested: list[ref[customer]]", () => {
    const t = parseType("list[ref[customer]]");
    expect(t.kind).toBe("ListType");
    if (t.kind === "ListType") {
      expect(t.inner.kind).toBe("RefType");
    }
  });

  test("nested: map[str,list[int]]", () => {
    const t = parseType("map[str,list[int]]");
    expect(t.kind).toBe("MapType");
    if (t.kind === "MapType") {
      expect(t.key.kind).toBe("PrimitiveType");
      expect(t.value.kind).toBe("ListType");
    }
  });

  test("map[str,any]", () => {
    const t = parseType("map[str,any]");
    expect(t.kind).toBe("MapType");
    if (t.kind === "MapType") {
      expect(t.value.kind).toBe("PrimitiveType");
      if (t.value.kind === "PrimitiveType") expect(t.value.name).toBe("any");
    }
  });

  test("list[reservation_item] — entity reference", () => {
    const t = parseType("list[reservation_item]");
    expect(t.kind).toBe("ListType");
    if (t.kind === "ListType") {
      expect(t.inner.kind).toBe("PrimitiveType");
      if (t.inner.kind === "PrimitiveType") expect(t.inner.name).toBe("reservation_item");
    }
  });
});
