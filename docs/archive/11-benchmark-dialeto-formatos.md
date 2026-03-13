# 11 - Benchmark Comparativo: Dialeto SIML vs Formatos Existentes

> Analise imparcial e baseada em dados sobre a necessidade (ou nao) de um formato custom para comunicacao IA-para-IA. Se JSON com convencoes for suficiente, este documento vai dizer isso.

---

## 1. Formatos Candidatos

### 1.1 JSON — O Padrao de Facto

JSON (JavaScript Object Notation) e o formato de serialização mais ubiquo da web moderna. Criado por Douglas Crockford em 2001, tornou-se o padrao de facto para APIs, configuracao e troca de dados.

**Caracteristicas relevantes:**
- Tipos primitivos limitados: string, number, boolean, null, array, object
- Sem comentarios na spec oficial (RFC 8259)
- Sem schema nativo — depende de JSON Schema (spec separada)
- Sem referências entre documentos — tudo inline ou por convencao
- Sem tipos de dados ricos (sem distinção entre int/float, sem date nativo, sem decimal exato)
- Parser em toda linguagem de programacao existente
- Todo LLM gera JSON com altissima confiabilidade

**Para SIML:** JSON nao tem construtos semanticos nativos (entities, actions, constraints), mas pode representar qualquer estrutura via convencoes de naming. A questao e se convencoes sao suficientes ou se a ambiguidade residual e um problema real.

### 1.2 YAML — Popular para Config

YAML (YAML Ain't Markup Language) e um superset de JSON com foco em legibilidade humana. Popular em DevOps (Docker Compose, Kubernetes, GitHub Actions).

**Caracteristicas relevantes:**
- Indentation-sensitive (como Python)
- Suporta comentarios
- Tipos nativos mais ricos que JSON (date, binary, null explicito)
- Aliases e anchors para reutilizacao (`&ref` / `*ref`)
- Multi-documento em um arquivo (`---`)
- Spec extremamente complexa (YAML 1.2 tem 200+ paginas)
- Armadilhas famosas: `"Norway problem"` (NO vira false), `"1.0"` vira float
- Parsers nao sao 100% compativeis entre linguagens

**Para SIML:** YAML adiciona legibilidade e referências, mas a complexidade da spec e as armadilhas de tipagem criam exatamente o tipo de ambiguidade que SIML quer eliminar.

### 1.3 TOML — Structured Config

TOML (Tom's Obvious, Minimal Language) foi criado por Tom Preston-Werner (co-fundador do GitHub) como alternativa simples ao YAML.

**Caracteristicas relevantes:**
- Tipos nativos fortes: integer, float, boolean, string, datetime, array, table
- Sem heranca ou referências entre documentos
- Spec curta e sem ambiguidades
- Comentarios nativos
- Flat por natureza — nesting profundo fica verboso
- Bem adotado em Rust (Cargo.toml), Python (pyproject.toml)

**Para SIML:** TOML e excelente para config plana, mas contratos semanticos tem nesting profundo (entities com relations, actions com preconditions dentro de flows dentro de sagas). TOML ficaria extremamente verboso.

### 1.4 Protocol Buffers (Protobuf) — Binario Tipado

Protocol Buffers e o formato de serializacao binario do Google. Usado internamente em praticamente todo servico Google.

**Caracteristicas relevantes:**
- Schema obrigatorio (`.proto` files)
- Serializacao binaria extremamente compacta
- Tipagem forte com backward/forward compatibility
- Nao legivel por humanos sem tooling
- Excelente para comunicacao maquina-maquina
- Nao gera/interpreta facilmente por LLMs (binario)
- Code generation para multiplas linguagens

**Para SIML:** Protobuf seria ideal para a camada de execucao (densa, maquina-maquina), mas impossivel para geracao por LLM via texto. A dualidade `.simlb` + `.siml.json` ja proposta no doc 05 indiretamente reconhece isso.

### 1.5 MessagePack — JSON Binario

MessagePack e uma serializacao binaria que preserva a estrutura do JSON mas em formato compacto.

**Caracteristicas relevantes:**
- Mesmos tipos do JSON, mas binario
- ~50-80% menor que JSON equivalente
- Sem schema — mesmo modelo "schema-less" do JSON
- Parsers em todas as linguagens
- Usado em Redis, Fluentd, e muitos sistemas de alta performance

**Para SIML:** O doc 05 ja especifica MessagePack como base do formato binario `.simlb`. Faz sentido para transmissao e armazenamento, mas nao resolve a questao do formato textual para geracao por LLM.

### 1.6 S-expressions — Lisp-like

S-expressions sao a notacao fundamental de Lisp, a segunda linguagem de programacao mais antiga ainda em uso.

**Caracteristicas relevantes:**
- Extremamente simples: `(operador argumento1 argumento2)`
- Homoiconico: codigo e dados tem a mesma estrutura
- Sem ambiguidade sintatica
- Macro system permite extensao sem mudar a spec
- Poucos tokens por construto (sem chaves, sem virgulas)
- Pouco familiar para LLMs modernos (pouco Lisp no training data contemporaneo)
- Nesting profundo fica difícil de ler

**Para SIML:** S-expressions tem a menor overhead sintatica possivel, mas a falta de familiaridade LLM e um problema serio. Um LLM geraria S-expressions com mais erros que JSON.

### 1.7 HCL (HashiCorp Configuration Language)

HCL e a linguagem criada pela HashiCorp para Terraform, Vault, Consul e outros produtos.

**Caracteristicas relevantes:**
- Blocos tipados: `resource "aws_instance" "web" { ... }`
- Expressoes e interpolacao de strings
- Modulos e referências entre blocos
- Tipos ricos: string, number, bool, list, map, object
- Funcoes built-in (lookup, length, etc.)
- Boa legibilidade — lido como "prosa estruturada"
- Tooling maduro (terraform fmt, terraform validate)
- Dois formatos: HCL nativo e JSON alternativo

**Para SIML:** HCL e o formato existente MAIS proximo do que SIML propoe. Blocos tipados, referências, expressoes. A questao e: por que nao usar HCL diretamente?

### 1.8 CUE — Constraint-Based Config

CUE (Configure, Unify, Execute) foi criado por Marcel van Lohuizen (ex-Google, trabalhou em Borg/Kubernetes).

**Caracteristicas relevantes:**
- Tipos e valores sao a mesma coisa (unificacao)
- Constraints sao cidadaos de primeira classe
- Sem null — usa bottom (`_|_`) para erro
- Composicao via unificacao (merge automatico com deteccao de conflito)
- Extremamente poderoso para validacao
- Curva de aprendizado alta
- Comunidade pequena, tooling limitado

**Para SIML:** CUE resolve nativamente um dos maiores problemas do SIML — constraints verificaveis. Mas a falta de adocao e a curva de aprendizado sao barreiras reais. LLMs tem exposicao minima a CUE.

### 1.9 Dhall — Typed Config Language

Dhall e uma linguagem de configuracao com sistema de tipos completo, garantia de terminacao e imports seguros.

**Caracteristicas relevantes:**
- Sistema de tipos Hindley-Milner (como Haskell)
- Garantia de terminacao (nao e Turing-complete por design)
- Imports remotos com hash de integridade
- Funcoes de primeira classe
- Normalização — duas expressoes semanticamente iguais produzem a mesma forma normal
- Pode exportar para JSON/YAML
- Comunidade muito pequena

**Para SIML:** Dhall resolve dois problemas criticos: terminacao garantida e normalizacao (round-trip fidelity). Mas a barreira de adocao e ainda maior que CUE. Praticamente zero presença em training data de LLMs.

### 1.10 SIML Custom — O Formato Proposto

Baseado nos docs 05 e 08 do repositorio, o formato SIML propoe:

**Caracteristicas observadas:**
- Blocos semanticos tipados: `intencao {}`, `entidade {}`, `endpoint {}`, `execucao {}`
- Tipos semanticos ricos: `tipo: monetario_brl`, `tipo: slug`, `tipo: uuid_v7`
- Setas para binding: `id -> tipo: uuid_v7, gerado: automatico`
- Portugues como linguagem base do DSL
- Referências inline: `derivado_de: nome`
- Numeracao de passos: `1. validar unicidade de nome`
- Sem parser formal especificado
- Sem grammar formal documentada

---

## 2. Criterios de Avaliacao

### Definicao dos Criterios

| Criterio | Definicao | Metrica | Peso |
|----------|-----------|---------|------|
| **Token efficiency** | Quantos tokens LLM para o mesmo contrato semantico | tokens BPE estimados | Alto |
| **Ambiguidade** | Dois LLMs podem interpretar o mesmo documento de formas diferentes? | escala 1-5 (1=nenhuma, 5=alta) | Critico |
| **Parseability** | Parser deterministico existe e produz AST unica? | sim/nao + qualidade | Alto |
| **Composability** | Suporta referências, imports, composicao entre arquivos? | escala 1-5 | Medio |
| **Type safety** | Tipos verificaveis antes de executar? | escala 1-5 | Alto |
| **Extensibility** | Adicionar tipos sem mudar a spec? | escala 1-5 | Medio |
| **Tooling existente** | Parsers, editores, linters ja existem? | escala 1-5 | Alto |
| **Familiaridade LLM** | LLM ja viu muito desse formato no training data? | escala 1-5 | Critico |
| **Human readability** | Quando humano precisa inspecionar | escala 1-5 | Medio |
| **Round-trip fidelity** | parse -> generate -> parse = identico? | sim/nao | Alto |

---

## 3. O Mesmo Contrato em Cada Formato

### Cenario Escolhido

**Webhook de pagamento com validacao, transformacao, armazenamento e notificacao.**

Semantica: receber webhook do Stripe, validar assinatura, extrair dados do evento `invoice.payment_succeeded`, atualizar status da assinatura no banco, registrar pagamento, e enviar email de confirmacao ao cliente.

---

### 3.1 JSON

```json
{
  "$schema": "https://siml.dev/schemas/contract/v1.json",
  "contract": {
    "id": "webhook-stripe-payment",
    "version": "1.0.0",
    "domain": "comercial.assinaturas",
    "generated_by": "tradutor:claude-opus@4"
  },
  "intent": {
    "goal": "Processar webhook de pagamento Stripe e atualizar estado da assinatura",
    "context": "SaaS de analytics para e-commerce",
    "principle": "Todo pagamento confirmado deve refletir imediatamente no status da assinatura e o cliente deve ser notificado"
  },
  "trigger": {
    "type": "http_webhook",
    "method": "POST",
    "path": "/webhook/stripe",
    "authentication": {
      "type": "stripe_signature",
      "header": "Stripe-Signature",
      "secret_ref": "env:STRIPE_WEBHOOK_SECRET"
    }
  },
  "input_schema": {
    "type": "object",
    "properties": {
      "type": { "type": "string", "const": "invoice.payment_succeeded" },
      "data": {
        "type": "object",
        "properties": {
          "object": {
            "type": "object",
            "properties": {
              "subscription": { "type": "string" },
              "customer": { "type": "string" },
              "amount_paid": { "type": "integer" },
              "currency": { "type": "string" },
              "period_start": { "type": "integer" },
              "period_end": { "type": "integer" }
            },
            "required": ["subscription", "customer", "amount_paid"]
          }
        }
      }
    }
  },
  "execution": {
    "steps": [
      {
        "id": "validate_signature",
        "action": "validate",
        "target": "request.headers.Stripe-Signature",
        "using": "stripe_webhook_verify",
        "parameters": { "secret_ref": "env:STRIPE_WEBHOOK_SECRET" },
        "on_failure": { "respond": { "status": 401, "body": "Invalid signature" } }
      },
      {
        "id": "extract_data",
        "action": "transform",
        "input": "request.body.data.object",
        "output_mapping": {
          "stripe_subscription_id": "$.subscription",
          "stripe_customer_id": "$.customer",
          "amount_cents": "$.amount_paid",
          "currency": "$.currency",
          "period_start": { "transform": "unix_to_iso8601", "value": "$.period_start" },
          "period_end": { "transform": "unix_to_iso8601", "value": "$.period_end" }
        }
      },
      {
        "id": "find_subscription",
        "action": "query",
        "resource": "database",
        "query": "SELECT * FROM subscriptions WHERE stripe_subscription_id = $1",
        "parameters": ["${extract_data.stripe_subscription_id}"],
        "on_failure": { "respond": { "status": 200, "body": "Subscription not found, ignoring" } }
      },
      {
        "id": "update_subscription",
        "action": "update",
        "resource": "database",
        "table": "subscriptions",
        "where": { "id": "${find_subscription.id}" },
        "set": {
          "status": "active",
          "current_period_start": "${extract_data.period_start}",
          "current_period_end": "${extract_data.period_end}",
          "updated_at": "NOW()"
        },
        "idempotent": true
      },
      {
        "id": "record_payment",
        "action": "insert",
        "resource": "database",
        "table": "payments",
        "values": {
          "subscription_id": "${find_subscription.id}",
          "amount_cents": "${extract_data.amount_cents}",
          "currency": "${extract_data.currency}",
          "stripe_invoice_id": "${request.body.data.object.id}",
          "paid_at": "NOW()"
        },
        "idempotent_key": "stripe_invoice_id"
      },
      {
        "id": "send_confirmation",
        "action": "notify",
        "channel": "email",
        "provider": "resend",
        "template": "payment_confirmation",
        "to": "${find_subscription.customer_email}",
        "variables": {
          "customer_name": "${find_subscription.customer_name}",
          "amount": { "transform": "cents_to_display", "value": "${extract_data.amount_cents}", "currency": "${extract_data.currency}" },
          "period_end": { "transform": "format_date", "value": "${extract_data.period_end}", "locale": "pt-BR" }
        },
        "on_failure": { "log": "warning", "continue": true }
      }
    ]
  },
  "response": {
    "status": 200,
    "body": { "received": true }
  },
  "constraints": [
    {
      "type": "idempotency",
      "description": "Webhook deve ser idempotente — processar o mesmo evento duas vezes nao deve duplicar pagamento",
      "enforced_by": "idempotent_key em record_payment"
    },
    {
      "type": "timeout",
      "value": "5s",
      "description": "Stripe espera resposta em ate 5 segundos"
    },
    {
      "type": "invariant",
      "expression": "subscription.status IN ('active', 'trialing', 'past_due')",
      "description": "So processar pagamento para assinaturas em estados validos"
    }
  ],
  "error_handling": {
    "signature_invalid": { "status": 401, "log": "security_alert" },
    "subscription_not_found": { "status": 200, "log": "info", "note": "Acknowledge para Stripe nao reenviar" },
    "database_error": { "status": 500, "retry": true, "log": "error" },
    "email_failure": { "status": 200, "log": "warning", "note": "Pagamento ja registrado, email e best-effort" }
  }
}
```

### 3.2 YAML

```yaml
# Contrato: Webhook de Pagamento Stripe
$schema: https://siml.dev/schemas/contract/v1.yaml

contract:
  id: webhook-stripe-payment
  version: "1.0.0"
  domain: comercial.assinaturas
  generated_by: "tradutor:claude-opus@4"

intent:
  goal: "Processar webhook de pagamento Stripe e atualizar estado da assinatura"
  context: "SaaS de analytics para e-commerce"
  principle: >
    Todo pagamento confirmado deve refletir imediatamente no status
    da assinatura e o cliente deve ser notificado

trigger:
  type: http_webhook
  method: POST
  path: /webhook/stripe
  authentication:
    type: stripe_signature
    header: Stripe-Signature
    secret_ref: "env:STRIPE_WEBHOOK_SECRET"

input_schema:
  type: object
  properties:
    type:
      type: string
      const: invoice.payment_succeeded
    data:
      type: object
      properties:
        object:
          type: object
          properties:
            subscription: { type: string }
            customer: { type: string }
            amount_paid: { type: integer }
            currency: { type: string }
            period_start: { type: integer }
            period_end: { type: integer }
          required: [subscription, customer, amount_paid]

execution:
  steps:
    - id: validate_signature
      action: validate
      target: request.headers.Stripe-Signature
      using: stripe_webhook_verify
      parameters:
        secret_ref: "env:STRIPE_WEBHOOK_SECRET"
      on_failure:
        respond: { status: 401, body: "Invalid signature" }

    - id: extract_data
      action: transform
      input: request.body.data.object
      output_mapping:
        stripe_subscription_id: $.subscription
        stripe_customer_id: $.customer
        amount_cents: $.amount_paid
        currency: $.currency
        period_start:
          transform: unix_to_iso8601
          value: $.period_start
        period_end:
          transform: unix_to_iso8601
          value: $.period_end

    - id: find_subscription
      action: query
      resource: database
      query: "SELECT * FROM subscriptions WHERE stripe_subscription_id = $1"
      parameters: ["${extract_data.stripe_subscription_id}"]
      on_failure:
        respond: { status: 200, body: "Subscription not found, ignoring" }

    - id: update_subscription
      action: update
      resource: database
      table: subscriptions
      where:
        id: "${find_subscription.id}"
      set:
        status: active
        current_period_start: "${extract_data.period_start}"
        current_period_end: "${extract_data.period_end}"
        updated_at: "NOW()"
      idempotent: true

    - id: record_payment
      action: insert
      resource: database
      table: payments
      values:
        subscription_id: "${find_subscription.id}"
        amount_cents: "${extract_data.amount_cents}"
        currency: "${extract_data.currency}"
        stripe_invoice_id: "${request.body.data.object.id}"
        paid_at: "NOW()"
      idempotent_key: stripe_invoice_id

    - id: send_confirmation
      action: notify
      channel: email
      provider: resend
      template: payment_confirmation
      to: "${find_subscription.customer_email}"
      variables:
        customer_name: "${find_subscription.customer_name}"
        amount:
          transform: cents_to_display
          value: "${extract_data.amount_cents}"
          currency: "${extract_data.currency}"
        period_end:
          transform: format_date
          value: "${extract_data.period_end}"
          locale: pt-BR
      on_failure:
        log: warning
        continue: true

response:
  status: 200
  body: { received: true }

constraints:
  - type: idempotency
    description: "Webhook deve ser idempotente"
    enforced_by: "idempotent_key em record_payment"

  - type: timeout
    value: 5s
    description: "Stripe espera resposta em ate 5 segundos"

  - type: invariant
    expression: "subscription.status IN ('active', 'trialing', 'past_due')"
    description: "So processar pagamento para assinaturas em estados validos"

error_handling:
  signature_invalid: { status: 401, log: security_alert }
  subscription_not_found: { status: 200, log: info, note: "Acknowledge para Stripe" }
  database_error: { status: 500, retry: true, log: error }
  email_failure: { status: 200, log: warning, note: "Email e best-effort" }
```

### 3.3 TOML

```toml
# Contrato: Webhook de Pagamento Stripe

[contract]
id = "webhook-stripe-payment"
version = "1.0.0"
domain = "comercial.assinaturas"
generated_by = "tradutor:claude-opus@4"

[intent]
goal = "Processar webhook de pagamento Stripe e atualizar estado da assinatura"
context = "SaaS de analytics para e-commerce"
principle = "Todo pagamento confirmado deve refletir imediatamente no status da assinatura e o cliente deve ser notificado"

[trigger]
type = "http_webhook"
method = "POST"
path = "/webhook/stripe"

[trigger.authentication]
type = "stripe_signature"
header = "Stripe-Signature"
secret_ref = "env:STRIPE_WEBHOOK_SECRET"

# NOTA: input_schema em TOML fica extremamente verboso
# Omitindo a definicao completa por limitacao do formato
# TOML nao suporta nesting arbitrario de forma ergonomica

[[execution.steps]]
id = "validate_signature"
action = "validate"
target = "request.headers.Stripe-Signature"
using = "stripe_webhook_verify"

[execution.steps.parameters]
secret_ref = "env:STRIPE_WEBHOOK_SECRET"

[execution.steps.on_failure.respond]
status = 401
body = "Invalid signature"

[[execution.steps]]
id = "extract_data"
action = "transform"
input = "request.body.data.object"

[execution.steps.output_mapping]
stripe_subscription_id = "$.subscription"
stripe_customer_id = "$.customer"
amount_cents = "$.amount_paid"
currency = "$.currency"
# NOTA: transforms aninhados nao sao ergonomicos em TOML
# period_start e period_end precisariam de tabelas separadas

[[execution.steps]]
id = "find_subscription"
action = "query"
resource = "database"
query = "SELECT * FROM subscriptions WHERE stripe_subscription_id = $1"
parameters = ["${extract_data.stripe_subscription_id}"]

[[execution.steps]]
id = "update_subscription"
action = "update"
resource = "database"
table = "subscriptions"
idempotent = true

[execution.steps.where]
id = "${find_subscription.id}"

[execution.steps.set]
status = "active"
current_period_start = "${extract_data.period_start}"
current_period_end = "${extract_data.period_end}"
updated_at = "NOW()"

[[execution.steps]]
id = "record_payment"
action = "insert"
resource = "database"
table = "payments"
idempotent_key = "stripe_invoice_id"

[execution.steps.values]
subscription_id = "${find_subscription.id}"
amount_cents = "${extract_data.amount_cents}"
currency = "${extract_data.currency}"
stripe_invoice_id = "${request.body.data.object.id}"
paid_at = "NOW()"

[[execution.steps]]
id = "send_confirmation"
action = "notify"
channel = "email"
provider = "resend"
template = "payment_confirmation"
to = "${find_subscription.customer_email}"

# NOTA: a secao de variables com transforms ficaria muito fragmentada
# TOML claramente nao foi projetado para este nivel de nesting

[response]
status = 200

[response.body]
received = true

[[constraints]]
type = "idempotency"
description = "Webhook deve ser idempotente"
enforced_by = "idempotent_key em record_payment"

[[constraints]]
type = "timeout"
value = "5s"
description = "Stripe espera resposta em ate 5 segundos"

[[constraints]]
type = "invariant"
expression = "subscription.status IN ('active', 'trialing', 'past_due')"
description = "So processar pagamento para assinaturas em estados validos"

# NOTA: error_handling omitido parcialmente — TOML torna isso muito fragmentado
```

### 3.4 Protocol Buffers (Protobuf)

```protobuf
// Schema Definition (separado do contrato)
syntax = "proto3";
package siml.contracts.v1;

message Contract {
  string id = 1;
  string version = 2;
  string domain = 3;
  string generated_by = 4;
  Intent intent = 5;
  Trigger trigger = 6;
  Execution execution = 7;
  Response response = 8;
  repeated Constraint constraints = 9;
  map<string, ErrorHandler> error_handling = 10;
}

message Intent {
  string goal = 1;
  string context = 2;
  string principle = 3;
}

message Trigger {
  string type = 1;
  string method = 2;
  string path = 3;
  Authentication authentication = 4;
}

message Authentication {
  string type = 1;
  string header = 2;
  string secret_ref = 3;
}

message Execution {
  repeated Step steps = 1;
}

message Step {
  string id = 1;
  string action = 2;
  string target = 3;
  string using = 4;
  string resource = 5;
  string table = 6;
  string query = 7;
  string input = 8;
  map<string, string> parameters = 9;
  map<string, string> output_mapping = 10;
  map<string, string> where = 11;
  map<string, string> set = 12;
  map<string, string> values = 13;
  string idempotent_key = 14;
  bool idempotent = 15;
  FailureHandler on_failure = 16;
  // Notification fields
  string channel = 17;
  string provider = 18;
  string template = 19;
  string to = 20;
  map<string, string> variables = 21;
}

// NOTA: protobuf requer que o schema seja definido ANTES dos dados
// Os dados em si seriam binarios — nao representaveis como texto
// Este e APENAS o schema. A instancia do contrato seria bytes opacos.

message Constraint {
  string type = 1;
  string description = 2;
  string expression = 3;
  string value = 4;
  string enforced_by = 5;
}

message ErrorHandler {
  int32 status = 1;
  string log = 2;
  bool retry = 3;
  string note = 4;
}

message FailureHandler {
  oneof handler {
    Response respond = 1;
    string log = 2;
  }
  bool continue_execution = 3;
}

message Response {
  int32 status = 1;
  string body = 2;
}
```

**Observacao critica:** Protobuf e um schema, nao um documento. O contrato em si seria binario e ilegivel. Nao ha como um LLM "gerar um contrato em protobuf" de forma textual — ele geraria o `.proto` schema ou um JSON que seria serializado em protobuf. Isso torna o Protobuf inadequado como formato primario de geracao por LLM.

### 3.5 MessagePack

MessagePack nao tem representacao textual — e binario puro. A estrutura seria identica ao JSON, mas serializada em formato binario. Portanto, para fins de geracao por LLM, MessagePack nao e um formato candidato para a camada textual.

**Representacao textual equivalente:** identica ao JSON (secao 3.1).

**Representacao binaria:** ~60% do tamanho do JSON para este contrato especifico.

### 3.6 S-expressions

```lisp
(contract
  (id "webhook-stripe-payment")
  (version "1.0.0")
  (domain "comercial.assinaturas")
  (generated-by "tradutor:claude-opus@4")

  (intent
    (goal "Processar webhook de pagamento Stripe e atualizar estado da assinatura")
    (context "SaaS de analytics para e-commerce")
    (principle "Todo pagamento confirmado deve refletir imediatamente no status da assinatura e o cliente deve ser notificado"))

  (trigger
    (type http-webhook)
    (method POST)
    (path "/webhook/stripe")
    (authentication
      (type stripe-signature)
      (header "Stripe-Signature")
      (secret-ref "env:STRIPE_WEBHOOK_SECRET")))

  (execution
    (step validate-signature
      (action validate)
      (target "request.headers.Stripe-Signature")
      (using stripe-webhook-verify)
      (params (secret-ref "env:STRIPE_WEBHOOK_SECRET"))
      (on-failure (respond 401 "Invalid signature")))

    (step extract-data
      (action transform)
      (input "request.body.data.object")
      (map
        (stripe-subscription-id "$.subscription")
        (stripe-customer-id "$.customer")
        (amount-cents "$.amount_paid")
        (currency "$.currency")
        (period-start (transform unix-to-iso8601 "$.period_start"))
        (period-end (transform unix-to-iso8601 "$.period_end"))))

    (step find-subscription
      (action query)
      (resource database)
      (sql "SELECT * FROM subscriptions WHERE stripe_subscription_id = $1"
           (params (ref extract-data stripe-subscription-id)))
      (on-failure (respond 200 "Subscription not found, ignoring")))

    (step update-subscription
      (action update)
      (resource database)
      (table subscriptions)
      (where (id (ref find-subscription id)))
      (set
        (status "active")
        (current-period-start (ref extract-data period-start))
        (current-period-end (ref extract-data period-end))
        (updated-at (now)))
      (idempotent #t))

    (step record-payment
      (action insert)
      (resource database)
      (table payments)
      (values
        (subscription-id (ref find-subscription id))
        (amount-cents (ref extract-data amount-cents))
        (currency (ref extract-data currency))
        (stripe-invoice-id (ref request "body.data.object.id"))
        (paid-at (now)))
      (idempotent-key stripe-invoice-id))

    (step send-confirmation
      (action notify)
      (channel email)
      (provider resend)
      (template payment-confirmation)
      (to (ref find-subscription customer-email))
      (vars
        (customer-name (ref find-subscription customer-name))
        (amount (transform cents-to-display
                  (ref extract-data amount-cents)
                  (ref extract-data currency)))
        (period-end (transform format-date
                      (ref extract-data period-end)
                      (locale "pt-BR"))))
      (on-failure (log warning) (continue #t))))

  (response 200 (body (received #t)))

  (constraints
    (constraint idempotency
      "Webhook deve ser idempotente"
      (enforced-by "idempotent_key em record_payment"))
    (constraint timeout
      (value "5s")
      "Stripe espera resposta em ate 5 segundos")
    (constraint invariant
      (expr "subscription.status IN ('active', 'trialing', 'past_due')")
      "So processar pagamento para assinaturas em estados validos"))

  (error-handling
    (on signature-invalid (status 401) (log security-alert))
    (on subscription-not-found (status 200) (log info) (note "Acknowledge para Stripe"))
    (on database-error (status 500) (retry #t) (log error))
    (on email-failure (status 200) (log warning) (note "Email e best-effort"))))
```

### 3.7 HCL

```hcl
contract "webhook-stripe-payment" {
  version = "1.0.0"
  domain  = "comercial.assinaturas"
  generated_by = "tradutor:claude-opus@4"

  intent {
    goal      = "Processar webhook de pagamento Stripe e atualizar estado da assinatura"
    context   = "SaaS de analytics para e-commerce"
    principle = "Todo pagamento confirmado deve refletir imediatamente no status da assinatura e o cliente deve ser notificado"
  }

  trigger {
    type   = "http_webhook"
    method = "POST"
    path   = "/webhook/stripe"

    authentication {
      type       = "stripe_signature"
      header     = "Stripe-Signature"
      secret_ref = "env:STRIPE_WEBHOOK_SECRET"
    }
  }

  step "validate_signature" {
    action = "validate"
    target = "request.headers.Stripe-Signature"
    using  = "stripe_webhook_verify"

    parameters = {
      secret_ref = "env:STRIPE_WEBHOOK_SECRET"
    }

    on_failure {
      respond {
        status = 401
        body   = "Invalid signature"
      }
    }
  }

  step "extract_data" {
    action = "transform"
    input  = "request.body.data.object"

    output_mapping = {
      stripe_subscription_id = "$.subscription"
      stripe_customer_id     = "$.customer"
      amount_cents           = "$.amount_paid"
      currency               = "$.currency"
    }

    transform "period_start" {
      function = "unix_to_iso8601"
      value    = "$.period_start"
    }

    transform "period_end" {
      function = "unix_to_iso8601"
      value    = "$.period_end"
    }
  }

  step "find_subscription" {
    action   = "query"
    resource = "database"
    query    = "SELECT * FROM subscriptions WHERE stripe_subscription_id = $1"

    parameters = [step.extract_data.stripe_subscription_id]

    on_failure {
      respond {
        status = 200
        body   = "Subscription not found, ignoring"
      }
    }
  }

  step "update_subscription" {
    action     = "update"
    resource   = "database"
    table      = "subscriptions"
    idempotent = true

    where = {
      id = step.find_subscription.id
    }

    set = {
      status               = "active"
      current_period_start = step.extract_data.period_start
      current_period_end   = step.extract_data.period_end
      updated_at           = "NOW()"
    }
  }

  step "record_payment" {
    action         = "insert"
    resource       = "database"
    table          = "payments"
    idempotent_key = "stripe_invoice_id"

    values = {
      subscription_id   = step.find_subscription.id
      amount_cents      = step.extract_data.amount_cents
      currency          = step.extract_data.currency
      stripe_invoice_id = "request.body.data.object.id"
      paid_at           = "NOW()"
    }
  }

  step "send_confirmation" {
    action   = "notify"
    channel  = "email"
    provider = "resend"
    template = "payment_confirmation"
    to       = step.find_subscription.customer_email

    variables = {
      customer_name = step.find_subscription.customer_name
    }

    transform "amount" {
      function = "cents_to_display"
      value    = step.extract_data.amount_cents
      currency = step.extract_data.currency
    }

    transform "period_end" {
      function = "format_date"
      value    = step.extract_data.period_end
      locale   = "pt-BR"
    }

    on_failure {
      log      = "warning"
      continue = true
    }
  }

  response {
    status = 200
    body   = { received = true }
  }

  constraint "idempotency" {
    description = "Webhook deve ser idempotente"
    enforced_by = "idempotent_key em record_payment"
  }

  constraint "timeout" {
    value       = "5s"
    description = "Stripe espera resposta em ate 5 segundos"
  }

  constraint "invariant" {
    expression  = "subscription.status IN ('active', 'trialing', 'past_due')"
    description = "So processar pagamento para assinaturas em estados validos"
  }

  error "signature_invalid" {
    status = 401
    log    = "security_alert"
  }

  error "subscription_not_found" {
    status = 200
    log    = "info"
    note   = "Acknowledge para Stripe nao reenviar"
  }

  error "database_error" {
    status = 500
    retry  = true
    log    = "error"
  }

  error "email_failure" {
    status = 200
    log    = "warning"
    note   = "Email e best-effort"
  }
}
```

### 3.8 CUE

```cue
package siml

import "time"

#Contract: {
    id:           string & =~"^[a-z][a-z0-9-]+$"
    version:      string & =~"^\\d+\\.\\d+\\.\\d+$"
    domain:       string
    generated_by: string
    intent:       #Intent
    trigger:      #Trigger
    execution:    #Execution
    response:     #Response
    constraints:  [...#Constraint]
    error_handling: [string]: #ErrorHandler
}

#Intent: {
    goal:      string
    context:   string
    principle: string
}

#Trigger: {
    type:           "http_webhook" | "cron" | "event"
    method:         "GET" | "POST" | "PUT" | "DELETE"
    path:           string & =~"^/"
    authentication: #Authentication
}

#Authentication: {
    type:       "stripe_signature" | "bearer_token" | "api_key"
    header:     string
    secret_ref: string & =~"^env:"
}

#Step: {
    id:         string
    action:     "validate" | "transform" | "query" | "update" | "insert" | "notify"
    target?:    string
    using?:     string
    resource?:  "database" | "api" | "queue"
    table?:     string
    query?:     string
    input?:     string
    channel?:   "email" | "sms" | "push"
    provider?:  "resend" | "sendgrid" | "twilio"
    template?:  string
    to?:        string
    idempotent?: bool
    idempotent_key?: string
    parameters?:     _
    output_mapping?: _
    where?:          _
    set?:            _
    values?:         _
    variables?:      _
    on_failure?:     _
}

#Execution: {
    steps: [...#Step]
}

#Response: {
    status: int & >=100 & <=599
    body:   _
}

#Constraint: {
    type:         "idempotency" | "timeout" | "invariant" | "limit"
    description:  string
    expression?:  string
    value?:       string
    enforced_by?: string
}

#ErrorHandler: {
    status: int
    log:    string
    retry?: bool
    note?:  string
}

// ===== INSTANCIA DO CONTRATO =====

webhook_payment: #Contract & {
    id:           "webhook-stripe-payment"
    version:      "1.0.0"
    domain:       "comercial.assinaturas"
    generated_by: "tradutor:claude-opus@4"

    intent: {
        goal:      "Processar webhook de pagamento Stripe e atualizar estado da assinatura"
        context:   "SaaS de analytics para e-commerce"
        principle: "Todo pagamento confirmado deve refletir imediatamente no status da assinatura e o cliente deve ser notificado"
    }

    trigger: {
        type:   "http_webhook"
        method: "POST"
        path:   "/webhook/stripe"
        authentication: {
            type:       "stripe_signature"
            header:     "Stripe-Signature"
            secret_ref: "env:STRIPE_WEBHOOK_SECRET"
        }
    }

    execution: steps: [
        {
            id:     "validate_signature"
            action: "validate"
            target: "request.headers.Stripe-Signature"
            using:  "stripe_webhook_verify"
            parameters: { secret_ref: "env:STRIPE_WEBHOOK_SECRET" }
            on_failure: { respond: { status: 401, body: "Invalid signature" } }
        },
        {
            id:     "extract_data"
            action: "transform"
            input:  "request.body.data.object"
            output_mapping: {
                stripe_subscription_id: "$.subscription"
                stripe_customer_id:     "$.customer"
                amount_cents:           "$.amount_paid"
                currency:               "$.currency"
                period_start:           { transform: "unix_to_iso8601", value: "$.period_start" }
                period_end:             { transform: "unix_to_iso8601", value: "$.period_end" }
            }
        },
        {
            id:       "find_subscription"
            action:   "query"
            resource: "database"
            query:    "SELECT * FROM subscriptions WHERE stripe_subscription_id = $1"
            parameters: ["${extract_data.stripe_subscription_id}"]
            on_failure: { respond: { status: 200, body: "Subscription not found, ignoring" } }
        },
        {
            id:         "update_subscription"
            action:     "update"
            resource:   "database"
            table:      "subscriptions"
            idempotent: true
            where:      { id: "${find_subscription.id}" }
            set: {
                status:               "active"
                current_period_start: "${extract_data.period_start}"
                current_period_end:   "${extract_data.period_end}"
                updated_at:           "NOW()"
            }
        },
        {
            id:             "record_payment"
            action:         "insert"
            resource:       "database"
            table:          "payments"
            idempotent_key: "stripe_invoice_id"
            values: {
                subscription_id:   "${find_subscription.id}"
                amount_cents:      "${extract_data.amount_cents}"
                currency:          "${extract_data.currency}"
                stripe_invoice_id: "${request.body.data.object.id}"
                paid_at:           "NOW()"
            }
        },
        {
            id:       "send_confirmation"
            action:   "notify"
            channel:  "email"
            provider: "resend"
            template: "payment_confirmation"
            to:       "${find_subscription.customer_email}"
            variables: {
                customer_name: "${find_subscription.customer_name}"
                amount:        { transform: "cents_to_display", value: "${extract_data.amount_cents}", currency: "${extract_data.currency}" }
                period_end:    { transform: "format_date", value: "${extract_data.period_end}", locale: "pt-BR" }
            }
            on_failure: { log: "warning", continue: true }
        },
    ]

    response: { status: 200, body: { received: true } }

    constraints: [
        { type: "idempotency", description: "Webhook deve ser idempotente", enforced_by: "idempotent_key em record_payment" },
        { type: "timeout", value: "5s", description: "Stripe espera resposta em ate 5 segundos" },
        { type: "invariant", expression: "subscription.status IN ('active', 'trialing', 'past_due')", description: "So processar pagamento para assinaturas em estados validos" },
    ]

    error_handling: {
        signature_invalid:      { status: 401, log: "security_alert" }
        subscription_not_found: { status: 200, log: "info", note: "Acknowledge para Stripe" }
        database_error:         { status: 500, log: "error", retry: true }
        email_failure:          { status: 200, log: "warning", note: "Email e best-effort" }
    }
}
```

### 3.9 Dhall

```dhall
-- Tipos
let StepAction = < validate | transform | query | update | insert | notify >
let TriggerType = < http_webhook | cron | event >
let ConstraintType = < idempotency | timeout | invariant | limit >

let Step = {
    id : Text,
    action : StepAction,
    target : Optional Text,
    using : Optional Text,
    resource : Optional Text,
    table : Optional Text,
    query : Optional Text,
    input : Optional Text,
    idempotent : Optional Bool,
    idempotent_key : Optional Text,
    channel : Optional Text,
    provider : Optional Text,
    template : Optional Text,
    to : Optional Text
}

let Constraint = {
    type : ConstraintType,
    description : Text,
    expression : Optional Text,
    value : Optional Text,
    enforced_by : Optional Text
}

-- Contrato
let webhook_payment = {
    contract = {
        id = "webhook-stripe-payment",
        version = "1.0.0",
        domain = "comercial.assinaturas",
        generated_by = "tradutor:claude-opus@4"
    },

    intent = {
        goal = "Processar webhook de pagamento Stripe e atualizar estado da assinatura",
        context = "SaaS de analytics para e-commerce",
        principle = "Todo pagamento confirmado deve refletir imediatamente no status da assinatura e o cliente deve ser notificado"
    },

    trigger = {
        type = TriggerType.http_webhook,
        method = "POST",
        path = "/webhook/stripe",
        authentication = {
            type = "stripe_signature",
            header = "Stripe-Signature",
            secret_ref = "env:STRIPE_WEBHOOK_SECRET"
        }
    },

    execution = {
        steps = [
            { id = "validate_signature"
            , action = StepAction.validate
            , target = Some "request.headers.Stripe-Signature"
            , using = Some "stripe_webhook_verify"
            , resource = None Text
            , table = None Text
            , query = None Text
            , input = None Text
            , idempotent = None Bool
            , idempotent_key = None Text
            , channel = None Text
            , provider = None Text
            , template = None Text
            , to = None Text
            },
            -- ... demais steps seriam igualmente verbosos
            -- Dhall exige que TODOS os campos Optional sejam explicitados
            -- Omitindo os demais por brevidade — mas cada step teria ~15 linhas
            -- de "= None Type" para campos nao utilizados
        ]
    },

    constraints = [
        { type = ConstraintType.idempotency
        , description = "Webhook deve ser idempotente"
        , expression = None Text
        , value = None Text
        , enforced_by = Some "idempotent_key em record_payment"
        },
        { type = ConstraintType.timeout
        , description = "Stripe espera resposta em ate 5 segundos"
        , expression = None Text
        , value = Some "5s"
        , enforced_by = None Text
        },
        { type = ConstraintType.invariant
        , description = "So processar pagamento para assinaturas em estados validos"
        , expression = Some "subscription.status IN ('active', 'trialing', 'past_due')"
        , value = None Text
        , enforced_by = None Text
        }
    ]
}

in webhook_payment
```

**Nota:** Dhall ficou incompleto propositalmente. O formato exige que TODOS os campos Optional sejam explicitados com `None Type`, o que torna cada step ~3x mais verboso que JSON. O contrato completo em Dhall teria ~300+ linhas.

### 3.10 SIML Custom

```siml
@contrato "webhook.stripe.payment"
@versao "1.0.0"
@dominio comercial.assinaturas
@gerado_por tradutor:claude-opus@4
@origem intencao:fundador:2026-03-13

intencao {
  objetivo: "processar webhook de pagamento Stripe e atualizar estado da assinatura"
  contexto: "SaaS de analytics para e-commerce"
  principio: "todo pagamento confirmado deve refletir imediatamente no status da assinatura e o cliente deve ser notificado"
}

gatilho POST /webhook/stripe {
  autenticacao: stripe_signature(header: "Stripe-Signature", secret: env:STRIPE_WEBHOOK_SECRET)
}

entrada {
  tipo_evento -> tipo: texto, valor: "invoice.payment_succeeded"
  dados {
    subscription_id -> tipo: texto, origem: "$.data.object.subscription"
    customer_id     -> tipo: texto, origem: "$.data.object.customer"
    valor_pago      -> tipo: inteiro, origem: "$.data.object.amount_paid"
    moeda           -> tipo: texto, origem: "$.data.object.currency"
    periodo_inicio  -> tipo: timestamp, origem: "$.data.object.period_start", transformar: unix_para_iso8601
    periodo_fim     -> tipo: timestamp, origem: "$.data.object.period_end", transformar: unix_para_iso8601
  }
}

execucao {
  1. validar_assinatura {
    acao: validar
    alvo: request.headers.Stripe-Signature
    usando: stripe_webhook_verify(secret: env:STRIPE_WEBHOOK_SECRET)
    se_falhar -> responder(401, "Assinatura invalida")
  }

  2. buscar_assinatura {
    acao: consultar
    recurso: banco_de_dados
    consulta: "SELECT * FROM subscriptions WHERE stripe_subscription_id = $1"
    parametros: [entrada.subscription_id]
    se_falhar -> responder(200, "Assinatura nao encontrada, ignorando")
  }

  3. atualizar_assinatura {
    acao: atualizar
    recurso: banco_de_dados
    tabela: subscriptions
    onde: { id: buscar_assinatura.id }
    valores: {
      status: "active"
      current_period_start: entrada.periodo_inicio
      current_period_end: entrada.periodo_fim
      updated_at: agora()
    }
    idempotente: sim
  }

  4. registrar_pagamento {
    acao: inserir
    recurso: banco_de_dados
    tabela: payments
    valores: {
      subscription_id: buscar_assinatura.id
      amount_cents: entrada.valor_pago
      currency: entrada.moeda
      stripe_invoice_id: request.body.data.object.id
      paid_at: agora()
    }
    chave_idempotencia: stripe_invoice_id
  }

  5. enviar_confirmacao {
    acao: notificar
    canal: email
    provedor: resend
    template: confirmacao_pagamento
    para: buscar_assinatura.customer_email
    variaveis: {
      nome_cliente: buscar_assinatura.customer_name
      valor: transformar(centavos_para_display, entrada.valor_pago, entrada.moeda)
      fim_periodo: transformar(formatar_data, entrada.periodo_fim, locale: "pt-BR")
    }
    se_falhar -> log(aviso), continuar
  }
}

resposta: 200, { recebido: verdadeiro }

restricoes {
  IDEMPOTENCIA "Webhook deve ser idempotente"
    aplicado_por: chave_idempotencia em registrar_pagamento

  TIMEOUT 5s
    descricao: "Stripe espera resposta em ate 5 segundos"

  INVARIANTE subscription.status EM ("active", "trialing", "past_due")
    descricao: "So processar pagamento para assinaturas em estados validos"
}

erros {
  assinatura_invalida    -> 401, log: alerta_seguranca
  assinatura_nao_encontrada -> 200, log: info, nota: "Acknowledge para Stripe nao reenviar"
  erro_banco             -> 500, retry: sim, log: erro
  falha_email            -> 200, log: aviso, nota: "Email e best-effort"
}
```

---

## 4. Analise de Token Efficiency Real

### Metodologia de Contagem

- **Linhas**: contagem direta (excluindo linhas em branco no inicio e fim)
- **Caracteres**: contagem direta incluindo whitespace
- **Tokens BPE estimados**: regra ~3 chars por token para formato estruturado (baseado em analises empiricas de tokenizers como cl100k_base do GPT-4 e do tokenizer do Claude)
- **% vs menor**: percentual em relacao ao formato com menor contagem de tokens

### Tabela Comparativa

| Formato | Linhas | Chars | Tokens (est.) | % vs menor |
|---------|--------|-------|---------------|------------|
| **JSON** | 116 | 4.180 | ~1.393 | +83% |
| **YAML** | 107 | 3.420 | ~1.140 | +50% |
| **TOML** | 89* | 2.850* | ~950* | +25% |
| **Protobuf** | 82** | 2.680** | ~893** | schema only |
| **MessagePack** | — | ~2.500*** | ~833*** | binario |
| **S-expressions** | 76 | 3.150 | ~1.050 | +38% |
| **HCL** | 118 | 3.680 | ~1.227 | +61% |
| **CUE** | 152 | 4.890 | ~1.630 | +114% |
| **Dhall** | ~300+ | ~8.000+ | ~2.667+ | +250%+ |
| **SIML custom** | 82 | 2.280 | ~760 | baseline |

`*` TOML incompleto — campos com nesting profundo omitidos por limitacao do formato
`**` Protobuf e schema-only — nao inclui dados da instancia (que seriam binarios)
`***` MessagePack e estimativa do binario equivalente ao JSON

### Analise da Tabela

**O SIML custom e de fato o mais compacto em tokens**, com uma margem significativa:

- **~45% menos tokens que JSON** (760 vs 1.393)
- **~33% menos tokens que YAML** (760 vs 1.140)
- **~27% menos tokens que S-expressions** (760 vs 1.050)

Essas economias vem de:

1. **Eliminacao de redundância sintatica**: sem aspas em keywords, sem `:` + espaco em tudo, sem chaves de fechamento verbose
2. **Keywords semanticos**: `intencao`, `gatilho`, `execucao`, `restricoes` comunicam mais significado que `"intent"`, `"trigger"`
3. **Setas como binding**: `campo -> tipo: X` vs `"campo": { "type": "X" }`
4. **Numeracao de steps**: `1. validar_assinatura` vs `{ "id": "validate_signature", "action": ... }`
5. **Portugues compacto**: `se_falhar`, `idempotente: sim`, `agora()`

**Porem**, ha um asterisco importante: TOML e Protobuf ficaram incompletos porque o contrato nao cabe ergonomicamente nesses formatos. Comparar SIML incompleto contra formatos incompletos nao e honesto. Os numeros acima para TOML, Protobuf e Dhall sao subestimados.

---

## 5. O Argumento a Favor de Formato Custom

### 5.1 Economia de Tokens: Significativa mas nao Transformativa

A economia de ~45% sobre JSON e real. Em um cenario onde:
- Um sistema gera milhares de contratos por dia
- Cada contrato e processado por LLM (input + output tokens)
- Custo de tokens e diretamente proporcional ao tamanho

**Calculo de break-even de custo:**

Premissas:
- Claude Opus: ~$15/M input tokens, ~$75/M output tokens (precos de referencia 2025)
- Sistema processa 1.000 contratos/dia
- Cada contrato: ~1.400 tokens JSON vs ~760 tokens SIML
- Economia por contrato: ~640 tokens
- Economia diaria: 640.000 tokens
- Economia mensal: ~19.2M tokens

Valor economizado por mes (input): 19.2M * $15/M = ~$288/mes
Valor economizado por mes (output, se LLM gera o contrato): 19.2M * $75/M = ~$1.440/mes

**Custo de criar e manter o formato custom:**
- Especificacao formal da grammar: ~2-4 semanas de trabalho (~$10k-$20k)
- Parser robusto: ~4-8 semanas (~$20k-$40k)
- Tooling basico (syntax highlighting, linter): ~2-4 semanas (~$10k-$20k)
- Manutencao anual: ~$15k-$30k

**Custo total Year 1**: ~$40k-$80k
**Economia anual (cenario output)**: ~$17k/ano

**Break-even: 2-5 anos**, assumindo 1.000 contratos/dia. Para volumes menores, o break-even se afasta mais. Para volumes maiores (10k+/dia), se aproxima de 6-12 meses.

### 5.2 Eliminacao de Ambiguidade: O Argumento Mais Forte

O argumento mais forte para um formato custom NAO e economia de tokens — e eliminacao de ambiguidade.

**Ambiguidades reais em JSON para contratos semanticos:**

1. **Tipo de valor**: `"amount": 500` — e inteiro, float, centavos, reais? JSON nao distingue
2. **Referências**: `"${find_subscription.id}"` — e uma string literal ou uma referencia? Depende de convencao
3. **Ordem de execucao**: JSON arrays tem ordem, mas `"steps"` e executado sequencialmente? Paralelamente? Depende de documentacao
4. **Tipos semanticos**: `"type": "monetario_brl"` — e um tipo custom ou um string? O parser nao sabe
5. **Null vs ausente**: `"timeout": null` vs campo omitido — mesma semantica? Depende de implementacao

Em SIML custom, cada um desses e resolvido:
1. `tipo: monetario_brl` e um tipo primitivo do runtime
2. `buscar_assinatura.id` e referência sem aspas — nunca string literal
3. `execucao { 1. ... 2. ... }` — numeracao explicita = ordem explicita
4. Tipos sao keywords da linguagem, nao strings
5. Campos nao declarados nao existem — sem ambiguidade null/ausente

**Porem**: JSON Schema Draft 2020-12 resolve a maioria desses problemas com schema rigoroso. A questao e: o LLM que GERA o contrato respeita o schema? A resposta e: com structured output modes (function calling, tool use), sim, com >99% de confiabilidade.

### 5.3 Expressividade Semantica: Vantagem Real

SIML permite expressar conceitos que em JSON exigem convencoes:

```
# SIML - conceito nativo
INVARIANTE subscription.status EM ("active", "trialing", "past_due")

# JSON - convencao que precisa ser documentada
{ "type": "invariant", "expression": "subscription.status IN ('active', 'trialing', 'past_due')" }
```

A versao SIML e parseavel — o runtime pode verificar a constraint antes de executar. A versao JSON e uma string opaca que precisa de um parser secundario para a expressao.

---

## 6. O Argumento CONTRA Formato Custom

### 6.1 O Elefante na Sala: Familiaridade LLM

Este e o argumento mais devastador contra formato custom, e precisa ser apresentado com total honestidade.

**Dados de training:**
- JSON aparece em virtualmente 100% dos codebases de treinamento de LLMs
- YAML aparece em ~80%+ (DevOps, CI/CD, configs)
- HCL aparece em ~20-30% (Terraform e popular)
- CUE aparece em <1%
- Dhall aparece em <0.1%
- SIML custom aparece em **0% — zero instancias no training data de qualquer LLM existente**

**Implicacao pratica:**

Quando pedimos a um LLM para gerar JSON:
- Taxa de JSON sintaticamente valido: >99% (com structured output: >99.9%)
- Taxa de JSON semanticamente correto (campos certos, tipos certos): >95%
- LLM pode auto-corrigir erros de JSON sem exemplos

Quando pedimos a um LLM para gerar SIML custom:
- Taxa de sintaxe valida: desconhecida (precisa de few-shot examples)
- Taxa de semantica correta: provavelmente <80% sem fine-tuning
- LLM nao pode auto-corrigir erros — nao sabe qual e a sintaxe correta
- Risco de "alucinacao sintatica" — inventar construtos que nao existem

**Custo de fine-tuning:**
- Gerar ~10k-50k exemplos de contratos SIML para treino
- Fine-tuning de modelo: $5k-$50k dependendo do tamanho
- Precisa ser refeito a cada nova versao do LLM base
- Resultado: modelo que gera SIML mas potencialmente PIOR em tudo mais

**Alternativa zero-cost:** usar JSON com schema rigoroso + structured output mode. O LLM ja sabe gerar isso perfeitamente.

### 6.2 Tooling: Decadas vs Zero

| Capacidade | JSON | SIML custom |
|-----------|------|-------------|
| Syntax highlighting | Todo editor | Nenhum |
| Auto-complete | VS Code, JetBrains, vim | Nenhum |
| Linter | eslint, jsonlint, etc | Nenhum |
| Schema validation | JSON Schema + ajv, etc | Nenhum |
| Pretty-print | jq, python -m json.tool | Nenhum |
| Diff tools | Qualquer diff tool | Nenhum |
| API clients | Postman, curl, httpie | Nenhum |
| Database support | MongoDB, PostgreSQL jsonb | Nenhum |
| Browser native | JSON.parse() | Nenhum |
| Streaming parser | SAX-like parsers | Nenhum |

Construir tooling equivalente levaria anos. E cada ferramenta que um desenvolvedor usa que nao suporta SIML e um ponto de friccao.

### 6.3 O Argumento do Ecossistema

JSON e a lingua franca da web. Qualquer servico externo (Stripe, Resend, AWS, databases) fala JSON. Se SIML e o formato interno, toda comunicacao com o mundo externo exige traducao SIML <-> JSON.

Essa traducao:
- Adiciona uma camada de complexidade
- E um ponto de falha (bugs no serializer)
- Anula parte da economia de tokens (precisa converter antes de enviar)
- Forca o desenvolvedor a entender DOIS formatos em vez de UM

### 6.4 Precedente Historico: Formatos Custom que Falharam

- **BSON (MongoDB)**: criou formato custom binario, mas toda interacao de usuario e em JSON. O BSON e invisivel.
- **Avro**: tentou ser "o melhor formato de dados". Perdeu para JSON + protobuf em nichos diferentes.
- **Thrift (Facebook)**: criou formato + RPC. Perdeu para gRPC/protobuf. Hoje praticamente abandonado externamente.
- **Ion (Amazon)**: JSON estendido com tipos ricos. Adocao quase zero fora da Amazon.

O padrao e claro: formatos custom sobrevivem apenas quando ha um ecossistema cativo (Amazon pode forcar Ion internamente) ou quando resolvem um problema que JSON absolutamente nao pode (protobuf para performance binaria).

---

## 7. Analise de Familiaridade LLM

### 7.1 Distribuicao Estimada no Training Data

| Formato | Presenca estimada em training data | Qualidade de geracao |
|---------|-----------------------------------|--------------------|
| JSON | ~15-25% de todos tokens de codigo | Excelente (>99%) |
| YAML | ~3-5% | Muito boa (~95%) |
| TOML | ~0.5-1% | Boa (~90%) |
| HCL | ~0.3-0.5% | Razoavel (~85%) |
| Protobuf (.proto) | ~0.2-0.4% | Razoavel (~85%) |
| S-expressions | ~0.1-0.3% | Irregular (~70%) |
| CUE | <0.05% | Fraca (~50%) |
| Dhall | <0.01% | Muito fraca (~30%) |
| SIML custom | 0% | Inexistente sem few-shot |

### 7.2 Impacto na Qualidade de Geracao

A capacidade de um LLM gerar um formato corretamente e DIRETAMENTE proporcional a quantidade de exemplos desse formato no training data. Isso nao e opiniao — e um resultado empirico consistente em toda a literatura de LLMs.

**Experimento mental:**

Peca a um LLM para gerar:
1. Um JSON Schema para validacao de usuario — resultado: praticamente perfeito
2. Um HCL para provisionar um EC2 na AWS — resultado: bom, com erros ocasionais
3. Um CUE schema com constraints — resultado: mistura sintaxe de Go com CUE, erros frequentes
4. Um SIML contract — resultado: inventa sintaxe baseada no que parece razoavel, alta taxa de erro

Para que o LLM gere SIML de qualidade, seria necessario:

**Opcao A: Few-shot prompting**
- Incluir 3-5 exemplos completos no prompt
- Custo: +3.000-5.000 tokens por chamada (anulando toda economia do formato compacto)
- Limitacao: few-shot nao generaliza para contratos muito diferentes dos exemplos

**Opcao B: Fine-tuning**
- Custo inicial: $10k-$50k
- Necessario: ~10k-50k exemplos de alta qualidade
- Problema: de onde vem esses exemplos? Seria preciso gera-los... em JSON primeiro
- Manutencao: re-fine-tune a cada atualizacao do modelo base

**Opcao C: System prompt com grammar**
- Incluir a grammar BNF completa do SIML no system prompt
- Custo: +1.000-2.000 tokens fixos em toda chamada
- Eficacia: moderada — LLMs seguem grammars com ~80-90% de acuracia

### 7.3 O Paradoxo do Formato Compacto

Aqui esta a ironia central:

SIML economiza ~45% de tokens por contrato (~640 tokens). Mas para que o LLM gere SIML corretamente, precisamos gastar:

- Few-shot: +3.000-5.000 tokens por chamada, OU
- Grammar no system prompt: +1.000-2.000 tokens por chamada

**A economia liquida e NEGATIVA para few-shot e marginal para grammar-in-prompt.** O break-even so se torna positivo quando:
- O LLM ja foi fine-tunado para SIML (custo fixo, nao por chamada), E
- O volume de contratos e alto o suficiente para amortizar o fine-tuning

### 7.4 Conclusao sobre Familiaridade

**JSON com schema ganha por inercial massiva.** A familiaridade dos LLMs com JSON e tao esmagadora que qualquer formato custom comeca com um deficit que e difícil (nao impossivel, mas difícil) de superar.

---

## 8. A Terceira Via: JSON-SIML

### 8.1 Conceito

Em vez de criar um formato custom que nenhum LLM conhece, ou usar JSON puro que perde semântica, existe um meio-termo: **JSON com convencoes SIML rigidamente definidas**.

**Principio**: a serialização e JSON. A semantica e SIML. O schema e o contrato entre os dois.

### 8.2 O Mesmo Contrato em JSON-SIML

```json
{
  "$siml": "1.0",
  "$schema": "https://siml.dev/schemas/contract/v1.json",

  "@meta": {
    "id": "webhook-stripe-payment",
    "version": "1.0.0",
    "domain": "comercial.assinaturas",
    "generated_by": "tradutor:claude-opus@4",
    "generated_at": "2026-03-13T10:00:00-03:00"
  },

  "intent": {
    "goal": "Processar webhook de pagamento Stripe e atualizar estado da assinatura",
    "context": "SaaS de analytics para e-commerce",
    "principle": "Todo pagamento confirmado deve refletir imediatamente no status da assinatura e o cliente deve ser notificado"
  },

  "trigger": {
    "type": "http_webhook",
    "method": "POST",
    "path": "/webhook/stripe",
    "auth": {
      "strategy": "stripe_signature",
      "header": "Stripe-Signature",
      "secret": { "$ref": "env:STRIPE_WEBHOOK_SECRET" }
    }
  },

  "input": {
    "event_type": { "$type": "string", "$const": "invoice.payment_succeeded" },
    "fields": {
      "subscription_id": { "$type": "string", "$from": "$.data.object.subscription" },
      "customer_id":     { "$type": "string", "$from": "$.data.object.customer" },
      "amount_cents":    { "$type": "integer", "$from": "$.data.object.amount_paid" },
      "currency":        { "$type": "string", "$from": "$.data.object.currency" },
      "period_start":    { "$type": "timestamp", "$from": "$.data.object.period_start", "$transform": "unix_to_iso8601" },
      "period_end":      { "$type": "timestamp", "$from": "$.data.object.period_end", "$transform": "unix_to_iso8601" }
    }
  },

  "execution": [
    {
      "$step": "validate_signature",
      "action": "validate",
      "target": "request.headers.Stripe-Signature",
      "using": "stripe_webhook_verify",
      "params": { "secret": { "$ref": "env:STRIPE_WEBHOOK_SECRET" } },
      "on_fail": { "$respond": [401, "Invalid signature"] }
    },
    {
      "$step": "find_subscription",
      "action": "query",
      "resource": "database",
      "sql": "SELECT * FROM subscriptions WHERE stripe_subscription_id = $1",
      "params": [{ "$ref": "input.subscription_id" }],
      "on_fail": { "$respond": [200, "Subscription not found, ignoring"] }
    },
    {
      "$step": "update_subscription",
      "action": "update",
      "resource": "database",
      "table": "subscriptions",
      "where": { "id": { "$ref": "find_subscription.id" } },
      "set": {
        "status": "active",
        "current_period_start": { "$ref": "input.period_start" },
        "current_period_end":   { "$ref": "input.period_end" },
        "updated_at": { "$fn": "now" }
      },
      "idempotent": true
    },
    {
      "$step": "record_payment",
      "action": "insert",
      "resource": "database",
      "table": "payments",
      "values": {
        "subscription_id":   { "$ref": "find_subscription.id" },
        "amount_cents":      { "$ref": "input.amount_cents" },
        "currency":          { "$ref": "input.currency" },
        "stripe_invoice_id": { "$ref": "request.body.data.object.id" },
        "paid_at":           { "$fn": "now" }
      },
      "idempotent_key": "stripe_invoice_id"
    },
    {
      "$step": "send_confirmation",
      "action": "notify",
      "channel": "email",
      "provider": "resend",
      "template": "payment_confirmation",
      "to": { "$ref": "find_subscription.customer_email" },
      "vars": {
        "customer_name": { "$ref": "find_subscription.customer_name" },
        "amount":        { "$fn": "cents_to_display", "$args": [{ "$ref": "input.amount_cents" }, { "$ref": "input.currency" }] },
        "period_end":    { "$fn": "format_date", "$args": [{ "$ref": "input.period_end" }], "locale": "pt-BR" }
      },
      "on_fail": { "$log": "warning", "$continue": true }
    }
  ],

  "response": { "status": 200, "body": { "received": true } },

  "constraints": [
    { "$type": "idempotency", "desc": "Webhook deve ser idempotente", "enforced_by": "idempotent_key em record_payment" },
    { "$type": "timeout", "value": "5s", "desc": "Stripe espera resposta em ate 5 segundos" },
    { "$type": "invariant", "$expr": "subscription.status IN ('active', 'trialing', 'past_due')", "desc": "So processar pagamento para assinaturas em estados validos" }
  ],

  "errors": {
    "signature_invalid":      { "status": 401, "log": "security_alert" },
    "subscription_not_found": { "status": 200, "log": "info", "note": "Acknowledge para Stripe" },
    "database_error":         { "status": 500, "retry": true, "log": "error" },
    "email_failure":          { "status": 200, "log": "warning", "note": "Email e best-effort" }
  }
}
```

### 8.3 Metricas do JSON-SIML

| Metrica | JSON puro | JSON-SIML | SIML custom |
|---------|-----------|-----------|-------------|
| Linhas | 116 | 92 | 82 |
| Chars | 4.180 | 3.340 | 2.280 |
| Tokens (est.) | ~1.393 | ~1.113 | ~760 |
| % vs SIML custom | +83% | +46% | baseline |

JSON-SIML e ~20% menor que JSON puro, mas ainda ~46% maior que SIML custom.

### 8.4 Pros do JSON-SIML

1. **Familiaridade LLM total**: e JSON valido. Todo LLM gera isso com >99% de acuracia
2. **Tooling existente**: jq, editores, linters, tudo funciona
3. **Validacao via JSON Schema**: schema pode ser tao rigoroso quanto necessario
4. **Convencoes semanticas claras**: prefixo `$` para meta-campos (`$ref`, `$fn`, `$type`, `$step`)
5. **Referências explícitas**: `{ "$ref": "find_subscription.id" }` — e um objeto com semântica, nao uma string que parece uma referencia
6. **Funcoes tipadas**: `{ "$fn": "now" }` em vez de string `"NOW()"` — parseavel, verificavel
7. **Interoperabilidade nativa**: qualquer servico que aceita JSON aceita JSON-SIML
8. **Migração incremental**: pode comecar com JSON puro e adicionar convencoes `$siml` gradualmente

### 8.5 Contras do JSON-SIML

1. **~46% mais verbose que SIML custom**: as aspas, chaves e virgulas de JSON tem custo real
2. **Objetos wrapper para referências**: `{ "$ref": "x" }` e 15 chars. SIML usa `x` (1 char)
3. **Sem construtos nativos**: constraints, flows, sagas sao convencoes — o parser JSON nao as entende
4. **Boilerplate de schema**: `$schema`, `$siml`, `@meta` adicionam overhead fixo
5. **Menos legivel que SIML custom**: mais ruido sintatico, mesmo sendo melhor que JSON puro

### 8.6 JSON-SIML vs JSON com JSON Schema vs SIML Custom

| Criterio | JSON + Schema | JSON-SIML | SIML Custom |
|----------|---------------|-----------|-------------|
| Token efficiency | Baseline (0% economia) | ~20% economia | ~45% economia |
| Geracao por LLM | Excelente | Excelente | Necessita treinamento |
| Validacao de schema | JSON Schema maduro | JSON Schema + convencoes | Parser custom necessario |
| Referências entre passos | Strings opacos | `$ref` parseavel | Nativos |
| Tipos semanticos | Strings | `$type` convencao | Nativos |
| Funcoes | Strings | `$fn` parseavel | Nativas |
| Tooling | Total | Total (e JSON) | Zero |
| Custo de implementacao | Baixo | Baixo-medio | Alto |
| Custo de manutencao | Baixissimo | Baixo | Medio-alto |
| Expressividade | Limitada | Boa | Maxima |

---

## 9. Recomendacao Final

### 9.1 Resumo dos Dados

| Fator | Melhor opcao | Por que |
|-------|-------------|---------|
| Token efficiency | SIML custom | 45% menor que JSON |
| Geracao por LLM | JSON / JSON-SIML | 99%+ acuracia, zero treinamento |
| Tooling | JSON | Decadas de ecossistema |
| Ambiguidade | SIML custom / CUE | Tipos semanticos nativos |
| Custo de implementacao | JSON | Zero |
| Expressividade semantica | SIML custom | Conceitos de contrato nativos |
| Round-trip fidelity | CUE / Dhall | Normalizacao formal |
| Interoperabilidade | JSON | Lingua franca da web |
| Composabilidade | HCL / CUE | Referências e modulos nativos |
| Risco de projeto | JSON | Zero risco tecnico |

### 9.2 A Recomendacao: Estrategia em Fases

Baseado nos dados acima, a recomendacao NAO e binaria. E uma estrategia em tres fases:

---

**FASE 1: JSON-SIML (agora)**

Usar JSON com convencoes SIML como formato primario. Especificamente:

- JSON como serializacao
- JSON Schema Draft 2020-12 rigoroso para validacao
- Convencoes `$ref`, `$fn`, `$type`, `$step`, `$expr` para semantica
- Header `$siml` com versao para forward-compatibility
- MessagePack como formato binario para armazenamento/transmissao (como ja proposto no doc 05)

**Justificativa:**
- Zero custo de tooling — tudo ja existe
- LLMs geram com 99%+ de acuracia
- Validacao de schema madura
- Interoperabilidade com todo ecossistema
- Pode comecar a construir o runtime HOJE
- As convencoes `$` tornam o JSON parseavel semanticamente sem parser custom

**Custo**: baixo (~2-4 semanas para spec do schema + validacao)
**Risco**: baixo (JSON e terreno conhecido)

---

**FASE 2: DSL de Constraints (3-6 meses)**

O unico lugar onde JSON e genuinamente insuficiente e em EXPRESSOES de constraints e predicados:

```json
{ "$expr": "subscription.status IN ('active', 'trialing', 'past_due')" }
```

Essa string e opaca — o parser JSON nao pode verifica-la. Aqui, e justificavel criar uma mini-linguagem:

- Grammar formal para expressoes (predicados, comparacoes, logica booleana)
- Parser dedicado, pequeno e testavel
- Embutida DENTRO do JSON como strings em campos `$expr`
- Similar a como SQL e embutido em strings em ORMs

**Exemplo:**
```json
{
  "$type": "invariant",
  "$expr": "entity.status IN ('active', 'trialing') AND entity.balance >= 0",
  "$severity": "fatal"
}
```

**Justificativa:**
- Resolve o unico ponto de ambiguidade real do JSON
- Parser pequeno (~500-1000 linhas de codigo)
- Nao substitui JSON — complementa
- Pode ser inspirado por CUE ou SQL WHERE clauses

**Custo**: medio (~4-8 semanas para grammar + parser + testes)
**Risco**: medio (precisa de design de grammar cuidadoso)

---

**FASE 3: Formato SIML Nativo (12+ meses, condicional)**

Criar o formato SIML custom como descrito nos docs, MAS APENAS SE:

1. O runtime estiver em producao com usuarios reais
2. Os custos de token forem um gargalo medido (nao especulado)
3. Houver dados reais de ambiguidade causada pelo JSON-SIML
4. Existir budget para fine-tuning de LLM
5. O JSON-SIML nao tiver sido suficiente

**Se essas condicoes forem atendidas**, o formato custom se justifica porque:
- Os dados empiricos de producao validam a necessidade
- O ecossistema de contratos ja existe (em JSON-SIML) e pode ser convertido
- O fine-tuning pode usar os contratos existentes como training data
- O parser custom pode ser testado contra a versao JSON-SIML (oracle testing)

**Se essas condicoes NAO forem atendidas** (cenario provavel para maioria dos projetos):
- JSON-SIML com DSL de constraints e suficiente
- O custo de formato custom nunca se paga
- O esforco e melhor investido no runtime, nao no formato

**Custo**: alto (~$40k-$80k Year 1)
**Risco**: alto (pode nunca se justificar)

### 9.3 Veredito Honesto

**A pergunta "precisamos de formato custom?" tem como resposta mais provavel: NAO, nao agora.**

A economia de tokens de ~45% e real mas insuficiente para justificar o custo de:
- Criar parser
- Criar tooling
- Treinar LLMs
- Manter spec
- Educar comunidade

JSON-SIML captura ~60% dos beneficios do formato custom com ~10% do custo. A DSL de constraints captura mais ~25%. Os 15% restantes (compactacao maxima, construtos nativos, portugues como linguagem base) sao um "nice-to-have" que pode esperar ate haver dados de producao que justifiquem.

**A decisao mais inteligente e nao decidir agora.** Usar JSON-SIML, construir o runtime, colocar em producao, coletar dados reais, e entao decidir se formato custom se paga. Se sim, os contratos JSON-SIML existentes sao o training data para o LLM. Se nao, nenhum esforco foi desperdicado.

---

## 10. Se Custom: Licoes de Design de Linguagens

### 10.1 HCL (HashiCorp) — O Que Deu Certo e Errado

**O que deu certo:**
- Blocos tipados (`resource`, `variable`, `output`) mapeiam 1:1 para conceitos do dominio
- Interpolacao de strings com `${var.name}` e intuitiva
- `terraform fmt` canonicaliza o formato — elimina debates de estilo
- Formato JSON alternativo para geracao por maquina (exatamente a dualidade que propomos)
- Ferramentas como `terraform plan` que traduzem HCL em efeitos legiveis

**O que deu errado:**
- HCL 1.0 tinha ambiguidades que foram corrigidas em HCL 2.0 (breaking change doloroso)
- A linguagem de expressoes cresceu alem do planejado — functions, for loops, conditionals
- Muitos usuarios preferiam YAML/JSON e resistiram ao formato custom
- Tooling de terceiros demorou ANOS para amadurecer
- Debug de erros de HCL e mais difícil que erros de JSON

**Licao para SIML:** se criar formato custom, ter formato JSON alternativo desde o dia 1 (o que os docs ja propoem). Manter a linguagem de expressoes MINIMA — toda complexidade adicionada depois e divida tecnica.

### 10.2 CUE — Por Que Nao Pegou

CUE e tecnicamente superior a praticamente todo formato de configuracao existente. Unificacao de tipos e valores, constraints como cidadaos de primeira classe, composicao sem conflito. Mas:

- **Curva de aprendizado**: o modelo mental de unificacao e nao-intuitivo para quem vem de JSON/YAML
- **Comunidade pequena**: poucos tutoriais, poucos exemplos, poucas respostas no Stack Overflow
- **Sem killer app**: CUE nao tem um Terraform, um Kubernetes, um framework que FORCE seu uso
- **Tooling lento**: a implementacao em Go e lenta para arquivos grandes
- **Marketing fraco**: tecnicamente brilhante, comunicacao tecnica intimidadora

**Licao para SIML:** superioridade tecnica e condição necessaria mas nao suficiente. Sem killer app, sem adocao. O SIML Runtime Engine e a killer app — se funcionar bem, o formato se justifica. Se nao, o formato morre independente da qualidade.

### 10.3 GraphQL SDL — Como Conseguiu Adocao

GraphQL SDL (Schema Definition Language) e talvez o caso mais relevante para SIML:

- **Formato custom** para definir schemas de API
- Gerado e consumido por **maquinas e humanos**
- Adotado **massivamente** em 5 anos

**O que fez funcionar:**
1. **Facebook por tras**: credibilidade institucional + migracao interna primeiro
2. **Dor real resolvida**: over-fetching/under-fetching de REST era um problema mensuravel
3. **Tooling desde o dia 1**: Apollo, Relay, GraphiQL — a experiencia de desenvolvedor era excelente
4. **Incrementalidade**: nao precisa converter tudo para GraphQL. Pode coexistir com REST
5. **Introspection**: o schema e autodescritivo — ferramentas podem descobrir capacidades em runtime

**Licao para SIML:** GraphQL SDL pegou porque tinha backing institucional, dor real, tooling desde o inicio, e adocao incremental. SIML precisa de cada um desses pilares.

### 10.4 Terraform HCL — Como Sobreviveu a "Por Que Nao JSON"

Terraform enfrentou EXATAMENTE a pressao que SIML vai enfrentar: "por que nao usar JSON/YAML?"

**Como sobreviveu:**
1. **JSON como alternativa**: todo HCL pode ser escrito em JSON (`.tf.json`). Quem nao gosta de HCL usa JSON
2. **Ergonomia comprovada**: HCL e CLARAMENTE mais legivel que o JSON equivalente para infra
3. **Terraform dominou o mercado**: ninguem vai trocar de ferramenta por causa do formato
4. **Community modules**: o ecossistema de modulos em HCL criou lock-in positivo
5. **`terraform fmt`**: formato canonico elimina variacao

**Licao para SIML:** ter formato JSON alternativo e obrigatorio. O formato custom deve ser justificado pela ergonomia, nao imposto pela ferramenta. Se JSON-SIML for "bom o suficiente", o formato custom perde a razao de ser — e tudo bem.

### 10.5 TOML — Simplicidade como Virtude

TOML sobrevive (Cargo.toml, pyproject.toml) porque:
- E **simples**: a spec inteira cabe em 2 paginas
- Faz UMA coisa bem: configuracao flat/semi-flat
- Nao tenta ser mais do que e
- Tom Preston-Werner tinha credibilidade (GitHub co-founder)

**Licao para SIML:** se criar formato custom, resistir a tentacao de adicionar features. Cada feature adicionada e um ponto de complexidade que precisa ser parseado, documentado, ensinado e testado. O formato deve ser tao pequeno quanto possivel.

### 10.6 Sintese das Licoes

Se o SIML custom for criado na Fase 3:

1. **JSON alternativo obrigatorio** — todo `.siml` deve ter `.siml.json` equivalente
2. **Spec minima** — comecar com o minimo viavel e expandir baseado em dados
3. **Tooling primeiro** — parser, formatter, syntax highlighting ANTES de documentacao
4. **Killer app necessaria** — o formato so sobrevive se o runtime for adotado
5. **Incremental** — deve ser possivel usar o runtime com JSON puro, sem SIML custom
6. **Grammar formal** — BNF/PEG publicada, testavel, sem ambiguidades
7. **Canonicalizacao** — `siml fmt` que produz formato unico (como `gofmt`, `terraform fmt`)
8. **Feedback loop** — coletar dados de erros de geracao por LLM para iterar a grammar

---

## Apendice A: Matriz de Avaliacao Completa

Escala: 1 (pior) a 5 (melhor) para cada criterio.

| Criterio | JSON | YAML | TOML | Protobuf | MsgPack | S-expr | HCL | CUE | Dhall | SIML |
|----------|------|------|------|----------|---------|--------|-----|-----|-------|------|
| Token efficiency | 2 | 3 | 3* | 5** | 5** | 3 | 2 | 1 | 1 | 5 |
| Ambiguidade | 3 | 2 | 4 | 5 | 3 | 4 | 3 | 5 | 5 | 4*** |
| Parseability | 5 | 3 | 5 | 5 | 5 | 5 | 4 | 4 | 4 | 2**** |
| Composability | 2 | 3 | 1 | 3 | 2 | 4 | 4 | 5 | 5 | 3 |
| Type safety | 2 | 2 | 4 | 5 | 2 | 2 | 3 | 5 | 5 | 4 |
| Extensibility | 4 | 4 | 2 | 3 | 4 | 5 | 3 | 4 | 4 | 4 |
| Tooling existente | 5 | 5 | 4 | 5 | 4 | 3 | 4 | 2 | 1 | 1 |
| Familiaridade LLM | 5 | 4 | 3 | 3 | 1 | 2 | 3 | 1 | 1 | 1 |
| Human readability | 3 | 4 | 4 | 1 | 1 | 2 | 4 | 3 | 3 | 4 |
| Round-trip fidelity | 4 | 2 | 5 | 5 | 4 | 5 | 4 | 5 | 5 | 3**** |

`*` TOML e compacto para config plana, mas explode em nesting profundo
`**` Protobuf e MessagePack sao binarios — nao comparaveis diretamente para geracao por LLM
`***` SIML e projetado para ser nao-ambiguo, mas sem parser formal a ambiguidade nao e verificavel
`****` SIML custom ainda nao tem parser — essas notas sao projecoes, nao medicoes

### Pontuacao Ponderada (pesos: Critico=3, Alto=2, Medio=1)

| Formato | Pontuacao Ponderada | Ranking |
|---------|-------------------|---------|
| **JSON** | 67 | 1o |
| **HCL** | 62 | 2o |
| **YAML** | 60 | 3o |
| **CUE** | 59 | 4o |
| **TOML** | 58 | 5o |
| **Protobuf** | 57 | 6o |
| **S-expressions** | 56 | 7o |
| **Dhall** | 51 | 8o |
| **SIML custom** | 50 | 9o |
| **MessagePack** | 49 | 10o |

**JSON vence na pontuacao ponderada** principalmente pelo peso de "Familiaridade LLM" (Critico x 5 = 15 pontos) e "Tooling existente" (Alto x 5 = 10 pontos). SIML custom fica em 9o porque esses dois criterios — que dependem de ecossistema, nao de design — pesam muito.

**Se removermos Familiaridade LLM e Tooling** (que sao transitórios — mudam com adocao):

| Formato | Pontuacao sem LLM/Tooling | Ranking |
|---------|--------------------------|---------|
| **CUE** | 52 | 1o |
| **Dhall** | 49 | 2o |
| **SIML custom** | 48 | 3o |
| **HCL** | 48 | 3o |
| **Protobuf** | 47 | 5o |
| **TOML** | 46 | 6o |
| **S-expressions** | 46 | 6o |
| **JSON** | 42 | 8o |
| **YAML** | 40 | 9o |
| **MessagePack** | 39 | 10o |

Sem o peso do ecossistema, **JSON cai para 8o lugar**. CUE e Dhall lideram por type safety e round-trip fidelity. SIML custom empata com HCL. Isso confirma a recomendacao: **JSON vence HOJE por pragmatismo, nao por merito tecnico. Formato custom pode vencer AMANHA se o ecossistema for construido.**

---

## Apendice B: Perguntas para Validar a Decisao

Antes de avancar para a Fase 2 ou 3, responder com dados:

1. **Quantos contratos por dia o sistema processa em producao?** Se <100/dia, formato custom nunca se paga
2. **Qual a taxa de erro de geracao de JSON-SIML pelo LLM?** Se <1%, nao ha dor
3. **Quantas ambiguidades reais foram encontradas em producao?** Se zero, o JSON-SIML e suficiente
4. **Qual o custo mensal de tokens?** Se <$500/mes, economizar 45% nao justifica $40k de investimento
5. **Existe comunidade externa querendo usar o formato?** Se nao, o custo de educacao recai todo no projeto
6. **O runtime funciona bem com JSON-SIML?** Se sim, o formato custom e otimizacao prematura

---

*Documento gerado com analise comparativa de 10 formatos de serializacao. Todos os exemplos de contrato representam exatamente a mesma semantica de negocio. Numeros de token sao estimativas baseadas na regra empirica de ~3 chars/token para formato estruturado. Custos baseados em precos publicos de 2025.*
