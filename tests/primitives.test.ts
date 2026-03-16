import { describe, test, expect } from "bun:test";
import { PrimitiveRegistry } from "../src/runtime/primitives/index";
import { ShellPrimitive } from "../src/runtime/primitives/shell";
import { CryptoPrimitive } from "../src/runtime/primitives/crypto";

describe("ShellPrimitive", () => {
  const shell = new ShellPrimitive();

  test("executes 'echo hello' and returns stdout", async () => {
    const result = await shell.execute("run", { command: "echo hello" });
    expect(result.stdout.trim()).toBe("hello");
    expect(result.exitCode).toBe(0);
  });

  test("captures stderr", async () => {
    const result = await shell.execute("run", { command: "echo error >&2" });
    expect(result.stderr.trim()).toBe("error");
    expect(result.exitCode).toBe(0);
  });

  test("returns non-zero exit code for failing commands", async () => {
    const result = await shell.execute("run", { command: "exit 42" });
    expect(result.exitCode).toBe(42);
  });

  test("refuses dangerous commands: rm -rf /", async () => {
    await expect(
      shell.execute("run", { command: "rm -rf /" })
    ).rejects.toThrow("refused to execute dangerous command");
  });

  test("refuses dangerous commands: fork bomb", async () => {
    await expect(
      shell.execute("run", { command: ":(){ :|:& };:" })
    ).rejects.toThrow("refused to execute dangerous command");
  });

  test("refuses dangerous commands: overwrite device", async () => {
    await expect(
      shell.execute("run", { command: "echo hacked > /dev/sda" })
    ).rejects.toThrow("refused to execute dangerous command");
  });

  test("throws on unknown operation", async () => {
    await expect(
      shell.execute("invalid_op", { command: "echo hi" })
    ).rejects.toThrow("unknown operation");
  });
});

describe("CryptoPrimitive", () => {
  const crypto = new CryptoPrimitive();

  test("generates UUID v4", async () => {
    const result = await crypto.execute("uuid", {});
    expect(result.uuid).toBeDefined();
    expect(typeof result.uuid).toBe("string");
    // UUID v4 format: 8-4-4-4-12 hex chars
    expect(result.uuid as string).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  test("generates unique UUIDs", async () => {
    const r1 = await crypto.execute("uuid", {});
    const r2 = await crypto.execute("uuid", {});
    expect(r1.uuid).not.toBe(r2.uuid);
  });

  test("hash produces consistent output", async () => {
    const r1 = await crypto.execute("hash", { algorithm: "sha256", data: "hello world" });
    const r2 = await crypto.execute("hash", { algorithm: "sha256", data: "hello world" });
    expect(r1.hash).toBe(r2.hash);
    expect(typeof r1.hash).toBe("string");
    expect((r1.hash as string).length).toBe(64); // SHA-256 hex is 64 chars
  });

  test("different data produces different hash", async () => {
    const r1 = await crypto.execute("hash", { algorithm: "sha256", data: "hello" });
    const r2 = await crypto.execute("hash", { algorithm: "sha256", data: "world" });
    expect(r1.hash).not.toBe(r2.hash);
  });

  test("hmac produces signature", async () => {
    const result = await crypto.execute("hmac", {
      algorithm: "sha256",
      key: "secret",
      data: "message",
    });
    expect(result.signature).toBeDefined();
    expect(typeof result.signature).toBe("string");
    expect(result.algorithm).toBe("sha256");
  });

  test("hmac is consistent", async () => {
    const r1 = await crypto.execute("hmac", {
      algorithm: "sha256",
      key: "secret",
      data: "message",
    });
    const r2 = await crypto.execute("hmac", {
      algorithm: "sha256",
      key: "secret",
      data: "message",
    });
    expect(r1.signature).toBe(r2.signature);
  });

  test("throws on missing data for hash", async () => {
    await expect(
      crypto.execute("hash", { algorithm: "sha256" })
    ).rejects.toThrow("data is required");
  });

  test("throws on unknown operation", async () => {
    await expect(
      crypto.execute("invalid_op", {})
    ).rejects.toThrow("unknown operation");
  });
});

describe("PrimitiveRegistry", () => {
  const registry = new PrimitiveRegistry();

  test("dispatches shell.run correctly", async () => {
    const result = await registry.execute("shell", "run", { command: "echo dispatch_test" });
    expect(result.success).toBe(true);
    expect((result.output as any).stdout.trim()).toBe("dispatch_test");
  });

  test("dispatches crypto.uuid correctly", async () => {
    const result = await registry.execute("crypto", "uuid", {});
    expect(result.success).toBe(true);
    expect(result.output.uuid).toBeDefined();
  });

  test("dispatches crypto.hash correctly", async () => {
    const result = await registry.execute("crypto", "hash", {
      algorithm: "sha256",
      data: "test",
    });
    expect(result.success).toBe(true);
    expect(result.output.hash).toBeDefined();
  });

  test("returns error for unknown primitive", async () => {
    const result = await registry.execute("nonexistent", "op", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("Unknown primitive");
  });

  test("returns error for dangerous shell command", async () => {
    const result = await registry.execute("shell", "run", { command: "rm -rf /" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("refused to execute dangerous command");
  });

  test("measures duration", async () => {
    const result = await registry.execute("crypto", "uuid", {});
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("listPrimitives returns all primitives", () => {
    const list = registry.listPrimitives();
    expect(list.length).toBe(4);
    const names = list.map((p) => p.name);
    expect(names).toContain("http");
    expect(names).toContain("shell");
    expect(names).toContain("crypto");
    expect(names).toContain("sql");
  });
});
