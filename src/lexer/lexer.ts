import { PactLexError } from "../errors";
import { Source } from "../source";
import { SECTION_MAP, TokenType, type Token } from "./tokens";

export class Lexer {
  private source: Source;
  private tokens: Token[] = [];
  private indentStack: number[] = [0];
  private atLineStart = true;

  constructor(source: string) {
    this.source = new Source(source);
  }

  tokenize(): Token[] {
    while (!this.source.eof) {
      if (this.atLineStart) {
        this.handleLineStart();
      } else {
        this.scanToken();
      }
    }

    // Emit remaining DEDENTs
    while (this.indentStack.length > 1) {
      this.indentStack.pop();
      this.emit(TokenType.DEDENT, "", this.source.line, this.source.col);
    }

    this.emit(TokenType.EOF, "", this.source.line, this.source.col);
    return this.tokens;
  }

  private handleLineStart(): void {
    this.atLineStart = false;

    // Count leading spaces
    let spaces = 0;
    while (!this.source.eof && this.source.peek() === " ") {
      this.source.advance();
      spaces++;
    }

    // Skip blank lines
    if (this.source.eof || this.source.peek() === "\n") {
      if (!this.source.eof) {
        this.source.advance();
        this.atLineStart = true;
      }
      return;
    }

    // Skip comment-only lines (still emit NEWLINE before them, but handle indent)
    if (this.source.peek() === "-" && this.source.peekAt(1) === "-") {
      this.handleIndentation(spaces);
      this.scanComment();
      // Consume the newline after the comment
      if (!this.source.eof && this.source.peek() === "\n") {
        this.source.advance();
        this.atLineStart = true;
      }
      return;
    }

    this.handleIndentation(spaces);
  }

  private handleIndentation(spaces: number): void {
    const currentIndent = this.indentStack[this.indentStack.length - 1]!;

    if (spaces > currentIndent) {
      this.indentStack.push(spaces);
      this.emit(TokenType.INDENT, "", this.source.line, this.source.col);
    } else if (spaces < currentIndent) {
      while (
        this.indentStack.length > 1 &&
        this.indentStack[this.indentStack.length - 1]! > spaces
      ) {
        this.indentStack.pop();
        this.emit(TokenType.DEDENT, "", this.source.line, this.source.col);
      }
      if (this.indentStack[this.indentStack.length - 1] !== spaces) {
        throw new PactLexError(
          "Inconsistent indentation",
          this.source.line,
          this.source.col,
          this.source.currentLine(),
        );
      }
    }
  }

  private scanToken(): void {
    const ch = this.source.peek();

    // Skip inline whitespace
    if (ch === " ") {
      while (!this.source.eof && this.source.peek() === " ") {
        this.source.advance();
      }
      return;
    }

    // Newline
    if (ch === "\n") {
      this.emit(TokenType.NEWLINE, "\n", this.source.line, this.source.col);
      this.source.advance();
      this.atLineStart = true;
      return;
    }

    // Comment
    if (ch === "-" && this.source.peekAt(1) === "-") {
      this.scanComment();
      return;
    }

    // String
    if (ch === '"') {
      this.scanString();
      return;
    }

    // @ — section or delegate
    if (ch === "@") {
      this.scanAt();
      return;
    }

    // Multi-char operators (check longest match first)
    if (this.tryMultiCharOp()) {
      return;
    }

    // Single-char operators/delimiters
    if (this.trySingleCharOp()) {
      return;
    }

    // Numbers, timestamps, durations, semver
    if (isDigit(ch)) {
      this.scanNumber();
      return;
    }

    // Path tokens: /api/customers, /webhook/stripe
    if (ch === "/" && isIdentCharOrDigit(this.source.peekAt(1))) {
      this.scanPath();
      return;
    }

    // Identifiers
    if (isIdentStart(ch)) {
      this.scanIdentifier();
      return;
    }

    throw new PactLexError(
      `Unexpected character '${ch}'`,
      this.source.line,
      this.source.col,
      this.source.currentLine(),
    );
  }

  private scanComment(): void {
    const line = this.source.line;
    const col = this.source.col;
    this.source.advance(); // -
    this.source.advance(); // -
    let value = "--";
    while (!this.source.eof && this.source.peek() !== "\n") {
      value += this.source.advance();
    }
    this.emit(TokenType.COMMENT, value, line, col);
  }

  private scanString(): void {
    const line = this.source.line;
    const col = this.source.col;
    this.source.advance(); // opening "
    let value = "";
    while (!this.source.eof) {
      const ch = this.source.peek();
      if (ch === "\\") {
        this.source.advance();
        const next = this.source.advance();
        if (next === '"') {
          value += '"';
        } else if (next === "\\") {
          value += "\\";
        } else if (next === "n") {
          value += "\n";
        } else {
          value += "\\" + next;
        }
      } else if (ch === '"') {
        this.source.advance();
        this.emit(TokenType.STRING, value, line, col);
        return;
      } else if (ch === "\n") {
        throw new PactLexError(
          "Unterminated string",
          line,
          col,
          this.source.lines[line - 1] ?? "",
        );
      } else {
        value += this.source.advance();
      }
    }
    throw new PactLexError(
      "Unterminated string at end of file",
      line,
      col,
      this.source.lines[line - 1] ?? "",
    );
  }

  private scanAt(): void {
    const line = this.source.line;
    const col = this.source.col;
    this.source.advance(); // @

    // @> delegate
    if (this.source.peek() === ">") {
      this.source.advance();
      this.emit(TokenType.OP_DELEGATE, "@>", line, col);
      return;
    }

    // Section tokens
    const next = this.source.peek();
    if (next >= "A" && next <= "Z") {
      const sectionType = SECTION_MAP[next];
      if (sectionType) {
        this.source.advance();
        this.emit(sectionType, "@" + next, line, col);
        return;
      }
    }

    throw new PactLexError(
      `Invalid @ token: @${next}`,
      line,
      col,
      this.source.currentLine(),
    );
  }

  private tryMultiCharOp(): boolean {
    const ch = this.source.peek();
    const next = this.source.peekAt(1);
    const line = this.source.line;
    const col = this.source.col;

    let type: TokenType | null = null;
    let value = "";

    if (ch === ">" && next === ">") {
      type = TokenType.OP_PIPE;
      value = ">>";
    } else if (ch === ">" && next === "=") {
      type = TokenType.OP_GTE;
      value = ">=";
    } else if (ch === "<" && next === "=") {
      type = TokenType.OP_LTE;
      value = "<=";
    } else if (ch === "!" && next === "=") {
      type = TokenType.OP_NEQ;
      value = "!=";
    } else if (ch === "?" && next === "?") {
      type = TokenType.OP_MATCH;
      value = "??";
    } else if (ch === "?" && next === "!") {
      type = TokenType.OP_ELSE;
      value = "?!";
    } else if (ch === "~" && next === ">") {
      type = TokenType.OP_ASYNC;
      value = "~>";
    } else if (ch === "<" && next === ">") {
      type = TokenType.OP_EXCHANGE;
      value = "<>";
    } else if (ch === "<" && next === "-") {
      type = TokenType.OP_BIND;
      value = "<-";
    } else if (ch === "=" && next === ">") {
      type = TokenType.OP_TRANSFORM;
      value = "=>";
    }

    if (type) {
      this.source.advance();
      this.source.advance();
      this.emit(type, value, line, col);
      return true;
    }
    return false;
  }

  private trySingleCharOp(): boolean {
    const ch = this.source.peek();
    const line = this.source.line;
    const col = this.source.col;

    const map: Record<string, TokenType> = {
      ">": TokenType.OP_THEN,
      "<": TokenType.OP_LT,
      "|": TokenType.OP_PARALLEL,
      "?": TokenType.OP_IF,
      "!": TokenType.OP_NOT,
      "*": TokenType.OP_LOOP,
      "~": TokenType.OP_TILDE,
      "^": TokenType.OP_INDEX,
      "=": TokenType.OP_EQ,
      "&": TokenType.OP_AMP,
      "(": TokenType.LPAREN,
      ")": TokenType.RPAREN,
      "[": TokenType.LBRACKET,
      "]": TokenType.RBRACKET,
      ",": TokenType.COMMA,
      ":": TokenType.COLON,
      ".": TokenType.DOT,
      "#": TokenType.HASH,
    };

    const type = map[ch];
    if (type) {
      // Don't emit : as COLON when it's part of a bare value (e.g., translator:claude)
      // Check if preceded by identifier and followed by identifier char
      if (ch === ":" && isIdentStart(this.source.peekAt(1))) {
        return false; // let identifier scanner handle it
      }
      this.source.advance();
      this.emit(type, ch, line, col);
      return true;
    }
    return false;
  }

  private scanNumber(): void {
    const line = this.source.line;
    const col = this.source.col;
    const snap = this.source.snapshot();

    let num = "";
    while (!this.source.eof && isDigit(this.source.peek())) {
      num += this.source.advance();
    }

    // Timestamp: 2026-03-13T...
    if (
      num.length === 4 &&
      this.source.peek() === "-" &&
      isDigit(this.source.peekAt(1))
    ) {
      this.source.restore(snap);
      this.scanTimestamp();
      return;
    }

    // Semver: 1.0.0 (three dot-separated groups of digits)
    if (this.source.peek() === "." && isDigit(this.source.peekAt(1))) {
      const snap2 = this.source.snapshot();
      this.source.advance(); // .
      let minor = "";
      while (!this.source.eof && isDigit(this.source.peek())) {
        minor += this.source.advance();
      }
      if (this.source.peek() === "." && isDigit(this.source.peekAt(1))) {
        this.source.advance(); // .
        let patch = "";
        while (!this.source.eof && isDigit(this.source.peek())) {
          patch += this.source.advance();
        }
        // Check it's not followed by another dot (would be dotted id)
        if (!isIdentChar(this.source.peek())) {
          this.emit(
            TokenType.SEMVER,
            `${num}.${minor}.${patch}`,
            line,
            col,
          );
          return;
        }
      }
      // Not semver, restore and treat as number
      this.source.restore(snap2);
    }

    // Duration: digits + unit
    const peek = this.source.peek();
    if (
      (peek === "s" || peek === "m" || peek === "h" || peek === "d") &&
      !isIdentChar(this.source.peekAt(1))
    ) {
      const unit = this.source.advance();
      this.emit(TokenType.DURATION, num + unit, line, col);
      return;
    }

    // Duration with "ms"
    if (peek === "m" && this.source.peekAt(1) === "s" && !isIdentChar(this.source.peekAt(2))) {
      this.source.advance(); // m
      this.source.advance(); // s
      this.emit(TokenType.DURATION, num + "ms", line, col);
      return;
    }

    // Decimal: number with single dot followed by digits
    if (this.source.peek() === "." && isDigit(this.source.peekAt(1))) {
      num += this.source.advance(); // .
      while (!this.source.eof && isDigit(this.source.peek())) {
        num += this.source.advance();
      }
    }

    this.emit(TokenType.NUMBER, num, line, col);
  }

  private scanTimestamp(): void {
    const line = this.source.line;
    const col = this.source.col;
    let value = "";

    // Consume the full timestamp greedily
    while (
      !this.source.eof &&
      (isDigit(this.source.peek()) ||
        this.source.peek() === "-" ||
        this.source.peek() === "T" ||
        this.source.peek() === ":" ||
        this.source.peek() === "." ||
        this.source.peek() === "Z" ||
        this.source.peek() === "+")
    ) {
      value += this.source.advance();
      // Stop after Z
      if (value.endsWith("Z")) break;
    }

    this.emit(TokenType.TIMESTAMP, value, line, col);
  }

  private scanIdentifier(): void {
    const line = this.source.line;
    const col = this.source.col;
    let value = "";

    while (!this.source.eof && isIdentChar(this.source.peek())) {
      value += this.source.advance();
    }

    // Extend identifier to include :, -, @ when followed by alnum
    // This handles bare values like translator:claude-opus@4, env:STRIPE_KEY, sha256:abc
    while (!this.source.eof) {
      const ch = this.source.peek();
      if (
        (ch === ":" || ch === "-" || ch === "@") &&
        isIdentCharOrDigit(this.source.peekAt(1))
      ) {
        value += this.source.advance(); // consume : or - or @
        while (!this.source.eof && isIdentChar(this.source.peek())) {
          value += this.source.advance();
        }
      } else {
        break;
      }
    }

    this.emit(TokenType.IDENTIFIER, value, line, col);
  }

  private scanPath(): void {
    const line = this.source.line;
    const col = this.source.col;
    let value = "";

    // Consume path: /segment/segment/:param/{param}
    while (!this.source.eof) {
      const ch = this.source.peek();
      if (
        isIdentChar(ch) ||
        ch === "/" ||
        ch === "-" ||
        ch === ":" ||
        ch === "{" ||
        ch === "}"
      ) {
        value += this.source.advance();
      } else {
        break;
      }
    }

    this.emit(TokenType.IDENTIFIER, value, line, col);
  }

  private emit(type: TokenType, value: string, line: number, col: number): void {
    this.tokens.push({ type, value, line, col });
  }
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function isIdentStart(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_";
}

function isIdentChar(ch: string): boolean {
  return isIdentStart(ch) || isDigit(ch);
}

function isIdentCharOrDigit(ch: string): boolean {
  return isIdentStart(ch) || isDigit(ch);
}
