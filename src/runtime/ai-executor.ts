import type { LlmProvider } from "./llm";
import type { LoadedContract } from "./registry";
import type { EvidenceStore } from "./evidence";
import type { DataStore } from "./store";
import type { ExecutionResult, StepResult } from "./engine";
import { ExecutionContext } from "./engine";

export interface AiExecutorOptions {
  llm: LlmProvider;
  evidence: EvidenceStore;
  store?: DataStore;
}

export class AiExecutor {
  private llm: LlmProvider;
  private evidence: EvidenceStore;
  private store?: DataStore;

  constructor(options: AiExecutorOptions) {
    this.llm = options.llm;
    this.evidence = options.evidence;
    this.store = options.store;
  }

  async execute(
    contract: LoadedContract,
    input: Record<string, unknown>,
  ): Promise<ExecutionResult> {
    const requestId = crypto.randomUUID();
    const contractId = contract.name;
    const startTime = performance.now();
    const steps: StepResult[] = [];
    const ctx = new ExecutionContext(input);

    const reasoning = contract.ast.sections.find(
      (s) => s.kind === "ReasoningSection",
    );
    if (!reasoning || reasoning.kind !== "ReasoningSection") {
      return {
        contractId,
        requestId,
        status: "failed",
        output: ctx.toOutput(),
        steps,
        durationMs: Math.round(performance.now() - startTime),
        error: "No @R (Reasoning) section in contract",
      };
    }

    // Step 1: Build prompt from contract
    const prompt = this.buildPrompt(contract, input);
    steps.push({
      name: "build_prompt",
      status: "success",
      durationMs: 0,
      output: { promptLength: prompt.length },
    });

    // Step 2: Call LLM
    let generatedCode: string;
    try {
      const llmStart = performance.now();
      const response = await this.llm.complete(prompt, 2048);
      const llmDuration = Math.round(performance.now() - llmStart);

      generatedCode = extractCode(response.text);

      steps.push({
        name: "llm_reasoning",
        status: "success",
        durationMs: llmDuration,
        output: {
          provider: response.provider,
          responseLength: response.text.length,
          codeLength: generatedCode.length,
        },
      });

      this.evidence.record({
        contract_id: contractId,
        request_id: requestId,
        step_name: "llm_reasoning",
        action: "reasoning",
        input: JSON.stringify({ promptLength: prompt.length }),
        output: JSON.stringify({
          provider: response.provider,
          codeLength: generatedCode.length,
        }),
        duration_ms: llmDuration,
        timestamp: new Date().toISOString(),
        status: "success",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      steps.push({
        name: "llm_reasoning",
        status: "failed",
        durationMs: Math.round(performance.now() - startTime),
        error: message,
      });
      return {
        contractId,
        requestId,
        status: "failed",
        output: ctx.toOutput(),
        steps,
        durationMs: Math.round(performance.now() - startTime),
        error: `LLM reasoning failed: ${message}`,
      };
    }

    // Step 3: Execute generated code in sandbox
    try {
      const execStart = performance.now();
      const result = await this.executeSandboxed(generatedCode, ctx);
      const execDuration = Math.round(performance.now() - execStart);

      steps.push({
        name: "execute_generated",
        status: "success",
        durationMs: execDuration,
        output: result,
      });

      this.evidence.record({
        contract_id: contractId,
        request_id: requestId,
        step_name: "execute_generated",
        action: "execute",
        input: JSON.stringify({ codeLength: generatedCode.length }),
        output: result != null ? JSON.stringify(result) : null,
        duration_ms: execDuration,
        timestamp: new Date().toISOString(),
        status: "success",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      steps.push({
        name: "execute_generated",
        status: "failed",
        durationMs: Math.round(performance.now() - startTime),
        error: message,
      });
      return {
        contractId,
        requestId,
        status: "failed",
        output: ctx.toOutput(),
        steps,
        durationMs: Math.round(performance.now() - startTime),
        error: `Execution failed: ${message}`,
      };
    }

    return {
      contractId,
      requestId,
      status: "success",
      output: ctx.toOutput(),
      steps,
      durationMs: Math.round(performance.now() - startTime),
    };
  }

  private buildPrompt(
    contract: LoadedContract,
    input: Record<string, unknown>,
  ): string {
    const reasoning = contract.ast.sections.find(
      (s) => s.kind === "ReasoningSection",
    );
    if (!reasoning || reasoning.kind !== "ReasoningSection") {
      return "";
    }

    const parts: string[] = [];

    parts.push("You are the Pact AI Executor. Your job is to execute a contract by generating JavaScript/TypeScript code.");
    parts.push("");
    parts.push(`Contract: ${contract.name} ${contract.version}`);
    if (contract.domain) parts.push(`Domain: ${contract.domain}`);
    parts.push("");

    // Objective
    if (reasoning.objective) {
      parts.push(`## Objective`);
      parts.push(reasoning.objective);
      parts.push("");
    }

    // Intent
    if (contract.sections.intent?.natural) {
      parts.push(`## Intent`);
      parts.push(contract.sections.intent.natural);
      parts.push("");
    }

    // Entities
    if (contract.sections.entities) {
      parts.push(`## Available Entities`);
      for (const entity of contract.sections.entities.entities) {
        parts.push(`### ${entity.name}`);
        for (const field of entity.fields) {
          const typeName =
            field.type.kind === "PrimitiveType"
              ? field.type.name
              : field.type.kind;
          parts.push(`  - ${field.name}: ${typeName}${field.modifiers.join("")}`);
        }
      }
      parts.push("");
    }

    // Constraints
    if (contract.sections.constraints) {
      parts.push(`## Constraints (must respect)`);
      for (const c of contract.sections.constraints.constraints) {
        if (c.message) parts.push(`- ${c.message}`);
      }
      parts.push("");
    }

    // Strategy
    if (reasoning.strategy.length > 0) {
      parts.push(`## Strategy preferences`);
      for (const s of reasoning.strategy) {
        parts.push(`- prefer ${s.prefer} when ${s.when}`);
      }
      parts.push("");
    }

    // Freedom
    if (reasoning.freedom.length > 0) {
      parts.push(`## Freedoms (you may decide)`);
      for (const f of reasoning.freedom) {
        parts.push(`- ${f.name}: ${f.value}`);
      }
      parts.push("");
    }

    // Locked
    if (reasoning.locked.length > 0) {
      parts.push(`## Locked (you must never/always)`);
      for (const l of reasoning.locked) {
        parts.push(`- ${l.modifier} ${l.action}`);
      }
      parts.push("");
    }

    // Input
    parts.push(`## Input data`);
    parts.push("```json");
    parts.push(JSON.stringify(input, null, 2));
    parts.push("```");
    parts.push("");

    // Available primitives
    parts.push(`## Available primitives`);
    parts.push("You have access to these functions in your code:");
    parts.push("- ctx.get(key) — get a value from context");
    parts.push("- ctx.set(key, value) — set a value in context");
    parts.push("- ctx.has(key) — check if a value exists");
    parts.push("- log(message) — log a message");
    parts.push("- emit(eventName, data) — emit an event");
    parts.push("");

    // Instructions
    parts.push(`## Instructions`);
    parts.push("Generate a JavaScript function body that accomplishes the objective.");
    parts.push("The function receives (ctx, log, emit) as parameters.");
    parts.push("Return your code inside a ```javascript code block.");
    parts.push("Do NOT use require/import. Only use the provided primitives.");
    parts.push("Keep the code simple and focused on the objective.");

    return parts.join("\n");
  }

  private async executeSandboxed(
    code: string,
    ctx: ExecutionContext,
  ): Promise<unknown> {
    const logs: string[] = [];
    const events: { name: string; data: unknown }[] = [];

    const log = (msg: string) => {
      logs.push(msg);
    };

    const emit = (name: string, data?: unknown) => {
      events.push({ name, data });
      const eventList = (ctx.get("_events") as unknown[]) ?? [];
      eventList.push({ type: name, data, timestamp: new Date().toISOString() });
      ctx.set("_events", eventList);
    };

    // Create sandboxed function
    try {
      const fn = new Function("ctx", "log", "emit", code);
      const result = await fn(ctx, log, emit);

      ctx.set("_ai_logs", logs);
      ctx.set("_ai_events", events);

      return { result, logs, events };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Sandbox execution error: ${message}`);
    }
  }
}

// ── Helpers ──

function extractCode(llmOutput: string): string {
  // Extract code from markdown code blocks
  const jsMatch = llmOutput.match(/```(?:javascript|js|typescript|ts)\n([\s\S]*?)```/);
  if (jsMatch?.[1]) return jsMatch[1].trim();

  // Try generic code block
  const genericMatch = llmOutput.match(/```\n([\s\S]*?)```/);
  if (genericMatch?.[1]) return genericMatch[1].trim();

  // If no code block, use the whole output as code
  return llmOutput.trim();
}
