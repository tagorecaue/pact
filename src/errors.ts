export class PactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PactError";
  }
}

export class PactLexError extends PactError {
  readonly line: number;
  readonly col: number;
  readonly sourceLine: string;

  constructor(message: string, line: number, col: number, sourceLine: string) {
    super(formatError("LexError", message, line, col, sourceLine));
    this.name = "PactLexError";
    this.line = line;
    this.col = col;
    this.sourceLine = sourceLine;
  }
}

export class PactParseError extends PactError {
  readonly line: number;
  readonly col: number;
  readonly sourceLine: string;

  constructor(message: string, line: number, col: number, sourceLine: string) {
    super(formatError("ParseError", message, line, col, sourceLine));
    this.name = "PactParseError";
    this.line = line;
    this.col = col;
    this.sourceLine = sourceLine;
  }
}

function formatError(
  kind: string,
  message: string,
  line: number,
  col: number,
  sourceLine: string,
): string {
  const caret = " ".repeat(col - 1) + "^";
  return `${kind} at ${line}:${col}: ${message}\n  ${sourceLine}\n  ${caret}`;
}
