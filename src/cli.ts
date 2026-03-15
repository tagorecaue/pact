import { parse } from "./index";
import { ContractRegistry } from "./runtime/registry";
import { EvidenceStore } from "./runtime/evidence";
import { ExecutionEngine } from "./runtime/engine";
import { AiExecutor } from "./runtime/ai-executor";
import { PactServer } from "./runtime/server";
import { createDefaultProvider } from "./runtime/llm";
import type { LoadedContract } from "./runtime/registry";

const USAGE = `
pact — The protocol that refuses to execute with ambiguity.

Usage:
  pact parse <file.pact>                    Parse and show AST summary
  pact inspect <file.pact>                  Show contract details
  pact inspect --evidence <file.pact>       Show evidence trail
  pact run <file.pact> [--input '<json>']   Execute a contract
  pact serve <contracts-dir>                Start HTTP server

Options:
  --input '<json>'    JSON input for contract execution
  --port <number>     HTTP server port (default: 3000)
  --data-dir <path>   Data directory (default: data)
  --help              Show this help
`.trim();

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(USAGE);
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case "parse":
      await cmdParse(args.slice(1));
      break;
    case "inspect":
      await cmdInspect(args.slice(1));
      break;
    case "run":
      await cmdRun(args.slice(1));
      break;
    case "serve":
      await cmdServe(args.slice(1));
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.log(USAGE);
      process.exit(1);
  }
}

// ── pact parse ──

async function cmdParse(args: string[]) {
  const file = args[0];
  if (!file) {
    console.error("Usage: pact parse <file.pact>");
    process.exit(1);
  }

  const source = await Bun.file(file).text();
  try {
    const ast = parse(source);
    const sections = ast.sections.map((s) => s.kind.replace("Section", ""));
    console.log(`✓ ${file}`);
    console.log(`  version: ${ast.header.version}`);
    console.log(`  sections (${sections.length}): ${sections.join(", ")}`);
  } catch (e: any) {
    console.error(`✗ ${file}\n${e.message}`);
    process.exit(1);
  }
}

// ── pact inspect ──

async function cmdInspect(args: string[]) {
  const showEvidence = args.includes("--evidence");
  const file = args.find((a) => a.endsWith(".pact"));

  if (!file) {
    console.error("Usage: pact inspect [--evidence] <file.pact>");
    process.exit(1);
  }

  const registry = new ContractRegistry();
  registry.loadFile(file);
  const contracts = registry.getAll();
  const contract = contracts[0]!;

  console.log(`\n── ${contract.name} ${contract.version} ──\n`);

  if (contract.domain) {
    console.log(`  domain:   ${contract.domain}`);
  }

  const c = contract.sections;

  if (c.intent) {
    console.log(`\n  @I Intent`);
    if (c.intent.natural) console.log(`    natural:  "${c.intent.natural}"`);
    if (c.intent.priority) console.log(`    priority: ${c.intent.priority}`);
    if (c.intent.timeout) console.log(`    timeout:  ${c.intent.timeout}`);
    if (c.intent.accept) {
      console.log(`    accept:`);
      for (const a of c.intent.accept) console.log(`      - "${a}"`);
    }
    if (c.intent.reject) {
      console.log(`    reject:`);
      for (const r of c.intent.reject) console.log(`      - "${r}"`);
    }
  }

  if (c.entities) {
    console.log(`\n  @E Entities`);
    for (const entity of c.entities.entities) {
      console.log(`    ${entity.name}:`);
      for (const field of entity.fields) {
        const mods = field.modifiers.join("");
        const def = field.defaultValue ? ` =${field.defaultValue}` : "";
        const typeName =
          field.type.kind === "PrimitiveType"
            ? field.type.name
            : field.type.kind === "EnumType"
              ? `enum(${field.type.variants.join(",")})`
              : field.type.kind;
        console.log(`      ${field.name} ${typeName}${mods ? " " + mods : ""}${def}`);
      }
    }
  }

  if (c.execution) {
    console.log(`\n  @X Execution`);
    console.log(`    ${c.execution.flow.length} top-level flow nodes`);
    for (const node of c.execution.flow) {
      printFlowNode(node, 4);
    }
  }

  if (c.fallbacks) {
    console.log(`\n  @F Fallbacks`);
    for (const h of c.fallbacks.handlers) {
      console.log(`    on ${h.event}: ${h.actions.length} action(s)`);
    }
  }

  if (c.triggers) {
    console.log(`\n  @T Triggers`);
    for (const t of c.triggers.triggers) {
      console.log(`    ${t.type} ${t.args.join(" ")}`);
    }
  }

  if (c.dependencies) {
    console.log(`\n  @D Dependencies`);
    for (const d of c.dependencies.deps) {
      console.log(`    #${d.contract} ${d.versionConstraints.join(" ")}`);
    }
  }

  if (showEvidence) {
    const dataDir = args.find((a, i) => args[i - 1] === "--data-dir") ?? "data";
    try {
      const store = new EvidenceStore(dataDir);
      const evidence = store.getByContract(contract.name);
      store.close();

      if (evidence.length === 0) {
        console.log(`\n  @V Evidence: (none recorded)`);
      } else {
        console.log(`\n  @V Evidence (${evidence.length} entries)`);
        for (const e of evidence) {
          const status = e.status === "success" ? "✓" : "✗";
          console.log(
            `    ${status} ${e.step_name} [${e.duration_ms}ms] ${e.status} (${e.timestamp})`,
          );
        }
      }
    } catch {
      console.log(`\n  @V Evidence: (no evidence database found)`);
    }
  }

  console.log("");
}

function printFlowNode(node: any, indent: number): void {
  const pad = " ".repeat(indent);
  switch (node.kind) {
    case "StepNode":
      console.log(`${pad}→ ${node.name}${node.args.length ? " " + node.args.join(" ") : ""}`);
      break;
    case "PipeExpr":
      printFlowNode(node.left, indent);
      console.log(`${pad}>> `);
      printFlowNode(node.right, indent);
      break;
    case "SequenceExpr":
      printFlowNode(node.left, indent);
      printFlowNode(node.right, indent);
      break;
    case "ConditionalExpr":
      console.log(`${pad}? (condition)`);
      for (const child of node.then) printFlowNode(child, indent + 2);
      if (node.else) {
        console.log(`${pad}?!`);
        for (const child of node.else) printFlowNode(child, indent + 2);
      }
      break;
    case "MatchExpr":
      console.log(`${pad}?? match`);
      for (const arm of node.arms) {
        console.log(`${pad}  ${arm.pattern}:`);
        for (const child of arm.body) printFlowNode(child, indent + 4);
      }
      break;
    case "LoopExpr":
      console.log(`${pad}* loop (max ${node.max})`);
      for (const child of node.body) printFlowNode(child, indent + 2);
      break;
    case "ExchangeExpr":
      console.log(`${pad}<> ${node.target}`);
      break;
    case "DelegateExpr":
      console.log(`${pad}@> ${node.contract}`);
      break;
    case "AsyncExpr":
      console.log(`${pad}~>`);
      printFlowNode(node.step, indent + 2);
      break;
    default:
      console.log(`${pad}[${node.kind}]`);
  }
}

// ── pact run ──

async function cmdRun(args: string[]) {
  const file = args.find((a) => a.endsWith(".pact"));
  if (!file) {
    console.error("Usage: pact run <file.pact> [--input '<json>']");
    process.exit(1);
  }

  // Parse --input flag
  let input: Record<string, unknown> = {};
  const inputIdx = args.indexOf("--input");
  if (inputIdx !== -1 && args[inputIdx + 1]) {
    try {
      input = JSON.parse(args[inputIdx + 1]!);
    } catch {
      console.error("Invalid JSON for --input");
      process.exit(1);
    }
  }

  const dataDir = args.find((a, i) => args[i - 1] === "--data-dir") ?? "data";

  // Load contract
  const registry = new ContractRegistry();
  registry.loadFile(file);
  const contract = registry.getAll()[0]!;

  // Detect execution mode: @X (deterministic) vs @R (AI reasoning)
  const hasExecution = contract.sections.execution;
  const hasReasoning = contract.ast.sections.some((s) => s.kind === "ReasoningSection");

  const evidence = new EvidenceStore(dataDir);

  console.log(`\n── pact run: ${contract.name} ${contract.version} ──\n`);
  console.log(`  input: ${JSON.stringify(input)}`);
  console.log(`  mode:  ${hasReasoning ? "reasoning (@R)" : "deterministic (@X)"}`);
  console.log("");

  let result;
  if (hasReasoning) {
    // AI reasoning mode
    const llm = createDefaultProvider();
    if (!llm) {
      console.error("  No LLM configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY, or run ./setup.sh");
      evidence.close();
      process.exit(1);
    }
    console.log(`  llm:   ${llm.name}`);
    console.log("");
    const aiExecutor = new AiExecutor({ llm, evidence });
    result = await aiExecutor.execute(contract, input);
  } else {
    // Deterministic mode
    const engine = new ExecutionEngine(evidence);
    result = await engine.execute(contract, input);
  }

  // Display results
  for (const step of result.steps) {
    const icon = step.status === "success" ? "✓" : "✗";
    console.log(`  ${icon} ${step.name} [${step.durationMs}ms]`);
    if (step.error) console.log(`    error: ${step.error}`);
  }

  console.log("");
  console.log(`  status:   ${result.status}`);
  console.log(`  duration: ${result.durationMs}ms`);
  console.log(`  request:  ${result.requestId}`);
  if (result.error) console.log(`  error:    ${result.error}`);

  // Show evidence count
  const trail = evidence.getByRequest(result.requestId);
  console.log(`  evidence: ${trail.length} entries recorded`);
  console.log("");

  evidence.close();
  process.exit(result.status === "success" ? 0 : 1);
}

// ── pact serve ──

async function cmdServe(args: string[]) {
  const contractsDir = args.find((a) => !a.startsWith("--")) ?? "contracts";

  const portIdx = args.indexOf("--port");
  const port = portIdx !== -1 ? parseInt(args[portIdx + 1]!, 10) : 3000;

  const dataDirIdx = args.indexOf("--data-dir");
  const dataDir = dataDirIdx !== -1 ? args[dataDirIdx + 1]! : "data";

  console.log(`\n── pact serve ──`);
  console.log(`  contracts: ${contractsDir}`);
  console.log(`  data:      ${dataDir}`);

  const server = new PactServer({ contractsDir, port, dataDir });

  process.on("SIGINT", () => {
    console.log("\n  shutting down...");
    server.stop();
    process.exit(0);
  });

  server.start();
}

// ── Entry point ──
main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
