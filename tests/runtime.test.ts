import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { rmSync } from "fs";
import { parse } from "../src/index";
import { ContractRegistry } from "../src/runtime/registry";
import { EvidenceStore } from "../src/runtime/evidence";
import { ExecutionEngine } from "../src/runtime/engine";

const TEST_DATA_DIR = "data/test";

describe("EvidenceStore", () => {
  let store: EvidenceStore;

  beforeEach(() => {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    store = new EvidenceStore(TEST_DATA_DIR);
  });

  afterEach(() => {
    store.close();
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  });

  test("records and retrieves evidence", () => {
    store.record({
      contract_id: "test.contract",
      request_id: "req-1",
      step_name: "validate",
      action: "validate",
      input: '{"name":"test"}',
      output: '{"ok":true}',
      duration_ms: 5,
      timestamp: "2026-03-14T00:00:00Z",
      status: "success",
    });

    const entries = store.getByContract("test.contract");
    expect(entries).toHaveLength(1);
    expect(entries[0]!.step_name).toBe("validate");
    expect(entries[0]!.status).toBe("success");
  });

  test("retrieves by request ID", () => {
    store.record({
      contract_id: "c1",
      request_id: "req-42",
      step_name: "step1",
      action: "test",
      input: null,
      output: null,
      duration_ms: 1,
      timestamp: "2026-03-14T00:00:00Z",
      status: "success",
    });
    store.record({
      contract_id: "c1",
      request_id: "req-42",
      step_name: "step2",
      action: "test",
      input: null,
      output: null,
      duration_ms: 2,
      timestamp: "2026-03-14T00:00:01Z",
      status: "success",
    });

    const entries = store.getByRequest("req-42");
    expect(entries).toHaveLength(2);
  });
});

describe("ContractRegistry", () => {
  test("loads a contract file", () => {
    const registry = new ContractRegistry();
    registry.loadFile("contracts/hello.pact");
    const contract = registry.getByName("hello.world");
    expect(contract).toBeDefined();
    expect(contract!.version).toBe("1.0.0");
    expect(contract!.domain).toBe("demo");
  });

  test("loads directory", () => {
    const registry = new ContractRegistry();
    registry.loadDirectory("tests/fixtures");
    const all = registry.getAll();
    expect(all.length).toBe(5);
  });

  test("resolve throws for missing contract", () => {
    const registry = new ContractRegistry();
    expect(() => registry.resolve("nonexistent")).toThrow("not found");
  });

  test("rejects duplicate names", () => {
    const registry = new ContractRegistry();
    registry.loadFile("contracts/hello.pact");
    expect(() => registry.loadFile("contracts/hello.pact")).toThrow("Duplicate");
  });
});

describe("ExecutionEngine", () => {
  let store: EvidenceStore;
  let engine: ExecutionEngine;

  beforeEach(() => {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    store = new EvidenceStore(TEST_DATA_DIR);
    engine = new ExecutionEngine(store);
  });

  afterEach(() => {
    store.close();
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  });

  test("executes hello.pact successfully", async () => {
    const registry = new ContractRegistry();
    registry.loadFile("contracts/hello.pact");
    const contract = registry.resolve("hello.world");

    const result = await engine.execute(contract, { name: "Tagore" });

    expect(result.status).toBe("success");
    expect(result.steps.length).toBeGreaterThanOrEqual(4);
    expect(result.steps.every((s) => s.status === "success")).toBe(true);

    // Check evidence was recorded
    const evidence = store.getByRequest(result.requestId);
    expect(evidence.length).toBe(result.steps.length);
  });

  test("fails on missing required input", async () => {
    const registry = new ContractRegistry();
    registry.loadFile("contracts/hello.pact");
    const contract = registry.resolve("hello.world");

    const result = await engine.execute(contract, {});

    expect(result.status).toBe("failed");
    expect(result.error).toContain("missing or empty");
  });

  test("executes fixture: simple.pact", async () => {
    const registry = new ContractRegistry();
    registry.loadFile("tests/fixtures/simple.pact");
    const contract = registry.resolve("customer.create");

    const result = await engine.execute(contract, {
      email: "test@example.com",
      name: "Test User",
      doc_provided: false,
    });

    // simple.pact has exchanges (<> stripe) which are stubbed in Phase 1
    // So it should execute through with mock values
    expect(result.steps.length).toBeGreaterThan(0);
    // At minimum the first steps should succeed
    expect(result.steps[0]!.status).toBe("success");
  });

  test("executes fixture: complex-a.pact (loop)", async () => {
    const registry = new ContractRegistry();
    registry.loadFile("tests/fixtures/complex-a.pact");
    const contract = registry.resolve("inventory.reserve");

    const result = await engine.execute(contract, {
      items: [{ product_id: "p1", quantity: 2 }],
      has_next_item: false,
    });

    expect(result.status).toBe("success");
  });
});
