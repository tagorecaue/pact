import { describe, test, expect } from "bun:test";
import { parse } from "../src/index";

function parseFlow(flowSrc: string) {
  const src = `pact v1\n\n@X\n${flowSrc
    .split("\n")
    .map((l) => "  " + l)
    .join("\n")}`;
  const ast = parse(src);
  const x = ast.sections.find((s) => s.kind === "ExecutionSection");
  if (!x || x.kind !== "ExecutionSection") throw new Error("No @X section");
  return x.flow;
}

describe("Flow expressions", () => {
  test("simple step", () => {
    const flow = parseFlow("validate_input");
    expect(flow).toHaveLength(1);
    expect(flow[0]!.kind).toBe("StepNode");
    if (flow[0]!.kind === "StepNode") {
      expect(flow[0]!.name).toBe("validate_input");
    }
  });

  test("step with args", () => {
    const flow = parseFlow("persist customer");
    expect(flow).toHaveLength(1);
    if (flow[0]!.kind === "StepNode") {
      expect(flow[0]!.name).toBe("persist");
      expect(flow[0]!.args).toEqual(["customer"]);
    }
  });

  test("pipe (>>)", () => {
    const flow = parseFlow("step1\n  >> step2\n  >> step3");
    expect(flow).toHaveLength(1);
    // step1 >> step2 >> step3
    expect(flow[0]!.kind).toBe("PipeExpr");
  });

  test("conditional (?)", () => {
    const flow = parseFlow("? doc_provided\n  validate_doc doc");
    expect(flow).toHaveLength(1);
    expect(flow[0]!.kind).toBe("ConditionalExpr");
    if (flow[0]!.kind === "ConditionalExpr") {
      expect(flow[0]!.then).toHaveLength(1);
    }
  });

  test("conditional with else (?!)", () => {
    const flow = parseFlow(
      "? stock_sufficient\n  reserve_item\n?!\n  release_all_reserved",
    );
    expect(flow).toHaveLength(1);
    expect(flow[0]!.kind).toBe("ConditionalExpr");
    if (flow[0]!.kind === "ConditionalExpr") {
      expect(flow[0]!.else).toBeDefined();
      expect(flow[0]!.else).toHaveLength(1);
    }
  });

  test("match (??)", () => {
    const flow = parseFlow(
      '?? payment.method\n  credit_card\n    process_card\n  pix\n    generate_pix\n  _\n    abort "Unknown"',
    );
    expect(flow).toHaveLength(1);
    expect(flow[0]!.kind).toBe("MatchExpr");
    if (flow[0]!.kind === "MatchExpr") {
      expect(flow[0]!.arms).toHaveLength(3);
      expect(flow[0]!.arms[2]!.pattern).toBe("_");
    }
  });

  test("loop (* with max)", () => {
    const flow = parseFlow(
      "* has_next_item max 500\n  check_stock item.product_id",
    );
    expect(flow).toHaveLength(1);
    expect(flow[0]!.kind).toBe("LoopExpr");
    if (flow[0]!.kind === "LoopExpr") {
      expect(flow[0]!.max).toBe(500);
      expect(flow[0]!.body).toHaveLength(1);
    }
  });

  test("delegate (@>)", () => {
    const flow = parseFlow("@> #inventory.reserve");
    expect(flow).toHaveLength(1);
    expect(flow[0]!.kind).toBe("DelegateExpr");
    if (flow[0]!.kind === "DelegateExpr") {
      expect(flow[0]!.contract).toBe("#inventory.reserve");
    }
  });

  test("delegate with bindings", () => {
    const flow = parseFlow(
      "@> #inventory.reserve\n  bind items <- order.items\n  timeout 5s\n  expect reservation.status = active",
    );
    expect(flow).toHaveLength(1);
    expect(flow[0]!.kind).toBe("DelegateExpr");
    if (flow[0]!.kind === "DelegateExpr") {
      expect(flow[0]!.bindings).toHaveLength(1);
      expect(flow[0]!.bindings[0]!.local).toBe("items");
      expect(flow[0]!.timeout).toBe("5s");
    }
  });

  test("exchange (<>)", () => {
    const flow = parseFlow(
      "<> stripe.customers.create\n  send email name\n  receive stripe_id",
    );
    expect(flow).toHaveLength(1);
    expect(flow[0]!.kind).toBe("ExchangeExpr");
    if (flow[0]!.kind === "ExchangeExpr") {
      expect(flow[0]!.target).toBe("stripe.customers.create");
      expect(flow[0]!.send).toEqual(["email", "name"]);
      expect(flow[0]!.receive).toEqual(["stripe_id"]);
    }
  });

  test("async (~>)", () => {
    const flow = parseFlow("emit customer.created\n  ~> send_welcome_email\n  ~> log_audit");
    expect(flow).toHaveLength(1);
    // Step with async children
  });

  test("sequence of steps", () => {
    const flow = parseFlow("step1\nstep2\nstep3");
    expect(flow).toHaveLength(3);
  });

  test("match with dotted patterns", () => {
    const flow = parseFlow(
      "?? webhook_event.type\n  payment_intent.succeeded\n    update_payment\n  _\n    abort \"Unknown\"",
    );
    expect(flow).toHaveLength(1);
    if (flow[0]!.kind === "MatchExpr") {
      expect(flow[0]!.arms[0]!.pattern).toBe("payment_intent.succeeded");
    }
  });
});
