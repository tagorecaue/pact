# 06 - SIML Runtime Engine: Arquitetura Tecnica

> Arquitetura detalhada de um servidor HTTP que executa contratos semanticos em vez de codigo. Um backend completo onde a logica de negocio e declarada como intencao, nao como implementacao.

---

## 1. Arquitetura Geral

O SIML Runtime Engine e um processo unico que recebe dados do mundo externo, resolve qual contrato semantico deve tratar cada entrada, executa as acoes definidas pelo contrato de forma deterministica, e produz evidencia de tudo que fez.

### 1.1 Diagrama de Componentes

```
                         MUNDO EXTERNO
            ┌──────────┬──────────┬──────────┐
            │ HTTP     │ Webhooks │ Cron     │
            │ Requests │          │ Triggers │
            └────┬─────┴────┬─────┴────┬─────┘
                 │          │          │
                 v          v          v
┌─────────────────────────────────────────────────────────────────┐
│                      HTTP GATEWAY (Hono)                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │ Router   │ │ Auth     │ │ Rate     │ │ Request          │   │
│  │ Dinamico │ │ Middleware│ │ Limiter  │ │ Normalizer       │   │
│  └────┬─────┘ └──────────┘ └──────────┘ └──────────────────┘   │
│       │                                                         │
│       v                                                         │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              CONTRACT REGISTRY                          │    │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │    │
│  │  │ Contract│ │ Contract│ │ Contract│ │ Contract│ ...   │    │
│  │  │ A       │ │ B       │ │ C       │ │ D       │      │    │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘      │    │
│  │  Route Map: path -> contract_id                        │    │
│  │  Event Map: event_type -> [contract_ids]               │    │
│  └───────────────────────┬─────────────────────────────────┘    │
│                          │                                      │
│                          v                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              INTENT RESOLVER                            │    │
│  │  ┌─────────────┐  ┌────────────────┐  ┌─────────────┐  │    │
│  │  │ Pattern     │  │ LLM Resolver   │  │ Plan        │  │    │
│  │  │ Matcher     │  │ (ambiguidade)  │  │ Compiler    │  │    │
│  │  │ (rapido)    │  │ (quando needed)│  │             │  │    │
│  │  └──────┬──────┘  └───────┬────────┘  └──────┬──────┘  │    │
│  │         │                 │                   │         │    │
│  └─────────┼─────────────────┼───────────────────┼─────────┘    │
│            │                 │                   │              │
│            v                 v                   v              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              EXECUTION ENGINE                           │    │
│  │                                                         │    │
│  │  Pipeline de Steps (deterministico):                    │    │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌──────┐ │    │
│  │  │VALIDATE│→│TRANSFORM│→│ STORE  │→│FORWARD │→│NOTIFY│ │    │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └──────┘ │    │
│  │                                                         │    │
│  └──────┬──────────┬──────────┬──────────┬─────────────────┘    │
│         │          │          │          │                      │
│         v          v          v          v                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │DATA STORE│ │ OUTBOUND │ │ EVENT    │ │ SCHEDULER        │   │
│  │SQLite/PG │ │ HTTP     │ │ BUS     │ │ Cron + Delayed   │   │
│  │          │ │ Client   │ │ Pub/Sub │ │                  │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              EVIDENCE STORE                             │    │
│  │  Audit trail de toda execucao, decisao, erro            │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                 │
                 v
┌─────────────────────────────────────────────────────────────────┐
│                      DASHBOARD (Web UI)                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │ Contratos│ │ Execucoes│ │ Metricas │ │ Chat LLM         │   │
│  │ Ativos   │ │ Recentes │ │ e Erros  │ │ (expandir sistema)│   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Responsabilidade de Cada Componente

| Componente | Responsabilidade | Critico? |
|---|---|---|
| **HTTP Gateway** | Receber requests, normalizar headers/body, autenticar, rate limit | Sim |
| **Contract Registry** | Armazenar contratos carregados, mapear rotas e eventos para contratos | Sim |
| **Intent Resolver** | Dado um request + contrato, determinar qual plano de execucao seguir | Sim |
| **Execution Engine** | Executar o plano passo a passo, deterministicamente | Sim |
| **Data Store** | Persistir dados de negocio (entidades criadas/atualizadas pelos contratos) | Sim |
| **Scheduler** | Disparar contratos em horarios definidos (cron) ou apos delays | Sim |
| **Outbound** | Fazer HTTP requests de saida (webhooks, APIs externas) | Sim |
| **Event Bus** | Publicar e consumir eventos entre contratos (in-process) | Sim |
| **Evidence Store** | Gravar trilha de auditoria imutavel de tudo que aconteceu | Sim |
| **Dashboard** | Interface web para humanos inspecionarem e expandirem o sistema | Nao (operacional) |

### 1.3 Principio Fundamental

O engine tem duas "velocidades":

1. **Tempo de design** — LLM ajuda a criar, interpretar e refinar contratos
2. **Tempo de execucao** — tudo e deterministico, sem chamada LLM no hot path

Isso e critico. Um request HTTP que chega no engine **nunca** espera uma chamada LLM para ser processado. O LLM ja fez seu trabalho antes: compilou a intencao em um plano executavel.

---

## 2. Fluxo de Vida de um Request

### 2.1 Cenario: Webhook Stripe chega em `/webhook/stripe-payment`

```
[Stripe] --POST--> https://meuserver.com/webhook/stripe-payment
Content-Type: application/json
Stripe-Signature: t=1234,v1=abc...

{
  "type": "checkout.session.completed",
  "data": {
    "object": {
      "id": "cs_live_abc123",
      "amount_total": 9900,
      "currency": "brl",
      "customer_email": "joao@email.com",
      "metadata": { "order_id": "ORD-2024-0847" }
    }
  }
}
```

### 2.2 Passo a Passo Completo

**Passo 1: HTTP Gateway recebe o request**

```typescript
// O gateway normaliza o request em um RequestEnvelope
const envelope: RequestEnvelope = {
  id: "req_7f3a8b2c",
  timestamp: "2024-11-15T14:32:01Z",
  method: "POST",
  path: "/webhook/stripe-payment",
  headers: { "stripe-signature": "t=1234,v1=abc...", ... },
  body: { type: "checkout.session.completed", data: { ... } },
  source_ip: "54.187.174.169"
}
```

**Passo 2: Contract Registry resolve a rota**

```typescript
// O registry tem um mapa de rotas compilado na inicializacao
const match = registry.resolveRoute("POST", "/webhook/stripe-payment")
// Retorna:
{
  contract_id: "contract_stripe_payment_v3",
  route_params: {},
  match_type: "exact"  // exact | pattern | fallback_llm
}
```

O mapa de rotas e construido quando o contrato e registrado. Nao ha LLM aqui — e um lookup direto em uma hash map.

**Passo 3: Intent Resolver compila o plano de execucao**

O contrato para esse endpoint e:

```yaml
contract:
  id: "contract_stripe_payment_v3"
  version: "3.1.0"

  intent: |
    Quando um pagamento Stripe for confirmado (checkout.session.completed),
    atualizar o status do pedido para "pago", registrar o pagamento,
    enviar email de confirmacao ao cliente, e notificar o ERP via API.

  trigger:
    type: webhook
    path: /webhook/stripe-payment
    method: POST

  input:
    source: body
    expect:
      type: string  # tipo do evento Stripe
      data.object.id: string
      data.object.amount_total: number
      data.object.customer_email: string
      data.object.metadata.order_id: string

  auth:
    type: stripe_signature
    secret_ref: env.STRIPE_WEBHOOK_SECRET

  steps:
    - id: validate_event
      action: validate
      rules:
        - field: type
          equals: "checkout.session.completed"
        - field: data.object.amount_total
          greater_than: 0

    - id: find_order
      action: query
      store: orders
      where:
        order_id: "{{ input.data.object.metadata.order_id }}"
      expect: exactly_one
      on_fail: abort("Pedido nao encontrado: {{ input.data.object.metadata.order_id }}")

    - id: update_order
      action: update
      store: orders
      target: "{{ steps.find_order.result }}"
      set:
        status: "pago"
        paid_at: "{{ now }}"
        payment_provider: "stripe"
        payment_id: "{{ input.data.object.id }}"
        amount_paid: "{{ input.data.object.amount_total / 100 }}"

    - id: record_payment
      action: insert
      store: payments
      data:
        order_id: "{{ steps.find_order.result.order_id }}"
        provider: "stripe"
        provider_id: "{{ input.data.object.id }}"
        amount: "{{ input.data.object.amount_total / 100 }}"
        currency: "{{ input.data.object.currency }}"
        status: "confirmed"
        received_at: "{{ now }}"

    - id: send_confirmation
      action: http_post
      url: "{{ env.EMAIL_SERVICE_URL }}/send"
      body:
        to: "{{ input.data.object.customer_email }}"
        template: "payment_confirmed"
        data:
          order_id: "{{ steps.find_order.result.order_id }}"
          amount: "{{ steps.update_order.result.amount_paid }}"
      on_fail: log_warning("Email falhou, mas pagamento ja registrado")

    - id: notify_erp
      action: http_post
      url: "{{ env.ERP_API_URL }}/payments/notify"
      headers:
        Authorization: "Bearer {{ env.ERP_API_TOKEN }}"
      body:
        order_id: "{{ steps.find_order.result.order_id }}"
        payment_id: "{{ input.data.object.id }}"
        amount: "{{ steps.update_order.result.amount_paid }}"
      on_fail: enqueue_retry(max_attempts: 3, delay: "5m")

  response:
    status: 200
    body: { received: true }

  evidence:
    log: all_steps
    retention: 90_days
```

O Intent Resolver **nao chama LLM** aqui. O contrato ja tem `steps` compilados. O resolver apenas:
1. Valida que o input bate com `input.expect`
2. Monta o pipeline de execucao a partir de `steps`
3. Resolve as referencias `{{ }}` em uma arvore de dependencias

```typescript
// O plano compilado e um DAG simples:
const plan: ExecutionPlan = {
  steps: [
    { id: "validate_event", action: "validate", deps: [] },
    { id: "find_order", action: "query", deps: ["validate_event"] },
    { id: "update_order", action: "update", deps: ["find_order"] },
    { id: "record_payment", action: "insert", deps: ["find_order"] },
    { id: "send_confirmation", action: "http_post", deps: ["update_order"] },
    { id: "notify_erp", action: "http_post", deps: ["update_order"] },
  ]
}
// Note: send_confirmation e notify_erp podem executar em paralelo
```

**Passo 4: Execution Engine executa o plano**

```typescript
async function executePlan(plan: ExecutionPlan, context: ExecutionContext) {
  const results = new Map<string, StepResult>()

  for (const step of topologicalSort(plan.steps)) {
    // Espera dependencias
    const deps = step.deps.map(d => results.get(d))
    if (deps.some(d => d?.status === "failed" && !step.tolerates_failure)) {
      results.set(step.id, { status: "skipped", reason: "dependency_failed" })
      continue
    }

    // Resolve templates {{ }}
    const resolved = resolveTemplates(step, context, results)

    // Executa a acao
    const result = await executeAction(resolved)

    // Registra evidencia
    await evidence.record({
      contract_id: context.contract_id,
      request_id: context.request_id,
      step_id: step.id,
      action: step.action,
      input: resolved,
      output: result,
      duration_ms: result.duration,
      timestamp: Date.now()
    })

    results.set(step.id, result)
  }

  return results
}
```

**Passo 5: Response retorna ao Stripe**

O Stripe recebe `200 { received: true }` em ~50ms (se o banco e local).

Os steps `send_confirmation` e `notify_erp` que podem ser lentos sao marcados como `async: true` opcionalmente, executando apos o response.

### 2.3 Diagrama de Sequencia

```
Stripe        Gateway       Registry     Resolver     Engine       Store        Outbound
  │               │              │            │           │            │             │
  │──POST────────>│              │            │           │            │             │
  │               │──resolve────>│            │           │            │             │
  │               │<─contract────│            │           │            │             │
  │               │──────────────────compile─>│           │            │             │
  │               │<─────────────────plan─────│           │            │             │
  │               │──────────────────────────────execute─>│            │             │
  │               │              │            │           │──validate──│             │
  │               │              │            │           │──query────>│             │
  │               │              │            │           │<──order────│             │
  │               │              │            │           │──update───>│             │
  │               │              │            │           │──insert───>│             │
  │               │              │            │           │────────────────http_post─>│
  │               │              │            │           │            │  (email)    │
  │               │              │            │           │────────────────http_post─>│
  │               │              │            │           │            │  (erp)      │
  │<──200─────────│              │            │           │            │             │
```

---

## 3. Fluxo de Vida de um Cron Job

### 3.1 Cenario: Cobranca diaria de pedidos pendentes

Contrato:

```yaml
contract:
  id: "contract_daily_billing_reminder"
  version: "1.0.0"

  intent: |
    Todo dia as 8h da manha (horario de Brasilia), buscar todos os pedidos
    com status "aguardando_pagamento" ha mais de 3 dias. Para cada pedido,
    enviar email de lembrete ao cliente. Se o pedido tem mais de 7 dias,
    cancelar automaticamente.

  trigger:
    type: cron
    schedule: "0 8 * * *"  # 8h todo dia
    timezone: "America/Sao_Paulo"

  steps:
    - id: find_pending
      action: query
      store: orders
      where:
        status: "aguardando_pagamento"
        created_at:
          before: "{{ now - 3days }}"
      order_by: created_at asc

    - id: split_by_age
      action: transform
      input: "{{ steps.find_pending.results }}"
      rules:
        - name: to_remind
          filter: "created_at > {{ now - 7days }}"
        - name: to_cancel
          filter: "created_at <= {{ now - 7days }}"

    - id: send_reminders
      action: for_each
      items: "{{ steps.split_by_age.to_remind }}"
      do:
        action: http_post
        url: "{{ env.EMAIL_SERVICE_URL }}/send"
        body:
          to: "{{ item.customer_email }}"
          template: "payment_reminder"
          data:
            order_id: "{{ item.order_id }}"
            amount: "{{ item.total }}"
            days_pending: "{{ (now - item.created_at).days }}"
      on_item_fail: log_warning("Falha ao enviar reminder para {{ item.order_id }}")

    - id: cancel_old_orders
      action: for_each
      items: "{{ steps.split_by_age.to_cancel }}"
      do:
        - action: update
          store: orders
          target: "{{ item }}"
          set:
            status: "cancelado_por_timeout"
            cancelled_at: "{{ now }}"
            cancellation_reason: "Pagamento nao recebido em 7 dias"
        - action: emit_event
          type: "order.cancelled"
          data:
            order_id: "{{ item.order_id }}"
            reason: "payment_timeout"

  evidence:
    log: all_steps
    summary: |
      Pedidos pendentes encontrados: {{ steps.find_pending.count }}
      Lembretes enviados: {{ steps.send_reminders.success_count }}
      Pedidos cancelados: {{ steps.cancel_old_orders.success_count }}
      Falhas: {{ steps.send_reminders.fail_count + steps.cancel_old_orders.fail_count }}
    retention: 365_days
```

### 3.2 Como o Scheduler Funciona

```
┌─────────────────────────────────────────────────────┐
│                    SCHEDULER                         │
│                                                      │
│  ┌───────────────────────────────────────────────┐   │
│  │  Cron Table (carregada do Contract Registry)  │   │
│  │                                               │   │
│  │  "0 8 * * *"  -> contract_daily_billing       │   │
│  │  "0 7 * * 1"  -> contract_weekly_report       │   │
│  │  "*/5 * * * *" -> contract_health_check       │   │
│  │  "0 0 1 * *"  -> contract_monthly_invoice     │   │
│  └───────────────────────────────────────────────┘   │
│                                                      │
│  Loop (a cada minuto):                               │
│    1. Verifica quais crons devem disparar agora      │
│    2. Para cada: cria um "virtual request"           │
│    3. Envia para o Execution Engine                  │
│    4. Registra execucao no Evidence Store             │
│                                                      │
│  Delayed Jobs:                                       │
│    - Fila de jobs com timestamp futuro               │
│    - Exemplo: retry em 5 minutos                     │
│    - Processados quando o timestamp chega            │
│                                                      │
│  Garantias:                                          │
│    - at-least-once (pode duplicar, contratos devem   │
│      ser idempotentes)                               │
│    - Lock distribuido se multi-instancia             │
│    - Missed executions sao detectadas e logadas      │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### 3.3 Pseudo-codigo do Scheduler

```typescript
class Scheduler {
  private cronEntries: CronEntry[] = []
  private delayedQueue: PriorityQueue<DelayedJob>

  async start() {
    // Carrega todos os contratos com trigger.type === "cron"
    this.cronEntries = this.registry.getContractsByTriggerType("cron")
      .map(c => ({
        contract_id: c.id,
        expression: parseCron(c.trigger.schedule),
        timezone: c.trigger.timezone || "UTC",
        last_run: await this.evidence.getLastRun(c.id)
      }))

    // Tick a cada 30 segundos
    setInterval(() => this.tick(), 30_000)
  }

  private async tick() {
    const now = new Date()

    // Cron jobs
    for (const entry of this.cronEntries) {
      if (entry.expression.matches(now, entry.timezone)) {
        if (this.alreadyRanThisWindow(entry, now)) continue

        await this.lock.acquire(`cron:${entry.contract_id}`)

        const virtualRequest: RequestEnvelope = {
          id: `cron_${entry.contract_id}_${now.toISOString()}`,
          timestamp: now.toISOString(),
          method: "CRON",
          path: `/_internal/cron/${entry.contract_id}`,
          headers: {},
          body: { triggered_by: "scheduler", scheduled_time: now },
          source_ip: "127.0.0.1"
        }

        await this.engine.execute(entry.contract_id, virtualRequest)
        await this.lock.release(`cron:${entry.contract_id}`)
      }
    }

    // Delayed jobs
    while (this.delayedQueue.peek()?.execute_at <= now) {
      const job = this.delayedQueue.pop()
      await this.engine.executeStep(job.contract_id, job.step, job.context)
    }
  }
}
```

---

## 4. Fluxo de Vida de um Trigger Interno

### 4.1 Cenario: Pedido cancelado dispara reestoque e notificacao

Quando o contrato de cobranca cancela um pedido (secao 3), ele emite o evento `order.cancelled`. Outros contratos reagem:

**Contrato de Reestoque:**

```yaml
contract:
  id: "contract_restock_on_cancel"
  version: "1.0.0"

  intent: |
    Quando um pedido for cancelado, devolver os itens ao estoque.

  trigger:
    type: event
    listen: "order.cancelled"

  steps:
    - id: find_order_items
      action: query
      store: order_items
      where:
        order_id: "{{ input.data.order_id }}"

    - id: restock
      action: for_each
      items: "{{ steps.find_order_items.results }}"
      do:
        action: update
        store: products
        where:
          product_id: "{{ item.product_id }}"
        increment:
          stock: "{{ item.quantity }}"

    - id: log_restock
      action: insert
      store: stock_movements
      data:
        order_id: "{{ input.data.order_id }}"
        type: "restock_from_cancellation"
        items: "{{ steps.find_order_items.results }}"
        processed_at: "{{ now }}"
```

**Contrato de Notificacao:**

```yaml
contract:
  id: "contract_notify_cancellation"
  version: "1.0.0"

  intent: |
    Quando um pedido for cancelado, notificar o cliente por email
    e o time de vendas via Slack.

  trigger:
    type: event
    listen: "order.cancelled"

  steps:
    - id: find_order
      action: query
      store: orders
      where:
        order_id: "{{ input.data.order_id }}"
      expect: exactly_one

    - id: email_customer
      action: http_post
      url: "{{ env.EMAIL_SERVICE_URL }}/send"
      body:
        to: "{{ steps.find_order.result.customer_email }}"
        template: "order_cancelled"
        data:
          order_id: "{{ input.data.order_id }}"
          reason: "{{ input.data.reason }}"

    - id: notify_slack
      action: http_post
      url: "{{ env.SLACK_WEBHOOK_URL }}"
      body:
        text: "Pedido {{ input.data.order_id }} cancelado: {{ input.data.reason }}"
```

### 4.2 Arquitetura do Event Bus

```
┌──────────────────────────────────────────────────────────────┐
│                        EVENT BUS                              │
│                                                               │
│  Subscription Table (carregada do Contract Registry):         │
│                                                               │
│  "order.cancelled"   -> [contract_restock, contract_notify]   │
│  "order.created"     -> [contract_send_confirmation]          │
│  "payment.confirmed" -> [contract_update_order]               │
│  "product.low_stock" -> [contract_alert_purchasing]           │
│                                                               │
│  Semantica:                                                   │
│  - Publicacao e sincrona dentro do processo                   │
│  - Cada subscriber executa em sua propria "fiber"             │
│  - Falha de um subscriber NAO afeta outros                    │
│  - Eventos sao persistidos antes do dispatch (durabilidade)   │
│  - Retry automatico para subscribers que falharem             │
│                                                               │
│  Fluxo:                                                       │
│    1. Contrato A executa emit_event("order.cancelled", data)  │
│    2. Event Bus grava evento na tabela `events`               │
│    3. Event Bus resolve subscribers                           │
│    4. Para cada subscriber, cria virtual request              │
│    5. Execution Engine processa cada um independentemente     │
│    6. Resultados sao registrados como evidencia               │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### 4.3 Pseudo-codigo do Event Bus

```typescript
class EventBus {
  private subscriptions: Map<string, string[]> // event_type -> contract_ids

  constructor(registry: ContractRegistry) {
    // Carrega subscriptions dos contratos com trigger.type === "event"
    for (const contract of registry.getContractsByTriggerType("event")) {
      const eventType = contract.trigger.listen
      if (!this.subscriptions.has(eventType)) {
        this.subscriptions.set(eventType, [])
      }
      this.subscriptions.get(eventType)!.push(contract.id)
    }
  }

  async emit(eventType: string, data: any, sourceContext: ExecutionContext) {
    // 1. Persistir evento
    const event = await this.store.insert("_events", {
      id: generateId(),
      type: eventType,
      data,
      source_contract: sourceContext.contract_id,
      source_request: sourceContext.request_id,
      emitted_at: new Date()
    })

    // 2. Resolver subscribers
    const subscribers = this.subscriptions.get(eventType) || []

    // 3. Executar cada subscriber
    const executions = subscribers.map(contractId => {
      const virtualRequest: RequestEnvelope = {
        id: `event_${event.id}_${contractId}`,
        timestamp: new Date().toISOString(),
        method: "EVENT",
        path: `/_internal/event/${contractId}`,
        headers: {},
        body: { event_type: eventType, data, source_event_id: event.id },
        source_ip: "127.0.0.1"
      }
      return this.engine.execute(contractId, virtualRequest)
    })

    // Subscribers executam em paralelo, falhas sao isoladas
    const results = await Promise.allSettled(executions)

    // 4. Registrar resultados
    for (let i = 0; i < results.length; i++) {
      await this.store.update("_events", event.id, {
        [`delivery.${subscribers[i]}`]: {
          status: results[i].status,
          error: results[i].status === "rejected" ? results[i].reason : null
        }
      })
    }
  }
}
```

---

## 5. Exemplos Concretos de Contratos

### 5.1 API de Cadastro de Clientes

```yaml
contract:
  id: "contract_customer_registration"
  version: "2.0.0"

  intent: |
    Receber dados de cliente via POST, validar CPF com digito verificador,
    verificar se ja existe cliente com mesmo CPF ou email, gravar no store,
    e retornar confirmacao com o ID gerado.

  trigger:
    type: http
    path: /api/customers
    method: POST

  input:
    source: body
    schema:
      name:
        type: string
        min_length: 3
        max_length: 200
        required: true
      email:
        type: string
        format: email
        required: true
      cpf:
        type: string
        format: cpf  # validacao de digito verificador built-in
        required: true
      phone:
        type: string
        format: br_phone
        required: false
      address:
        type: object
        required: false
        properties:
          street: { type: string }
          number: { type: string }
          complement: { type: string }
          neighborhood: { type: string }
          city: { type: string }
          state: { type: string, format: br_state }
          zip: { type: string, format: br_cep }

  auth:
    type: bearer_token
    scope: "customers:write"

  steps:
    - id: normalize
      action: transform
      rules:
        - field: cpf
          apply: strip_non_digits
        - field: email
          apply: lowercase_trim
        - field: name
          apply: trim_normalize_spaces

    - id: validate_cpf
      action: validate
      rules:
        - field: "{{ steps.normalize.result.cpf }}"
          custom: cpf_check_digit
          on_fail: abort(422, { error: "CPF invalido", field: "cpf" })

    - id: check_duplicate_cpf
      action: query
      store: customers
      where:
        cpf: "{{ steps.normalize.result.cpf }}"
      expect: none
      on_fail: abort(409, { error: "CPF ja cadastrado", field: "cpf" })

    - id: check_duplicate_email
      action: query
      store: customers
      where:
        email: "{{ steps.normalize.result.email }}"
      expect: none
      on_fail: abort(409, { error: "Email ja cadastrado", field: "email" })

    - id: create_customer
      action: insert
      store: customers
      data:
        name: "{{ steps.normalize.result.name }}"
        email: "{{ steps.normalize.result.email }}"
        cpf: "{{ steps.normalize.result.cpf }}"
        phone: "{{ input.phone }}"
        address: "{{ input.address }}"
        status: "active"
        created_at: "{{ now }}"

    - id: emit_created
      action: emit_event
      type: "customer.created"
      data:
        customer_id: "{{ steps.create_customer.result.id }}"
        email: "{{ steps.normalize.result.email }}"

  response:
    status: 201
    body:
      id: "{{ steps.create_customer.result.id }}"
      name: "{{ steps.create_customer.result.name }}"
      email: "{{ steps.create_customer.result.email }}"
      created_at: "{{ steps.create_customer.result.created_at }}"
      message: "Cliente cadastrado com sucesso"

  evidence:
    log: all_steps
    pii_fields: [cpf, email, name, phone, address]  # marcar para LGPD
    retention: 5_years
```

### 5.2 Webhook de Pagamento (ja mostrado na secao 2)

Ver contrato completo na secao 2.2.

### 5.3 Cron de Relatorio Semanal

```yaml
contract:
  id: "contract_weekly_sales_report"
  version: "1.0.0"

  intent: |
    Toda segunda-feira as 7h, gerar relatorio de vendas da semana anterior,
    incluindo total de vendas, ticket medio, top 5 produtos, e comparacao
    com semana anterior. Enviar por email para a diretoria.

  trigger:
    type: cron
    schedule: "0 7 * * 1"  # segundas as 7h
    timezone: "America/Sao_Paulo"

  steps:
    - id: define_period
      action: transform
      rules:
        - name: week_start
          value: "{{ now - 7days | start_of_day }}"
        - name: week_end
          value: "{{ now | start_of_day }}"
        - name: prev_week_start
          value: "{{ now - 14days | start_of_day }}"
        - name: prev_week_end
          value: "{{ now - 7days | start_of_day }}"

    - id: current_week_sales
      action: aggregate
      store: orders
      where:
        status: "pago"
        paid_at:
          between: ["{{ steps.define_period.week_start }}", "{{ steps.define_period.week_end }}"]
      compute:
        total_revenue: { sum: "amount_paid" }
        order_count: { count: "*" }
        avg_ticket: { avg: "amount_paid" }
        max_order: { max: "amount_paid" }

    - id: previous_week_sales
      action: aggregate
      store: orders
      where:
        status: "pago"
        paid_at:
          between: ["{{ steps.define_period.prev_week_start }}", "{{ steps.define_period.prev_week_end }}"]
      compute:
        total_revenue: { sum: "amount_paid" }
        order_count: { count: "*" }

    - id: top_products
      action: aggregate
      store: order_items
      join:
        orders: { on: "order_id", where: { status: "pago", paid_at: { between: ["{{ steps.define_period.week_start }}", "{{ steps.define_period.week_end }}"] } } }
      group_by: product_id
      compute:
        total_sold: { sum: "quantity" }
        total_revenue: { sum: "subtotal" }
      order_by: total_revenue desc
      limit: 5
      include:
        product_name: { from: "products", field: "name", on: "product_id" }

    - id: compute_comparison
      action: transform
      rules:
        - name: revenue_change_pct
          value: "{{ ((steps.current_week_sales.total_revenue - steps.previous_week_sales.total_revenue) / steps.previous_week_sales.total_revenue) * 100 | round(1) }}"
        - name: order_count_change_pct
          value: "{{ ((steps.current_week_sales.order_count - steps.previous_week_sales.order_count) / steps.previous_week_sales.order_count) * 100 | round(1) }}"

    - id: send_report
      action: http_post
      url: "{{ env.EMAIL_SERVICE_URL }}/send"
      body:
        to: ["ceo@empresa.com", "cfo@empresa.com", "comercial@empresa.com"]
        template: "weekly_sales_report"
        data:
          period: "{{ steps.define_period.week_start | format_date('dd/MM') }} a {{ steps.define_period.week_end | format_date('dd/MM/yyyy') }}"
          total_revenue: "{{ steps.current_week_sales.total_revenue | format_brl }}"
          order_count: "{{ steps.current_week_sales.order_count }}"
          avg_ticket: "{{ steps.current_week_sales.avg_ticket | format_brl }}"
          revenue_change: "{{ steps.compute_comparison.revenue_change_pct }}%"
          order_change: "{{ steps.compute_comparison.order_count_change_pct }}%"
          top_products: "{{ steps.top_products.results }}"
      on_fail: enqueue_retry(max_attempts: 3, delay: "30m")

  evidence:
    log: all_steps
    summary: |
      Relatorio semanal gerado: {{ steps.define_period.week_start }} a {{ steps.define_period.week_end }}
      Receita: {{ steps.current_week_sales.total_revenue | format_brl }} ({{ steps.compute_comparison.revenue_change_pct }}%)
      Pedidos: {{ steps.current_week_sales.order_count }} ({{ steps.compute_comparison.order_count_change_pct }}%)
    retention: 5_years
```

### 5.4 Sistema Completo de E-commerce Backend

Abaixo, os contratos que comporiam um backend funcional de e-commerce. Cada contrato e um arquivo independente, carregado pelo Contract Registry.

```
contracts/
  ecommerce/
    01-product-crud.yaml          # CRUD de produtos
    02-customer-registration.yaml # Cadastro de clientes
    03-cart-management.yaml       # Carrinho de compras
    04-checkout.yaml              # Processamento de checkout
    05-payment-webhook.yaml       # Webhook de pagamento
    06-shipping-integration.yaml  # Integracao com transportadora
    07-notification-hub.yaml      # Hub de notificacoes (email, SMS, push)
    08-daily-billing.yaml         # Cobranca diaria
    09-weekly-report.yaml         # Relatorio semanal
    10-stock-management.yaml      # Controle de estoque
```

**Mapa de interacao entre contratos:**

```
                    [Cliente via API]
                         │
              ┌──────────┼──────────┐
              v          v          v
        ┌──────────┐ ┌────────┐ ┌──────────┐
        │ Product  │ │Customer│ │  Cart    │
        │ CRUD     │ │Register│ │Management│
        └──────────┘ └───┬────┘ └────┬─────┘
                         │           │
                   customer.created  │
                         │           v
                         │     ┌──────────┐
                         │     │ Checkout │──── order.created ──┐
                         │     └────┬─────┘                     │
                         │          │                           v
                         │    [Redireciona              ┌─────────────┐
                         │     para Stripe]             │ Notification│
                         │          │                   │ Hub         │
                         │          v                   └─────────────┘
                         │   ┌─────────────┐                  ^
                         │   │ Payment     │── payment.confirmed
                         │   │ Webhook     │          │
                         │   └──────┬──────┘          │
                         │          │                  │
                         │    order.paid               │
                         │          │                  │
                         │          v                  │
                         │   ┌─────────────┐           │
                         │   │ Shipping    │── shipping.dispatched
                         │   │ Integration │          │
                         │   └──────┬──────┘          │
                         │          │                  │
                         │   stock.decreased           │
                         │          │                  │
                         │          v                  │
                         │   ┌─────────────┐           │
                         │   │ Stock       │── product.low_stock ──> [Alerta]
                         │   │ Management  │
                         │   └─────────────┘
                         │
                    [Cron Jobs]
                    ┌─────────────┐
                    │ Daily       │ (8h todo dia)
                    │ Billing     │
                    └─────────────┘
                    ┌─────────────┐
                    │ Weekly      │ (seg 7h)
                    │ Report      │
                    └─────────────┘
```

**Contrato resumido: Checkout**

```yaml
contract:
  id: "contract_checkout"
  version: "1.0.0"

  intent: |
    Processar checkout: validar carrinho, verificar estoque, calcular frete,
    criar pedido com status "aguardando_pagamento", e retornar URL de pagamento.

  trigger:
    type: http
    path: /api/checkout
    method: POST

  input:
    source: body
    schema:
      customer_id: { type: string, required: true }
      cart_id: { type: string, required: true }
      shipping_address: { type: object, required: true }
      shipping_method: { type: string, enum: [standard, express], required: true }

  auth:
    type: bearer_token
    scope: "orders:write"
    must_match: { customer_id: "{{ token.sub }}" }  # cliente so faz checkout de si mesmo

  steps:
    - id: load_cart
      action: query
      store: cart_items
      where:
        cart_id: "{{ input.cart_id }}"
        customer_id: "{{ input.customer_id }}"
      expect: at_least_one
      on_fail: abort(400, { error: "Carrinho vazio ou nao encontrado" })

    - id: verify_stock
      action: for_each
      items: "{{ steps.load_cart.results }}"
      do:
        action: query
        store: products
        where:
          id: "{{ item.product_id }}"
          stock: { gte: "{{ item.quantity }}" }
        expect: exactly_one
        on_fail: abort(409, {
          error: "Produto sem estoque",
          product_id: "{{ item.product_id }}",
          requested: "{{ item.quantity }}"
        })

    - id: calculate_totals
      action: transform
      rules:
        - name: subtotal
          value: "{{ steps.load_cart.results | sum('price * quantity') }}"
        - name: shipping_cost
          value: "{{ calculate_shipping(input.shipping_address, input.shipping_method, steps.load_cart.results) }}"
        - name: total
          value: "{{ subtotal + shipping_cost }}"

    - id: create_order
      action: insert
      store: orders
      data:
        customer_id: "{{ input.customer_id }}"
        status: "aguardando_pagamento"
        subtotal: "{{ steps.calculate_totals.subtotal }}"
        shipping_cost: "{{ steps.calculate_totals.shipping_cost }}"
        total: "{{ steps.calculate_totals.total }}"
        shipping_address: "{{ input.shipping_address }}"
        shipping_method: "{{ input.shipping_method }}"
        created_at: "{{ now }}"
        expires_at: "{{ now + 7days }}"

    - id: create_order_items
      action: for_each
      items: "{{ steps.load_cart.results }}"
      do:
        action: insert
        store: order_items
        data:
          order_id: "{{ steps.create_order.result.id }}"
          product_id: "{{ item.product_id }}"
          quantity: "{{ item.quantity }}"
          unit_price: "{{ item.price }}"
          subtotal: "{{ item.price * item.quantity }}"

    - id: reserve_stock
      action: for_each
      items: "{{ steps.load_cart.results }}"
      do:
        action: update
        store: products
        where: { id: "{{ item.product_id }}" }
        decrement: { stock: "{{ item.quantity }}" }

    - id: create_payment
      action: http_post
      url: "{{ env.STRIPE_API_URL }}/checkout/sessions"
      headers:
        Authorization: "Bearer {{ env.STRIPE_SECRET_KEY }}"
      body:
        mode: "payment"
        success_url: "{{ env.FRONTEND_URL }}/checkout/success?order={{ steps.create_order.result.id }}"
        cancel_url: "{{ env.FRONTEND_URL }}/checkout/cancel"
        metadata:
          order_id: "{{ steps.create_order.result.id }}"
        line_items: "{{ steps.load_cart.results | map_to_stripe_items }}"

    - id: clear_cart
      action: delete
      store: cart_items
      where:
        cart_id: "{{ input.cart_id }}"
        customer_id: "{{ input.customer_id }}"

    - id: emit_created
      action: emit_event
      type: "order.created"
      data:
        order_id: "{{ steps.create_order.result.id }}"
        customer_id: "{{ input.customer_id }}"
        total: "{{ steps.calculate_totals.total }}"

  response:
    status: 201
    body:
      order_id: "{{ steps.create_order.result.id }}"
      total: "{{ steps.calculate_totals.total }}"
      payment_url: "{{ steps.create_payment.result.url }}"
      expires_at: "{{ steps.create_order.result.expires_at }}"
```

---

## 6. O Dashboard de Inspecao

### 6.1 Funcionalidades Principais

| Funcionalidade | Descricao |
|---|---|
| **Contratos Ativos** | Lista todos os contratos carregados, suas rotas, triggers, versao |
| **Execucoes Recentes** | Timeline de execucoes com status, duracao, steps executados |
| **Erros e Alertas** | Execucoes que falharam, retries pendentes, contratos com alta taxa de erro |
| **Metricas** | Requests/min, latencia p50/p95/p99, throughput por contrato |
| **Chat LLM** | Interface conversacional para criar/modificar contratos |
| **Editor de Contratos** | Editor YAML com validacao em tempo real |
| **Evidence Explorer** | Navegacao pela trilha de auditoria completa |
| **Stores Browser** | Visualizacao dos dados persistidos (como phpMyAdmin semantico) |

### 6.2 Mockup: Tela Principal

```
┌─────────────────────────────────────────────────────────────────────────┐
│  SIML Runtime Engine                              ▸ v0.3.1   ● Online  │
├─────────────┬───────────────────────────────────────────────────────────┤
│             │                                                           │
│  ◉ Overview │  Dashboard                                                │
│  ◎ Contracts│  ┌─────────────┐ ┌─────────────┐ ┌──────────────────┐    │
│  ◎ Execution│  │  12         │ │  847        │ │  3               │    │
│  ◎ Events   │  │  Contratos  │ │  Execucoes  │ │  Erros (24h)     │    │
│  ◎ Stores   │  │  ativos     │ │  hoje       │ │                  │    │
│  ◎ Evidence │  └─────────────┘ └─────────────┘ └──────────────────┘    │
│  ◎ Metrics  │                                                           │
│  ◎ Chat LLM │  Execucoes Recentes                                      │
│             │  ┌───────────────────────────────────────────────────┐    │
│             │  │ 14:32:01  ● contract_stripe_payment     52ms  ✓  │    │
│             │  │ 14:31:45  ● contract_customer_reg       38ms  ✓  │    │
│             │  │ 14:31:12  ● contract_cart_add           12ms  ✓  │    │
│             │  │ 14:30:58  ● contract_checkout          340ms  ✓  │    │
│             │  │ 14:30:01  ● contract_health_check        5ms  ✓  │    │
│             │  │ 14:28:33  ● contract_notify_cancel      89ms  ✗  │    │
│             │  │           └→ Retry agendado: 14:33:33            │    │
│             │  └───────────────────────────────────────────────────┘    │
│             │                                                           │
│             │  Proximos Cron Jobs                                       │
│             │  ┌───────────────────────────────────────────────────┐    │
│             │  │ Hoje 18:00  contract_daily_summary                │    │
│             │  │ Amanha 07:00  contract_weekly_report              │    │
│             │  │ Amanha 08:00  contract_daily_billing              │    │
│             │  └───────────────────────────────────────────────────┘    │
│             │                                                           │
└─────────────┴───────────────────────────────────────────────────────────┘
```

### 6.3 Mockup: Detalhe de Execucao

```
┌─────────────────────────────────────────────────────────────────────────┐
│  SIML Runtime Engine                              ▸ v0.3.1   ● Online  │
├─────────────┬───────────────────────────────────────────────────────────┤
│             │                                                           │
│  ◎ Overview │  Execucao: req_7f3a8b2c                                  │
│  ◎ Contracts│                                                           │
│  ◉ Execution│  Contrato: contract_stripe_payment v3.1.0                │
│  ◎ Events   │  Trigger:  POST /webhook/stripe-payment                  │
│  ◎ Stores   │  Inicio:   2024-11-15 14:32:01.234                      │
│  ◎ Evidence │  Duracao:  52ms                                          │
│  ◎ Metrics  │  Status:   ✓ Completed                                   │
│  ◎ Chat LLM │                                                           │
│             │  Steps:                                                   │
│             │  ┌───────────────────────────────────────────────────┐    │
│             │  │                                                   │    │
│             │  │  ✓ validate_event          2ms                    │    │
│             │  │  │                                                │    │
│             │  │  ✓ find_order              8ms                    │    │
│             │  │  │  → Encontrado: ORD-2024-0847                  │    │
│             │  │  │                                                │    │
│             │  │  ├─✓ update_order          5ms                    │    │
│             │  │  │  → status: "pago"                             │    │
│             │  │  │                                                │    │
│             │  │  ├─✓ record_payment        4ms                    │    │
│             │  │  │  → payment_abc123 = R$ 99,00                  │    │
│             │  │  │                                                │    │
│             │  │  ├─✓ send_confirmation    22ms                    │    │
│             │  │  │  → Email enviado para joao@email.com          │    │
│             │  │  │                                                │    │
│             │  │  └─✓ notify_erp           11ms                    │    │
│             │  │     → ERP notificado: HTTP 200                   │    │
│             │  │                                                   │    │
│             │  └───────────────────────────────────────────────────┘    │
│             │                                                           │
│             │  [Ver Input Completo]  [Ver Evidence]  [Re-executar]      │
│             │                                                           │
└─────────────┴───────────────────────────────────────────────────────────┘
```

### 6.4 Mockup: Chat LLM

```
┌─────────────────────────────────────────────────────────────────────────┐
│  SIML Runtime Engine                              ▸ v0.3.1   ● Online  │
├─────────────┬───────────────────────────────────────────────────────────┤
│             │                                                           │
│  ◎ Overview │  Chat LLM                                                │
│  ◎ Contracts│                                                           │
│  ◎ Execution│  ┌───────────────────────────────────────────────────┐    │
│  ◎ Events   │  │                                                   │    │
│  ◎ Stores   │  │  Voce: Preciso de um endpoint que recebe webhook │    │
│  ◎ Evidence │  │  do Mercado Pago quando um pagamento e aprovado. │    │
│  ◎ Metrics  │  │  Deve funcionar igual ao do Stripe que ja temos. │    │
│  ◉ Chat LLM │  │                                                   │    │
│             │  │  LLM: Entendi. Analisei o contrato                │    │
│             │  │  contract_stripe_payment_v3 como referencia.      │    │
│             │  │  Gerei um novo contrato adaptado para o Mercado   │    │
│             │  │  Pago:                                            │    │
│             │  │                                                   │    │
│             │  │  Diferencas principais:                           │    │
│             │  │  - Endpoint: /webhook/mercadopago-payment         │    │
│             │  │  - Auth: x-signature header (HMAC-SHA256)         │    │
│             │  │  - Payload: formato IPN do Mercado Pago           │    │
│             │  │  - Step extra: buscar detalhes via GET na API MP  │    │
│             │  │                                                   │    │
│             │  │  ┌─────────────────────────────────────────┐      │    │
│             │  │  │ contract:                               │      │    │
│             │  │  │   id: "contract_mp_payment_v1"          │      │    │
│             │  │  │   intent: |                             │      │    │
│             │  │  │     Quando pagamento Mercado Pago...    │      │    │
│             │  │  │   ...                                   │      │    │
│             │  │  └─────────────────────────────────────────┘      │    │
│             │  │                                                   │    │
│             │  │  [✓ Ativar Contrato]  [Editar Antes]  [Descartar]│    │
│             │  │                                                   │    │
│             │  └───────────────────────────────────────────────────┘    │
│             │                                                           │
│             │  ┌───────────────────────────────────────┐ [Enviar]       │
│             │  │ Digite sua mensagem...                │                │
│             │  └───────────────────────────────────────┘                │
│             │                                                           │
└─────────────┴───────────────────────────────────────────────────────────┘
```

### 6.5 Funcionalidades do Chat LLM

O chat LLM no dashboard tem acesso a:

1. **Contract Registry** — sabe todos os contratos que existem
2. **Evidence Store** — pode consultar historico de execucoes
3. **Data Store schema** — conhece a estrutura dos stores
4. **Documentacao SIML** — sabe a sintaxe de contratos

Acoes que o chat pode tomar:

| Acao | Exemplo de Prompt | O que acontece |
|---|---|---|
| Criar contrato | "Adicione um endpoint GET /api/products" | Gera YAML, usuario aprova, contrato e ativado |
| Modificar contrato | "Adicione validacao de estoque minimo no checkout" | Mostra diff do contrato, usuario aprova |
| Diagnosticar erro | "Por que o webhook do Stripe falhou ontem as 15h?" | Consulta evidence store, explica o erro |
| Gerar relatorio | "Quantos pedidos foram cancelados esta semana?" | Query no data store, retorna resultado |
| Explicar contrato | "O que o contract_daily_billing faz exatamente?" | Le o contrato e explica em linguagem natural |

---

## 7. Stack Tecnico Proposta

### 7.1 Decisoes e Justificativas

| Camada | Escolha | Alternativa | Justificativa |
|---|---|---|---|
| **Runtime** | Bun | Deno, Node.js | Performance superior, TypeScript nativo, startup rapido, SQLite built-in |
| **HTTP** | Hono | Elysia, Express | Leve (14KB), multi-runtime, middleware composable, tipagem forte |
| **LLM** | Claude API | OpenAI, modelo local | Melhor em interpretacao de intencao, context window grande para contratos complexos |
| **LLM rapido** | Claude Haiku / modelo local | GPT-4o-mini | Para tarefas simples no dashboard (autocomplete, validacao) |
| **Store primario** | SQLite (via better-sqlite3 ou bun:sqlite) | PostgreSQL | Zero config, embedded, backup trivial (copiar arquivo), ACID |
| **Store escalavel** | PostgreSQL (opcional) | MySQL, CockroachDB | Quando SQLite nao basta: concorrencia alta, replicacao |
| **Queue** | BullMQ (Redis) | pgqueue, Bun nativo | Maduro, confiavel, dashboard pronto (Bull Board) |
| **Dashboard** | SvelteKit | Next.js, Astro | Leve, rapido, SSR, excelente DX |
| **Deploy** | Docker single-container | Kubernetes, bare metal | Simplicidade maxima para MVP |
| **Contratos** | YAML | JSON, TOML, DSL custom | Legivel, familiar, facil de gerar via LLM |

### 7.2 Dependencias Minimas

```json
{
  "dependencies": {
    "hono": "^4.0.0",
    "better-sqlite3": "^11.0.0",
    "bullmq": "^5.0.0",
    "ioredis": "^5.0.0",
    "yaml": "^2.0.0",
    "zod": "^3.0.0",
    "cron-parser": "^4.0.0",
    "@anthropic-ai/sdk": "^0.30.0",
    "nanoid": "^5.0.0",
    "pino": "^9.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/better-sqlite3": "^7.0.0",
    "vitest": "^2.0.0"
  }
}
```

### 7.3 Configuracao de Deploy

```dockerfile
FROM oven/bun:1.1-alpine

WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

COPY . .

# SQLite data persiste em volume
VOLUME /app/data

# Porta unica para HTTP + Dashboard
EXPOSE 3000

ENV NODE_ENV=production
ENV DATA_DIR=/app/data
ENV CONTRACTS_DIR=/app/contracts

CMD ["bun", "run", "src/main.ts"]
```

```yaml
# docker-compose.yml
version: "3.8"
services:
  engine:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data          # SQLite + evidence
      - ./contracts:/app/contracts # contratos YAML
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

---

## 8. Comparacao com Alternativas

### 8.1 Tabela Comparativa

```
┌───────────────────┬──────────────┬──────────────┬──────────────┬──────────────┬──────────────┐
│                   │ n8n/Zapier   │ Supabase     │ Hasura       │ Express      │ SIML Engine  │
│                   │ Make         │ Firebase     │ PostgREST    │ FastAPI      │              │
├───────────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
│ Definicao de      │ Visual       │ SQL +        │ SQL +        │ Codigo       │ Intencao em  │
│ logica            │ (drag-drop)  │ Functions    │ Permissions  │ imperativo   │ linguagem    │
│                   │              │              │              │              │ natural +    │
│                   │              │              │              │              │ steps YAML   │
├───────────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
│ Quem cria         │ Analista/    │ Dev backend  │ Dev backend  │ Dev backend  │ Qualquer     │
│                   │ no-coder     │              │              │              │ pessoa que   │
│                   │              │              │              │              │ sabe o que   │
│                   │              │              │              │              │ quer          │
├───────────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
│ Complexidade      │ Baixa-media  │ Media-alta   │ Media        │ Alta         │ Baixa-media  │
│ de setup          │              │              │              │              │              │
├───────────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
│ Performance       │ Baixa        │ Alta         │ Alta         │ Muito alta   │ Alta         │
│                   │ (webhook     │              │              │              │ (sem LLM no  │
│                   │  delays)     │              │              │              │  hot path)   │
├───────────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
│ Auditabilidade    │ Basica       │ Basica       │ Nenhuma      │ Manual       │ Total        │
│                   │ (logs de     │              │              │ (voce        │ (evidence    │
│                   │  execucao)   │              │              │  implementa) │  built-in)   │
├───────────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
│ Customizacao      │ Limitada     │ Alta         │ Media        │ Ilimitada    │ Alta         │
│                   │ (nodes       │ (code)       │ (SQL +       │              │ (custom      │
│                   │  pre-feitos) │              │  actions)    │              │  actions)    │
├───────────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
│ Webhook handling  │ Excelente    │ Basico       │ Nao tem      │ Manual       │ Excelente    │
│                   │              │ (Edge Func)  │              │              │ (first-class)│
├───────────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
│ Cron jobs         │ Sim          │ Limitado     │ Nao          │ Manual       │ Sim          │
│                   │              │ (pg_cron)    │              │ (cron lib)   │ (first-class)│
├───────────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
│ Event-driven      │ Parcial      │ Sim          │ Sim          │ Manual       │ Sim          │
│                   │ (triggers)   │ (Realtime)   │ (Subscript.) │              │ (Event Bus)  │
├───────────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
│ Auto-expansivel   │ Nao          │ Nao          │ Nao          │ Nao          │ Sim          │
│ via LLM           │              │              │              │              │ (Chat gera   │
│                   │              │              │              │              │  contratos)  │
├───────────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
│ Custo             │ Alto         │ Medio        │ Gratuito     │ Gratuito     │ Gratuito     │
│                   │ (por exec)   │ (por uso)    │ (self-host)  │              │ (self-host)  │
├───────────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
│ Vendor lock-in    │ Alto         │ Alto         │ Medio        │ Nenhum       │ Nenhum       │
│                   │              │              │              │              │ (YAML aberto)│
└───────────────────┴──────────────┴──────────────┴──────────────┴──────────────┴──────────────┘
```

### 8.2 Quando NAO usar SIML Engine

- **Aplicacao com UI complexa** — SIML Engine e backend puro. Para frontend, use qualquer framework normalmente.
- **Sistemas de ultra-baixa latencia** (trading, gaming) — a camada de resolucao de contratos adiciona overhead vs codigo direto.
- **Logica matematica/algoritmica pura** — se o problema e um algoritmo puro (ordenacao, pathfinding, ML), escrever codigo e melhor.
- **Equipes grandes com devs experientes** — se voce tem 10 devs seniors, Express/FastAPI com boa arquitetura pode ser mais eficiente.

### 8.3 Quando SIML Engine brilha

- **Equipes pequenas** que precisam de backend completo rapido
- **Integracao de sistemas** com muitos webhooks, APIs externas, transformacoes
- **Prototipagem rapida** — vai de ideia a backend funcional em horas
- **Compliance** — evidencia automatica de tudo que aconteceu
- **Sistemas que mudam muito** — mudar intencao e mais rapido que refatorar codigo

---

## 9. O que e LLM e o que e Deterministico

### 9.1 Separacao Clara

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   TEMPO DE DESIGN (LLM ativo)                                  │
│   ─────────────────────────────                                 │
│                                                                 │
│   ● Criar contratos a partir de descricao em linguagem natural  │
│   ● Interpretar intencao ambigua e pedir esclarecimento         │
│   ● Sugerir steps com base na intencao declarada                │
│   ● Gerar schemas de validacao a partir de exemplos             │
│   ● Diagnosticar erros analisando evidence + contrato           │
│   ● Sugerir otimizacoes baseado em metricas                     │
│   ● Traduzir entre formatos (converter API doc em contrato)     │
│                                                                 │
│   Latencia aceitavel: 2-30 segundos (humano esperando)          │
│   Frequencia: dezenas por dia                                   │
│   Custo: aceitavel (design-time, nao escala com requests)       │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   TEMPO DE EXECUCAO (100% deterministico, zero LLM)            │
│   ──────────────────────────────────────────────────            │
│                                                                 │
│   ● Routing: hash map lookup (path -> contract_id)              │
│   ● Validacao: schema pre-compilado (Zod runtime)               │
│   ● Transform: regras pre-compiladas (template engine)          │
│   ● Query/Insert/Update: SQL pre-preparado                      │
│   ● HTTP outbound: URL e body resolvidos por template           │
│   ● Event dispatch: subscription table lookup                   │
│   ● Cron: expressao pre-parseada                                │
│   ● Evidence: insert em tabela de audit                         │
│                                                                 │
│   Latencia: 1-100ms (dependendo de I/O)                         │
│   Frequencia: milhares por segundo                              │
│   Custo: zero (nenhuma API call externa para logica)            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 9.2 Por que essa separacao e critica

**Confiabilidade.** Um LLM pode alucinar, responder diferente para o mesmo input, ou demorar. Se cada request HTTP dependesse de uma chamada LLM, o sistema seria:
- Lento (latencia de API LLM: 500ms-5s)
- Caro (custo por token * volume de requests)
- Nao-deterministico (mesmo input poderia gerar output diferente)
- Fragil (se a API LLM cair, tudo para)

**A analogia correta:** o LLM e o arquiteto que desenha a planta. O engine e o pedreiro que executa a planta. O pedreiro nao precisa entender por que a parede vai ali — so precisa seguir a planta fielmente.

### 9.3 Onde o LLM PODE atuar em runtime (opcional, com fallback)

Ha um caso de uso onde o LLM pode participar do runtime, mas sempre com fallback deterministico:

```yaml
steps:
  - id: classify_support_ticket
    action: llm_classify
    input: "{{ input.message }}"
    categories: [billing, technical, general, spam]
    fallback: "general"  # se LLM falha, classifica como general
    cache: true           # mesma mensagem = mesma classificacao
    timeout: 3s           # se demorar mais, usa fallback
```

Isso e explicitamente opt-in no contrato. O padrao e zero LLM em runtime.

### 9.4 O Compilador de Contratos

O momento em que o LLM "sai de cena" e quando o contrato e **compilado**:

```
┌──────────────────┐        ┌──────────────────┐        ┌──────────────────┐
│ Contrato YAML    │        │ Compilador       │        │ Plano Executavel │
│ (com intent em   │ ─────> │ (valida, resolve │ ─────> │ (DAG de steps,   │
│  linguagem       │        │  tipos, prepara  │        │  schemas Zod,    │
│  natural)        │        │  SQL, compila    │        │  SQL preparado,  │
│                  │        │  templates)      │        │  templates        │
│                  │        │                  │        │  compilados)     │
└──────────────────┘        └──────────────────┘        └──────────────────┘
                                    │
                              LLM pode ajudar
                              aqui (opcional):
                              - Inferir schema de
                                input a partir da
                                intent
                              - Sugerir steps
                                faltantes
                              - Validar coerencia
```

Depois de compilado, o plano executavel e puro: nada de LLM, nada de ambiguidade, nada de "interpretacao". E uma sequencia de operacoes concretas com tipos definidos.

---

## 10. MVP Realista

### 10.1 Escopo do MVP (4-6 semanas)

**Semana 1-2: Core Engine**

- [ ] HTTP Gateway com Hono (receber requests, retornar responses)
- [ ] Contract Registry (carregar YAML de uma pasta, mapear rotas)
- [ ] Execution Engine basico (steps sequenciais: validate, query, insert, update, transform)
- [ ] Data Store com SQLite (tabelas criadas automaticamente a partir dos contratos)
- [ ] Template engine para `{{ }}` references
- [ ] Evidence Store (tabela _evidence com log de toda execucao)

**Semana 3: Triggers e Comunicacao**

- [ ] Scheduler basico (cron com node-cron ou similar)
- [ ] Event Bus in-process (emit_event + listeners)
- [ ] Outbound HTTP (http_post step com retry basico)
- [ ] for_each step (iteracao sobre listas)

**Semana 4: Dashboard v0**

- [ ] SvelteKit app servido pelo mesmo processo Hono
- [ ] Tela de contratos ativos (lista + detalhes)
- [ ] Tela de execucoes recentes (timeline + detalhe de steps)
- [ ] Tela de erros

**Semana 5: Chat LLM**

- [ ] Integracao com Claude API no dashboard
- [ ] Context: lista de contratos, schema dos stores, evidence recente
- [ ] Acao: gerar novo contrato YAML a partir de descricao
- [ ] Botao "Ativar Contrato" que faz hot-reload

**Semana 6: Polish e Demo**

- [ ] Contrato de exemplo completo (e-commerce mini: product CRUD + checkout + payment webhook)
- [ ] Testes automatizados dos contratos de exemplo
- [ ] Docker single-container funcionando
- [ ] README com quick start

### 10.2 O que NAO esta no MVP

- Autenticacao/autorizacao (middleware generico basta)
- Multi-tenancy
- Replicacao/clustering
- Editor visual de contratos (YAML no chat e suficiente)
- PostgreSQL (SQLite basta para demo)
- Metricas sofisticadas (logs simples bastam)

### 10.3 Estrutura de Pastas Proposta

```
siml-engine/
├── package.json
├── tsconfig.json
├── Dockerfile
├── docker-compose.yml
├── README.md
│
├── contracts/                    # Contratos YAML (hot-reloadable)
│   ├── examples/
│   │   ├── hello-world.yaml      # GET /hello -> { message: "world" }
│   │   ├── echo.yaml             # POST /echo -> retorna o body recebido
│   │   └── ecommerce/
│   │       ├── products.yaml
│   │       ├── customers.yaml
│   │       ├── checkout.yaml
│   │       ├── payment-webhook.yaml
│   │       └── daily-billing.yaml
│   └── .gitkeep
│
├── src/
│   ├── main.ts                   # Entrypoint: inicia tudo
│   │
│   ├── gateway/
│   │   ├── server.ts             # Hono app setup
│   │   ├── router.ts             # Router dinamico (contract -> route)
│   │   └── middleware/
│   │       ├── auth.ts
│   │       ├── rate-limit.ts
│   │       └── request-normalizer.ts
│   │
│   ├── registry/
│   │   ├── contract-registry.ts  # Carrega, valida, indexa contratos
│   │   ├── contract-loader.ts    # Le YAML, faz parse
│   │   ├── contract-compiler.ts  # Compila contrato em plano executavel
│   │   └── contract-watcher.ts   # File watcher para hot-reload
│   │
│   ├── resolver/
│   │   ├── intent-resolver.ts    # Resolve request -> plano de execucao
│   │   ├── pattern-matcher.ts    # Match deterministico (rapido)
│   │   └── llm-resolver.ts       # Fallback LLM (raro, design-time)
│   │
│   ├── engine/
│   │   ├── execution-engine.ts   # Executa plano step-by-step
│   │   ├── step-executor.ts      # Switch de tipos de step
│   │   └── steps/
│   │       ├── validate.ts       # Step: validacao com Zod
│   │       ├── transform.ts      # Step: transformacao de dados
│   │       ├── query.ts          # Step: SELECT no store
│   │       ├── insert.ts         # Step: INSERT no store
│   │       ├── update.ts         # Step: UPDATE no store
│   │       ├── delete.ts         # Step: DELETE no store
│   │       ├── http-post.ts      # Step: HTTP request de saida
│   │       ├── for-each.ts       # Step: iteracao
│   │       ├── emit-event.ts     # Step: publicar evento
│   │       └── llm-classify.ts   # Step: classificacao via LLM (opt-in)
│   │
│   ├── store/
│   │   ├── data-store.ts         # Interface abstrata
│   │   ├── sqlite-store.ts       # Implementacao SQLite
│   │   ├── schema-manager.ts     # Cria/altera tabelas automaticamente
│   │   └── evidence-store.ts     # Tabela _evidence (audit trail)
│   │
│   ├── scheduler/
│   │   ├── scheduler.ts          # Cron loop + delayed jobs
│   │   └── cron-parser.ts        # Parse de expressoes cron
│   │
│   ├── events/
│   │   ├── event-bus.ts          # Pub/sub in-process
│   │   └── event-store.ts        # Persistencia de eventos
│   │
│   ├── outbound/
│   │   ├── http-client.ts        # HTTP client com retry, timeout
│   │   └── retry-queue.ts        # Fila de retries (BullMQ)
│   │
│   ├── template/
│   │   ├── template-engine.ts    # Resolve {{ }} expressions
│   │   ├── filters.ts            # format_brl, format_date, etc
│   │   └── functions.ts          # now, generate_id, etc
│   │
│   ├── dashboard/
│   │   ├── api.ts                # API routes para o dashboard
│   │   └── llm-chat.ts           # Endpoint de chat com Claude
│   │
│   └── shared/
│       ├── types.ts              # Tipos TypeScript compartilhados
│       ├── errors.ts             # Classes de erro
│       ├── logger.ts             # Pino logger
│       └── config.ts             # Configuracao do sistema
│
├── dashboard/                    # SvelteKit app (build separado)
│   ├── src/
│   │   ├── routes/
│   │   │   ├── +page.svelte      # Overview
│   │   │   ├── contracts/
│   │   │   ├── executions/
│   │   │   ├── events/
│   │   │   ├── stores/
│   │   │   ├── evidence/
│   │   │   └── chat/
│   │   └── lib/
│   │       ├── api.ts            # Client para API do engine
│   │       └── components/
│   ├── package.json
│   └── svelte.config.js
│
├── tests/
│   ├── engine/
│   │   ├── execution-engine.test.ts
│   │   ├── steps/
│   │   │   ├── validate.test.ts
│   │   │   ├── transform.test.ts
│   │   │   └── query.test.ts
│   │   └── template-engine.test.ts
│   ├── registry/
│   │   └── contract-loader.test.ts
│   └── integration/
│       ├── webhook-flow.test.ts
│       ├── cron-flow.test.ts
│       └── event-flow.test.ts
│
└── data/                         # Runtime data (gitignored)
    ├── engine.db                 # SQLite database
    └── evidence.db               # Evidence database (separado para performance)
```

### 10.4 Hello World: Do Zero ao Primeiro Contrato

**1. Instalar e rodar:**

```bash
git clone https://github.com/seu-org/siml-engine.git
cd siml-engine
bun install
bun run dev
# → Server running on http://localhost:3000
# → Loaded 2 contracts from ./contracts/examples/
# → Dashboard: http://localhost:3000/_dashboard
```

**2. Criar um contrato:**

```yaml
# contracts/my-first-api.yaml
contract:
  id: "my_first_api"
  version: "1.0.0"

  intent: |
    Uma API simples de notas/lembretes. Permite criar, listar e deletar notas.

  # --- Criar nota ---
  endpoints:
    - trigger:
        type: http
        path: /api/notes
        method: POST
      input:
        schema:
          title: { type: string, required: true, max_length: 200 }
          content: { type: string, required: false }
      steps:
        - id: create
          action: insert
          store: notes
          data:
            title: "{{ input.title }}"
            content: "{{ input.content | default('') }}"
            created_at: "{{ now }}"
      response:
        status: 201
        body: "{{ steps.create.result }}"

    # --- Listar notas ---
    - trigger:
        type: http
        path: /api/notes
        method: GET
      steps:
        - id: list
          action: query
          store: notes
          order_by: created_at desc
          limit: 100
      response:
        status: 200
        body: "{{ steps.list.results }}"

    # --- Deletar nota ---
    - trigger:
        type: http
        path: /api/notes/:id
        method: DELETE
      steps:
        - id: delete
          action: delete
          store: notes
          where:
            id: "{{ params.id }}"
          expect: exactly_one
          on_fail: abort(404, { error: "Nota nao encontrada" })
      response:
        status: 200
        body: { deleted: true }
```

**3. Testar:**

```bash
# Criar nota
curl -X POST http://localhost:3000/api/notes \
  -H "Content-Type: application/json" \
  -d '{"title": "Minha primeira nota", "content": "Funcionou!"}'

# Listar
curl http://localhost:3000/api/notes

# Deletar
curl -X DELETE http://localhost:3000/api/notes/1
```

**4. Ver no dashboard:**

Abrir `http://localhost:3000/_dashboard` e ver o contrato ativo, as 3 execucoes, e os dados na store `notes`.

**5. Expandir via chat:**

No chat do dashboard, digitar: "Adicione um campo `tags` opcional no POST e um endpoint GET /api/notes/search?tag=X para filtrar por tag."

O LLM gera a versao atualizada do contrato. Clicar "Ativar". Pronto.

---

## Conclusao

O SIML Runtime Engine nao e um framework — e uma mudanca de paradigma. Em vez de escrever codigo que implementa logica de negocio, voce **declara a intencao** e o engine cuida da execucao.

A chave e a separacao entre design-time (LLM, criatividade, interpretacao) e runtime (deterministico, rapido, auditavel). Isso da o melhor dos dois mundos: a facilidade de "falar o que voce quer" com a confiabilidade de "codigo compilado executando".

O MVP proposto e construivel em 4-6 semanas por um dev solo. O resultado e um servidor que roda contratos, nao codigo — e que pode ser expandido conversando com ele.
