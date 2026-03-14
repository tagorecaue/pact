import type { Server } from "bun";
import { ContractRegistry, type LoadedContract } from "./registry";
import { EvidenceStore } from "./evidence";
import { DataStore } from "./store";
import { ExecutionEngine } from "./engine";
import { HttpClient } from "./http-client";

export interface PactServerOptions {
  contractsDir: string;
  port?: number;
  dataDir?: string;
}

export class PactServer {
  private registry: ContractRegistry;
  private evidence: EvidenceStore;
  private store: DataStore;
  private engine: ExecutionEngine;
  private httpClient: HttpClient;
  private server: Server | null = null;
  private options: Required<PactServerOptions>;

  constructor(options: PactServerOptions) {
    this.options = {
      port: 3000,
      dataDir: "data",
      ...options,
    };

    this.registry = new ContractRegistry();
    this.evidence = new EvidenceStore(this.options.dataDir);
    this.store = new DataStore(this.options.dataDir);
    this.httpClient = new HttpClient();
    this.engine = new ExecutionEngine(this.evidence);
  }

  start(): Server {
    // Load contracts
    this.registry.loadDirectory(this.options.contractsDir);
    const contracts = this.registry.getAll();

    // Auto-create tables from @E entities
    for (const contract of contracts) {
      if (contract.sections.entities) {
        for (const entity of contract.sections.entities.entities) {
          this.store.ensureTable(entity.name, entity.fields);
        }
      }
    }

    // Log loaded contracts
    console.log(`\n  contracts loaded: ${contracts.length}`);
    for (const c of contracts) {
      const routes = this.getRoutes(c);
      if (routes.length > 0) {
        console.log(`    ${c.name} ${c.version} → ${routes.join(", ")}`);
      } else {
        console.log(`    ${c.name} ${c.version}`);
      }
    }

    // Start HTTP server
    const self = this;
    this.server = Bun.serve({
      port: this.options.port,
      async fetch(req: Request): Promise<Response> {
        return self.handleRequest(req);
      },
    });

    console.log(`\n  listening on http://localhost:${this.server.port}\n`);
    return this.server;
  }

  stop(): void {
    this.server?.stop();
    this.evidence.close();
    this.store.close();
  }

  private getRoutes(contract: LoadedContract): string[] {
    const routes: string[] = [];
    if (contract.sections.triggers) {
      for (const t of contract.sections.triggers.triggers) {
        if (t.type === "http" && t.args.length >= 2) {
          routes.push(`${t.args[0]!.toUpperCase()} ${t.args[1]}`);
        }
      }
    }
    return routes;
  }

  private async handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const method = req.method.toUpperCase();
    const path = url.pathname;

    // Health check
    if (path === "/.pact/health") {
      return Response.json({ status: "ok", contracts: this.registry.getAll().length });
    }

    // List contracts
    if (path === "/.pact/contracts" && method === "GET") {
      const contracts = this.registry.getAll().map((c) => ({
        name: c.name,
        version: c.version,
        domain: c.domain,
        routes: this.getRoutes(c),
      }));
      return Response.json({ contracts });
    }

    // Resolve contract by route
    const contract = this.registry.getByRoute(method, path);
    if (!contract) {
      return Response.json(
        { error: "No contract matches this route", method, path },
        { status: 404 },
      );
    }

    // Parse request body
    let input: Record<string, unknown> = {};
    try {
      if (method !== "GET" && method !== "HEAD") {
        const contentType = req.headers.get("content-type") ?? "";
        if (contentType.includes("json")) {
          input = (await req.json()) as Record<string, unknown>;
        } else if (contentType.includes("form")) {
          const form = await req.formData();
          for (const [key, value] of form.entries()) {
            input[key] = value;
          }
        }
      }
    } catch {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    // Add query params to input
    for (const [key, value] of url.searchParams.entries()) {
      input[key] = value;
    }

    // Execute contract
    const result = await this.engine.execute(contract, input);

    // If contract has entities and execution succeeded, persist
    if (result.status === "success" && contract.sections.entities) {
      for (const entity of contract.sections.entities.entities) {
        // Check if persist was called for this entity
        const persisted = result.output[`${entity.name}.persisted`];
        if (persisted) {
          const entityData: Record<string, unknown> = {};
          for (const field of entity.fields) {
            const value = result.output[field.name];
            if (value !== undefined) {
              entityData[field.name] = value;
            }
          }
          if (Object.keys(entityData).length > 0) {
            try {
              const row = this.store.insert(entity.name, entityData);
              result.output[`_stored.${entity.name}`] = row;
            } catch (e: any) {
              // Log but don't fail the whole request
              result.output[`_store_error.${entity.name}`] = e.message;
            }
          }
        }
      }
    }

    // Build response
    const status = result.status === "success" ? 200 : 500;
    return Response.json(
      {
        contract: contract.name,
        status: result.status,
        requestId: result.requestId,
        durationMs: result.durationMs,
        output: result.output,
        steps: result.steps.map((s) => ({
          name: s.name,
          status: s.status,
          durationMs: s.durationMs,
          error: s.error,
        })),
        error: result.error,
      },
      { status },
    );
  }
}
