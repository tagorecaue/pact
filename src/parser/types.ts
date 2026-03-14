import type { Token } from "../lexer/tokens";
import { TokenType } from "../lexer/tokens";
import type { TypeExpr } from "./ast";
import type { ParserBase } from "./parser";

const PRIMITIVE_TYPES = new Set([
  "str",
  "int",
  "dec",
  "bool",
  "ts",
  "dur",
  "id",
  "any",
]);

export function parseTypeExpr(p: ParserBase): TypeExpr {
  const tok = p.peek();
  const loc = { line: tok.line, col: tok.col };

  if (tok.type !== TokenType.IDENTIFIER) {
    p.error(`Expected type, got '${tok.value}'`);
  }

  const name = tok.value;

  // Primitive types
  if (PRIMITIVE_TYPES.has(name)) {
    p.advance();
    return { kind: "PrimitiveType", name, loc };
  }

  // ref[T]
  if (name === "ref") {
    p.advance();
    p.expect(TokenType.LBRACKET);
    const inner = parseTypeExpr(p);
    p.expect(TokenType.RBRACKET);
    return { kind: "RefType", inner, loc };
  }

  // list[T]
  if (name === "list") {
    p.advance();
    p.expect(TokenType.LBRACKET);
    const inner = parseTypeExpr(p);
    p.expect(TokenType.RBRACKET);
    return { kind: "ListType", inner, loc };
  }

  // map[K,V]
  if (name === "map") {
    p.advance();
    p.expect(TokenType.LBRACKET);
    const key = parseTypeExpr(p);
    p.expect(TokenType.COMMA);
    const value = parseTypeExpr(p);
    p.expect(TokenType.RBRACKET);
    return { kind: "MapType", key, value, loc };
  }

  // opt[T]
  if (name === "opt") {
    p.advance();
    p.expect(TokenType.LBRACKET);
    const inner = parseTypeExpr(p);
    p.expect(TokenType.RBRACKET);
    return { kind: "OptType", inner, loc };
  }

  // enum(a,b,c)
  if (name === "enum") {
    p.advance();
    p.expect(TokenType.LPAREN);
    const variants: string[] = [];
    variants.push(p.expectIdent());
    while (p.match(TokenType.COMMA)) {
      variants.push(p.expectIdent());
    }
    p.expect(TokenType.RPAREN);
    return { kind: "EnumType", variants, loc };
  }

  // Unknown type name — treat as primitive/entity reference
  p.advance();
  return { kind: "PrimitiveType", name, loc };
}
