import { describe, test, expect } from "bun:test";
import {
  buildGenerationPrompt,
  buildGapDetectionPrompt,
  buildRefinePrompt,
  generateSuggestions,
  extractPactBlock,
  parseGapQuestions,
  extractContractName,
  Translator,
} from "../src/runtime/translator";
import { parse } from "../src/index";

// ── buildGenerationPrompt ──

describe("buildGenerationPrompt", () => {
  const prompt = buildGenerationPrompt("create a user registration service");

  test("includes the user description", () => {
    expect(prompt).toContain("create a user registration service");
  });

  test("includes all section markers", () => {
    expect(prompt).toContain("@C");
    expect(prompt).toContain("@I");
    expect(prompt).toContain("@E");
    expect(prompt).toContain("@K");
    expect(prompt).toContain("@X");
    expect(prompt).toContain("@T");
    expect(prompt).toContain("@F");
    expect(prompt).toContain("@D");
  });

  test("includes all primitive types", () => {
    expect(prompt).toContain("str");
    expect(prompt).toContain("int");
    expect(prompt).toContain("dec");
    expect(prompt).toContain("bool");
    expect(prompt).toContain(" ts");
    expect(prompt).toContain("dur");
    expect(prompt).toContain(" id");
    expect(prompt).toContain("any");
  });

  test("includes composite types", () => {
    expect(prompt).toContain("ref[T]");
    expect(prompt).toContain("list[T]");
    expect(prompt).toContain("map[K,V]");
    expect(prompt).toContain("opt[T]");
    expect(prompt).toContain("enum(a,b,c)");
  });

  test("includes field modifiers", () => {
    expect(prompt).toContain("`!`");
    expect(prompt).toContain("`?`");
    expect(prompt).toContain("`*`");
    expect(prompt).toContain("`^`");
    expect(prompt).toContain("`~`");
    expect(prompt).toContain("=<value>");
  });

  test("includes flow operators", () => {
    expect(prompt).toContain("`>>`");
    expect(prompt).toContain("`>`");
    expect(prompt).toContain("`?`");
    expect(prompt).toContain("`?!`");
    expect(prompt).toContain("`??`");
    expect(prompt).toContain("`*`");
    expect(prompt).toContain("`<>`");
    expect(prompt).toContain("`@>`");
    expect(prompt).toContain("`~>`");
  });

  test("includes a complete example contract", () => {
    expect(prompt).toContain("pact v1");
    expect(prompt).toContain("@C customer.create 1.0.0");
    expect(prompt).toContain("persist customer");
  });

  test("includes constraint predicates", () => {
    expect(prompt).toContain("field unique");
    expect(prompt).toContain("field min");
    expect(prompt).toContain("field max");
    expect(prompt).toContain("field matches");
    expect(prompt).toContain("forall");
    expect(prompt).toContain("exists");
  });

  test("instructs LLM to output pact code block only", () => {
    expect(prompt).toContain("```pact");
    expect(prompt).toContain("Output ONLY");
  });
});

// ── buildGapDetectionPrompt ──

describe("buildGapDetectionPrompt", () => {
  const contract = `pact v1\n@C test 1.0.0\n  domain demo`;
  const prompt = buildGapDetectionPrompt(contract);

  test("includes the contract source", () => {
    expect(prompt).toContain("@C test 1.0.0");
  });

  test("asks for JSON array format", () => {
    expect(prompt).toContain("JSON array");
    expect(prompt).toContain("```json");
  });

  test("includes gap categories", () => {
    expect(prompt).toContain("error_handling");
    expect(prompt).toContain("security");
    expect(prompt).toContain("edge_case");
    expect(prompt).toContain("data");
  });
});

// ── extractPactBlock ──

describe("extractPactBlock", () => {
  test("extracts from ```pact code block", () => {
    const response = `Here is the contract:\n\n\`\`\`pact\npact v1\n\n@C test 1.0.0\n  domain demo\n\`\`\`\n\nDone.`;
    const result = extractPactBlock(response);
    expect(result).toBe("pact v1\n\n@C test 1.0.0\n  domain demo");
  });

  test("extracts from generic ``` code block starting with pact v", () => {
    const response = "```\npact v1\n\n@C test 1.0.0\n```";
    const result = extractPactBlock(response);
    expect(result).toBe("pact v1\n\n@C test 1.0.0");
  });

  test("extracts raw pact content when no code block", () => {
    const response = "Some text\npact v1\n\n@C test 1.0.0\n  domain demo";
    const result = extractPactBlock(response);
    expect(result).toBe("pact v1\n\n@C test 1.0.0\n  domain demo");
  });

  test("returns null when no pact content found", () => {
    const response = "This is just some random text.";
    const result = extractPactBlock(response);
    expect(result).toBeNull();
  });
});

// ── parseGapQuestions ──

describe("parseGapQuestions", () => {
  test("parses valid JSON array from code block", () => {
    const response = `\`\`\`json\n[\n  {\n    "category": "error_handling",\n    "question": "What if the DB fails?",\n    "suggestion": "retry 3"\n  }\n]\n\`\`\``;
    const gaps = parseGapQuestions(response);
    expect(gaps.length).toBe(1);
    expect(gaps[0]!.category).toBe("error_handling");
    expect(gaps[0]!.question).toBe("What if the DB fails?");
    expect(gaps[0]!.suggestion).toBe("retry 3");
  });

  test("parses raw JSON array", () => {
    const response = `[{"category":"security","question":"How is auth handled?"}]`;
    const gaps = parseGapQuestions(response);
    expect(gaps.length).toBe(1);
    expect(gaps[0]!.category).toBe("security");
    expect(gaps[0]!.suggestion).toBeUndefined();
  });

  test("returns empty array for invalid JSON", () => {
    const gaps = parseGapQuestions("not json at all");
    expect(gaps).toEqual([]);
  });

  test("filters out malformed entries", () => {
    const response = `[{"category":"data","question":"valid"},{"bad":"entry"},{"category":"edge_case","question":"also valid"}]`;
    const gaps = parseGapQuestions(response);
    expect(gaps.length).toBe(2);
    expect(gaps[0]!.category).toBe("data");
    expect(gaps[1]!.category).toBe("edge_case");
  });

  test("returns empty array for empty input", () => {
    expect(parseGapQuestions("")).toEqual([]);
  });

  test("parses multiple gap questions", () => {
    const response = `\`\`\`json
[
  {"category": "error_handling", "question": "Q1", "suggestion": "S1"},
  {"category": "security", "question": "Q2", "suggestion": "S2"},
  {"category": "data", "question": "Q3", "suggestion": "S3"},
  {"category": "edge_case", "question": "Q4"}
]
\`\`\``;
    const gaps = parseGapQuestions(response);
    expect(gaps.length).toBe(4);
    expect(gaps[3]!.suggestion).toBeUndefined();
  });
});

// ── extractContractName ──

describe("extractContractName", () => {
  test("extracts name from valid @C line", () => {
    const source = "pact v1\n\n@C customer.create 1.0.0\n  domain demo";
    expect(extractContractName(source)).toBe("customer.create");
  });

  test("extracts name from @C without version on same line", () => {
    const source = "@C order.process 2.0.0\n  domain commerce";
    expect(extractContractName(source)).toBe("order.process");
  });

  test("returns null when no @C found", () => {
    expect(extractContractName("pact v1\n@I\n  natural \"test\"")).toBeNull();
  });
});

// ── generateSuggestions ──

describe("generateSuggestions", () => {
  test("suggests @T when no triggers section", () => {
    const source = `pact v1

@C test 1.0.0
  domain demo
  author test
  created 2026-03-15T00:00:00Z

@I
  natural "Test"
  goal test.done
  timeout 5s

@E
  item
    id id ~
    name str !
    created_at ts ~

@K
  name min 1
    severity fatal
    message "Required"

@X
  validate name
  persist item
`;
    const ast = parse(source);
    const suggestions = generateSuggestions(source, ast);
    expect(suggestions.some((s) => s.includes("@T"))).toBe(true);
  });

  test("suggests @F when no fallbacks section", () => {
    const source = `pact v1

@C test 1.0.0
  domain demo
  author test
  created 2026-03-15T00:00:00Z

@I
  natural "Test"
  goal test.done
  timeout 5s

@E
  item
    id id ~
    name str !
    created_at ts ~

@X
  validate name
  persist item
`;
    const ast = parse(source);
    const suggestions = generateSuggestions(source, ast);
    expect(suggestions.some((s) => s.includes("@F"))).toBe(true);
  });

  test("suggests @K when no constraints section", () => {
    const source = `pact v1

@C test 1.0.0
  domain demo
  author test
  created 2026-03-15T00:00:00Z

@I
  natural "Test"
  goal test.done
  timeout 5s

@E
  item
    id id ~
    name str !
    created_at ts ~

@X
  validate name
  persist item
`;
    const ast = parse(source);
    const suggestions = generateSuggestions(source, ast);
    expect(suggestions.some((s) => s.includes("@K"))).toBe(true);
  });

  test("suggests auto-generated id when entity lacks id field", () => {
    const source = `pact v1

@C test 1.0.0
  domain demo
  author test
  created 2026-03-15T00:00:00Z

@I
  natural "Test"
  goal test.done
  timeout 5s

@E
  item
    name str !
    value int !
    created_at ts ~

@X
  validate name
  persist item
`;
    const ast = parse(source);
    const suggestions = generateSuggestions(source, ast);
    expect(suggestions.some((s) => s.includes("id") && s.includes("auto-generated"))).toBe(true);
  });

  test("suggests modifiers when fields lack them", () => {
    const source = `pact v1

@C test 1.0.0
  domain demo
  author test
  created 2026-03-15T00:00:00Z

@I
  natural "Test"
  goal test.done
  timeout 5s

@E
  item
    id id ~
    name str
    value int
    created_at ts ~

@X
  validate name
  persist item
`;
    const ast = parse(source);
    const suggestions = generateSuggestions(source, ast);
    expect(suggestions.some((s) => s.includes("without modifiers"))).toBe(true);
  });

  test("does not suggest @T when triggers exist", () => {
    const source = `pact v1

@C test 1.0.0
  domain demo
  author test
  created 2026-03-15T00:00:00Z

@T
  http POST /api/test

@I
  natural "Test"
  goal test.done
  timeout 5s

@E
  item
    id id ~
    name str !
    created_at ts ~

@K
  name min 1
    severity fatal
    message "Required"

@X
  validate name
  persist item

@F
  on error
    abort "Failed"
`;
    const ast = parse(source);
    const suggestions = generateSuggestions(source, ast);
    expect(suggestions.some((s) => s.includes("Consider adding @T"))).toBe(false);
  });

  test("does not suggest @F when fallbacks exist", () => {
    const source = `pact v1

@C test 1.0.0
  domain demo
  author test
  created 2026-03-15T00:00:00Z

@T
  http POST /api/test

@I
  natural "Test"
  goal test.done
  timeout 5s

@E
  item
    id id ~
    name str !
    created_at ts ~

@K
  name min 1
    severity fatal
    message "Required"

@X
  validate name
  persist item

@F
  on error
    abort "Failed"
`;
    const ast = parse(source);
    const suggestions = generateSuggestions(source, ast);
    expect(suggestions.some((s) => s.includes("No @F"))).toBe(false);
  });

  test("returns empty array for null AST", () => {
    const suggestions = generateSuggestions("invalid", null);
    expect(suggestions).toEqual([]);
  });

  test("suggests timeout for exchange without timeout in @I", () => {
    const source = `pact v1

@C test 1.0.0
  domain demo
  author test
  created 2026-03-15T00:00:00Z

@I
  natural "Test"
  goal test.done

@E
  item
    id id ~
    name str !
    created_at ts ~

@X
  <> api.example.com/items
    send name
    receive id
  persist item
`;
    const ast = parse(source);
    const suggestions = generateSuggestions(source, ast);
    expect(suggestions.some((s) => s.includes("timeout") && s.includes("exchange"))).toBe(true);
  });
});

// ── buildRefinePrompt ──

describe("buildRefinePrompt", () => {
  const contract = `pact v1\n@C test 1.0.0\n  domain demo`;
  const gaps = [
    { question: "What if the DB fails?", answer: "retry 3 backoff exponential base 2s" },
    { question: "How is auth handled?", answer: "bearer_token" },
  ];
  const prompt = buildRefinePrompt(contract, gaps);

  test("includes the contract source", () => {
    expect(prompt).toContain("@C test 1.0.0");
  });

  test("includes gap questions and answers", () => {
    expect(prompt).toContain("Q: What if the DB fails?");
    expect(prompt).toContain("A: retry 3 backoff exponential base 2s");
    expect(prompt).toContain("Q: How is auth handled?");
    expect(prompt).toContain("A: bearer_token");
  });

  test("numbers the gap resolutions", () => {
    expect(prompt).toContain("1. Q:");
    expect(prompt).toContain("2. Q:");
  });

  test("wraps contract in pact code block", () => {
    expect(prompt).toContain("```pact");
  });

  test("instructs to output updated pact file", () => {
    expect(prompt).toContain("Update the contract to incorporate each resolution");
    expect(prompt).toContain("```pact code block");
  });
});

// ── Translator class (without actual LLM calls) ──

describe("Translator", () => {
  test("is importable and constructible", () => {
    const translator = new Translator({
      llm: {
        name: "mock",
        isAvailable: () => true,
        complete: async () => ({ text: "", durationMs: 0, provider: "mock" }),
      },
      outputDir: "/tmp/pact-test-contracts",
    });
    expect(translator).toBeDefined();
  });

  test("refineWithGaps sends correct prompt and parses response", async () => {
    const refinedContract = `pact v1

@C test.refined 1.0.0
  domain demo
  author translator:pact-cli
  created 2026-03-15T00:00:00Z

@I
  natural "A test contract"
  goal test.done
  timeout 5s

@E
  item
    id id ~
    name str !
    created_at ts ~

@X
  validate name
  persist item

@F
  on db_unavailable
    retry 3 backoff exponential base 2s
    abort "Database unavailable after retries"`;

    let capturedPrompt = "";
    const translator = new Translator({
      llm: {
        name: "mock",
        isAvailable: () => true,
        complete: async (prompt: string) => {
          capturedPrompt = prompt;
          return {
            text: "```pact\n" + refinedContract + "\n```",
            durationMs: 100,
            provider: "mock",
          };
        },
      },
      outputDir: "/tmp/pact-test-refine",
    });

    const originalSource = `pact v1\n@C test 1.0.0\n  domain demo`;
    const gaps = [
      { question: "What if the DB fails?", answer: "retry 3 backoff exponential base 2s" },
    ];

    const result = await translator.refineWithGaps(originalSource, gaps);

    // Verify the prompt was constructed correctly
    expect(capturedPrompt).toContain("@C test 1.0.0");
    expect(capturedPrompt).toContain("Q: What if the DB fails?");
    expect(capturedPrompt).toContain("A: retry 3 backoff exponential base 2s");

    // Verify the result
    expect(result.success).toBe(true);
    expect(result.contractSource).toContain("@F");
    expect(result.contractSource).toContain("retry 3");
    expect(result.contractName).toBe("test.refined");
  });

  test("refineWithGaps returns error when LLM fails", async () => {
    const translator = new Translator({
      llm: {
        name: "mock",
        isAvailable: () => true,
        complete: async () => {
          throw new Error("LLM connection refused");
        },
      },
      outputDir: "/tmp/pact-test-refine-fail",
    });

    const result = await translator.refineWithGaps("pact v1", [
      { question: "test?", answer: "yes" },
    ]);

    expect(result.success).toBe(false);
    expect(result.error).toContain("LLM refinement failed");
    expect(result.contractSource).toBe("pact v1");
  });

  test("refineWithGaps returns error when LLM returns no pact block", async () => {
    const translator = new Translator({
      llm: {
        name: "mock",
        isAvailable: () => true,
        complete: async () => ({
          text: "I could not generate a contract.",
          durationMs: 50,
          provider: "mock",
        }),
      },
      outputDir: "/tmp/pact-test-refine-noblock",
    });

    const result = await translator.refineWithGaps("pact v1", [
      { question: "test?", answer: "yes" },
    ]);

    expect(result.success).toBe(false);
    expect(result.error).toContain("did not produce a valid .pact code block");
  });
});
