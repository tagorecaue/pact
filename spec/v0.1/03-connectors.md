# 03 - Connectors

**Status:** Draft

## 1. Overview

Connectors are Pact contracts that describe how to interact with external services. They follow the same structure, interrogation, sealing, and evidence requirements as any other Pact contract. A Stripe connector is not a plugin or an SDK wrapper -- it is a contract.

This design is self-referential: Pact describes Pact. The language that expresses business rules ("charge the customer") is the same language that defines how to talk to the Stripe API. There is no abstraction boundary between "business logic" and "integration code."

The architecture has exactly two layers:

- **Primitives** (Layer 1): A small set of built-in operations implemented as code. They bridge the gap between the declarative world (Pact) and the physical world (network sockets, disk, processes). There are approximately six primitives, and they are the ONLY code in the connector system.
- **Connector contracts** (Layer 2): Everything else. Hundreds of connectors -- Stripe, Slack, PostgreSQL, Resend, S3 -- all written as Pact contracts that compose on top of primitives.

A connector is a map that translates intents (`create_charge`) into primitive calls (HTTP POST with specific parameters). The primitive is the muscle. The connector is the brain.

## 2. Primitives

### 2.1 Why Primitives Must Be Code

Pact is declarative. It describes WHAT to do, not HOW to do it. But at some point, something must open a TCP socket, send bytes over the wire, and interpret the response. That is physical -- it cannot be declared, it must be executed.

Primitives are the bridge between the declarative world and the physical world. They are implemented in the runtime's host language and are the only code in the connector system.

### 2.2 Primitive Catalog

| Primitive | Purpose | Connectors That Depend on It |
|-----------|---------|------------------------------|
| `http` | HTTP client (GET, POST, PUT, DELETE, PATCH, HEAD) | Stripe, Resend, Slack, S3, OpenAI, ~90% of all services |
| `sql` | SQL queries (PostgreSQL, SQLite, MySQL) | PostgreSQL, SQLite, MySQL connectors |
| `crypto` | Hashing, HMAC, signing, verification, UUID generation | Used by `http` for AWS auth, webhook signatures |
| `smtp` | Email via SMTP protocol | Generic SMTP connector |
| `ws` | WebSocket (persistent bidirectional connections) | Slack Socket Mode, real-time services |
| `fs` | Filesystem read/write | Local file connectors |

### 2.3 Primitive Interfaces

Each primitive exposes a minimal interface. The `http` primitive is the most important:

```
http.execute(spec) -> result

  spec:
    method    GET | POST | PUT | DELETE | PATCH | HEAD
    url       string
    headers   map[string, string]
    body      string | bytes       (optional)
    timeout   duration
    follow_redirects  boolean
    max_redirects     integer

  result:
    status       integer
    headers      map[string, string]
    body         string | bytes
    duration_ms  integer
```

The `sql` primitive:

```
sql.connect(spec) -> connection
sql.query(connection, sql, params) -> rows
sql.execute(connection, sql, params) -> affected_rows
sql.transaction(connection, steps) -> results
```

The `crypto` primitive:

```
crypto.hmac(algorithm, key, data) -> signature
crypto.hash(algorithm, data) -> hash
crypto.verify_hmac(algorithm, key, data, signature) -> boolean
crypto.uuid_v4() -> string
crypto.uuid_v7() -> string
```

### 2.4 MVP Primitive Set

For the initial release, three primitives cover approximately 95% of use cases:

| Primitive | Coverage |
|-----------|----------|
| `http` | Any REST API, GraphQL, webhooks |
| `sql` | Relational databases |
| `crypto` | Signatures, hashes, tokens |

The `ws`, `smtp`, and `fs` primitives can wait for later phases. The vast majority of integrations are HTTP.

## 3. Connector Contract Structure

A connector contract is written in the `.pact` format and contains the following sections:

### 3.1 Service Metadata

Declares the service identity, authentication method, base URL, rate limits, and retry strategy.

```pact
@S stripe
  auth
    type bearer_token
    header Authorization
    format "Bearer {api_key}"
    env STRIPE_API_KEY
    env_test STRIPE_TEST_KEY
    validate GET /v1/balance
      expect status 200
  base_url "https://api.stripe.com/v1"
  content_type application/x-www-form-urlencoded
  api_version "2024-12-18"
    header Stripe-Version
  rate_limit 100/sec
    burst 200
    per_key true
  retry_on 429 500 502 503
  retry_strategy exponential_backoff
    max 3
    base 1s
    jitter true
  idempotency
    header Idempotency-Key
    generate uuid_v4
```

**Authentication types:**

| Type | Usage |
|------|-------|
| `bearer_token` | Most REST APIs (Stripe, Resend, OpenAI) |
| `api_key` | Header or query parameter key |
| `basic` | Username + password (Base64) |
| `connection_string` | Databases (PostgreSQL, MySQL) |
| `aws_signature_v4` | AWS services (S3, Lambda) |
| `oauth2` | Services requiring OAuth flow |

All credentials MUST be referenced by environment variable. Hardcoded secrets are a validation failure.

### 3.2 Operations

Each operation declares a method, path, intent, input schema, output schema, and error catalog.

```pact
operations
  create_charge
    method POST
    path "/charges"
    intent "Create a new payment charge"
    input
      amount int !            -- required, value in cents
        min 50
      currency str =usd       -- default: usd
        in usd brl eur gbp
      source str !             -- payment method token
      description str ?        -- optional
      metadata map[str,str] ?
      capture bool =true
    output
      id str                   -- charge ID (ch_xxx)
      status enum(succeeded,pending,failed)
      amount int
      currency str
      paid bool
      created ts
    errors
      card_declined
        code "card_declined"
        action notify_user "Payment declined by card"
      insufficient_funds
        code "insufficient_funds"
        action notify_user "Insufficient funds"
      expired_card
        code "expired_card"
        action notify_user "Card expired"
      rate_limited
        http_status 429
        action retry with_backoff
```

**Input field modifiers:**

| Symbol | Meaning |
|--------|---------|
| `!` | Required |
| `?` | Optional |
| `=value` | Default value |
| `min`, `max` | Numeric bounds |
| `in` | Allowed values (enum) |
| `matches` | Format validation (e.g., `rfc5322` for email) |

### 3.3 Retry Strategies

Declared at the service level and overridable per operation.

| Strategy | Behavior |
|----------|----------|
| `exponential_backoff` | Wait `base * 2^attempt`, with optional jitter |
| `linear_backoff` | Wait `base * attempt` |
| `fixed_delay` | Wait `base` between each attempt |
| `header_based` | Read `Retry-After` header from response |

Parameters: `max` (max attempts), `base` (base delay), `jitter` (boolean).

### 3.4 Error Mapping

Every error in the catalog specifies a code (or HTTP status) and an action:

| Action | Behavior |
|--------|----------|
| `abort "message"` | Stop execution, return error to calling contract |
| `retry with_backoff` | Retry using the configured strategy |
| `notify_user "message"` | Surface a user-facing error message |
| `escalate team "message"` | Alert an operations team |
| `log_warning "message"` | Log and continue (non-blocking) |
| `compensate` | Execute a rollback operation |

### 3.5 Local Operations

Some operations do not make network calls. They execute locally within the runtime:

```pact
verify_webhook_signature
  intent "Verify that a webhook came from Stripe"
  local true
  input
    payload str !
    signature str !
    secret str !
    tolerance dur =300s
  output
    valid bool
    event_type str
    event_data map[str,any]
  errors
    signature_invalid
      action abort "Invalid webhook signature -- possible fraud"
    timestamp_expired
      action abort "Webhook expired -- possible replay attack"
```

Local operations use primitives (typically `crypto`) without network I/O.

## 4. Example Connectors

### 4.1 Stripe (Payments)

```pact
pact v1

-- Connector: Stripe payment processing platform
@C stripe-connector 1.0.0
  domain connectors.payments
  author connector:community
  tags payment stripe financial

@I
  natural "Connector for the Stripe payment processing platform"
  goal connector.operational & connector.authenticated

@S stripe
  auth
    type bearer_token
    header Authorization
    format "Bearer {api_key}"
    env STRIPE_API_KEY
    env_test STRIPE_TEST_KEY
    validate GET /v1/balance
      expect status 200
  base_url "https://api.stripe.com/v1"
  content_type application/x-www-form-urlencoded
  api_version "2024-12-18"
    header Stripe-Version
  rate_limit 100/sec
    burst 200
    per_key true
  retry_on 429 500 502 503
  retry_strategy exponential_backoff
    max 3
    base 1s
    jitter true
  idempotency
    header Idempotency-Key
    generate uuid_v4

  operations
    create_charge
      method POST
      path "/charges"
      intent "Create a new payment charge"
      input
        amount int !
          min 50
        currency str =usd
          in usd brl eur gbp
        source str !
        description str ?
        metadata map[str,str] ?
        capture bool =true
      output
        id str
        status enum(succeeded,pending,failed)
        amount int
        currency str
        paid bool
        created ts
      errors
        card_declined
          code "card_declined"
          action notify_user "Payment declined by card"
        insufficient_funds
          code "insufficient_funds"
          action notify_user "Insufficient funds"
        expired_card
          code "expired_card"
          action notify_user "Card expired"
        rate_limited
          http_status 429
          action retry with_backoff

    create_customer
      method POST
      path "/customers"
      intent "Register a new customer on the Stripe platform"
      input
        email str !
          matches rfc5322
        name str ?
        description str ?
        metadata map[str,str] ?
        payment_method str ?
      output
        id str
        email str
        created ts
        livemode bool
      errors
        email_invalid
          code "email_invalid"
          action abort "Invalid email for Stripe"
        rate_limited
          http_status 429
          action retry with_backoff

    create_payment_intent
      method POST
      path "/payment_intents"
      intent "Create a payment intent (modern flow, replaces charges)"
      input
        amount int !
          min 50
        currency str =usd
        customer str ?
        payment_method str ?
        confirm bool =false
        automatic_payment_methods
          enabled bool =true
        metadata map[str,str] ?
      output
        id str
        client_secret str
        status enum(requires_payment_method,requires_confirmation,requires_action,processing,requires_capture,canceled,succeeded)
        amount int
        currency str
      errors
        amount_too_small
          code "amount_too_small"
          action abort "Minimum amount not met"
        rate_limited
          http_status 429
          action retry with_backoff

    verify_webhook_signature
      intent "Verify that a webhook originated from Stripe"
      local true
      input
        payload str !
        signature str !
        secret str !
        tolerance dur =300s
      output
        valid bool
        event_type str
        event_data map[str,any]
      errors
        signature_invalid
          action abort "Invalid webhook signature -- possible fraud"
        timestamp_expired
          action abort "Webhook expired -- possible replay attack"
```

### 4.2 Resend (Email)

```pact
pact v1

-- Connector: Resend email delivery platform
@C resend-connector 1.0.0
  domain connectors.email
  author connector:community
  tags email transactional notification

@I
  natural "Connector for sending transactional emails via Resend"
  goal connector.operational & connector.authenticated

@S resend
  auth
    type bearer_token
    header Authorization
    format "Bearer {api_key}"
    env RESEND_API_KEY
    validate GET /emails
      expect status 200
  base_url "https://api.resend.com"
  content_type application/json
  rate_limit 10/sec
    daily_limit 100
    daily_limit_pro 50000
  retry_on 429 500 502 503
  retry_strategy exponential_backoff
    max 3
    base 2s

  operations
    send_email
      method POST
      path "/emails"
      intent "Send a transactional email"
      input
        from str !
          matches email_with_name
        to list[str] !
          min 1
          max 50
          each matches rfc5322
        subject str !
          max 998
        html str ?
        text str ?
        require html | text
        reply_to str ?
        cc list[str] ?
        bcc list[str] ?
        headers map[str,str] ?
        attachments list[attachment] ?
          attachment
            filename str !
            content str !
            content_type str =application/octet-stream
        tags list[tag] ?
          tag
            name str !
            value str !
      output
        id str
      errors
        validation_error
          http_status 422
          action abort "Invalid email data"
        rate_limited
          http_status 429
          action retry with_backoff
        sender_not_verified
          http_status 403
          action abort "Sender domain not verified in Resend"
        daily_limit_exceeded
          http_status 429
          action escalate ops_team "Daily email limit reached"

    get_email
      method GET
      path "/emails/{email_id}"
      intent "Check the status of a sent email"
      input
        email_id str !
      output
        id str
        from str
        to list[str]
        subject str
        created_at ts
        last_event enum(sent,delivered,bounced,complained,opened,clicked)
      errors
        not_found
          http_status 404
          action abort "Email not found"

    create_batch
      method POST
      path "/emails/batch"
      intent "Send multiple emails at once"
      input
        emails list[send_email.input] !
          min 1
          max 100
      output
        data list[send_email.output]
      errors
        partial_failure
          action log_warning "Some emails in the batch failed"
          return partial_results
```

### 4.3 PostgreSQL (Database)

```pact
pact v1

-- Connector: PostgreSQL relational database
@C postgresql-connector 1.0.0
  domain connectors.database
  author connector:community
  tags database sql relational

@I
  natural "Connector for PostgreSQL relational databases"
  goal connector.operational & connector.connected

@S postgresql
  auth
    type connection_string
    format "postgresql://{user}:{password}@{host}:{port}/{database}"
    env DATABASE_URL
    env_user PGUSER
    env_password PGPASSWORD
    env_host PGHOST =localhost
    env_port PGPORT =5432
    env_database PGDATABASE
    validate SELECT 1
      expect rows 1
  primitive sql
  pool
    min 2
    max 20
    idle_timeout 30s
    acquire_timeout 10s
  ssl
    mode prefer
    env_ca PG_SSL_CA ?

  operations
    query
      intent "Execute a read-only SQL query"
      input
        sql str !
        params list[any] ?
        timeout dur =30s
      output
        rows list[map[str,any]]
        row_count int
        fields list[field_info]
          field_info
            name str
            type str
            nullable bool
      errors
        syntax_error
          code "42601"
          action abort "SQL syntax error"
        relation_not_found
          code "42P01"
          action abort "Table or view not found"
        timeout
          action retry 1 then abort "Query exceeded timeout"
      guard
        deny_raw_input true
        parameterize_always true

    execute
      intent "Execute a write SQL command (INSERT, UPDATE, DELETE)"
      input
        sql str !
        params list[any] ?
        timeout dur =30s
        returning bool =false
      output
        affected_rows int
        returning_rows list[map[str,any]] ?
      errors
        unique_violation
          code "23505"
          action abort "Duplicate record"
        foreign_key_violation
          code "23503"
          action abort "Invalid reference"
        not_null_violation
          code "23502"
          action abort "Required field missing"
        check_violation
          code "23514"
          action abort "Validation constraint violated"

    transaction
      intent "Execute multiple commands in an atomic transaction"
      input
        steps list[transaction_step] !
          transaction_step
            sql str !
            params list[any] ?
        isolation enum(read_committed,repeatable_read,serializable) =read_committed
        timeout dur =60s
      output
        results list[execute.output]
        committed bool
      errors
        serialization_failure
          code "40001"
          action retry 3 with_backoff then abort "Persistent serialization conflict"
        deadlock
          code "40P01"
          action retry 1 then abort "Deadlock detected"
        any_step_fails
          action rollback then propagate

    migrate
      intent "Apply a schema migration"
      input
        up_sql str !
        down_sql str !
        version str !
        description str ?
      output
        applied bool
        duration dur
      errors
        already_applied
          action skip "Migration already applied"
        migration_failed
          action rollback then abort "Migration failed"
      guard
        require_approval admin
        log_complete true
```

### 4.4 Slack (Messaging)

```pact
pact v1

-- Connector: Slack messaging platform
@C slack-connector 1.0.0
  domain connectors.messaging
  author connector:community
  tags messaging slack notification realtime

@I
  natural "Connector for sending messages and notifications via Slack"
  goal connector.operational & connector.authenticated

@S slack
  auth
    type bearer_token
    header Authorization
    format "Bearer {bot_token}"
    env SLACK_BOT_TOKEN
    validate POST /api/auth.test
      expect ok true
  base_url "https://slack.com"
  content_type application/json
  rate_limit
    tier1 1/min
    tier2 20/min
    tier3 50/min
    tier4 100/min
  retry_on 429 500 502 503
  retry_strategy
    on 429 use header Retry-After
    default exponential_backoff max 3 base 1s

  operations
    send_message
      method POST
      path "/api/chat.postMessage"
      intent "Send a message to a channel or user"
      rate_tier tier4
      input
        channel str !
        text str !
        blocks list[block] ?
        thread_ts str ?
        unfurl_links bool =true
        unfurl_media bool =true
      output
        ok bool
        ts str
        channel str
      errors
        channel_not_found
          code "channel_not_found"
          action abort "Slack channel not found"
        not_in_channel
          code "not_in_channel"
          action abort "Bot is not in this channel"
        msg_too_long
          code "msg_too_long"
          action truncate then retry
        rate_limited
          code "rate_limited"
          action wait header:Retry-After then retry

    send_notification
      method POST
      path "/api/chat.postMessage"
      intent "Send a formatted notification with system context"
      rate_tier tier4
      input
        channel str !
        title str !
        body str !
        level enum(info,warning,error,critical) =info
        fields list[field] ?
          field
            label str !
            value str !
            short bool =false
        actions list[action] ?
          action
            text str !
            url str !
            style enum(primary,danger) ?
      output
        ok bool
        ts str
      transform
        blocks from_template "notification"
          title -> header
          body -> section.text
          level -> color_sidebar
          fields -> section.fields
          actions -> actions_block

    create_channel
      method POST
      path "/api/conversations.create"
      intent "Create a new Slack channel"
      rate_tier tier2
      input
        name str !
          matches "[a-z0-9-_]{1,80}"
        is_private bool =false
        description str ?
      output
        ok bool
        channel
          id str
          name str
          created ts
      errors
        name_taken
          code "name_taken"
          action abort "A channel with this name already exists"
        restricted
          code "restricted_action"
          action abort "Insufficient permissions to create channel"

    listen_events
      intent "Receive events from Slack via Socket Mode or Events API"
      mode websocket
      primitive ws
      input
        event_types list[str] !
        socket_mode bool =true
        env_app_token SLACK_APP_TOKEN
      output
        event_type str
        event_data map[str,any]
        team_id str
        event_ts str
      errors
        connection_lost
          action reconnect max 5 backoff exponential
        token_revoked
          action abort "Slack token revoked"
```

## 5. Connector Registry

### 5.1 Concept

The Connector Registry is a public repository of Pact connectors -- the equivalent of a package registry for connectors. Anyone can publish a connector. Any Pact runtime can consume one.

### 5.2 Registry Structure

```
registry.pact.dev/
  connectors/
    stripe-connector/
      1.0.0/
        connector.pact
        metadata.json
        tests/
      1.1.0/
      latest -> 1.1.0
    resend-connector/
    slack-connector/
    ...
  primitives/
    http/
    sql/
    crypto/
  categories/
    payments/
    email/
    messaging/
    storage/
    database/
```

### 5.3 Versioning

Connectors follow Semantic Versioning with connector-specific rules:

| Change Type | Version Bump | Examples |
|-------------|-------------|----------|
| Patch (`1.0.x`) | Typo fixes, improved error messages, new optional errors | Fix description, add `processing_error` to catalog |
| Minor (`1.x.0`) | New operation added, new optional fields in input/output | Add `create_refund` operation, add `metadata` to output |
| Major (`x.0.0`) | Operation removed, required field changed, semantic change | Remove `create_charge`, change `amount` from cents to dollars |

A business contract declaring `#stripe-connector >=1.0.0 <2.0.0` is guaranteed that minor and patch updates will not break its flow.

### 5.4 Validation

Before publishing, the registry validates:

1. **Syntax.** The connector parses without errors.
2. **Completeness.** Every operation has input, output, and at least one handled error.
3. **Consistency.** Referenced types exist, enums are valid.
4. **Testability.** At least one test per operation exists.
5. **Security.** Credentials are referenced by environment variable, never hardcoded.

### 5.5 Quality Scoring

Each connector receives a score from 0 to 100:

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Operation coverage | 25 | Percentage of the API's operations covered |
| Error handling | 25 | Percentage of possible errors catalogued |
| Rate limiting | 15 | Rate limits declared and respected |
| Idempotency | 15 | Write operations have idempotency strategy |
| Tests | 10 | Number and quality of tests |
| Documentation | 10 | Clear intent per operation, examples |

**Score tiers:**

| Score | Badge |
|-------|-------|
| 80+ | `verified` |
| Top 3 in category | `recommended` |
| Maintained by Pact team | `official` |

### 5.6 Community Curation

- Anyone can submit a pull request to improve an existing connector.
- The registry shows a semantic diff between versions: which operations changed, which errors were added or removed.
- Connectors below a quality threshold display a warning to consumers.

## 6. Auto-Discovery and Auto-Update

### 6.1 Auto-Discovery

An LLM reads API documentation (or an OpenAPI spec) and generates a Pact connector.

**Process:**

1. Input: URL of the API documentation or OpenAPI/Swagger spec.
2. LLM extracts: base URL, authentication method, available operations, input/output per operation, error codes, rate limits.
3. LLM generates the connector in Pact format.
4. Validator checks syntax, type consistency, and semantic coherence.
5. If the API has a sandbox, run automated tests against it. Otherwise, generate mocks from the spec and validate format.
6. Human reviews and approves.

**Viability assessment:**

| Capability | Viable Today | Reliability |
|------------|-------------|-------------|
| Generate connector from OpenAPI spec | Yes | 85-90% |
| Generate connector from HTML docs | Partial | 60-75% |
| Detect response divergences passively | Yes | 95%+ |
| Detect API changelogs actively | Partial | Depends on API |
| Auto-correct connector without human | No | <50% |
| Propose correction for human approval | Yes | ~80% |

### 6.2 Auto-Update

**Passive detection.** The runtime monitors responses from external services. When it detects divergence between the expected response (per the connector spec) and the actual response, it generates an alert:

```
DIVERGENCE DETECTED in stripe-connector v1.0.0

Operation: create_charge
Expected (output spec): { id: str, status: enum, amount: int }
Received: { id: str, status: str, amount: int, amount_captured: int, billing_details: {...} }

Differences:
  + amount_captured: new field not in connector spec
  + billing_details: new field not in connector spec
  ~ status: type changed from enum to str (possibly new values)

Impact: LOW (additional fields are ignored by the runtime)
Suggested action: update connector to include new fields

Generate updated connector? [y/n]
```

**Active detection.** A periodic job checks changelogs of known APIs and determines whether changes impact existing connectors. The runtime proposes a patch. The human approves.

### 6.3 The Golden Rule

Auto-update PROPOSES, human APPROVES. No automatic connector update enters production without human review. Trust is built gradually -- first with proposals that are always reviewed, then (if accuracy exceeds 99%) with auto-approval for low-impact changes such as new optional fields.

## 7. Gap Detection in Connectors

The Interrogation Protocol (see `02-interrogation.md`) extends to connectors. The gap detector analyzes how business contracts use connectors and identifies deficiencies at two levels.

### 7.1 Gaps in Connector Usage

These are gaps in business contracts that reference connectors.

**Mandatory error not handled.** A business contract references `stripe.create_charge` but does not handle `card_declined`, `insufficient_funds`, or `expired_card`. The gap detector flags these as critical because the connector's error catalog marks them as common (~3%, ~1%, ~0.5% frequency respectively).

**Missing credential.** The connector requires `STRIPE_API_KEY` but the environment variable is not set. The gap detector reports an error with remediation options (set the variable, configure a vault path, or use test mode).

**Webhook without signature verification.** A contract receives Stripe webhooks but does not call `verify_webhook_signature` as a first step. The gap detector warns that any party who discovers the webhook URL can send fraudulent events.

**Rate limit exceeded by batch.** A contract calls `resend.send_email` inside a loop that may iterate 10,000 times. The connector declares a rate limit of 10/sec and a daily limit of 100 (free tier). The gap detector calculates that this would take 17 minutes and hit the daily limit within the first 10 iterations.

### 7.2 Gaps in the Connector Itself

The gap detector also validates connector contracts against quality criteria.

**Operation without timeout.** An upload operation does not declare a timeout, risking indefinite blocking on large payloads.

**Retryable operation without idempotency.** An operation is retryable (`retry_on` includes 429, 500) but does not define an idempotency strategy. If the request succeeds but the response is lost, the retry will execute the operation again (e.g., sending duplicate emails).

### 7.3 Cross-Connector Gaps

When multiple connectors are used together, the gap detector analyzes the interaction:

```
WARNING: Your flow creates a customer in Stripe and then persists
the stripe_id in PostgreSQL, but there is no handling for the scenario:
  "Stripe creates the customer successfully, but PostgreSQL fails"

Result: customer exists in Stripe but not in the local system.
This customer may be charged but the system has no record of them.

Options:
  A) Add compensation: if persist fails, delete customer from Stripe
  B) Use saga pattern with rollback
  C) Accept temporary inconsistency and reconcile via cron
```

### 7.4 Bilateral Contract Obligations

A Pact connector is a bilateral contract. Both sides have obligations:

**The runtime commits to:**
- Respecting declared rate limits.
- Validating all input before sending.
- Handling every catalogued error.
- Never exposing credentials in evidence or logs.
- Including idempotency keys when available.

**The external service is expected to:**
- Respond in the documented format.
- Return semantically correct HTTP status codes.
- Maintain backward compatibility within the same API version.
- Deliver webhooks with verifiable signatures.

When the service returns something outside the expected spec, the runtime classifies the violation (API evolution, breaking change, transient error), logs it as evidence, and recommends corrective action.
