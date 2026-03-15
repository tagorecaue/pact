import { existsSync, readFileSync } from "fs";
import { join } from "path";

// ── Interfaces ──

export interface LlmResponse {
  text: string;
  durationMs: number;
  provider: string; // "local", "anthropic", "openai"
}

export interface LlmProvider {
  complete(prompt: string, maxTokens?: number): Promise<LlmResponse>;
  isAvailable(): boolean;
  name: string;
}

// ── Local Provider (llama.cpp) ──

export interface LocalLlmConfig {
  provider: "local";
  binary: string; // path to llama-cli
  model: string; // path to .gguf file
  contextLength?: number; // default 4096
  temperature?: number; // default 0.6
  topP?: number; // default 0.95
  timeoutMs?: number; // default 60000
}

const LOCAL_DEFAULTS = {
  contextLength: 4096,
  temperature: 0.6,
  topP: 0.95,
  timeoutMs: 60_000,
} as const;

export class LocalLlm implements LlmProvider {
  name = "local";
  private config: Required<Omit<LocalLlmConfig, "provider">>;

  constructor(config: LocalLlmConfig) {
    this.config = {
      binary: config.binary,
      model: config.model,
      contextLength: config.contextLength ?? LOCAL_DEFAULTS.contextLength,
      temperature: config.temperature ?? LOCAL_DEFAULTS.temperature,
      topP: config.topP ?? LOCAL_DEFAULTS.topP,
      timeoutMs: config.timeoutMs ?? LOCAL_DEFAULTS.timeoutMs,
    };
  }

  isAvailable(): boolean {
    return existsSync(this.config.binary) && existsSync(this.config.model);
  }

  async complete(prompt: string, maxTokens?: number): Promise<LlmResponse> {
    if (!this.isAvailable()) {
      throw new Error(
        `Local LLM not available: binary="${this.config.binary}" model="${this.config.model}"`
      );
    }

    const tokens = maxTokens ?? this.config.contextLength;
    const args = [
      "-m",
      this.config.model,
      "-p",
      prompt,
      "-n",
      String(tokens),
      "--temp",
      String(this.config.temperature),
      "--top-p",
      String(this.config.topP),
      "-c",
      String(this.config.contextLength),
      "--no-display-prompt",
    ];

    const start = performance.now();

    const proc = Bun.spawn([this.config.binary, ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });

    // Set up timeout
    const timer = setTimeout(() => {
      proc.kill();
    }, this.config.timeoutMs);

    try {
      const exitCode = await proc.exited;
      clearTimeout(timer);

      const durationMs = Math.round(performance.now() - start);

      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        throw new Error(
          `llama-cli exited with code ${exitCode}: ${stderr.trim()}`
        );
      }

      const text = await new Response(proc.stdout).text();

      return { text: text.trim(), durationMs, provider: "local" };
    } catch (err) {
      clearTimeout(timer);
      if (
        err instanceof Error &&
        err.message.includes("llama-cli exited with code")
      ) {
        throw err;
      }
      throw new Error(`Local LLM execution failed: ${(err as Error).message}`);
    }
  }
}

// ── API Provider (Claude, OpenAI-compatible) ──

export interface ApiLlmConfig {
  provider: "anthropic" | "openai";
  apiUrl?: string; // default based on provider
  apiKeyEnv: string; // env var name containing the key
  model: string; // e.g. "claude-sonnet-4-20250514", "gpt-4o"
  maxTokens?: number; // default 4096
  temperature?: number; // default 0.6
  timeoutMs?: number; // default 60000
}

const API_DEFAULTS = {
  maxTokens: 4096,
  temperature: 0.6,
  timeoutMs: 60_000,
} as const;

const DEFAULT_API_URLS: Record<"anthropic" | "openai", string> = {
  anthropic: "https://api.anthropic.com/v1/messages",
  openai: "https://api.openai.com/v1/chat/completions",
};

export class ApiLlm implements LlmProvider {
  name: string;
  private config: Required<Omit<ApiLlmConfig, "provider">>;
  private providerType: "anthropic" | "openai";

  constructor(config: ApiLlmConfig) {
    this.name = config.provider;
    this.providerType = config.provider;
    this.config = {
      apiUrl: config.apiUrl ?? DEFAULT_API_URLS[config.provider],
      apiKeyEnv: config.apiKeyEnv,
      model: config.model,
      maxTokens: config.maxTokens ?? API_DEFAULTS.maxTokens,
      temperature: config.temperature ?? API_DEFAULTS.temperature,
      timeoutMs: config.timeoutMs ?? API_DEFAULTS.timeoutMs,
    };
  }

  isAvailable(): boolean {
    const key = process.env[this.config.apiKeyEnv];
    return typeof key === "string" && key.length > 0;
  }

  async complete(prompt: string, maxTokens?: number): Promise<LlmResponse> {
    const apiKey = process.env[this.config.apiKeyEnv];
    if (!apiKey) {
      throw new Error(
        `API key not found: env var "${this.config.apiKeyEnv}" is not set`
      );
    }

    const tokens = maxTokens ?? this.config.maxTokens;
    const start = performance.now();

    if (this.providerType === "anthropic") {
      return this.completeAnthropic(apiKey, prompt, tokens, start);
    }
    return this.completeOpenAI(apiKey, prompt, tokens, start);
  }

  private async completeAnthropic(
    apiKey: string,
    prompt: string,
    maxTokens: number,
    start: number
  ): Promise<LlmResponse> {
    const body = {
      model: this.config.model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
      temperature: this.config.temperature,
    };

    const res = await fetch(this.config.apiUrl, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    const durationMs = Math.round(performance.now() - start);

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(
        `Anthropic API error (${res.status}): ${errBody}`
      );
    }

    const data = (await res.json()) as {
      content: Array<{ text: string }>;
    };

    const text = data.content[0]?.text ?? "";

    return { text, durationMs, provider: "anthropic" };
  }

  private async completeOpenAI(
    apiKey: string,
    prompt: string,
    maxTokens: number,
    start: number
  ): Promise<LlmResponse> {
    const body = {
      model: this.config.model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
      temperature: this.config.temperature,
    };

    const res = await fetch(this.config.apiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    const durationMs = Math.round(performance.now() - start);

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(
        `OpenAI API error (${res.status}): ${errBody}`
      );
    }

    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    const text = data.choices[0]?.message?.content ?? "";

    return { text, durationMs, provider: "openai" };
  }
}

// ── Config Types + Factory ──

export type LlmConfig = LocalLlmConfig | ApiLlmConfig;

/**
 * Load LLM config from pact.config.json.
 * Returns null if the file doesn't exist or has no llm section.
 */
export function loadLlmConfig(configPath?: string): LlmConfig | null {
  const dir = configPath ?? process.cwd();
  const filePath = join(dir, "pact.config.json");

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as { llm?: LlmConfig };

    if (!parsed.llm || typeof parsed.llm !== "object") {
      return null;
    }

    return parsed.llm;
  } catch {
    return null;
  }
}

/**
 * Create the right provider from a config object.
 */
export function createLlmProvider(config: LlmConfig): LlmProvider {
  switch (config.provider) {
    case "local":
      return new LocalLlm(config);
    case "anthropic":
    case "openai":
      return new ApiLlm(config);
  }
}

/**
 * Create a provider with fallback logic:
 * 1. Try loading from pact.config.json
 * 2. Check ANTHROPIC_API_KEY env -> create ApiLlm with anthropic
 * 3. Check OPENAI_API_KEY env -> create ApiLlm with openai
 * 4. Return null if nothing is available
 */
export function createDefaultProvider(
  configPath?: string
): LlmProvider | null {
  // 1. Try config file
  const config = loadLlmConfig(configPath);
  if (config) {
    const provider = createLlmProvider(config);
    if (provider.isAvailable()) {
      return provider;
    }
  }

  // 2. Check Anthropic env
  if (process.env.ANTHROPIC_API_KEY) {
    return new ApiLlm({
      provider: "anthropic",
      apiKeyEnv: "ANTHROPIC_API_KEY",
      model: "claude-sonnet-4-20250514",
    });
  }

  // 3. Check OpenAI env
  if (process.env.OPENAI_API_KEY) {
    return new ApiLlm({
      provider: "openai",
      apiKeyEnv: "OPENAI_API_KEY",
      model: "gpt-4o",
    });
  }

  // 4. Nothing available
  return null;
}
