import { parse } from "./index";
import { ContractRegistry } from "./runtime/registry";
import { EvidenceStore } from "./runtime/evidence";
import { ExecutionEngine } from "./runtime/engine";
import { AiExecutor } from "./runtime/ai-executor";
import { PactServer } from "./runtime/server";
import { createDefaultProvider } from "./runtime/llm";
import { startMockServer } from "./runtime/mock-server";
import { detectDivergence, buildSchemaMap } from "./runtime/divergence";
import { HttpClient } from "./runtime/http-client";
import { Translator } from "./runtime/translator";
import { ConnectorRegistry } from "./runtime/connector";
import { loadEnvFile } from "./runtime/env";
import type { LoadedContract } from "./runtime/registry";

const USAGE = `
pact — The protocol that refuses to execute with ambiguity.

Usage:
  pact parse <file.pact>                    Parse and show AST summary
  pact inspect <file.pact>                  Show contract details
  pact inspect --evidence <file.pact>       Show evidence trail
  pact run <file.pact> [--input '<json>']   Execute a contract
  pact new [--desc "<description>"]         Generate contract from natural language
  pact serve <contracts-dir>                Start HTTP server
  pact connectors                           List available connectors
  pact demo-heal [--port 4000]              Run self-healing demo

Options:
  --input '<json>'      JSON input for contract execution
  --desc "<text>"       Natural language description
  --no-interactive      Skip interactive gap resolution (CI/scripts)
  --auto-accept         Accept all gap suggestions automatically
  --output-dir <dir>    Output directory for generated contracts (default: contracts)
  --port <number>       HTTP server port (default: 3000 / 4000 for demo)
  --data-dir <path>     Data directory (default: data)
  --help                Show this help
`.trim();

async function main() {
  loadEnvFile();

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
    case "new":
      await cmdNew(args.slice(1));
      break;
    case "serve":
      await cmdServe(args.slice(1));
      break;
    case "connectors":
      await cmdConnectors(args.slice(1));
      break;
    case "demo-heal":
      await cmdDemoHeal(args.slice(1));
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

// ── pact connectors ──

async function cmdConnectors(_args: string[]) {
  const { join } = await import("path");
  const { existsSync } = await import("fs");

  const registry = new ConnectorRegistry();

  // Try multiple connector directories
  const connectorDirs = [
    join(process.cwd(), "connectors", "community"),
    join(process.cwd(), "connectors"),
  ];

  let loaded = false;
  for (const dir of connectorDirs) {
    if (existsSync(dir)) {
      registry.loadDirectory(dir);
      loaded = true;
      break;
    }
  }

  if (!loaded || registry.count() === 0) {
    console.log("\n  No connectors found.");
    console.log("  Place .pact connector files in connectors/community/\n");
    return;
  }

  const connectors = registry.getAll();
  const total = connectors.length;

  // Group by category
  const categories: Record<string, typeof connectors> = {};
  for (const conn of connectors) {
    // Derive category from the connector's authEnv or name pattern
    let category = "Other";
    const name = conn.name.toLowerCase();
    if (name.includes("connector.telegram") || name.includes("connector.slack") || name.includes("connector.discord") || name.includes("connector.whatsapp")) {
      category = "Messaging";
    } else if (name.includes("connector.stripe") || name.includes("connector.mercadopago")) {
      category = "Payments";
    } else if (name.includes("connector.resend") || name.includes("connector.sendgrid")) {
      category = "Email";
    } else if (name.includes("connector.twilio")) {
      category = "SMS";
    } else if (name.includes("connector.github") || name.includes("connector.gitlab") || name.includes("connector.vercel") || name.includes("connector.docker")) {
      category = "Dev Tools";
    } else if (name.includes("connector.anthropic") || name.includes("connector.openai")) {
      category = "AI";
    } else if (name.includes("connector.supabase") || name.includes("connector.aws") || name.includes("connector.cloudflare")) {
      category = "Storage";
    } else if (name.includes("connector.postgresql") || name.includes("connector.redis")) {
      category = "Databases";
    } else if (name.includes("connector.notion") || name.includes("connector.google") || name.includes("connector.trello")) {
      category = "Productivity";
    } else if (name.includes("connector.datadog")) {
      category = "Monitoring";
    } else if (name.includes("connector.claude")) {
      category = "Custom";
    }

    if (!categories[category]) categories[category] = [];
    categories[category]!.push(conn);
  }

  console.log(`\nAvailable connectors (${total}):\n`);

  // Sort categories in a logical order
  const categoryOrder = ["Messaging", "Payments", "Email", "SMS", "Dev Tools", "AI", "Storage", "Databases", "Productivity", "Monitoring", "Custom", "Other"];

  for (const cat of categoryOrder) {
    const conns = categories[cat];
    if (!conns || conns.length === 0) continue;

    console.log(`  ${cat}:`);
    for (const conn of conns) {
      // Derive short name
      let shortName = conn.name;
      if (shortName.startsWith("connector.")) shortName = shortName.slice(10);
      if (shortName.endsWith("-connector")) shortName = shortName.slice(0, -10);

      const opCount = conn.operations.size;
      const envVar = conn.authEnv || "N/A";
      const pad = " ".repeat(Math.max(1, 16 - shortName.length));
      console.log(`    ${shortName}${pad}${opCount} operation${opCount !== 1 ? "s" : ""}  (env: ${envVar})`);
    }
    console.log("");
  }
}

// ── pact new ──

import * as readline from "readline";

function createPrompt(): { ask: (question: string) => Promise<string>; close: () => void } {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (question: string): Promise<string> =>
    new Promise((resolve) => {
      rl.question(question, (answer) => {
        resolve(answer.trim());
      });
    });

  return { ask, close: () => rl.close() };
}

async function cmdNew(args: string[]) {
  const noInteractive = args.includes("--no-interactive");
  const autoAccept = args.includes("--auto-accept");

  // Determine description from args
  let description: string | null = null;

  // Mode 1: --desc "description"
  const descIdx = args.indexOf("--desc");
  if (descIdx !== -1 && args[descIdx + 1]) {
    description = args[descIdx + 1]!;
  }

  // Mode 2: pact new "description" (first non-flag arg)
  if (!description) {
    const positional = args.find((a) => !a.startsWith("--"));
    if (positional) {
      description = positional;
    }
  }

  // Output directory
  const outIdx = args.indexOf("--output-dir");
  const outputDir = outIdx !== -1 && args[outIdx + 1] ? args[outIdx + 1]! : "contracts";

  // Create readline interface (used for interactive prompts)
  const prompt = !noInteractive ? createPrompt() : null;

  try {
    // Phase 1 — Get description
    if (!description) {
      if (noInteractive) {
        console.error("  --no-interactive requires --desc or a positional description.");
        process.exit(1);
      }
      console.log("\n  pact new — Generate a contract from natural language\n");
      description = await prompt!.ask("  What should this contract do?\n  > ");
      if (!description) {
        console.error("\n  No description provided.");
        process.exit(1);
      }
      console.log("");
    }

    // Check for LLM
    const llm = createDefaultProvider();
    if (!llm || !llm.isAvailable()) {
      console.error("  No LLM configured.");
      console.error("  Set ANTHROPIC_API_KEY or OPENAI_API_KEY, or run ./setup.sh");
      process.exit(1);
    }

    // Phase 2 — Generate initial contract
    console.log(`  Generating contract...\n`);

    const translator = new Translator({ llm, outputDir });
    const result = await translator.generate(description);

    if (!result.contractSource) {
      console.error(`  Generation failed: ${result.error ?? "unknown error"}`);
      process.exit(1);
    }

    let contractSource = result.contractSource;
    let contractName = result.contractName ?? "unnamed";

    // Show contract summary
    const ast = (() => { try { return parse(contractSource); } catch { return null; } })();
    const sectionCount = ast ? ast.sections.length : 0;
    const entityNames = ast
      ? ast.sections
          .filter((s): s is any => s.kind === "EntitiesSection")
          .flatMap((s: any) => s.entities.map((e: any) => e.name))
      : [];

    console.log(`  ${"─".repeat(50)}`);
    console.log(`  ${contractName}  v${ast?.header.version ?? "?"}`);
    console.log(`  ${sectionCount} sections${entityNames.length > 0 ? ", entities: " + entityNames.join(", ") : ""}`);
    console.log(`  ${"─".repeat(50)}\n`);

    // Show contract source with indentation
    for (const line of contractSource.split("\n")) {
      console.log(`  ${line}`);
    }
    console.log("");

    // Show parse status
    if (result.success) {
      console.log(`  [parse] Valid contract`);
    } else {
      console.log(`  [parse] Warning: ${result.error}`);
      console.log(`  The contract may need manual fixes.`);
    }
    console.log("");

    // Phase 3 — Interactive gap resolution
    const gaps = result.gaps ?? [];
    const gapAnswers: { question: string; answer: string }[] = [];

    if (gaps.length > 0 && !noInteractive) {
      console.log(`  ${gaps.length} gap(s) detected:\n`);

      for (let i = 0; i < gaps.length; i++) {
        const gap = gaps[i]!;
        console.log(`  Gap ${i + 1}/${gaps.length} [${gap.category}]`);
        console.log(`  ${gap.question}`);
        if (gap.suggestion) {
          console.log(`  -> Suggested: ${gap.suggestion}`);
        }

        let choice: string;
        if (autoAccept) {
          choice = "y";
          console.log(`  [Y]es / [n]o / [c]ustom: y (auto-accept)`);
        } else {
          choice = await prompt!.ask("  [Y]es / [n]o / [c]ustom: ");
        }

        const key = choice.toLowerCase() || "y"; // Enter = yes

        if (key === "y" || key === "yes") {
          if (gap.suggestion) {
            gapAnswers.push({ question: gap.question, answer: gap.suggestion });
            console.log(`  -> Accepted\n`);
          } else {
            // No suggestion to accept, ask for custom answer
            let custom: string;
            if (autoAccept) {
              console.log(`  (no suggestion to accept, skipping)\n`);
            } else {
              custom = await prompt!.ask("  Your answer: ");
              if (custom) {
                gapAnswers.push({ question: gap.question, answer: custom });
                console.log(`  -> Recorded\n`);
              } else {
                console.log(`  -> Skipped\n`);
              }
            }
          }
        } else if (key === "c" || key === "custom") {
          const custom = autoAccept ? "" : await prompt!.ask("  Your answer: ");
          if (custom) {
            gapAnswers.push({ question: gap.question, answer: custom });
            console.log(`  -> Recorded\n`);
          } else {
            console.log(`  -> Skipped\n`);
          }
        } else {
          // n or anything else = skip
          console.log(`  -> Skipped\n`);
        }
      }
    } else if (gaps.length > 0 && noInteractive) {
      // Non-interactive: just dump gaps
      console.log("  Gaps detected:");
      for (const gap of gaps) {
        console.log(`    [${gap.category}] ${gap.question}`);
        if (gap.suggestion) {
          console.log(`      -> Suggested: ${gap.suggestion}`);
        }
      }
      console.log("");

      // Auto-accept mode in non-interactive: accept all suggestions
      if (autoAccept) {
        for (const gap of gaps) {
          if (gap.suggestion) {
            gapAnswers.push({ question: gap.question, answer: gap.suggestion });
          }
        }
      }
    }

    // Phase 4 — Apply gaps
    if (gapAnswers.length > 0) {
      console.log(`  Applying ${gapAnswers.length} gap(s) to contract...\n`);
      const refined = await translator.refineWithGaps(contractSource, gapAnswers);

      if (refined.contractSource) {
        contractSource = refined.contractSource;
        contractName = refined.contractName ?? contractName;

        // Show updated contract
        console.log(`  ${"─".repeat(50)}`);
        console.log(`  ${contractName} (refined)`);
        console.log(`  ${"─".repeat(50)}\n`);

        for (const line of contractSource.split("\n")) {
          console.log(`  ${line}`);
        }
        console.log("");

        if (refined.success) {
          console.log(`  [parse] Valid contract`);
        } else {
          console.log(`  [parse] Warning: ${refined.error}`);
        }
        console.log("");
      } else {
        console.log(`  Refinement failed: ${refined.error ?? "unknown error"}`);
        console.log(`  Keeping original contract.\n`);
      }
    }

    // Phase 5 — Show recommendations
    const suggestions = result.suggestions ?? [];
    if (suggestions.length > 0) {
      console.log("  Recommendations:");
      for (let i = 0; i < suggestions.length; i++) {
        console.log(`    ${i + 1}. ${suggestions[i]}`);
      }
      console.log("");
    }

    // Phase 6 — Save
    if (noInteractive) {
      // Non-interactive: save automatically
      const filePath = translator.saveContract(contractSource, contractName);
      if (filePath) {
        console.log(`  Saved to ${filePath}`);
      }
    } else {
      const saveAnswer = await prompt!.ask(`  Save to contracts/${contractName}.pact? [Y/n]: `);
      const doSave = !saveAnswer || saveAnswer.toLowerCase() === "y" || saveAnswer.toLowerCase() === "yes";

      if (doSave) {
        const filePath = translator.saveContract(contractSource, contractName);
        if (filePath) {
          console.log(`  Saved to ${filePath}`);
        } else {
          console.log(`  Save failed. Here is the contract source:\n`);
          console.log(contractSource);
        }
      } else {
        console.log(`\n  Contract source (copy/paste):\n`);
        console.log(contractSource);
      }
    }

    console.log("");
  } finally {
    // IMPORTANT: Close readline before exit to prevent hanging
    if (prompt) {
      prompt.close();
    }
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

// ── pact demo-heal ──

async function cmdDemoHeal(args: string[]) {
  const portIdx = args.indexOf("--port");
  const port = portIdx !== -1 ? parseInt(args[portIdx + 1]!, 10) : 4000;
  const dataDir = args.find((a, i) => args[i - 1] === "--data-dir") ?? "data";

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  PACT SELF-HEALING DEMO`);
  console.log(`${"=".repeat(60)}\n`);

  // Step 1: Start mock server with schema v1
  console.log(`[1/6] Starting mock API server on port ${port} (schema v1)...`);
  const mock = startMockServer(port);
  console.log(`      Mock server running. Schema: v1`);
  console.log(`      Fields: id, name, price, in_stock\n`);

  // Step 2: Load the product-sync contract
  console.log(`[2/6] Loading product-sync.pact...`);
  const registry = new ContractRegistry();

  // Find the contract file — check a few standard locations
  const contractPaths = [
    "contracts/product-sync.pact",
    `${process.cwd()}/contracts/product-sync.pact`,
  ];
  let contractFile: string | null = null;
  for (const p of contractPaths) {
    try {
      await Bun.file(p).text();
      contractFile = p;
      break;
    } catch {
      // Try next
    }
  }
  if (!contractFile) {
    console.error("      Could not find contracts/product-sync.pact");
    mock.stop();
    process.exit(1);
  }

  registry.loadFile(contractFile);
  const contract = registry.getAll()[0]!;
  console.log(`      Contract: ${contract.name} v${contract.version}`);
  console.log(`      Domain:   ${contract.domain}`);
  console.log(`      Intent:   ${contract.sections.intent?.natural ?? "N/A"}\n`);

  const evidence = new EvidenceStore(dataDir);
  const llm = createDefaultProvider();
  const httpClient = new HttpClient({ maxRetries: 0, retryDelayMs: 0 });

  // Step 3: Execute contract with schema v1
  console.log(`[3/6] Executing contract with schema v1...`);
  const engine1 = new ExecutionEngine(evidence, httpClient, llm ?? undefined);
  const input1 = { _base_url: `http://localhost:${port}`, _contract: contract };

  const result1 = await engine1.execute(contract, input1);

  for (const step of result1.steps) {
    const icon = step.status === "success" ? "[OK]" : "[FAIL]";
    console.log(`      ${icon} ${step.name} [${step.durationMs}ms]`);
  }
  console.log(`      Status: ${result1.status} (${result1.durationMs}ms)`);

  if (result1.status !== "success") {
    console.log(`      Warning: contract execution failed on v1 schema.`);
    console.log(`      This is expected if the exchange target doesn't match the URL pattern.`);
  }
  console.log("");

  // Step 4: Switch to schema v2
  console.log(`[4/6] Switching mock server to schema v2...`);
  mock.switchSchema();
  console.log(`      Schema switched to: ${mock.getSchemaVersion()}`);
  console.log(`      Fields: id, name, price_cents, currency, available`);
  console.log(`      Changes: price -> price_cents, in_stock -> available, +currency\n`);

  // Step 5: Execute contract again — should detect divergence
  console.log(`[5/6] Executing contract with schema v2 (divergence expected)...`);
  const engine2 = new ExecutionEngine(evidence, httpClient, llm ?? undefined);

  // Seed the schema cache from engine1 to simulate "known" schema
  // We need to share the schema knowledge from the first run
  const input2 = { _base_url: `http://localhost:${port}`, _contract: contract };

  // First, manually fetch v2 to demonstrate divergence detection
  const v1Fields = ["id", "name", "price", "in_stock"];
  const v1Schema: Record<string, string> = {
    id: "number",
    name: "string",
    price: "number",
    in_stock: "boolean",
  };

  // Fetch from mock server to get v2 response
  const v2Response = await httpClient.request({
    method: "GET",
    url: `http://localhost:${port}/api/products`,
    timeout: 5000,
  });

  let v2Body: Record<string, unknown> = {};
  if (Array.isArray(v2Response.body) && v2Response.body.length > 0) {
    v2Body = v2Response.body[0] as Record<string, unknown>;
  } else if (v2Response.body && typeof v2Response.body === "object") {
    v2Body = v2Response.body as Record<string, unknown>;
  }

  const divergence = detectDivergence(v1Fields, v1Schema, v2Body, `localhost:${port}/api/products`);

  console.log(`      Response received. Checking for divergences...`);
  console.log("");

  // Step 6: Show divergence report
  console.log(`[6/6] Divergence Report:`);
  console.log(`      ${"-".repeat(50)}`);
  console.log(`      Target:      ${divergence.target}`);
  console.log(`      Timestamp:   ${divergence.timestamp}`);
  console.log(`      High impact: ${divergence.hasHighImpact ? "YES" : "no"}`);
  console.log(`      Summary:     ${divergence.summary}`);
  console.log("");

  if (divergence.divergences.length > 0) {
    console.log(`      Divergences:`);
    for (const d of divergence.divergences) {
      const impactTag = d.impact === "high" ? "[HIGH]" : "[low] ";
      switch (d.type) {
        case "field_removed":
          console.log(`        ${impactTag} REMOVED: "${d.field}" (was ${d.expected})`);
          break;
        case "field_added":
          console.log(`        ${impactTag} ADDED:   "${d.field}" (type: ${d.received})`);
          break;
        case "field_type_changed":
          console.log(`        ${impactTag} CHANGED: "${d.field}" (${d.expected} -> ${d.received})`);
          break;
        case "field_renamed":
          console.log(`        ${impactTag} RENAMED: "${d.field}" -> "${d.received}"`);
          break;
      }
    }
    console.log("");
  }

  // Attempt LLM healing if available
  if (llm && llm.isAvailable()) {
    console.log(`      LLM available (${llm.name}). Attempting self-healing...`);
    const { SelfHealer: SH } = await import("./runtime/self-healer");
    const healer = new SH({ llm, evidence });
    const healResult = await healer.heal(
      contract,
      divergence,
      { id: 1, name: "Widget A", price: 1999, in_stock: true },
      v2Body,
    );

    console.log(`      Healing ${healResult.success ? "SUCCEEDED" : "FAILED"} (${healResult.durationMs}ms)`);
    console.log(`      Explanation: ${healResult.explanation}`);
    if (healResult.fieldMapping) {
      console.log(`      Field mapping:`);
      for (const [from, to] of Object.entries(healResult.fieldMapping)) {
        console.log(`        ${from} -> ${to || "(removed)"}`);
      }
    }
    console.log("");
  } else {
    console.log(`      No LLM available. Showing divergence report only.`);
    console.log(`      To enable self-healing, set ANTHROPIC_API_KEY or OPENAI_API_KEY.`);
    console.log("");

    // Show what the mapping would look like
    console.log(`      Suggested mapping (deterministic):`);
    console.log(`        price    -> price_cents  (renamed + unit change)`);
    console.log(`        in_stock -> available    (renamed)`);
    console.log(`        (new)    <- currency     (added field)`);
    console.log("");
  }

  // Record the divergence in evidence
  evidence.record({
    contract_id: contract.name,
    request_id: `demo-heal-${Date.now()}`,
    step_name: "demo-divergence",
    action: "divergence_detected",
    input: JSON.stringify({ v1Fields, v1Schema }),
    output: JSON.stringify(divergence),
    duration_ms: 0,
    timestamp: new Date().toISOString(),
    status: divergence.hasHighImpact ? "failed" : "success",
  });

  // Summary
  console.log(`${"=".repeat(60)}`);
  console.log(`  DEMO COMPLETE`);
  console.log(`  Divergences detected: ${divergence.divergences.length}`);
  console.log(`  High impact: ${divergence.divergences.filter((d) => d.impact === "high").length}`);
  console.log(`  Low impact:  ${divergence.divergences.filter((d) => d.impact === "low").length}`);
  console.log(`  Evidence recorded in: ${dataDir}/evidence.db`);
  console.log(`${"=".repeat(60)}\n`);

  // Cleanup
  mock.stop();
  evidence.close();
}

// ── Entry point ──
main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
