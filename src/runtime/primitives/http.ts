import { HttpClient, type HttpRequestSpec, type HttpResponse } from "../http-client";

export interface HttpPrimitiveResult {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  durationMs: number;
}

/**
 * Resolves env:VAR_NAME references in parameter values to process.env.VAR_NAME.
 */
function resolveEnvRefs(value: unknown): unknown {
  if (typeof value === "string") {
    if (value.startsWith("env:")) {
      const envVar = value.slice(4);
      return process.env[envVar] ?? "";
    }
    // Also handle ${env:VAR} patterns within strings
    return value.replace(/\$\{env:([^}]+)\}/g, (_, varName) => {
      return process.env[varName] ?? "";
    });
  }
  if (Array.isArray(value)) {
    return value.map(resolveEnvRefs);
  }
  if (value !== null && typeof value === "object") {
    const resolved: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      resolved[k] = resolveEnvRefs(v);
    }
    return resolved;
  }
  return value;
}

export class HttpPrimitive {
  private client: HttpClient;

  constructor(client?: HttpClient) {
    this.client = client ?? new HttpClient();
  }

  async execute(operation: string, params: Record<string, unknown>): Promise<HttpPrimitiveResult> {
    // Resolve env references in all params
    const resolved = resolveEnvRefs(params) as Record<string, unknown>;

    switch (operation) {
      case "request":
        return this.request(resolved);
      default:
        throw new Error(`HttpPrimitive: unknown operation "${operation}"`);
    }
  }

  private async request(params: Record<string, unknown>): Promise<HttpPrimitiveResult> {
    const method = ((params.method as string) ?? "GET").toUpperCase() as HttpRequestSpec["method"];
    const url = params.url as string;
    if (!url) {
      throw new Error("HttpPrimitive.request: url is required");
    }

    const headers = (params.headers as Record<string, string>) ?? {};
    const body = params.body;
    const timeout = (params.timeout as number) ?? 30_000;

    const spec: HttpRequestSpec = {
      method,
      url,
      headers,
      body,
      timeout,
    };

    const response: HttpResponse = await this.client.request(spec);

    return {
      status: response.status,
      headers: response.headers,
      body: response.body,
      durationMs: response.durationMs,
    };
  }
}
