# 04 - Runtime

**Status:** Draft

## 1. Overview

The Pact Runtime is a single-process server that executes contracts instead of code. It receives HTTP requests, webhooks, cron triggers, and internal events, resolves which contract should handle each input, executes the steps defined by that contract deterministically, and produces evidence of everything it did.

The runtime has two speeds:

- **Design time.** An LLM helps create, interpret, and refine contracts. Latency is 2-30 seconds. Frequency is dozens per day. Cost is acceptable because it does not scale with request volume.
- **Execution time.** Everything is deterministic. No LLM call on the hot path. Latency is 1-100ms depending on I/O. Frequency is thousands per second. Cost per request is zero for logic (no external API calls for decision-making).

This separation is critical. An incoming HTTP request NEVER waits for an LLM call to be processed. The LLM did its work earlier: it compiled the intent into an executable plan.

## 2. Architecture

### 2.1 Component Diagram

```
                         EXTERNAL WORLD
            +----------+----------+----------+
            | HTTP     | Webhooks | Cron     |
            | Requests |          | Triggers |
            +----+-----+----+----+----+------+
                 |          |          |
                 v          v          v
+---------------------------------------------------------------+
|                      HTTP GATEWAY                              |
|  +----------+ +----------+ +----------+ +------------------+  |
|  | Dynamic  | | Auth     | | Rate     | | Request          |  |
|  | Router   | | Middle-  | | Limiter  | | Normalizer       |  |
|  |          | | ware     | |          | |                  |  |
|  +----+-----+ +----------+ +----------+ +------------------+  |
|       |                                                        |
|       v                                                        |
|  +----------------------------------------------------------+  |
|  |              CONTRACT REGISTRY                            |  |
|  |  +--------+ +--------+ +--------+ +--------+             |  |
|  |  |Contract| |Contract| |Contract| |Contract| ...         |  |
|  |  |   A    | |   B    | |   C    | |   D    |             |  |
|  |  +--------+ +--------+ +--------+ +--------+             |  |
|  |  Route Map: path -> contract_id                           |  |
|  |  Event Map: event_type -> [contract_ids]                  |  |
|  +--------------------------+-------------------------------+  |
|                             |                                  |
|                             v                                  |
|  +----------------------------------------------------------+  |
|  |              INTENT RESOLVER                              |  |
|  |  +-------------+  +----------------+  +-------------+    |  |
|  |  | Pattern     |  | LLM Resolver   |  | Plan        |    |  |
|  |  | Matcher     |  | (ambiguity     |  | Compiler    |    |  |
|  |  | (fast)      |  |  only)         |  |             |    |  |
|  |  +------+------+  +-------+--------+  +------+------+    |  |
|  +---------|-----------------|------------------|------------+  |
|            |                 |                   |              |
|            v                 v                   v              |
|  +----------------------------------------------------------+  |
|  |              EXECUTION ENGINE                             |  |
|  |                                                           |  |
|  |  Step Pipeline (deterministic):                           |  |
|  |  +--------+ +--------+ +--------+ +--------+ +--------+  |  |
|  |  |VALIDATE|>|TRANSFORM|>| STORE  |>|FORWARD |>| NOTIFY |  |  |
|  |  +--------+ +--------+ +--------+ +--------+ +--------+  |  |
|  |                                                           |  |
|  +------+----------+----------+----------+-------------------+  |
|         |          |          |          |                      |
|         v          v          v          v                      |
|  +----------+ +----------+ +----------+ +------------------+   |
|  |DATA STORE| | OUTBOUND | | EVENT    | | SCHEDULER        |   |
|  |SQLite/PG | | HTTP     | | BUS      | | Cron + Delayed   |   |
|  |          | | Client   | | Pub/Sub  | |                  |   |
|  +----------+ +----------+ +----------+ +------------------+   |
|                                                                 |
|  +----------------------------------------------------------+  |
|  |              EVIDENCE STORE                               |  |
|  |  Immutable audit trail of every execution, decision, error|  |
|  +----------------------------------------------------------+  |
+---------------------------------------------------------------+
                 |
                 v
+---------------------------------------------------------------+
|                      DASHBOARD (Web UI)                        |
|  +----------+ +----------+ +----------+ +------------------+  |
|  | Active   | | Recent   | | Metrics  | | LLM Chat         |  |
|  | Contracts| | Execut-  | | & Errors | | (expand system)  |  |
|  |          | | ions     | |          | |                  |  |
|  +----------+ +----------+ +----------+ +------------------+  |
+---------------------------------------------------------------+
```

### 2.2 Component Responsibilities

| Component | Responsibility | Critical |
|-----------|---------------|----------|
| **HTTP Gateway** | Receive requests, normalize headers/body, authenticate, rate-limit | Yes |
| **Contract Registry** | Store loaded contracts, map routes and events to contracts | Yes |
| **Intent Resolver** | Given a request + contract, determine the execution plan | Yes |
| **Execution Engine** | Execute the plan step by step, deterministically | Yes |
| **Data Store** | Persist business data (entities created/updated by contracts) | Yes |
| **Scheduler** | Fire contracts at defined times (cron) or after delays | Yes |
| **Outbound** | Make outbound HTTP requests (webhooks, external APIs) | Yes |
| **Event Bus** | Publish and consume events between contracts (in-process) | Yes |
| **Evidence Store** | Write an immutable audit trail of everything that happened | Yes |
| **Dashboard** | Web interface for humans to inspect and expand the system | No (operational) |

## 3. Request Lifecycle

### 3.1 Step-by-Step Flow

The following describes the lifecycle of an incoming request, using a Stripe webhook as a concrete example.

**Step 1: HTTP Gateway receives the request.**

The gateway normalizes the request into a `RequestEnvelope`:

```
RequestEnvelope:
  id:         "req_7f3a8b2c"
  timestamp:  "2024-11-15T14:32:01Z"
  method:     "POST"
  path:       "/webhook/stripe-payment"
  headers:    { "stripe-signature": "t=1234,v1=abc..." }
  body:       { type: "checkout.session.completed", data: { ... } }
  source_ip:  "54.187.174.169"
```

**Step 2: Contract Registry resolves the route.**

The registry has a route map compiled at startup. This is a direct hash-map lookup -- no LLM involved:

```
registry.resolveRoute("POST", "/webhook/stripe-payment")
  -> { contract_id: "contract_stripe_payment_v3", match_type: "exact" }
```

**Step 3: Intent Resolver compiles the execution plan.**

If the contract has pre-compiled `steps`, the resolver does NOT call an LLM. It validates input against the contract's `input.expect` schema, builds the execution pipeline from `steps`, and resolves `{{ }}` template references into a dependency graph.

The compiled plan is a directed acyclic graph (DAG):

```
validate_event      (deps: [])
find_order          (deps: [validate_event])
update_order        (deps: [find_order])
record_payment      (deps: [find_order])
send_confirmation   (deps: [update_order])       -- parallel with notify_erp
notify_erp          (deps: [update_order])       -- parallel with send_confirmation
```

Steps with satisfied dependencies and no ordering constraint between them MAY execute in parallel.

**Step 4: Execution Engine executes the plan.**

The engine topologically sorts the DAG and processes each step:

1. Wait for dependencies.
2. If any dependency failed and the step does not tolerate failure, skip it.
3. Resolve `{{ }}` templates using the execution context and prior results.
4. Execute the action (validate, query, insert, update, http_post, etc.).
5. Record evidence: contract ID, request ID, step ID, action, input, output, duration, timestamp.
6. Store the result for dependent steps to reference.

**Step 5: Response returns to the caller.**

The response defined in the contract is sent. For the Stripe webhook example: `200 { received: true }` in approximately 50ms.

Steps that may be slow (email, ERP notification) can be marked `async: true`, executing after the response has been sent.

### 3.2 Sequence Diagram

```
Caller        Gateway       Registry     Resolver     Engine       Store        Outbound
  |               |              |            |           |            |             |
  |--POST-------->|              |            |           |            |             |
  |               |--resolve---->|            |           |            |             |
  |               |<-contract----|            |           |            |             |
  |               |------------------compile->|           |            |             |
  |               |<-----------------plan-----|           |            |             |
  |               |------------------------------execute->|            |             |
  |               |              |            |           |--validate--|             |
  |               |              |            |           |--query---->|             |
  |               |              |            |           |<--rows-----|             |
  |               |              |            |           |--update--->|             |
  |               |              |            |           |--insert--->|             |
  |               |              |            |           |----------------http_post>|
  |               |              |            |           |            |  (email)    |
  |               |              |            |           |----------------http_post>|
  |               |              |            |           |            |  (notify)   |
  |<--200---------|              |            |           |            |             |
```

## 4. Execution Model

### 4.1 Learned Path Execution Cycle

The runtime operates on a principle of reason-once, replay-forever. When a contract arrives, the runtime first checks whether a valid learned path exists. If it does, execution follows the compiled code directly, with no AI involvement. If it does not, the AI Executor reasons within the contract's constraints, generates code, compiles it, and saves the result as a learned path for future invocations.

```
Contract arrives
  -> Learned path exists and valid?
    YES -> Replay compiled code (WASM/TS) -- fast, free, deterministic
    NO  -> AI Executor (Qwen via Ollama) reasons within @R constraints
           -> Generates optimized TypeScript code
           -> Compiles to WASM (sandboxed)
           -> Executes
           -> On success: saves as @L (learned path)
           -> On failure: logs evidence, notifies, re-reasons
```

The first invocation of a contract incurs AI latency (typically 2-30 seconds). Every subsequent invocation replays the learned path at native speed (1-100ms depending on I/O). The cost of AI reasoning is amortized across all future executions.

### 4.2 WASM Sandbox

All AI-generated code runs inside a WASM sandbox. The sandbox enforces strict isolation: generated code cannot access the filesystem, the network, or the operating system directly. Instead, the runtime grants a controlled set of Pact primitives that the generated code may invoke.

Available primitives within the sandbox:

| Primitive | Purpose |
|-----------|---------|
| `http` | Make outbound HTTP requests to declared endpoints |
| `sql` | Execute queries against the data store |
| `crypto` | Hash, sign, and verify data |
| `emit` | Publish events to the event bus |
| `log` | Write structured log entries |

Capabilities are granted explicitly per contract. A contract that does not declare network access cannot invoke the `http` primitive, even if the generated code attempts to do so. This ensures that AI-generated code operates within the boundaries the contract author intended.

### 4.3 Learned Path Invalidation

A learned path remains valid until one of the following triggers causes invalidation:

| Trigger | Description |
|---------|-------------|
| Contract changed | Any section of the contract has been modified |
| Connector changed | An external API that the contract depends on has been updated |
| Execution failure | The learned path produced an error at runtime |
| Performance degradation | Latency exceeds 5x the baseline measurement |
| TTL expired | Configurable time-to-live has elapsed (default: 30 days) |
| Manual relearn | Operator runs `pact relearn <contract>` |

When a learned path is invalidated, the next invocation triggers re-reasoning. The AI Executor generates a new execution path, compiles it, and saves it as the replacement learned path. The previous learned path is archived for audit purposes.

### 4.4 LLM vs. Deterministic Boundary

The runtime draws a hard boundary between what requires AI and what is deterministic.

**AI reasoning (design time and first execution):**

| Activity | Description |
|----------|-------------|
| Create contracts | From natural language description via the Translator |
| Interpret ambiguous intent | Ask clarifying questions |
| First-time execution | Reason within @R constraints, generate code |
| Re-reasoning after failure | Analyze failure evidence, generate new path |
| Server-to-server negotiation | Semantic matching of offers and needs |

Acceptable latency: 2-30 seconds. Frequency: dozens per day.

**Deterministic replay (all subsequent executions):**

| Activity | Implementation |
|----------|---------------|
| Learned path replay | Compiled WASM execution |
| Routing | Hash-map lookup (path -> contract_id) |
| Validation | Pre-compiled schema within WASM |
| Transform | Compiled transformation logic |
| Query/Insert/Update | Pre-prepared SQL via sandbox primitive |
| HTTP outbound | Compiled request logic via sandbox primitive |
| Event dispatch | Subscription table lookup |
| Evidence | Insert into audit table |

Latency: 1-100ms depending on I/O. Frequency: thousands per second.

### 4.5 Why This Separation Matters

**Reliability.** An LLM can hallucinate, produce different outputs for the same input, or be slow. If every HTTP request depended on an LLM call, the system would be slow (500ms-5s API latency), expensive (cost per token times request volume), non-deterministic (same input could yield different output), and fragile (if the LLM API goes down, everything stops). Learned paths eliminate all of these problems for steady-state operation.

**The correct analogy:** the AI is the architect who designs the building and writes the construction manual. The WASM runtime is the builder who follows the manual. If the building needs to change, the architect returns. Otherwise, the builder works independently at full speed.

### 4.6 The Contract Compiler

The moment the AI exits the pipeline is when the learned path is compiled:

```
Contract (Pact file)       AI Executor              Learned Path
  with intent and      --> reasons within @R     --> optimized TypeScript
  constraints              constraints,              compiled to WASM,
                           generates code,           cached for replay
                           compiles to WASM

                           AI is used for:
                           - Understanding intent
                           - Choosing execution strategy
                           - Generating optimized code
                           - Handling edge cases
```

After compilation, the learned path is pure: no AI, no ambiguity, no interpretation. It is compiled code that executes deterministically within the WASM sandbox.

## 5. Server-to-Server Protocol

When two Pact servers communicate, their AIs negotiate integration semantically and compile the agreement into native code. This process has four phases.

### 5.1 Discovery

Server A calls `GET /.pact/manifest` on Server B. The manifest endpoint returns a list of contracts with their `@N` (negotiation) sections, which describe what Server B offers and what it accepts. The manifest is a machine-readable summary of the server's capabilities.

```
GET /.pact/manifest HTTP/1.1
Host: server-b.example.com

200 OK
{
  "server": "server-b.example.com",
  "version": "pact/0.1",
  "contracts": [
    {
      "id": "contract_order_api",
      "offers": ["order.create", "order.status", "order.cancel"],
      "accepts": ["payment.confirmed", "inventory.reserved"],
      "schema_url": "/.pact/contracts/contract_order_api"
    }
  ]
}
```

### 5.2 Negotiation

Server A's AI reads Server B's contracts and matches them against its own needs. The negotiation process is semantic: the AIs understand the meaning of fields and operations, not just their names.

1. Server A's AI identifies which of B's offers satisfy A's requirements.
2. A proposes field mappings and data transformations to B via `POST /.pact/negotiate`.
3. B's AI reviews the proposal, checking compatibility against its own constraints.
4. B counter-proposes if adjustments are needed.
5. When both sides agree, a bilateral contract is signed and stored by both servers.

The negotiation is conversational but bounded. Each round produces a structured proposal document. If agreement is not reached within a configurable number of rounds (default: 5), the negotiation fails and both sides are notified.

### 5.3 Compilation

Once agreement is reached, both sides generate learned paths for the integration.

- Each server compiles its portion of the bilateral contract to WASM.
- The integration runs at native speed after the first negotiation.
- No AI involvement is required for subsequent requests between the two servers.

### 5.4 Renegotiation

When one side updates a contract that is part of a bilateral agreement:

1. The changed side notifies the other via `POST /.pact/renegotiate` with the contract ID and a summary of what changed.
2. Only the affected parts of the agreement are renegotiated.
3. Learned paths for the changed portions are invalidated on both sides.
4. Unchanged portions continue to execute at compiled speed.

This ensures that updates are incremental. A minor field addition does not require renegotiating an entire integration from scratch.

## 6. Integration with Ollama/Qwen

The runtime connects to a locally running Ollama instance for AI reasoning. The default executor model is Qwen 3.5 or a similar compact model optimized for code generation and logical reasoning.

### 6.1 When the Model Is Used

The local model is invoked in three specific situations:

| Situation | Description |
|-----------|-------------|
| First-time reasoning | A contract has no learned path. The model reads the contract's `@R` (reasoning space) section, determines an execution strategy within the declared constraints, and generates optimized TypeScript code. |
| Re-reasoning after failure | A learned path has failed or been invalidated. The model analyzes the failure evidence, adjusts its approach, and generates a replacement path. |
| Server-to-server negotiation | Two Pact servers are establishing or renegotiating an integration. The model performs semantic matching of offers and needs. |

### 6.2 When the Model Is NOT Used

The following operations are fully deterministic and never invoke the model:

| Operation | Implementation |
|-----------|---------------|
| Replaying learned paths | Compiled WASM execution, no reasoning required |
| Validation | Schema checks within compiled code |
| Evidence recording | Structured append to the audit store |
| Routing | Hash-map lookup |
| Event dispatch | Subscription table lookup |

This separation ensures that the system's steady-state performance is independent of model availability. If Ollama is offline, all existing learned paths continue to execute normally. Only first-time reasoning and re-reasoning are affected.

### 6.3 Model Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `OLLAMA_URL` | `http://localhost:11434` | Ollama API endpoint |
| `EXECUTOR_MODEL` | `qwen3.5` | Model used for contract reasoning |
| `REASONING_TIMEOUT` | `30s` | Maximum time for a single reasoning step |
| `MAX_RELEARN_ATTEMPTS` | `3` | How many times to re-reason before escalating |

## 7. Data Store

### 7.1 Auto-Schema Creation

The runtime automatically creates database tables from contract definitions. When a contract declares a `store` for inserts, updates, or queries, the runtime ensures the corresponding table exists with the appropriate columns.

A contract that inserts into `orders` with fields `customer_id`, `status`, `total`, and `created_at` causes the runtime to create an `orders` table with those columns, inferring types from the contract's type annotations or from the values provided.

### 7.2 Storage Backends

| Backend | Use Case | Trade-offs |
|---------|----------|------------|
| **SQLite** | Development, small deployments, single-server | Zero configuration, embedded, trivial backup (copy file), ACID. Cannot handle high write concurrency. |
| **PostgreSQL** | Production, scale, replication | Full SQL, concurrent writes, replication. Requires separate process. |

The MVP uses SQLite. PostgreSQL support is an incremental addition for deployments that require higher write concurrency or replication.

### 7.3 Evidence Database

Evidence is stored in a separate database (or separate SQLite file) to avoid performance interference with business data. The `_evidence` table records:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique evidence ID |
| `contract_id` | string | Which contract produced this |
| `request_id` | string | Which request triggered this |
| `step_id` | string | Which step within the contract |
| `action` | string | What action was executed (validate, query, insert, http_post, ...) |
| `input` | json | What was sent to the action |
| `output` | json | What came back |
| `duration_ms` | integer | How long the step took |
| `timestamp` | datetime | When it happened |
| `status` | string | success, failed, skipped |

Evidence records are append-only. Retention is configured per contract.

## 8. Scheduling

### 8.1 Cron Triggers

Contracts with `trigger.type: cron` are loaded into the Scheduler's cron table at startup.

```
Cron Table (loaded from Contract Registry):

  "0 8 * * *"    -> contract_daily_billing       (8am daily)
  "0 7 * * 1"    -> contract_weekly_report        (Mon 7am)
  "*/5 * * * *"  -> contract_health_check         (every 5 min)
  "0 0 1 * *"    -> contract_monthly_invoice       (1st of month)
```

Each entry includes a timezone. The scheduler ticks every 30 seconds, checks which cron expressions match the current time, and for each match creates a virtual `RequestEnvelope` with method `CRON` and path `/_internal/cron/{contract_id}`, which is submitted to the Execution Engine.

### 8.2 Delayed Jobs

The scheduler also maintains a priority queue of delayed jobs -- for example, retries scheduled for 5 minutes in the future. When the job's timestamp arrives, it is dequeued and executed.

### 8.3 Overlap Handling

If a cron job is still executing when the next tick arrives, the scheduler skips the overlapping execution and logs it. Contracts that must not overlap SHOULD declare `overlap: skip` or `overlap: queue`.

### 8.4 Guarantees

| Property | Guarantee |
|----------|-----------|
| Delivery | At-least-once. Contracts SHOULD be idempotent. |
| Locking | Distributed lock per contract ID if running multiple instances. |
| Missed executions | Detected and logged. Optional catch-up execution. |

### 8.5 Failure Notification

If a cron-triggered contract fails, the scheduler records the failure in the evidence store and optionally emits an event (`cron.execution_failed`) that other contracts can react to (e.g., send an alert to Slack).

## 9. Event Bus

### 9.1 Pub/Sub Between Contracts

The Event Bus enables contracts to communicate asynchronously. When a contract emits an event, other contracts that subscribe to that event type are triggered.

```
Subscription Table (loaded from Contract Registry):

  "order.cancelled"     -> [contract_restock, contract_notify_cancel]
  "order.created"       -> [contract_send_confirmation]
  "payment.confirmed"   -> [contract_update_order]
  "product.low_stock"   -> [contract_alert_purchasing]
```

### 9.2 Semantics

| Property | Behavior |
|----------|----------|
| Publication | Synchronous within the process |
| Subscriber isolation | Each subscriber executes in its own fiber. Failure of one subscriber does NOT affect others. |
| Durability | Events are persisted to the `_events` table BEFORE dispatch |
| Retry | Automatic retry for subscribers that fail |

### 9.3 Event Flow

1. Contract A executes `emit_event("order.cancelled", data)`.
2. Event Bus writes the event to the `_events` table.
3. Event Bus resolves subscribers from the subscription table.
4. For each subscriber, the bus creates a virtual `RequestEnvelope` with method `EVENT` and path `/_internal/event/{contract_id}`.
5. The Execution Engine processes each subscriber independently and in parallel.
6. Results are recorded as evidence. Delivery status per subscriber is written back to the event record.

### 9.4 Example

A billing contract cancels an order and emits `order.cancelled`:

- **Restock contract** (subscribed to `order.cancelled`): queries order items, increments product stock, logs the stock movement.
- **Notification contract** (subscribed to `order.cancelled`): finds the order, emails the customer, posts to Slack.

Both execute in parallel. If the notification contract fails (e.g., Slack is down), the restock contract is unaffected.

## 10. Dashboard

### 10.1 Web Interface

The dashboard is a web application served by the same HTTP process as the runtime. It provides inspection and management capabilities.

| Feature | Description |
|---------|-------------|
| **Active Contracts** | List of all loaded contracts with routes, triggers, and versions |
| **Recent Executions** | Timeline of executions with status, duration, and step details |
| **Errors & Alerts** | Failed executions, pending retries, contracts with high error rates |
| **Metrics** | Requests/min, latency p50/p95/p99, throughput per contract |
| **Evidence Explorer** | Navigate the full audit trail |
| **Stores Browser** | View persisted business data |
| **LLM Chat** | Conversational interface to create and modify contracts |

### 10.2 LLM Chat

The chat interface has access to:

1. **Contract Registry** -- knows all existing contracts.
2. **Evidence Store** -- can query execution history.
3. **Data Store schema** -- knows the structure of all stores.
4. **Pact documentation** -- knows the contract syntax.

| Action | Example Prompt | What Happens |
|--------|---------------|--------------|
| Create contract | "Add a GET /api/products endpoint" | Generates Pact contract, user approves, contract is activated |
| Modify contract | "Add minimum stock validation to the checkout flow" | Shows diff of the contract, user approves |
| Diagnose error | "Why did the Stripe webhook fail yesterday at 3pm?" | Queries evidence store, explains the error |
| Generate report | "How many orders were cancelled this week?" | Queries data store, returns result |
| Explain contract | "What does contract_daily_billing do exactly?" | Reads the contract and explains in natural language |

When the user approves a new or modified contract, the runtime hot-reloads it without restart.

## 11. Deployment

### 11.1 Docker Single-Container

The MVP runs as a single Docker container:

```dockerfile
FROM oven/bun:1.1-alpine

WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

COPY . .

VOLUME /app/data
EXPOSE 3000

ENV NODE_ENV=production
ENV DATA_DIR=/app/data
ENV CONTRACTS_DIR=/app/contracts

CMD ["bun", "run", "src/main.ts"]
```

### 11.2 Docker Compose

```yaml
version: "3.8"
services:
  engine:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
      - ./contracts:/app/contracts
    environment:
      - CLAUDE_API_KEY=${CLAUDE_API_KEY}
      - STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}
      - EMAIL_SERVICE_URL=${EMAIL_SERVICE_URL}
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  redis_data:
```

### 11.3 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATA_DIR` | Yes | Path to SQLite data directory |
| `CONTRACTS_DIR` | Yes | Path to contract files (hot-reloadable) |
| `CLAUDE_API_KEY` | For LLM chat | API key for the LLM used in the dashboard chat |
| `PORT` | No (default: 3000) | HTTP port |
| `LOG_LEVEL` | No (default: info) | Logging verbosity |

Service-specific credentials (Stripe, Resend, Slack, etc.) are configured as additional environment variables, referenced by connectors.

### 11.4 Minimum Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 1 core | 2 cores |
| RAM | 256 MB | 512 MB |
| Disk | 100 MB + data | 1 GB + data |
| Runtime | Bun 1.1+ | Bun 1.1+ |

## 12. MVP Scope

### 12.1 Included in v0.1

**Weeks 1-2: Core Engine**

- HTTP Gateway (receive requests, return responses).
- Contract Registry (load Pact files from a directory, map routes).
- Execution Engine (sequential steps: validate, query, insert, update, transform).
- Data Store with SQLite (tables auto-created from contracts).
- Template engine for `{{ }}` references.
- Evidence Store (audit trail of every execution).

**Week 3: Triggers and Communication**

- Scheduler (cron with timezone support).
- Event Bus in-process (emit_event + listeners).
- Outbound HTTP (http_post step with basic retry).
- `for_each` step (iteration over lists).

**Week 4: Dashboard v0**

- Web app served by the same process.
- Active contracts list with details.
- Recent executions timeline with step-level detail.
- Error view.

**Week 5: LLM Chat**

- Claude API integration in the dashboard.
- Context: list of contracts, store schemas, recent evidence.
- Action: generate new contract from description.
- "Activate Contract" button with hot-reload.

**Week 6: Polish and Demo**

- Complete example contracts (mini e-commerce: product CRUD + checkout + payment webhook).
- Automated tests for example contracts.
- Docker single-container working.
- Quick-start documentation.

### 12.2 Excluded from v0.1

| Feature | Reason for Exclusion |
|---------|---------------------|
| Authentication/authorization | A generic middleware is sufficient for MVP |
| Multi-tenancy | Single-tenant is sufficient for demo |
| Replication/clustering | Single-process is sufficient for demo |
| Visual contract editor | YAML via chat is sufficient |
| PostgreSQL backend | SQLite is sufficient for demo |
| Advanced metrics | Simple logs are sufficient |

### 12.3 Project Structure

```
pact-engine/
  package.json
  tsconfig.json
  Dockerfile
  docker-compose.yml

  contracts/                     # Pact files (hot-reloadable)
    examples/
      hello-world.pact
      echo.pact
      ecommerce/
        products.pact
        customers.pact
        checkout.pact
        payment-webhook.pact
        daily-billing.pact

  src/
    main.ts                      # Entrypoint

    gateway/
      server.ts                  # HTTP app setup
      router.ts                  # Dynamic router (contract -> route)
      middleware/
        auth.ts
        rate-limit.ts
        request-normalizer.ts

    registry/
      contract-registry.ts       # Load, validate, index contracts
      contract-loader.ts         # Parse Pact files
      contract-compiler.ts       # Compile contract into executable plan
      contract-watcher.ts        # File watcher for hot-reload

    resolver/
      intent-resolver.ts         # Resolve request -> execution plan
      pattern-matcher.ts         # Deterministic match (fast)
      llm-resolver.ts            # LLM fallback (rare, design-time)

    engine/
      execution-engine.ts        # Execute plan step-by-step
      step-executor.ts           # Step type dispatcher
      steps/
        validate.ts
        transform.ts
        query.ts
        insert.ts
        update.ts
        delete.ts
        http-post.ts
        for-each.ts
        emit-event.ts
        llm-classify.ts          # Optional LLM step

    store/
      data-store.ts              # Abstract interface
      sqlite-store.ts            # SQLite implementation
      schema-manager.ts          # Auto-create/alter tables
      evidence-store.ts          # Append-only audit trail

    scheduler/
      scheduler.ts               # Cron loop + delayed jobs
      cron-parser.ts

    events/
      event-bus.ts               # In-process pub/sub
      event-store.ts             # Event persistence

    outbound/
      http-client.ts             # HTTP client with retry, timeout
      retry-queue.ts             # Retry queue

    template/
      template-engine.ts         # Resolve {{ }} expressions
      filters.ts                 # format_currency, format_date, etc.
      functions.ts               # now, generate_id, etc.

    dashboard/
      api.ts                     # Dashboard API routes
      llm-chat.ts                # Chat endpoint

    shared/
      types.ts
      errors.ts
      logger.ts
      config.ts

  dashboard/                     # Web UI (separate build)
    src/
      routes/
      lib/

  tests/
    engine/
    registry/
    integration/

  data/                          # Runtime data (gitignored)
    engine.db
    evidence.db
```
