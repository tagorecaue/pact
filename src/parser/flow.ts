import { TokenType } from "../lexer/tokens";
import type {
  FlowExpr,
  MatchArm,
  BindingDef,
  Expression,
} from "./ast";
import type { ParserBase } from "./parser";
import { parseExpression } from "./expressions";

/**
 * Flow grammar for @X section:
 * Statements within a block are collected line by line.
 * Each line can be a flow operator followed by its operand.
 */

export function parseFlowBlock(p: ParserBase): FlowExpr[] {
  const stmts: FlowExpr[] = [];

  while (!p.isAtEnd() && !p.isAtSectionStart() && !p.isAtDedent()) {
    p.skipNewlines();
    if (p.isAtEnd() || p.isAtSectionStart() || p.isAtDedent()) break;

    const stmt = parseFlowStatement(p);
    if (stmt) stmts.push(stmt);
    p.skipNewlines();
  }

  return stmts;
}

function parseFlowStatement(p: ParserBase): FlowExpr | null {
  const tok = p.peek();

  // > then (sequence from previous)
  if (tok.type === TokenType.OP_THEN) {
    const loc = { line: tok.line, col: tok.col };
    p.advance();
    const right = parseFlowPrimary(p);
    if (!right) return null;
    // Attach indented block if present
    const withBlock = maybeAttachBlock(p, right);
    return { kind: "SequenceExpr", left: { kind: "StepNode", name: ">", args: [], loc }, right: withBlock, loc };
  }

  // >> pipe
  if (tok.type === TokenType.OP_PIPE) {
    const loc = { line: tok.line, col: tok.col };
    p.advance();
    const right = parseFlowPrimary(p);
    if (!right) return null;
    const withBlock = maybeAttachBlock(p, right);
    return { kind: "PipeExpr", left: { kind: "StepNode", name: ">>", args: [], loc }, right: withBlock, loc };
  }

  // Primary flow element
  const primary = parseFlowPrimary(p);
  if (!primary) return null;

  return maybeAttachBlock(p, primary);
}

function maybeAttachBlock(p: ParserBase, node: FlowExpr): FlowExpr {
  // Skip newlines before checking for indented block
  p.skipNewlines();
  // Check for indented block following this node
  if (p.peek().type === TokenType.INDENT) {
    p.advance(); // INDENT
    const children = parseIndentedFlowLines(p);
    if (p.peek().type === TokenType.DEDENT) {
      p.advance();
    }

    // For various node types, merge children differently
    if (node.kind === "ExchangeExpr") {
      // Children are send/receive clauses
      for (const child of children) {
        if (child.kind === "StepNode") {
          if (child.name === "send") {
            (node as any).send = child.args;
          } else if (child.name === "receive") {
            (node as any).receive = child.args;
          }
        }
      }
      return node;
    }

    if (node.kind === "DelegateExpr") {
      // Children are bind/timeout/expect/compensate
      for (const child of children) {
        if (child.kind === "StepNode") {
          if (child.name === "bind") {
            const bindArgs = child.args;
            // Parse "local <- remote" or "local = value"
            const localParts: string[] = [];
            let op = "<-";
            let remote = "";
            let foundOp = false;
            for (const arg of bindArgs) {
              if (arg === "<-" || arg === "=") {
                op = arg;
                foundOp = true;
              } else if (foundOp) {
                remote = remote ? remote + "." + arg : arg;
              } else {
                localParts.push(arg);
              }
            }
            node.bindings.push({
              kind: "BindingDef",
              local: localParts.join("."),
              operator: op,
              remote,
              loc: child.loc,
            });
          } else if (child.name === "timeout") {
            node.timeout = child.args[0];
          } else if (child.name === "expect") {
            // Re-parse the expect expression
            node.expect = {
              kind: "DottedIdExpr",
              parts: child.args.flatMap((a) => a.split(".")),
              loc: child.loc,
            };
          } else if (child.name === "compensate") {
            // Compensate can be another delegate or a step
            node.compensate = child;
          }
        } else {
          // Non-step children in delegate — could be compensate with nested delegate
          if (child.kind === "DelegateExpr") {
            node.compensate = child;
          }
        }
      }
      return node;
    }

    // For a regular step with indented children — the children are sub-steps
    // Build a sequence
    if (node.kind === "StepNode" && children.length > 0) {
      return buildStepWithChildren(node, children);
    }

    return node;
  }

  return node;
}

function buildStepWithChildren(step: FlowExpr, children: FlowExpr[]): FlowExpr {
  // If all children start with >> they're pipes from this step
  // If they start with ~> they're async fire-and-forget
  // Otherwise they're regular sub-flow

  // For simplicity, return step + children as a step node that the higher level will handle
  // Actually, the pattern is: step >> child1 >> child2 or step with ~> async children

  let result: FlowExpr = step;
  for (const child of children) {
    if (child.kind === "PipeExpr") {
      result = {
        kind: "PipeExpr",
        left: result,
        right: child.right,
        loc: child.loc,
      };
    } else if (child.kind === "SequenceExpr") {
      result = {
        kind: "SequenceExpr",
        left: result,
        right: child.right,
        loc: child.loc,
      };
    } else if (child.kind === "AsyncExpr") {
      // Async children are fire-and-forget from parent
      result = {
        kind: "SequenceExpr",
        left: result,
        right: child,
        loc: child.loc,
      };
    } else {
      result = {
        kind: "SequenceExpr",
        left: result,
        right: child,
        loc: child.loc,
      };
    }
  }
  return result;
}

function parseIndentedFlowLines(p: ParserBase): FlowExpr[] {
  const stmts: FlowExpr[] = [];

  while (!p.isAtEnd() && !p.isAtSectionStart() && p.peek().type !== TokenType.DEDENT) {
    p.skipNewlines();
    if (p.isAtEnd() || p.isAtSectionStart() || p.peek().type === TokenType.DEDENT) break;

    const stmt = parseFlowStatement(p);
    if (stmt) stmts.push(stmt);
    p.skipNewlines();
  }

  return stmts;
}

function parseFlowPrimary(p: ParserBase): FlowExpr | null {
  const tok = p.peek();
  const loc = { line: tok.line, col: tok.col };

  // ? conditional
  if (tok.type === TokenType.OP_IF) {
    return parseConditional(p);
  }

  // ?? match
  if (tok.type === TokenType.OP_MATCH) {
    return parseMatch(p);
  }

  // ?! else — handled by conditional parser, but if we encounter it standalone, skip
  if (tok.type === TokenType.OP_ELSE) {
    return null;
  }

  // * loop
  if (tok.type === TokenType.OP_LOOP) {
    return parseLoop(p);
  }

  // @> delegate
  if (tok.type === TokenType.OP_DELEGATE) {
    return parseDelegate(p);
  }

  // ~> async
  if (tok.type === TokenType.OP_ASYNC) {
    p.advance();
    const step = parseFlowPrimary(p);
    if (!step) return null;
    return { kind: "AsyncExpr", step, loc };
  }

  // <> exchange
  if (tok.type === TokenType.OP_EXCHANGE) {
    return parseExchange(p);
  }

  // ( grouped flow )
  if (tok.type === TokenType.LPAREN) {
    p.advance();
    const inner = parseFlowBlock(p);
    p.expect(TokenType.RPAREN);
    const expr = inner.length === 1 ? inner[0]! : inner[0]!;
    return { kind: "FlowGroupExpr", expr, loc };
  }

  // Step: identifier with args
  if (tok.type === TokenType.IDENTIFIER) {
    return parseStep(p);
  }

  // abort "message" — special step
  if (tok.type === TokenType.IDENTIFIER && tok.value === "abort") {
    return parseStep(p);
  }

  return null;
}

function parseStep(p: ParserBase): FlowExpr {
  const tok = p.peek();
  const loc = { line: tok.line, col: tok.col };
  const name = tok.value;
  p.advance();

  const args: string[] = [];
  // Collect args: identifiers, strings, numbers, keywords, dotted paths on same line
  while (
    !p.isAtEnd() &&
    p.peek().type !== TokenType.NEWLINE &&
    p.peek().type !== TokenType.INDENT &&
    p.peek().type !== TokenType.DEDENT &&
    p.peek().type !== TokenType.EOF &&
    !isFlowOperator(p.peek().type) &&
    !p.isAtSectionStart()
  ) {
    const t = p.peek();
    if (
      t.type === TokenType.IDENTIFIER ||
      t.type === TokenType.STRING ||
      t.type === TokenType.NUMBER ||
      t.type === TokenType.DURATION ||
      t.type === TokenType.TIMESTAMP ||
      t.type === TokenType.SEMVER
    ) {
      // Check for dotted path: a.b.c
      if (t.type === TokenType.IDENTIFIER && p.peekAt(1)?.type === TokenType.DOT) {
        let path = t.value;
        p.advance();
        while (p.peek().type === TokenType.DOT) {
          p.advance();
          path += "." + p.expectIdent();
        }
        args.push(path);
      } else {
        args.push(t.type === TokenType.STRING ? t.value : t.value);
        p.advance();
      }
    } else if (t.type === TokenType.OP_EQ) {
      // = in args context (like "status = active")
      args.push("=");
      p.advance();
    } else if (t.type === TokenType.OP_BIND) {
      // <- in args context
      args.push("<-");
      p.advance();
    } else if (t.type === TokenType.OP_GTE || t.type === TokenType.OP_LTE) {
      args.push(t.value);
      p.advance();
    } else if (t.type === TokenType.HASH) {
      // Contract reference
      p.advance();
      let ref = "#";
      ref += p.expectIdent();
      while (p.peek().type === TokenType.DOT) {
        p.advance();
        ref += "." + p.expectIdent();
      }
      args.push(ref);
    } else {
      break;
    }
  }

  return { kind: "StepNode", name, args, loc };
}

function parseConditional(p: ParserBase): FlowExpr {
  const loc = { line: p.peek().line, col: p.peek().col };
  p.advance(); // ?

  const condition = parseExpression(p);
  p.skipNewlines();

  let thenBlock: FlowExpr[] = [];
  if (p.peek().type === TokenType.INDENT) {
    p.advance();
    thenBlock = parseIndentedFlowLines(p);
    if (p.peek().type === TokenType.DEDENT) p.advance();
  } else {
    // Inline then
    const stmt = parseFlowStatement(p);
    if (stmt) thenBlock = [stmt];
  }

  const elseIfs: { condition: Expression; body: FlowExpr[] }[] = [];
  let elseBlock: FlowExpr[] | undefined;

  p.skipNewlines();

  // ?! else-if or else
  while (p.peek().type === TokenType.OP_ELSE) {
    p.advance(); // ?!

    // Check if this is else-if (has condition) or plain else
    if (
      p.peek().type !== TokenType.NEWLINE &&
      p.peek().type !== TokenType.INDENT &&
      p.peek().type !== TokenType.EOF &&
      p.peek().type !== TokenType.DEDENT
    ) {
      const elseIfCondition = parseExpression(p);
      p.skipNewlines();

      let elseIfBody: FlowExpr[] = [];
      if (p.peek().type === TokenType.INDENT) {
        p.advance();
        elseIfBody = parseIndentedFlowLines(p);
        if (p.peek().type === TokenType.DEDENT) p.advance();
      } else {
        const stmt = parseFlowStatement(p);
        if (stmt) elseIfBody = [stmt];
      }
      elseIfs.push({ condition: elseIfCondition, body: elseIfBody });
    } else {
      // Plain else
      p.skipNewlines();
      if (p.peek().type === TokenType.INDENT) {
        p.advance();
        elseBlock = parseIndentedFlowLines(p);
        if (p.peek().type === TokenType.DEDENT) p.advance();
      } else {
        const stmt = parseFlowStatement(p);
        if (stmt) elseBlock = [stmt];
      }
      break;
    }
    p.skipNewlines();
  }

  return {
    kind: "ConditionalExpr",
    condition,
    then: thenBlock,
    elseIfs,
    else: elseBlock,
    loc,
  };
}

function parseMatch(p: ParserBase): FlowExpr {
  const loc = { line: p.peek().line, col: p.peek().col };
  p.advance(); // ??

  const value = parseExpression(p);
  p.skipNewlines();

  const arms: MatchArm[] = [];

  if (p.peek().type === TokenType.INDENT) {
    p.advance();

    while (
      !p.isAtEnd() &&
      p.peek().type !== TokenType.DEDENT &&
      !p.isAtSectionStart()
    ) {
      p.skipNewlines();
      if (p.peek().type === TokenType.DEDENT || p.isAtEnd()) break;

      const armTok = p.peek();
      const armLoc = { line: armTok.line, col: armTok.col };

      // Pattern: identifier, string, or _
      let pattern: string;
      if (armTok.type === TokenType.IDENTIFIER) {
        pattern = armTok.value;
        p.advance();
        // Handle dotted patterns like payment_intent.succeeded
        while (p.peek().type === TokenType.DOT) {
          p.advance();
          pattern += "." + p.expectIdent();
        }
      } else if (armTok.type === TokenType.STRING) {
        pattern = armTok.value;
        p.advance();
      } else {
        break;
      }

      // Optional : for inline flow
      let body: FlowExpr[] = [];
      if (p.peek().type === TokenType.COLON) {
        p.advance();
        // Inline flow on same line
        const stmt = parseFlowStatement(p);
        if (stmt) body = [stmt];
      }

      p.skipNewlines();

      // Indented body
      if (p.peek().type === TokenType.INDENT) {
        p.advance();
        body = body.concat(parseIndentedFlowLines(p));
        if (p.peek().type === TokenType.DEDENT) p.advance();
      }

      arms.push({ kind: "MatchArm", pattern, body, loc: armLoc });
      p.skipNewlines();
    }

    if (p.peek().type === TokenType.DEDENT) p.advance();
  }

  return { kind: "MatchExpr", value, arms, loc };
}

function parseLoop(p: ParserBase): FlowExpr {
  const loc = { line: p.peek().line, col: p.peek().col };
  p.advance(); // *

  // Parse condition as simple dotted identifier (not full expression)
  // because "* condition max N" uses "max" as a keyword, not comparison
  const condLoc = { line: p.peek().line, col: p.peek().col };
  const parts: string[] = [p.expectIdent()];
  while (p.peek().type === TokenType.DOT) {
    p.advance();
    parts.push(p.expectIdent());
  }
  const condition: Expression = {
    kind: "DottedIdExpr",
    parts,
    loc: condLoc,
  };

  // max N is required
  p.expectKeyword("max");
  const maxTok = p.peek();
  if (maxTok.type !== TokenType.NUMBER) {
    p.error("Expected number after 'max'");
  }
  const max = parseInt(maxTok.value, 10);
  p.advance();

  p.skipNewlines();

  let body: FlowExpr[] = [];
  if (p.peek().type === TokenType.INDENT) {
    p.advance();
    body = parseIndentedFlowLines(p);
    if (p.peek().type === TokenType.DEDENT) p.advance();
  }

  return { kind: "LoopExpr", condition, max, body, loc };
}

function parseDelegate(p: ParserBase): FlowExpr {
  const loc = { line: p.peek().line, col: p.peek().col };
  p.advance(); // @>

  // Contract reference: #contract.name
  let contract = "";
  if (p.peek().type === TokenType.HASH) {
    p.advance();
    contract = "#" + p.expectIdent();
    while (p.peek().type === TokenType.DOT) {
      p.advance();
      contract += "." + p.expectIdent();
    }
  } else {
    contract = p.expectIdent();
  }

  // Optional version constraint
  if (p.peek().type === TokenType.OP_GTE || p.peek().type === TokenType.OP_LTE || p.peek().type === TokenType.OP_LT || p.peek().type === TokenType.OP_THEN) {
    p.advance(); // skip version constraint for now
    if (p.peek().type === TokenType.SEMVER || p.peek().type === TokenType.NUMBER) {
      p.advance();
    }
  }

  const node: FlowExpr & { kind: "DelegateExpr" } = {
    kind: "DelegateExpr",
    contract,
    bindings: [],
    loc,
  };

  return node;
}

function parseExchange(p: ParserBase): FlowExpr {
  const loc = { line: p.peek().line, col: p.peek().col };
  p.advance(); // <>

  // Target: dotted identifier, possibly with path segments (/get, /create)
  let target = p.expectIdent();
  while (
    p.peek().type === TokenType.DOT ||
    (p.peek().type === TokenType.IDENTIFIER && p.peek().value.startsWith("/"))
  ) {
    if (p.peek().type === TokenType.DOT) {
      p.advance();
      target += "." + p.expectIdent();
    } else {
      // Path segment like /get, /create
      target += p.peek().value;
      p.advance();
    }
  }

  return {
    kind: "ExchangeExpr",
    target,
    send: [],
    receive: [],
    loc,
  };
}

function isFlowOperator(type: TokenType): boolean {
  return (
    type === TokenType.OP_THEN ||
    type === TokenType.OP_PIPE ||
    type === TokenType.OP_PARALLEL ||
    type === TokenType.OP_IF ||
    type === TokenType.OP_MATCH ||
    type === TokenType.OP_ELSE ||
    type === TokenType.OP_LOOP ||
    type === TokenType.OP_DELEGATE ||
    type === TokenType.OP_ASYNC ||
    type === TokenType.OP_EXCHANGE ||
    type === TokenType.OP_TRANSFORM
  );
}
