import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { ContractRegistry } from "../src/runtime/registry";
import { EvidenceStore } from "../src/runtime/evidence";
import { NegotiationEngine, type Agreement, type Manifest, type NegotiationProposal } from "../src/runtime/negotiation";
import { AgreementStore } from "../src/runtime/agreement-store";

const TEST_DATA_DIR = "data/test-negotiation";

// ── Helpers ──

function loadStore(): ContractRegistry {
  const registry = new ContractRegistry();
  registry.loadFile("contracts/demo-store.pact");
  return registry;
}

function loadFulfillment(): ContractRegistry {
  const registry = new ContractRegistry();
  registry.loadFile("contracts/demo-fulfillment.pact");
  return registry;
}

// ── NegotiationEngine.buildManifest ──

describe("NegotiationEngine.buildManifest", () => {
  let evidence: EvidenceStore;
  let engine: NegotiationEngine;

  beforeEach(() => {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    evidence = new EvidenceStore(TEST_DATA_DIR);
    engine = new NegotiationEngine(null, evidence);
  });

  afterEach(() => {
    evidence.close();
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  });

  test("builds manifest from contracts with @N sections", () => {
    const registry = loadStore();
    const contracts = registry.getAll();

    const manifest = engine.buildManifest(contracts, "http://localhost:3010");

    expect(manifest.server).toBe("http://localhost:3010");
    expect(manifest.version).toBe("1.0.0");
    expect(manifest.contracts).toHaveLength(1);

    const mc = manifest.contracts[0]!;
    expect(mc.name).toBe("demo.store");
    expect(mc.version).toBe("1.0.0");
    expect(mc.offers).toContain("orders");
    expect(mc.accepts).toContain("inventory");
    expect(mc.accepts).toContain("shipping");
  });

  test("builds manifest for fulfillment contracts", () => {
    const registry = loadFulfillment();
    const contracts = registry.getAll();

    const manifest = engine.buildManifest(contracts, "http://localhost:3011");

    expect(manifest.contracts).toHaveLength(1);

    const mc = manifest.contracts[0]!;
    expect(mc.name).toBe("demo.fulfillment");
    expect(mc.offers).toContain("inventory");
    expect(mc.offers).toContain("shipping");
    expect(mc.accepts).toContain("orders");
  });

  test("returns empty contracts for files without @N", () => {
    const registry = new ContractRegistry();
    registry.loadFile("contracts/hello.pact");

    const manifest = engine.buildManifest(registry.getAll(), "http://localhost:3000");
    expect(manifest.contracts).toHaveLength(0);
  });
});

// ── NegotiationEngine.handleProposal ──

describe("NegotiationEngine.handleProposal", () => {
  let evidence: EvidenceStore;
  let engine: NegotiationEngine;

  beforeEach(() => {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    evidence = new EvidenceStore(TEST_DATA_DIR);
    engine = new NegotiationEngine(null, evidence);
  });

  afterEach(() => {
    evidence.close();
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  });

  test("handles proposal with matching offer", () => {
    const registry = loadFulfillment();
    const contracts = registry.getAll();

    const proposal: NegotiationProposal = {
      need: "inventory",
      myFields: { product_id: "string", quantity: "integer" },
      targetOffer: "inventory",
    };

    return engine.handleProposal(proposal, contracts).then((response) => {
      expect(response.agreed).toBe(true);
      expect(response.endpoint).toContain("inventory");
      expect(response.mapping.length).toBeGreaterThan(0);
    });
  });

  test("rejects proposal with no matching offer", () => {
    const registry = loadFulfillment();
    const contracts = registry.getAll();

    const proposal: NegotiationProposal = {
      need: "nonexistent",
      myFields: { foo: "string" },
      targetOffer: "nonexistent",
    };

    return engine.handleProposal(proposal, contracts).then((response) => {
      expect(response.agreed).toBe(false);
      expect(response.reason).toContain("No offer found");
    });
  });

  test("deterministic matching maps quantity to qty_available", () => {
    const registry = loadFulfillment();
    const contracts = registry.getAll();

    const proposal: NegotiationProposal = {
      need: "inventory",
      myFields: { quantity: "integer" },
      targetOffer: "inventory",
    };

    return engine.handleProposal(proposal, contracts).then((response) => {
      expect(response.agreed).toBe(true);
      const quantityMapping = response.mapping.find(
        (m) => m.localField === "quantity",
      );
      expect(quantityMapping).toBeDefined();
      expect(quantityMapping!.remoteField).toBe("qty_available");
    });
  });
});

// ── Agreement serialization ──

describe("Agreement serialization", () => {
  test("agreement serializes and deserializes correctly", () => {
    const agreement: Agreement = {
      id: "test-id-123",
      parties: { local: "demo.store", remote: "http://localhost:3011" },
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
      ],
      trustLevels: {
        locked: ["Never expose customer payment data externally"],
        negotiable: ["Field naming conventions between systems"],
        agreed: ["Field naming conventions between systems"],
      },
      compiledEndpoints: { inventory: "/.pact/data/inventory" },
    };

    const json = JSON.stringify(agreement);
    const deserialized = JSON.parse(json) as Agreement;

    expect(deserialized.id).toBe("test-id-123");
    expect(deserialized.parties.local).toBe("demo.store");
    expect(deserialized.parties.remote).toBe("http://localhost:3011");
    expect(deserialized.status).toBe("active");
    expect(deserialized.mappings).toHaveLength(1);
    expect(deserialized.mappings[0]!.transform).toBe("rename:sku->product_id");
    expect(deserialized.trustLevels.locked).toHaveLength(1);
  });
});

// ── AgreementStore ──

describe("AgreementStore", () => {
  let store: AgreementStore;

  beforeEach(() => {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    store = new AgreementStore(TEST_DATA_DIR);
  });

  afterEach(() => {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  });

  function makeAgreement(overrides?: Partial<Agreement>): Agreement {
    return {
      id: crypto.randomUUID(),
      parties: { local: "demo.store", remote: "http://localhost:3011" },
      established: "2026-03-15T00:00:00Z",
      lastRenegotiated: null,
      version: 1,
      status: "active",
      mappings: [],
      trustLevels: { locked: [], negotiable: [], agreed: [] },
      compiledEndpoints: {},
      ...overrides,
    };
  }

  test("save and load agreement", () => {
    const agreement = makeAgreement();
    store.save(agreement);

    const loaded = store.load("http://localhost:3011");
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe(agreement.id);
    expect(loaded!.parties.local).toBe("demo.store");
  });

  test("loadAll returns all agreements", () => {
    store.save(makeAgreement({ parties: { local: "a", remote: "http://remote-1.com" } }));
    store.save(makeAgreement({ parties: { local: "b", remote: "http://remote-2.com" } }));

    const all = store.loadAll();
    expect(all).toHaveLength(2);
  });

  test("save overwrites and archives previous version", () => {
    const v1 = makeAgreement({ version: 1 });
    store.save(v1);

    const v2 = makeAgreement({
      id: v1.id,
      version: 2,
      lastRenegotiated: "2026-03-16T00:00:00Z",
    });
    store.save(v2);

    const current = store.load("http://localhost:3011");
    expect(current!.version).toBe(2);

    const history = store.getHistory("http://localhost:3011");
    expect(history).toHaveLength(1);
    expect(history[0]!.version).toBe(1);
  });

  test("remove deletes agreement directory", () => {
    const agreement = makeAgreement();
    store.save(agreement);

    expect(store.load("http://localhost:3011")).not.toBeNull();

    store.remove("http://localhost:3011");
    expect(store.load("http://localhost:3011")).toBeNull();
  });

  test("load returns null for non-existent remote", () => {
    expect(store.load("http://nonexistent.com")).toBeNull();
  });

  test("getHistory returns empty for no history", () => {
    const history = store.getHistory("http://nonexistent.com");
    expect(history).toHaveLength(0);
  });
});

// ── NegotiationEngine.renegotiate ──

describe("NegotiationEngine.renegotiate", () => {
  let evidence: EvidenceStore;
  let engine: NegotiationEngine;

  beforeEach(() => {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    evidence = new EvidenceStore(TEST_DATA_DIR);
    engine = new NegotiationEngine(null, evidence);
  });

  afterEach(() => {
    evidence.close();
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  });

  test("renegotiation increments version and updates mappings", async () => {
    const agreement: Agreement = {
      id: "renegotiate-test",
      parties: { local: "demo.store", remote: "http://localhost:3011" },
      established: "2026-03-15T00:00:00Z",
      lastRenegotiated: null,
      version: 1,
      status: "active",
      mappings: [
        {
          operation: "inventory",
          localField: "quantity",
          remoteField: "qty_available",
          direction: "outbound",
        },
      ],
      trustLevels: { locked: [], negotiable: [], agreed: [] },
      compiledEndpoints: {},
    };

    const changes = [
      { field: "qty_available", oldValue: "qty_available", newValue: "stock_count" },
    ];

    const updated = await engine.renegotiate(agreement, changes);

    expect(updated.version).toBe(2);
    expect(updated.lastRenegotiated).not.toBeNull();
    expect(updated.mappings[0]!.remoteField).toBe("stock_count");
    expect(updated.mappings[0]!.transform).toContain("renegotiated:");
  });

  test("renegotiation records evidence", async () => {
    const agreement: Agreement = {
      id: "evidence-test",
      parties: { local: "demo.store", remote: "http://localhost:3011" },
      established: "2026-03-15T00:00:00Z",
      lastRenegotiated: null,
      version: 1,
      status: "active",
      mappings: [],
      trustLevels: { locked: [], negotiable: [], agreed: [] },
      compiledEndpoints: {},
    };

    await engine.renegotiate(agreement, []);

    const entries = evidence.getByContract("demo.store");
    expect(entries.length).toBeGreaterThanOrEqual(1);
    const renegotiationEntry = entries.find((e) => e.action === "agreement_renegotiated");
    expect(renegotiationEntry).toBeDefined();
  });
});

// ── Manifest endpoint response structure ──

describe("Manifest structure", () => {
  test("manifest has required fields", () => {
    const manifest: Manifest = {
      server: "http://localhost:3010",
      version: "1.0.0",
      contracts: [
        {
          name: "demo.store",
          version: "1.0.0",
          offers: ["orders"],
          accepts: ["inventory", "shipping"],
        },
      ],
    };

    expect(manifest.server).toBeTruthy();
    expect(manifest.version).toBeTruthy();
    expect(manifest.contracts).toBeInstanceOf(Array);
    expect(manifest.contracts[0]!.offers).toBeInstanceOf(Array);
    expect(manifest.contracts[0]!.accepts).toBeInstanceOf(Array);
  });
});

// ── Registry loads @N into sections ──

describe("Registry @N support", () => {
  test("loads negotiate section from demo-store.pact", () => {
    const registry = loadStore();
    const contract = registry.resolve("demo.store");
    expect(contract.sections.negotiate).toBeDefined();
    expect(contract.sections.negotiate!.offers).toHaveLength(1);
    expect(contract.sections.negotiate!.accepts).toHaveLength(2);
    expect(contract.sections.negotiate!.trustLevels.locked.length).toBeGreaterThan(0);
  });

  test("loads negotiate section from demo-fulfillment.pact", () => {
    const registry = loadFulfillment();
    const contract = registry.resolve("demo.fulfillment");
    expect(contract.sections.negotiate).toBeDefined();
    expect(contract.sections.negotiate!.offers).toHaveLength(2);
    expect(contract.sections.negotiate!.accepts).toHaveLength(1);
  });
});
