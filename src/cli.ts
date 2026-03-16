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
import { NegotiationEngine, type Manifest } from "./runtime/negotiation";
import { AgreementStore } from "./runtime/agreement-store";
import { loadEnvFile } from "./runtime/env";
import {
  c,
  printBanner,
  success,
  fail,
  info,
  warn,
  step as uiStep,
  header,
  section,
  keyValue,
  divider,
  createSpinner,
  gapTag,
  highlightPactLine,
} from "./runtime/ui";
import type { LoadedContract } from "./runtime/registry";

function printUsage(): void {
  printBanner();
  console.log(`  ${c.dim}The protocol that refuses to execute with ambiguity.${c.reset}\n`);

  console.log(`  ${c.bold}Usage:${c.reset}\n`);
  console.log(`    ${c.cyan}pact parse${c.reset} <file.pact>                    Parse and show AST summary`);
  console.log(`    ${c.cyan}pact inspect${c.reset} <file.pact>                  Show contract details`);
  console.log(`    ${c.cyan}pact inspect${c.reset} --evidence <file.pact>       Show evidence trail`);
  console.log(`    ${c.cyan}pact run${c.reset} <file.pact> [--input '<json>']   Execute a contract`);
  console.log(`    ${c.cyan}pact new${c.reset} [--desc "<description>"]         Generate contract from natural language`);
  console.log(`    ${c.cyan}pact serve${c.reset} <contracts-dir>                Start HTTP server`);
  console.log(`    ${c.cyan}pact connectors${c.reset}                           List available connectors`);
  console.log(`    ${c.cyan}pact negotiate${c.reset} <remote-url>                Negotiate with remote server`);
  console.log(`    ${c.cyan}pact agreements${c.reset} [remote-url]               List or show agreements`);
  console.log(`    ${c.cyan}pact demo-negotiate${c.reset} [--port-a 3010]         Run server negotiation demo`);
  console.log(`    ${c.cyan}pact demo-heal${c.reset} [--port 4000]              Run self-healing demo`);

  console.log(`\n  ${c.bold}Options:${c.reset}\n`);
  console.log(`    ${c.yellow}--input${c.reset} '<json>'      JSON input for contract execution`);
  console.log(`    ${c.yellow}--desc${c.reset} "<text>"       Natural language description`);
  console.log(`    ${c.yellow}--no-interactive${c.reset}      Skip interactive gap resolution (CI/scripts)`);
  console.log(`    ${c.yellow}--auto-accept${c.reset}         Accept all gap suggestions automatically`);
  console.log(`    ${c.yellow}--output-dir${c.reset} <dir>    Output directory for generated contracts (default: contracts)`);
  console.log(`    ${c.yellow}--port${c.reset} <number>       HTTP server port (default: 3000 / 4000 for demo)`);
  console.log(`    ${c.yellow}--data-dir${c.reset} <path>     Data directory (default: data)`);
  console.log(`    ${c.yellow}--help${c.reset}                Show this help`);
  console.log("");
}

async function main() {
  loadEnvFile();

  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
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
    case "negotiate":
      await cmdNegotiate(args.slice(1));
      break;
    case "agreements":
      await cmdAgreements(args.slice(1));
      break;
    case "demo-negotiate":
      await cmdDemoNegotiate(args.slice(1));
      break;
    case "demo-heal":
      await cmdDemoHeal(args.slice(1));
      break;
    default:
      fail(`Unknown command: ${c.bold}${command}${c.reset}`);
      console.log("");
      printUsage();
      process.exit(1);
  }
}

// ── pact parse ──

async function cmdParse(args: string[]) {
  const file = args[0];
  if (!file) {
    fail("Usage: pact parse <file.pact>");
    process.exit(1);
  }

  const source = await Bun.file(file).text();
  try {
    const ast = parse(source);
    const sections = ast.sections.map((s) => s.kind.replace("Section", ""));
    success(`${c.bold}${file}${c.reset}`);
    keyValue("  version", ast.header.version);
    keyValue(`  sections (${sections.length})`, sections.map((s) => `${c.cyan}${s}${c.reset}`).join(", "));
  } catch (e: any) {
    fail(`${c.bold}${file}${c.reset}`);
    console.log(`    ${c.red}${e.message}${c.reset}`);
    process.exit(1);
  }
}

// ── pact inspect ──

async function cmdInspect(args: string[]) {
  const showEvidence = args.includes("--evidence");
  const file = args.find((a) => a.endsWith(".pact"));

  if (!file) {
    fail("Usage: pact inspect [--evidence] <file.pact>");
    process.exit(1);
  }

  const registry = new ContractRegistry();
  registry.loadFile(file);
  const contracts = registry.getAll();
  const contract = contracts[0]!;

  header(`${contract.name} ${c.dim}${contract.version}${c.reset}`);

  if (contract.domain) {
    keyValue("  domain", contract.domain);
  }

  const ct = contract.sections;

  if (ct.intent) {
    section("  @I Intent");
    if (ct.intent.natural) console.log(`    ${c.gray}natural:${c.reset}  ${c.green}"${ct.intent.natural}"${c.reset}`);
    if (ct.intent.priority) console.log(`    ${c.gray}priority:${c.reset} ${c.yellow}${ct.intent.priority}${c.reset}`);
    if (ct.intent.timeout) console.log(`    ${c.gray}timeout:${c.reset}  ${ct.intent.timeout}`);
    if (ct.intent.accept) {
      console.log(`    ${c.gray}accept:${c.reset}`);
      for (const a of ct.intent.accept) console.log(`      ${c.green}-${c.reset} "${a}"`);
    }
    if (ct.intent.reject) {
      console.log(`    ${c.gray}reject:${c.reset}`);
      for (const r of ct.intent.reject) console.log(`      ${c.red}-${c.reset} "${r}"`);
    }
  }

  if (ct.entities) {
    section("  @E Entities");
    for (const entity of ct.entities.entities) {
      console.log(`    ${c.bold}${entity.name}:${c.reset}`);
      for (const field of entity.fields) {
        const mods = field.modifiers.join("");
        const def = field.defaultValue ? ` ${c.dim}=${field.defaultValue}${c.reset}` : "";
        const typeName =
          field.type.kind === "PrimitiveType"
            ? field.type.name
            : field.type.kind === "EnumType"
              ? `enum(${field.type.variants.join(",")})`
              : field.type.kind;
        console.log(`      ${c.white}${field.name}${c.reset} ${c.blue}${typeName}${c.reset}${mods ? " " + c.yellow + mods + c.reset : ""}${def}`);
      }
    }
  }

  if (ct.execution) {
    section("  @X Execution");
    console.log(`    ${c.dim}${ct.execution.flow.length} top-level flow nodes${c.reset}`);
    for (const node of ct.execution.flow) {
      printFlowNode(node, 4);
    }
  }

  if (ct.fallbacks) {
    section("  @F Fallbacks");
    for (const h of ct.fallbacks.handlers) {
      console.log(`    ${c.yellow}on${c.reset} ${h.event}: ${c.dim}${h.actions.length} action(s)${c.reset}`);
    }
  }

  if (ct.triggers) {
    section("  @T Triggers");
    for (const t of ct.triggers.triggers) {
      console.log(`    ${c.cyan}${t.type}${c.reset} ${t.args.join(" ")}`);
    }
  }

  if (ct.dependencies) {
    section("  @D Dependencies");
    for (const d of ct.dependencies.deps) {
      console.log(`    ${c.magenta}#${d.contract}${c.reset} ${c.dim}${d.versionConstraints.join(" ")}${c.reset}`);
    }
  }

  if (showEvidence) {
    const dataDir = args.find((a, i) => args[i - 1] === "--data-dir") ?? "data";
    try {
      const store = new EvidenceStore(dataDir);
      const evidence = store.getByContract(contract.name);
      store.close();

      if (evidence.length === 0) {
        section("  @V Evidence");
        console.log(`    ${c.dim}(none recorded)${c.reset}`);
      } else {
        section(`  @V Evidence ${c.dim}(${evidence.length} entries)${c.reset}`);
        for (const e of evidence) {
          const icon = e.status === "success" ? `${c.green}\u2713${c.reset}` : `${c.red}\u2717${c.reset}`;
          console.log(
            `    ${icon} ${e.step_name} ${c.dim}[${e.duration_ms}ms]${c.reset} ${e.status === "success" ? c.green : c.red}${e.status}${c.reset} ${c.dim}(${e.timestamp})${c.reset}`,
          );
        }
      }
    } catch {
      section("  @V Evidence");
      console.log(`    ${c.dim}(no evidence database found)${c.reset}`);
    }
  }

  console.log("");
}

function printFlowNode(node: any, indent: number): void {
  const pad = " ".repeat(indent);
  switch (node.kind) {
    case "StepNode":
      console.log(`${pad}${c.cyan}\u2192${c.reset} ${c.bold}${node.name}${c.reset}${node.args.length ? " " + c.dim + node.args.join(" ") + c.reset : ""}`);
      break;
    case "PipeExpr":
      printFlowNode(node.left, indent);
      console.log(`${pad}${c.yellow}>>${c.reset} `);
      printFlowNode(node.right, indent);
      break;
    case "SequenceExpr":
      printFlowNode(node.left, indent);
      printFlowNode(node.right, indent);
      break;
    case "ConditionalExpr":
      console.log(`${pad}${c.yellow}?${c.reset} ${c.dim}(condition)${c.reset}`);
      for (const child of node.then) printFlowNode(child, indent + 2);
      if (node.else) {
        console.log(`${pad}${c.yellow}?!${c.reset}`);
        for (const child of node.else) printFlowNode(child, indent + 2);
      }
      break;
    case "MatchExpr":
      console.log(`${pad}${c.yellow}??${c.reset} match`);
      for (const arm of node.arms) {
        console.log(`${pad}  ${c.cyan}${arm.pattern}:${c.reset}`);
        for (const child of arm.body) printFlowNode(child, indent + 4);
      }
      break;
    case "LoopExpr":
      console.log(`${pad}${c.yellow}*${c.reset} loop ${c.dim}(max ${node.max})${c.reset}`);
      for (const child of node.body) printFlowNode(child, indent + 2);
      break;
    case "ExchangeExpr":
      console.log(`${pad}${c.magenta}<>${c.reset} ${node.target}`);
      break;
    case "DelegateExpr":
      console.log(`${pad}${c.magenta}@>${c.reset} ${node.contract}`);
      break;
    case "AsyncExpr":
      console.log(`${pad}${c.magenta}~>${c.reset}`);
      printFlowNode(node.step, indent + 2);
      break;
    default:
      console.log(`${pad}${c.dim}[${node.kind}]${c.reset}`);
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
    console.log("");
    warn("No connectors found.");
    info("Place .pact connector files in connectors/community/");
    console.log("");
    return;
  }

  const connectors = registry.getAll();
  const total = connectors.length;

  // Group by category
  const categories: Record<string, typeof connectors> = {};
  for (const conn of connectors) {
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

  header(`Available connectors ${c.dim}(${total})${c.reset}`);

  const categoryOrder = ["Messaging", "Payments", "Email", "SMS", "Dev Tools", "AI", "Storage", "Databases", "Productivity", "Monitoring", "Custom", "Other"];

  for (const cat of categoryOrder) {
    const conns = categories[cat];
    if (!conns || conns.length === 0) continue;

    console.log(`  ${c.cyan}${c.bold}${cat}:${c.reset}`);
    for (const conn of conns) {
      let shortName = conn.name;
      if (shortName.startsWith("connector.")) shortName = shortName.slice(10);
      if (shortName.endsWith("-connector")) shortName = shortName.slice(0, -10);

      const opCount = conn.operations.size;
      const envVar = conn.authEnv || "N/A";
      const pad = " ".repeat(Math.max(1, 16 - shortName.length));
      console.log(`    ${c.white}${shortName}${c.reset}${pad}${c.dim}${opCount} operation${opCount !== 1 ? "s" : ""}${c.reset}  ${c.yellow}(env: ${envVar})${c.reset}`);
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

  const descIdx = args.indexOf("--desc");
  if (descIdx !== -1 && args[descIdx + 1]) {
    description = args[descIdx + 1]!;
  }

  if (!description) {
    const positional = args.find((a) => !a.startsWith("--"));
    if (positional) {
      description = positional;
    }
  }

  const outIdx = args.indexOf("--output-dir");
  const outputDir = outIdx !== -1 && args[outIdx + 1] ? args[outIdx + 1]! : "contracts";

  const prompt = !noInteractive ? createPrompt() : null;

  try {
    // Phase 1 -- Get description
    if (!description) {
      if (noInteractive) {
        fail("--no-interactive requires --desc or a positional description.");
        process.exit(1);
      }
      header("pact new");
      info("Generate a contract from natural language\n");
      description = await prompt!.ask(`  ${c.cyan}\u203a${c.reset} What should this contract do?\n  ${c.bold}>${c.reset} `);
      if (!description) {
        fail("No description provided.");
        process.exit(1);
      }
      console.log("");
    }

    // Check for LLM
    const llm = createDefaultProvider();
    if (!llm || !llm.isAvailable()) {
      fail("No LLM configured.");
      warn("Set ANTHROPIC_API_KEY or OPENAI_API_KEY, or run ./setup.sh");
      process.exit(1);
    }

    // Phase 2 -- Generate initial contract
    const spinner = createSpinner("Generating contract...");

    const translator = new Translator({ llm, outputDir });
    const result = await translator.generate(description);

    if (!result.contractSource) {
      spinner.stop(`${c.red}Generation failed${c.reset}`);
      fail(`${result.error ?? "unknown error"}`);
      process.exit(1);
    }

    spinner.stop("Contract generated");

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

    console.log("");
    divider();
    console.log(`  ${c.bold}${contractName}${c.reset}  ${c.dim}v${ast?.header.version ?? "?"}${c.reset}`);
    console.log(`  ${c.dim}${sectionCount} sections${entityNames.length > 0 ? ", entities: " + entityNames.join(", ") : ""}${c.reset}`);
    divider();
    console.log("");

    // Show contract source with syntax highlighting
    for (const line of contractSource.split("\n")) {
      console.log(`  ${highlightPactLine(line)}`);
    }
    console.log("");

    // Show parse status
    if (result.success) {
      success(`${c.dim}[parse]${c.reset} Valid contract`);
    } else {
      warn(`${c.dim}[parse]${c.reset} ${result.error}`);
      warn("The contract may need manual fixes.");
    }
    console.log("");

    // Phase 3 -- Interactive gap resolution
    const gaps = result.gaps ?? [];
    const gapAnswers: { question: string; answer: string }[] = [];

    if (gaps.length > 0 && !noInteractive) {
      section(`  ${gaps.length} gap(s) detected`);
      console.log("");

      for (let i = 0; i < gaps.length; i++) {
        const gap = gaps[i]!;
        console.log(`  ${c.cyan}[${i + 1}/${gaps.length}]${c.reset} ${gapTag(gap.category)}`);
        console.log(`  ${gap.question}`);
        if (gap.suggestion) {
          info(`Suggested: ${c.green}${gap.suggestion}${c.reset}`);
        }

        let choice: string;
        if (autoAccept) {
          choice = "y";
          console.log(`  ${c.dim}[Y]es / [n]o / [c]ustom: y (auto-accept)${c.reset}`);
        } else {
          choice = await prompt!.ask(`  ${c.dim}[Y]es / [n]o / [c]ustom:${c.reset} `);
        }

        const key = choice.toLowerCase() || "y";

        if (key === "y" || key === "yes") {
          if (gap.suggestion) {
            gapAnswers.push({ question: gap.question, answer: gap.suggestion });
            success("Accepted\n");
          } else {
            let custom: string;
            if (autoAccept) {
              console.log(`  ${c.dim}(no suggestion to accept, skipping)${c.reset}\n`);
            } else {
              custom = await prompt!.ask(`  ${c.bold}Your answer:${c.reset} `);
              if (custom) {
                gapAnswers.push({ question: gap.question, answer: custom });
                success("Recorded\n");
              } else {
                warn("Skipped\n");
              }
            }
          }
        } else if (key === "c" || key === "custom") {
          const custom = autoAccept ? "" : await prompt!.ask(`  ${c.bold}Your answer:${c.reset} `);
          if (custom) {
            gapAnswers.push({ question: gap.question, answer: custom });
            success("Recorded\n");
          } else {
            warn("Skipped\n");
          }
        } else {
          warn("Skipped\n");
        }
      }
    } else if (gaps.length > 0 && noInteractive) {
      section("  Gaps detected");
      for (const gap of gaps) {
        console.log(`    ${gapTag(gap.category)} ${gap.question}`);
        if (gap.suggestion) {
          info(`Suggested: ${c.green}${gap.suggestion}${c.reset}`);
        }
      }
      console.log("");

      if (autoAccept) {
        for (const gap of gaps) {
          if (gap.suggestion) {
            gapAnswers.push({ question: gap.question, answer: gap.suggestion });
          }
        }
      }
    }

    // Phase 4 -- Apply gaps
    if (gapAnswers.length > 0) {
      const refineSpinner = createSpinner(`Applying ${gapAnswers.length} gap(s) to contract...`);
      const refined = await translator.refineWithGaps(contractSource, gapAnswers);

      if (refined.contractSource) {
        refineSpinner.stop("Gaps applied");
        contractSource = refined.contractSource;
        contractName = refined.contractName ?? contractName;

        console.log("");
        divider();
        console.log(`  ${c.bold}${contractName}${c.reset} ${c.dim}(refined)${c.reset}`);
        divider();
        console.log("");

        for (const line of contractSource.split("\n")) {
          console.log(`  ${highlightPactLine(line)}`);
        }
        console.log("");

        if (refined.success) {
          success(`${c.dim}[parse]${c.reset} Valid contract`);
        } else {
          warn(`${c.dim}[parse]${c.reset} ${refined.error}`);
        }
        console.log("");
      } else {
        refineSpinner.stop(`${c.red}Refinement failed${c.reset}`);
        fail(`${refined.error ?? "unknown error"}`);
        warn("Keeping original contract.\n");
      }
    }

    // Phase 5 -- Show recommendations
    const suggestions = result.suggestions ?? [];
    if (suggestions.length > 0) {
      section("  Recommendations");
      for (let i = 0; i < suggestions.length; i++) {
        console.log(`    ${c.blue}\u203a${c.reset} ${suggestions[i]}`);
      }
      console.log("");
    }

    // Phase 6 -- Save
    if (noInteractive) {
      const filePath = translator.saveContract(contractSource, contractName);
      if (filePath) {
        success(`Saved to ${c.bold}${filePath}${c.reset}`);
      }
    } else {
      const saveAnswer = await prompt!.ask(`  Save to ${c.cyan}contracts/${contractName}.pact${c.reset}? ${c.dim}[Y/n]:${c.reset} `);
      const doSave = !saveAnswer || saveAnswer.toLowerCase() === "y" || saveAnswer.toLowerCase() === "yes";

      if (doSave) {
        const filePath = translator.saveContract(contractSource, contractName);
        if (filePath) {
          success(`Saved to ${c.bold}${filePath}${c.reset}`);
        } else {
          fail("Save failed. Here is the contract source:\n");
          console.log(contractSource);
        }
      } else {
        section("  Contract source (copy/paste)");
        console.log("");
        console.log(contractSource);
      }
    }

    console.log("");
  } finally {
    if (prompt) {
      prompt.close();
    }
  }
}

// ── pact run ──

async function cmdRun(args: string[]) {
  const file = args.find((a) => a.endsWith(".pact"));
  if (!file) {
    fail("Usage: pact run <file.pact> [--input '<json>']");
    process.exit(1);
  }

  // Parse --input flag
  let input: Record<string, unknown> = {};
  const inputIdx = args.indexOf("--input");
  if (inputIdx !== -1 && args[inputIdx + 1]) {
    try {
      input = JSON.parse(args[inputIdx + 1]!);
    } catch {
      fail("Invalid JSON for --input");
      process.exit(1);
    }
  }

  const dataDir = args.find((a, i) => args[i - 1] === "--data-dir") ?? "data";

  // Load contract
  const registry = new ContractRegistry();
  registry.loadFile(file);
  const contract = registry.getAll()[0]!;

  // Detect execution mode
  const hasExecution = contract.sections.execution;
  const hasReasoning = contract.ast.sections.some((s) => s.kind === "ReasoningSection");

  const evidence = new EvidenceStore(dataDir);

  header(`pact run: ${contract.name} ${c.dim}${contract.version}${c.reset}`);
  keyValue("  input", JSON.stringify(input));
  keyValue("  mode", hasReasoning ? `${c.magenta}reasoning (@R)${c.reset}` : `${c.magenta}deterministic (@X)${c.reset}`);
  console.log("");

  let result;
  if (hasReasoning) {
    const llm = createDefaultProvider();
    if (!llm) {
      fail("No LLM configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY, or run ./setup.sh");
      evidence.close();
      process.exit(1);
    }
    keyValue("  llm", llm.name);
    console.log("");
    const aiExecutor = new AiExecutor({ llm, evidence });
    result = await aiExecutor.execute(contract, input);
  } else {
    const engine = new ExecutionEngine(evidence);
    result = await engine.execute(contract, input);
  }

  // Display results
  for (const step of result.steps) {
    if (step.status === "success") {
      success(`${c.bold}${step.name}${c.reset} ${c.dim}[${step.durationMs}ms]${c.reset}`);
    } else {
      fail(`${c.bold}${step.name}${c.reset} ${c.dim}[${step.durationMs}ms]${c.reset}`);
    }
    if (step.error) console.log(`    ${c.red}error: ${step.error}${c.reset}`);
  }

  console.log("");
  const statusColor = result.status === "success" ? c.green : c.red;
  keyValue("  status", `${statusColor}${c.bold}${result.status}${c.reset}`);
  keyValue("  duration", `${c.dim}${result.durationMs}ms${c.reset}`);
  keyValue("  request", `${c.dim}${result.requestId}${c.reset}`);
  if (result.error) keyValue("  error", `${c.red}${result.error}${c.reset}`);

  // Show evidence count
  const trail = evidence.getByRequest(result.requestId);
  keyValue("  evidence", `${c.dim}${trail.length} entries recorded${c.reset}`);
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

  printBanner();
  keyValue("  contracts", contractsDir);
  keyValue("  data", dataDir);

  const server = new PactServer({ contractsDir, port, dataDir });

  process.on("SIGINT", () => {
    console.log(`\n  ${c.dim}shutting down...${c.reset}`);
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

  printBanner();
  header("SELF-HEALING DEMO");

  // Step 1: Start mock server with schema v1
  uiStep(1, 6, `Starting mock API server on port ${c.bold}${port}${c.reset} ${c.dim}(schema v1)${c.reset}`);
  const mock = startMockServer(port);
  info(`Mock server running. Schema: ${c.bold}v1${c.reset}`);
  info(`Fields: ${c.cyan}id${c.reset}, ${c.cyan}name${c.reset}, ${c.cyan}price${c.reset}, ${c.cyan}in_stock${c.reset}`);
  console.log("");

  // Step 2: Load the product-sync contract
  uiStep(2, 6, "Loading product-sync.pact...");
  const registry = new ContractRegistry();

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
    fail("Could not find contracts/product-sync.pact");
    mock.stop();
    process.exit(1);
  }

  registry.loadFile(contractFile);
  const contract = registry.getAll()[0]!;
  keyValue("    contract", `${c.bold}${contract.name}${c.reset} v${contract.version}`);
  keyValue("    domain", contract.domain ?? "N/A");
  keyValue("    intent", contract.sections.intent?.natural ?? "N/A");
  console.log("");

  const evidence = new EvidenceStore(dataDir);
  const llm = createDefaultProvider();
  const httpClient = new HttpClient({ maxRetries: 0, retryDelayMs: 0 });

  // Step 3: Execute contract with schema v1
  uiStep(3, 6, `Executing contract with schema ${c.bold}v1${c.reset}...`);
  const engine1 = new ExecutionEngine(evidence, httpClient, llm ?? undefined);
  const input1 = { _base_url: `http://localhost:${port}`, _contract: contract };

  const result1 = await engine1.execute(contract, input1);

  for (const step of result1.steps) {
    if (step.status === "success") {
      console.log(`      ${c.green}${c.bold}[OK]${c.reset}   ${step.name} ${c.dim}[${step.durationMs}ms]${c.reset}`);
    } else {
      console.log(`      ${c.red}${c.bold}[FAIL]${c.reset} ${step.name} ${c.dim}[${step.durationMs}ms]${c.reset}`);
    }
  }
  const status1Color = result1.status === "success" ? c.green : c.yellow;
  console.log(`      ${status1Color}Status: ${result1.status}${c.reset} ${c.dim}(${result1.durationMs}ms)${c.reset}`);

  if (result1.status !== "success") {
    warn("Contract execution failed on v1 schema.");
    info("This is expected if the exchange target doesn't match the URL pattern.");
  }
  console.log("");

  // Step 4: Switch to schema v2
  uiStep(4, 6, `Switching mock server to schema ${c.bold}v2${c.reset}...`);
  mock.switchSchema();
  info(`Schema switched to: ${c.bold}${mock.getSchemaVersion()}${c.reset}`);
  info(`Fields: ${c.cyan}id${c.reset}, ${c.cyan}name${c.reset}, ${c.cyan}price_cents${c.reset}, ${c.cyan}currency${c.reset}, ${c.cyan}available${c.reset}`);
  console.log(`    Changes: ${c.red}price${c.reset} -> ${c.green}price_cents${c.reset}, ${c.red}in_stock${c.reset} -> ${c.green}available${c.reset}, ${c.green}+currency${c.reset}`);
  console.log("");

  // Step 5: Execute contract again
  uiStep(5, 6, `Executing contract with schema ${c.bold}v2${c.reset} ${c.dim}(divergence expected)${c.reset}...`);
  const engine2 = new ExecutionEngine(evidence, httpClient, llm ?? undefined);
  const input2 = { _base_url: `http://localhost:${port}`, _contract: contract };

  const v1Fields = ["id", "name", "price", "in_stock"];
  const v1Schema: Record<string, string> = {
    id: "number",
    name: "string",
    price: "number",
    in_stock: "boolean",
  };

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

  info("Response received. Checking for divergences...");
  console.log("");

  // Step 6: Show divergence report
  uiStep(6, 6, `${c.bold}Divergence Report${c.reset}`);
  divider();
  keyValue("    target", divergence.target);
  keyValue("    timestamp", divergence.timestamp);
  keyValue("    high impact", divergence.hasHighImpact ? `${c.red}${c.bold}YES${c.reset}` : `${c.dim}no${c.reset}`);
  keyValue("    summary", divergence.summary);
  console.log("");

  if (divergence.divergences.length > 0) {
    console.log(`    ${c.bold}Divergences:${c.reset}`);
    for (const d of divergence.divergences) {
      const impactTag = d.impact === "high"
        ? `${c.red}${c.bold}[HIGH]${c.reset}`
        : `${c.yellow}[low] ${c.reset}`;
      switch (d.type) {
        case "field_removed":
          console.log(`      ${impactTag} ${c.red}REMOVED${c.reset}: "${d.field}" ${c.dim}(was ${d.expected})${c.reset}`);
          break;
        case "field_added":
          console.log(`      ${impactTag} ${c.green}ADDED${c.reset}:   "${d.field}" ${c.dim}(type: ${d.received})${c.reset}`);
          break;
        case "field_type_changed":
          console.log(`      ${impactTag} CHANGED: "${d.field}" ${c.dim}(${c.red}${d.expected}${c.dim} -> ${c.green}${d.received}${c.dim})${c.reset}`);
          break;
        case "field_renamed":
          console.log(`      ${impactTag} RENAMED: "${c.red}${d.field}${c.reset}" -> "${c.green}${d.received}${c.reset}"`);
          break;
      }
    }
    console.log("");
  }

  // Attempt LLM healing if available
  if (llm && llm.isAvailable()) {
    info(`LLM available (${c.bold}${llm.name}${c.reset}). Attempting self-healing...`);
    const { SelfHealer: SH } = await import("./runtime/self-healer");
    const healer = new SH({ llm, evidence });
    const healResult = await healer.heal(
      contract,
      divergence,
      { id: 1, name: "Widget A", price: 1999, in_stock: true },
      v2Body,
    );

    if (healResult.success) {
      success(`Healing ${c.bold}SUCCEEDED${c.reset} ${c.dim}(${healResult.durationMs}ms)${c.reset}`);
    } else {
      fail(`Healing ${c.bold}FAILED${c.reset} ${c.dim}(${healResult.durationMs}ms)${c.reset}`);
    }
    keyValue("    explanation", healResult.explanation);
    if (healResult.fieldMapping) {
      console.log(`    ${c.bold}Field mapping:${c.reset}`);
      for (const [from, to] of Object.entries(healResult.fieldMapping)) {
        console.log(`      ${c.red}${from}${c.reset} ${c.dim}->${c.reset} ${c.green}${to || "(removed)"}${c.reset}`);
      }
    }
    console.log("");
  } else {
    warn("No LLM available. Showing divergence report only.");
    info("To enable self-healing, set ANTHROPIC_API_KEY or OPENAI_API_KEY.");
    console.log("");

    console.log(`    ${c.bold}Suggested mapping (deterministic):${c.reset}`);
    console.log(`      ${c.red}price${c.reset}    -> ${c.green}price_cents${c.reset}  ${c.dim}(renamed + unit change)${c.reset}`);
    console.log(`      ${c.red}in_stock${c.reset} -> ${c.green}available${c.reset}    ${c.dim}(renamed)${c.reset}`);
    console.log(`      ${c.dim}(new)${c.reset}    <- ${c.green}currency${c.reset}     ${c.dim}(added field)${c.reset}`);
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
  console.log(`  ${c.brightCyan}${c.bold}${"=".repeat(52)}${c.reset}`);
  console.log(`  ${c.bold}  DEMO COMPLETE${c.reset}`);
  keyValue("    divergences", `${divergence.divergences.length}`);
  keyValue("    high impact", `${c.red}${divergence.divergences.filter((d) => d.impact === "high").length}${c.reset}`);
  keyValue("    low impact", `${c.yellow}${divergence.divergences.filter((d) => d.impact === "low").length}${c.reset}`);
  keyValue("    evidence", `${dataDir}/evidence.db`);
  console.log(`  ${c.brightCyan}${c.bold}${"=".repeat(52)}${c.reset}\n`);

  // Cleanup
  mock.stop();
  evidence.close();
}

// ── pact negotiate ──

async function cmdNegotiate(args: string[]) {
  const remoteUrl = args.find((a) => !a.startsWith("--"));
  if (!remoteUrl) {
    fail("Usage: pact negotiate <remote-url>");
    process.exit(1);
  }

  const contractsDir = args.find((a, i) => args[i - 1] === "--contracts") ?? "contracts";
  const dataDir = args.find((a, i) => args[i - 1] === "--data-dir") ?? "data";

  printBanner();
  header("SERVER NEGOTIATION");

  // Load local contracts
  uiStep(1, 4, "Loading local contracts...");
  const registry = new ContractRegistry();
  try {
    registry.loadDirectory(contractsDir);
  } catch (err: any) {
    fail(`Could not load contracts from ${contractsDir}: ${err.message}`);
    process.exit(1);
  }

  const contracts = registry.getAll();
  const negotiable = contracts.filter((c) =>
    c.ast.sections.some((s) => s.kind === "NegotiateSection"),
  );

  if (negotiable.length === 0) {
    fail("No contracts with @N (negotiate) sections found.");
    process.exit(1);
  }

  for (const c of negotiable) {
    info(`  ${c.name} ${c.dim}${c.version}${c.reset}`);
  }
  console.log("");

  // Discover remote
  uiStep(2, 4, `Discovering remote: ${c.bold}${remoteUrl}${c.reset}`);

  let remoteManifest: Manifest;
  try {
    const manifestUrl = remoteUrl.endsWith("/")
      ? `${remoteUrl}.pact/manifest`
      : `${remoteUrl}/.pact/manifest`;
    const res = await fetch(manifestUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    remoteManifest = (await res.json()) as Manifest;
  } catch (err: any) {
    fail(`Could not fetch manifest from ${remoteUrl}: ${err.message}`);
    process.exit(1);
  }

  keyValue("    server", remoteManifest.server);
  keyValue("    contracts", `${remoteManifest.contracts.length}`);
  for (const rc of remoteManifest.contracts) {
    info(`  ${rc.name} ${c.dim}offers: ${rc.offers.join(", ")} | accepts: ${rc.accepts.join(", ")}${c.reset}`);
  }
  console.log("");

  // Negotiate
  uiStep(3, 4, "Running negotiation...");
  const evidence = new EvidenceStore(dataDir);
  const negotiationEngine = new NegotiationEngine(createDefaultProvider(), evidence);
  const agreementStore = new AgreementStore(dataDir);

  let agreementCount = 0;
  for (const contract of negotiable) {
    try {
      const agreement = await negotiationEngine.negotiate(contract, remoteManifest, remoteUrl);
      agreementStore.save(agreement);
      agreementCount++;

      success(`Agreement established: ${c.bold}${contract.name}${c.reset} <-> ${c.bold}${agreement.parties.remote}${c.reset}`);
      keyValue("      id", agreement.id);
      keyValue("      mappings", `${agreement.mappings.length}`);
      keyValue("      endpoints", Object.keys(agreement.compiledEndpoints).join(", ") || "(none)");

      if (agreement.mappings.length > 0) {
        console.log(`      ${c.bold}Field mappings:${c.reset}`);
        for (const m of agreement.mappings) {
          const dir = m.direction === "outbound" ? "->" : "<-";
          const xform = m.transform ? ` ${c.dim}(${m.transform})${c.reset}` : "";
          console.log(`        ${c.cyan}${m.localField}${c.reset} ${dir} ${c.green}${m.remoteField}${c.reset} ${c.dim}[${m.operation}]${c.reset}${xform}`);
        }
      }

      if (agreement.trustLevels.locked.length > 0) {
        console.log(`      ${c.bold}Trust (locked):${c.reset}`);
        for (const rule of agreement.trustLevels.locked) {
          console.log(`        ${c.red}!${c.reset} ${rule}`);
        }
      }
    } catch (err: any) {
      fail(`Negotiation failed for ${contract.name}: ${err.message}`);
    }
    console.log("");
  }

  // Summary
  uiStep(4, 4, `${c.bold}Complete${c.reset}`);
  keyValue("    agreements", `${agreementCount}`);
  console.log("");

  evidence.close();
}

// ── pact agreements ──

async function cmdAgreements(args: string[]) {
  const remoteUrl = args.find((a) => !a.startsWith("--"));
  const dataDir = args.find((a, i) => args[i - 1] === "--data-dir") ?? "data";

  const store = new AgreementStore(dataDir);

  if (remoteUrl) {
    // Show detailed agreement
    const agreement = store.load(remoteUrl);
    if (!agreement) {
      fail(`No agreement found for ${remoteUrl}`);
      process.exit(1);
    }

    header(`Agreement: ${agreement.parties.local} <-> ${agreement.parties.remote}`);
    keyValue("  id", agreement.id);
    keyValue("  status", agreement.status === "active" ? `${c.green}${agreement.status}${c.reset}` : `${c.yellow}${agreement.status}${c.reset}`);
    keyValue("  version", `${agreement.version}`);
    keyValue("  established", agreement.established);
    keyValue("  renegotiated", agreement.lastRenegotiated ?? "(never)");

    if (agreement.mappings.length > 0) {
      section("  Field Mappings");
      for (const m of agreement.mappings) {
        const dir = m.direction === "outbound" ? "->" : "<-";
        const xform = m.transform ? ` ${c.dim}(${m.transform})${c.reset}` : "";
        console.log(`    ${c.cyan}${m.localField}${c.reset} ${dir} ${c.green}${m.remoteField}${c.reset} ${c.dim}[${m.operation}]${c.reset}${xform}`);
      }
    }

    if (Object.keys(agreement.compiledEndpoints).length > 0) {
      section("  Compiled Endpoints");
      for (const [name, url] of Object.entries(agreement.compiledEndpoints)) {
        console.log(`    ${c.cyan}${name}${c.reset}: ${url}`);
      }
    }

    section("  Trust Levels");
    if (agreement.trustLevels.locked.length > 0) {
      console.log(`    ${c.red}Locked:${c.reset}`);
      for (const rule of agreement.trustLevels.locked) {
        console.log(`      ${c.red}!${c.reset} ${rule}`);
      }
    }
    if (agreement.trustLevels.negotiable.length > 0) {
      console.log(`    ${c.yellow}Negotiable:${c.reset}`);
      for (const rule of agreement.trustLevels.negotiable) {
        console.log(`      ${c.yellow}~${c.reset} ${rule}`);
      }
    }
    if (agreement.trustLevels.agreed.length > 0) {
      console.log(`    ${c.green}Agreed:${c.reset}`);
      for (const rule of agreement.trustLevels.agreed) {
        console.log(`      ${c.green}+${c.reset} ${rule}`);
      }
    }

    // History
    const history = store.getHistory(remoteUrl);
    if (history.length > 0) {
      section(`  History ${c.dim}(${history.length} previous versions)${c.reset}`);
      for (const h of history) {
        console.log(`    v${h.version} ${c.dim}${h.established}${c.reset}`);
      }
    }

    console.log("");
  } else {
    // List all agreements
    const agreements = store.loadAll();

    if (agreements.length === 0) {
      printBanner();
      info("No agreements found.");
      info("Run: pact negotiate <remote-url>");
      console.log("");
      return;
    }

    header(`Agreements ${c.dim}(${agreements.length})${c.reset}`);

    for (const a of agreements) {
      const statusColor = a.status === "active" ? c.green : c.yellow;
      console.log(`  ${c.bold}${a.parties.local}${c.reset} <-> ${c.bold}${a.parties.remote}${c.reset}`);
      keyValue("    status", `${statusColor}${a.status}${c.reset}`);
      keyValue("    version", `${a.version}`);
      keyValue("    mappings", `${a.mappings.length}`);
      keyValue("    established", a.established);
      console.log("");
    }
  }
}

// ── pact demo-negotiate ──

async function cmdDemoNegotiate(args: string[]) {
  const portAIdx = args.indexOf("--port-a");
  const portA = portAIdx !== -1 ? parseInt(args[portAIdx + 1]!, 10) : 3010;
  const portBIdx = args.indexOf("--port-b");
  const portB = portBIdx !== -1 ? parseInt(args[portBIdx + 1]!, 10) : 3011;

  const { mkdirSync, existsSync, writeFileSync, cpSync, rmSync } = await import("fs");
  const { join } = await import("path");

  printBanner();
  header("SERVER-TO-SERVER NEGOTIATION DEMO");

  const TOTAL_STEPS = 8;

  // Prepare isolated directories for each server
  const tmpBase = join(process.cwd(), "data", "demo-negotiate");
  const dirA = join(tmpBase, "server-a");
  const dirB = join(tmpBase, "server-b");
  const contractsDirA = join(dirA, "contracts");
  const contractsDirB = join(dirB, "contracts");
  const dataDirA = join(dirA, "data");
  const dataDirB = join(dirB, "data");

  // Clean up any previous demo data
  if (existsSync(tmpBase)) {
    rmSync(tmpBase, { recursive: true, force: true });
  }

  mkdirSync(contractsDirA, { recursive: true });
  mkdirSync(contractsDirB, { recursive: true });
  mkdirSync(dataDirA, { recursive: true });
  mkdirSync(dataDirB, { recursive: true });

  // Copy demo contracts
  const storeContract = join(process.cwd(), "contracts", "demo-store.pact");
  const fulfillmentContract = join(process.cwd(), "contracts", "demo-fulfillment.pact");

  if (!existsSync(storeContract) || !existsSync(fulfillmentContract)) {
    fail("Demo contracts not found. Expected contracts/demo-store.pact and contracts/demo-fulfillment.pact");
    process.exit(1);
  }

  cpSync(storeContract, join(contractsDirA, "demo-store.pact"));
  cpSync(fulfillmentContract, join(contractsDirB, "demo-fulfillment.pact"));

  // Step 1: Start Server A (store)
  uiStep(1, TOTAL_STEPS, `Starting ${c.bold}Server A${c.reset} (store) on port ${c.bold}${portA}${c.reset}`);
  const serverA = new PactServer({ contractsDir: contractsDirA, port: portA, dataDir: dataDirA });
  serverA.start();
  success(`Server A running on http://localhost:${portA}`);
  console.log("");

  // Step 2: Start Server B (fulfillment)
  uiStep(2, TOTAL_STEPS, `Starting ${c.bold}Server B${c.reset} (fulfillment) on port ${c.bold}${portB}${c.reset}`);
  const serverB = new PactServer({ contractsDir: contractsDirB, port: portB, dataDir: dataDirB });
  serverB.start();
  success(`Server B running on http://localhost:${portB}`);
  console.log("");

  // Step 3: Discover Server B from Server A
  uiStep(3, TOTAL_STEPS, `Server A discovers Server B via ${c.cyan}GET /.pact/manifest${c.reset}`);
  let manifestB: Manifest;
  try {
    const res = await fetch(`http://localhost:${portB}/.pact/manifest`);
    manifestB = (await res.json()) as Manifest;
    success("Manifest received from Server B");
    keyValue("    server", manifestB.server);
    keyValue("    contracts", `${manifestB.contracts.length}`);
    for (const rc of manifestB.contracts) {
      info(`  ${rc.name} ${c.dim}offers: ${rc.offers.join(", ")} | accepts: ${rc.accepts.join(", ")}${c.reset}`);
    }
  } catch (err: any) {
    fail(`Could not reach Server B: ${err.message}`);
    serverA.stop();
    serverB.stop();
    process.exit(1);
  }
  console.log("");

  // Step 4: Also discover Server A from Server B (bilateral)
  uiStep(4, TOTAL_STEPS, `Server B discovers Server A via ${c.cyan}GET /.pact/manifest${c.reset}`);
  let manifestA: Manifest;
  try {
    const res = await fetch(`http://localhost:${portA}/.pact/manifest`);
    manifestA = (await res.json()) as Manifest;
    success("Manifest received from Server A");
    keyValue("    server", manifestA.server);
    keyValue("    contracts", `${manifestA.contracts.length}`);
    for (const rc of manifestA.contracts) {
      info(`  ${rc.name} ${c.dim}offers: ${rc.offers.join(", ")} | accepts: ${rc.accepts.join(", ")}${c.reset}`);
    }
  } catch (err: any) {
    fail(`Could not reach Server A: ${err.message}`);
    serverA.stop();
    serverB.stop();
    process.exit(1);
  }
  console.log("");

  // Step 5: Run negotiation from A to B
  uiStep(5, TOTAL_STEPS, `${c.bold}Negotiating${c.reset}: Server A -> Server B`);

  const evidenceA = new EvidenceStore(dataDirA);
  const negotiationEngineA = new NegotiationEngine(createDefaultProvider(), evidenceA);
  const agreementStoreA = new AgreementStore(dataDirA);

  const contractA = serverA.getRegistry().getAll()[0]!;
  let agreementAB;
  try {
    agreementAB = await negotiationEngineA.negotiate(
      contractA,
      manifestB,
      `http://localhost:${portB}`,
    );
    agreementStoreA.save(agreementAB);
    success(`Agreement established: ${c.bold}${agreementAB.parties.local}${c.reset} <-> ${c.bold}${agreementAB.parties.remote}${c.reset}`);
    keyValue("      id", agreementAB.id);
    keyValue("      version", `${agreementAB.version}`);
    keyValue("      mappings", `${agreementAB.mappings.length}`);
    keyValue("      endpoints", Object.keys(agreementAB.compiledEndpoints).join(", ") || "(none)");

    if (agreementAB.mappings.length > 0) {
      console.log(`      ${c.bold}Field mappings:${c.reset}`);
      for (const m of agreementAB.mappings) {
        const dir = m.direction === "outbound" ? "->" : "<-";
        const xform = m.transform ? ` ${c.dim}(${m.transform})${c.reset}` : "";
        console.log(`        ${c.cyan}${m.localField}${c.reset} ${dir} ${c.green}${m.remoteField}${c.reset} ${c.dim}[${m.operation}]${c.reset}${xform}`);
      }
    }

    if (agreementAB.trustLevels.locked.length > 0) {
      console.log(`      ${c.bold}Trust (locked):${c.reset}`);
      for (const rule of agreementAB.trustLevels.locked) {
        console.log(`        ${c.red}!${c.reset} ${rule}`);
      }
    }
    if (agreementAB.trustLevels.negotiable.length > 0) {
      console.log(`      ${c.bold}Trust (negotiable):${c.reset}`);
      for (const rule of agreementAB.trustLevels.negotiable) {
        console.log(`        ${c.yellow}~${c.reset} ${rule}`);
      }
    }
  } catch (err: any) {
    fail(`Negotiation failed: ${err.message}`);
    evidenceA.close();
    serverA.stop();
    serverB.stop();
    process.exit(1);
  }
  console.log("");

  // Step 6: Verify agreements via API
  uiStep(6, TOTAL_STEPS, `Verifying agreements via ${c.cyan}GET /.pact/agreements${c.reset}`);
  try {
    const resAgreementsA = await fetch(`http://localhost:${portA}/.pact/agreements`);
    const dataA = (await resAgreementsA.json()) as { agreements: any[] };
    keyValue("    Server A agreements", `${dataA.agreements.length}`);

    const resAgreementsB = await fetch(`http://localhost:${portB}/.pact/agreements`);
    const dataB = (await resAgreementsB.json()) as { agreements: any[] };
    keyValue("    Server B agreements", `${dataB.agreements.length}`);
  } catch {
    warn("Could not verify agreements via API (non-critical)");
  }
  console.log("");

  // Step 7: Simulate renegotiation
  uiStep(7, TOTAL_STEPS, `${c.bold}Renegotiating${c.reset}: Server B changed field names`);
  info(`Simulating change: ${c.red}qty_available${c.reset} -> ${c.green}stock_count${c.reset}`);

  try {
    const changes = [
      { field: "qty_available", oldValue: "qty_available", newValue: "stock_count" },
    ];

    const renegotiated = await negotiationEngineA.renegotiate(agreementAB, changes);
    agreementStoreA.save(renegotiated);

    success(`Agreement renegotiated`);
    keyValue("      version", `${renegotiated.version}`);
    keyValue("      renegotiated at", renegotiated.lastRenegotiated ?? "N/A");

    // Show updated mappings
    const affectedMappings = renegotiated.mappings.filter((m) => m.transform?.startsWith("renegotiated:"));
    if (affectedMappings.length > 0) {
      console.log(`      ${c.bold}Updated mappings:${c.reset}`);
      for (const m of affectedMappings) {
        console.log(`        ${c.cyan}${m.localField}${c.reset} -> ${c.green}${m.remoteField}${c.reset} ${c.dim}(${m.transform})${c.reset}`);
      }
    }

    // Show history
    const history = agreementStoreA.getHistory(`http://localhost:${portB}`);
    keyValue("      history", `${history.length} previous version(s)`);
  } catch (err: any) {
    fail(`Renegotiation failed: ${err.message}`);
  }
  console.log("");

  // Step 8: Summary
  uiStep(8, TOTAL_STEPS, `${c.bold}Demo Complete${c.reset}`);
  console.log(`  ${c.brightCyan}${c.bold}${"=".repeat(52)}${c.reset}`);
  console.log(`  ${c.bold}  NEGOTIATION DEMO COMPLETE${c.reset}`);
  keyValue("    Server A", `http://localhost:${portA} (store)`);
  keyValue("    Server B", `http://localhost:${portB} (fulfillment)`);
  keyValue("    agreement", agreementAB ? `${c.green}active${c.reset} v${agreementAB.version + 1}` : "none");
  keyValue("    mappings", `${agreementAB?.mappings.length ?? 0}`);
  keyValue("    renegotiations", "1");
  console.log(`  ${c.brightCyan}${c.bold}${"=".repeat(52)}${c.reset}\n`);

  // Cleanup
  evidenceA.close();
  serverA.stop();
  serverB.stop();

  // Clean up temp dirs
  try {
    rmSync(tmpBase, { recursive: true, force: true });
  } catch {
    // Non-critical
  }
}

// ── Entry point ──
main().catch((err) => {
  fail(err.message);
  process.exit(1);
});
