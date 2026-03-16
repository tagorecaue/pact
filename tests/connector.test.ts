import { describe, test, expect } from "bun:test";
import { ConnectorRegistry } from "../src/runtime/connector";

describe("ConnectorRegistry", () => {
  test("loads connector files from community directory", () => {
    const registry = new ConnectorRegistry();
    registry.loadDirectory("connectors/community");
    expect(registry.count()).toBe(25);
  });

  test("resolve() finds telegram.send_message", () => {
    const registry = new ConnectorRegistry();
    registry.loadDirectory("connectors/community");
    const result = registry.resolve("telegram.send_message");
    expect(result).not.toBeNull();
    expect(result!.connector.name).toBe("connector.telegram");
    expect(result!.operation.name).toBe("send_message");
    expect(result!.operation.method).toBe("POST");
    expect(result!.operation.path).toBe("/sendMessage");
  });

  test("resolve() finds stripe.create_charge", () => {
    const registry = new ConnectorRegistry();
    registry.loadDirectory("connectors/community");
    const result = registry.resolve("stripe.create_charge");
    expect(result).not.toBeNull();
    expect(result!.connector.name).toBe("connector.stripe");
    expect(result!.operation.name).toBe("create_charge");
    expect(result!.operation.method).toBe("POST");
  });

  test("resolve() finds github.create_issue", () => {
    const registry = new ConnectorRegistry();
    registry.loadDirectory("connectors/community");
    const result = registry.resolve("github.create_issue");
    expect(result).not.toBeNull();
    expect(result!.connector.name).toBe("connector.github");
    expect(result!.operation.name).toBe("create_issue");
  });

  test("resolve() returns null for unknown connector", () => {
    const registry = new ConnectorRegistry();
    registry.loadDirectory("connectors/community");
    const result = registry.resolve("nonexistent.operation");
    expect(result).toBeNull();
  });

  test("resolve() returns null for unknown operation", () => {
    const registry = new ConnectorRegistry();
    registry.loadDirectory("connectors/community");
    const result = registry.resolve("telegram.nonexistent_op");
    expect(result).toBeNull();
  });

  test("resolve() returns null for target without dot", () => {
    const registry = new ConnectorRegistry();
    registry.loadDirectory("connectors/community");
    const result = registry.resolve("telegram");
    expect(result).toBeNull();
  });

  test("getAll() returns all connectors", () => {
    const registry = new ConnectorRegistry();
    registry.loadDirectory("connectors/community");
    const all = registry.getAll();
    expect(all.length).toBe(25);
  });

  test("connector count is 25", () => {
    const registry = new ConnectorRegistry();
    registry.loadDirectory("connectors/community");
    expect(registry.count()).toBe(25);
  });

  test("each connector has operations", () => {
    const registry = new ConnectorRegistry();
    registry.loadDirectory("connectors/community");
    const all = registry.getAll();
    for (const conn of all) {
      expect(conn.operations.size).toBeGreaterThan(0);
    }
  });

  test("connectors have base URLs", () => {
    const registry = new ConnectorRegistry();
    registry.loadDirectory("connectors/community");
    const all = registry.getAll();
    for (const conn of all) {
      expect(conn.baseUrl).toBeTruthy();
    }
  });

  test("connectors have auth configuration", () => {
    const registry = new ConnectorRegistry();
    registry.loadDirectory("connectors/community");
    const all = registry.getAll();
    for (const conn of all) {
      expect(conn.authEnv).toBeTruthy();
    }
  });

  test("loads single connector file", () => {
    const registry = new ConnectorRegistry();
    registry.loadFile("connectors/community/telegram.pact");
    expect(registry.count()).toBe(1);
    const telegram = registry.get("telegram");
    expect(telegram).toBeDefined();
    expect(telegram!.operations.size).toBe(4);
  });

  test("telegram connector has correct operations", () => {
    const registry = new ConnectorRegistry();
    registry.loadFile("connectors/community/telegram.pact");
    const telegram = registry.get("telegram");
    expect(telegram).toBeDefined();
    const opNames = Array.from(telegram!.operations.keys());
    expect(opNames).toContain("send_message");
    expect(opNames).toContain("get_updates");
    expect(opNames).toContain("send_photo");
    expect(opNames).toContain("delete_message");
  });

  test("operations have input and output fields", () => {
    const registry = new ConnectorRegistry();
    registry.loadFile("connectors/community/stripe.pact");
    const result = registry.resolve("stripe.create_charge");
    expect(result).not.toBeNull();
    expect(Object.keys(result!.operation.input).length).toBeGreaterThan(0);
    expect(Object.keys(result!.operation.output).length).toBeGreaterThan(0);
  });

  test("redis connector has 7 operations", () => {
    const registry = new ConnectorRegistry();
    registry.loadFile("connectors/community/redis.pact");
    const redis = registry.get("redis");
    expect(redis).toBeDefined();
    expect(redis!.operations.size).toBe(7);
  });

  test("getAllNames returns short names", () => {
    const registry = new ConnectorRegistry();
    registry.loadDirectory("connectors/community");
    const names = registry.getAllNames();
    expect(names).toContain("telegram");
    expect(names).toContain("stripe");
    expect(names).toContain("github");
    expect(names).toContain("anthropic");
  });
});
