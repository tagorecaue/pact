import { Lexer } from "./lexer/lexer";
import { Parser } from "./parser/parser";
import type { PactFile } from "./parser/ast";

export function parse(source: string): PactFile {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const sourceLines = source.split("\n");
  const parser = new Parser(tokens, sourceLines);
  return parser.parse();
}

// Re-export types
export type { PactFile } from "./parser/ast";
export type {
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
  TypeExpr,
  Expression,
  FlowExpr,
} from "./parser/ast";

export { PactError, PactLexError, PactParseError } from "./errors";

// CLI: bun run src/index.ts <file.pact>
if (import.meta.main) {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: bun run src/index.ts <file.pact>");
    process.exit(1);
  }
  const source = await Bun.file(file).text();
  try {
    const ast = parse(source);
    const sections = ast.sections.map((s) => s.kind.replace("Section", ""));
    console.log(`✓ ${file}`);
    console.log(`  version: ${ast.header.version}`);
    console.log(`  sections (${sections.length}): ${sections.join(", ")}`);

    const contract = ast.sections.find((s) => s.kind === "ContractSection");
    if (contract && contract.kind === "ContractSection") {
      console.log(`  contract: ${contract.name} ${contract.version}`);
      if (contract.domain) console.log(`  domain: ${contract.domain}`);
    }

    const entities = ast.sections.find((s) => s.kind === "EntitiesSection");
    if (entities && entities.kind === "EntitiesSection") {
      for (const e of entities.entities) {
        console.log(`  entity ${e.name}: ${e.fields.length} fields`);
      }
    }

    const execution = ast.sections.find((s) => s.kind === "ExecutionSection");
    if (execution && execution.kind === "ExecutionSection") {
      console.log(`  flow: ${execution.flow.length} top-level nodes`);
    }
  } catch (e: any) {
    console.error(`✗ ${file}\n${e.message}`);
    process.exit(1);
  }
}
