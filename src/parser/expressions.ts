import { TokenType } from "../lexer/tokens";
import type { Expression } from "./ast";
import type { ParserBase } from "./parser";

/**
 * Expression grammar (loosest to tightest):
 *   expr        → implication
 *   implication → or_expr ('?' or_expr)?
 *   or_expr     → and_expr ('|' and_expr)*
 *   and_expr    → not_expr ('&' not_expr)*
 *   not_expr    → '!' not_expr | comparison
 *   comparison  → primary (comp_op primary)?
 *   primary     → quantified | function_call | grouped | dotted_id | literal
 */

export function parseExpression(p: ParserBase): Expression {
  return parseImplication(p);
}

function parseImplication(p: ParserBase): Expression {
  const left = parseOrExpr(p);

  // '?' as implication in expression context — only if followed by something that looks like an expression
  if (
    p.peek().type === TokenType.OP_IF &&
    !p.isAtLineStart() &&
    looksLikeExpressionNext(p)
  ) {
    const loc = p.peek();
    p.advance();
    const right = parseOrExpr(p);
    return {
      kind: "ImplicationExpr",
      antecedent: left,
      consequent: right,
      loc: { line: loc.line, col: loc.col },
    };
  }

  return left;
}

function looksLikeExpressionNext(p: ParserBase): boolean {
  // Peek at the token after '?' — if it's an identifier, string, number, '!', '(' or quantifier,
  // it's likely an expression
  const nextIdx = p.cursor + 1;
  const next = p.tokenAt(nextIdx);
  if (!next) return false;
  return (
    next.type === TokenType.IDENTIFIER ||
    next.type === TokenType.STRING ||
    next.type === TokenType.NUMBER ||
    next.type === TokenType.OP_NOT ||
    next.type === TokenType.LPAREN
  );
}

function parseOrExpr(p: ParserBase): Expression {
  let left = parseAndExpr(p);

  while (p.peek().type === TokenType.OP_PARALLEL && !p.isAtLineStart()) {
    const loc = p.peek();
    p.advance();
    const right = parseAndExpr(p);
    left = {
      kind: "OrExpr",
      left,
      right,
      loc: { line: loc.line, col: loc.col },
    };
  }

  return left;
}

function parseAndExpr(p: ParserBase): Expression {
  let left = parseNotExpr(p);

  while (p.peek().type === TokenType.OP_AMP) {
    const loc = p.peek();
    p.advance();
    const right = parseNotExpr(p);
    left = {
      kind: "AndExpr",
      left,
      right,
      loc: { line: loc.line, col: loc.col },
    };
  }

  return left;
}

function parseNotExpr(p: ParserBase): Expression {
  if (p.peek().type === TokenType.OP_NOT) {
    const loc = p.peek();
    p.advance();
    const expr = parseNotExpr(p);
    return { kind: "NotExpr", expr, loc: { line: loc.line, col: loc.col } };
  }
  return parseComparison(p);
}

function parseComparison(p: ParserBase): Expression {
  const left = parsePrimary(p);

  const compOps: Record<string, string> = {
    [TokenType.OP_EQ]: "=",
    [TokenType.OP_NEQ]: "!=",
    [TokenType.OP_THEN]: ">",
    [TokenType.OP_LT]: "<",
    [TokenType.OP_GTE]: ">=",
    [TokenType.OP_LTE]: "<=",
  };

  const op = compOps[p.peek().type];
  if (op) {
    // Disambiguate '>' as comparison vs flow operator
    // In expression context we treat it as comparison
    const loc = p.peek();
    p.advance();
    const right = parsePrimary(p);
    return {
      kind: "Comparison",
      left,
      op,
      right,
      loc: { line: loc.line, col: loc.col },
    };
  }

  // Keyword-based comparisons: "unique", "unique within X", "matches Y", "min N", "max N", "valid", "in a b c"
  if (p.peek().type === TokenType.IDENTIFIER) {
    const kw = p.peek().value;
    if (kw === "unique") {
      const loc = p.peek();
      p.advance();
      let scope: Expression | undefined;
      if (p.peek().type === TokenType.IDENTIFIER && p.peek().value === "within") {
        p.advance();
        scope = parsePrimary(p);
      }
      const right: Expression = scope
        ? { kind: "DottedIdExpr", parts: ["unique", "within", ...(scope.kind === "DottedIdExpr" ? scope.parts : [])], loc: { line: loc.line, col: loc.col } }
        : { kind: "DottedIdExpr", parts: ["unique"], loc: { line: loc.line, col: loc.col } };
      return {
        kind: "Comparison",
        left,
        op: "unique",
        right,
        loc: { line: loc.line, col: loc.col },
      };
    }
    if (kw === "matches") {
      const loc = p.peek();
      p.advance();
      const pattern = parsePrimary(p);
      return {
        kind: "Comparison",
        left,
        op: "matches",
        right: pattern,
        loc: { line: loc.line, col: loc.col },
      };
    }
    if (kw === "valid") {
      const loc = p.peek();
      p.advance();
      return {
        kind: "Comparison",
        left,
        op: "valid",
        right: { kind: "LiteralExpr", value: "valid", type: "keyword", loc: { line: loc.line, col: loc.col } },
        loc: { line: loc.line, col: loc.col },
      };
    }
    if (kw === "min" || kw === "max") {
      const loc = p.peek();
      p.advance();
      const val = parsePrimary(p);
      return {
        kind: "Comparison",
        left,
        op: kw,
        right: val,
        loc: { line: loc.line, col: loc.col },
      };
    }
    if (kw === "in") {
      const loc = p.peek();
      p.advance();
      const values: Expression[] = [];
      while (
        !p.isAtEnd() &&
        p.peek().type !== TokenType.NEWLINE &&
        p.peek().type !== TokenType.INDENT &&
        p.peek().type !== TokenType.DEDENT &&
        !isExprTerminator(p)
      ) {
        values.push(parsePrimary(p));
      }
      const right: Expression = {
        kind: "FunctionCall",
        name: "in",
        args: values,
        loc: { line: loc.line, col: loc.col },
      };
      return {
        kind: "Comparison",
        left,
        op: "in",
        right,
        loc: { line: loc.line, col: loc.col },
      };
    }
    if (kw === "exists") {
      // left is something like "payment.id", and "exists" is just a unary check
      const loc = p.peek();
      p.advance();
      return {
        kind: "Comparison",
        left,
        op: "exists",
        right: { kind: "LiteralExpr", value: "exists", type: "keyword", loc: { line: loc.line, col: loc.col } },
        loc: { line: loc.line, col: loc.col },
      };
    }
  }

  return left;
}

function isExprTerminator(p: ParserBase): boolean {
  const t = p.peek().type;
  return (
    t === TokenType.EOF ||
    t === TokenType.SECTION_C ||
    t === TokenType.SECTION_I ||
    t === TokenType.SECTION_E ||
    t === TokenType.SECTION_K ||
    t === TokenType.SECTION_X ||
    t === TokenType.SECTION_V ||
    t === TokenType.SECTION_T ||
    t === TokenType.SECTION_F ||
    t === TokenType.SECTION_D ||
    t === TokenType.SECTION_S ||
    t === TokenType.SECTION_P ||
    t === TokenType.SECTION_M ||
    t === TokenType.SECTION_R ||
    t === TokenType.SECTION_L ||
    t === TokenType.SECTION_N
  );
}

function parsePrimary(p: ParserBase): Expression {
  const tok = p.peek();
  const loc = { line: tok.line, col: tok.col };

  // Quantifiers
  if (
    tok.type === TokenType.IDENTIFIER &&
    (tok.value === "forall" || tok.value === "exists")
  ) {
    return parseQuantified(p);
  }

  // Grouped expression
  if (tok.type === TokenType.LPAREN) {
    p.advance();
    const expr = parseExpression(p);
    p.expect(TokenType.RPAREN);
    return { kind: "GroupExpr", expr, loc };
  }

  // Boolean/keyword literals
  if (tok.type === TokenType.IDENTIFIER) {
    if (
      tok.value === "true" ||
      tok.value === "false"
    ) {
      p.advance();
      return { kind: "LiteralExpr", value: tok.value, type: "bool", loc };
    }
    if (tok.value === "null" || tok.value === "none" || tok.value === "now") {
      p.advance();
      return { kind: "LiteralExpr", value: tok.value, type: "keyword", loc };
    }

    // Function call: identifier(args)
    if (p.peekAt(1)?.type === TokenType.LPAREN) {
      return parseFunctionCall(p);
    }

    // Dotted identifier: a.b.c
    return parseDottedId(p);
  }

  // String literal
  if (tok.type === TokenType.STRING) {
    p.advance();
    return { kind: "LiteralExpr", value: tok.value, type: "string", loc };
  }

  // Number literal
  if (tok.type === TokenType.NUMBER) {
    p.advance();
    return { kind: "LiteralExpr", value: tok.value, type: "number", loc };
  }

  // Timestamp
  if (tok.type === TokenType.TIMESTAMP) {
    p.advance();
    return { kind: "LiteralExpr", value: tok.value, type: "timestamp", loc };
  }

  // Duration
  if (tok.type === TokenType.DURATION) {
    p.advance();
    return { kind: "LiteralExpr", value: tok.value, type: "duration", loc };
  }

  // Semver (treated as string in expression context)
  if (tok.type === TokenType.SEMVER) {
    p.advance();
    return { kind: "LiteralExpr", value: tok.value, type: "string", loc };
  }

  p.error(`Unexpected token in expression: '${tok.value}' (${tok.type})`);
}

function parseQuantified(p: ParserBase): Expression {
  const tok = p.peek();
  const loc = { line: tok.line, col: tok.col };
  const quantifier = tok.value as "forall" | "exists";
  p.advance();

  const variable = p.expectIdent();
  p.expectKeyword("in");
  const collection = parseDottedId(p);
  p.expect(TokenType.COLON);
  const predicate = parseExpression(p);

  return { kind: "Quantified", quantifier, variable, collection, predicate, loc };
}

function parseFunctionCall(p: ParserBase): Expression {
  const tok = p.peek();
  const loc = { line: tok.line, col: tok.col };
  const name = tok.value;
  p.advance();
  p.expect(TokenType.LPAREN);

  // For complex expressions like sum(item.quantity * item.unit_price_cents for item in order.items)
  // we consume everything between balanced parens as raw content
  const args: Expression[] = [];
  let depth = 1;

  // Try simple parsing first; if we hit unexpected tokens, fall back to raw consumption
  const savedCursor = p.cursor;
  try {
    if (p.peek().type !== TokenType.RPAREN) {
      args.push(parseExpression(p));
      while (p.match(TokenType.COMMA)) {
        args.push(parseExpression(p));
      }
    }
    p.expect(TokenType.RPAREN);
    return { kind: "FunctionCall", name, args, loc };
  } catch {
    // Fall back: consume everything until balanced RPAREN
    p.cursor = savedCursor;
    let rawParts: string[] = [];
    depth = 1;
    while (!p.isAtEnd() && depth > 0) {
      const t = p.peek();
      if (t.type === TokenType.LPAREN) depth++;
      if (t.type === TokenType.RPAREN) {
        depth--;
        if (depth === 0) {
          p.advance(); // consume the closing )
          break;
        }
      }
      rawParts.push(t.value);
      p.advance();
    }
    const rawExpr: Expression = {
      kind: "LiteralExpr",
      value: rawParts.join(" "),
      type: "string",
      loc,
    };
    return { kind: "FunctionCall", name, args: [rawExpr], loc };
  }
}

function parseDottedId(p: ParserBase): Expression {
  const tok = p.peek();
  const loc = { line: tok.line, col: tok.col };
  const parts: string[] = [p.expectIdent()];

  while (p.peek().type === TokenType.DOT) {
    p.advance();
    parts.push(p.expectIdent());
  }

  return { kind: "DottedIdExpr", parts, loc };
}
