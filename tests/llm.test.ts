import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  LocalLlm,
  ApiLlm,
  loadLlmConfig,
  createLlmProvider,
  createDefaultProvider,
  type LocalLlmConfig,
  type ApiLlmConfig,
  type LlmConfig,
} from "../src/runtime/llm";

describe("LocalLlm", () => {
  test("isAvailable() returns false when binary doesn't exist", () => {
    const llm = new LocalLlm({
      provider: "local",
      binary: "/nonexistent/llama-cli",
      model: "/nonexistent/model.gguf",
    });
    expect(llm.isAvailable()).toBe(false);
  });

  test("isAvailable() returns false when model doesn't exist", () => {
    // Use a binary that exists (bun itself) but a model that doesn't
    const llm = new LocalLlm({
      provider: "local",
      binary: process.execPath,
      model: "/nonexistent/model.gguf",
    });
    expect(llm.isAvailable()).toBe(false);
  });

  test("name is 'local'", () => {
    const llm = new LocalLlm({
      provider: "local",
      binary: "/tmp/llama-cli",
      model: "/tmp/model.gguf",
    });
    expect(llm.name).toBe("local");
  });

  test("complete() throws when not available", async () => {
    const llm = new LocalLlm({
      provider: "local",
      binary: "/nonexistent/llama-cli",
      model: "/nonexistent/model.gguf",
    });
    expect(llm.complete("hello")).rejects.toThrow("not available");
  });
});

describe("ApiLlm", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Save and clear relevant env vars
    savedEnv.TEST_API_KEY = process.env.TEST_API_KEY;
    savedEnv.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    savedEnv.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    delete process.env.TEST_API_KEY;
  });

  afterEach(() => {
    // Restore env vars
    if (savedEnv.TEST_API_KEY !== undefined) {
      process.env.TEST_API_KEY = savedEnv.TEST_API_KEY;
    } else {
      delete process.env.TEST_API_KEY;
    }
    if (savedEnv.ANTHROPIC_API_KEY !== undefined) {
      process.env.ANTHROPIC_API_KEY = savedEnv.ANTHROPIC_API_KEY;
    }
    if (savedEnv.OPENAI_API_KEY !== undefined) {
      process.env.OPENAI_API_KEY = savedEnv.OPENAI_API_KEY;
    }
  });

  test("isAvailable() returns false when env var is not set", () => {
    const llm = new ApiLlm({
      provider: "anthropic",
      apiKeyEnv: "TEST_API_KEY",
      model: "claude-sonnet-4-20250514",
    });
    expect(llm.isAvailable()).toBe(false);
  });

  test("isAvailable() returns false when env var is empty string", () => {
    process.env.TEST_API_KEY = "";
    const llm = new ApiLlm({
      provider: "anthropic",
      apiKeyEnv: "TEST_API_KEY",
      model: "claude-sonnet-4-20250514",
    });
    expect(llm.isAvailable()).toBe(false);
  });

  test("isAvailable() returns true when env var is set", () => {
    process.env.TEST_API_KEY = "sk-test-123";
    const llm = new ApiLlm({
      provider: "anthropic",
      apiKeyEnv: "TEST_API_KEY",
      model: "claude-sonnet-4-20250514",
    });
    expect(llm.isAvailable()).toBe(true);
  });

  test("name reflects provider type", () => {
    const anthropic = new ApiLlm({
      provider: "anthropic",
      apiKeyEnv: "TEST_API_KEY",
      model: "claude-sonnet-4-20250514",
    });
    expect(anthropic.name).toBe("anthropic");

    const openai = new ApiLlm({
      provider: "openai",
      apiKeyEnv: "TEST_API_KEY",
      model: "gpt-4o",
    });
    expect(openai.name).toBe("openai");
  });

  test("complete() throws when API key is not set", async () => {
    const llm = new ApiLlm({
      provider: "anthropic",
      apiKeyEnv: "TEST_API_KEY",
      model: "claude-sonnet-4-20250514",
    });
    expect(llm.complete("hello")).rejects.toThrow("not set");
  });
});

describe("loadLlmConfig", () => {
  test("returns null when no config file exists", () => {
    const result = loadLlmConfig("/nonexistent/path");
    expect(result).toBeNull();
  });

  test("returns null when config has no llm section", () => {
    // Use the project root which may have pact.config.json without llm
    // or a temp dir
    const result = loadLlmConfig("/tmp");
    expect(result).toBeNull();
  });
});

describe("createLlmProvider", () => {
  test("creates LocalLlm for local config", () => {
    const config: LlmConfig = {
      provider: "local",
      binary: "/usr/local/bin/llama-cli",
      model: "/models/test.gguf",
    };
    const provider = createLlmProvider(config);
    expect(provider.name).toBe("local");
    expect(provider).toBeInstanceOf(LocalLlm);
  });

  test("creates ApiLlm for anthropic config", () => {
    const config: LlmConfig = {
      provider: "anthropic",
      apiKeyEnv: "ANTHROPIC_API_KEY",
      model: "claude-sonnet-4-20250514",
    };
    const provider = createLlmProvider(config);
    expect(provider.name).toBe("anthropic");
    expect(provider).toBeInstanceOf(ApiLlm);
  });

  test("creates ApiLlm for openai config", () => {
    const config: LlmConfig = {
      provider: "openai",
      apiKeyEnv: "OPENAI_API_KEY",
      model: "gpt-4o",
    };
    const provider = createLlmProvider(config);
    expect(provider.name).toBe("openai");
    expect(provider).toBeInstanceOf(ApiLlm);
  });
});

describe("createDefaultProvider", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    savedEnv.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    if (savedEnv.ANTHROPIC_API_KEY !== undefined) {
      process.env.ANTHROPIC_API_KEY = savedEnv.ANTHROPIC_API_KEY;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
    if (savedEnv.OPENAI_API_KEY !== undefined) {
      process.env.OPENAI_API_KEY = savedEnv.OPENAI_API_KEY;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  });

  test("returns null when nothing is configured", () => {
    const result = createDefaultProvider("/nonexistent/path");
    expect(result).toBeNull();
  });

  test("falls back to Anthropic when ANTHROPIC_API_KEY is set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const result = createDefaultProvider("/nonexistent/path");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("anthropic");
  });

  test("falls back to OpenAI when OPENAI_API_KEY is set", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const result = createDefaultProvider("/nonexistent/path");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("openai");
  });

  test("prefers Anthropic over OpenAI when both are set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.OPENAI_API_KEY = "sk-test";
    const result = createDefaultProvider("/nonexistent/path");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("anthropic");
  });
});

describe("LlmConfig type discrimination", () => {
  test("local config has provider 'local'", () => {
    const config: LlmConfig = {
      provider: "local",
      binary: "/usr/bin/llama-cli",
      model: "/models/test.gguf",
    };
    expect(config.provider).toBe("local");
    if (config.provider === "local") {
      // TypeScript narrows to LocalLlmConfig
      expect(config.binary).toBe("/usr/bin/llama-cli");
      expect(config.model).toBe("/models/test.gguf");
    }
  });

  test("anthropic config has provider 'anthropic'", () => {
    const config: LlmConfig = {
      provider: "anthropic",
      apiKeyEnv: "ANTHROPIC_API_KEY",
      model: "claude-sonnet-4-20250514",
    };
    expect(config.provider).toBe("anthropic");
    if (config.provider === "anthropic") {
      // TypeScript narrows to ApiLlmConfig
      expect(config.apiKeyEnv).toBe("ANTHROPIC_API_KEY");
    }
  });

  test("openai config has provider 'openai'", () => {
    const config: LlmConfig = {
      provider: "openai",
      apiKeyEnv: "OPENAI_API_KEY",
      model: "gpt-4o",
    };
    expect(config.provider).toBe("openai");
    if (config.provider === "openai") {
      // TypeScript narrows to ApiLlmConfig
      expect(config.apiKeyEnv).toBe("OPENAI_API_KEY");
    }
  });
});
