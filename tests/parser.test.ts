import { describe, test, expect } from "bun:test";
import { parse, PactParseError, PactLexError } from "../src/index";

describe("Parser", () => {
  describe("version header", () => {
    test("parses valid header", () => {
      const ast = parse("pact v1\n\n@C test 1.0.0\n  domain d\n  author a\n  created 2026-01-01T00:00:00Z");
      expect(ast.header.version).toBe("v1");
    });

    test("rejects missing header", () => {
      expect(() => parse("@C test 1.0.0")).toThrow("pact");
    });

    test("rejects wrong keyword", () => {
      expect(() => parse("contract v1")).toThrow();
    });
  });

  describe("section validation", () => {
    test("rejects duplicate sections", () => {
      expect(() =>
        parse("pact v1\n\n@I\n  natural \"a\"\n\n@I\n  natural \"b\""),
      ).toThrow("Duplicate");
    });

    test("rejects @R + @X together", () => {
      expect(() =>
        parse(
          'pact v1\n\n@X\n  step1\n\n@R\n  objective "test"',
        ),
      ).toThrow("mutually exclusive");
    });

    test("allows @R without @X", () => {
      const ast = parse(
        'pact v1\n\n@R\n  objective "test"',
      );
      expect(ast.sections).toHaveLength(1);
      expect(ast.sections[0]!.kind).toBe("ReasoningSection");
    });
  });

  describe("@C section", () => {
    test("parses name with dots", () => {
      const ast = parse(
        "pact v1\n\n@C checkout.complete 2.1.0\n  domain commerce.orders\n  author test\n  created 2026-01-01T00:00:00Z\n  tags critical payment",
      );
      const c = ast.sections[0]!;
      if (c.kind === "ContractSection") {
        expect(c.name).toBe("checkout.complete");
        expect(c.version).toBe("2.1.0");
        expect(c.domain).toBe("commerce.orders");
        expect(c.tags).toEqual(["critical", "payment"]);
      }
    });
  });

  describe("@E section", () => {
    test("parses entity with fields and modifiers", () => {
      const ast = parse(
        "pact v1\n\n@E\n  user\n    id id ~\n    email str !*^\n    name str !\n    status enum(active,blocked) =active",
      );
      const e = ast.sections[0]!;
      if (e.kind === "EntitiesSection") {
        expect(e.entities).toHaveLength(1);
        const user = e.entities[0]!;
        expect(user.name).toBe("user");
        expect(user.fields).toHaveLength(4);

        const idField = user.fields[0]!;
        expect(idField.modifiers).toContain("~");

        const emailField = user.fields[1]!;
        expect(emailField.modifiers).toEqual(["!", "*", "^"]);

        const statusField = user.fields[3]!;
        expect(statusField.type.kind).toBe("EnumType");
        expect(statusField.defaultValue).toBe("active");
      }
    });

    test("parses multiple entities", () => {
      const ast = parse(
        "pact v1\n\n@E\n  order\n    id id ~\n  item\n    product_id ref[product] !",
      );
      const e = ast.sections[0]!;
      if (e.kind === "EntitiesSection") {
        expect(e.entities).toHaveLength(2);
      }
    });
  });

  describe("@I section", () => {
    test("parses intent fields", () => {
      const ast = parse(
        'pact v1\n\n@I\n  natural "Create something"\n  goal a & b\n  accept\n    "First"\n    "Second"\n  reject\n    "Bad thing"\n  priority critical\n  timeout 30s',
      );
      const i = ast.sections[0]!;
      if (i.kind === "IntentSection") {
        expect(i.natural).toBe("Create something");
        expect(i.goal!.kind).toBe("AndExpr");
        expect(i.accept).toEqual(["First", "Second"]);
        expect(i.reject).toEqual(["Bad thing"]);
        expect(i.priority).toBe("critical");
        expect(i.timeout).toBe("30s");
      }
    });
  });

  describe("@K section", () => {
    test("parses constraints with severity and message", () => {
      const ast = parse(
        'pact v1\n\n@K\n  email unique within customers\n    severity fatal\n    message "Already exists"',
      );
      const k = ast.sections[0]!;
      if (k.kind === "ConstraintsSection") {
        expect(k.constraints).toHaveLength(1);
        expect(k.constraints[0]!.severity).toBe("fatal");
        expect(k.constraints[0]!.message).toBe("Already exists");
      }
    });
  });

  describe("@D section", () => {
    test("parses dependencies with version constraints", () => {
      const ast = parse(
        "pact v1\n\n@D\n  #customer.create >=1.0.0 <2.0.0\n    bind customer <- customer",
      );
      const d = ast.sections[0]!;
      if (d.kind === "DependenciesSection") {
        expect(d.deps).toHaveLength(1);
        expect(d.deps[0]!.contract).toBe("customer.create");
        expect(d.deps[0]!.versionConstraints).toEqual([">=1.0.0", "<2.0.0"]);
        expect(d.deps[0]!.bindings).toHaveLength(1);
      }
    });
  });

  describe("@F section", () => {
    test("parses fallback handlers", () => {
      const ast = parse(
        'pact v1\n\n@F\n  on timeout\n    retry 3 backoff exponential base 2s\n  on error\n    abort "Failed"',
      );
      const f = ast.sections[0]!;
      if (f.kind === "FallbacksSection") {
        expect(f.handlers).toHaveLength(2);
        expect(f.handlers[0]!.event).toBe("timeout");
        const retry = f.handlers[0]!.actions[0]!;
        if (retry.kind === "RetryAction") {
          expect(retry.count).toBe(3);
          expect(retry.backoff).toBe("exponential");
          expect(retry.base).toBe("2s");
        }
        const abort = f.handlers[1]!.actions[0]!;
        if (abort.kind === "AbortAction") {
          expect(abort.message).toBe("Failed");
        }
      }
    });

    test("parses escalate action", () => {
      const ast = parse(
        "pact v1\n\n@F\n  on critical\n    escalate ops_team via slack",
      );
      const f = ast.sections[0]!;
      if (f.kind === "FallbacksSection") {
        const action = f.handlers[0]!.actions[0]!;
        if (action.kind === "EscalateAction") {
          expect(action.target).toBe("ops_team");
          expect(action.via).toBe("slack");
        }
      }
    });
  });

  describe("@T section", () => {
    test("parses trigger types", () => {
      const ast = parse(
        "pact v1\n\n@T\n  webhook stripe payment_intent.succeeded\n    verify_signature true",
      );
      const t = ast.sections[0]!;
      if (t.kind === "TriggersSection") {
        expect(t.triggers).toHaveLength(1);
        expect(t.triggers[0]!.type).toBe("webhook");
        expect(t.triggers[0]!.args).toContain("stripe");
      }
    });
  });

  describe("encoding errors", () => {
    test("rejects CRLF", () => {
      expect(() => parse("pact v1\r\n")).toThrow(PactLexError);
    });

    test("rejects tabs", () => {
      expect(() => parse("@C\n\ttest")).toThrow(PactLexError);
    });

    test("rejects BOM", () => {
      expect(() => parse("\uFEFFpact v1")).toThrow(PactLexError);
    });
  });
});
