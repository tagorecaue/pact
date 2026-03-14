import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { parse } from "../src/index";
import type {
  ContractSection,
  IntentSection,
  EntitiesSection,
  ConstraintsSection,
  ExecutionSection,
  FallbacksSection,
  TriggersSection,
  DependenciesSection,
  EvidenceSection,
} from "../src/index";

function readFixture(name: string): string {
  return readFileSync(`tests/fixtures/${name}`, "utf-8");
}

function getSection<T>(ast: ReturnType<typeof parse>, kind: string): T {
  return ast.sections.find((s) => s.kind === kind) as T;
}

describe("Integration: parse full fixtures", () => {
  test("simple.pact — customer.create", () => {
    const source = readFixture("simple.pact");
    const ast = parse(source);

    // Header
    expect(ast.header.version).toBe("v1");

    // Should have 6 sections: @C, @I, @E, @K, @X, @F (+ @V which is mostly empty)
    expect(ast.sections.length).toBeGreaterThanOrEqual(6);

    // @C
    const c = getSection<ContractSection>(ast, "ContractSection");
    expect(c.name).toBe("customer.create");
    expect(c.version).toBe("1.0.0");
    expect(c.domain).toBe("commerce.customers");
    expect(c.author).toBe("translator:claude-opus@4");
    expect(c.created).toBe("2026-03-13T10:00:00Z");

    // @I
    const i = getSection<IntentSection>(ast, "IntentSection");
    expect(i.natural).toBe(
      "Register new customer with email validation and Stripe sync",
    );
    expect(i.goal).toBeDefined();
    expect(i.accept).toHaveLength(3);
    expect(i.reject).toHaveLength(2);
    expect(i.priority).toBe("normal");
    expect(i.timeout).toBe("10s");

    // @E
    const e = getSection<EntitiesSection>(ast, "EntitiesSection");
    expect(e.entities).toHaveLength(1);
    expect(e.entities[0]!.name).toBe("customer");
    expect(e.entities[0]!.fields.length).toBeGreaterThanOrEqual(8);

    // Check specific field
    const emailField = e.entities[0]!.fields.find((f) => f.name === "email");
    expect(emailField).toBeDefined();
    expect(emailField!.type.kind).toBe("PrimitiveType");
    expect(emailField!.modifiers).toContain("!");
    expect(emailField!.modifiers).toContain("*");
    expect(emailField!.modifiers).toContain("^");

    // enum field with default
    const statusField = e.entities[0]!.fields.find(
      (f) => f.name === "status",
    );
    expect(statusField).toBeDefined();
    expect(statusField!.type.kind).toBe("EnumType");
    expect(statusField!.defaultValue).toBe("active");

    // @K
    const k = getSection<ConstraintsSection>(ast, "ConstraintsSection");
    expect(k.constraints.length).toBeGreaterThanOrEqual(3);
    expect(k.constraints[0]!.severity).toBe("fatal");
    expect(k.constraints[0]!.message).toBe("Email already registered");

    // @X
    const x = getSection<ExecutionSection>(ast, "ExecutionSection");
    expect(x.flow.length).toBeGreaterThan(0);

    // @F
    const f = getSection<FallbacksSection>(ast, "FallbacksSection");
    expect(f.handlers).toHaveLength(3);
    expect(f.handlers[0]!.event).toBe("stripe_timeout");
  });

  test("medium.pact — payment.webhook.stripe", () => {
    const source = readFixture("medium.pact");
    const ast = parse(source);

    expect(ast.header.version).toBe("v1");

    // @C
    const c = getSection<ContractSection>(ast, "ContractSection");
    expect(c.name).toBe("payment.webhook.stripe");
    expect(c.tags).toEqual(["webhook", "stripe", "critical"]);

    // @T triggers
    const t = getSection<TriggersSection>(ast, "TriggersSection");
    expect(t.triggers).toHaveLength(2);
    expect(t.triggers[0]!.type).toBe("webhook");

    // @I
    const i = getSection<IntentSection>(ast, "IntentSection");
    expect(i.priority).toBe("critical");
    expect(i.timeout).toBe("5s");

    // @E
    const e = getSection<EntitiesSection>(ast, "EntitiesSection");
    expect(e.entities).toHaveLength(3); // webhook_event, payment, subscription

    // @X with match expression
    const x = getSection<ExecutionSection>(ast, "ExecutionSection");
    expect(x.flow.length).toBeGreaterThan(0);

    // Check that there's a match expression somewhere in the flow
    const hasMatch = x.flow.some(
      (f) => f.kind === "MatchExpr" || findInFlow(f, "MatchExpr"),
    );
    expect(hasMatch).toBe(true);
  });

  test("complex-a.pact — inventory.reserve", () => {
    const source = readFixture("complex-a.pact");
    const ast = parse(source);

    const c = getSection<ContractSection>(ast, "ContractSection");
    expect(c.name).toBe("inventory.reserve");
    expect(c.tags).toEqual(["inventory", "atomic"]);

    // @I with quantifier in goal
    const i = getSection<IntentSection>(ast, "IntentSection");
    expect(i.goal).toBeDefined();
    expect(i.goal!.kind).toBe("Quantified");

    // @E
    const e = getSection<EntitiesSection>(ast, "EntitiesSection");
    expect(e.entities).toHaveLength(2); // reservation, reservation_item

    // @K with quantifier constraints
    const k = getSection<ConstraintsSection>(ast, "ConstraintsSection");
    expect(k.constraints.length).toBeGreaterThanOrEqual(3);

    // @X with loop
    const x = getSection<ExecutionSection>(ast, "ExecutionSection");
    const hasLoop = x.flow.some(
      (f) => f.kind === "LoopExpr" || findInFlow(f, "LoopExpr"),
    );
    expect(hasLoop).toBe(true);
  });

  test("complex-b.pact — payment.process", () => {
    const source = readFixture("complex-b.pact");
    const ast = parse(source);

    const c = getSection<ContractSection>(ast, "ContractSection");
    expect(c.name).toBe("payment.process");
    expect(c.version).toBe("2.0.0");

    // @D
    const d = getSection<DependenciesSection>(ast, "DependenciesSection");
    expect(d.deps).toHaveLength(1);
    expect(d.deps[0]!.contract).toBe("inventory.reserve");
    expect(d.deps[0]!.versionConstraints[0]).toBe(">=1.0.0");

    // @X with match on payment method
    const x = getSection<ExecutionSection>(ast, "ExecutionSection");
    expect(x.flow.length).toBeGreaterThan(0);
  });

  test("complex-c.pact — checkout.complete (saga)", () => {
    const source = readFixture("complex-c.pact");
    const ast = parse(source);

    const c = getSection<ContractSection>(ast, "ContractSection");
    expect(c.name).toBe("checkout.complete");
    expect(c.tags).toEqual(["checkout", "saga", "critical", "multi-step"]);

    // @D — 3 dependencies
    const d = getSection<DependenciesSection>(ast, "DependenciesSection");
    expect(d.deps).toHaveLength(3);

    // @X — delegation with compensation (saga pattern)
    const x = getSection<ExecutionSection>(ast, "ExecutionSection");
    expect(x.flow.length).toBeGreaterThan(0);

    // Should have delegate expressions
    const hasDelegates = x.flow.some(
      (f) => f.kind === "DelegateExpr" || findInFlow(f, "DelegateExpr"),
    );
    expect(hasDelegates).toBe(true);

    // @F
    const f = getSection<FallbacksSection>(ast, "FallbacksSection");
    expect(f.handlers).toHaveLength(3);
  });
});

describe("Integration: validation errors", () => {
  test("rejects duplicate sections", () => {
    const source = `pact v1\n\n@I\n  natural "a"\n\n@I\n  natural "b"`;
    expect(() => parse(source)).toThrow("Duplicate section");
  });

  test("rejects @R + @X together", () => {
    const source = `pact v1\n\n@X\n  step1\n\n@R\n  objective "test"`;
    expect(() => parse(source)).toThrow("mutually exclusive");
  });

  test("rejects missing version header", () => {
    const source = `@C test 1.0.0`;
    expect(() => parse(source)).toThrow("pact");
  });

  test("rejects CRLF", () => {
    const source = "pact v1\r\n@C test 1.0.0";
    expect(() => parse(source)).toThrow("CRLF");
  });

  test("rejects tabs", () => {
    const source = "pact v1\n@C\n\ttest 1.0.0";
    expect(() => parse(source)).toThrow("Tabs");
  });
});

// Helper to search flow tree recursively
function findInFlow(node: any, kind: string): boolean {
  if (!node || typeof node !== "object") return false;
  if (node.kind === kind) return true;

  for (const key of Object.keys(node)) {
    const val = node[key];
    if (Array.isArray(val)) {
      for (const item of val) {
        if (findInFlow(item, kind)) return true;
      }
    } else if (typeof val === "object" && val !== null) {
      if (findInFlow(val, kind)) return true;
    }
  }
  return false;
}
