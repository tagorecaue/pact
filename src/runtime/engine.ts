import type { LoadedContract } from "./registry";
import type { EvidenceStore } from "./evidence";
import { HttpClient, type HttpResponse } from "./http-client";
import type { LlmProvider } from "./llm";
import { detectDivergence, buildSchemaMap, type DivergenceReport } from "./divergence";
import { SelfHealer, applyFieldMapping } from "./self-healer";
import { PrimitiveRegistry } from "./primitives/index";
import { ConnectorRegistry, type LoadedConnector as LoadedConnectorDef, type ConnectorOperation } from "./connector";
import type {
  FlowExpr,
  StepNode,
  SequenceExpr,
  PipeExpr,
  ConditionalExpr,
  MatchExpr,
  LoopExpr,
  ExchangeExpr,
  AsyncExpr,
  DelegateExpr,
  Expression,
  DottedIdExpr,
  LiteralExpr,
  Comparison,
  AndExpr,
  OrExpr,
  NotExpr,
} from "../parser/ast";

export interface ExecutionResult {
  contractId: string;
  requestId: string;
  status: "success" | "failed";
  output: Record<string, unknown>;
  steps: StepResult[];
  durationMs: number;
  error?: string;
}

export interface StepResult {
  name: string;
  status: "success" | "failed" | "skipped";
  output?: unknown;
  durationMs: number;
  error?: string;
}

export class ExecutionEngine {
  private evidence: EvidenceStore;
  private httpClient: HttpClient;
  private llm: LlmProvider | null;
  private selfHealer: SelfHealer | null;
  private primitives: PrimitiveRegistry;
  private connectorRegistry: ConnectorRegistry;
  // Store last known schema per exchange target for divergence detection
  private schemaCache: Map<string, Record<string, string>> = new Map();
  // Store last successful response per exchange target
  private responseCache: Map<string, Record<string, unknown>> = new Map();
  // Last divergence report (for external access by demo/CLI)
  public lastDivergence: DivergenceReport | null = null;
  public lastHealResult: import("./self-healer").HealResult | null = null;

  constructor(evidence: EvidenceStore, httpClient?: HttpClient, llm?: LlmProvider, connectorRegistry?: ConnectorRegistry) {
    this.evidence = evidence;
    this.httpClient = httpClient ?? new HttpClient();
    this.llm = llm ?? null;
    this.selfHealer = this.llm
      ? new SelfHealer({ llm: this.llm, evidence: this.evidence })
      : null;
    this.primitives = new PrimitiveRegistry({ httpClient: this.httpClient });
    this.connectorRegistry = connectorRegistry ?? new ConnectorRegistry();
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

    try {
      const execution = contract.sections.execution;
      if (!execution) {
        throw new PactRuntimeError("No @X (Execution) section in contract");
      }

      for (const node of execution.flow) {
        await this.executeNode(node, ctx, contractId, requestId, steps);
      }

      const durationMs = Math.round(performance.now() - startTime);
      return {
        contractId,
        requestId,
        status: "success",
        output: ctx.toOutput(),
        steps,
        durationMs,
      };
    } catch (err) {
      const durationMs = Math.round(performance.now() - startTime);
      const message = err instanceof Error ? err.message : String(err);
      return {
        contractId,
        requestId,
        status: "failed",
        output: ctx.toOutput(),
        steps,
        durationMs,
        error: message,
      };
    }
  }

  private async executeNode(
    node: FlowExpr,
    ctx: ExecutionContext,
    contractId: string,
    requestId: string,
    steps: StepResult[],
  ): Promise<void> {
    switch (node.kind) {
      case "StepNode":
        await this.executeStep(node, ctx, contractId, requestId, steps);
        break;

      case "SequenceExpr":
        await this.executeNode(node.right, ctx, contractId, requestId, steps);
        break;

      case "PipeExpr":
        await this.executeNode(node.right, ctx, contractId, requestId, steps);
        break;

      case "ConditionalExpr":
        await this.executeConditional(node, ctx, contractId, requestId, steps);
        break;

      case "MatchExpr":
        await this.executeMatch(node, ctx, contractId, requestId, steps);
        break;

      case "LoopExpr":
        await this.executeLoop(node, ctx, contractId, requestId, steps);
        break;

      case "ExchangeExpr":
        await this.executeExchange(node, ctx, contractId, requestId, steps);
        break;

      case "AsyncExpr":
        // Fire and forget — execute but don't await in real async
        await this.executeNode(node.step, ctx, contractId, requestId, steps);
        break;

      case "DelegateExpr":
        await this.executeDelegate(node, ctx, contractId, requestId, steps);
        break;

      default:
        // Unknown node type — skip
        break;
    }
  }

  private async executeStep(
    node: StepNode,
    ctx: ExecutionContext,
    contractId: string,
    requestId: string,
    steps: StepResult[],
  ): Promise<void> {
    const startTime = performance.now();
    const stepName = node.name;

    // Handle shell/exec steps asynchronously via PrimitiveRegistry
    if (stepName === "shell" || stepName === "exec") {
      try {
        const command = node.args[0] ?? "";
        const result = await this.primitives.execute("shell", "run", {
          command,
          timeout: 30_000,
        });
        const durationMs = Math.round(performance.now() - startTime);

        if (result.success) {
          ctx.set("_shell_stdout", result.output.stdout);
          ctx.set("_shell_stderr", result.output.stderr);
          ctx.set("_shell_exit_code", result.output.exitCode);
          steps.push({ name: stepName, status: "success", output: result.output, durationMs });
        } else {
          steps.push({ name: stepName, status: "failed", durationMs, error: result.error });
          throw new PactRuntimeError(result.error ?? "Shell command failed");
        }

        this.evidence.record({
          contract_id: contractId,
          request_id: requestId,
          step_name: stepName,
          action: stepName,
          input: JSON.stringify({ command }),
          output: JSON.stringify(result.output),
          duration_ms: durationMs,
          timestamp: new Date().toISOString(),
          status: result.success ? "success" : "failed",
        });
        return;
      } catch (err) {
        const durationMs = Math.round(performance.now() - startTime);
        const message = err instanceof Error ? err.message : String(err);
        steps.push({ name: stepName, status: "failed", durationMs, error: message });
        this.evidence.record({
          contract_id: contractId,
          request_id: requestId,
          step_name: stepName,
          action: stepName,
          input: JSON.stringify(node.args),
          output: JSON.stringify({ error: message }),
          duration_ms: durationMs,
          timestamp: new Date().toISOString(),
          status: "failed",
        });
        throw err;
      }
    }

    try {
      const output = this.runBuiltinStep(stepName, node.args, ctx);
      const durationMs = Math.round(performance.now() - startTime);

      steps.push({ name: stepName, status: "success", output, durationMs });

      this.evidence.record({
        contract_id: contractId,
        request_id: requestId,
        step_name: stepName,
        action: stepName,
        input: JSON.stringify(node.args),
        output: output != null ? JSON.stringify(output) : null,
        duration_ms: durationMs,
        timestamp: new Date().toISOString(),
        status: "success",
      });
    } catch (err) {
      const durationMs = Math.round(performance.now() - startTime);
      const message = err instanceof Error ? err.message : String(err);

      steps.push({ name: stepName, status: "failed", durationMs, error: message });

      this.evidence.record({
        contract_id: contractId,
        request_id: requestId,
        step_name: stepName,
        action: stepName,
        input: JSON.stringify(node.args),
        output: JSON.stringify({ error: message }),
        duration_ms: durationMs,
        timestamp: new Date().toISOString(),
        status: "failed",
      });

      throw err;
    }
  }

  private runBuiltinStep(
    name: string,
    args: string[],
    ctx: ExecutionContext,
  ): unknown {
    switch (name) {
      case "validate":
      case "validate_input":
      case "validate_email_format":
      case "validate_doc":
      case "check_email_format":
      case "normalize_email":
        // Validation steps — check that referenced fields exist in context
        return this.stepValidate(args, ctx);

      case "persist":
        // Persist entity to context store
        return this.stepPersist(args, ctx);

      case "emit":
        // Emit event — log it
        return this.stepEmit(args, ctx);

      case "abort":
        // Abort execution with message
        throw new PactRuntimeError(
          `Aborted: ${args[0] ?? "no reason given"}`,
        );

      case "set":
      case "update":
      case "update_order":
      case "update_payment":
      case "update_subscription":
        // Set fields in context
        return this.stepSet(args, ctx);

      case "generate_id":
        // Generate a UUID
        const id = crypto.randomUUID();
        ctx.set("generated_id", id);
        return { id };

      case "shell":
      case "exec":
        // Shell execution — delegate to executeShell (async, but called sync here)
        // Store a marker; the async execution happens via executeStep override
        return { step: name, deferred: true, args };

      default:
        // Unknown step — treat as a generic action that succeeds
        // This allows contracts to reference domain-specific steps
        return this.stepGeneric(name, args, ctx);
    }
  }

  private stepValidate(args: string[], ctx: ExecutionContext): unknown {
    for (const arg of args) {
      const value = ctx.get(arg);
      if (value === undefined || value === null || value === "") {
        throw new PactRuntimeError(`Validation failed: '${arg}' is missing or empty`);
      }
    }
    return { validated: args, ok: true };
  }

  private stepPersist(args: string[], ctx: ExecutionContext): unknown {
    const entityName = args[0] ?? "default";
    const data = ctx.toOutput();
    // Store as persisted entity
    ctx.set(`_persisted.${entityName}`, data);
    ctx.set(`${entityName}.persisted`, true);
    return { entity: entityName, persisted: true, fields: Object.keys(data).length };
  }

  private stepEmit(args: string[], ctx: ExecutionContext): unknown {
    const eventName = args[0] ?? "unknown";
    const event = {
      type: eventName,
      timestamp: new Date().toISOString(),
      data: args.slice(1),
    };
    // Store emitted events
    const events = (ctx.get("_events") as unknown[]) ?? [];
    events.push(event);
    ctx.set("_events", events);
    return event;
  }

  private stepSet(args: string[], ctx: ExecutionContext): unknown {
    // args: field1 value1 field2 value2 ...
    const result: Record<string, string> = {};
    for (let i = 0; i < args.length - 1; i += 2) {
      const key = args[i]!;
      const value = args[i + 1]!;
      ctx.set(key, value);
      result[key] = value;
    }
    return result;
  }

  private stepGeneric(
    name: string,
    args: string[],
    ctx: ExecutionContext,
  ): unknown {
    // Generic step — record that it ran, resolve dotted args from context
    const resolved: Record<string, unknown> = {};
    for (const arg of args) {
      if (arg.includes(".")) {
        resolved[arg] = ctx.get(arg) ?? arg;
      } else {
        resolved[arg] = ctx.get(arg) ?? arg;
      }
    }
    ctx.set(`_step.${name}`, { completed: true, args: resolved });
    return { step: name, completed: true };
  }

  private async executeConditional(
    node: ConditionalExpr,
    ctx: ExecutionContext,
    contractId: string,
    requestId: string,
    steps: StepResult[],
  ): Promise<void> {
    if (evaluateCondition(node.condition, ctx)) {
      for (const child of node.then) {
        await this.executeNode(child, ctx, contractId, requestId, steps);
      }
    } else if (node.else) {
      for (const child of node.else) {
        await this.executeNode(child, ctx, contractId, requestId, steps);
      }
    }
  }

  private async executeMatch(
    node: MatchExpr,
    ctx: ExecutionContext,
    contractId: string,
    requestId: string,
    steps: StepResult[],
  ): Promise<void> {
    const value = resolveExpression(node.value, ctx);

    for (const arm of node.arms) {
      if (arm.pattern === "_" || arm.pattern === String(value)) {
        for (const child of arm.body) {
          await this.executeNode(child, ctx, contractId, requestId, steps);
        }
        return;
      }
    }
  }

  private async executeLoop(
    node: LoopExpr,
    ctx: ExecutionContext,
    contractId: string,
    requestId: string,
    steps: StepResult[],
  ): Promise<void> {
    let iterations = 0;
    while (
      evaluateCondition(node.condition, ctx) &&
      iterations < node.max
    ) {
      for (const child of node.body) {
        await this.executeNode(child, ctx, contractId, requestId, steps);
      }
      iterations++;
    }
  }

  private async executeExchange(
    node: ExchangeExpr,
    ctx: ExecutionContext,
    contractId: string,
    requestId: string,
    steps: StepResult[],
  ): Promise<void> {
    const startTime = performance.now();
    const stepName = `exchange:${node.target}`;

    // Build send payload from context
    const payload: Record<string, unknown> = {};
    for (const field of node.send) {
      payload[field] = ctx.get(field) ?? field;
    }

    // Try to resolve via ConnectorRegistry first
    const connectorResolution = this.connectorRegistry.resolve(node.target);

    // Resolve target URL
    const baseUrl = ctx.get("_base_url") as string | undefined;
    let targetUrl: string | null = null;
    let method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" = "POST";
    let headers: Record<string, string> = {};

    if (connectorResolution) {
      // Connector found — build URL from connector baseUrl + operation path
      const { connector, operation } = connectorResolution;
      targetUrl = connector.baseUrl + operation.path;
      method = (operation.method as typeof method) ?? "POST";

      // Add auth headers based on connector auth type
      const authEnvValue = process.env[connector.authEnv] ?? "";
      if (authEnvValue) {
        if (connector.authType === "bearer_token") {
          headers["Authorization"] = `Bearer ${authEnvValue}`;
        } else if (connector.authType === "api_key") {
          headers["X-API-Key"] = authEnvValue;
        } else if (connector.authType === "basic") {
          headers["Authorization"] = `Basic ${authEnvValue}`;
        }
      }
    } else if (node.target.startsWith("http://") || node.target.startsWith("https://")) {
      targetUrl = node.target;
    } else if (node.target.includes("/")) {
      // Target has path segments (e.g., httpbin.org/get) — treat as full host+path
      // Use http:// for localhost targets, https:// for everything else
      const protocol = node.target.startsWith("localhost") || node.target.startsWith("127.0.0.1") ? "http" : "https";
      targetUrl = `${protocol}://${node.target}`;
    } else if (baseUrl) {
      // Dotted target without slash — convert dots to path segments
      targetUrl = `${baseUrl}/${node.target.replace(/\./g, "/")}`;
    }

    let result: Record<string, unknown>;

    if (targetUrl) {
      // Real HTTP exchange
      try {
        const response = await this.httpClient.request({
          method,
          url: targetUrl,
          headers: Object.keys(headers).length > 0 ? headers : undefined,
          body: method !== "GET" ? payload : undefined,
          timeout: 30_000,
        });

        result = {
          target: node.target,
          url: targetUrl,
          status: response.status,
          sent: payload,
          response: response.body,
          durationMs: response.durationMs,
        };

        // Set received fields from response body
        if (response.body && typeof response.body === "object") {
          let body = response.body as Record<string, unknown>;

          // If response is an array, use the first item for schema detection
          if (Array.isArray(response.body) && response.body.length > 0) {
            body = response.body[0] as Record<string, unknown>;
          }

          // ── Phase 5: Divergence detection ──
          const previousSchema = this.schemaCache.get(node.target) ?? null;
          const divergence = detectDivergence(
            node.receive,
            previousSchema,
            body,
            node.target,
          );

          if (divergence.divergences.length > 0) {
            this.lastDivergence = divergence;

            // Record divergence in evidence
            this.evidence.record({
              contract_id: contractId,
              request_id: requestId,
              step_name: `divergence:${node.target}`,
              action: "divergence_detected",
              input: JSON.stringify({ expectedFields: node.receive, previousSchema }),
              output: JSON.stringify(divergence),
              duration_ms: 0,
              timestamp: new Date().toISOString(),
              status: divergence.hasHighImpact ? "failed" : "success",
            });

            // If high impact divergence and LLM is available, attempt self-healing
            if (divergence.hasHighImpact && this.selfHealer) {
              const contract = ctx.get("_contract") as LoadedContract | undefined;
              if (contract) {
                const lastResponse = this.responseCache.get(node.target) ?? null;
                const healResult = await this.selfHealer.heal(
                  contract,
                  divergence,
                  lastResponse,
                  body,
                );
                this.lastHealResult = healResult;

                // Apply field mapping if healing succeeded
                if (healResult.success && healResult.fieldMapping) {
                  body = applyFieldMapping(body, healResult.fieldMapping, node.receive) as Record<string, unknown>;
                }
              }
            }
          } else {
            this.lastDivergence = null;
          }

          // Store schema and response for future comparison
          this.schemaCache.set(node.target, buildSchemaMap(body));
          this.responseCache.set(node.target, body);

          // Extract fields from (possibly adapted) body
          for (const field of node.receive) {
            const value = body[field] ?? body[toCamelCase(field)] ?? body[toSnakeCase(field)];
            if (value !== undefined) {
              ctx.set(field, value);
            }
          }
        }
      } catch (err) {
        const durationMs = Math.round(performance.now() - startTime);
        const message = err instanceof Error ? err.message : String(err);

        steps.push({ name: stepName, status: "failed", durationMs, error: message });
        this.evidence.record({
          contract_id: contractId,
          request_id: requestId,
          step_name: stepName,
          action: "exchange",
          input: JSON.stringify({ target: node.target, url: targetUrl, send: payload }),
          output: JSON.stringify({ error: message }),
          duration_ms: durationMs,
          timestamp: new Date().toISOString(),
          status: "failed",
        });
        throw err;
      }
    } else {
      // Mock exchange — no URL configured
      result = {
        target: node.target,
        mode: "mock",
        sent: payload,
        received: node.receive.map((field) => ({ field, value: `mock_${field}` })),
      };
      for (const field of node.receive) {
        ctx.set(field, `mock_${field}`);
      }
    }

    const durationMs = Math.round(performance.now() - startTime);
    steps.push({ name: stepName, status: "success", output: result, durationMs });

    this.evidence.record({
      contract_id: contractId,
      request_id: requestId,
      step_name: stepName,
      action: "exchange",
      input: JSON.stringify({ target: node.target, send: payload }),
      output: JSON.stringify(result),
      duration_ms: durationMs,
      timestamp: new Date().toISOString(),
      status: "success",
    });
  }

  private async executeDelegate(
    node: DelegateExpr,
    ctx: ExecutionContext,
    contractId: string,
    requestId: string,
    steps: StepResult[],
  ): Promise<void> {
    // In Phase 1, delegate is a stub — records the delegation
    const startTime = performance.now();
    const result = { contract: node.contract, delegated: true };
    const durationMs = Math.round(performance.now() - startTime);

    steps.push({ name: `delegate:${node.contract}`, status: "success", output: result, durationMs });

    this.evidence.record({
      contract_id: contractId,
      request_id: requestId,
      step_name: `delegate:${node.contract}`,
      action: "delegate",
      input: JSON.stringify({ contract: node.contract, bindings: node.bindings }),
      output: JSON.stringify(result),
      duration_ms: durationMs,
      timestamp: new Date().toISOString(),
      status: "success",
    });
  }
}

// ── Execution Context ──

export class ExecutionContext {
  private data: Map<string, unknown> = new Map();

  constructor(input: Record<string, unknown>) {
    for (const [key, value] of Object.entries(input)) {
      this.data.set(key, value);
    }
  }

  get(key: string): unknown {
    // Support dotted paths: "customer.email" -> data.get("customer").email
    if (key.includes(".")) {
      const parts = key.split(".");
      let current: unknown = this.data.get(parts[0]!);
      for (let i = 1; i < parts.length; i++) {
        if (current == null || typeof current !== "object") return undefined;
        current = (current as Record<string, unknown>)[parts[i]!];
      }
      return current;
    }
    return this.data.get(key);
  }

  set(key: string, value: unknown): void {
    this.data.set(key, value);
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  toOutput(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of this.data.entries()) {
      if (!key.startsWith("_")) {
        result[key] = value;
      }
    }
    return result;
  }
}

// ── Expression evaluation ──

function evaluateCondition(expr: Expression, ctx: ExecutionContext): boolean {
  const value = resolveExpression(expr, ctx);
  return Boolean(value);
}

function resolveExpression(
  expr: Expression,
  ctx: ExecutionContext,
): unknown {
  switch (expr.kind) {
    case "DottedIdExpr":
      // Single identifier or dotted path
      if (expr.parts.length === 1) {
        const val = ctx.get(expr.parts[0]!);
        return val !== undefined ? val : expr.parts[0];
      }
      return ctx.get(expr.parts.join(".")) ?? expr.parts.join(".");

    case "LiteralExpr":
      switch (expr.type) {
        case "number":
          return parseFloat(expr.value);
        case "bool":
          return expr.value === "true";
        case "keyword":
          if (expr.value === "now") return new Date().toISOString();
          if (expr.value === "null" || expr.value === "none") return null;
          return expr.value;
        default:
          return expr.value;
      }

    case "Comparison":
      return evaluateComparison(expr, ctx);

    case "AndExpr":
      return (
        Boolean(resolveExpression(expr.left, ctx)) &&
        Boolean(resolveExpression(expr.right, ctx))
      );

    case "OrExpr":
      return (
        Boolean(resolveExpression(expr.left, ctx)) ||
        Boolean(resolveExpression(expr.right, ctx))
      );

    case "NotExpr":
      return !Boolean(resolveExpression(expr.expr, ctx));

    case "FunctionCall":
      return evaluateFunction(expr.name, expr.args, ctx);

    case "GroupExpr":
      return resolveExpression(expr.expr, ctx);

    default:
      return true;
  }
}

function evaluateComparison(expr: Comparison, ctx: ExecutionContext): boolean {
  const left = resolveExpression(expr.left, ctx);
  const right = resolveExpression(expr.right, ctx);

  switch (expr.op) {
    case "=":
      return left == right;
    case "!=":
      return left != right;
    case ">":
      return Number(left) > Number(right);
    case "<":
      return Number(left) < Number(right);
    case ">=":
      return Number(left) >= Number(right);
    case "<=":
      return Number(left) <= Number(right);
    case "min":
      return Number(left) >= Number(right);
    case "max":
      return Number(left) <= Number(right);
    case "exists":
      return left !== undefined && left !== null;
    case "unique":
    case "matches":
    case "valid":
      // For Phase 1, these always pass
      return true;
    default:
      return true;
  }
}

function evaluateFunction(
  name: string,
  args: Expression[],
  ctx: ExecutionContext,
): unknown {
  switch (name) {
    case "count": {
      const collection = args[0] ? resolveExpression(args[0], ctx) : [];
      return Array.isArray(collection) ? collection.length : 0;
    }
    default:
      return true;
  }
}

// ── Errors ──

export class PactRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PactRuntimeError";
  }
}

// ── String helpers ──

function toCamelCase(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function toSnakeCase(s: string): string {
  return s.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
}
