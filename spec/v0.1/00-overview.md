# Pact Specification v0.1

**Status:** Draft

## Abstract

Pact is not a workflow tool. It is an **intent compiler** -- a protocol where humans declare intent and constraints, AI reasons and generates optimized executable code, and the system replays learned paths at native speed. When execution fails, the AI re-reasons and recompiles. When two Pact servers meet, their AIs negotiate integration semantically and compile the agreement into native code.

The protocol provides a structured dialect for AI-to-AI communication, an interrogation mechanism that enforces completeness before execution, a self-referential connector system for interacting with external services, and a runtime that compiles intent into WASM-sandboxed learned paths with cryptographic evidence of correct execution. This specification defines the syntax, semantics, and operational rules governing the Pact protocol.

## Design Principles

The following principles govern all design decisions within the Pact specification. When principles conflict, earlier entries take precedence.

### 1. Intent Over Instruction

Pact contracts capture what the user wants to achieve, not how to achieve it. The protocol separates the declaration of intent from the mechanics of execution. A well-formed contract should be readable by a human unfamiliar with the underlying systems.

### 2. Evidence Over Trust

Every execution step MUST produce evidence that the outcome matches the stated intent. "It ran successfully" is not acceptable output. The system provides cryptographic proof of what happened, when, and whether it satisfied the contract's constraints.

### 3. Composition Over Integration

Pact contracts compose with other contracts. Complex behavior is expressed by combining smaller, well-defined contracts — not by writing integration logic. A payment flow that sends an email is two contracts composed, not one monolithic procedure.

### 4. Observability as a Right

Every contract execution is fully observable by default. There is no opt-in tracing, no debug mode, no "verbose flag." Evidence emission is a fundamental property of the runtime, not a feature.

### 5. Completeness Before Execution

A contract MUST NOT execute until it meets a defined confidence threshold (default: 95%). The Interrogation Protocol systematically identifies gaps — undefined error handling, missing permissions, ambiguous logic — and requires resolution before sealing. This is the interrogation principle: the system refuses to run what it does not fully understand.

### 6. Self-Reference

Connectors -- the mechanism by which Pact interacts with external systems -- are themselves Pact contracts. The protocol does not distinguish between "core logic" and "integration code." A Stripe connector is a contract. An email connector is a contract. This eliminates an entire class of abstraction leaks.

### 7. Learning Over Repeating

The system reasons once, compiles the result into a learned path, and replays it deterministically for all subsequent invocations. AI is invoked only when reasoning is genuinely needed: on first execution, after failure, or during server-to-server negotiation. Steady-state operation is entirely deterministic with zero AI cost.

### 8. Compilation Over Interpretation

Learned paths are not interpreted at runtime -- they are compiled to WASM and executed natively within a sandbox. This eliminates the overhead of re-parsing contracts, re-resolving templates, and re-planning execution on every request. The contract is the source of truth; the compiled learned path is the executable artifact.

## Architecture

The Pact architecture is a pipeline that transforms human intent into compiled, replayable execution paths. The system reasons once, compiles the result, and replays at native speed until re-reasoning is required.

```
HUMAN (declares intent)
  |
  v
TRANSLATOR (Claude/GPT -- interrogates, generates contract)
  |
  v
CONTRACT (.pact file -- intent + constraints + reasoning space)
  |
  v
EXECUTOR (Qwen local -- reasons within constraints)
  |
  |-- generates optimized code
  |-- compiles to WASM
  +-- saves as learned path
  |
  v
RUNTIME (executes learned paths -- deterministic, fast, free)
  |
  v
EVIDENCE (auditable proof of what happened)
  |
  v
HUMAN (inspects via dashboard)
```

**Human.** The origin of intent. Humans describe what they want in natural language. They do not write code, configure workflows, or define execution logic.

**Translator.** A large language model (Claude, GPT, or similar) responsible for interpreting human intent, converting it into the Pact Dialect, and running the Interrogation Protocol. The Translator detects gaps and drives the question-answer cycle until the confidence threshold is met. It produces a sealed contract.

**Contract.** The output of the Translator: a formal Pact file written in the Pact Dialect. A sealed contract is immutable and contains all information required for execution -- intent, constraints, the reasoning space (`@R`), connector bindings, and the evidence schema.

**Executor.** A compact local model (Qwen via Ollama) that reasons within the contract's `@R` constraints on first invocation. The Executor generates optimized TypeScript code, compiles it to WASM, executes it within a sandbox, and saves the result as a learned path (`@L`). On subsequent invocations, the Executor is not involved -- the learned path replays directly.

**Runtime.** The deterministic execution environment. It replays compiled learned paths at native speed, enforces the WASM sandbox, manages the lifecycle of learned paths (invalidation, recompilation), and handles server-to-server negotiation. The runtime produces no AI calls during steady-state operation.

**Evidence.** A structured, cryptographically signed record produced at each step of execution. Evidence is the primary output of the runtime. It proves what happened and enables both automated validation and human inspection.

**Dashboard.** A web interface where humans inspect evidence, view active contracts, monitor metrics, and interact with the system through conversational AI.

## Specification Structure

This specification is organized into the following documents:

| Document | Title | Description |
|----------|-------|-------------|
| `01-dialect.md` | Dialect | Syntax, grammar, type system, and encoding rules for the Pact language. |
| `02-interrogation.md` | Interrogation Protocol | Gap detection algorithms, completeness scoring, confidence thresholds, and the question-answer cycle. |
| `03-connectors.md` | Connectors | How Pact contracts interact with external systems. Connector lifecycle, self-referential contract patterns, and the standard connector interface. |
| `04-runtime.md` | Runtime | Contract execution model, evidence emission, validation rules, and the operational semantics of the Executor and Validator. |

## Terminology

The following terms have precise meanings within this specification. Implementations MUST interpret them consistently.

**Pact.** The protocol defined by this specification. Also used informally to refer to the overall system.

**Contract.** A formal, immutable document written in the Pact Dialect that fully describes an intended computation, its constraints, its connector bindings, and the evidence schema required for validation. A contract is the unit of execution.

**Intent.** A human-originated statement of desired outcome. Intent is the input to the Translator and the semantic anchor against which evidence is validated. Intent is expressed in natural language and refined through interrogation.

**Constraint.** A condition that MUST hold during or after execution. Constraints are declared within a contract and verified by the Validator. Examples: idempotency requirements, authorization rules, retry policies, ordering guarantees.

**Evidence.** A structured, cryptographically signed record produced by the Executor at each step of contract execution. Evidence is the primary output of the runtime. It proves what happened and enables the Validator to determine whether the contract was satisfied.

**Gap.** An identified deficiency in a draft contract — a missing constraint, an unhandled error path, an ambiguous reference, or an undefined permission. Gaps are detected by the Interrogation Protocol and MUST be resolved before a contract can be sealed.

**Seal.** The act of finalizing a contract after all gaps have been resolved and the confidence threshold has been met. A sealed contract is immutable. Sealing produces a version identifier and a cryptographic hash of the contract contents.

**Connector.** A Pact contract that defines how the runtime interacts with an external system (e.g., Stripe, SendGrid, PostgreSQL). Connectors are not plugins or adapters — they are contracts, subject to the same interrogation, sealing, and evidence requirements as any other contract.

**Primitive.** A built-in operation provided by the runtime that cannot be decomposed further. Primitives include basic data transformations, control flow constructs, and evidence emission. All higher-level behavior is composed from primitives and connectors.

**Learned Path.** AI-generated execution code, compiled to WASM and cached by the runtime. A learned path is created when the Executor first reasons about a contract. It is replayed deterministically on all subsequent invocations until invalidated by a contract change, execution failure, performance degradation, TTL expiry, or manual relearn command.

**Reasoning Space.** The `@R` section of a contract where the AI Executor has freedom to decide how to execute within the declared constraints. The reasoning space defines what the AI may consider, what strategies are permitted, and what boundaries it must respect. It is the bridge between human intent and machine execution.

**Negotiation.** The server-to-server semantic agreement process where AIs on two Pact servers match offers and needs, propose field mappings and data transformations, and arrive at a bilateral contract. Negotiation is conversational but bounded, and the resulting agreement is compiled into learned paths on both sides.

**WASM Sandbox.** The isolated execution environment in which AI-generated code runs. The sandbox restricts access to a controlled set of Pact primitives (http, sql, crypto, emit, log) and prevents direct access to the filesystem, network, or operating system. Capabilities are granted explicitly per contract.
