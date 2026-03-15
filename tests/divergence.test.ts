import { describe, test, expect } from "bun:test";
import {
  detectDivergence,
  buildSchemaMap,
  type DivergenceReport,
} from "../src/runtime/divergence";

describe("detectDivergence", () => {
  test("no divergence when response matches expected fields", () => {
    const expected = ["id", "name", "price"];
    const schema = { id: "number", name: "string", price: "number" };
    const actual = { id: 1, name: "Widget", price: 1999 };

    const report = detectDivergence(expected, schema, actual, "test-target");

    expect(report.divergences).toHaveLength(0);
    expect(report.hasHighImpact).toBe(false);
    expect(report.summary).toBe("no divergences detected");
    expect(report.target).toBe("test-target");
  });

  test("field_added (low impact) when response has extra fields", () => {
    const expected = ["id", "name"];
    const schema = { id: "number", name: "string" };
    const actual = { id: 1, name: "Widget", currency: "USD" };

    const report = detectDivergence(expected, schema, actual, "test-target");

    expect(report.divergences).toHaveLength(1);
    expect(report.divergences[0]!.type).toBe("field_added");
    expect(report.divergences[0]!.field).toBe("currency");
    expect(report.divergences[0]!.impact).toBe("low");
    expect(report.hasHighImpact).toBe(false);
    expect(report.summary).toContain("currency added");
  });

  test("field_removed (high impact) when expected field is missing", () => {
    const expected = ["id", "name", "price"];
    const schema = { id: "number", name: "string", price: "number" };
    const actual = { id: 1, name: "Widget" };

    const report = detectDivergence(expected, schema, actual, "test-target");

    const removed = report.divergences.filter((d) => d.type === "field_removed");
    expect(removed).toHaveLength(1);
    expect(removed[0]!.field).toBe("price");
    expect(removed[0]!.impact).toBe("high");
    expect(report.hasHighImpact).toBe(true);
    expect(report.summary).toContain("price removed");
  });

  test("field_type_changed (high impact) when type differs", () => {
    const expected = ["id", "name", "price"];
    const schema = { id: "number", name: "string", price: "number" };
    const actual = { id: 1, name: "Widget", price: "19.99" };

    const report = detectDivergence(expected, schema, actual, "test-target");

    const changed = report.divergences.filter((d) => d.type === "field_type_changed");
    expect(changed).toHaveLength(1);
    expect(changed[0]!.field).toBe("price");
    expect(changed[0]!.expected).toBe("number");
    expect(changed[0]!.received).toBe("string");
    expect(changed[0]!.impact).toBe("high");
    expect(report.hasHighImpact).toBe(true);
  });

  test("multiple divergences detected together", () => {
    const expected = ["id", "name", "price", "in_stock"];
    const schema = {
      id: "number",
      name: "string",
      price: "number",
      in_stock: "boolean",
    };
    // Schema v2: price removed, in_stock removed, price_cents + currency + available added
    const actual = {
      id: 1,
      name: "Widget",
      price_cents: 1999,
      currency: "USD",
      available: true,
    };

    const report = detectDivergence(expected, schema, actual, "mock-api");

    // price removed, in_stock removed, price_cents added, currency added, available added
    expect(report.divergences.length).toBe(5);

    const removed = report.divergences.filter((d) => d.type === "field_removed");
    expect(removed).toHaveLength(2);
    expect(removed.map((r) => r.field).sort()).toEqual(["in_stock", "price"]);

    const added = report.divergences.filter((d) => d.type === "field_added");
    expect(added).toHaveLength(3);
    expect(added.map((a) => a.field).sort()).toEqual(["available", "currency", "price_cents"]);

    expect(report.hasHighImpact).toBe(true);
    expect(report.summary).toContain("5 divergences");
  });

  test("divergence report summary formatting", () => {
    const expected = ["price"];
    const schema = { price: "number" };
    const actual = { price_cents: 1999, currency: "USD" };

    const report = detectDivergence(expected, schema, actual, "api");

    // 1 removed (price), 2 added (price_cents, currency)
    expect(report.divergences).toHaveLength(3);
    expect(report.summary).toContain("3 divergences");
    expect(report.summary).toContain("price removed");
    expect(report.summary).toContain("price_cents added");
    expect(report.summary).toContain("currency added");
  });

  test("no previous schema — only checks field presence", () => {
    const expected = ["id", "name", "price"];
    const actual = { id: 1, name: "Widget", cost: 500 };

    const report = detectDivergence(expected, null, actual, "api");

    // price removed (high), cost added (low)
    expect(report.divergences).toHaveLength(2);
    const removed = report.divergences.find((d) => d.type === "field_removed");
    expect(removed).toBeDefined();
    expect(removed!.field).toBe("price");
    const added = report.divergences.find((d) => d.type === "field_added");
    expect(added).toBeDefined();
    expect(added!.field).toBe("cost");
  });

  test("single divergence uses singular form in summary", () => {
    const expected = ["id"];
    const actual = { id: 1, extra: "x" };

    const report = detectDivergence(expected, null, actual, "api");

    expect(report.divergences).toHaveLength(1);
    expect(report.summary).toMatch(/^1 divergence:/);
  });

  test("empty expected fields — all response fields are additions", () => {
    const expected: string[] = [];
    const actual = { id: 1, name: "Widget" };

    const report = detectDivergence(expected, null, actual, "api");

    expect(report.divergences).toHaveLength(2);
    expect(report.divergences.every((d) => d.type === "field_added")).toBe(true);
    expect(report.hasHighImpact).toBe(false);
  });
});

describe("buildSchemaMap", () => {
  test("builds type map from response object", () => {
    const response = {
      id: 1,
      name: "Widget",
      price: 19.99,
      in_stock: true,
      tags: ["a", "b"],
      meta: null,
    };

    const schema = buildSchemaMap(response);

    expect(schema.id).toBe("number");
    expect(schema.name).toBe("string");
    expect(schema.price).toBe("number");
    expect(schema.in_stock).toBe("boolean");
    expect(schema.tags).toBe("array");
    expect(schema.meta).toBe("null");
  });

  test("handles empty object", () => {
    const schema = buildSchemaMap({});
    expect(Object.keys(schema)).toHaveLength(0);
  });
});
