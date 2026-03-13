# Pact Dialect Specification

**Status:** Draft
**Version:** 0.1

This document defines the syntax, grammar, type system, and encoding rules for the Pact language. It is the normative reference for parser implementations. Where examples and rules conflict, rules take precedence.

---

## 1. File Format

### 1.1 Extension and Encoding

| Property | Value |
|----------|-------|
| File extension | `.pact` |
| Project directory | `.pact/` |
| Encoding | UTF-8, no BOM |
| Line endings | LF (`\n`). CRLF MUST be rejected. |
| Indentation | 2 spaces per level. Tabs MUST be rejected. |

### 1.2 Version Header

Every `.pact` file MUST begin with a version header as its first non-empty, non-comment line.

```
pact v1
```

The header consists of the literal `pact`, one or more spaces, and a version identifier matching the pattern `v` followed by one or more digits. Parsers MUST reject files with missing or unrecognized version headers.

### 1.3 Comments

Line comments begin with `--` and extend to the end of the line. There are no block comments.

```pact
-- This is a comment
@C order.create 1.0.0  -- This is also a comment
```

### 1.4 Document Structure

A `.pact` file is an ordered sequence of:

1. Version header (required, first line)
2. One or more sections, each introduced by an `@` prefix

Blank lines between sections are permitted and carry no semantic meaning. Blank lines within a section are not permitted between logically grouped entries; parsers MAY accept them but SHOULD emit a warning.

---

## 2. Sections

Each section begins with `@` followed by a single uppercase letter. The section prefix occupies its own line and may carry positional arguments. Section contents are indented by 2 spaces per hierarchy level.

### 2.1 Section Summary

| Prefix | Name | Required | Purpose |
|--------|------|----------|---------|
| `@C` | Contract | Yes | Identity, version, metadata |
| `@I` | Intent | Yes | Natural-language goal and acceptance criteria |
| `@E` | Entities | Yes | Typed data structures |
| `@K` | Constraints | No | Invariants and validation rules |
| `@X` | Execution | Yes | Execution plan using flow operators |
| `@V` | Evidence | No | Post-execution proof (filled by runtime) |
| `@T` | Triggers | No | Activation conditions |
| `@F` | Fallbacks | No | Error recovery strategies |
| `@D` | Dependencies | No | References to other contracts |
| `@S` | Schema | No | Extended data definitions |
| `@P` | Policy | No | Shared constraints applied to multiple contracts |
| `@M` | Mixin | No | Reusable contract fragment (template) |
| `@R` | Reasoning | No | AI decision space with freedoms and locks |
| `@L` | Learned | No | Compiled execution path (AI-generated) |
| `@N` | Negotiate | No | Server-to-server offers, accepts, trust |

Sections MAY appear in any order. If a section prefix appears more than once in the same file, the parser MUST reject the file.

### 2.2 @C -- Contract

Declares the contract's unique identity. The name and version are positional arguments on the section line.

```pact
@C <name> <version>
  domain <domain-id>
  author <identity>
  created <timestamp>
  tags <tag1> <tag2> ...
```

| Field | Type | Position | Required | Description |
|-------|------|----------|----------|-------------|
| name | `id` | arg 1 | Yes | Unique name in dot-notation |
| version | `str` | arg 2 | Yes | Semantic version (SemVer) |
| domain | `id` | indented | Yes | Business domain in dot-notation |
| author | `str` | indented | Yes | Generator identity |
| created | `ts` | indented | Yes | ISO-8601 creation timestamp |
| tags | `list` | indented | No | Classification tags |

Example:

```pact
@C checkout.complete 2.1.0
  domain commerce.orders
  author translator:claude-opus@4
  created 2026-03-13T14:30:00Z
  tags critical payment multi-step
```

### 2.3 @I -- Intent

Declares the intent in natural language and the formal success predicate. This section bridges human meaning and machine verification.

```pact
@I
  natural "<description>"
  goal <formal-predicate>
  accept
    "<criterion>"
    "<criterion>"
  reject
    "<negative-criterion>"
  priority <critical|high|normal|low>
  timeout <duration>
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| natural | `str` | Yes | Natural-language intent (for logs and humans) |
| goal | `expr` | Yes | Formal predicate defining success |
| accept | `list` | No | Decomposed acceptance criteria |
| reject | `list` | No | What MUST NOT happen |
| priority | `enum` | No | Execution priority (default: `normal`) |
| timeout | `dur` | No | Maximum time to completion |

Example:

```pact
@I
  natural "Register new customer with email validation and Stripe sync"
  goal customer.persisted & customer.stripe_synced
  accept
    "Customer saved with generated ID"
    "Stripe customer created and linked"
    "customer.created event emitted"
  reject
    "Register customer with duplicate email"
    "Save customer without Stripe sync"
  priority normal
  timeout 10s
```

### 2.4 @E -- Entities

Declares typed data structures involved in the contract.

```pact
@E
  <entity-name>
    <field> <type> [modifiers]
    <field> <type> [modifiers]
```

**Field modifiers:**

| Modifier | Meaning |
|----------|---------|
| `!` | Required (default for fields without `?`) |
| `?` | Optional |
| `*` | Unique |
| `^` | Indexed |
| `~` | Auto-generated |
| `=<value>` | Default value |

Example:

```pact
@E
  customer
    id id ~
    email str !*^
    name str !
    company str ?
    stripe_id str ~
    status enum(active,inactive,blocked) =active
    created_at ts ~
```

### 2.5 @K -- Constraints

Declares invariants and validation rules. The letter "K" is from "Kontrolle" to avoid collision with `@C`.

```pact
@K
  <constraint-expression>
    severity <fatal|error|warning>
    message "<explanation>"
    enforced <parse|runtime|both>
```

**Constraint predicates:**

| Syntax | Meaning |
|--------|---------|
| `field unique` | Globally unique |
| `field unique within X` | Unique within scope X |
| `field matches <pattern>` | Matches named pattern |
| `field min <n>` | Minimum value or length |
| `field max <n>` | Maximum value or length |
| `field in <a> <b> <c>` | Value in set |
| `field = <value>` | Exact value |
| `field != <value>` | Not equal |
| `field > <value>` | Greater than |
| `field < <value>` | Less than |
| `A & B` | Both true |
| `A \| B` | At least one true |
| `!A` | Negation |
| `A ? B` | If A then B (implication) |
| `count(X) <op> <n>` | Count satisfies operator |
| `forall X in Y : P` | For all X in Y, P holds |
| `exists X in Y : P` | There exists X in Y such that P |

Example:

```pact
@K
  email unique within customers
    severity fatal
    message "Email already registered"
  email matches rfc5322
    severity fatal
    message "Invalid email format"
  order.total > 0
    severity fatal
    message "Order total must be positive"
  forall item in order.items : item.quantity > 0
    severity fatal
    message "Quantity must be positive"
```

### 2.6 @X -- Execution

Declares the execution plan using flow operators. This section may be authored by the Translator or refined by the Executor.

```pact
@X
  <step> [operator] <step> [operator] <step>
```

Steps are identifiers optionally followed by arguments. Operators connect steps into flows. Nesting is expressed through indentation.

Example:

```pact
@X
  validate_input
    >> check_email_format email
    >> check_duplicate email within customers
  ? doc_provided
    validate_doc doc
  <> stripe.customers.create
    send email name
    receive stripe_id
  persist customer
  emit customer.created
    ~> send_welcome_email
    ~> log_audit
```

### 2.7 @V -- Evidence

Filled post-execution by the runtime. Records what happened, with verifiable proof.

```pact
@V
  outcome <success|partial|failure>
  goals
    <predicate> <met|unmet>
      evidence <artifact>
  trace
    <timestamp> <step> <result> [duration]
  effects
    <side-effect>
  hash <sha256-value>
  chain <sha256-previous>
  verified_by <identity>
  verified_at <timestamp>
  summary "<natural-language-summary>"
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| outcome | `enum` | Yes | `success`, `partial`, or `failure` |
| goals | block | Yes | Each goal predicate with met/unmet status |
| trace | block | Yes | Timestamped log of each step |
| effects | block | No | Recorded side effects |
| hash | `str` | Yes | SHA-256 of this evidence block |
| chain | `str` | Yes | SHA-256 of previous evidence (`none` if first) |
| verified_by | `str` | Yes | Identity of the verifier |
| verified_at | `ts` | Yes | Verification timestamp |
| summary | `str` | No | Human-readable summary |

Example:

```pact
@V
  outcome success
  goals
    customer.exists met
      evidence record:cust-a8f3-2026
    customer.valid met
      evidence validation:pass
  trace
    2026-03-13T10:00:00.100Z validate_input ok 12ms
    2026-03-13T10:00:00.115Z check_duplicate ok 45ms
    2026-03-13T10:00:00.162Z create_stripe ok 230ms
    2026-03-13T10:00:00.395Z persist ok 18ms
  hash sha256:7f3a9b2c1d4e5f6a
  chain sha256:none
  verified_by validator:v1.0
  verified_at 2026-03-13T10:00:00.420Z
```

### 2.8 @T -- Triggers

Defines when the contract is activated.

| Trigger type | Syntax | Description |
|-------------|--------|-------------|
| `http` | `http <METHOD> <path>` | HTTP request |
| `cron` | `cron "<expression>"` | Scheduled execution |
| `event` | `event <event-name>` | Internal system event |
| `webhook` | `webhook <provider> <event-type>` | External webhook |
| `manual` | `manual` | Manual activation |
| `queue` | `queue <queue-name>` | Message queue |
| `watch` | `watch <expression>` | Data condition becomes true |
| `delay` | `delay <duration> after <event>` | Timed delay after an event |

**`watch` -- Data-Condition Trigger.**
Activates the contract when a data condition becomes true. The runtime evaluates the expression periodically or reactively (implementation-defined).

**`delay` -- Timed Delay Trigger.**
Activates the contract after a specified duration following an event. Useful for follow-ups, reminders, and grace periods.

Example:

```pact
@T
  http POST /api/customers
    auth bearer_token
    rate_limit 100/min
  webhook stripe payment_intent.succeeded
    secret env:STRIPE_WEBHOOK_SECRET
    verify_signature true
```

Example with data-condition trigger:

```pact
@T
  watch inventory.quantity < inventory.reorder_point
    check_interval 5m
    debounce 15m              -- avoid re-triggering too fast
```

Example with delay trigger:

```pact
@T
  delay 3d after subscription.trial_started
    intent "Send trial expiration reminder"
  delay 14d after subscription.trial_started
    intent "Convert trial or deactivate"
```

### 2.9 @F -- Fallbacks

Defines recovery strategies for failures.

| Strategy | Syntax | Description |
|----------|--------|-------------|
| retry | `retry <n> backoff <type> base <duration>` | Retry with backoff |
| fallback | `fallback <alternative-action>` | Execute alternative |
| compensate | `compensate <steps>` | Undo completed work |
| escalate | `escalate <target> via <channel>` | Escalate to agent |
| abort | `abort "<message>"` | Abort with message |

Backoff types: `exponential`, `linear`, `fixed`.

Example:

```pact
@F
  on stripe_timeout
    retry 3 backoff exponential base 2s
  on stripe_error
    fallback create_pending_payment
    escalate ops_team via slack
  on db_unavailable
    retry 5 backoff linear base 1s
    abort "Database unavailable after 5 attempts"
```

### 2.10 @D -- Dependencies

Declares contracts that this contract depends on.

```pact
@D
  #<contract-name> <version-range>
    bind <local-field> <- <remote-field>
```

Version ranges use comparison operators: `>=`, `>`, `<=`, `<`, `=`. Multiple comparisons on one contract form a conjunction.

Example:

```pact
@D
  #customer.create >=1.0.0 <2.0.0
    bind customer <- customer
  #payment.process >=2.0.0
    bind amount <- order.total
```

### 2.11 @S -- Schema

Defines extended data structures with inline constraints. Useful when `@E` provides a simplified view and a formal schema is needed for validation or database generation.

```pact
@S
  <schema-name>
    <field> <type> [inline-constraints]
```

Inline constraints on schema fields follow the type expression directly:

```pact
@S
  subscription_plan
    id id ~
    name str min 3 max 50 *
    price_cents int > 0
    currency enum(BRL,USD) =BRL
    features list[str] min 1
    trial_days int > 0 =14
    active bool =true
    created_at ts ~
```

### 2.12 @P -- Policy

Defines shared constraints that apply to **all contracts** within a scope (project, domain, or explicit list). Policies are defined in their own `.pact` files and automatically enforced by the runtime.

A policy is not a contract — it has no `@X` or `@I`. It is a set of constraints and defaults injected into matching contracts at parse time.

```pact
pact v1

@P audit.compliance 1.0.0
  domain commerce
  scope domain                  -- applies to all contracts in this domain

  constraints
    log_all_mutations true
    evidence_required true
    max_timeout 60s
    require_auth true

  defaults
    retry 3 backoff exponential base 1s
    timeout 30s
    idempotency by request_id
```

Scope values:

| Scope | Meaning |
|-------|---------|
| `project` | All contracts in the `.pact/` project |
| `domain <name>` | All contracts with matching domain in `@C` |
| `contracts [#a, #b]` | Explicit list of contracts |

When a contract violates a policy constraint, the parser MUST reject the contract with a clear error referencing the policy.

### 2.13 @M -- Mixin

Defines a reusable contract fragment (template) that other contracts can include. Mixins reduce duplication without introducing inheritance — they are textual composition, not subtyping.

A mixin file has the extension `.mixin.pact` and may contain any sections except `@C` (identity is provided by the including contract).

```pact
pact v1

@M crud.base
  description "Standard CRUD operations for any entity"
  params
    entity_name str !
    soft_delete bool =true

@T
  http POST /api/{entity_name}
    auth bearer_token
  http GET /api/{entity_name}/:id
    auth bearer_token
  http PUT /api/{entity_name}/:id
    auth bearer_token
  http DELETE /api/{entity_name}/:id
    auth bearer_token

@K
  {entity_name}.id exists
    severity fatal
    message "{entity_name} not found"

@F
  on not_found
    abort "{entity_name} not found"
  on db_error
    retry 3 backoff exponential base 500ms
```

To include a mixin in a contract, use the `use` directive inside `@C`:

```pact
pact v1

@C product.crud 1.0.0
  domain commerce
  use #crud.base
    entity_name product
    soft_delete true
```

The mixin's sections are merged into the contract. If both the mixin and the contract define the same section (e.g., `@K`), the contract's entries are appended after the mixin's entries. The contract's values always take precedence in case of conflict.

### 2.14 Conditional Composition

Within `@X`, contracts can be delegated conditionally based on runtime context using the `?` operator combined with `@>`:

```pact
@X
  ? customer.country = "BR"
    @> #tax.calculate.brazil
      bind items <- order.items
  ?! customer.country = "US"
    @> #tax.calculate.us
      bind items <- order.items
  ?!
    @> #tax.calculate.generic
      bind items <- order.items
      bind country <- customer.country
```

For multi-branch selection, use `??` (match):

```pact
@X
  ?? payment.method
    "credit_card"
      @> #payment.stripe
        bind amount <- order.total
    "pix"
      @> #payment.pix.brazil
        bind amount <- order.total
    "boleto"
      @> #payment.boleto.brazil
        bind amount <- order.total
        bind due_date <- order.created_at + 3d
    _
      abort "Unsupported payment method"
```

This enables **context-dependent composition** — the same orchestrator contract adapts its behavior by delegating to different specialized contracts based on data at runtime.

### 2.15 @R -- Reasoning

Defines the decision space where the AI executor is free to reason and choose the best execution approach, within the constraints established by `@K`. Unlike `@X`, which prescribes a fixed execution plan authored by a human or translator, `@R` describes an objective and a set of strategic preferences, freedoms, and locked invariants that guide the AI's reasoning process.

```pact
@R
  objective "Sync customers between CRM and ERP with minimal data loss"
  strategy
    prefer batch_over_individual when count > 50
    prefer parallel_over_sequential when independent
    prefer cache when repeated_within 5m
  freedom
    choose_order true           -- AI can reorder steps
    choose_method true          -- AI can choose HTTP vs SDK vs direct DB
    skip_unnecessary true       -- AI can skip steps that don't apply
  locked
    never modify_source_data    -- constraint: read-only on source
    always validate_before_write
    always log_decisions
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| objective | `str` | Yes | Natural-language goal for the reasoning space |
| strategy | block | No | Preferred heuristics expressed as `prefer ... when ...` rules |
| freedom | block | No | Booleans indicating what the AI is allowed to decide |
| locked | block | No | Invariants the AI must never violate (`never`) or always enforce (`always`) |

`@R` and `@X` are **mutually exclusive**. A contract contains EITHER `@X` (a human-designed fixed execution plan) OR `@R` (an AI-designed reasoning space), but never both. If a parser encounters both `@R` and `@X` in the same file, it MUST reject the file with an error. When `@R` is present, the AI executor reasons over the objective, strategies, freedoms, and locks to produce a learned path (`@L`), which serves as the compiled execution that gets replayed on subsequent runs.

### 2.16 @L -- Learned Path

Records the compiled execution path generated by the AI executor after reasoning over an `@R` section. `@L` is NOT written by humans -- it is produced automatically by the runtime and stored for replay, auditing, and performance tracking.

```pact
@L v3
  type compiled
  language typescript
  source .pact/learned/sync_customers_v3.ts
  compiled .pact/learned/sync_customers_v3.wasm
  hash sha256:a1b2c3d4e5f6...
  created_by qwen3.5:4b
  created_at 2026-03-13T10:00:00Z
  reasoning_time 3.2s

  metrics
    executions 2847
    success_rate 99.96
    avg_latency 3ms
    p99_latency 12ms
    last_success 2026-03-13T08:00:00Z
    last_failure 2026-03-10T14:23:00Z
      reason "CRM API timeout"
      resolution "Increased timeout 5s to 15s, added retry with backoff"

  invalidate_on
    contract_changed true
    connector_changed true
    failure true
    ttl 30d
    performance_degraded threshold 5x
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| (version) | `str` | Yes | Positional argument on the section line (e.g., `v3`) |
| type | `str` | Yes | Always `compiled` for learned paths |
| language | `str` | Yes | Implementation language of the generated code |
| source | `str` | Yes | Path to the generated source file |
| compiled | `str` | No | Path to the compiled artifact (e.g., WASM) |
| hash | `str` | Yes | SHA-256 hash of the compiled artifact |
| created_by | `str` | Yes | Identity of the AI model that produced the path |
| created_at | `ts` | Yes | Timestamp of generation |
| reasoning_time | `dur` | Yes | Time spent reasoning before producing this path |
| metrics | block | No | Runtime performance statistics |
| invalidate_on | block | No | Conditions that trigger re-reasoning |

The lifecycle of a learned path is: **contract** (author writes `@R`) -> **reasoning** (AI executor analyzes the objective, strategies, and constraints) -> **learned path** (AI produces `@L` with generated code) -> **replay** (subsequent executions use the compiled path directly) -> **invalidation** (a trigger condition is met, such as contract change, connector change, failure, TTL expiry, or performance degradation) -> **re-reasoning** (AI produces a new `@L` version). Each new version increments the positional version identifier.

### 2.17 @N -- Negotiate

Defines what this server offers to and accepts from other Pact servers. `@N` is the foundation of server-to-server negotiation, enabling automated discovery and agreement between independent systems.

```pact
@N
  offers
    customers
      fields [id, name, email, tax_id, address, created_at]
      operations [read, search]
      rate_limit 100/min
      auth api_key
    orders
      fields [id, customer_id, items, total, status, created_at]
      operations [read, search, webhook]

  accepts
    shipping
      needs [destination_zipcode, package_weight_grams, dimensions]
      provides [tracking_code, estimated_delivery, label_url]

  trust_levels
    locked
      "Never expose raw tax_id to external servers"
      "Never accept writes to customer data from external"
      "Max 1000 requests/min from any partner"
    negotiable
      "Field mapping between systems"
      "Date and currency formats"
      "Retry and timeout policies"
    free
      "Data transfer order"
      "Caching strategy"
      "Compression format"
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| offers | block | No | Resources this server exposes to partners |
| accepts | block | No | Resources this server consumes from partners |
| trust_levels | block | Yes | Three-tier constraint classification |

Within `offers`, each resource declares the `fields` it exposes, the `operations` it supports, an optional `rate_limit`, and an `auth` method. Within `accepts`, each resource declares the fields it `needs` from the partner and what it `provides` in return.

The `trust_levels` block classifies negotiation constraints into three tiers:

- **LOCKED** constraints are the constitution -- the AI MUST never violate them under any circumstances. These are non-negotiable security, privacy, and compliance rules.
- **NEGOTIABLE** constraints are policies the AI can agree to during server-to-server negotiation, but any agreement MUST be reviewed and approved by a human before taking effect.
- **FREE** constraints are operational details the AI decides autonomously without human review. These are implementation choices that do not affect security or correctness.

---

## 3. Type System

### 3.1 Primitive Types

| Type | Description | Example values |
|------|-------------|----------------|
| `str` | UTF-8 string | `"Ana Silva"`, `hello` |
| `int` | 64-bit signed integer | `42`, `-7`, `0` |
| `dec` | Fixed-precision decimal | `199.90`, `0.01` |
| `bool` | Boolean | `true`, `false` |
| `ts` | ISO-8601 timestamp | `2026-03-13T10:00:00Z` |
| `dur` | Duration | `30s`, `5m`, `2h`, `14d` |
| `id` | Unique identifier (UUIDv7) | `cust-a8f3-2026` |
| `any` | Any type (escape hatch) | -- |

### 3.2 Composite Types

| Type | Syntax | Example |
|------|--------|---------|
| Reference | `ref[T]` | `ref[customer]` |
| List | `list[T]` | `list[str]` |
| Map | `map[K,V]` | `map[str,int]` |
| Optional | `opt[T]` | `opt[str]` |
| Enumeration | `enum(a,b,c)` | `enum(active,inactive)` |

### 3.3 Type Composition

Composite types nest without depth limits:

```
list[ref[customer]]           -- list of customer references
map[str, list[int]]           -- map from string to list of integers
opt[list[str]]                -- optional list of strings
list[map[str, opt[dec]]]      -- list of maps from string to optional decimals
```

The parser MUST validate composite types recursively. Unknown types are parse errors.

### 3.4 Literal Typing Rules

Literal values are typed by their lexical form. There is no implicit coercion.

| Lexical form | Inferred type |
|-------------|---------------|
| Integer without decimal point | `int` |
| Number with decimal point | `dec` |
| `true` / `false` | `bool` |
| ISO-8601 with `T` and timezone | `ts` |
| Digits followed by unit (`s`, `m`, `h`, `d`) | `dur` |
| Double-quoted text | `str` |
| Bare token (context-dependent) | `str` or `id` |

`"42"` is a string. `42` is an integer. They are never interchangeable.

### 3.5 Positional Typing

In certain sections, field types are inferred by position:

- `@C` argument 1 is always `id` (contract name)
- `@C` argument 2 is always `str` (SemVer)
- `@E` fields MUST declare types explicitly

### 3.6 Strings

Bare tokens (no spaces, no special characters) do not require quotes. Strings containing spaces MUST be double-quoted. The escape sequence `\"` represents a literal double quote inside a quoted string.

```pact
domain commerce               -- bare token
natural "Create a customer"   -- quoted string
```

---

## 4. Operators

### 4.1 Flow Operators

Used within `@X` to connect execution steps.

| Operator | Name | Semantics |
|----------|------|-----------|
| `>` | then | Execute B after A completes successfully |
| `>>` | pipe | Output of A becomes input of B |
| `\|` | parallel | Execute A and B concurrently; wait for all |
| `?` | if | Execute next block only if condition is true |
| `?!` | else | Else branch of preceding `?` |
| `??` | match | Pattern match / switch on a value |
| `!` | not | Negate a condition (unary) |
| `*` | loop | Repeat while condition holds; `max` is required |
| `=>` | transform | Map/transform data |
| `@>` | delegate | Delegate execution to another contract |
| `~>` | async | Fire and forget (non-blocking) |
| `<>` | exchange | Bidirectional request-response with external system |

### 4.2 Parallel Modifiers

The `|` operator accepts optional join semantics:

| Syntax | Meaning |
|--------|---------|
| `A \| B` | Wait for all (default) |
| `A \|all B` | Wait for all (explicit) |
| `A \|any B` | Wait for first to complete |
| `A \|2of3 B C` | Wait for at least 2 of 3 |

### 4.3 Precedence

From highest to lowest:

| Precedence | Operator | Description |
|-----------|----------|-------------|
| 1 | `!` | Negation (unary) |
| 2 | `>>` | Pipe |
| 3 | `>` | Then (sequence) |
| 4 | `=>` | Transform |
| 5 | `\|` | Parallel |
| 6 | `?` / `??` | Conditional / match |
| 7 | `*` | Loop |
| 8 | `@>` / `~>` / `<>` | Delegation / async / exchange |

Parentheses `( )` override precedence:

```pact
(validate > check_stock) | (validate > check_payment)
```

### 4.4 Operator Details

**`>` -- then.** Sequential execution. B runs only after A succeeds.

```pact
validate > persist > emit
```

**`>>` -- pipe.** Sequential with data passing. Output of A feeds into B.

```pact
fetch_items >> calculate_subtotals >> apply_discounts >> calculate_total
```

**`|` -- parallel.** Concurrent execution. Both branches must complete before the next step.

```pact
reserve_stock | authorize_payment
> create_shipment
```

**`?` -- conditional.** Evaluates a condition and executes the indented block if true. `?!` introduces the else branch.

```pact
? amount > 1000
  require_token > validate_token
?!
  apply_standard_flow
```

**`??` -- match.** Pattern matching on a value. `_` is the default case.

```pact
?? payment.method
  credit_card : process_card >> capture
  pix : generate_pix_code >> await_confirmation
  boleto : generate_boleto ~> send_email
  _ : abort "Unknown payment method"
```

**`*` -- loop.** Repeats while the condition holds. The `max` keyword is mandatory; the parser MUST reject loops without `max`.

```pact
* has_pending_items max 1000
  dequeue_item >> process_item >> mark_done
```

**`@>` -- delegate.** Delegates execution to another contract.

```pact
@> #inventory.reserve
  bind items <- order.items
  timeout 5s
  expect reservation.confirmed
  compensate @> #inventory.release
```

**`~>` -- async.** Sends work to be executed asynchronously. The contract continues immediately.

```pact
emit customer.created
  ~> send_welcome_email
  ~> track_analytics
```

**`<>` -- exchange.** Bidirectional communication with an external system. Requires `send` and `receive` clauses.

```pact
<> stripe.customers.create
  send email name
  receive stripe_customer_id
```

---

## 5. Expressions

### 5.1 Comparison

```
field = value
field != value
field > value
field < value
field >= value
field <= value
```

### 5.2 Logical

```
A & B           -- conjunction
A | B           -- disjunction
!A              -- negation
A ? B           -- implication (if A then B)
```

### 5.3 Quantifiers

```
forall X in Y : P    -- universal quantification
exists X in Y : P    -- existential quantification
count(X) > n         -- counting
```

### 5.4 References

Dot-notation references fields across entities and steps:

```
customer.email
order.items
payment.status
```

Cross-contract references use the `#` prefix:

```
#customer.create
#payment.process >=2.0.0
```

### 5.5 Grouping

Parentheses group sub-expressions:

```
(A & B) | (C & D)
```

---

## 6. Examples

### 6.1 Simple: Customer Registration Endpoint

```pact
pact v1

-- Contract: register a new customer
@C customer.create 1.0.0
  domain commerce.customers
  author translator:claude-opus@4
  created 2026-03-13T10:00:00Z

@I
  natural "Register new customer with email validation and Stripe sync"
  goal customer.persisted & customer.stripe_synced
  accept
    "Customer saved in database with generated ID"
    "Stripe customer created with stripe_id linked"
    "customer.created event emitted"
  reject
    "Register customer with duplicate email"
    "Save customer without Stripe sync"
  priority normal
  timeout 10s

@E
  customer
    id id ~
    email str !*^
    name str !
    company str ?
    doc str ?
    phone str ?
    stripe_id str ~
    status enum(active,inactive,blocked) =active
    created_at ts ~
    updated_at ts ~

@K
  email unique within customers
    severity fatal
    message "Email already registered"
  email matches rfc5322
    severity fatal
    message "Invalid email format"
  name min 2
    severity fatal
    message "Name must be at least 2 characters"
  doc ? doc matches cpf | doc matches cnpj
    severity fatal
    message "Invalid document: must be valid CPF or CNPJ"

@X
  normalize_email email
    >> validate_email_format
    >> check_duplicate email within customers
  ? doc_provided
    validate_doc doc
  <> stripe.customers.create
    send email name
    receive stripe_id
  persist customer
  emit customer.created
    ~> send_welcome_email
    ~> log_audit

@F
  on stripe_timeout
    retry 3 backoff exponential base 2s
  on stripe_error
    abort "Failed to create Stripe customer"
  on db_duplicate
    abort "Email already registered"

@V
  -- filled post-execution by the runtime
```

### 6.2 Medium: Stripe Webhook Handler

```pact
pact v1

@C payment.webhook.stripe 1.0.0
  domain finance.payments
  author translator:claude-opus@4
  created 2026-03-13T11:00:00Z
  tags webhook stripe critical

@T
  webhook stripe payment_intent.succeeded
    verify_signature true
    secret env:STRIPE_WEBHOOK_SECRET
  webhook stripe payment_intent.payment_failed
    verify_signature true
    secret env:STRIPE_WEBHOOK_SECRET

@I
  natural "Process Stripe webhooks to update payment and subscription status"
  goal payment.status_updated & subscription.status_synced
  accept
    "Payment marked as captured when succeeded"
    "Subscription activated on first confirmed payment"
    "Subscription marked past_due when payment fails"
    "Full evidence recorded for audit"
  reject
    "Process webhook with invalid signature"
    "Update payment without verifying existence"
  priority critical
  timeout 5s

@E
  webhook_event
    id str !
    type str !
    data map[str,any] !
    created ts !
    stripe_signature str !
  payment
    id id ~
    subscription_id ref[subscription] !
    stripe_payment_id str !
    amount_cents int !
    currency str !
    status enum(pending,captured,failed,refunded) !
    captured_at ts ?
    failed_at ts ?
    failure_reason str ?
  subscription
    id id !
    status enum(trial,active,past_due,cancelled,expired) !

@K
  webhook_event.stripe_signature valid
    severity fatal
    message "Invalid webhook signature -- possible fraud"
  payment.amount_cents > 0
    severity fatal
    message "Payment amount must be positive"

@X
  verify_stripe_signature webhook_event.stripe_signature
  >> extract_payment_intent webhook_event.data
  >> find_payment_by_stripe_id stripe_payment_id
  ?? webhook_event.type
    payment_intent.succeeded
      update_payment status captured captured_at now
      >> find_subscription payment.subscription_id
      ? subscription.status = trial
        update_subscription status active
      emit payment.captured
        ~> notify_customer "Payment confirmed"
        ~> log_audit
    payment_intent.payment_failed
      update_payment status failed failed_at now failure_reason
      >> find_subscription payment.subscription_id
      update_subscription status past_due
      emit payment.failed
        ~> notify_customer "Payment failed"
        ~> notify_admin "Payment failure"
        ~> log_audit
    _
      log_unknown_event webhook_event.type
      abort "Unsupported event type"

@F
  on payment_not_found
    log_warning "Payment not found for stripe_id"
    abort "Unknown payment"
  on db_error
    retry 3 backoff exponential base 1s

@V
  -- filled post-execution by the runtime
```

### 6.3 Complex: E-commerce Checkout (3 composed contracts)

**Contract A: Inventory Reservation**

```pact
pact v1

@C inventory.reserve 1.0.0
  domain commerce.inventory
  author translator:claude-opus@4
  created 2026-03-13T14:00:00Z
  tags inventory atomic

@I
  natural "Reserve stock for order items"
  goal forall item in items : item.reserved = true
  accept
    "Each item has sufficient stock"
    "Reservation created with 15-minute TTL"
  reject
    "Reserve more than available stock"
    "Create reservation without TTL"
  timeout 5s

@E
  reservation
    id id ~
    order_id ref[order] !
    items list[reservation_item] !
    status enum(active,confirmed,released,expired) =active
    expires_at ts !
    created_at ts ~
  reservation_item
    product_id ref[product] !
    quantity int !
    warehouse_id ref[warehouse] ?

@K
  forall item in items : item.quantity > 0
    severity fatal
    message "Quantity must be positive"
  forall item in items : stock(item.product_id) >= item.quantity
    severity fatal
    message "Insufficient stock"
  reservation.expires_at > now
    severity fatal
    message "Reservation must have future TTL"

@X
  * has_next_item max 500
    check_stock item.product_id item.quantity
    ? stock_sufficient
      reserve_item item.product_id item.quantity
    ?!
      release_all_reserved
      abort "Insufficient stock for {item.product_id}"
  set_expiration reservation 15m
  persist reservation
  emit inventory.reserved

@F
  on stock_changed_during_reserve
    release_all_reserved
    retry 1
  on db_error
    release_all_reserved
    abort "Stock reservation failed"

@V
  -- filled post-execution
```

**Contract B: Payment Processing**

```pact
pact v1

@C payment.process 2.0.0
  domain finance.payments
  author translator:claude-opus@4
  created 2026-03-13T14:00:00Z
  tags payment stripe critical

@I
  natural "Process payment via Stripe for an order"
  goal payment.captured & payment.amount = order.total
  accept
    "Payment authorized and captured for the correct amount"
    "Payment receipt generated"
  reject
    "Capture amount different from order total"
    "Process payment without active stock reservation"
  timeout 30s

@E
  payment
    id id ~
    order_id ref[order] !
    customer_id ref[customer] !
    amount_cents int !
    currency str =BRL
    method enum(credit_card,pix,boleto) !
    stripe_payment_id str ~
    status enum(pending,authorized,captured,failed,refunded) =pending
    captured_at ts ?
    receipt_url str ?

@D
  #inventory.reserve >=1.0.0
    bind reservation.status = active

@K
  amount_cents > 0
    severity fatal
    message "Amount must be positive"
  amount_cents = order.total_cents
    severity fatal
    message "Payment amount must equal order total"

@X
  validate_order_total order
  ?? method
    credit_card
      <> stripe.payment_intents.create
        send amount_cents currency customer.stripe_id
        receive stripe_payment_id client_secret
      >> <> stripe.payment_intents.confirm
        send stripe_payment_id payment_method_id
        receive status
      ? status = succeeded
        update_payment status captured captured_at now
      ?!
        update_payment status failed
        abort "Payment declined by issuer"
    pix
      <> stripe.payment_intents.create
        send amount_cents currency customer.stripe_id method pix
        receive stripe_payment_id pix_qr_code pix_expiration
      emit payment.pix_generated
        ~> notify_customer pix_qr_code pix_expiration
    boleto
      <> stripe.payment_intents.create
        send amount_cents currency customer.stripe_id method boleto
        receive stripe_payment_id boleto_url boleto_expiration
      emit payment.boleto_generated
        ~> notify_customer boleto_url boleto_expiration
  persist payment
  emit payment.processed

@F
  on stripe_timeout
    retry 3 backoff exponential base 2s
  on stripe_card_declined
    abort "Card declined"
  on stripe_insufficient_funds
    abort "Insufficient funds"

@V
  -- filled post-execution
```

**Contract C: Checkout Orchestrator**

```pact
pact v1

@C checkout.complete 1.0.0
  domain commerce.orders
  author translator:claude-opus@4
  created 2026-03-13T14:00:00Z
  tags checkout saga critical multi-step

@I
  natural "Execute full checkout: reserve stock, charge payment, create shipment"
  goal order.status = completed & payment.captured & shipment.created
  accept
    "Stock reserved for all items"
    "Payment captured for the full amount"
    "Shipment created with label and tracking code"
    "Confirmation email sent to customer"
  reject
    "Charge without stock reservation"
    "Create shipment without confirmed payment"
    "Leave pending reservation if payment fails"
  priority critical
  timeout 60s

@E
  order
    id id ~
    customer_id ref[customer] !
    items list[order_item] !
    total_cents int !
    status enum(pending,processing,completed,failed,cancelled) =pending
    payment_id ref[payment] ?
    shipment_id ref[shipment] ?
    created_at ts ~
  order_item
    product_id ref[product] !
    quantity int !
    unit_price_cents int !
  shipment
    id id ~
    order_id ref[order] !
    tracking_code str ?
    label_url str ?
    carrier str ?
    status enum(pending,shipped,delivered) =pending

@D
  #inventory.reserve >=1.0.0
  #payment.process >=2.0.0
  #customer.create >=1.0.0

@K
  order.total_cents > 0
    severity fatal
    message "Order total must be positive"
  forall item in order.items : item.quantity > 0
    severity fatal
    message "Quantity must be positive"
  forall item in order.items : item.unit_price_cents > 0
    severity fatal
    message "Unit price must be positive"
  order.total_cents = sum(item.quantity * item.unit_price_cents for item in order.items)
    severity fatal
    message "Total does not match sum of line items"

@X
  -- Saga: each step has compensation
  update_order status processing
  @> #inventory.reserve
    bind items <- order.items
    timeout 5s
    expect reservation.status = active
    compensate @> #inventory.release
  > @> #payment.process
    bind amount_cents <- order.total_cents
    bind customer_id <- order.customer_id
    bind method <- payment_method
    timeout 30s
    expect payment.status = captured
    compensate @> #payment.refund
  > create_shipment order
    >> generate_label
    >> get_tracking_code
    compensate cancel_shipment
  > update_order status completed
  > persist order
  > emit order.completed
    ~> send_confirmation_email customer order
    ~> notify_warehouse shipment
    ~> track_analytics order

@F
  on inventory_insufficient
    update_order status failed
    abort "Insufficient stock"
  on payment_declined
    @> #inventory.release
      bind reservation_id <- reservation.id
    update_order status failed
    abort "Payment declined"
  on shipment_error
    @> #payment.refund
      bind payment_id <- payment.id
    @> #inventory.release
      bind reservation_id <- reservation.id
    update_order status failed
    escalate ops_team via slack
    abort "Shipment creation failed"

@V
  -- filled post-execution
```

---

## 7. Grammar (EBNF)

The following grammar defines the complete syntax of Pact v1. It uses ISO 14977 EBNF notation with extensions. This grammar is sufficient to implement a PEG or LR(1) parser.

```ebnf
(* ============================================================ *)
(*  Pact v1 -- Complete Formal Grammar                          *)
(*  Notation: Extended EBNF (ISO 14977)                         *)
(* ============================================================ *)

(* --- File Level --- *)

file            = header , newline , { section } , EOF ;

header          = "pact" , ws , version_id ;
version_id      = "v" , digits ;

(* --- Sections --- *)

section         = section_C
                | section_I
                | section_E
                | section_K
                | section_X
                | section_V
                | section_T
                | section_F
                | section_D
                | section_S
                | section_P
                | section_M
                | section_R
                | section_L
                | section_N ;

(* @C -- Contract *)
section_C       = "@C" , ws , identifier , ws , semver , newline ,
                  { indent , c_field , newline } ;
c_field         = "domain" , ws , dotted_id
                | "author" , ws , value
                | "created" , ws , timestamp
                | "tags" , ws , identifier , { ws , identifier }
                | "use" , ws , "#" , dotted_id , newline ,
                  { indent2 , param_assign , newline } ;
param_assign    = identifier , ws , value ;

(* @I -- Intent *)
section_I       = "@I" , newline ,
                  { indent , i_field , newline } ;
i_field         = "natural" , ws , quoted_string
                | "goal" , ws , expression
                | "accept" , newline , { indent2 , quoted_string , newline }
                | "reject" , newline , { indent2 , quoted_string , newline }
                | "priority" , ws , priority_value
                | "timeout" , ws , duration ;
priority_value  = "critical" | "high" | "normal" | "low" ;

(* @E -- Entities *)
section_E       = "@E" , newline ,
                  { indent , entity_def } ;
entity_def      = identifier , newline ,
                  { indent2 , field_def , newline } ;
field_def       = identifier , ws , type_expr , { ws , modifier } ;

(* @K -- Constraints *)
section_K       = "@K" , newline ,
                  { indent , constraint_def } ;
constraint_def  = constraint_expr , newline ,
                  { indent2 , constraint_attr , newline } ;
constraint_expr = expression ;
constraint_attr = "severity" , ws , severity_value
                | "message" , ws , quoted_string
                | "enforced" , ws , enforced_value ;
severity_value  = "fatal" | "error" | "warning" ;
enforced_value  = "parse" | "runtime" | "both" ;

(* @X -- Execution *)
section_X       = "@X" , newline ,
                  { indent , exec_statement , newline } ;
exec_statement  = flow_expr
                | comment ;
flow_expr       = step , { ws , flow_op , ws , step }
                | conditional
                | match_expr
                | loop_expr
                | delegate_expr
                | async_expr
                | exchange_expr
                | transform_expr ;
step            = identifier , { ws , argument }
                | "(" , flow_expr , ")" ;
argument        = identifier | quoted_string | number | dotted_id ;

(* @V -- Evidence *)
section_V       = "@V" , newline ,
                  { indent , v_field , newline } ;
v_field         = "outcome" , ws , outcome_value
                | "goals" , newline , { indent2 , goal_result , newline }
                | "trace" , newline , { indent2 , trace_entry , newline }
                | "effects" , newline , { indent2 , effect_entry , newline }
                | "hash" , ws , hash_value
                | "chain" , ws , hash_value
                | "verified_by" , ws , value
                | "verified_at" , ws , timestamp
                | "summary" , ws , quoted_string ;
outcome_value   = "success" | "partial" | "failure" ;
goal_result     = expression , ws , ( "met" | "unmet" ) ,
                  [ newline , indent3 , "evidence" , ws , value ] ;
trace_entry     = timestamp , ws , identifier , ws ,
                  ( "ok" | "fail" | "skip" ) , [ ws , duration ] ;
effect_entry    = identifier , { ws , argument } ;
hash_value      = "sha256:" , hex_string
                | "none" ;

(* @T -- Triggers *)
section_T       = "@T" , newline ,
                  { indent , trigger_def } ;
trigger_def     = trigger_type , { ws , argument } , newline ,
                  { indent2 , trigger_attr , newline } ;
trigger_type    = "http" | "cron" | "event" | "webhook"
                | "manual" | "queue" | "watch" | "delay" ;
trigger_attr    = identifier , ws , value ;

(* @F -- Fallbacks *)
section_F       = "@F" , newline ,
                  { indent , fallback_def } ;
fallback_def    = "on" , ws , identifier , newline ,
                  { indent2 , fallback_action , newline } ;
fallback_action = "retry" , ws , number , "backoff" , ws ,
                    backoff_type , "base" , ws , duration
                | "fallback" , ws , identifier
                | "compensate" , ws , flow_expr
                | "escalate" , ws , identifier , "via" , ws , identifier
                | "abort" , ws , quoted_string
                | delegate_expr
                | flow_expr ;
backoff_type    = "exponential" | "linear" | "fixed" ;

(* @D -- Dependencies *)
section_D       = "@D" , newline ,
                  { indent , dep_def } ;
dep_def         = "#" , dotted_id , ws , version_range , newline ,
                  { indent2 , bind_def , newline } ;
bind_def        = "bind" , ws , identifier , "<-" , ws , dotted_id ;
version_range   = version_comp , { ws , version_comp } ;
version_comp    = ( ">=" | ">" | "<=" | "<" | "=" ) , semver ;

(* @S -- Schema *)
section_S       = "@S" , newline ,
                  { indent , schema_def } ;
schema_def      = identifier , newline ,
                  { indent2 , schema_field , newline } ;
schema_field    = identifier , [ newline ,
                    { indent3 , schema_field , newline } ]
                | identifier , ws , type_expr ,
                    { ws , ( modifier | inline_constraint ) } ;
inline_constraint = ( ">" | "<" | ">=" | "<=" | "=" | "!=" ) , ws , value
                  | "min" , ws , number
                  | "max" , ws , number
                  | "matches" , ws , identifier
                  | "in" , ws , value , { ws , value } ;

(* @P -- Policy *)
section_P       = "@P" , ws , identifier , ws , semver , newline ,
                  { indent , p_field , newline } ;
p_field         = "domain" , ws , dotted_id
                | "scope" , ws , scope_value
                | "constraints" , newline ,
                    { indent2 , identifier , ws , value , newline }
                | "defaults" , newline ,
                    { indent2 , default_def , newline } ;
scope_value     = "project"
                | "domain" , ws , dotted_id
                | "contracts" , ws , "[" , "#" , dotted_id ,
                    { "," , ws , "#" , dotted_id } , "]" ;
default_def     = identifier , ws , value
                | "retry" , ws , number , "backoff" , ws ,
                    backoff_type , "base" , ws , duration
                | "timeout" , ws , duration ;

(* @M -- Mixin *)
section_M       = "@M" , ws , identifier , newline ,
                  { indent , m_field , newline } ;
m_field         = "description" , ws , quoted_string
                | "params" , newline ,
                    { indent2 , identifier , ws , type_expr ,
                      { ws , modifier } , newline } ;

(* @R -- Reasoning *)
section_R       = "@R" , newline ,
                  { indent , r_field , newline } ;
r_field         = "objective" , ws , quoted_string
                | "strategy" , newline ,
                    { indent2 , strategy_rule , newline }
                | "freedom" , newline ,
                    { indent2 , identifier , ws , value , newline }
                | "locked" , newline ,
                    { indent2 , locked_rule , newline } ;
strategy_rule   = "prefer" , ws , identifier , "when" , ws , expression ;
locked_rule     = "never" , ws , identifier
                | "always" , ws , identifier ;

(* @L -- Learned Path *)
section_L       = "@L" , ws , identifier , newline ,
                  { indent , l_field , newline } ;
l_field         = "type" , ws , value
                | "language" , ws , value
                | "source" , ws , value
                | "compiled" , ws , value
                | "hash" , ws , hash_value
                | "created_by" , ws , value
                | "created_at" , ws , timestamp
                | "reasoning_time" , ws , duration
                | "metrics" , newline ,
                    { indent2 , metric_entry , newline }
                | "invalidate_on" , newline ,
                    { indent2 , invalidate_rule , newline } ;
metric_entry    = identifier , ws , value
                | identifier , newline ,
                    { indent3 , identifier , ws , value , newline } ;
invalidate_rule = identifier , ws , value
                | "performance_degraded" , ws , "threshold" , ws , value ;

(* @N -- Negotiate *)
section_N       = "@N" , newline ,
                  { indent , n_field , newline } ;
n_field         = "offers" , newline ,
                    { indent2 , offer_def , newline }
                | "accepts" , newline ,
                    { indent2 , accept_def , newline }
                | "trust_levels" , newline ,
                    { indent2 , trust_tier , newline } ;
offer_def       = identifier , newline ,
                    { indent3 , offer_attr , newline } ;
offer_attr      = "fields" , ws , "[" , identifier ,
                    { "," , ws , identifier } , "]"
                | "operations" , ws , "[" , identifier ,
                    { "," , ws , identifier } , "]"
                | "rate_limit" , ws , value
                | "auth" , ws , identifier ;
accept_def      = identifier , newline ,
                    { indent3 , accept_attr , newline } ;
accept_attr     = "needs" , ws , "[" , identifier ,
                    { "," , ws , identifier } , "]"
                | "provides" , ws , "[" , identifier ,
                    { "," , ws , identifier } , "]" ;
trust_tier      = ( "locked" | "negotiable" | "free" ) , newline ,
                    { indent3 , quoted_string , newline } ;

(* --- Flow Operators --- *)

flow_op         = ">"       (* then *)
                | ">>"      (* pipe *)
                | "|"       (* parallel *)
                | "=>" ;    (* transform *)

conditional     = "?" , ws , expression , newline ,
                  { indent_next , exec_statement , newline } ,
                  [ "?!" , newline ,
                    { indent_next , exec_statement , newline } ] ;

match_expr      = "??" , ws , dotted_id , newline ,
                  { indent_next , match_arm , newline } ;
match_arm       = ( identifier | "_" ) , [ ws , ":" , ws , flow_expr ] ,
                  newline ,
                  { indent_next2 , exec_statement , newline } ;

loop_expr       = "*" , ws , expression , "max" , ws , number , newline ,
                  { indent_next , exec_statement , newline } ;

delegate_expr   = "@>" , ws , "#" , dotted_id , newline ,
                  { indent_next , delegate_attr , newline } ;
delegate_attr   = "bind" , ws , identifier , "<-" , ws , dotted_id
                | "timeout" , ws , duration
                | "expect" , ws , expression
                | "compensate" , ws , flow_expr ;

async_expr      = "~>" , ws , step ;

exchange_expr   = "<>" , ws , dotted_id , newline ,
                  { indent_next , exchange_attr , newline } ;
exchange_attr   = "send" , ws , identifier , { ws , identifier }
                | "receive" , ws , identifier , { ws , identifier } ;

transform_expr  = dotted_id , ws , "=>" , ws , step ;

(* --- Expressions --- *)

expression      = or_expr ;
or_expr         = and_expr , { ws , "|" , ws , and_expr } ;
and_expr        = not_expr , { ws , "&" , ws , not_expr } ;
not_expr        = "!" , ws , primary_expr
                | primary_expr ;
primary_expr    = comparison
                | quantified
                | "(" , expression , ")"
                | dotted_id ;
comparison      = dotted_id , ws , comp_op , ws , value ;
comp_op         = "=" | "!=" | ">" | "<" | ">=" | "<=" ;
quantified      = ( "forall" | "exists" ) , ws , identifier ,
                  "in" , ws , dotted_id , ":" , ws , expression ;

(* --- Type System --- *)

type_expr       = base_type
                | "ref[" , identifier , "]"
                | "list[" , type_expr , "]"
                | "map[" , type_expr , "," , type_expr , "]"
                | "opt[" , type_expr , "]"
                | "enum(" , identifier , { "," , identifier } , ")" ;
base_type       = "str" | "int" | "dec" | "bool" | "ts"
                | "dur" | "id" | "any" ;

(* --- Field Modifiers --- *)

modifier        = "!"                  (* required *)
                | "?"                  (* optional *)
                | "*"                  (* unique *)
                | "^"                  (* indexed *)
                | "~"                  (* auto-generated *)
                | "=" , value ;        (* default value *)

(* --- Terminals --- *)

identifier      = letter , { letter | digit | "_" | "-" } ;
dotted_id       = identifier , { "." , identifier } ;
semver          = digits , "." , digits , "." , digits ,
                  [ "-" , pre_release ] ;
pre_release     = identifier , { "." , identifier } ;
quoted_string   = '"' , { any_char - '"' | '\\"' } , '"' ;
number          = [ "-" ] , digits , [ "." , digits ] ;
digits          = digit , { digit } ;
hex_string      = hex_digit , { hex_digit } ;
timestamp       = digit , digit , digit , digit , "-" ,
                  digit , digit , "-" , digit , digit ,
                  "T" ,
                  digit , digit , ":" , digit , digit , ":" ,
                  digit , digit ,
                  [ "." , digits ] ,
                  ( "Z" | ( ( "+" | "-" ) ,
                    digit , digit , ":" , digit , digit ) ) ;
duration        = digits , dur_unit ;
dur_unit        = "ms" | "s" | "m" | "h" | "d" | "w" | "y" ;
value           = quoted_string | number | "true" | "false"
                | "null" | "now" | "none" | timestamp
                | duration | identifier | dotted_id ;

comment         = "--" , { any_char } ;
ws              = " " , { " " } ;
newline         = [ comment ] , "\n" ;
indent          = "  " ;               (* 2 spaces -- level 1 *)
indent2         = "    " ;             (* 4 spaces -- level 2 *)
indent3         = "      " ;           (* 6 spaces -- level 3 *)
indent_next     = indent , indent ;    (* relative to parent block *)
indent_next2    = indent_next , indent ;

letter          = "a"-"z" | "A"-"Z" ;
digit           = "0"-"9" ;
hex_digit       = digit | "a"-"f" | "A"-"F" ;
any_char        = ? any Unicode character except newline ? ;

EOF             = ? end of file ? ;
```

---

## 8. Reserved Words

The following identifiers are reserved and MUST NOT be used as entity names, field names, or step names.

**Section prefixes:**

```
@C  @I  @E  @K  @X  @V  @T  @F  @D  @S  @P  @M  @R  @L  @N
```

**Section field keywords:**

```
domain  author  created  tags  use
natural  goal  accept  reject  priority  timeout
outcome  goals  trace  effects  hash  chain
verified_by  verified_at  summary
severity  message  enforced
bind  expect  compensate  send  receive
scope  constraints  defaults  description  params
reasoning  objective  strategy  prefer  freedom  locked
choose_order  choose_method  skip_unnecessary  never  always
learned  compiled  source  metrics  executions  success_rate
avg_latency  invalidate_on  ttl  performance_degraded  threshold
negotiate  offers  accepts  trust_levels  negotiable  free
operations  rate_limit  needs  provides
```

**Type keywords:**

```
str  int  dec  bool  ts  dur  id  any
ref  list  map  opt  enum
```

**Operator keywords:**

```
on  retry  backoff  fallback  escalate  abort  via  base
forall  exists  count  in  within  matches  min  max
```

**Trigger keywords:**

```
http  cron  event  webhook  manual  queue  watch  delay  after
```

**Literal keywords:**

```
true  false  null  now  none
```

**Severity and enforcement values:**

```
fatal  error  warning
parse  runtime  both
```

**Priority values:**

```
critical  high  normal  low
```

**Outcome and result values:**

```
success  partial  failure
met  unmet  ok  fail  skip
```

**Backoff types:**

```
exponential  linear  fixed
```

**Version header:**

```
pact
```
