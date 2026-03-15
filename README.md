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

```pact
pact v1

@C customer.create 1.0.0
  domain commerce.customers
  author translator:claude-opus@4
  created 2026-03-13T10:00:00Z

@I
  natural "Register new customer with email validation"
  goal customer.persisted
  accept
    "Customer saved with generated ID"
  reject
    "Register without email"
  timeout 10s

@E
  customer
    id id ~
    email str !*^
    name str !
    status enum(active,inactive) =active
    created_at ts ~

@K
  email min 3
    severity fatal
    message "Email is required"

@X
  validate email name
  generate_id
  persist customer
  emit customer.created
```

```
$ pact run customer.create.pact --input '{"email":"a@b.com","name":"Ana"}'

── pact run: customer.create 1.0.0 ──

  ✓ validate [0ms]
  ✓ generate_id [0ms]
  ✓ persist [0ms]
  ✓ emit [0ms]

  status:   success
  evidence: 4 entries recorded
```

## Current Status

182 tests. Zero external dependencies. TypeScript + Bun.

| What | Status |
|------|--------|
| Spec v0.1 (dialect, interrogation, connectors, runtime) | Complete |
| Parser (lexer, AST, 15 section types) | Complete |
| CLI (`pact parse`, `inspect`, `run`, `new`, `serve`, `demo-heal`) | Complete |
| Runtime (execution engine, evidence store, data store) | Complete |
| HTTP Gateway (`pact serve` with auto-routing from `@T`) | Complete |
| HTTP Exchange (`<>` makes real outbound HTTP calls) | Complete |
| LLM Integration (llama.cpp local + Claude/OpenAI API) | Complete |
| AI Executor (`@R` reasoning — LLM generates execution code) | Complete |
| Translator (`pact new` — natural language to .pact contracts) | Complete |
| Self-Healing (schema divergence detection + auto-adaptation) | Complete |
| Server-to-Server Negotiation (`@N`) | Planned |

## Getting Started

### Install

```bash
git clone <repo-url>
cd pact
bun install
```

To install the `pact` CLI command globally:

```bash
./setup.sh --skip-llm    # installs bun + pact command (no LLM)
./setup.sh               # installs everything including Qwen 3.5 for local LLM
```

### CLI Commands

```bash
# Parse a contract and show summary
pact parse contracts/hello.pact

# Inspect a contract in detail
pact inspect contracts/hello.pact

# Inspect with evidence trail
pact inspect --evidence contracts/hello.pact

# Execute a contract
pact run contracts/hello.pact --input '{"name":"Tagore"}'

# Generate a contract from natural language
pact new --desc "REST API to register customers with email validation"
pact new  # interactive mode (prompts for description)

# Start HTTP server (routes from @T triggers)
pact serve contracts/

# Run the self-healing demo
pact demo-heal
```

### HTTP Server

Contracts with `@T http` triggers are automatically exposed as API endpoints:

```pact
@T
  http POST /api/customers
```

```bash
pact serve contracts/ --port 3000

# In another terminal:
curl -X POST http://localhost:3000/api/customers \
  -H "Content-Type: application/json" \
  -d '{"email":"ana@example.com","name":"Ana"}'

# Built-in endpoints:
curl http://localhost:3000/.pact/health
curl http://localhost:3000/.pact/contracts
```

### AI Reasoning

Contracts can use `@R` (reasoning) instead of `@X` (fixed execution). The LLM decides how to execute:

```pact
@R
  objective "Sync customers between systems with minimal data loss"
  strategy
    prefer batch_over_individual when count > 50
  freedom
    choose_order true
    choose_method true
  locked
    never modify_source_data
    always validate_before_write
```

```bash
# With API key (Claude or OpenAI)
export ANTHROPIC_API_KEY="sk-..."
pact run contracts/greeting.reason.pact --input '{"name":"Tagore"}'

# Or with local LLM (after ./setup.sh with model)
pact run contracts/greeting.reason.pact --input '{"name":"Tagore"}'
```

### Self-Healing Demo

Pact detects when an external API changes its response schema and adapts:

```bash
pact demo-heal
```

This starts a mock server, executes a contract against schema v1, switches to v2 (fields renamed/added), detects divergences, and — if an LLM is configured — auto-generates the adaptation.

```
[4/6] Switching mock server to schema v2...
      Changes: price -> price_cents, in_stock -> available, +currency

[6/6] Divergence Report:
      [HIGH] REMOVED: "price" (was number)
      [HIGH] REMOVED: "in_stock" (was boolean)
      [low]  ADDED:   "price_cents" (type: number)
      [low]  ADDED:   "currency" (type: string)
      [low]  ADDED:   "available" (type: boolean)
```

### Contract Generation

`pact new` generates complete `.pact` contracts from natural language descriptions using LLM:

```bash
# Non-interactive (pass description directly)
pact new --desc "REST API to register customers with email validation and welcome email"

# Interactive (prompts for description)
pact new

# Custom output directory
pact new --desc "inventory tracker" --output-dir ./my-contracts
```

The generator:
1. Sends a detailed prompt with the full Pact dialect reference to the LLM
2. Extracts and validates the generated `.pact` contract
3. Detects gaps via a second LLM pass (missing error handling, security, edge cases)
4. Produces deterministic recommendations by analyzing the AST (missing sections, fields, modifiers)
5. Saves the contract to the output directory

### LLM Configuration

Pact supports multiple LLM backends. Set one of these:

| Provider | Setup |
|----------|-------|
| **Claude (Anthropic)** | `export ANTHROPIC_API_KEY="sk-..."` |
| **OpenAI** | `export OPENAI_API_KEY="sk-..."` |
| **Local (llama.cpp)** | `./setup.sh --model tiny` (or small/medium/large) |

Or configure in `pact.config.json`:

```json
{
  "llm": {
    "provider": "anthropic",
    "apiKeyEnv": "ANTHROPIC_API_KEY",
    "model": "claude-sonnet-4-20250514"
  }
}
```

### Running Tests

```bash
bun test              # Run all 147 tests
bun test tests/lexer  # Run specific test file
```

### Project Structure

```
src/
  index.ts                  # Public API: parse() + runtime exports
  cli.ts                    # CLI entry point (pact command)
  errors.ts                 # Error types with line:col formatting
  source.ts                 # Source wrapper for lexer
  lexer/
    tokens.ts               # Token types and keywords
    lexer.ts                # Lexer: source → tokens (INDENT/DEDENT)
  parser/
    ast.ts                  # All AST node types
    parser.ts               # Parser: tokens → PactFile (15 sections)
    types.ts                # Type expression parser
    expressions.ts          # Expression parser
    flow.ts                 # Flow expression parser (@X operators)
  runtime/
    registry.ts             # Contract registry (load, index, resolve)
    engine.ts               # Execution engine (deterministic @X)
    evidence.ts             # Evidence store (SQLite audit trail)
    store.ts                # Data store (SQLite, auto-schema from @E)
    server.ts               # HTTP server (Bun.serve, auto-routing)
    http-client.ts          # HTTP client with retry
    llm.ts                  # LLM providers (local + API)
    ai-executor.ts          # AI executor for @R contracts
    translator.ts           # Contract generator (natural language -> .pact)
    divergence.ts           # Schema divergence detector
    self-healer.ts          # LLM-based self-healing
    mock-server.ts          # Mock API for demos
contracts/                  # Example .pact contracts
tests/                      # Test suites
spec/                       # Pact spec v0.1
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
4. The Runtime executes the contract deterministically (or via AI reasoning).
5. Every step produces Evidence — an auditable trail of what happened.
6. If an external API changes, Pact detects the divergence and self-heals.

## Why Not n8n / Zapier / Make?

Those tools connect systems. They give you a canvas and say "wire it up."

Pact **understands** what you want, asks what you forgot, and guarantees the result:

| | Workflow Tools | Pact |
|---|---|---|
| Starting point | Drag nodes onto a canvas | Declare intent in plain language |
| Error handling | You configure it (or you don't) | Interrogated before execution |
| Observability | Logs, maybe | Evidence trail per step |
| API breaks | You find out in production | Pact detects and self-heals |
| AI integration | Separate service | Built-in reasoning engine |

## License

MIT

## Origin

Pact was born from a simple question: what happens when the human intermediary leaves the room — and what does it mean to program when the machine already knows how to execute?

The answer wasn't another framework. It was a protocol — one that treats ambiguity as a defect and evidence as a requirement.
