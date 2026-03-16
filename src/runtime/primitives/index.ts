import { HttpPrimitive } from "./http";
import { ShellPrimitive } from "./shell";
import { CryptoPrimitive } from "./crypto";
import { SqlPrimitive } from "./sql";
import type { HttpClient } from "../http-client";
import type { DataStore } from "../store";

export interface PrimitiveResult {
  success: boolean;
  output: Record<string, unknown>;
  durationMs: number;
  error?: string;
}

export class PrimitiveRegistry {
  private http: HttpPrimitive;
  private shell: ShellPrimitive;
  private crypto: CryptoPrimitive;
  private sql: SqlPrimitive;

  constructor(options?: { httpClient?: HttpClient; dataStore?: DataStore }) {
    this.http = new HttpPrimitive(options?.httpClient);
    this.shell = new ShellPrimitive();
    this.crypto = new CryptoPrimitive();
    this.sql = new SqlPrimitive(options?.dataStore);
  }

  async execute(
    primitive: string,
    operation: string,
    params: Record<string, unknown>,
  ): Promise<PrimitiveResult> {
    const startTime = performance.now();

    try {
      let output: Record<string, unknown>;

      switch (primitive) {
        case "http":
          output = await this.http.execute(operation, params);
          break;
        case "shell":
          output = await this.shell.execute(operation, params);
          break;
        case "crypto":
          output = await this.crypto.execute(operation, params);
          break;
        case "sql":
          output = await this.sql.execute(operation, params);
          break;
        default:
          throw new Error(`Unknown primitive: "${primitive}"`);
      }

      const durationMs = Math.round(performance.now() - startTime);
      return { success: true, output, durationMs };
    } catch (err) {
      const durationMs = Math.round(performance.now() - startTime);
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, output: {}, durationMs, error: message };
    }
  }

  /** List all available primitives and their operations */
  listPrimitives(): { name: string; operations: string[] }[] {
    return [
      { name: "http", operations: ["request"] },
      { name: "shell", operations: ["run", "exec"] },
      { name: "crypto", operations: ["hmac", "hash", "uuid"] },
      { name: "sql", operations: ["query", "insert", "update"] },
    ];
  }
}

// Re-export individual primitives
export { HttpPrimitive } from "./http";
export { ShellPrimitive } from "./shell";
export { CryptoPrimitive } from "./crypto";
export { SqlPrimitive } from "./sql";
