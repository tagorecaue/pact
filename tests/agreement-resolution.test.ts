import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { rmSync } from "fs";
import { EvidenceStore } from "../src/runtime/evidence";
import { ExecutionEngine, applyAgreementMappings } from "../src/runtime/engine";
import { AgreementStore } from "../src/runtime/agreement-store";
import { HttpClient } from "../src/runtime/http-client";
import { checkPartnerHealth } from "../src/runtime/health-check";
import type { Agreement, FieldMapping } from "../src/runtime/negotiation";

const TEST_DATA_DIR = "data/test-agreement-resolution";

// ── Helpers ──

function makeAgreement(overrides?: Partial<Agreement>): Agreement {
  return {
    id: "test-agreement-1",
    parties: { local: "demo.store", remote: "http://localhost:9999" },
    established: "2026-03-15T00:00:00Z",
    lastRenegotiated: null,
    version: 1,
    status: "active",
    mappings: [
      {
        operation: "inventory",
        localField: "product_id",
        remoteField: "sku",
        direction: "outbound",
        transform: "rename:sku->product_id",
      },
      {
        operation: "inventory",
        localField: "quantity",
        remoteField: "qty_available",
        direction: "outbound",
      },
    ],
    trustLevels: { locked: [], negotiable: [], agreed: [] },
    compiledEndpoints: {
      inventory: "/.pact/data/inventory",
    },
    ...overrides,
  };
}

// ── AgreementStore.resolveOperation ──

describe("AgreementStore.resolveOperation", () => {
  let store: AgreementStore;

  beforeEach(() => {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    store = new AgreementStore(TEST_DATA_DIR);
  });

  afterEach(() => {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  });

  test("resolves operation from active agreement", () => {
    const agreement = makeAgreement();
    store.save(agreement);

    const result = store.resolveOperation("inventory");
    expect(result).not.toBeNull();
    expect(result!.agreement.id).toBe("test-agreement-1");
    expect(result!.endpoint).toBe("/.pact/data/inventory");
    expect(result!.mappings.length).toBeGreaterThan(0);
  });

  test("returns null for unknown operations", () => {
    const agreement = makeAgreement();
    store.save(agreement);

    const result = store.resolveOperation("nonexistent.operation");
    expect(result).toBeNull();
  });

  test("skips suspended agreements", () => {
    const agreement = makeAgreement({ status: "suspended" });
    store.save(agreement);

    const result = store.resolveOperation("inventory");
    expect(result).toBeNull();
  });

  test("returns correct mappings for the operation", () => {
    const agreement = makeAgreement();
    store.save(agreement);

    const result = store.resolveOperation("inventory");
    expect(result).not.toBeNull();

    const mappings = result!.mappings;
    expect(mappings.length).toBe(2);

    const skuMapping = mappings.find((m) => m.localField === "product_id");
    expect(skuMapping).toBeDefined();
    expect(skuMapping!.remoteField).toBe("sku");

    const qtyMapping = mappings.find((m) => m.localField === "quantity");
    expect(qtyMapping).toBeDefined();
    expect(qtyMapping!.remoteField).toBe("qty_available");
  });
});

// ── applyAgreementMappings ──

describe("applyAgreementMappings", () => {
  const mappings: FieldMapping[] = [
    {
      operation: "inventory",
      localField: "product_id",
      remoteField: "sku",
      direction: "outbound",
    },
    {
      operation: "inventory",
      localField: "quantity",
      remoteField: "qty_available",
      direction: "outbound",
    },
  ];

  test("outbound: renames local fields to remote fields", () => {
    const payload = { product_id: "ABC-123", quantity: 10 };
    const result = applyAgreementMappings(payload, mappings, "outbound");

    expect(result.sku).toBe("ABC-123");
    expect(result.qty_available).toBe(10);
    expect(result.product_id).toBeUndefined();
    expect(result.quantity).toBeUndefined();
  });

  test("inbound: renames remote fields back to local fields", () => {
    const response = { sku: "ABC-123", qty_available: 50, warehouse: "W1" };
    const result = applyAgreementMappings(response, mappings, "inbound");

    expect(result.product_id).toBe("ABC-123");
    expect(result.quantity).toBe(50);
    // Original remote fields are still present
    expect(result.sku).toBe("ABC-123");
    expect(result.warehouse).toBe("W1");
  });

  test("no-op when fields already match", () => {
    const sameFieldMappings: FieldMapping[] = [
      {
        operation: "test",
        localField: "status",
        remoteField: "status",
        direction: "outbound",
      },
    ];

    const payload = { status: "active" };
    const result = applyAgreementMappings(payload, sameFieldMappings, "outbound");
    expect(result.status).toBe("active");
  });

  test("applies multiply_100 transform", () => {
    const transformMappings: FieldMapping[] = [
      {
        operation: "pricing",
        localField: "price",
        remoteField: "price_cents",
        direction: "outbound",
        transform: "multiply_100",
      },
    ];

    const payload = { price: 19.99 };
    const result = applyAgreementMappings(payload, transformMappings, "outbound");
    expect(result.price_cents).toBeCloseTo(1999);
  });
});

// ── Engine resolves via agreement ──

describe("Engine agreement resolution", () => {
  let evidence: EvidenceStore;
  let store: AgreementStore;

  beforeEach(() => {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    evidence = new EvidenceStore(TEST_DATA_DIR);
    store = new AgreementStore(TEST_DATA_DIR);
  });

  afterEach(() => {
    evidence.close();
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  });

  test("falls back to mock when no agreement matches", async () => {
    // Engine with agreement store but no matching agreement
    const engine = new ExecutionEngine(
      evidence,
      undefined,
      undefined,
      undefined,
      store,
    );

    // Create a minimal contract with an exchange to a non-existent target
    const contract = {
      name: "test.fallback",
      version: "1.0.0",
      domain: "test",
      ast: { header: { version: "1" }, sections: [] },
      sections: {
        execution: {
          flow: [
            {
              kind: "ExchangeExpr" as const,
              target: "nonexistent.service",
              send: ["data"],
              receive: ["result"],
            },
          ],
        },
      },
    } as any;

    const result = await engine.execute(contract, { data: "test" });
    expect(result.status).toBe("success");

    // Should have used mock fallback
    const exchangeStep = result.steps.find((s) => s.name.startsWith("exchange:"));
    expect(exchangeStep).toBeDefined();
    expect(exchangeStep!.status).toBe("success");
    expect((exchangeStep!.output as any).mode).toBe("mock");
  });
});

// ── Health Check ──

describe("Health check", () => {
  test("returns unreachable when fetch fails", async () => {
    const agreement = makeAgreement({
      parties: { local: "test", remote: "http://localhost:1" },
    });

    const httpClient = new HttpClient({ maxRetries: 0, retryDelayMs: 0 });
    const result = await checkPartnerHealth("http://localhost:1", agreement, httpClient);

    expect(result.status).toBe("unreachable");
    expect(result.remote).toBe("http://localhost:1");
    expect(result.checkedAt).toBeTruthy();
  });

  test("returns healthy for matching manifest", async () => {
    // Start a tiny server that returns a manifest
    const server = Bun.serve({
      port: 0,  // random port
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === "/.pact/manifest") {
          return Response.json({
            server: `http://localhost:${server.port}`,
            version: "1.0.0",
            contracts: [
              { name: "test", version: "1.0.0", offers: ["inventory"], accepts: [] },
            ],
          });
        }
        return new Response("Not found", { status: 404 });
      },
    });

    try {
      const agreement = makeAgreement({
        parties: { local: "test", remote: `http://localhost:${server.port}` },
        compiledEndpoints: { inventory: "/.pact/data/inventory" },
      });

      const httpClient = new HttpClient({ maxRetries: 0, retryDelayMs: 0 });
      const result = await checkPartnerHealth(
        `http://localhost:${server.port}`,
        agreement,
        httpClient,
      );

      expect(result.status).toBe("healthy");
      expect(result.manifestVersion).toBe("1.0.0");
    } finally {
      server.stop();
    }
  });

  test("returns changed when offer is removed from manifest", async () => {
    // Start a server that returns a manifest WITHOUT the expected offer
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === "/.pact/manifest") {
          return Response.json({
            server: `http://localhost:${server.port}`,
            version: "2.0.0",
            contracts: [
              { name: "test", version: "2.0.0", offers: ["shipping"], accepts: [] },
            ],
          });
        }
        return new Response("Not found", { status: 404 });
      },
    });

    try {
      const agreement = makeAgreement({
        parties: { local: "test", remote: `http://localhost:${server.port}` },
        compiledEndpoints: { inventory: "/.pact/data/inventory" },
      });

      const httpClient = new HttpClient({ maxRetries: 0, retryDelayMs: 0 });
      const result = await checkPartnerHealth(
        `http://localhost:${server.port}`,
        agreement,
        httpClient,
      );

      expect(result.status).toBe("changed");
      expect(result.changes).toBeDefined();
      expect(result.changes!.length).toBeGreaterThan(0);
      expect(result.changes![0]).toContain("inventory");
    } finally {
      server.stop();
    }
  });
});
