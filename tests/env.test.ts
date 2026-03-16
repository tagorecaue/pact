import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { loadEnvFile, resolveEnv } from "../src/runtime/env";
import { writeFileSync, unlinkSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("loadEnvFile", () => {
  let tempDir: string;
  let envPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "pact-env-test-"));
    envPath = join(tempDir, ".env");
  });

  afterEach(() => {
    try { unlinkSync(envPath); } catch {}
    // Clean up any test env vars we set
    delete process.env.TEST_LOAD_KEY;
    delete process.env.TEST_LOAD_QUOTED;
    delete process.env.TEST_LOAD_SINGLE;
    delete process.env.TEST_LOAD_SPACED;
    delete process.env.TEST_EXISTING;
    delete process.env.PACT_TEST_A;
    delete process.env.PACT_TEST_B;
  });

  test("parses KEY=VALUE", () => {
    writeFileSync(envPath, "TEST_LOAD_KEY=hello123\n");
    loadEnvFile(envPath);
    expect(process.env.TEST_LOAD_KEY).toBe("hello123");
  });

  test("parses KEY=\"quoted value\"", () => {
    writeFileSync(envPath, 'TEST_LOAD_QUOTED="hello world"\n');
    loadEnvFile(envPath);
    expect(process.env.TEST_LOAD_QUOTED).toBe("hello world");
  });

  test("parses KEY='single quoted value'", () => {
    writeFileSync(envPath, "TEST_LOAD_SINGLE='single quoted'\n");
    loadEnvFile(envPath);
    expect(process.env.TEST_LOAD_SINGLE).toBe("single quoted");
  });

  test("skips comments and empty lines", () => {
    writeFileSync(envPath, "# this is a comment\n\nPACT_TEST_A=yes\n  \n# another comment\nPACT_TEST_B=also_yes\n");
    loadEnvFile(envPath);
    expect(process.env.PACT_TEST_A).toBe("yes");
    expect(process.env.PACT_TEST_B).toBe("also_yes");
  });

  test("does not override existing env vars", () => {
    process.env.TEST_EXISTING = "original";
    writeFileSync(envPath, "TEST_EXISTING=overridden\n");
    loadEnvFile(envPath);
    expect(process.env.TEST_EXISTING).toBe("original");
  });

  test("silently skips if file does not exist", () => {
    expect(() => loadEnvFile(join(tempDir, "nonexistent"))).not.toThrow();
  });
});

describe("resolveEnv", () => {
  beforeEach(() => {
    process.env.PACT_RESOLVE_TEST = "secret_token_123";
  });

  afterEach(() => {
    delete process.env.PACT_RESOLVE_TEST;
  });

  test("resolves env:VAR_NAME to process.env value", () => {
    expect(resolveEnv("env:PACT_RESOLVE_TEST")).toBe("secret_token_123");
  });

  test("returns value as-is without env: prefix", () => {
    expect(resolveEnv("plain_value")).toBe("plain_value");
    expect(resolveEnv("https://example.com")).toBe("https://example.com");
    expect(resolveEnv("")).toBe("");
  });

  test("returns original string and warns if env var not set", () => {
    const result = resolveEnv("env:PACT_NONEXISTENT_VAR_XYZ");
    expect(result).toBe("env:PACT_NONEXISTENT_VAR_XYZ");
  });
});
