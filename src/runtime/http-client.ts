export interface HttpRequestSpec {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  durationMs: number;
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503]);

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 1_000;

export class HttpClient {
  private maxRetries: number;
  private retryDelayMs: number;

  constructor(options?: { maxRetries?: number; retryDelayMs?: number }) {
    this.maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryDelayMs = options?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  }

  async request(spec: HttpRequestSpec): Promise<HttpResponse> {
    const timeoutMs = spec.timeout ?? DEFAULT_TIMEOUT_MS;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        await sleep(this.retryDelayMs);
      }

      const start = performance.now();

      let res: Response;
      try {
        res = await fetch(spec.url, {
          method: spec.method,
          headers: buildHeaders(spec),
          body: serializeBody(spec.body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        if (isTimeoutError(err)) {
          throw new HttpTimeoutError(spec.method, spec.url, timeoutMs);
        }
        throw err;
      }

      const durationMs = Math.round(performance.now() - start);

      if (RETRYABLE_STATUSES.has(res.status) && attempt < this.maxRetries) {
        lastError = new Error(`HTTP ${res.status} from ${spec.method} ${spec.url}`);
        continue;
      }

      const responseHeaders = extractHeaders(res.headers);
      const body = await parseBody(res);

      return { status: res.status, headers: responseHeaders, body, durationMs };
    }

    // All retries exhausted — throw the last error
    throw lastError ?? new Error("Request failed after retries");
  }
}

// ── Helpers ──

function buildHeaders(spec: HttpRequestSpec): Record<string, string> {
  const headers: Record<string, string> = { ...spec.headers };

  if (spec.body !== undefined && spec.body !== null && !headers["content-type"]) {
    headers["content-type"] = "application/json";
  }

  return headers;
}

function serializeBody(body: unknown): string | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body === "string") return body;
  return JSON.stringify(body);
}

function extractHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

async function parseBody(res: Response): Promise<unknown> {
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("json")) {
    return res.json();
  }
  return res.text();
}

function isTimeoutError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "TimeoutError") return true;
  if (err instanceof Error && err.name === "TimeoutError") return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Errors ──

export class HttpTimeoutError extends Error {
  constructor(method: string, url: string, timeoutMs: number) {
    super(`HTTP request timed out: ${method} ${url} after ${timeoutMs}ms`);
    this.name = "HttpTimeoutError";
  }
}
