import { PactLexError } from "./errors";

export class Source {
  readonly text: string;
  readonly lines: string[];
  pos: number = 0;
  line: number = 1;
  col: number = 1;

  constructor(text: string) {
    if (text.includes("\r")) {
      throw new PactLexError(
        "CRLF line endings are not allowed; use LF only",
        1,
        1,
        text.split("\n")[0] ?? "",
      );
    }
    if (text.includes("\t")) {
      const lineIdx = text.split("\n").findIndex((l) => l.includes("\t"));
      const lineNum = lineIdx + 1;
      const lineText = text.split("\n")[lineIdx] ?? "";
      const colNum = lineText.indexOf("\t") + 1;
      throw new PactLexError(
        "Tabs are not allowed; use spaces for indentation",
        lineNum,
        colNum,
        lineText,
      );
    }
    if (text.charCodeAt(0) === 0xfeff) {
      throw new PactLexError(
        "BOM (byte order mark) is not allowed",
        1,
        1,
        text.split("\n")[0] ?? "",
      );
    }
    this.text = text;
    this.lines = text.split("\n");
  }

  get eof(): boolean {
    return this.pos >= this.text.length;
  }

  peek(): string {
    return this.text[this.pos] ?? "\0";
  }

  peekAt(offset: number): string {
    return this.text[this.pos + offset] ?? "\0";
  }

  advance(): string {
    const ch = this.text[this.pos] ?? "\0";
    this.pos++;
    if (ch === "\n") {
      this.line++;
      this.col = 1;
    } else {
      this.col++;
    }
    return ch;
  }

  match(expected: string): boolean {
    if (this.text.startsWith(expected, this.pos)) {
      for (let i = 0; i < expected.length; i++) {
        this.advance();
      }
      return true;
    }
    return false;
  }

  snapshot(): { pos: number; line: number; col: number } {
    return { pos: this.pos, line: this.line, col: this.col };
  }

  restore(snap: { pos: number; line: number; col: number }): void {
    this.pos = snap.pos;
    this.line = snap.line;
    this.col = snap.col;
  }

  currentLine(): string {
    return this.lines[this.line - 1] ?? "";
  }
}
