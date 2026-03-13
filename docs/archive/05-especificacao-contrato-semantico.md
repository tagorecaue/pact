# 05 - Especificacao do Contrato Semantico SIML

> Proposta tecnica detalhada da estrutura, tipos, composicao, serializacao e seguranca do Contrato Semantico — a unidade fundamental da linguagem SIML.

---

## 1. Anatomia do Contrato Semantico

O Contrato Semantico e uma estrutura formal de tres camadas, cada uma com responsabilidades, publico-alvo e garantias distintas.

### 1.1 Modelo Formal

Definimos um Contrato Semantico **C** como a tripla:

```
C = (I, E, V)

onde:
  I in Intention   -- camada de intencao
  E in Execution   -- camada de execucao
  V in Evidence    -- camada de evidencia
```

Com a invariante fundamental:

```
forall C: semantics(V) |= semantics(I)
```

Ou seja: a evidencia produzida deve satisfazer formalmente a intencao declarada.

### 1.2 Camada INTENCAO (I)

A camada de intencao e a interface humana do contrato. Declara **o que** e **por que**, nunca o **como**.

| Campo              | Tipo                  | Obrigatorio | Semantica                                                    |
|--------------------|-----------------------|-------------|--------------------------------------------------------------|
| `id`               | `UUID v7`             | Sim         | Identificador unico do contrato, com timestamp embutido      |
| `version`          | `SemVer`              | Sim         | Versao semantica do contrato                                 |
| `intent`           | `NaturalText`         | Sim         | Descricao da intencao em linguagem natural                   |
| `goal`             | `GoalSpec`            | Sim         | Especificacao formal do objetivo (predicado verificavel)     |
| `constraints`      | `List<Constraint>`    | Nao         | Restricoes que devem ser respeitadas durante a execucao      |
| `context`          | `Context`             | Sim         | Ambiente, permissoes e recursos disponiveis                  |
| `priority`         | `Enum{critical,high,normal,low}` | Nao | Prioridade de execucao                             |
| `timeout`          | `Duration`            | Nao         | Tempo maximo para conclusao                                  |
| `parent_contract`  | `UUID v7 | null`      | Nao         | Referencia ao contrato pai (para composicao)                 |
| `tags`             | `Set<String>`         | Nao         | Classificacao semantica livre                                |
| `declared_by`      | `Identity`            | Sim         | Quem declarou a intencao (humano ou sistema)                 |
| `declared_at`      | `Timestamp ISO-8601`  | Sim         | Quando a intencao foi declarada                              |

**GoalSpec** e um predicado formal:

```
GoalSpec = {
  predicate: Expression,       -- condicao que define sucesso
  acceptance_criteria: List<Criterion>,  -- criterios de aceite decomponiveis
  negative_criteria: List<Criterion>     -- o que NAO deve acontecer
}
```

### 1.3 Camada EXECUCAO (E)

A camada de execucao e opaca ao humano. E o territorio da maquina — densa, otimizada, nao ambigua.

| Campo              | Tipo                  | Obrigatorio | Semantica                                                    |
|--------------------|-----------------------|-------------|--------------------------------------------------------------|
| `plan`             | `ExecutionPlan`       | Sim         | Grafo de acoes a serem executadas                            |
| `bindings`         | `Map<Name, Resource>` | Sim         | Mapeamento de entidades abstratas para recursos concretos    |
| `decisions`        | `List<Decision>`      | Sim         | Registro de cada decisao tomada pelo executor, com razao     |
| `fallbacks`        | `List<FallbackRule>`  | Nao         | Estrategias de recuperacao para falhas previsiveis           |
| `executor_id`      | `Identity`            | Sim         | Identificacao do modelo/agente executor                      |
| `executor_version` | `SemVer`              | Sim         | Versao do executor                                           |
| `started_at`       | `Timestamp`           | Sim         | Inicio da execucao                                           |
| `completed_at`     | `Timestamp | null`    | Nao         | Fim da execucao (null se em andamento)                       |
| `state`            | `Enum{pending,running,completed,failed,rolled_back}` | Sim | Estado atual |
| `checkpoints`      | `List<Checkpoint>`    | Nao         | Pontos de restauracao para rollback parcial                  |

**ExecutionPlan** e um DAG (Directed Acyclic Graph):

```
ExecutionPlan = DAG<ActionNode>

ActionNode = {
  action: Action,
  depends_on: Set<NodeID>,
  retry_policy: RetryPolicy | null,
  timeout: Duration | null
}
```

### 1.4 Camada EVIDENCIA (V)

A camada de evidencia e a prestacao de contas. Reconstroi a ponte entre o que foi pedido e o que aconteceu.

| Campo              | Tipo                    | Obrigatorio | Semantica                                                  |
|--------------------|-------------------------|-------------|------------------------------------------------------------|
| `outcome`          | `Enum{success,partial,failure}` | Sim | Resultado geral da execucao                                |
| `goal_satisfaction`| `GoalEvaluation`        | Sim         | Avaliacao formal de cada criterio do GoalSpec              |
| `artifacts`        | `List<Artifact>`        | Nao         | Artefatos produzidos (dados, arquivos, estados alterados)  |
| `trace`            | `List<TraceEntry>`      | Sim         | Log estruturado de cada passo com timestamp                |
| `side_effects`     | `List<SideEffect>`      | Sim         | Efeitos colaterais observados (mesmo que vazios)           |
| `integrity_hash`   | `SHA-256`               | Sim         | Hash da evidencia completa para anti-tampering             |
| `chain`            | `Hash | null`           | Nao         | Hash da evidencia anterior (cadeia de custodia)            |
| `verified_by`      | `Identity`              | Sim         | Identificacao do validador                                 |
| `verified_at`      | `Timestamp`             | Sim         | Quando a validacao ocorreu                                 |
| `human_summary`    | `NaturalText`           | Sim         | Resumo legivel do que aconteceu, gerado para o humano      |

**GoalEvaluation**:

```
GoalEvaluation = {
  predicate_result: Bool,
  criteria_results: List<{criterion: Criterion, met: Bool, evidence: Artifact}>,
  negative_criteria_results: List<{criterion: Criterion, violated: Bool, evidence: Artifact | null}>
}
```

### 1.5 Formato de Serializacao Dual

O contrato existe em dois formatos complementares:

**Formato Binario Compacto (`.simlb`)** — para execucao e transmissao:
- Baseado em MessagePack com schema pre-definido
- Header fixo de 32 bytes: magic number (4B) + versao (2B) + flags (2B) + tamanho de cada camada (8B x 3)
- Cada camada serializada independentemente para permitir acesso parcial
- Compressao zstd opcional por camada

**Formato JSON Legivel (`.siml.json`)** — para inspecao e debug:
- JSON com schema JSON Schema Draft 2020-12
- Campos com nomes completos e descritivos
- Includes `$schema` pointer para validacao

Mapeamento bidirecional garantido:

```
forall C: decode(encode_bin(C)) = decode(encode_json(C)) = C
```

---

## 2. Tipos Primitivos Semanticos

SIML define seis tipos primitivos semanticos. Todo contrato e composto exclusivamente a partir deles.

### 2.1 Entity

Representa algo que existe, tem identidade e pode ser referenciado.

```
Entity = {
  eid:        EntityID,            -- identificador unico e estavel
  type:       EntityType,          -- classificacao semantica (ex: "pessoa", "conta", "pedido")
  attributes: Map<Name, Value>,    -- propriedades tipadas
  relations:  Set<Relation>,       -- conexoes com outras entidades
  lifecycle:  LifecycleState       -- estado no ciclo de vida (draft, active, archived, deleted)
}

Relation = {
  type:   RelationType,   -- ex: "pertence_a", "autoriza", "depende_de"
  target: EntityID,
  cardinality: Enum{one, many},
  metadata: Map<Name, Value>
}
```

**Propriedades fundamentais:**
- **Identidade estavel**: o `eid` nao muda durante toda a vida da entidade
- **Equivalencia semantica**: duas entidades com `eid` diferentes podem ser semanticamente equivalentes (`customer_id` = `cli_cod`)
- **Projecao**: uma Entity pode ser projetada em diferentes visoes dependendo do contexto

### 2.2 Action

Representa uma transformacao no estado do mundo. E a unidade atomica de execucao.

```
Action = {
  aid:             ActionID,
  verb:            SemanticVerb,         -- ex: "transferir", "criar", "aprovar", "notificar"
  subject:         EntityID,             -- quem executa
  object:          EntityID | null,      -- sobre o que atua
  parameters:      Map<Name, Value>,     -- parametros da acao
  preconditions:   List<Predicate>,      -- condicoes que DEVEM ser verdadeiras antes
  postconditions:  List<Predicate>,      -- condicoes que DEVEM ser verdadeiras depois
  side_effects:    List<SideEffectDecl>, -- efeitos colaterais declarados
  idempotent:      Bool,                 -- se a acao pode ser re-executada com seguranca
  reversible:      Bool,                 -- se existe acao inversa
  inverse:         ActionID | null       -- referencia a acao inversa, se reversible
}

Predicate = {
  expression: Expression,
  description: NaturalText      -- descricao legivel da condicao
}
```

**Propriedades fundamentais:**
- **Atomicidade**: uma Action ou completa totalmente ou nao tem efeito
- **Declaratividade**: side_effects sao declarados, nao descobertos
- **Reversibilidade explicita**: se uma acao e reversivel, a acao inversa e parte do contrato

### 2.3 Constraint

Representa uma regra que deve ser respeitada. Constraints sao verificadas deterministicamente.

```
Constraint = {
  cid:        ConstraintID,
  type:       Enum{invariant, precondition, postcondition, limit, rule},
  scope:      Enum{contract, entity, action, global},
  expression: Expression,            -- predicado formal
  severity:   Enum{fatal, error, warning},
  message:    NaturalText,           -- explicacao legivel da violacao
  enforced:   Enum{compile_time, runtime, both}
}
```

**Subtipos:**

```
Invariant   <: Constraint  -- deve ser verdadeiro em TODOS os estados
Limit       <: Constraint  -- define fronteiras numericas ou temporais
Rule        <: Constraint  -- logica de negocio condicional (if-then)
```

**Propriedades fundamentais:**
- **Verificabilidade**: toda Constraint e redutivel a um predicado booleano
- **Composicao**: constraints de contratos diferentes se combinam por conjuncao (AND)
- **Conflito detectavel**: se duas constraints sao mutuamente exclusivas, o validador detecta antes da execucao

### 2.4 Evidence

Representa prova auditavel de que algo aconteceu (ou nao aconteceu).

```
Evidence = {
  vid:          EvidenceID,
  type:         Enum{assertion, measurement, attestation, proof},
  claim:        Predicate,           -- o que esta sendo evidenciado
  data:         Artifact,            -- o dado que suporta a evidencia
  timestamp:    Timestamp,           -- quando foi coletada
  source:       Identity,            -- quem/o que produziu
  hash:         SHA-256,             -- hash do conteudo para integridade
  prev_hash:    SHA-256 | null,      -- hash da evidencia anterior (cadeia)
  signature:    Signature | null,    -- assinatura criptografica
  verifiable:   Bool                 -- se pode ser verificada independentemente
}

Artifact = {
  type:     MIMEType,
  size:     Bytes,
  content:  BinaryData | URI,       -- inline (se pequeno) ou referencia
  checksum: SHA-256
}
```

**Cadeia de custodia:**

```
E_0 -> E_1 -> E_2 -> ... -> E_n

onde E_i.prev_hash = hash(E_{i-1})
```

Qualquer alteracao em uma evidencia intermediaria invalida toda a cadeia subsequente.

### 2.5 Flow

Representa a estrutura de controle de execucao.

```
Flow = Sequence | Parallel | Conditional | Loop | Saga

Sequence = {
  steps: List<FlowNode>          -- executados em ordem
}

Parallel = {
  branches: List<FlowNode>,      -- executados simultaneamente
  join:     Enum{all, any, n_of}, -- condicao de convergencia
  n:        Int | null            -- para join = n_of
}

Conditional = {
  condition: Predicate,
  on_true:   FlowNode,
  on_false:  FlowNode | null
}

Loop = {
  condition:   Predicate,         -- condicao de continuacao
  body:        FlowNode,
  max_iterations: Int | null,     -- protecao contra loops infinitos
  type:        Enum{while, until, for_each}
}

Saga = {
  steps:        List<SagaStep>,
  compensation: Enum{backward, forward, custom}
}

SagaStep = {
  action:       Action,
  compensate:   Action            -- acao de compensacao se falhar adiante
}

FlowNode = Action | Flow         -- composicao recursiva
```

**Propriedades fundamentais:**
- **Composicao recursiva**: um Flow pode conter outros Flows
- **Terminacao garantida**: todo Loop tem `max_iterations` ou o validador rejeita
- **Saga nativa**: transacoes distribuidas sao cidadas de primeira classe

### 2.6 Context

Representa o ambiente no qual o contrato executa.

```
Context = {
  environment:   Map<Name, Value>,    -- variaveis de ambiente
  permissions:   PermissionSet,       -- o que o contrato pode fazer
  resources:     List<Resource>,      -- recursos disponiveis
  time_window:   TimeWindow | null,   -- janela de execucao permitida
  locale:        Locale,              -- idioma, timezone, formato numerico
  tenant:        TenantID | null,     -- isolamento multi-tenant
  correlation:   CorrelationID        -- rastreabilidade entre contratos
}

PermissionSet = {
  allowed:  Set<Permission>,
  denied:   Set<Permission>,          -- deny explicito tem precedencia
  escalation: EscalationPolicy | null -- o que fazer se precisar de mais permissoes
}

Resource = {
  rid:         ResourceID,
  type:        Enum{database, api, file_system, queue, service},
  endpoint:    URI,
  credentials: CredentialRef,         -- referencia (nunca inline) a credenciais
  limits:      ResourceLimits         -- rate limits, quotas, etc
}
```

---

## 3. Exemplos Concretos

### 3.1 Exemplo 1: Transferencia Bancaria

**Intencao humana:** "Transferir R$500 da conta A para conta B"

```
CONTRACT transfer_500 {
  VERSION: 1.0.0

  -- CAMADA DE INTENCAO --
  INTENT {
    id: "c-7f3a-2026-0312-transfer-001"
    intent: "Transferir R$500,00 da conta corrente de Alice para conta corrente de Bob"
    declared_by: IDENTITY("alice", role: "account_holder")
    declared_at: "2026-03-12T10:30:00-03:00"

    GOAL {
      predicate: balance(account_B) = balance(account_B)_before + 500.00
                 AND balance(account_A) = balance(account_A)_before - 500.00
      acceptance_criteria: [
        "Saldo de A decrementado em exatamente R$500,00",
        "Saldo de B incrementado em exatamente R$500,00",
        "Comprovante gerado com numero de protocolo"
      ]
      negative_criteria: [
        "Saldo de A nao pode ficar negativo",
        "Nenhuma outra conta deve ser afetada"
      ]
    }

    CONTEXT {
      environment: { channel: "mobile_app", session: "sess-9x8k" }
      permissions: ALLOW(debit: account_A, credit: account_B, generate: receipt)
      resources: [
        RESOURCE("core_banking", type: api, endpoint: "https://core.bank/v2")
      ]
      time_window: { start: "2026-03-12T06:00", end: "2026-03-12T22:00" }
    }

    CONSTRAINTS [
      INVARIANT balance(account_A) >= 0
        SEVERITY fatal
        MESSAGE "Saldo insuficiente na conta de origem"

      LIMIT amount <= 10000.00
        SEVERITY fatal
        MESSAGE "Transferencia excede limite diario"

      RULE requires_token IF amount > 1000.00
        SEVERITY fatal
        MESSAGE "Transferencias acima de R$1000 exigem token"
    ]
  }

  -- CAMADA DE EXECUCAO --
  EXECUTION {
    executor_id: IDENTITY("executor-qwen-7b", version: "2.1.0")

    PLAN {
      SAGA compensation: backward {

        STEP 1: validate_balance {
          ACTION {
            verb: "consultar"
            subject: ENTITY(account_A)
            preconditions: [account_A.status = "active"]
            postconditions: [balance_A >= 500.00]
            idempotent: true
            reversible: false
          }
        }

        STEP 2: debit_origin {
          ACTION {
            verb: "debitar"
            subject: ENTITY(account_A)
            parameters: { amount: 500.00, currency: "BRL" }
            preconditions: [balance_A >= 500.00]
            postconditions: [balance_A = balance_A_before - 500.00]
            side_effects: [AUDIT_LOG("debit", account_A, 500.00)]
            idempotent: false
            reversible: true
            inverse: ACTION("creditar", account_A, 500.00)
          }
          COMPENSATE: ACTION("creditar", account_A, 500.00)
        }

        STEP 3: credit_destination {
          ACTION {
            verb: "creditar"
            subject: ENTITY(account_B)
            parameters: { amount: 500.00, currency: "BRL" }
            preconditions: [account_B.status = "active"]
            postconditions: [balance_B = balance_B_before + 500.00]
            side_effects: [AUDIT_LOG("credit", account_B, 500.00)]
            idempotent: false
            reversible: true
            inverse: ACTION("debitar", account_B, 500.00)
          }
          COMPENSATE: ACTION("debitar", account_B, 500.00)
        }

        STEP 4: generate_receipt {
          ACTION {
            verb: "gerar"
            subject: ENTITY(receipt)
            parameters: { from: account_A, to: account_B, amount: 500.00 }
            postconditions: [receipt.protocol != null]
            idempotent: true
            reversible: false
          }
        }
      }
    }

    DECISIONS [
      { reason: "Saga pattern escolhido por envolver duas contas em servicos potencialmente distintos" },
      { reason: "Debito antes de credito para minimizar risco de credito fantasma" }
    ]
  }

  -- CAMADA DE EVIDENCIA --
  EVIDENCE {
    outcome: success

    GOAL_EVALUATION {
      predicate_result: true
      criteria_results: [
        { criterion: "Saldo de A decrementado", met: true,
          evidence: ARTIFACT(balance_snapshot_A, after: 2350.00) },
        { criterion: "Saldo de B incrementado", met: true,
          evidence: ARTIFACT(balance_snapshot_B, after: 8500.00) },
        { criterion: "Comprovante gerado", met: true,
          evidence: ARTIFACT(receipt, protocol: "TRF-2026-0312-00847") }
      ]
      negative_criteria_results: [
        { criterion: "Saldo de A nao negativo", violated: false },
        { criterion: "Nenhuma outra conta afetada", violated: false }
      ]
    }

    TRACE [
      { t: "10:30:01.003", step: "validate_balance", result: "ok", duration: "45ms" },
      { t: "10:30:01.052", step: "debit_origin", result: "ok", duration: "120ms" },
      { t: "10:30:01.178", step: "credit_destination", result: "ok", duration: "98ms" },
      { t: "10:30:01.280", step: "generate_receipt", result: "ok", duration: "35ms" }
    ]

    SIDE_EFFECTS [
      AUDIT_LOG("debit", account_A, 500.00, t: "10:30:01.055"),
      AUDIT_LOG("credit", account_B, 500.00, t: "10:30:01.180")
    ]

    integrity_hash: "sha256:a3f8c9d2e1b0..."
    chain: null
    verified_by: IDENTITY("validator-v1.0")
    verified_at: "2026-03-12T10:30:01.320-03:00"

    human_summary: "Transferencia de R$500,00 realizada com sucesso.
      De: Alice (conta A, saldo restante: R$2.350,00)
      Para: Bob (conta B)
      Protocolo: TRF-2026-0312-00847
      Duracao total: 317ms"
  }
}
```

### 3.2 Exemplo 2: Aprovacao de Compra

**Intencao humana:** "Aprovar compra se valor < alcada do aprovador"

```
CONTRACT purchase_approval {
  VERSION: 1.0.0

  INTENT {
    id: "c-7f3a-2026-0312-approval-042"
    intent: "Avaliar e aprovar/rejeitar solicitacao de compra com base na alcada do aprovador"
    declared_by: IDENTITY("procurement_system")
    declared_at: "2026-03-12T14:00:00-03:00"

    GOAL {
      predicate: (purchase.amount <= approver.authority_limit
                    AND purchase.status = "approved")
                 OR (purchase.amount > approver.authority_limit
                    AND purchase.status = "escalated")
      acceptance_criteria: [
        "Compras dentro da alcada sao aprovadas automaticamente",
        "Compras acima da alcada sao escaladas ao nivel superior",
        "Toda decisao tem justificativa registrada"
      ]
    }

    CONTEXT {
      permissions: ALLOW(read: purchase, update: purchase.status, notify: approver)
      resources: [
        RESOURCE("erp", type: api, endpoint: "https://erp.company/v3"),
        RESOURCE("notification", type: service, endpoint: "https://notify.internal")
      ]
    }

    CONSTRAINTS [
      INVARIANT purchase.amount > 0
        MESSAGE "Valor de compra deve ser positivo"

      RULE requires_3_quotes IF purchase.amount > 5000.00
        MESSAGE "Compras acima de R$5.000 exigem 3 cotacoes"

      RULE requires_director IF purchase.amount > 50000.00
        MESSAGE "Compras acima de R$50.000 exigem aprovacao de diretor"
    ]
  }

  EXECUTION {
    executor_id: IDENTITY("executor-qwen-7b", version: "2.1.0")

    PLAN {
      SEQUENCE {

        STEP 1: load_purchase {
          ACTION {
            verb: "consultar"
            object: ENTITY(purchase, id: "PO-2026-1847")
            postconditions: [purchase.loaded = true]
          }
        }

        STEP 2: load_approver {
          ACTION {
            verb: "consultar"
            object: ENTITY(approver, id: "USR-martinez")
            postconditions: [approver.authority_limit != null]
          }
        }

        STEP 3: evaluate {
          CONDITIONAL {
            -- Primeiro nivel: dentro da alcada?
            IF purchase.amount <= approver.authority_limit {

              CONDITIONAL {
                -- Segundo nivel: precisa de cotacoes?
                IF purchase.amount > 5000.00 AND purchase.quotes_count < 3 {
                  ACTION {
                    verb: "rejeitar"
                    object: ENTITY(purchase)
                    parameters: { reason: "Cotacoes insuficientes", required: 3 }
                    postconditions: [purchase.status = "pending_quotes"]
                  }
                } ELSE {
                  ACTION {
                    verb: "aprovar"
                    object: ENTITY(purchase)
                    parameters: { approved_by: approver.id }
                    postconditions: [purchase.status = "approved"]
                    side_effects: [
                      NOTIFY(purchase.requester, "Compra aprovada"),
                      AUDIT_LOG("approval", purchase.id, approver.id)
                    ]
                  }
                }
              }

            } ELSE {

              CONDITIONAL {
                IF purchase.amount > 50000.00 {
                  ACTION {
                    verb: "escalar"
                    object: ENTITY(purchase)
                    parameters: { escalate_to: "director_level" }
                    postconditions: [purchase.status = "escalated_director"]
                    side_effects: [NOTIFY("director_group", "Aprovacao necessaria")]
                  }
                } ELSE {
                  ACTION {
                    verb: "escalar"
                    object: ENTITY(purchase)
                    parameters: { escalate_to: approver.superior }
                    postconditions: [purchase.status = "escalated"]
                    side_effects: [NOTIFY(approver.superior, "Aprovacao necessaria")]
                  }
                }
              }

            }
          }
        }
      }
    }
  }

  EVIDENCE {
    outcome: success

    GOAL_EVALUATION {
      predicate_result: true
      criteria_results: [
        { criterion: "Decisao tomada conforme alcada", met: true,
          evidence: ARTIFACT(decision_log, {
            amount: 3200.00, limit: 10000.00, action: "approved"
          })
        },
        { criterion: "Justificativa registrada", met: true,
          evidence: ARTIFACT(audit_entry, id: "AUD-2026-9923") }
      ]
    }

    TRACE [
      { t: "14:00:00.100", step: "load_purchase", result: "ok", data: { amount: 3200.00 } },
      { t: "14:00:00.180", step: "load_approver", result: "ok", data: { limit: 10000.00 } },
      { t: "14:00:00.200", step: "evaluate/conditional", branch: "within_limit" },
      { t: "14:00:00.201", step: "evaluate/conditional/quotes_check", branch: "sufficient" },
      { t: "14:00:00.250", step: "approve", result: "ok" }
    ]

    human_summary: "Compra PO-2026-1847 (R$3.200,00) aprovada por Martinez.
      Valor dentro da alcada (limite: R$10.000,00).
      Tempo de processamento: 150ms."
  }
}
```

### 3.3 Exemplo 3: Integracao de Dados com Scheduling

**Intencao humana:** "Sincronizar clientes entre sistema A e B diariamente"

```
CONTRACT customer_sync {
  VERSION: 1.2.0

  INTENT {
    id: "c-7f3a-2026-0312-sync-daily"
    intent: "Sincronizar cadastro de clientes entre ERP Alpha e CRM Beta,
             diariamente as 02:00, com resolucao automatica de conflitos"
    declared_by: IDENTITY("data_team", role: "data_engineering")
    declared_at: "2026-03-12T09:00:00-03:00"

    GOAL {
      predicate: forall client in (Alpha UNION Beta):
                   Alpha.get(client.canonical_id).data = Beta.get(client.canonical_id).data
      acceptance_criteria: [
        "Clientes novos em A aparecem em B e vice-versa",
        "Atualizacoes propagadas bidirecionalmente",
        "Conflitos resolvidos por timestamp (last-write-wins) com log de decisao",
        "Execucao completa em menos de 30 minutos"
      ]
      negative_criteria: [
        "Nenhum cliente duplicado",
        "Nenhum dado perdido (delecao logica, nunca fisica)"
      ]
    }

    CONTEXT {
      permissions: ALLOW(
        read: alpha.customers, write: alpha.customers,
        read: beta.customers, write: beta.customers
      )
      resources: [
        RESOURCE("alpha_erp", type: api, endpoint: "https://alpha.corp/api/v2",
                 limits: { rate: "100req/s", batch: 500 }),
        RESOURCE("beta_crm", type: api, endpoint: "https://beta.saas.io/rest",
                 limits: { rate: "50req/s", batch: 200 }),
        RESOURCE("conflict_store", type: database,
                 endpoint: "postgres://sync-db/conflicts")
      ]
      time_window: { start: "02:00", end: "04:00", timezone: "America/Sao_Paulo" }
    }

    CONSTRAINTS [
      INVARIANT count(customers, system: Alpha) + count(customers, system: Beta)
                >= count_before
        MESSAGE "Sincronizacao nunca reduz o total de clientes"

      LIMIT execution_time <= 30min
        SEVERITY error

      RULE soft_delete_only
        expression: forall op in operations: op.type != "hard_delete"
        MESSAGE "Apenas delecao logica permitida"
    ]

    -- SCHEDULING --
    SCHEDULE {
      cron: "0 2 * * *"
      timezone: "America/Sao_Paulo"
      retry_on_failure: { max_attempts: 3, backoff: exponential, base: 5min }
      alert_on_failure: NOTIFY("data_team", channel: "slack")
    }
  }

  EXECUTION {
    executor_id: IDENTITY("executor-qwen-7b", version: "2.1.0")

    PLAN {
      SEQUENCE {

        STEP 1: extract_deltas {
          PARALLEL join: all {
            BRANCH alpha_delta {
              ACTION {
                verb: "extrair"
                object: ENTITY(alpha_customers)
                parameters: { since: last_successful_sync, batch_size: 500 }
                postconditions: [alpha_delta.loaded = true]
              }
            }
            BRANCH beta_delta {
              ACTION {
                verb: "extrair"
                object: ENTITY(beta_customers)
                parameters: { since: last_successful_sync, batch_size: 200 }
                postconditions: [beta_delta.loaded = true]
              }
            }
          }
        }

        STEP 2: match_entities {
          ACTION {
            verb: "correlacionar"
            parameters: {
              strategy: "semantic_match",
              keys: [
                { alpha: "customer_id", beta: "cli_cod", weight: 1.0 },
                { alpha: "cpf", beta: "documento", weight: 1.0 },
                { alpha: "email", beta: "email_principal", weight: 0.8 },
                { alpha: "nome_completo", beta: "razao_social", weight: 0.6 }
              ],
              threshold: 0.85
            }
            postconditions: [match_table.ready = true]
            side_effects: [LOG("match_stats", { matched, unmatched_alpha, unmatched_beta })]
          }
        }

        STEP 3: resolve_conflicts {
          FOR_EACH record IN match_table WHERE record.has_conflict {
            CONDITIONAL {
              IF record.alpha.updated_at > record.beta.updated_at {
                ACTION {
                  verb: "resolver_conflito"
                  parameters: { winner: "alpha", strategy: "last_write_wins" }
                  side_effects: [
                    STORE_CONFLICT(record, winner: "alpha",
                                   loser_snapshot: record.beta.data)
                  ]
                }
              } ELSE {
                ACTION {
                  verb: "resolver_conflito"
                  parameters: { winner: "beta", strategy: "last_write_wins" }
                  side_effects: [
                    STORE_CONFLICT(record, winner: "beta",
                                   loser_snapshot: record.alpha.data)
                  ]
                }
              }
            }
          }
        }

        STEP 4: apply_changes {
          PARALLEL join: all {
            BRANCH write_to_alpha {
              ACTION {
                verb: "aplicar_delta"
                object: ENTITY(alpha_customers)
                parameters: { changes: resolved_changes_for_alpha, batch_size: 500 }
                idempotent: true
              }
            }
            BRANCH write_to_beta {
              ACTION {
                verb: "aplicar_delta"
                object: ENTITY(beta_customers)
                parameters: { changes: resolved_changes_for_beta, batch_size: 200 }
                idempotent: true
              }
            }
          }
        }

        STEP 5: verify_consistency {
          ACTION {
            verb: "verificar"
            parameters: { type: "count_and_sample", sample_size: 100 }
            postconditions: [
              abs(count(alpha) - count(beta)) <= tolerance,
              sample_match_rate >= 0.99
            ]
          }
        }
      }
    }

    DECISIONS [
      { reason: "Extracao em paralelo para reduzir tempo total" },
      { reason: "Last-write-wins com snapshot do perdedor para auditoria" },
      { reason: "Aplicacao idempotente para seguranca em retentativas" },
      { reason: "Verificacao por amostragem: check completo excederia janela" }
    ]
  }

  EVIDENCE {
    outcome: success

    GOAL_EVALUATION {
      predicate_result: true
      criteria_results: [
        { criterion: "Novos clientes propagados", met: true,
          evidence: ARTIFACT({ new_in_alpha: 23, new_in_beta: 47, synced: 70 }) },
        { criterion: "Atualizacoes propagadas", met: true,
          evidence: ARTIFACT({ updates_alpha_to_beta: 156, updates_beta_to_alpha: 89 }) },
        { criterion: "Conflitos resolvidos", met: true,
          evidence: ARTIFACT({ conflicts: 12, resolved: 12, strategy: "last_write_wins" }) },
        { criterion: "Execucao < 30min", met: true,
          evidence: ARTIFACT({ duration: "18m42s" }) }
      ]
      negative_criteria_results: [
        { criterion: "Sem duplicatas", violated: false,
          evidence: ARTIFACT(duplicate_check, { found: 0 }) },
        { criterion: "Sem perda de dados", violated: false,
          evidence: ARTIFACT(count_check, { before: 45230, after: 45300 }) }
      ]
    }

    integrity_hash: "sha256:b7e2f1a3c9d0..."
    chain: "sha256:previous_sync_hash..."
    verified_by: IDENTITY("validator-v1.0")
    verified_at: "2026-03-13T02:18:42-03:00"

    human_summary: "Sincronizacao diaria concluida em 18m42s.
      70 novos clientes sincronizados (23 de Alpha, 47 de Beta).
      245 atualizacoes propagadas.
      12 conflitos resolvidos por last-write-wins (snapshots preservados).
      Verificacao de consistencia: 100% da amostra ok.
      Total de clientes apos sync: 45.300."
  }
}
```

---

## 4. Composicao de Contratos

### 4.1 Referencia entre Contratos

Contratos se referenciam por `id` e `version`, criando um grafo de dependencias:

```
CONTRACT parent_contract {
  INTENT {
    id: "c-parent-001"
    ...
  }

  EXECUTION {
    PLAN {
      STEP 1: sub_task_a {
        DELEGATE CONTRACT "c-child-001" VERSION ">=1.0.0, <2.0.0" {
          -- parametros passados ao contrato filho
          BIND { account: parent.account_A }
          -- timeout herdado ou sobrescrito
          TIMEOUT: 10s
          -- resultado esperado
          EXPECT: { status: "completed" }
        }
      }
    }
  }
}
```

A referencia inclui:
- **Identificador**: qual contrato invocar
- **Range de versao**: compatibilidade tolerada
- **Bindings**: mapeamento de entidades do contexto pai para o contexto filho
- **Expectativa**: o que o pai espera como resultado

### 4.2 Heranca Semantica vs Composicao

SIML oferece dois mecanismos de reuso:

**Heranca Semantica** — para especializar contratos:

```
CONTRACT transfer_international EXTENDS transfer_500 {
  -- herda toda a estrutura, sobrescreve/adiciona
  INTENT {
    CONSTRAINTS [
      INHERIT ALL
      ADD RULE requires_swift_code
        expression: destination.swift_code != null
        MESSAGE "Transferencias internacionais exigem SWIFT code"
    ]
  }
}
```

Regras de heranca:
- Constraints do pai nunca podem ser removidas, apenas adicionadas
- Postconditions do pai nunca podem ser enfraquecidas
- Preconditions podem ser relaxadas (contravariancia)

**Composicao** — para combinar contratos independentes:

```
CONTRACT onboarding_completo {
  COMPOSE {
    SEQUENCE {
      USE CONTRACT "criar_conta" BIND { cliente: new_customer }
      USE CONTRACT "verificar_identidade" BIND { pessoa: new_customer }
      USE CONTRACT "configurar_limites" BIND { conta: created_account }
    }
  }
}
```

Composicao e preferivel quando os contratos sao ortogonais. Heranca e preferivel quando ha relacao "e um tipo de".

### 4.3 Resolucao de Conflitos entre Contratos

Quando dois contratos compostos definem constraints ou efeitos que colidem:

```
CONFLICT_RESOLUTION {
  strategy: Enum{
    priority_based,    -- contrato com maior prioridade vence
    most_restrictive,  -- a constraint mais restritiva prevalece
    explicit_override, -- resolucao manual declarada
    fail_fast          -- qualquer conflito impede execucao
  }

  -- Para resolucao explicita:
  RESOLVE conflict_between("contract_A.limit_x", "contract_B.limit_y") {
    winner: "contract_A"
    justification: "Regulacao financeira tem precedencia sobre regra interna"
  }
}
```

Deteccao de conflitos e feita em tempo de validacao (antes da execucao):

```
validate(C1 COMPOSE C2) -> {
  conflicts: List<Conflict>,
  resolvable: Bool,
  suggestions: List<Resolution>
}
```

### 4.4 Transacoes Distribuidas — Saga Pattern Semantico

SIML trata sagas como cidadas de primeira classe, nao como pattern de implementacao:

```
SAGA "process_order" {
  COMPENSATION: backward    -- compensacao na ordem inversa

  STEP reserve_stock {
    DO:         CONTRACT "reserve_inventory" BIND { items: order.items }
    COMPENSATE: CONTRACT "release_inventory" BIND { reservation: reservation_id }
  }

  STEP charge_payment {
    DO:         CONTRACT "process_payment" BIND { amount: order.total }
    COMPENSATE: CONTRACT "refund_payment" BIND { transaction: transaction_id }
  }

  STEP ship_order {
    DO:         CONTRACT "create_shipment" BIND { order: order_id }
    COMPENSATE: CONTRACT "cancel_shipment" BIND { shipment: shipment_id }
  }

  ON_FAILURE {
    -- Alem da compensacao automatica:
    NOTIFY("operations_team", severity: "high")
    STORE_EVIDENCE(partial_saga_state)
  }
}
```

Garantias da saga semantica:
- Cada step `DO` tem exatamente um `COMPENSATE`
- Compensacoes sao idempotentes por definicao
- O estado da saga e persistido em cada step para sobreviver a falhas do executor
- A evidencia registra tanto os steps executados quanto os compensados

---

## 5. Versionamento Semantico

### 5.1 Diff Semantico

O diff entre versoes de contratos nao e textual — e semantico. Compara-se a **estrutura de significado**, nao a representacao.

```
semantic_diff(C_v1, C_v2) -> {
  intent_changes: List<IntentDelta>,
  constraint_changes: List<ConstraintDelta>,
  flow_changes: List<FlowDelta>,
  breaking: Bool,
  migration_possible: Bool
}

IntentDelta = {
  type: Enum{
    goal_strengthened,     -- mais criterios de aceite
    goal_weakened,         -- menos criterios (breaking!)
    goal_modified,         -- criterios alterados (breaking!)
    constraint_added,      -- nova restricao
    constraint_removed,    -- restricao removida (breaking!)
    constraint_modified,   -- restricao alterada (avaliar)
    scope_expanded,        -- mais entidades envolvidas
    scope_narrowed         -- menos entidades (breaking!)
  },
  before: Fragment,
  after: Fragment,
  breaking: Bool,
  justification: NaturalText
}
```

### 5.2 Regras de Compatibilidade

Uma mudanca **quebra** o contrato quando:

| Mudanca                                | Quebra? | Razao                                          |
|----------------------------------------|---------|-------------------------------------------------|
| Adicionar constraint                   | Nao     | Consumidores existentes ja satisfazem           |
| Remover constraint                     | Sim     | Consumidores podem depender da garantia         |
| Enfraquecer postcondition              | Sim     | Consumidores esperam o resultado mais forte     |
| Fortalecer postcondition               | Nao     | Resultado mais forte satisfaz expectativas      |
| Enfraquecer precondition               | Nao     | Aceita mais entradas                            |
| Fortalecer precondition                | Sim     | Entradas antes validas podem ser rejeitadas     |
| Adicionar campo obrigatorio na entrada | Sim     | Chamadores existentes nao fornecem o campo      |
| Adicionar campo opcional na entrada    | Nao     | Chamadores existentes nao sao afetados          |
| Mudar tipo de uma Entity               | Sim     | Bindings existentes podem ser incompativeis     |
| Adicionar step ao flow                 | Avaliar | Depende se altera postconditions observaveis    |

Formalmente, compatibilidade segue o principio de Liskov aplicado a contratos:

```
compatible(C_new, C_old) iff
  preconditions(C_new) SUBSUMED_BY preconditions(C_old)
  AND postconditions(C_old) SUBSUMED_BY postconditions(C_new)
  AND constraints(C_old) SUBSET_OF constraints(C_new)
```

### 5.3 Migration Automatica

Quando uma nova versao e compativel, contratos dependentes migram automaticamente. Quando nao e, SIML gera um plano de migracao:

```
MIGRATION from: "1.0.0" to: "2.0.0" {

  -- Campos adicionados que precisam de valor default
  MAP_FIELD "priority" DEFAULT "normal"

  -- Entidades com tipo alterado
  TRANSFORM ENTITY "account" {
    ADD ATTRIBUTE "currency" DEFAULT "BRL"
    RENAME ATTRIBUTE "saldo" TO "balance"
  }

  -- Constraints adicionadas que precisam de validacao retroativa
  VALIDATE_EXISTING {
    CONSTRAINT "requires_swift_code"
    ON_VIOLATION: { strategy: "flag_for_review", notify: "data_team" }
  }

  -- Estimativa de impacto
  IMPACT {
    contracts_affected: 47,
    auto_migratable: 43,
    requires_review: 4,
    breaking_changes: ["removed field 'legacy_code'", "strengthened precondition on 'amount'"]
  }
}
```

### 5.4 Exemplo de Evolucao em 3 Versoes

**Versao 1.0.0** — Transferencia basica:
```
CONTRACT transfer {
  VERSION: 1.0.0
  GOAL: balance(B) += amount AND balance(A) -= amount
  CONSTRAINTS: [balance(A) >= 0]
}
```

**Versao 1.1.0** — Adiciona limite diario (compativel):
```
CONTRACT transfer {
  VERSION: 1.1.0
  GOAL: balance(B) += amount AND balance(A) -= amount   -- inalterado
  CONSTRAINTS: [
    balance(A) >= 0,                                     -- mantido
    daily_total(A) + amount <= daily_limit(A)            -- ADICIONADO (nao quebra)
  ]
}
```

Diff semantico: `{ constraint_added: "daily_limit", breaking: false }`

**Versao 2.0.0** — Adiciona suporte multi-moeda (breaking):
```
CONTRACT transfer {
  VERSION: 2.0.0
  GOAL: balance(B, currency) += converted(amount, from_curr, to_curr)
        AND balance(A, from_curr) -= amount
  CONSTRAINTS: [
    balance(A, from_curr) >= 0,
    daily_total(A) + amount <= daily_limit(A),
    currency IN supported_currencies                     -- NOVO campo obrigatorio
  ]
}
```

Diff semantico:
```
{
  goal_modified: "postcondition agora inclui conversao de moeda",
  constraint_added: "supported_currencies",
  field_added_required: "currency",
  breaking: true,
  migration: MIGRATION {
    MAP_FIELD "currency" DEFAULT "BRL"
    -- contratos existentes que nao especificam moeda assumem BRL
  }
}
```

---

## 6. Formato de Serializacao

### 6.1 Formato Binario Compacto (`.simlb`)

Projetado para eficiencia de transmissao e parsing por modelos compactos.

**Estrutura do arquivo:**

```
Offset  Tamanho  Campo
------  -------  -----
0x00    4B       Magic number: 0x53 0x49 0x4D 0x4C ("SIML")
0x04    2B       Versao do formato (major.minor)
0x06    2B       Flags:
                   bit 0: compressao zstd ativa
                   bit 1: assinatura presente
                   bit 2: cadeia de evidencia presente
                   bits 3-15: reservados
0x08    8B       Offset da camada INTENCAO
0x10    8B       Tamanho da camada INTENCAO
0x18    8B       Offset da camada EXECUCAO
0x20    8B       Tamanho da camada EXECUCAO
0x28    8B       Offset da camada EVIDENCIA
0x30    8B       Tamanho da camada EVIDENCIA
0x38    32B      SHA-256 do payload completo
0x58    var      Assinatura (se flag bit 1, Ed25519: 64B)
var     var      Camada INTENCAO (MessagePack)
var     var      Camada EXECUCAO (MessagePack)
var     var      Camada EVIDENCIA (MessagePack)
```

**Codificacao interna:**
- Strings: UTF-8 com indice de strings recorrentes (deduplicacao)
- EntityIDs: varint compactado
- Timestamps: delta encoding relativo ao timestamp base do contrato
- Enums: indice numerico (1 byte)
- Predicados: bytecode compacto de expressoes (notacao pos-fixa)

**Bytecode de predicados:**

```
Opcode  Instrucao       Exemplo
------  -----------     -------
0x01    PUSH_FIELD      PUSH_FIELD "balance"
0x02    PUSH_CONST      PUSH_CONST 500.00
0x03    PUSH_REF        PUSH_REF entity_id
0x10    EQ              a = b
0x11    GT              a > b
0x12    GTE             a >= b
0x13    LT              a < b
0x20    AND             a AND b
0x21    OR              a OR b
0x22    NOT             NOT a
0x30    ADD             a + b
0x31    SUB             a - b
0x40    FORALL          quantificador universal
0x41    EXISTS          quantificador existencial
```

### 6.2 Formato JSON Legivel (`.siml.json`)

Para inspecao humana, debugging e integracao com ferramentas existentes.

```json
{
  "$schema": "https://siml.dev/schema/contract/v1.json",
  "id": "c-7f3a-2026-0312-transfer-001",
  "version": "1.0.0",

  "intent": {
    "description": "Transferir R$500 da conta A para conta B",
    "declared_by": { "id": "alice", "role": "account_holder" },
    "declared_at": "2026-03-12T10:30:00-03:00",
    "goal": {
      "predicate": {
        "type": "and",
        "operands": [
          { "type": "eq", "left": {"field": "balance", "entity": "account_B"},
            "right": {"op": "add", "left": {"field": "balance", "entity": "account_B", "snapshot": "before"}, "right": 500.00}},
          { "type": "eq", "left": {"field": "balance", "entity": "account_A"},
            "right": {"op": "sub", "left": {"field": "balance", "entity": "account_A", "snapshot": "before"}, "right": 500.00}}
        ]
      },
      "acceptance_criteria": [
        {"id": "ac-1", "description": "Saldo de A decrementado em R$500"},
        {"id": "ac-2", "description": "Saldo de B incrementado em R$500"},
        {"id": "ac-3", "description": "Comprovante gerado"}
      ]
    },
    "constraints": [
      {"id": "inv-1", "type": "invariant", "expression": {"type": "gte", "left": {"field": "balance", "entity": "account_A"}, "right": 0}, "severity": "fatal"}
    ]
  },

  "execution": {
    "executor": {"id": "executor-qwen-7b", "version": "2.1.0"},
    "plan": { "type": "saga", "compensation": "backward", "steps": ["..."] },
    "state": "completed"
  },

  "evidence": {
    "outcome": "success",
    "integrity_hash": "sha256:a3f8c9d2e1b0...",
    "human_summary": "Transferencia de R$500 realizada com sucesso."
  }
}
```

### 6.3 Mapeamento Bidirecional

A conversao entre formatos e definida por um schema formal:

```
encode_binary: Contract -> Bytes
decode_binary: Bytes -> Contract | Error

encode_json: Contract -> JSON
decode_json: JSON -> Contract | Error

-- Propriedade fundamental (round-trip):
forall C: decode_binary(encode_binary(C)) = C
forall C: decode_json(encode_json(C)) = C
forall C: decode_binary(encode_binary(C)) = decode_json(encode_json(C))
```

Ferramenta CLI para conversao:

```bash
siml convert --from contract.siml.json --to contract.simlb
siml convert --from contract.simlb --to contract.siml.json
siml validate contract.simlb --schema v1
```

### 6.4 Estimativa de Tamanho

Comparacao para o exemplo da transferencia bancaria (Secao 3.1):

| Formato                      | Tamanho estimado | Notas                                   |
|------------------------------|------------------|-----------------------------------------|
| SIML binario (`.simlb`)     | ~380 bytes       | Com compressao zstd                     |
| SIML binario (sem compressao)| ~620 bytes       |                                         |
| SIML JSON (`.siml.json`)    | ~3.2 KB          | Legivel, com nomes completos            |
| Codigo equivalente (Python) | ~8-12 KB         | Incluindo validacao, logging, rollback  |
| Codigo equivalente (Java)   | ~15-25 KB        | Com classes, interfaces, exceptions     |
| BPMN XML equivalente        | ~6-10 KB         | Verbose por natureza                    |

O formato binario SIML e **20-40x mais compacto** que codigo equivalente, e **8-16x mais compacto** que BPMN. Isso e significativo para transmissao entre agentes e armazenamento de historico.

---

## 7. Seguranca e Trust

### 7.1 Assinatura de Contratos

Todo contrato pode ser assinado criptograficamente em cada camada:

```
SignedContract = {
  contract: Contract,
  signatures: {
    intent:    Signature,    -- assinada por quem declarou a intencao
    execution: Signature,    -- assinada pelo executor
    evidence:  Signature     -- assinada pelo validador
  }
}

Signature = {
  algorithm: "Ed25519",
  public_key: Bytes,
  signature: Bytes,
  timestamp: Timestamp
}
```

**Cadeia de confianca:**

```
Humano --assina--> Intencao
                      |
                      v
               Executor --assina--> Execucao
                                       |
                                       v
                                Validador --assina--> Evidencia
```

Cada camada referencia o hash da camada anterior. Qualquer alteracao retroativa invalida as assinaturas subsequentes.

### 7.2 Permissoes e Sandboxing

O modelo de permissoes e baseado em capabilities (nao em identidade):

```
PermissionModel = {
  -- O contrato declara o que PRECISA
  required_capabilities: Set<Capability>,

  -- O contexto declara o que PERMITE
  granted_capabilities: Set<Capability>,

  -- Execucao so ocorre se:
  -- required_capabilities SUBSET_OF granted_capabilities
}

Capability = {
  resource: ResourceID,
  actions:  Set<Enum{read, write, delete, execute, admin}>,
  scope:    Enum{own, team, org, global},
  ttl:      Duration | null    -- expiracao da capability
}
```

**Sandboxing em tempo de execucao:**

O executor opera dentro de um sandbox que garante:

1. **Isolamento de rede**: so pode acessar endpoints declarados em `Context.resources`
2. **Isolamento de dados**: so pode ler/escrever entidades listadas em `permissions`
3. **Isolamento temporal**: execucao abortada se exceder `timeout`
4. **Isolamento de efeitos**: side effects so sao commitados se todas as postconditions forem satisfeitas

```
Sandbox = {
  network_whitelist: Set<URI>,        -- derivado de Context.resources
  data_permissions:  PermissionSet,   -- derivado de Context.permissions
  max_duration:      Duration,        -- derivado de Intent.timeout
  max_memory:        Bytes,           -- configuracao do ambiente
  effect_buffer:     TransactionLog   -- efeitos pendentes de commit
}
```

### 7.3 Auditoria: Contrato Executado = Contrato Validado

O problema central: como garantir que o contrato que o executor recebeu e o mesmo que o validador verificou?

**Mecanismo de integridade:**

```
1. Tradutor gera contrato C, calcula H_intent = hash(C.intent)
2. Executor recebe C, verifica H_intent, executa, gera C.execution
   Calcula H_exec = hash(C.intent || C.execution)
3. Validador recebe C completo, verifica H_exec
   Gera C.evidence com H_evidence = hash(C.intent || C.execution || C.evidence)
4. H_evidence e o hash final do contrato, armazenado no log de auditoria
```

**Log de auditoria imutavel:**

```
AuditLog = AppendOnlyList<AuditEntry>

AuditEntry = {
  contract_id:    UUID,
  contract_hash:  SHA-256,
  prev_entry_hash: SHA-256,     -- encadeamento (append-only verificavel)
  event_type:     Enum{created, executed, validated, failed, compensated},
  timestamp:      Timestamp,
  actor:          Identity,
  details:        Map<String, Value>
}
```

Propriedade verificavel:

```
forall entry_i in AuditLog:
  entry_i.prev_entry_hash = hash(entry_{i-1})
```

Qualquer alteracao ou remocao de uma entrada quebra a cadeia, detectavel por verificacao linear.

### 7.4 Anti-Tampering

**Ameacas e mitigacoes:**

| Ameaca                                      | Mitigacao                                           |
|---------------------------------------------|-----------------------------------------------------|
| Executor altera a intencao antes de executar | Hash da intencao verificado antes da execucao       |
| Resultado falsificado na evidencia           | Validador independente re-verifica postconditions   |
| Evidencia alterada apos validacao            | Cadeia de hashes imutavel no audit log              |
| Executor malicioso (modelo comprometido)     | Sandbox de capabilities + validacao deterministica  |
| Replay attack (re-executar contrato antigo)  | UUID v7 com timestamp + nonce + TTL                 |
| Man-in-the-middle entre componentes          | Assinatura Ed25519 em cada camada                   |

**Verificacao de integridade end-to-end:**

```
verify_integrity(C: SignedContract) -> {
  intent_valid:    verify_sig(C.signatures.intent, hash(C.intent)),
  execution_valid: verify_sig(C.signatures.execution, hash(C.intent || C.execution)),
  evidence_valid:  verify_sig(C.signatures.evidence, hash(C)),
  chain_valid:     verify_chain(C.evidence.chain, audit_log),
  all_valid:       intent_valid AND execution_valid AND evidence_valid AND chain_valid
}
```

---

## 8. Comparacao com Alternativas

### 8.1 SIML vs BPMN (Business Process Model and Notation)

| Aspecto                    | BPMN                                 | SIML                                      |
|---------------------------|--------------------------------------|-------------------------------------------|
| **Natureza**              | Notacao grafica para processos       | Linguagem semantica para contratos        |
| **Autoria**               | Humano desenha diagramas             | IA gera a partir de intencao natural      |
| **Granularidade**         | Atividades e gateways               | Entidades, acoes, constraints, evidencias |
| **Verificabilidade**      | Limitada (syntactic checks)          | Formal (predicados verificaveis)          |
| **Evidencia**             | Nao nativa (requer engine externo)   | Primeira classe no contrato               |
| **Composicao**            | Sub-processos (limitada)             | Heranca semantica + composicao formal     |
| **Serializacao**          | XML verbose                          | Binario compacto + JSON                   |
| **Ambiguidade**           | Alta (semantica informal)            | Nula (semantica formal)                   |
| **Versionamento**         | Diff textual de XML                  | Diff semantico com analise de breaking    |

**O que BPMN faz melhor:** visualizacao intuitiva de processos para stakeholders nao tecnicos. SIML nao substitui essa necessidade — a camada de observabilidade deve gerar visualizacoes equivalentes.

**O que SIML oferece de novo:** evidencia nativa, composicao formal, verificabilidade pre-execucao, e eliminacao do humano como tradutor.

### 8.2 SIML vs Terraform/Pulumi (Infrastructure as Code)

| Aspecto                    | Terraform/Pulumi                     | SIML                                      |
|---------------------------|--------------------------------------|-------------------------------------------|
| **Dominio**               | Infraestrutura                       | Qualquer processo ou automacao            |
| **Paradigma**             | Declarativo (estado desejado)        | Declarativo (intencao + constraints)      |
| **Plano de execucao**     | `terraform plan` (diff de estado)    | Plano semantico (grafo de acoes)          |
| **Rollback**              | Limitado (`terraform destroy`)       | Saga nativa com compensacao granular      |
| **State management**      | State file centralizado              | Evidencia distribuida com cadeia de hash  |
| **Composicao**            | Modulos com interface de variaveis   | Contratos com heranca e composicao formal |
| **Seguranca**             | State file com secrets em plaintext  | Credentials por referencia, nunca inline  |

**O que Terraform faz melhor:** modelo de reconciliacao de estado (current vs desired) altamente maduro para infraestrutura. O conceito de `plan` antes de `apply` e elegante.

**O que SIML oferece de novo:** extensao do paradigma declarativo para alem de infraestrutura. Evidencia como cidada de primeira classe. Contratos que se auto-documentam e se auto-auditam.

**Sinergia potencial:** SIML poderia gerar Terraform/Pulumi como implementacao da camada de execucao para contratos de infraestrutura.

### 8.3 SIML vs Smart Contracts (Ethereum/Solana)

| Aspecto                    | Smart Contracts                      | SIML                                      |
|---------------------------|--------------------------------------|-------------------------------------------|
| **Imutabilidade**         | Codigo imutavel on-chain             | Contratos versionaveis com migracao       |
| **Execucao**              | Deterministica (EVM/SVM)             | Deterministica (validador) + IA (executor)|
| **Verificacao**           | Consensus distribuido                | Validador deterministico centralizado     |
| **Custos**                | Gas fees por operacao                | Custo computacional do executor (IA)      |
| **Flexibilidade**         | Limitada pelo gas e opcodes          | Ilimitada (IA pode executar qualquer acao)|
| **Auditoria**             | Blockchain publica                   | Cadeia de evidencia com hash              |
| **Correcao de erros**     | Muito dificil (proxy patterns)       | Versionamento nativo com migracao         |
| **Linguagem**             | Solidity, Rust (baixo nivel)         | Intencao natural -> SIML (alto nivel)     |

**O que Smart Contracts fazem melhor:** garantia de execucao trustless (nenhuma parte precisa confiar na outra). Imutabilidade como feature. Descentralizacao real.

**O que SIML oferece de novo:** flexibilidade de execucao (nao limitado a opcodes pre-definidos), versionamento com migracao, evidencia legivel por humanos, e acessibilidade (qualquer pessoa pode declarar intencao, nao precisa saber Solidity).

**Diferenca fundamental:** Smart Contracts resolvem o problema de confianca entre partes desconhecidas. SIML resolve o problema de traducao entre intencao humana e execucao de maquina. Sao complementares — um contrato SIML poderia ter como camada de execucao um smart contract.

### 8.4 O que SIML Oferece de Novo (Sintese)

Nenhuma das alternativas oferece simultaneamente:

1. **Geracao a partir de intencao natural** — o humano nao escreve a linguagem
2. **Tres camadas explicitas** (intencao/execucao/evidencia) — separacao entre o que, como e prova
3. **Evidencia como tipo primitivo** — auditoria nao e add-on, e estrutural
4. **Diff semantico** — versionamento que entende significado, nao texto
5. **Composicao formal com deteccao de conflitos** — antes da execucao
6. **Execucao por IA** — nao limitada a opcodes ou funcoes pre-definidas
7. **Validacao deterministica** — apesar da execucao ser por IA

A proposta central de SIML e que a **camada entre intencao e execucao deve ser uma linguagem formal** — nao prosa, nao codigo, nao diagrama. Uma linguagem que nenhum humano escreve, mas que garante formalmente que o que foi pedido e o que aconteceu.

---

## Apendice: Gramatica Formal (Fragmento)

```
contract     ::= 'CONTRACT' IDENT '{' version intent execution evidence '}'
version      ::= 'VERSION:' SEMVER
intent       ::= 'INTENT' '{' intent_fields '}'
execution    ::= 'EXECUTION' '{' exec_fields '}'
evidence     ::= 'EVIDENCE' '{' evidence_fields '}'

intent_fields ::= id_decl intent_text goal context constraints? schedule?
goal          ::= 'GOAL' '{' predicate acceptance_criteria negative_criteria? '}'
constraints   ::= 'CONSTRAINTS' '[' constraint (',' constraint)* ']'
constraint    ::= invariant | limit | rule

execution_fields ::= executor_decl plan decisions? fallbacks?
plan          ::= 'PLAN' '{' flow '}'
flow          ::= sequence | parallel | conditional | loop | saga
sequence      ::= 'SEQUENCE' '{' step+ '}'
parallel      ::= 'PARALLEL' join_policy '{' branch+ '}'
conditional   ::= 'CONDITIONAL' '{' if_clause else_clause? '}'
saga          ::= 'SAGA' compensation_policy '{' saga_step+ on_failure? '}'

evidence_fields ::= outcome goal_eval trace side_effects integrity_hash chain? summary

predicate    ::= expr
expr         ::= expr binop expr | unop expr | atom | quantifier
binop        ::= 'AND' | 'OR' | '=' | '!=' | '>' | '>=' | '<' | '<='
                | '+' | '-' | '*' | '/'
unop         ::= 'NOT'
quantifier   ::= 'forall' IDENT 'in' expr ':' expr
               | 'exists' IDENT 'in' expr ':' expr
atom         ::= NUMBER | STRING | BOOL | field_access | func_call
field_access ::= IDENT ('.' IDENT)*
func_call    ::= IDENT '(' args? ')'
```

---

*Documento gerado como parte da especificacao tecnica do projeto SIML.*
*Versao do documento: 0.1.0*
*Data: 2026-03-12*
