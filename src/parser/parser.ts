import { PactParseError } from "../errors";
import { Lexer } from "../lexer/lexer";
import type { Token } from "../lexer/tokens";
import { TokenType } from "../lexer/tokens";
import type {
  PactFile,
  Section,
  ContractSection,
  IntentSection,
  EntitiesSection,
  ConstraintsSection,
  ExecutionSection,
  EvidenceSection,
  TriggersSection,
  FallbacksSection,
  DependenciesSection,
  SchemaSection,
  PolicySection,
  MixinSection,
  ReasoningSection,
  LearnedSection,
  NegotiateSection,
  EntityDef,
  FieldDef,
  FieldModifier,
  ConstraintDef,
  TriggerDef,
  FallbackHandler,
  FallbackAction,
  DependencyDef,
  BindingDef,
  SchemaDef,
  SchemaFieldDef,
  InlineConstraint,
  StrategyRule,
  LockedRule,
  GenericField,
  NegotiateResource,
  TrustLevels,
  UseDirective,
  VersionHeader,
  TypeExpr,
  Expression,
} from "./ast";
import { parseTypeExpr } from "./types";
import { parseExpression } from "./expressions";
import { parseFlowBlock } from "./flow";

export interface ParserBase {
  cursor: number;
  peek(): Token;
  peekAt(offset: number): Token | undefined;
  advance(): Token;
  expect(type: TokenType): Token;
  match(type: TokenType): boolean;
  expectIdent(): string;
  expectKeyword(kw: string): void;
  error(msg: string): never;
  isAtEnd(): boolean;
  isAtLineStart(): boolean;
  isAtSectionStart(): boolean;
  isAtDedent(): boolean;
  skipNewlines(): void;
  tokenAt(idx: number): Token | undefined;
}

export class Parser implements ParserBase {
  private tokens: Token[];
  cursor: number = 0;
  private sourceLines: string[];

  constructor(tokens: Token[], sourceLines: string[]) {
    // Filter out comments
    this.tokens = tokens.filter((t) => t.type !== TokenType.COMMENT);
    this.sourceLines = sourceLines;
  }

  parse(): PactFile {
    const header = this.parseHeader();
    this.skipNewlines();

    const sections: Section[] = [];
    const seenSections = new Set<string>();

    while (!this.isAtEnd()) {
      this.skipNewlines();
      if (this.isAtEnd()) break;

      const section = this.parseSection();
      if (section) {
        // Check for duplicates
        if (seenSections.has(section.kind)) {
          this.error(`Duplicate section: ${section.kind}`);
        }
        seenSections.add(section.kind);
        sections.push(section);
      }
    }

    // Validate @R and @X mutual exclusion
    if (
      seenSections.has("ExecutionSection") &&
      seenSections.has("ReasoningSection")
    ) {
      this.error(
        "@R and @X are mutually exclusive — a contract cannot have both",
      );
    }

    return {
      kind: "PactFile",
      header,
      sections,
      loc: { line: 1, col: 1 },
    };
  }

  private parseHeader(): VersionHeader {
    const tok = this.peek();
    if (tok.type !== TokenType.IDENTIFIER || tok.value !== "pact") {
      this.error("Expected 'pact' version header");
    }
    this.advance();
    const versionTok = this.peek();
    if (versionTok.type !== TokenType.IDENTIFIER || !versionTok.value.startsWith("v")) {
      this.error(`Expected version identifier (e.g., 'v1'), got '${versionTok.value}'`);
    }
    const version = versionTok.value;
    this.advance();
    return { kind: "VersionHeader", version, loc: { line: tok.line, col: tok.col } };
  }

  private parseSection(): Section | null {
    const tok = this.peek();

    switch (tok.type) {
      case TokenType.SECTION_C:
        return this.parseContractSection();
      case TokenType.SECTION_I:
        return this.parseIntentSection();
      case TokenType.SECTION_E:
        return this.parseEntitiesSection();
      case TokenType.SECTION_K:
        return this.parseConstraintsSection();
      case TokenType.SECTION_X:
        return this.parseExecutionSection();
      case TokenType.SECTION_V:
        return this.parseEvidenceSection();
      case TokenType.SECTION_T:
        return this.parseTriggersSection();
      case TokenType.SECTION_F:
        return this.parseFallbacksSection();
      case TokenType.SECTION_D:
        return this.parseDependenciesSection();
      case TokenType.SECTION_S:
        return this.parseSchemaSection();
      case TokenType.SECTION_P:
        return this.parsePolicySection();
      case TokenType.SECTION_M:
        return this.parseMixinSection();
      case TokenType.SECTION_R:
        return this.parseReasoningSection();
      case TokenType.SECTION_L:
        return this.parseLearnedSection();
      case TokenType.SECTION_N:
        return this.parseNegotiateSection();
      default:
        this.error(`Expected section, got '${tok.value}'`);
    }
  }

  // ── @C Contract ──

  private parseContractSection(): ContractSection {
    const loc = { line: this.peek().line, col: this.peek().col };
    this.advance(); // @C

    // Positional args: name, version
    const nameParts = [this.expectIdent()];
    while (this.peek().type === TokenType.DOT) {
      this.advance();
      nameParts.push(this.expectIdent());
    }
    const name = nameParts.join(".");

    const version = this.expectSemverOrIdent();
    this.skipNewlines();

    const section: ContractSection = {
      kind: "ContractSection",
      name,
      version,
      loc,
    };

    // Indented fields
    if (this.peek().type === TokenType.INDENT) {
      this.advance();

      while (
        !this.isAtEnd() &&
        this.peek().type !== TokenType.DEDENT &&
        !this.isAtSectionStart()
      ) {
        this.skipNewlines();
        if (this.peek().type === TokenType.DEDENT || this.isAtEnd()) break;

        const fieldName = this.expectIdent();
        switch (fieldName) {
          case "domain": {
            const parts = [this.expectIdent()];
            while (this.peek().type === TokenType.DOT) {
              this.advance();
              parts.push(this.expectIdent());
            }
            section.domain = parts.join(".");
            break;
          }
          case "author":
            section.author = this.consumeRestOfLine();
            break;
          case "created":
            section.created = this.expectTimestampOrIdent();
            break;
          case "tags":
            section.tags = this.consumeIdentList();
            break;
          case "use":
            if (!section.use) section.use = [];
            section.use.push(this.parseUseDirective());
            break;
          default:
            this.consumeRestOfLine();
        }
        this.skipNewlines();
      }

      if (this.peek().type === TokenType.DEDENT) this.advance();
    }

    return section;
  }

  private parseUseDirective(): UseDirective {
    const loc = { line: this.peek().line, col: this.peek().col };
    // #contract.name
    this.expect(TokenType.HASH);
    let contract = "#" + this.expectIdent();
    while (this.peek().type === TokenType.DOT) {
      this.advance();
      contract += "." + this.expectIdent();
    }

    const params: { name: string; value: string }[] = [];
    this.skipNewlines();

    if (this.peek().type === TokenType.INDENT) {
      this.advance();
      while (
        !this.isAtEnd() &&
        this.peek().type !== TokenType.DEDENT
      ) {
        this.skipNewlines();
        if (this.peek().type === TokenType.DEDENT) break;
        const pName = this.expectIdent();
        const pValue = this.consumeRestOfLine();
        params.push({ name: pName, value: pValue });
        this.skipNewlines();
      }
      if (this.peek().type === TokenType.DEDENT) this.advance();
    }

    return { kind: "UseDirective", contract, params, loc };
  }

  // ── @I Intent ──

  private parseIntentSection(): IntentSection {
    const loc = { line: this.peek().line, col: this.peek().col };
    this.advance(); // @I
    this.skipNewlines();

    const section: IntentSection = { kind: "IntentSection", loc };

    if (this.peek().type === TokenType.INDENT) {
      this.advance();

      while (
        !this.isAtEnd() &&
        this.peek().type !== TokenType.DEDENT &&
        !this.isAtSectionStart()
      ) {
        this.skipNewlines();
        if (this.peek().type === TokenType.DEDENT || this.isAtEnd()) break;

        const fieldName = this.expectIdent();
        switch (fieldName) {
          case "natural":
            section.natural = this.expectString();
            break;
          case "goal":
            section.goal = parseExpression(this);
            break;
          case "accept":
            section.accept = this.parseStringList();
            break;
          case "reject":
            section.reject = this.parseStringList();
            break;
          case "priority":
            section.priority = this.expectIdent();
            break;
          case "timeout":
            section.timeout = this.expectDuration();
            break;
          default:
            this.consumeRestOfLine();
        }
        this.skipNewlines();
      }

      if (this.peek().type === TokenType.DEDENT) this.advance();
    }

    return section;
  }

  // ── @E Entities ──

  private parseEntitiesSection(): EntitiesSection {
    const loc = { line: this.peek().line, col: this.peek().col };
    this.advance(); // @E
    this.skipNewlines();

    const entities: EntityDef[] = [];

    if (this.peek().type === TokenType.INDENT) {
      this.advance();

      while (
        !this.isAtEnd() &&
        this.peek().type !== TokenType.DEDENT &&
        !this.isAtSectionStart()
      ) {
        this.skipNewlines();
        if (this.peek().type === TokenType.DEDENT || this.isAtEnd()) break;

        const entity = this.parseEntityDef();
        entities.push(entity);
        this.skipNewlines();
      }

      if (this.peek().type === TokenType.DEDENT) this.advance();
    }

    return { kind: "EntitiesSection", entities, loc };
  }

  private parseEntityDef(): EntityDef {
    const loc = { line: this.peek().line, col: this.peek().col };
    const name = this.expectIdent();
    this.skipNewlines();

    const fields: FieldDef[] = [];

    if (this.peek().type === TokenType.INDENT) {
      this.advance();

      while (
        !this.isAtEnd() &&
        this.peek().type !== TokenType.DEDENT
      ) {
        this.skipNewlines();
        if (this.peek().type === TokenType.DEDENT || this.isAtEnd()) break;

        fields.push(this.parseFieldDef());
        this.skipNewlines();
      }

      if (this.peek().type === TokenType.DEDENT) this.advance();
    }

    return { kind: "EntityDef", name, fields, loc };
  }

  private parseFieldDef(): FieldDef {
    const loc = { line: this.peek().line, col: this.peek().col };
    const name = this.expectIdent();
    const type = parseTypeExpr(this);

    const modifiers: FieldModifier[] = [];
    let defaultValue: string | undefined;

    // Collect modifiers and default value
    while (
      !this.isAtEnd() &&
      this.peek().type !== TokenType.NEWLINE &&
      this.peek().type !== TokenType.DEDENT &&
      this.peek().type !== TokenType.EOF
    ) {
      const t = this.peek();
      if (t.type === TokenType.OP_NOT) {
        modifiers.push("!");
        this.advance();
      } else if (t.type === TokenType.OP_IF) {
        modifiers.push("?");
        this.advance();
      } else if (t.type === TokenType.OP_LOOP) {
        modifiers.push("*");
        this.advance();
      } else if (t.type === TokenType.OP_INDEX) {
        modifiers.push("^");
        this.advance();
      } else if (t.type === TokenType.OP_TILDE) {
        modifiers.push("~");
        this.advance();
      } else if (t.type === TokenType.OP_EQ) {
        this.advance();
        defaultValue = this.peek().value;
        this.advance();
      } else {
        break;
      }
    }

    return { kind: "FieldDef", name, type, modifiers, defaultValue, loc };
  }

  // ── @K Constraints ──

  private parseConstraintsSection(): ConstraintsSection {
    const loc = { line: this.peek().line, col: this.peek().col };
    this.advance(); // @K
    this.skipNewlines();

    const constraints: ConstraintDef[] = [];

    if (this.peek().type === TokenType.INDENT) {
      this.advance();

      while (
        !this.isAtEnd() &&
        this.peek().type !== TokenType.DEDENT &&
        !this.isAtSectionStart()
      ) {
        this.skipNewlines();
        if (this.peek().type === TokenType.DEDENT || this.isAtEnd()) break;

        constraints.push(this.parseConstraintDef());
        this.skipNewlines();
      }

      if (this.peek().type === TokenType.DEDENT) this.advance();
    }

    return { kind: "ConstraintsSection", constraints, loc };
  }

  private parseConstraintDef(): ConstraintDef {
    const loc = { line: this.peek().line, col: this.peek().col };
    const expression = parseExpression(this);
    this.skipNewlines();

    const constraint: ConstraintDef = {
      kind: "ConstraintDef",
      expression,
      loc,
    };

    // Optional indented attributes
    if (this.peek().type === TokenType.INDENT) {
      this.advance();

      while (
        !this.isAtEnd() &&
        this.peek().type !== TokenType.DEDENT
      ) {
        this.skipNewlines();
        if (this.peek().type === TokenType.DEDENT || this.isAtEnd()) break;

        const attrName = this.expectIdent();
        switch (attrName) {
          case "severity":
            constraint.severity = this.expectIdent();
            break;
          case "message":
            constraint.message = this.expectString();
            break;
          case "enforced":
            constraint.enforced = this.expectIdent();
            break;
          default:
            this.consumeRestOfLine();
        }
        this.skipNewlines();
      }

      if (this.peek().type === TokenType.DEDENT) this.advance();
    }

    return constraint;
  }

  // ── @X Execution ──

  private parseExecutionSection(): ExecutionSection {
    const loc = { line: this.peek().line, col: this.peek().col };
    this.advance(); // @X
    this.skipNewlines();

    let flow: import("./ast").FlowExpr[] = [];

    if (this.peek().type === TokenType.INDENT) {
      this.advance();
      flow = parseFlowBlock(this);
      if (this.peek().type === TokenType.DEDENT) this.advance();
    }

    return { kind: "ExecutionSection", flow, loc };
  }

  // ── @V Evidence ──

  private parseEvidenceSection(): EvidenceSection {
    const loc = { line: this.peek().line, col: this.peek().col };
    this.advance(); // @V
    this.skipNewlines();

    const fields: GenericField[] = [];

    if (this.peek().type === TokenType.INDENT) {
      this.advance();
      this.parseGenericFields(fields);
      if (this.peek().type === TokenType.DEDENT) this.advance();
    }

    return { kind: "EvidenceSection", fields, loc };
  }

  // ── @T Triggers ──

  private parseTriggersSection(): TriggersSection {
    const loc = { line: this.peek().line, col: this.peek().col };
    this.advance(); // @T
    this.skipNewlines();

    const triggers: TriggerDef[] = [];

    if (this.peek().type === TokenType.INDENT) {
      this.advance();

      while (
        !this.isAtEnd() &&
        this.peek().type !== TokenType.DEDENT &&
        !this.isAtSectionStart()
      ) {
        this.skipNewlines();
        if (this.peek().type === TokenType.DEDENT || this.isAtEnd()) break;

        triggers.push(this.parseTriggerDef());
        this.skipNewlines();
      }

      if (this.peek().type === TokenType.DEDENT) this.advance();
    }

    return { kind: "TriggersSection", triggers, loc };
  }

  private parseTriggerDef(): TriggerDef {
    const loc = { line: this.peek().line, col: this.peek().col };
    const type = this.expectIdent();
    const args = this.consumeIdentList();
    this.skipNewlines();

    const attrs: GenericField[] = [];

    if (this.peek().type === TokenType.INDENT) {
      this.advance();
      this.parseGenericFields(attrs);
      if (this.peek().type === TokenType.DEDENT) this.advance();
    }

    return { kind: "TriggerDef", type, args, attrs, loc };
  }

  // ── @F Fallbacks ──

  private parseFallbacksSection(): FallbacksSection {
    const loc = { line: this.peek().line, col: this.peek().col };
    this.advance(); // @F
    this.skipNewlines();

    const handlers: FallbackHandler[] = [];

    if (this.peek().type === TokenType.INDENT) {
      this.advance();

      while (
        !this.isAtEnd() &&
        this.peek().type !== TokenType.DEDENT &&
        !this.isAtSectionStart()
      ) {
        this.skipNewlines();
        if (this.peek().type === TokenType.DEDENT || this.isAtEnd()) break;

        handlers.push(this.parseFallbackHandler());
        this.skipNewlines();
      }

      if (this.peek().type === TokenType.DEDENT) this.advance();
    }

    return { kind: "FallbacksSection", handlers, loc };
  }

  private parseFallbackHandler(): FallbackHandler {
    const loc = { line: this.peek().line, col: this.peek().col };
    this.expectKeyword("on");
    const event = this.expectIdent();
    this.skipNewlines();

    const actions: FallbackAction[] = [];

    if (this.peek().type === TokenType.INDENT) {
      this.advance();

      while (
        !this.isAtEnd() &&
        this.peek().type !== TokenType.DEDENT
      ) {
        this.skipNewlines();
        if (this.peek().type === TokenType.DEDENT || this.isAtEnd()) break;

        actions.push(this.parseFallbackAction());
        this.skipNewlines();
      }

      if (this.peek().type === TokenType.DEDENT) this.advance();
    }

    return { kind: "FallbackHandler", event, actions, loc };
  }

  private parseFallbackAction(): FallbackAction {
    const loc = { line: this.peek().line, col: this.peek().col };
    const keyword = this.expectIdent();

    switch (keyword) {
      case "retry": {
        const count = parseInt(this.peek().value, 10);
        this.advance();
        let backoff: string | undefined;
        let base: string | undefined;
        if (
          this.peek().type === TokenType.IDENTIFIER &&
          this.peek().value === "backoff"
        ) {
          this.advance();
          backoff = this.expectIdent();
          if (
            this.peek().type === TokenType.IDENTIFIER &&
            this.peek().value === "base"
          ) {
            this.advance();
            base = this.expectDuration();
          }
        }
        return { kind: "RetryAction", count, backoff, base, loc };
      }
      case "fallback": {
        const step = this.expectIdent();
        return { kind: "FallbackStepAction", step, loc };
      }
      case "escalate": {
        const target = this.expectIdent();
        let via = "";
        if (
          this.peek().type === TokenType.IDENTIFIER &&
          this.peek().value === "via"
        ) {
          this.advance();
          via = this.expectIdent();
        }
        return { kind: "EscalateAction", target, via, loc };
      }
      case "abort": {
        const message = this.expectString();
        return { kind: "AbortAction", message, loc };
      }
      default: {
        const args = this.consumeIdentAndStringList();
        return { kind: "GenericAction", name: keyword, args, loc };
      }
    }
  }

  // ── @D Dependencies ──

  private parseDependenciesSection(): DependenciesSection {
    const loc = { line: this.peek().line, col: this.peek().col };
    this.advance(); // @D
    this.skipNewlines();

    const deps: DependencyDef[] = [];

    if (this.peek().type === TokenType.INDENT) {
      this.advance();

      while (
        !this.isAtEnd() &&
        this.peek().type !== TokenType.DEDENT &&
        !this.isAtSectionStart()
      ) {
        this.skipNewlines();
        if (this.peek().type === TokenType.DEDENT || this.isAtEnd()) break;

        deps.push(this.parseDependencyDef());
        this.skipNewlines();
      }

      if (this.peek().type === TokenType.DEDENT) this.advance();
    }

    return { kind: "DependenciesSection", deps, loc };
  }

  private parseDependencyDef(): DependencyDef {
    const loc = { line: this.peek().line, col: this.peek().col };

    // #contract.name
    this.expect(TokenType.HASH);
    let contract = this.expectIdent();
    while (this.peek().type === TokenType.DOT) {
      this.advance();
      contract += "." + this.expectIdent();
    }

    // Version constraints: >=1.0.0 <2.0.0
    const versionConstraints: string[] = [];
    while (
      this.peek().type === TokenType.OP_GTE ||
      this.peek().type === TokenType.OP_LTE ||
      this.peek().type === TokenType.OP_LT ||
      this.peek().type === TokenType.OP_THEN ||
      this.peek().type === TokenType.OP_EQ
    ) {
      const op = this.peek().value;
      this.advance();
      const ver = this.expectSemverOrIdent();
      versionConstraints.push(op + ver);
    }

    this.skipNewlines();

    const bindings: BindingDef[] = [];

    if (this.peek().type === TokenType.INDENT) {
      this.advance();

      while (
        !this.isAtEnd() &&
        this.peek().type !== TokenType.DEDENT
      ) {
        this.skipNewlines();
        if (this.peek().type === TokenType.DEDENT || this.isAtEnd()) break;

        if (
          this.peek().type === TokenType.IDENTIFIER &&
          this.peek().value === "bind"
        ) {
          this.advance();
          const bLoc = { line: this.peek().line, col: this.peek().col };
          let local = this.expectIdent();
          while (this.peek().type === TokenType.DOT) {
            this.advance();
            local += "." + this.expectIdent();
          }

          let operator = "<-";
          if (this.peek().type === TokenType.OP_BIND) {
            operator = "<-";
            this.advance();
          } else if (this.peek().type === TokenType.OP_EQ) {
            operator = "=";
            this.advance();
          }

          let remote = this.consumeRestOfLine();
          bindings.push({
            kind: "BindingDef",
            local,
            operator,
            remote,
            loc: bLoc,
          });
        } else {
          this.consumeRestOfLine();
        }
        this.skipNewlines();
      }

      if (this.peek().type === TokenType.DEDENT) this.advance();
    }

    return { kind: "DependencyDef", contract, versionConstraints, bindings, loc };
  }

  // ── @S Schema ──

  private parseSchemaSection(): SchemaSection {
    const loc = { line: this.peek().line, col: this.peek().col };
    this.advance(); // @S
    this.skipNewlines();

    const schemas: SchemaDef[] = [];

    if (this.peek().type === TokenType.INDENT) {
      this.advance();

      while (
        !this.isAtEnd() &&
        this.peek().type !== TokenType.DEDENT &&
        !this.isAtSectionStart()
      ) {
        this.skipNewlines();
        if (this.peek().type === TokenType.DEDENT || this.isAtEnd()) break;

        schemas.push(this.parseSchemaDef());
        this.skipNewlines();
      }

      if (this.peek().type === TokenType.DEDENT) this.advance();
    }

    return { kind: "SchemaSection", schemas, loc };
  }

  private parseSchemaDef(): SchemaDef {
    const loc = { line: this.peek().line, col: this.peek().col };
    const name = this.expectIdent();
    this.skipNewlines();

    const fields: SchemaFieldDef[] = [];

    if (this.peek().type === TokenType.INDENT) {
      this.advance();

      while (
        !this.isAtEnd() &&
        this.peek().type !== TokenType.DEDENT
      ) {
        this.skipNewlines();
        if (this.peek().type === TokenType.DEDENT || this.isAtEnd()) break;

        fields.push(this.parseSchemaFieldDef());
        this.skipNewlines();
      }

      if (this.peek().type === TokenType.DEDENT) this.advance();
    }

    return { kind: "SchemaDef", name, fields, loc };
  }

  private parseSchemaFieldDef(): SchemaFieldDef {
    const loc = { line: this.peek().line, col: this.peek().col };
    const name = this.expectIdent();
    const type = parseTypeExpr(this);

    const modifiers: FieldModifier[] = [];
    let defaultValue: string | undefined;
    const constraints: InlineConstraint[] = [];

    while (
      !this.isAtEnd() &&
      this.peek().type !== TokenType.NEWLINE &&
      this.peek().type !== TokenType.DEDENT &&
      this.peek().type !== TokenType.EOF
    ) {
      const t = this.peek();
      if (t.type === TokenType.OP_NOT) {
        modifiers.push("!");
        this.advance();
      } else if (t.type === TokenType.OP_IF) {
        modifiers.push("?");
        this.advance();
      } else if (t.type === TokenType.OP_LOOP) {
        modifiers.push("*");
        this.advance();
      } else if (t.type === TokenType.OP_INDEX) {
        modifiers.push("^");
        this.advance();
      } else if (t.type === TokenType.OP_TILDE) {
        modifiers.push("~");
        this.advance();
      } else if (t.type === TokenType.OP_EQ) {
        this.advance();
        defaultValue = this.peek().value;
        this.advance();
      } else if (
        t.type === TokenType.IDENTIFIER &&
        (t.value === "min" || t.value === "max" || t.value === "matches")
      ) {
        const cType = t.value;
        this.advance();
        const cValue = this.peek().value;
        this.advance();
        constraints.push({
          kind: "InlineConstraint",
          type: cType,
          value: cValue,
          loc: { line: t.line, col: t.col },
        });
      } else if (t.type === TokenType.OP_THEN) {
        // > as inline constraint
        this.advance();
        const cValue = this.peek().value;
        this.advance();
        constraints.push({
          kind: "InlineConstraint",
          type: ">",
          value: cValue,
          loc: { line: t.line, col: t.col },
        });
      } else if (t.type === TokenType.OP_LT) {
        this.advance();
        const cValue = this.peek().value;
        this.advance();
        constraints.push({
          kind: "InlineConstraint",
          type: "<",
          value: cValue,
          loc: { line: t.line, col: t.col },
        });
      } else {
        break;
      }
    }

    return {
      kind: "SchemaFieldDef",
      name,
      type,
      modifiers,
      defaultValue,
      constraints,
      loc,
    };
  }

  // ── @P Policy ──

  private parsePolicySection(): PolicySection {
    const loc = { line: this.peek().line, col: this.peek().col };
    this.advance(); // @P

    // Positional: name version
    const nameParts = [this.expectIdent()];
    while (this.peek().type === TokenType.DOT) {
      this.advance();
      nameParts.push(this.expectIdent());
    }
    const name = nameParts.join(".");
    const version = this.expectSemverOrIdent();
    this.skipNewlines();

    const section: PolicySection = {
      kind: "PolicySection",
      name,
      version,
      constraints: [],
      defaults: [],
      loc,
    };

    if (this.peek().type === TokenType.INDENT) {
      this.advance();

      while (
        !this.isAtEnd() &&
        this.peek().type !== TokenType.DEDENT &&
        !this.isAtSectionStart()
      ) {
        this.skipNewlines();
        if (this.peek().type === TokenType.DEDENT || this.isAtEnd()) break;

        const fieldName = this.expectIdent();
        switch (fieldName) {
          case "domain":
            section.domain = this.expectIdent();
            break;
          case "scope": {
            const scopeVal = this.expectIdent();
            section.scope = scopeVal;
            if (scopeVal === "domain") {
              section.scopeValue = this.consumeRestOfLine();
            }
            break;
          }
          case "constraints":
            this.skipNewlines();
            if (this.peek().type === TokenType.INDENT) {
              this.advance();
              this.parseGenericFields(section.constraints);
              if (this.peek().type === TokenType.DEDENT) this.advance();
            }
            break;
          case "defaults":
            this.skipNewlines();
            if (this.peek().type === TokenType.INDENT) {
              this.advance();
              this.parseGenericFields(section.defaults);
              if (this.peek().type === TokenType.DEDENT) this.advance();
            }
            break;
          default:
            this.consumeRestOfLine();
        }
        this.skipNewlines();
      }

      if (this.peek().type === TokenType.DEDENT) this.advance();
    }

    return section;
  }

  // ── @M Mixin ──

  private parseMixinSection(): MixinSection {
    const loc = { line: this.peek().line, col: this.peek().col };
    this.advance(); // @M

    const nameParts = [this.expectIdent()];
    while (this.peek().type === TokenType.DOT) {
      this.advance();
      nameParts.push(this.expectIdent());
    }
    const name = nameParts.join(".");
    this.skipNewlines();

    const section: MixinSection = {
      kind: "MixinSection",
      name,
      params: [],
      loc,
    };

    if (this.peek().type === TokenType.INDENT) {
      this.advance();

      while (
        !this.isAtEnd() &&
        this.peek().type !== TokenType.DEDENT &&
        !this.isAtSectionStart()
      ) {
        this.skipNewlines();
        if (this.peek().type === TokenType.DEDENT || this.isAtEnd()) break;

        const fieldName = this.expectIdent();
        switch (fieldName) {
          case "description":
            section.description = this.expectString();
            break;
          case "params":
            this.skipNewlines();
            if (this.peek().type === TokenType.INDENT) {
              this.advance();
              while (
                !this.isAtEnd() &&
                this.peek().type !== TokenType.DEDENT
              ) {
                this.skipNewlines();
                if (this.peek().type === TokenType.DEDENT) break;
                section.params.push(this.parseFieldDef());
                this.skipNewlines();
              }
              if (this.peek().type === TokenType.DEDENT) this.advance();
            }
            break;
          default:
            this.consumeRestOfLine();
        }
        this.skipNewlines();
      }

      if (this.peek().type === TokenType.DEDENT) this.advance();
    }

    return section;
  }

  // ── @R Reasoning ──

  private parseReasoningSection(): ReasoningSection {
    const loc = { line: this.peek().line, col: this.peek().col };
    this.advance(); // @R
    this.skipNewlines();

    const section: ReasoningSection = {
      kind: "ReasoningSection",
      strategy: [],
      freedom: [],
      locked: [],
      loc,
    };

    if (this.peek().type === TokenType.INDENT) {
      this.advance();

      while (
        !this.isAtEnd() &&
        this.peek().type !== TokenType.DEDENT &&
        !this.isAtSectionStart()
      ) {
        this.skipNewlines();
        if (this.peek().type === TokenType.DEDENT || this.isAtEnd()) break;

        const fieldName = this.expectIdent();
        switch (fieldName) {
          case "objective":
            section.objective = this.expectString();
            break;
          case "strategy":
            this.skipNewlines();
            if (this.peek().type === TokenType.INDENT) {
              this.advance();
              while (
                !this.isAtEnd() &&
                this.peek().type !== TokenType.DEDENT
              ) {
                this.skipNewlines();
                if (this.peek().type === TokenType.DEDENT) break;
                this.expectKeyword("prefer");
                const prefer = this.expectIdent();
                this.expectKeyword("when");
                const when = this.consumeRestOfLine();
                section.strategy.push({
                  kind: "StrategyRule",
                  prefer,
                  when,
                  loc: { line: this.peek().line, col: this.peek().col },
                });
                this.skipNewlines();
              }
              if (this.peek().type === TokenType.DEDENT) this.advance();
            }
            break;
          case "freedom":
            this.skipNewlines();
            if (this.peek().type === TokenType.INDENT) {
              this.advance();
              this.parseGenericFields(section.freedom);
              if (this.peek().type === TokenType.DEDENT) this.advance();
            }
            break;
          case "locked":
            this.skipNewlines();
            if (this.peek().type === TokenType.INDENT) {
              this.advance();
              while (
                !this.isAtEnd() &&
                this.peek().type !== TokenType.DEDENT
              ) {
                this.skipNewlines();
                if (this.peek().type === TokenType.DEDENT) break;
                const modifier = this.expectIdent() as "never" | "always";
                const action = this.consumeRestOfLine();
                section.locked.push({
                  kind: "LockedRule",
                  modifier,
                  action,
                  loc: { line: this.peek().line, col: this.peek().col },
                });
                this.skipNewlines();
              }
              if (this.peek().type === TokenType.DEDENT) this.advance();
            }
            break;
          default:
            this.consumeRestOfLine();
        }
        this.skipNewlines();
      }

      if (this.peek().type === TokenType.DEDENT) this.advance();
    }

    return section;
  }

  // ── @L Learned ──

  private parseLearnedSection(): LearnedSection {
    const loc = { line: this.peek().line, col: this.peek().col };
    this.advance(); // @L

    let version: string | undefined;
    if (this.peek().type === TokenType.IDENTIFIER) {
      version = this.peek().value;
      this.advance();
    }
    this.skipNewlines();

    const section: LearnedSection = {
      kind: "LearnedSection",
      version,
      fields: [],
      metrics: [],
      invalidateOn: [],
      loc,
    };

    if (this.peek().type === TokenType.INDENT) {
      this.advance();

      while (
        !this.isAtEnd() &&
        this.peek().type !== TokenType.DEDENT &&
        !this.isAtSectionStart()
      ) {
        this.skipNewlines();
        if (this.peek().type === TokenType.DEDENT || this.isAtEnd()) break;

        const fieldName = this.peek().value;
        if (fieldName === "metrics") {
          this.advance();
          this.skipNewlines();
          if (this.peek().type === TokenType.INDENT) {
            this.advance();
            this.parseGenericFields(section.metrics);
            if (this.peek().type === TokenType.DEDENT) this.advance();
          }
        } else if (fieldName === "invalidate_on") {
          this.advance();
          this.skipNewlines();
          if (this.peek().type === TokenType.INDENT) {
            this.advance();
            this.parseGenericFields(section.invalidateOn);
            if (this.peek().type === TokenType.DEDENT) this.advance();
          }
        } else {
          this.advance();
          const value = this.consumeRestOfLine();
          section.fields.push({
            kind: "GenericField",
            name: fieldName,
            value,
            children: [],
            loc: { line: this.peek().line, col: this.peek().col },
          });
        }
        this.skipNewlines();
      }

      if (this.peek().type === TokenType.DEDENT) this.advance();
    }

    return section;
  }

  // ── @N Negotiate ──

  private parseNegotiateSection(): NegotiateSection {
    const loc = { line: this.peek().line, col: this.peek().col };
    this.advance(); // @N
    this.skipNewlines();

    const section: NegotiateSection = {
      kind: "NegotiateSection",
      offers: [],
      accepts: [],
      trustLevels: {
        kind: "TrustLevels",
        locked: [],
        negotiable: [],
        free: [],
        loc,
      },
      loc,
    };

    if (this.peek().type === TokenType.INDENT) {
      this.advance();

      while (
        !this.isAtEnd() &&
        this.peek().type !== TokenType.DEDENT &&
        !this.isAtSectionStart()
      ) {
        this.skipNewlines();
        if (this.peek().type === TokenType.DEDENT || this.isAtEnd()) break;

        const fieldName = this.expectIdent();
        switch (fieldName) {
          case "offers":
            this.skipNewlines();
            if (this.peek().type === TokenType.INDENT) {
              this.advance();
              this.parseNegotiateResources(section.offers);
              if (this.peek().type === TokenType.DEDENT) this.advance();
            }
            break;
          case "accepts":
            this.skipNewlines();
            if (this.peek().type === TokenType.INDENT) {
              this.advance();
              this.parseNegotiateResources(section.accepts);
              if (this.peek().type === TokenType.DEDENT) this.advance();
            }
            break;
          case "trust_levels":
            this.skipNewlines();
            if (this.peek().type === TokenType.INDENT) {
              this.advance();
              this.parseTrustLevels(section.trustLevels);
              if (this.peek().type === TokenType.DEDENT) this.advance();
            }
            break;
          default:
            this.consumeRestOfLine();
        }
        this.skipNewlines();
      }

      if (this.peek().type === TokenType.DEDENT) this.advance();
    }

    return section;
  }

  private parseNegotiateResources(resources: NegotiateResource[]): void {
    while (
      !this.isAtEnd() &&
      this.peek().type !== TokenType.DEDENT
    ) {
      this.skipNewlines();
      if (this.peek().type === TokenType.DEDENT || this.isAtEnd()) break;

      const loc = { line: this.peek().line, col: this.peek().col };
      const name = this.expectIdent();
      this.skipNewlines();

      const fields: GenericField[] = [];
      if (this.peek().type === TokenType.INDENT) {
        this.advance();
        this.parseGenericFields(fields);
        if (this.peek().type === TokenType.DEDENT) this.advance();
      }

      resources.push({ kind: "NegotiateResource", name, fields, loc });
      this.skipNewlines();
    }
  }

  private parseTrustLevels(trust: TrustLevels): void {
    while (
      !this.isAtEnd() &&
      this.peek().type !== TokenType.DEDENT
    ) {
      this.skipNewlines();
      if (this.peek().type === TokenType.DEDENT || this.isAtEnd()) break;

      const level = this.expectIdent();
      this.skipNewlines();

      if (this.peek().type === TokenType.INDENT) {
        this.advance();
        const strings: string[] = [];
        while (
          !this.isAtEnd() &&
          this.peek().type !== TokenType.DEDENT
        ) {
          this.skipNewlines();
          if (this.peek().type === TokenType.DEDENT) break;
          if (this.peek().type === TokenType.STRING) {
            strings.push(this.peek().value);
            this.advance();
          } else {
            this.consumeRestOfLine();
          }
          this.skipNewlines();
        }
        if (this.peek().type === TokenType.DEDENT) this.advance();

        switch (level) {
          case "locked":
            trust.locked = strings;
            break;
          case "negotiable":
            trust.negotiable = strings;
            break;
          case "free":
            trust.free = strings;
            break;
        }
      }
      this.skipNewlines();
    }
  }

  // ── Helper methods (ParserBase interface) ──

  private parseGenericFields(target: GenericField[]): void {
    while (
      !this.isAtEnd() &&
      this.peek().type !== TokenType.DEDENT
    ) {
      this.skipNewlines();
      if (this.peek().type === TokenType.DEDENT || this.isAtEnd()) break;

      const loc = { line: this.peek().line, col: this.peek().col };
      const name = this.peek().value;
      this.advance();
      const value = this.consumeRestOfLine();
      const children: GenericField[] = [];

      this.skipNewlines();

      if (this.peek().type === TokenType.INDENT) {
        this.advance();
        this.parseGenericFields(children);
        if (this.peek().type === TokenType.DEDENT) this.advance();
      }

      target.push({ kind: "GenericField", name, value, children, loc });
      this.skipNewlines();
    }
  }

  private parseStringList(): string[] {
    this.skipNewlines();
    const items: string[] = [];

    if (this.peek().type === TokenType.INDENT) {
      this.advance();

      while (
        !this.isAtEnd() &&
        this.peek().type !== TokenType.DEDENT
      ) {
        this.skipNewlines();
        if (this.peek().type === TokenType.DEDENT || this.isAtEnd()) break;

        if (this.peek().type === TokenType.STRING) {
          items.push(this.peek().value);
          this.advance();
        } else {
          this.consumeRestOfLine();
        }
        this.skipNewlines();
      }

      if (this.peek().type === TokenType.DEDENT) this.advance();
    }

    return items;
  }

  private consumeRestOfLine(): string {
    const parts: string[] = [];
    while (
      !this.isAtEnd() &&
      this.peek().type !== TokenType.NEWLINE &&
      this.peek().type !== TokenType.INDENT &&
      this.peek().type !== TokenType.DEDENT &&
      this.peek().type !== TokenType.EOF
    ) {
      const t = this.peek();
      if (t.type === TokenType.STRING) {
        parts.push(t.value);
      } else {
        parts.push(t.value);
      }
      this.advance();
    }
    return parts.join(" ").trim();
  }

  private consumeIdentList(): string[] {
    const items: string[] = [];
    while (
      !this.isAtEnd() &&
      this.peek().type !== TokenType.NEWLINE &&
      this.peek().type !== TokenType.INDENT &&
      this.peek().type !== TokenType.DEDENT &&
      this.peek().type !== TokenType.EOF &&
      !this.isAtSectionStart()
    ) {
      const t = this.peek();
      if (t.type === TokenType.IDENTIFIER || t.type === TokenType.STRING) {
        // Handle dotted identifiers
        if (t.type === TokenType.IDENTIFIER && this.peekAt(1)?.type === TokenType.DOT) {
          let path = t.value;
          this.advance();
          while (this.peek().type === TokenType.DOT) {
            this.advance();
            path += "." + this.expectIdent();
          }
          items.push(path);
        } else {
          items.push(t.value);
          this.advance();
        }
      } else {
        break;
      }
    }
    return items;
  }

  private consumeIdentAndStringList(): string[] {
    const items: string[] = [];
    while (
      !this.isAtEnd() &&
      this.peek().type !== TokenType.NEWLINE &&
      this.peek().type !== TokenType.INDENT &&
      this.peek().type !== TokenType.DEDENT &&
      this.peek().type !== TokenType.EOF
    ) {
      const t = this.peek();
      if (
        t.type === TokenType.IDENTIFIER ||
        t.type === TokenType.STRING ||
        t.type === TokenType.NUMBER
      ) {
        items.push(t.value);
        this.advance();
      } else {
        break;
      }
    }
    return items;
  }

  private expectString(): string {
    const tok = this.peek();
    if (tok.type !== TokenType.STRING) {
      this.error(`Expected string, got '${tok.value}'`);
    }
    this.advance();
    return tok.value;
  }

  private expectDuration(): string {
    const tok = this.peek();
    if (tok.type === TokenType.DURATION) {
      this.advance();
      return tok.value;
    }
    // Allow NUMBER + IDENTIFIER unit as duration (e.g., "10 s" if split)
    if (tok.type === TokenType.IDENTIFIER) {
      this.advance();
      return tok.value;
    }
    this.error(`Expected duration, got '${tok.value}'`);
  }

  private expectTimestampOrIdent(): string {
    const tok = this.peek();
    if (tok.type === TokenType.TIMESTAMP) {
      this.advance();
      return tok.value;
    }
    if (tok.type === TokenType.IDENTIFIER) {
      this.advance();
      return tok.value;
    }
    this.error(`Expected timestamp, got '${tok.value}'`);
  }

  private expectSemverOrIdent(): string {
    const tok = this.peek();
    if (tok.type === TokenType.SEMVER) {
      this.advance();
      return tok.value;
    }
    if (tok.type === TokenType.IDENTIFIER) {
      this.advance();
      return tok.value;
    }
    if (tok.type === TokenType.NUMBER) {
      this.advance();
      return tok.value;
    }
    this.error(`Expected version, got '${tok.value}'`);
  }

  // ── ParserBase implementation ──

  peek(): Token {
    return this.tokens[this.cursor] ?? {
      type: TokenType.EOF,
      value: "",
      line: 0,
      col: 0,
    };
  }

  peekAt(offset: number): Token | undefined {
    return this.tokens[this.cursor + offset];
  }

  tokenAt(idx: number): Token | undefined {
    return this.tokens[idx];
  }

  advance(): Token {
    const tok = this.peek();
    this.cursor++;
    return tok;
  }

  expect(type: TokenType): Token {
    const tok = this.peek();
    if (tok.type !== type) {
      this.error(`Expected ${type}, got '${tok.value}' (${tok.type})`);
    }
    return this.advance();
  }

  match(type: TokenType): boolean {
    if (this.peek().type === type) {
      this.advance();
      return true;
    }
    return false;
  }

  expectIdent(): string {
    const tok = this.peek();
    if (tok.type !== TokenType.IDENTIFIER) {
      this.error(`Expected identifier, got '${tok.value}' (${tok.type})`);
    }
    this.advance();
    return tok.value;
  }

  expectKeyword(kw: string): void {
    const tok = this.peek();
    if (tok.type !== TokenType.IDENTIFIER || tok.value !== kw) {
      this.error(`Expected '${kw}', got '${tok.value}'`);
    }
    this.advance();
  }

  error(msg: string): never {
    const tok = this.peek();
    const sourceLine = this.sourceLines[tok.line - 1] ?? "";
    throw new PactParseError(msg, tok.line, tok.col, sourceLine);
  }

  isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  isAtLineStart(): boolean {
    if (this.cursor === 0) return true;
    const prev = this.tokens[this.cursor - 1];
    return (
      prev?.type === TokenType.NEWLINE ||
      prev?.type === TokenType.INDENT ||
      prev?.type === TokenType.DEDENT
    );
  }

  isAtSectionStart(): boolean {
    const t = this.peek().type;
    return (
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

  isAtDedent(): boolean {
    return this.peek().type === TokenType.DEDENT;
  }

  skipNewlines(): void {
    while (this.peek().type === TokenType.NEWLINE) {
      this.advance();
    }
  }
}
