import { parse } from "../index";
import type { LlmProvider } from "./llm";
import type {
  PactFile,
  Section,
  EntitiesSection,
  EntityDef,
  FieldDef,
  ExecutionSection,
  FlowExpr,
  ExchangeExpr,
} from "../parser/ast";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

// ── Interfaces ──

export interface TranslatorOptions {
  llm: LlmProvider;
  outputDir?: string; // default "contracts"
}

export interface TranslatorResult {
  success: boolean;
  contractSource?: string; // the .pact file content
  contractName?: string; // e.g. "customer.create"
  filePath?: string; // where it was saved
  gaps?: GapQuestion[]; // gaps detected that need answers
  suggestions?: string[]; // recommendations for the user
  error?: string;
}

export interface GapQuestion {
  category: string; // "error_handling", "security", "data", "edge_case"
  question: string;
  suggestion?: string; // suggested default answer
}

// ── System prompt for contract generation ──

export function buildGenerationPrompt(description: string): string {
  return `You are a Pact contract generator. Your job is to take a natural language description and produce a complete, valid .pact contract file.

## Pact Dialect Reference

### File Format
- Every file starts with \`pact v1\` on the first line
- Sections are introduced by \`@\` followed by a single uppercase letter
- Indentation is 2 spaces per level (no tabs)
- Line comments begin with \`--\`

### Sections

| Prefix | Name | Required | Purpose |
|--------|------|----------|---------|
| \`@C\` | Contract | Yes | Identity, version, metadata |
| \`@I\` | Intent | Yes | Natural-language goal and acceptance criteria |
| \`@E\` | Entities | Yes | Typed data structures |
| \`@K\` | Constraints | No | Invariants and validation rules |
| \`@X\` | Execution | Yes | Execution plan using flow operators |
| \`@T\` | Triggers | No | Activation conditions |
| \`@F\` | Fallbacks | No | Error recovery strategies |
| \`@D\` | Dependencies | No | References to other contracts |

### @C -- Contract
\`\`\`
@C <name> <version>
  domain <domain-id>
  author <identity>
  created <timestamp>
  tags <tag1> <tag2> ...
\`\`\`

### @I -- Intent
\`\`\`
@I
  natural "<description>"
  goal <formal-predicate>
  accept
    "<criterion>"
  reject
    "<negative-criterion>"
  priority <critical|high|normal|low>
  timeout <duration>
\`\`\`

### @E -- Entities
\`\`\`
@E
  <entity-name>
    <field> <type> [modifiers]
\`\`\`

### @K -- Constraints
\`\`\`
@K
  <constraint-expression>
    severity <fatal|error|warning>
    message "<explanation>"
\`\`\`

Constraint predicates: \`field unique\`, \`field unique within X\`, \`field matches <pattern>\`, \`field min <n>\`, \`field max <n>\`, \`field in <a> <b> <c>\`, \`field = <value>\`, \`field != <value>\`, \`field > <value>\`, \`field < <value>\`, \`A & B\`, \`A | B\`, \`!A\`, \`A ? B\`, \`count(X) <op> <n>\`, \`forall X in Y : P\`, \`exists X in Y : P\`.

### @X -- Execution
Steps are identifiers optionally followed by arguments. Operators connect steps:

| Operator | Name | Semantics |
|----------|------|-----------|
| \`>\` | then | Execute B after A completes successfully |
| \`>>\` | pipe | Output of A becomes input of B |
| \`?\` | if | Execute next block only if condition is true |
| \`?!\` | else | Else branch of preceding \`?\` |
| \`??\` | match | Pattern match on a value |
| \`*\` | loop | Repeat while condition holds; max required |
| \`@>\` | delegate | Delegate to another contract |
| \`~>\` | async | Fire and forget (non-blocking) |
| \`<>\` | exchange | Bidirectional request-response with external system |

### @T -- Triggers
| Type | Syntax |
|------|--------|
| \`http\` | \`http <METHOD> <path>\` |
| \`cron\` | \`cron "<expression>"\` |
| \`event\` | \`event <event-name>\` |
| \`webhook\` | \`webhook <provider> <event-type>\` |
| \`manual\` | \`manual\` |

Trigger attributes (indented under trigger):
- \`auth bearer_token\`
- \`rate_limit 100/min\`

### @F -- Fallbacks
\`\`\`
@F
  on <event>
    retry <n> backoff <exponential|linear|fixed> base <duration>
    fallback <alternative-action>
    escalate <target> via <channel>
    abort "<message>"
\`\`\`

### @D -- Dependencies
\`\`\`
@D
  #<contract-name> <version-range>
    bind <local-field> <- <remote-field>
\`\`\`

### Type System

**Primitive types:** str, int, dec, bool, ts, dur, id, any

**Composite types:**
- \`ref[T]\` — reference to entity T
- \`list[T]\` — list of T
- \`map[K,V]\` — map from K to V
- \`opt[T]\` — optional T
- \`enum(a,b,c)\` — enumeration

**Field modifiers:**
- \`!\` — required
- \`?\` — optional
- \`*\` — unique
- \`^\` — indexed
- \`~\` — auto-generated
- \`=<value>\` — default value

### Exchange Syntax
\`\`\`
<> <target>
  send <field1> <field2>
  receive <field1> <field2>
\`\`\`

## Complete Example

\`\`\`pact
pact v1

@C customer.create 1.0.0
  domain commerce.customers
  author translator:claude
  created 2026-03-15T00:00:00Z
  tags api customers

@T
  http POST /api/customers
    auth bearer_token
    rate_limit 100/min

@I
  natural "Register a new customer with email validation"
  goal customer.persisted
  accept
    "Customer saved with generated ID"
    "customer.created event emitted"
  reject
    "Register without email"
    "Register without name"
  priority normal
  timeout 10s

@E
  customer
    id id ~
    email str !*^
    name str !
    company str ?
    status enum(active,inactive) =active
    created_at ts ~

@K
  email min 3
    severity fatal
    message "Email is required"
  name min 1
    severity fatal
    message "Name is required"

@X
  validate email name
  generate_id
  set status active
  persist customer
  emit customer.created

@F
  on validation_error
    abort "Invalid input data"
  on db_unavailable
    retry 3 backoff exponential base 1s
    abort "Database unavailable after retries"
\`\`\`

## Rules

1. Always start with \`pact v1\`
2. Always include @C (with name and version), @I, @E, and @X sections
3. Use 2-space indentation consistently
4. Contract names use dot-notation (e.g., customer.create, order.process)
5. The \`domain\` in @C uses dot-notation for hierarchy
6. The \`goal\` in @I is a formal predicate (e.g., entity.state)
7. Every entity should have an \`id\` field with \`~\` modifier for auto-generation
8. Every entity should have a \`created_at ts ~\` field
9. Add @K constraints for required fields
10. Add @T triggers if the contract should be exposed as an API
11. Add @F fallbacks for error recovery
12. Use the \`author\` field as \`translator:pact-cli\`
13. Use the current timestamp for \`created\`

## Your Task

Generate a complete .pact contract file for the following description:

"${description}"

Output ONLY the .pact file content inside a \`\`\`pact code block. No explanation, no comments outside the code block.`;
}

// ── Gap detection prompt ──

export function buildGapDetectionPrompt(contractSource: string): string {
  return `Analyze this Pact contract for gaps, missing error handling, edge cases, and security concerns.

\`\`\`pact
${contractSource}
\`\`\`

Return a JSON array of gap questions. Each object has:
- "category": one of "error_handling", "security", "data", "edge_case"
- "question": the specific question about what's missing
- "suggestion": a suggested default answer or fix

Example response format:
\`\`\`json
[
  {
    "category": "error_handling",
    "question": "What should happen if the database is unreachable?",
    "suggestion": "retry 3 backoff exponential base 2s"
  },
  {
    "category": "edge_case",
    "question": "What if the email is already registered?",
    "suggestion": "abort \\"Email already registered\\""
  }
]
\`\`\`

Return ONLY the JSON array inside a \`\`\`json code block. Identify 3-6 gaps.`;
}

// ── Deterministic suggestions based on AST analysis ──

export function generateSuggestions(
  contractSource: string,
  ast: PactFile | null
): string[] {
  const suggestions: string[] = [];

  if (!ast) {
    return suggestions;
  }

  const sections = ast.sections;
  const sectionKinds = new Set(sections.map((s) => s.kind));

  // Check for missing @T section
  if (!sectionKinds.has("TriggersSection")) {
    suggestions.push(
      'Consider adding @T section with an HTTP trigger (e.g., http POST /api/...) to expose this contract as an API endpoint.'
    );
  }

  // Check for missing @F section
  if (!sectionKinds.has("FallbacksSection")) {
    suggestions.push(
      'No @F fallback section found. Consider adding error recovery strategies (retry, abort, escalate) for resilience.'
    );
  }

  // Check for missing @K section
  if (!sectionKinds.has("ConstraintsSection")) {
    suggestions.push(
      'No @K constraints section found. Consider adding validation constraints (min, max, unique, matches) for data integrity.'
    );
  }

  // Check for missing @D section (only suggest if there are exchanges)
  const executionSection = sections.find(
    (s) => s.kind === "ExecutionSection"
  ) as ExecutionSection | undefined;
  if (executionSection) {
    const hasExchange = flowContains(executionSection.flow, "ExchangeExpr");
    const hasDelegatation = flowContains(
      executionSection.flow,
      "DelegateExpr"
    );
    if (
      (hasExchange || hasDelegatation) &&
      !sectionKinds.has("DependenciesSection")
    ) {
      suggestions.push(
        'Consider adding @D dependencies section since this contract uses external exchanges or delegations.'
      );
    }

    // Check for exchange without timeout in @I
    if (hasExchange) {
      const intentSection = sections.find((s) => s.kind === "IntentSection");
      if (intentSection && intentSection.kind === "IntentSection") {
        if (!intentSection.timeout) {
          suggestions.push(
            'This contract has external exchanges (<>) but no timeout in @I. Consider adding a timeout (e.g., timeout 30s) to prevent hanging.'
          );
        }
      }
      // Check for exchanges without timeout specified (general suggestion)
      const exchangeTargets = collectExchangeTargets(executionSection.flow);
      if (exchangeTargets.length > 0) {
        suggestions.push(
          `Exchange with ${exchangeTargets.join(", ")} has no per-exchange timeout. Consider adding timeout handling in @F for external calls.`
        );
      }
    }
  }

  // Check entities for missing id field or missing modifiers
  const entitiesSection = sections.find(
    (s) => s.kind === "EntitiesSection"
  ) as EntitiesSection | undefined;
  if (entitiesSection) {
    for (const entity of entitiesSection.entities) {
      const hasId = entity.fields.some(
        (f) => f.name === "id" && f.modifiers.includes("~")
      );
      if (!hasId) {
        suggestions.push(
          `Entity "${entity.name}" has no auto-generated id field. Consider adding "id id ~" for automatic ID generation.`
        );
      }

      // Check for fields without type modifiers
      const fieldsNoModifiers = entity.fields.filter(
        (f) => f.modifiers.length === 0 && f.name !== "id"
      );
      if (fieldsNoModifiers.length > 0) {
        const names = fieldsNoModifiers.map((f) => f.name).join(", ");
        suggestions.push(
          `Entity "${entity.name}" has fields without modifiers (${names}). Consider adding ! (required) or ? (optional) for clarity.`
        );
      }
    }
  }

  return suggestions;
}

// ── Helper: check if flow contains a specific node kind ──

function flowContains(flow: FlowExpr[], kind: string): boolean {
  for (const node of flow) {
    if (node.kind === kind) return true;
    if ("left" in node && (node as any).left)
      if (flowContains([(node as any).left], kind)) return true;
    if ("right" in node && (node as any).right)
      if (flowContains([(node as any).right], kind)) return true;
    if ("body" in node && Array.isArray((node as any).body))
      if (flowContains((node as any).body, kind)) return true;
    if ("then" in node && Array.isArray((node as any).then))
      if (flowContains((node as any).then, kind)) return true;
    if ("else" in node && Array.isArray((node as any).else))
      if (flowContains((node as any).else, kind)) return true;
    if ("step" in node && (node as any).step)
      if (flowContains([(node as any).step], kind)) return true;
    if ("branches" in node && Array.isArray((node as any).branches))
      if (flowContains((node as any).branches, kind)) return true;
    if ("arms" in node && Array.isArray((node as any).arms)) {
      for (const arm of (node as any).arms) {
        if (Array.isArray(arm.body) && flowContains(arm.body, kind))
          return true;
      }
    }
  }
  return false;
}

// ── Helper: collect exchange targets ──

function collectExchangeTargets(flow: FlowExpr[]): string[] {
  const targets: string[] = [];
  for (const node of flow) {
    if (node.kind === "ExchangeExpr") {
      targets.push((node as ExchangeExpr).target);
    }
    if ("left" in node && (node as any).left)
      targets.push(...collectExchangeTargets([(node as any).left]));
    if ("right" in node && (node as any).right)
      targets.push(...collectExchangeTargets([(node as any).right]));
    if ("body" in node && Array.isArray((node as any).body))
      targets.push(...collectExchangeTargets((node as any).body));
    if ("then" in node && Array.isArray((node as any).then))
      targets.push(...collectExchangeTargets((node as any).then));
    if ("else" in node && Array.isArray((node as any).else))
      targets.push(...collectExchangeTargets((node as any).else));
    if ("step" in node && (node as any).step)
      targets.push(...collectExchangeTargets([(node as any).step]));
    if ("branches" in node && Array.isArray((node as any).branches))
      targets.push(...collectExchangeTargets((node as any).branches));
  }
  return targets;
}

// ── Extract contract source from LLM response ──

export function extractPactBlock(response: string): string | null {
  // Try ```pact ... ``` first
  const pactMatch = response.match(/```pact\s*\n([\s\S]*?)```/);
  if (pactMatch) return pactMatch[1]!.trim();

  // Try ``` ... ``` (generic code block)
  const genericMatch = response.match(/```\s*\n([\s\S]*?)```/);
  if (genericMatch) {
    const content = genericMatch[1]!.trim();
    if (content.startsWith("pact v")) return content;
  }

  // Try to find raw pact content
  const lines = response.split("\n");
  const pactStart = lines.findIndex((l) => l.trim().startsWith("pact v"));
  if (pactStart !== -1) {
    return lines.slice(pactStart).join("\n").trim();
  }

  return null;
}

// ── Parse gap questions from LLM response ──

export function parseGapQuestions(response: string): GapQuestion[] {
  try {
    // Try ```json ... ``` first
    const jsonMatch = response.match(/```json\s*\n([\s\S]*?)```/);
    const raw = jsonMatch ? jsonMatch[1]!.trim() : response.trim();

    // Try to find JSON array in the text
    const arrayMatch = raw.match(/\[[\s\S]*\]/);
    if (!arrayMatch) return [];

    const parsed = JSON.parse(arrayMatch[0]);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (item: any) =>
          typeof item === "object" &&
          item !== null &&
          typeof item.category === "string" &&
          typeof item.question === "string"
      )
      .map((item: any) => ({
        category: item.category,
        question: item.question,
        suggestion: item.suggestion ?? undefined,
      }));
  } catch {
    return [];
  }
}

// ── Extract contract name from source ──

export function extractContractName(source: string): string | null {
  const match = source.match(/@C\s+(\S+)\s+/);
  return match ? match[1]! : null;
}

// ── Refine prompt for gap resolution ──

export function buildRefinePrompt(
  contractSource: string,
  gapAnswers: { question: string; answer: string }[],
): string {
  const gapList = gapAnswers
    .map((g, i) => `${i + 1}. Q: ${g.question}\n   A: ${g.answer}`)
    .join("\n");

  return `Here is a Pact contract and a list of gap resolutions. Update the contract to incorporate each resolution. Output the updated .pact file in a \`\`\`pact code block.

\`\`\`pact
${contractSource}
\`\`\`

Gap resolutions:
${gapList}`;
}

// ── Translator ──

export class Translator {
  private llm: LlmProvider;
  private outputDir: string;

  constructor(options: TranslatorOptions) {
    this.llm = options.llm;
    this.outputDir = options.outputDir ?? "contracts";
  }

  async generate(description: string): Promise<TranslatorResult> {
    // Step 1: Generate initial contract
    const genPrompt = buildGenerationPrompt(description);
    let genResponse;
    try {
      genResponse = await this.llm.complete(genPrompt, 4096);
    } catch (err: any) {
      return {
        success: false,
        error: `LLM generation failed: ${err.message}`,
      };
    }

    const contractSource = extractPactBlock(genResponse.text);
    if (!contractSource) {
      return {
        success: false,
        error: "LLM did not produce a valid .pact code block.",
        contractSource: genResponse.text,
      };
    }

    const contractName = extractContractName(contractSource);

    // Step 2: Validate by parsing
    let ast: PactFile | null = null;
    let parseError: string | null = null;
    try {
      ast = parse(contractSource);
    } catch (err: any) {
      parseError = err.message;
    }

    // Step 3: Gap detection via LLM
    let gaps: GapQuestion[] = [];
    try {
      const gapPrompt = buildGapDetectionPrompt(contractSource);
      const gapResponse = await this.llm.complete(gapPrompt, 2048);
      gaps = parseGapQuestions(gapResponse.text);
    } catch {
      // Gap detection is best-effort, don't fail if it doesn't work
    }

    // Step 4: Deterministic suggestions based on AST
    const suggestions = generateSuggestions(contractSource, ast);

    // Step 5: Save to file
    let filePath: string | undefined;
    if (contractName) {
      try {
        if (!existsSync(this.outputDir)) {
          mkdirSync(this.outputDir, { recursive: true });
        }
        filePath = join(this.outputDir, `${contractName}.pact`);
        writeFileSync(filePath, contractSource + "\n", "utf-8");
      } catch (err: any) {
        // Save failed — still return the contract source
        filePath = undefined;
      }
    }

    return {
      success: !parseError,
      contractSource,
      contractName: contractName ?? undefined,
      filePath,
      gaps,
      suggestions,
      error: parseError
        ? `Generated contract has parse errors: ${parseError}`
        : undefined,
    };
  }

  async refineWithGaps(
    contractSource: string,
    gapAnswers: { question: string; answer: string }[],
  ): Promise<TranslatorResult> {
    const prompt = buildRefinePrompt(contractSource, gapAnswers);
    let response;
    try {
      response = await this.llm.complete(prompt, 4096);
    } catch (err: any) {
      return {
        success: false,
        error: `LLM refinement failed: ${err.message}`,
        contractSource,
      };
    }

    const refined = extractPactBlock(response.text);
    if (!refined) {
      return {
        success: false,
        error: "LLM did not produce a valid .pact code block during refinement.",
        contractSource,
      };
    }

    const contractName = extractContractName(refined);

    // Validate by parsing
    let ast: PactFile | null = null;
    let parseError: string | null = null;
    try {
      ast = parse(refined);
    } catch (err: any) {
      parseError = err.message;
    }

    // Deterministic suggestions on refined contract
    const suggestions = generateSuggestions(refined, ast);

    return {
      success: !parseError,
      contractSource: refined,
      contractName: contractName ?? undefined,
      suggestions,
      error: parseError
        ? `Refined contract has parse errors: ${parseError}`
        : undefined,
    };
  }

  /** Save contract source to the output directory. Returns the file path or null. */
  saveContract(contractSource: string, contractName: string): string | null {
    try {
      if (!existsSync(this.outputDir)) {
        mkdirSync(this.outputDir, { recursive: true });
      }
      const filePath = join(this.outputDir, `${contractName}.pact`);
      writeFileSync(filePath, contractSource + "\n", "utf-8");
      return filePath;
    } catch {
      return null;
    }
  }
}
