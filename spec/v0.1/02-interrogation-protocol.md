# 02 - Interrogation and Completeness Protocol

**Status:** Draft
**Pact Specification:** v0.1

---

## 1. Overview

The Interrogation Protocol is the mechanism by which Pact enforces completeness before execution. Before any contract is executed, the protocol systematically detects gaps in the declared intent, scores the contract's completeness, asks the human to fill gaps, and refuses to execute until a confidence threshold is met.

The governing principle:

> A Pact is not sealed until it is complete.

### 1.1 The Problem

When human intent is translated into code, it passes through a chain of translations. Each translation loses information. By the time intent reaches production, as little as 40% of the original meaning may survive -- not because of incompetence, but because of the cumulative entropy of assumptions made at each step.

Pact reduces this chain to two hops:

```
Human intent (100%)
   |
   | Interrogation Protocol: loss < 5%
   v
Sealed contract (95%+)
   |
   | Deterministic execution: loss ~0%
   v
Runtime behavior (95%+)
```

The Interrogation Protocol controls the first hop, transforming an inherently lossy translation into one with bounded, measurable loss.

### 1.2 Why Ask Instead of Assume

The cost of asking is seconds. The cost of assuming wrong is hours to weeks of debugging, corrupted data, regulatory fines, and lost user trust. There is no rational scenario where assuming is preferable to asking -- except when the answer is genuinely obvious, which is what smart defaults (Section 7) handle.

### 1.3 Why Humans Miss Gaps

Humans systematically fail at gap detection due to:

- **Confirmation bias.** The author reads what they wrote and fills gaps unconsciously with what they already know.
- **Happy path bias.** Humans think in success scenarios. Nobody naturally considers "the session expires mid-export, the file corrupts in S3, the cleanup job deletes it before retry."
- **Curse of knowledge.** Domain experts forget that "update the balance" is ambiguous -- which balance? Available? Total? Blocked?
- **Specification fatigue.** The last requirements written in a session are the least detailed -- and frequently the most critical.
- **Speed pressure.** "We'll fix it later." Later arrives as a 3 AM production incident.

### 1.4 Why Automated Detection Works

An automated gap detector does not suffer from any of these biases. It operates with structural advantages: exposure to millions of failure patterns, zero fatigue, no social pressure against asking questions, and the ability to systematically verify hundreds of patterns without losing any.

---

## 2. Gap Taxonomy

A gap is any point where ambiguity can become a bug. This section classifies all categories of gaps that the protocol detects.

### 2.1 Data Gaps

Gaps in the information a contract manipulates.

| Gap | Description |
|-----|-------------|
| Missing required field | Entity has a critical field nobody listed |
| Ambiguous data format | Same data can be interpreted differently (e.g., date format) |
| Unspecified data source | Unclear where the data comes from (cache vs. primary source) |
| Undeclared transformation | Data must be converted and nobody said so (e.g., cents to dollars) |
| Undefined uniqueness | Unclear whether a field must be unique |
| Missing default value | Optional field with no declared default |
| Unspecified encoding | Text may arrive in different encodings |
| Omitted numeric precision | Numbers without defined precision or rounding rules |

### 2.2 Logic Gaps

Gaps in rules and decisions within a contract.

| Gap | Description |
|-----|-------------|
| Condition without else | Only the true branch is defined |
| Loop without termination | Iteration that can run forever |
| Ambiguous operation order | Multiple actions without clear sequencing |
| Contradictory rules | Two rules that cannot coexist |
| Undefined precedence | Multiple applicable rules without priority |
| Implicit race condition | Logic assumes atomicity that does not exist |
| Unverified transitivity | A implies B, B implies C -- but does A imply C? |

### 2.3 Edge Case Gaps

Gaps in behavior outside the happy path.

| Gap | Description |
|-----|-------------|
| Empty or null input | What happens when data is absent |
| Duplicate input (idempotency) | Same operation executed twice |
| Out-of-range input | Value beyond expected bounds |
| Concurrency | Two simultaneous requests on the same entity |
| Timeout | Operation takes longer than expected |
| Overflow | Volume above system capacity |
| Boundary values | Values exactly at the limit of a rule |
| Inconsistent state | Entity in an unforeseen state |

### 2.4 Failure Gaps

Gaps in what happens when things go wrong.

| Gap | Description |
|-----|-------------|
| External service down | Dependency does not respond |
| Undefined retry policy | Whether to retry, how many times, with what interval |
| Unspecified backoff | Retries without increasing delay |
| Partial vs. total rollback | How far to undo on failure |
| Failure notification | Who knows when something breaks |
| Dead letter handling | Where unprocessable messages go |
| Graceful degradation | What the user sees when something fails |
| Cascading failure | One failure causing others in a chain |

### 2.5 Security Gaps

Gaps in protection and access control.

| Gap | Description |
|-----|-------------|
| Undefined permissions | Who can execute the operation |
| Exposed sensitive data | Personal data in logs or responses |
| Unsanitized input | User data used without cleaning |
| Missing rate limiting | No request limits |
| Unspecified authentication | Public or protected endpoint |
| Missing authorization levels | Different access tiers not defined |
| Insufficient auditing | Sensitive actions without logging |
| Unencrypted data in transit | Data traveling without encryption |

### 2.6 Integration Gaps

Gaps in communication with external systems.

| Gap | Description |
|-----|-------------|
| Unpinned API version | External API version not fixed |
| Undelivered webhook | Callback message lost |
| Unguaranteed event ordering | Events arriving out of sequence |
| Inconsistent data across systems | Source of truth not defined |
| Divergent date/time formats | Systems using different formats |
| Unmanaged credentials | API keys hard-coded or without rotation plan |
| Missing circuit breaker | No protection against degraded service |
| Undocumented API contract | Integration based on "it works today" |

### 2.7 Observability Gaps

Gaps in visibility and monitoring.

| Gap | Description |
|-----|-------------|
| Insufficient logging | Critical information not recorded |
| Excessive logging | Sensitive data written to logs |
| Undefined metrics | Unable to measure system health |
| Unconfigured alerts | Failures happen and nobody knows |
| Missing tracing | Cannot trace a request across services |
| Nonexistent dashboards | Data exists but nobody visualizes it |

### 2.8 Business Gaps

Gaps in domain rules that nobody made explicit.

| Gap | Description |
|-----|-------------|
| Omitted regulatory rule | Law or regulation affecting implementation |
| Undocumented exception | Special case that breaks the general rule |
| Missing approval requirement | Action requires someone's sign-off |
| Undefined authority limit | Ceiling on value or permission not specified |
| Business calendar | Dates that affect behavior (e.g., holiday pricing rules) |
| Implicit SLA | Time expectation not documented |
| Multiple currencies/locales | Internationalization not considered |
| Undefined data retention | How long to keep data |

---

## 3. Checklists by Contract Type

For each trigger type a Pact contract can have, a specific checklist of items is verified before the contract is considered complete. Items are classified as BLOCKER (contract cannot execute without an answer) or WARNING (can proceed with a default, but should be confirmed).

### 3.1 HTTP Endpoint

```
[BLOCKER] HTTP method defined? (GET, POST, PUT, PATCH, DELETE)
[BLOCKER] Route/path defined?
[BLOCKER] Authentication specified? (bearer, API key, session, public)
[BLOCKER] Authorization defined? (who can call, with which role)
[BLOCKER] Input payload with schema? (fields, types, required/optional)
[BLOCKER] All required fields listed?
[BLOCKER] Field validation defined? (format, range, regex)
[BLOCKER] Success response defined? (status code, body, headers)
[BLOCKER] Error responses defined? (by type: 400, 401, 403, 404, 500)
[BLOCKER] Rate limiting defined? (requests per minute/hour per IP/user)
[WARNING] Idempotency considered? (duplicate POST, repeated PUT)
[WARNING] Timeout defined? (max processing time)
[WARNING] API versioning considered? (/v1/ in path, header, query param)
[WARNING] Expected Content-Type? (JSON, form-data, multipart)
[WARNING] CORS configured? (allowed origins, methods, headers)
[WARNING] Pagination needed? (limit, offset, cursor)
[WARNING] Sorting/filtering needed?
```

### 3.2 Inbound Webhook

```
[BLOCKER] Sender signature/authentication verified? (HMAC, token, IP allowlist)
[BLOCKER] Idempotency handled? (duplicate events do not cause duplicate effects)
[BLOCKER] Valid vs. invalid payload? (validation schema, expected fields)
[BLOCKER] Expected response to sender? (2xx within how many ms)
[BLOCKER] Sender retry policy known? (count, interval, backoff)
[BLOCKER] Event ordering guaranteed? (or reordering needed)
[BLOCKER] Action on internal failure? (retry, dead letter, notify)
[WARNING] Processing timeout? (synchronous or async)
[WARNING] Payload format documented? (real example from sender)
[WARNING] Sender schema evolution? (what if sender adds fields)
[WARNING] Events to ignore? (irrelevant event types)
[WARNING] Payload logging policy? (log or not, sensitive data concerns)
```

### 3.3 Cron / Scheduled Job

```
[BLOCKER] Timezone specified? (UTC, user timezone, fixed)
[BLOCKER] Cron expression or interval defined?
[BLOCKER] Overlap behavior defined? (skip, queue, kill previous)
[BLOCKER] Data window defined? (last 24h, since last run, all)
[BLOCKER] Execution timeout? (max time before considered stuck)
[BLOCKER] Failure notification defined? (who, how, when)
[BLOCKER] Idempotency guaranteed? (running twice produces same result)
[WARNING] Distributed lock needed? (multiple server instances)
[WARNING] Expected data volume? (100 records vs. 10 million)
[WARNING] Maintenance window? (deploy during cron execution)
[WARNING] Execution history? (retain logs per run)
[WARNING] Catch-up mechanism? (server was down 2h -- run backlog?)
```

### 3.4 External Service Integration

```
[BLOCKER] Service URL/endpoint documented?
[BLOCKER] Credentials/authentication defined? (API key, OAuth, basic auth)
[BLOCKER] Call timeout defined? (seconds to wait)
[BLOCKER] Retry policy defined? (count, interval)
[BLOCKER] Circuit breaker configured? (after X failures, stop for Y seconds)
[BLOCKER] Fallback defined? (what to do if service unavailable)
[BLOCKER] Data formats specified? (request and response schemas)
[BLOCKER] External API version pinned?
[WARNING] External rate limits respected? (do not exceed quota)
[WARNING] Credential rotation plan? (when key expires)
[WARNING] Sandbox vs. production? (correct environment configured)
[WARNING] External service SLA known? (uptime, expected latency)
[WARNING] Sensitive data in calls? (PII, tokens, passwords)
[WARNING] Unexpected response handling? (HTML when expecting JSON, new status codes)
```

### 3.5 CRUD Operations

```
[BLOCKER] Uniqueness validation? (field X must be unique)
[BLOCKER] Referential integrity? (FK exists in referenced table)
[BLOCKER] Soft delete or hard delete?
[BLOCKER] Change history? (audit trail of modifications)
[BLOCKER] Per-operation permissions? (who can create, read, update, delete)
[BLOCKER] Sensitive data identified? (PII, financial, medical)
[WARNING] Required indexes? (frequently searched fields)
[WARNING] Deletion cascade? (deleting parent deletes children?)
[WARNING] Maximum field sizes? (unbounded text? unlimited file size?)
[WARNING] Per-field format validation? (valid email, valid phone)
[WARNING] Default values for optional fields?
[WARNING] Update conflict handling? (optimistic locking, last-write-wins)
```

### 3.6 Notifications

```
[BLOCKER] Channel defined? (email, SMS, push, webhook, Slack, in-app)
[BLOCKER] Message template defined? (text, variables, formatting)
[BLOCKER] Recipient defined? (specific user, group, all)
[BLOCKER] Action on send failure? (retry, fallback channel, ignore)
[WARNING] Per-recipient rate limiting? (max N notifications per hour)
[WARNING] Opt-out/unsubscribe? (user can disable)
[WARNING] Notification priority? (urgent vs. informational)
[WARNING] Message language? (fixed or locale-based)
[WARNING] Scheduling? (send now or at specific time)
[WARNING] Sensitive data in content? (do not send passwords via email)
[WARNING] Read confirmation needed? (open tracking)
[WARNING] Fallback channel? (email fails, try SMS)
```

---

## 4. Completeness Score

The completeness score is a number from 0 to 100 representing how complete and safe a contract is for execution. It is the central metric of the Interrogation Protocol.

### 4.1 Gap Classifications

Each identified gap receives one of four classifications:

| Classification | Weight | Meaning |
|---|---|---|
| **BLOCKER** | 0 (zeroes the item) | Contract MUST NOT execute without a human answer |
| **WARNING** | 0.5 (half weight) | Can assume a default, but should be confirmed |
| **INFO** | 1.0 (full weight) | Covered; the decision taken is recorded |
| **N/A** | Excluded from calculation | Does not apply to this contract type |

### 4.2 Scoring Formula

```
For each applicable checklist item (not N/A):
  - If BLOCKER:  contribution = 0
  - If WARNING:  contribution = item_weight * 0.5
  - If INFO:     contribution = item_weight * 1.0

Score = (sum_of_contributions / sum_of_total_weights) * 100
```

Category weights adjust the relative importance of gaps:

| Category | Weight | Rationale |
|---|---|---|
| Security | 3x | Irreversible impact, potential legal consequences |
| Failure / Rollback | 2x | No failure handling means production halts |
| Data (schema / validation) | 2x | Corrupted data is hard to clean |
| Logic (flow / conditions) | 2x | Logic bugs affect every request |
| Edge Cases | 1.5x | Affects a subset of requests |
| Integration | 1.5x | Depends on external factors |
| Observability | 1x | Important but does not block execution |
| Business | 1x to 3x | Depends on domain and regulatory environment |

### 4.3 Thresholds

```
Score >= 95%  ->  READY (sealed, cleared for execution)
Score 80-94%  ->  ALMOST READY (only warnings pending, defaults applicable)
Score 50-79%  ->  INCOMPLETE (blockers present, requires human answers)
Score < 50%   ->  DRAFT (significant information missing, needs major refinement)
```

The default threshold of 95% is configurable per domain. A financial system may require 99%. An internal prototype may accept 85%.

### 4.4 Visual Representation

The protocol presents the score alongside a categorized breakdown of all gaps:

```
+-- Completeness: webhook-stripe-payment -------------------------+
|                                                                  |
|  Score: 68% >>>>>>>>--------  INCOMPLETE                         |
|                                                                  |
|  BLOCKERS (3):                                                   |
|     [!] Payment failure action not defined                       |
|         Scenario: Stripe returns status "failed."                |
|         What status does the order get?                          |
|                                                                  |
|     [!] Idempotency not handled                                  |
|         Scenario: Stripe resends the same webhook 3x in 30s.    |
|         Order is processed 3 times.                              |
|                                                                  |
|     [!] Endpoint permissions not defined                         |
|         Scenario: any IP can call /webhook/stripe.               |
|         Attacker simulates fake webhooks.                        |
|                                                                  |
|  WARNINGS (4):                                                   |
|     [?] Timeout assumed: 30s -- confirm?                         |
|     [?] Email retry assumed: 3x with backoff -- confirm?         |
|     [?] Payload logging assumed: yes, no card data -- confirm?   |
|     [?] Stripe signature assumed: HMAC-SHA256 -- confirm?        |
|                                                                  |
|  COVERED (8):                                                    |
|     [ok] Happy path complete                                     |
|     [ok] Payload validation (schema defined)                     |
|     [ok] Status persistence (update order)                       |
|     [ok] Email notification (template defined)                   |
|     [ok] Response format to Stripe (200 OK)                      |
|     [ok] Order data structure (entity defined)                   |
|     [ok] Required fields listed (5 of 5)                         |
|     [ok] Data transformation (cents -> dollars)                  |
|                                                                  |
+------------------------------------------------------------------+
|  To reach 95%:                                                   |
|  - Answer the 3 blockers                                         |
|  - Confirm or adjust the 4 defaults                              |
|  Estimated time: ~2 minutes                                      |
+------------------------------------------------------------------+
```

---

## 5. The Refinement Loop

The refinement loop transforms a vague intent into a complete, verified contract. It does not stop before reaching the confidence threshold -- or before the human explicitly accepts the risks of remaining gaps.

### 5.1 Flow

```
STEP 1: INTENT DECLARATION
  Human states what they want in natural language.

STEP 2: DRAFT GENERATION
  System generates a Pact contract from the intent.
  - Identifies contract type (e.g., webhook receiver)
  - Identifies entities (e.g., payment, order, customer)
  - Identifies flow (e.g., validate -> find -> update -> notify)
  - Applies type-specific defaults

STEP 3: GAP DETECTION
  System runs the deterministic checklist for the contract type.
  System runs the LLM analysis layer (see Section 8).
  Gaps are identified and classified.

STEP 4: SCORE CHECK
  If score < threshold:
    - Present all gaps to the human, grouped by category
    - Blockers as questions requiring answers
    - Warnings as defaults requiring confirmation
    -> Proceed to Step 5

  If score >= threshold:
    -> Proceed to Step 6

STEP 5: HUMAN RESPONDS
  Human answers blocker questions.
  Human confirms, adjusts, or rejects defaults.
  System updates the contract with the answers.
  -> Return to Step 3

STEP 6: ADVERSARIAL ANALYSIS
  System attempts to break the contract (see Section 6).
  If new vulnerabilities drop the score below threshold:
    -> Return to Step 4 with new gaps

STEP 7: STRUCTURAL VALIDATION
  Parser validates the contract structure:
  - Valid syntax
  - Correct types
  - All references resolve (mentioned entities exist)
  - Flow is a valid DAG (no cycles)
  - Constraints are satisfiable

STEP 8: CONTRACT SEALED
  Contract receives the seal of completeness:
  - Cryptographic hash of final contract
  - Confidence score
  - Seal timestamp
  - All decisions recorded (audit trail)
  - Version identifier
  - Status: SEALED
```

### 5.2 Loop Rules

1. **Maximum 5 iterations.** If after 5 rounds the score has not reached the threshold, the system recommends splitting the contract into smaller contracts.

2. **Questions are grouped.** The system never asks one question at a time. All pending questions are presented together, grouped by category.

3. **Partial answers are accepted.** The human may answer 2 of 5 questions and say "the rest later." The system updates the score with what it has and retains the pending items.

4. **Decisions are recorded, not repeated.** Once the human answers a question, the system does not ask again in the same session. The human can explicitly revise any previous decision, which triggers reprocessing.

5. **Each iteration produces a version.** The complete refinement history is preserved. If someone asks six months later "why is there no IP allowlist?", the answer is in the history: "human decided on [date] that signature verification was sufficient."

---

## 6. Adversarial Analysis

After gap detection validates that the contract is complete, adversarial analysis attempts to destroy it. Where gap detection asks "did you cover this?", adversarial analysis asks "what if someone does THIS?"

### 6.1 Attack Categories

**Malicious Inputs.**
The system generates inputs designed to break the contract:
- Negative or zero values in numeric fields
- Nonexistent references (e.g., order ID that does not exist)
- Injection attempts in string fields (SQL injection, email header injection)
- Oversized payloads (denial-of-service via payload size)
- Unexpected types (string where number expected)

**Service Failure Simulation.**
For each external dependency the contract uses, the system considers:
- Total outage (no response)
- Degraded performance (responds in 25s instead of 200ms)
- Invalid data returned (HTML when JSON expected)
- Format changes (new fields, removed fields, changed types)

**Concurrency Simulation.**
The system tests scenarios with simultaneous requests:
- Same event arriving twice within milliseconds (is deduplication atomic?)
- Conflicting events arriving simultaneously (payment success + cancellation)
- Multiple users acting on the same resource at the same time

**Boundary Testing.**
For each input field, the system tests:
- Minimum value, maximum value, zero, negative
- Null, empty string, whitespace-only
- Value exactly at the boundary of a condition (e.g., discount for orders > $100 -- what about exactly $100?)
- Maximum length per RFC or schema

### 6.2 Adversarial Report

The adversarial analysis produces a report with vulnerabilities classified by severity (CRITICAL, HIGH, MEDIUM, LOW). Each vulnerability includes the attack scenario, the impact if unaddressed, and a suggested mitigation.

If the adversarial analysis drops the score below the threshold, the contract returns to the refinement loop with the new gaps.

---

## 7. Smart Defaults

For gaps classified as WARNING (not blockers), the system can apply sensible defaults instead of requiring a human answer. This accelerates refinement without sacrificing safety.

### 7.1 Principle

The system MUST NEVER apply defaults silently. Every default MUST be disclosed to the human with the option to confirm, adjust, or reject.

### 7.2 Defaults by Contract Type

**HTTP Endpoint:**

| Setting | Default |
|---------|---------|
| Timeout | 30s |
| Retry | 3 attempts, exponential backoff (1s, 2s, 4s) |
| Auth | Bearer token via Authorization header |
| Rate limit | 100 requests/minute per IP |
| Idempotency | Via X-Request-Id header (if present) |
| Logging | Full payload, mask fields containing "password", "token", "secret", "card", "cvv", "ssn" |
| CORS | No origins allowed (must be explicitly configured) |
| Content-Type | application/json |
| Max payload | 1 MB |

**Inbound Webhook:**

| Setting | Default |
|---------|---------|
| Signature verification | Enabled (mechanism depends on sender) |
| Response time | 5s (accept fast, process async if needed) |
| Idempotency | By sender's event_id |
| Processing | Respond 200 immediately, process in background |
| Dead letter | Retain unprocessable payloads for 30 days |
| Unknown events | Ignore (log but do not fail) |
| Max payload | 5 MB |
| Logging | Full payload, mask sensitive fields |

**Cron / Scheduled Job:**

| Setting | Default |
|---------|---------|
| Timezone | UTC (always explicit, never "local") |
| Overlap | Skip if previous execution is still running |
| Timeout | 5 minutes |
| Failure notification | Contract owner, via primary configured channel |
| Idempotency | Enabled (running twice produces same result) |
| Lock | Distributed advisory lock |
| Catch-up | Disabled (if window missed, wait for next) |
| Logging | Start, end, duration, records processed, errors |

**External Service Integration:**

| Setting | Default |
|---------|---------|
| Timeout | 10s |
| Retry | 3 attempts, exponential backoff (1s, 2s, 4s) |
| Circuit breaker | Open after 5 consecutive failures, close after 30s |
| Fallback | Return clear error to caller (never silently swallow) |
| Credentials | Via environment variable (never hard-coded) |
| TLS | Minimum TLS 1.2 |
| Logging | Request/response, mask authentication headers |

**Notifications:**

| Setting | Default |
|---------|---------|
| Retry | 2 attempts with 5s interval |
| Rate limit | Max 10 per hour per recipient |
| Fallback channel | None (must be explicitly configured) |
| Tracking | Record send attempt and status |
| Opt-out | Respect user preferences |
| Template | Requires at minimum a subject and body |

**CRUD Operations:**

| Setting | Default |
|---------|---------|
| Delete strategy | Soft delete (deleted_at field) |
| Audit trail | Record who, when, what changed |
| Unique validation | On fields marked as identifiers |
| Cascade | Deny deletion if dependents exist (must be explicitly overridden) |
| Encoding | UTF-8 |
| Date format | ISO-8601 |
| Monetary precision | 2 decimal places, HALF_UP rounding |

### 7.3 Adaptive Defaults

The system refines defaults over time based on human decisions:

- If a human consistently accepts a default (e.g., timeout: 30s accepted in 94% of e-commerce contracts), the system retains it.
- If a human consistently overrides a default (e.g., rate limit changed from 100/min to 1000/min in 80% of webhook contracts), the system updates the default for that context.
- If a human consistently rejects a specific question as irrelevant, the system demotes it from checklist to LLM-only analysis.

---

## 8. Implementation

The Interrogation Protocol uses a hybrid approach combining deterministic and heuristic analysis.

### 8.1 Layer 1: Deterministic Checklist

A rule-based gap detector that runs the contract-type-specific checklists defined in Section 3.

**Characteristics:**
- Execution time: < 100ms
- Deterministic: same contract always produces same result
- Auditable: rules are explicit and verifiable
- No variable cost (no tokens consumed)
- Works offline

**Limitations:**
- Only detects gaps that have been explicitly coded as rules
- Does not understand context or domain nuance
- Does not make non-obvious connections between fields

### 8.2 Layer 2: LLM Analysis

A large language model analyzes the contract as an experienced reviewer would, looking for gaps the checklist does not cover.

**Characteristics:**
- Discovers contextual and domain-specific gaps
- Understands natural language intent
- Makes non-obvious connections ("this field looks like a national ID -- does it need data protection handling?")
- No rule maintenance required

**Limitations:**
- Latency: 2-10 seconds per analysis
- Non-deterministic: may produce different results for the same contract
- Possible false positives (unnecessary questions) and false negatives (missed gaps)
- Requires LLM API connectivity

**Focus areas for Layer 2 (does NOT repeat Layer 1 checks):**
- Domain gaps: implicit business rules that exist in the real world but nobody stated
- Context gaps: interactions with other contracts or systems that may cause problems
- Scenario gaps: non-obvious combinations of inputs or states
- Evolution gaps: what breaks when the business grows 10x, changes region, or adds an adjacent feature

### 8.3 Combined Scoring

The two layers are combined with distinct trust weights:

- **Deterministic gaps** carry full weight (1.0x). These are verified, reliable findings.
- **LLM gaps** carry reduced weight (0.7x). This accounts for the higher false-positive rate of heuristic analysis.

Deduplication ensures the LLM does not re-report gaps already found by the checklist. Semantic similarity matching prevents overlapping findings from inflating the gap count.

### 8.4 When to Invoke Layer 2

Layer 2 (LLM) is invoked when:

- The contract is new (first version)
- The contract is classified as high criticality
- The domain is regulated (financial, healthcare, legal)
- Default behavior: invoke (opt-out rather than opt-in)

Layer 2 may be skipped when:

- The change is a minor patch to an already-sealed contract AND the deterministic score is >= 95%

---

## 9. The 10 Questions Nobody Asks

The most valuable questions the protocol asks systematically -- questions that humans consistently forget. Each one has prevented, or would have prevented, real-world production incidents.

### 9.1 "What happens if this endpoint receives the same request twice?"

**Why it matters.** Developers think of requests as unique events. In reality, duplicates happen due to automatic retries, user double-clicks, queue replays, and integration bugs.

**What goes wrong without it.** A double POST creates a double charge. A double webhook processes a payment twice. A double form submission creates duplicate records. The cost is refunds, manual cleanup, and lost trust.

### 9.2 "If service X is down, what does the user see?"

**Why it matters.** The happy path feels so natural that failure seems improbable. But every external dependency will eventually be unavailable, slow, or return garbage.

**What goes wrong without it.** The user sees a blank page, a stack trace, or an infinite spinner. A trivial 3-second timeout with a fallback message would have preserved the experience.

### 9.3 "When this record is deleted, what happens to everything that references it?"

**Why it matters.** Deletion seems simple: DELETE WHERE id = X. But if other tables reference that record, you get constraint violations or orphaned references.

**What goes wrong without it.** UI displays "Assigned to: undefined." Queries fail with foreign key errors. Ghost references accumulate silently until someone notices months later.

### 9.4 "Can this field be empty? What happens if it is?"

**Why it matters.** "Required" in a form does not mean "NOT NULL in the database." APIs, CSV imports, and internal systems can send empty values.

**What goes wrong without it.** A dialer tries to call null phone numbers. An email service sends to empty addresses. Every downstream process that assumes the field exists breaks in a different way.

### 9.5 "If two users do this at the same time, what happens?"

**Why it matters.** Concurrency is invisible in local development. The developer tests alone, one request at a time. In production, hundreds of requests arrive simultaneously.

**What goes wrong without it.** Two users reserve the same table. Two threads decrement the same inventory. Two payments update the same balance. The race condition manifests as corrupted data that is difficult to reproduce and debug.

### 9.6 "How long can this be down before the impact starts?"

**Why it matters.** Every system has an implicit SLA -- the maximum downtime before the business suffers. If nobody defines it, nobody monitors for it.

**What goes wrong without it.** A payment processor goes down on Saturday. Nobody notices until Monday. Thousands of charges fail. Recovery takes days.

### 9.7 "Who gets notified if this fails at 3 AM?"

**Why it matters.** Everyone assumes "someone" will see the alert. Nobody defines who. In production, alerts go to channels nobody watches outside business hours.

**What goes wrong without it.** A nightly job fails silently. Three days of data are corrupted before anyone notices. Manual reprocessing costs more than the SMS alert would have.

### 9.8 "Is this data personal or sensitive? Does it need regulatory compliance?"

**Why it matters.** Compliance seems like a legal concern. But every field containing a name, email, national ID, address, or phone number is personal data under most data protection regulations.

**What goes wrong without it.** Unencrypted backups get exposed. Logs contain full credit card numbers. A user requests data deletion and the system has no mechanism for it. The penalties range from fines to business closure.

### 9.9 "If the external API changes version, what breaks?"

**Why it matters.** Integrations are configured once and forgotten. Until the external API deprecates the version and everything stops.

**What goes wrong without it.** The endpoint returns 404 or a completely different response format. Without a fallback, 100% of requests depending on that integration fail. The fix takes hours because nobody knows the new URL or format.

### 9.10 "Six months from now, when nobody remembers what this does, what will be most confusing?"

**Why it matters.** At creation time, everything is obvious. Six months later, without context, the contract is an enigma.

**What goes wrong without it.** A reconciliation job "corrects discrepancies" between two databases. Nobody knows which discrepancies, which is the source of truth, or why the discrepancies exist. When the other system changes its logic, the job starts "correcting" data that was actually right.

---

## Summary

The Interrogation Protocol enforces a simple invariant: no contract executes until it is understood. The formula:

```
Deterministic checklist (fast, predictable)
  + LLM heuristic analysis (creative, contextual)
  + Adversarial analysis (destructive, exhaustive)
  + Smart defaults (practical, adaptive)
  = A contract that survives the real world.
```

The cost of implementing this is modest: a checklist per contract type, a well-calibrated LLM prompt, and a feedback loop. The cost of NOT implementing it is repeating the same bugs the software industry has repeated for fifty years -- bugs that exist not from lack of competence, but from lack of someone asking "what if?" at the right moment.

The Interrogation Protocol is that someone.
