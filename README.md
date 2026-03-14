# Pact

> The protocol that refuses to execute with ambiguity.

## What is Pact?

Pact is an AI-native protocol for turning human intent into machine execution — with zero ambiguity.

You don't write code. You declare what you want. Pact interrogates you until every edge case is covered, then generates a formal contract that machines execute with auditable evidence. No glue code. No silent failures. No "it works on my machine."

Pact is built on four pillars:

1. **The Dialect** — A token-efficient, unambiguous protocol designed for AI-to-AI communication. Not YAML. Not JSON. A language that machines parse without guessing.
2. **The Interrogator** — Gap detection that refuses to execute until it reaches 95%+ confidence. If your intent has holes, Pact finds them before production does.
3. **Connectors** — Integrations written in Pact itself. The protocol is self-referential: connectors are contracts, not plugins.
4. **The Runtime** — A server that runs contracts instead of code. Deterministic execution with evidence at every step.

## Quick Example

```
$ pact new
> "When a Stripe payment succeeds, update the order status and send a confirmation email"
```

Pact doesn't just wire things together. It stops and asks:

```
[gap] What if the payment event is received more than once?
      → Define idempotency strategy: deduplicate by payment_intent_id

[gap] What if the email service is unavailable?
      → Define retry policy: 3 attempts, exponential backoff, then dead-letter

[gap] Who is authorized to trigger this flow?
      → Define access: Stripe webhook signature verification only
```

You answer. Pact seals the contract. Machines execute it with proof.

```
[sealed] stripe-payment-flow v1 — 3 gaps resolved, confidence 98.2%
```

## How It Works

```
Human Intent → Interrogation → Pact Contract → Execution → Evidence
     ↑                                                         |
     └─────────────── audit trail ─────────────────────────────┘
```

1. You state what you want in plain language.
2. The Interrogator detects gaps — missing error handling, undefined permissions, ambiguous logic — and asks you to resolve them.
3. A formal Pact Contract is generated: precise, complete, machine-readable.
4. The Runtime executes the contract deterministically.
5. Every step produces Evidence — cryptographic proof that what happened matches what was intended.

## Why Not n8n / Zapier / Make?

Those tools connect systems. They give you a canvas and say "wire it up."

Pact **understands** what you want, asks what you forgot, and guarantees the result. The difference:

| | Workflow Tools | Pact |
|---|---|---|
| Starting point | Drag nodes onto a canvas | Declare intent in plain language |
| Error handling | You configure it (or you don't) | Interrogated before execution |
| Observability | Logs, maybe | Cryptographic evidence per step |
| Confidence | "It ran" | "It ran correctly, here's proof" |

Workflow tools automate. Pact makes contracts.

## Current Status

The Pact spec v0.1 is complete (dialect, interrogation, connectors, runtime). The parser is implemented and can parse all 15 section types defined in the spec.

**What works today:**

- Hand-written recursive descent parser (TypeScript + Bun, zero external dependencies)
- Lexer with Python-style INDENT/DEDENT tokens
- Full AST covering all section types: `@C` `@I` `@E` `@K` `@X` `@V` `@T` `@F` `@D` `@S` `@P` `@M` `@R` `@L` `@N`
- Type system: `str`, `int`, `dec`, `bool`, `ts`, `dur`, `id`, `any`, `ref[T]`, `list[T]`, `map[K,V]`, `opt[T]`, `enum(a,b,c)`
- Expression parser: comparisons, logic (`&`, `|`, `!`, `?`), quantifiers (`forall`, `exists`), function calls
- Flow parser: `>>` pipe, `>` then, `|` parallel, `?`/`?!` conditional, `??` match, `*` loop, `@>` delegate, `~>` async, `<>` exchange
- Validation: rejects CRLF, tabs, BOM, duplicate sections, `@R`+`@X` mutual exclusion

## Getting Started

```bash
bun install
bun test                                    # 105 tests
bun run src/index.ts tests/fixtures/simple.pact  # parse a .pact file
```

**As a library:**

```ts
import { parse } from "./src/index";

const ast = parse(`pact v1

@C my.service 1.0.0
  domain example
  author me
  created 2026-03-14T00:00:00Z

@I
  natural "Do something useful"
  goal result.success
  timeout 10s
`);

console.log(ast.sections.map(s => s.kind));
// ["ContractSection", "IntentSection"]
```

Pact is in active development. Follow this repository for updates.

## License

MIT

## Origin

Pact was born from a simple question: what happens when the human intermediary leaves the room — and what does it mean to program when the machine already knows how to execute?

The answer wasn't another framework. It was a protocol — one that treats ambiguity as a defect and evidence as a requirement.
