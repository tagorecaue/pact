export enum TokenType {
  // Sections
  SECTION_C = "SECTION_C",
  SECTION_I = "SECTION_I",
  SECTION_E = "SECTION_E",
  SECTION_K = "SECTION_K",
  SECTION_X = "SECTION_X",
  SECTION_V = "SECTION_V",
  SECTION_T = "SECTION_T",
  SECTION_F = "SECTION_F",
  SECTION_D = "SECTION_D",
  SECTION_S = "SECTION_S",
  SECTION_P = "SECTION_P",
  SECTION_M = "SECTION_M",
  SECTION_R = "SECTION_R",
  SECTION_L = "SECTION_L",
  SECTION_N = "SECTION_N",

  // Multi-char operators
  OP_PIPE = "OP_PIPE",         // >>
  OP_GTE = "OP_GTE",           // >=
  OP_LTE = "OP_LTE",           // <=
  OP_NEQ = "OP_NEQ",           // !=
  OP_MATCH = "OP_MATCH",       // ??
  OP_ELSE = "OP_ELSE",         // ?!
  OP_ASYNC = "OP_ASYNC",       // ~>
  OP_EXCHANGE = "OP_EXCHANGE", // <>
  OP_BIND = "OP_BIND",         // <-
  OP_TRANSFORM = "OP_TRANSFORM", // =>
  OP_DELEGATE = "OP_DELEGATE", // @>

  // Single-char operators
  OP_THEN = "OP_THEN",         // >
  OP_LT = "OP_LT",             // <
  OP_PARALLEL = "OP_PARALLEL", // |
  OP_IF = "OP_IF",             // ?
  OP_NOT = "OP_NOT",           // !
  OP_LOOP = "OP_LOOP",         // *
  OP_TILDE = "OP_TILDE",       // ~
  OP_INDEX = "OP_INDEX",       // ^
  OP_EQ = "OP_EQ",             // =
  OP_AMP = "OP_AMP",           // &

  // Delimiters
  LPAREN = "LPAREN",           // (
  RPAREN = "RPAREN",           // )
  LBRACKET = "LBRACKET",       // [
  RBRACKET = "RBRACKET",       // ]
  COMMA = "COMMA",             // ,
  COLON = "COLON",             // :
  DOT = "DOT",                 // .
  HASH = "HASH",               // #

  // Literals
  STRING = "STRING",
  NUMBER = "NUMBER",
  IDENTIFIER = "IDENTIFIER",
  TIMESTAMP = "TIMESTAMP",
  DURATION = "DURATION",
  SEMVER = "SEMVER",

  // Structure
  NEWLINE = "NEWLINE",
  INDENT = "INDENT",
  DEDENT = "DEDENT",
  EOF = "EOF",
  COMMENT = "COMMENT",
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  col: number;
}

export const SECTION_MAP: Record<string, TokenType> = {
  C: TokenType.SECTION_C,
  I: TokenType.SECTION_I,
  E: TokenType.SECTION_E,
  K: TokenType.SECTION_K,
  X: TokenType.SECTION_X,
  V: TokenType.SECTION_V,
  T: TokenType.SECTION_T,
  F: TokenType.SECTION_F,
  D: TokenType.SECTION_D,
  S: TokenType.SECTION_S,
  P: TokenType.SECTION_P,
  M: TokenType.SECTION_M,
  R: TokenType.SECTION_R,
  L: TokenType.SECTION_L,
  N: TokenType.SECTION_N,
};

export const KEYWORDS = new Set([
  "pact",
  "true",
  "false",
  "null",
  "none",
  "now",
  "forall",
  "exists",
  "in",
  "within",
  "max",
  "all",
  "any",
  "on",
  "bind",
  "send",
  "receive",
  "timeout",
  "expect",
  "compensate",
  "retry",
  "backoff",
  "base",
  "fallback",
  "escalate",
  "via",
  "abort",
  "natural",
  "goal",
  "accept",
  "reject",
  "priority",
  "domain",
  "author",
  "created",
  "tags",
  "use",
  "severity",
  "message",
  "enforced",
  "outcome",
  "goals",
  "trace",
  "effects",
  "hash",
  "chain",
  "verified_by",
  "verified_at",
  "summary",
  "offers",
  "accepts",
  "trust_levels",
  "locked",
  "negotiable",
  "free",
  "objective",
  "strategy",
  "freedom",
  "prefer",
  "when",
  "never",
  "always",
  "choose_order",
  "choose_method",
  "skip_unnecessary",
  "type",
  "language",
  "source",
  "compiled",
  "created_by",
  "created_at",
  "reasoning_time",
  "metrics",
  "invalidate_on",
  "description",
  "params",
  "scope",
  "constraints",
  "defaults",
  "str",
  "int",
  "dec",
  "bool",
  "ts",
  "dur",
  "id",
  "any",
  "ref",
  "list",
  "map",
  "opt",
  "enum",
  "unique",
  "matches",
  "min",
  "max",
  "http",
  "cron",
  "event",
  "webhook",
  "manual",
  "queue",
  "watch",
  "delay",
  "after",
]);
