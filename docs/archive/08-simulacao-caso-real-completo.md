# 08 - Simulacao de Caso Real Completo: SaaS de Gestao de Assinaturas

> Demo end-to-end de um sistema real construido inteiramente sobre o SIML Runtime Engine. Da primeira conversa no chat ate metricas de negocio em producao.

---

## 1. O Caso

Uma startup de 3 fundadores precisa de um backend para gerenciar assinaturas de clientes. O produto deles e um SaaS de analytics para e-commerce. Eles tem o frontend pronto (Next.js), um designer, e zero backend engineers.

A abordagem tradicional: contratar um backend developer, montar NestJS + Prisma + Stripe SDK + SendGrid + Redis + cron jobs. Estimativa: 6-8 semanas para o MVP, R$ 25-40k em salario/freelancer.

A abordagem SIML: subir o SIML Runtime Engine e conversar.

---

## 2. Setup Inicial

### 2.1 Deploy do Engine

```bash
# Clone do repositorio
git clone https://github.com/siml-lang/runtime-engine.git
cd runtime-engine

# Um unico comando
docker-compose up -d
```

O `docker-compose.yml` sobe:

```yaml
services:
  engine:
    image: siml/runtime-engine:latest
    ports:
      - "3000:3000"   # Dashboard + API
      - "8080:8080"   # Endpoints gerados
    environment:
      - SIML_LLM_PROVIDER=anthropic
      - SIML_LLM_MODEL=claude-opus-4-20250514
      - SIML_DB_ENGINE=postgres
      - SIML_SECRET_KEY=${SIML_SECRET_KEY}
    volumes:
      - ./contracts:/app/contracts
      - ./data:/app/data

  postgres:
    image: postgres:16
    environment:
      - POSTGRES_DB=siml_runtime
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  pgdata:
```

Tres containers. Nenhum codigo backend escrito. O engine esta rodando.

### 2.2 Acesso ao Dashboard

O fundador abre `http://localhost:3000`. O dashboard mostra:

```
┌────────────────────────────────────────────────────────────────┐
│  SIML Runtime Engine v0.4.0                                    │
│                                                                │
│  Status: ● Online                                              │
│  Contratos ativos: 0                                           │
│  Endpoints gerados: 0                                          │
│  Execucoes hoje: 0                                             │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  💬 Chat                                                 │  │
│  │                                                          │  │
│  │  Descreva o que seu sistema precisa fazer.               │  │
│  │  Eu vou gerar os contratos, endpoints e schemas.         │  │
│  │                                                          │  │
│  │  > _                                                     │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### 2.3 A Primeira Conversa

O fundador digita:

> "Preciso de um sistema de gestao de assinaturas com planos, clientes, cobranca recorrente via Stripe, e notificacoes por email."

O engine responde:

```
Entendi. Vou gerar os seguintes contratos para seu sistema:

1. Gestao de Planos (CRUD) — POST/GET/PUT/DELETE /api/plans
2. Cadastro de Clientes — POST /api/customers + GET /api/customers/:id
3. Criacao de Assinatura — POST /api/subscriptions (integra com Stripe)
4. Webhook de Pagamento — POST /webhook/stripe
5. Cobranca Recorrente — Cron diario (trial expirando, cobranca)
6. Notificacoes — Trigger interno (email transacional)
7. API de Metricas — GET /api/metrics (MRR, churn)

Preciso de algumas definicoes antes de gerar:
- Quais planos iniciais? (nomes, precos, features)
- Periodo de trial? (7 dias, 14 dias, sem trial)
- Provedor de email? (SendGrid, Resend, AWS SES)
- Moeda? (BRL, USD)

> _
```

O fundador responde:

> "3 planos: Starter R$97/mes (1 loja), Growth R$197/mes (5 lojas), Enterprise R$497/mes (ilimitado). Trial de 14 dias. Email via Resend. Moeda BRL."

O engine gera 7 contratos. Vamos examinar cada um.

---

## 3. Contratos Gerados

### Contrato 1: Gestao de Planos

```siml
@contrato "subscription.plans.management"
@versao "1.0.0"
@dominio comercial.assinaturas
@gerado_por tradutor:claude-opus@4
@origem intencao:fundador:2026-03-13

intencao {
  objetivo: "gerenciar catalogo de planos de assinatura"
  contexto: "SaaS de analytics para e-commerce"
  principio: "planos sao imutaveis para assinantes ativos — mudancas criam nova versao"
}

entidade plano {
  id            -> tipo: uuid_v7, gerado: automatico
  nome          -> tipo: texto, min: 3, max: 50, unico: true
  slug          -> tipo: slug, derivado_de: nome, unico: true
  preco_mensal  -> tipo: monetario_brl, min: 0
  moeda         -> tipo: enum("BRL"), padrao: "BRL"
  features      -> tipo: lista<texto>, min: 1
  limite_lojas  -> tipo: inteiro_positivo | nulo
                   semantica: "nulo significa ilimitado"
  trial_dias    -> tipo: inteiro_positivo, padrao: 14
  stripe_price_id -> tipo: texto, preenchido_por: integracao("stripe")
  ativo         -> tipo: booleano, padrao: true
  criado_em     -> tipo: datetime_utc, gerado: automatico
  atualizado_em -> tipo: datetime_utc, gerado: automatico
}

endpoint POST /api/plans {
  autenticacao: bearer_token(role: "admin")
  entrada: {
    nome: obrigatorio
    preco_mensal: obrigatorio
    features: obrigatorio
    limite_lojas: opcional
    trial_dias: opcional
  }
  execucao: {
    1. validar unicidade de nome
    2. criar plano no banco
    3. criar produto e preco no Stripe via API
    4. salvar stripe_price_id no plano
    5. retornar plano criado
  }
  saida: plano completo, status 201
  erro: {
    nome_duplicado -> 409 "Plano com este nome ja existe"
    stripe_falha   -> 502 "Erro ao criar plano no Stripe"
  }
}

endpoint GET /api/plans {
  autenticacao: nenhuma
  entrada: {
    ativo: opcional, padrao: true
  }
  execucao: {
    1. buscar planos filtrados por status
    2. ordenar por preco_mensal ascendente
    3. retornar lista
  }
  saida: lista<plano>, status 200
}

endpoint GET /api/plans/:id {
  autenticacao: nenhuma
  execucao: {
    1. buscar plano por id ou slug
    2. retornar plano ou 404
  }
  saida: plano, status 200
  erro: {
    nao_encontrado -> 404 "Plano nao encontrado"
  }
}

endpoint PUT /api/plans/:id {
  autenticacao: bearer_token(role: "admin")
  entrada: {
    nome: opcional
    preco_mensal: opcional
    features: opcional
    limite_lojas: opcional
    ativo: opcional
  }
  execucao: {
    1. buscar plano por id
    2. SE preco_mensal mudou E existem assinantes ativos:
       - criar novo stripe_price_id
       - manter preco antigo para assinantes existentes
       - novo preco so para novas assinaturas
    3. atualizar campos no banco
    4. retornar plano atualizado
  }
  saida: plano atualizado, status 200
  erro: {
    nao_encontrado -> 404
    tem_assinantes -> 409 "Nao e possivel desativar plano com assinantes ativos"
  }
}

endpoint DELETE /api/plans/:id {
  autenticacao: bearer_token(role: "admin")
  execucao: {
    1. buscar plano por id
    2. SE existem assinantes ativos: rejeitar
    3. soft delete (ativo = false)
    4. desativar preco no Stripe
  }
  saida: status 204
  erro: {
    tem_assinantes -> 409 "Nao e possivel excluir plano com assinantes ativos"
  }
}

validacao {
  pos_criacao: plano.stripe_price_id PREENCHIDO
  invariante: plano com assinantes ativos NAO PODE ser excluido
  invariante: preco_mensal >= 0
  auditoria: CADA operacao GERA evidencia {
    acao, plano_id, usuario, timestamp, campos_alterados
  }
}

dados_iniciais {
  plano {
    nome: "Starter"
    preco_mensal: 9700  // centavos
    features: ["1 loja", "Dashboard basico", "Relatorios semanais"]
    limite_lojas: 1
    trial_dias: 14
  }
  plano {
    nome: "Growth"
    preco_mensal: 19700
    features: ["5 lojas", "Dashboard avancado", "Relatorios diarios", "Alertas"]
    limite_lojas: 5
    trial_dias: 14
  }
  plano {
    nome: "Enterprise"
    preco_mensal: 49700
    features: ["Lojas ilimitadas", "Dashboard customizado", "Relatorios real-time",
               "Alertas", "API dedicada", "Suporte prioritario"]
    limite_lojas: nulo
    trial_dias: 14
  }
}
```

### Contrato 2: Cadastro de Clientes

```siml
@contrato "subscription.customers.registration"
@versao "1.0.0"
@dominio comercial.assinaturas
@depende_de "subscription.plans.management"

intencao {
  objetivo: "registrar e gerenciar clientes do SaaS"
  principio: "um email = um cliente, sem duplicidade"
  principio: "dados minimos para comecar, enriquecer depois"
}

entidade cliente {
  id            -> tipo: uuid_v7, gerado: automatico
  email         -> tipo: email, unico: true, indice: true
  nome          -> tipo: texto, min: 2, max: 100
  empresa       -> tipo: texto, max: 100, opcional: true
  documento     -> tipo: cnpj | cpf, opcional: true
  telefone      -> tipo: telefone_br, opcional: true
  stripe_customer_id -> tipo: texto, preenchido_por: integracao("stripe")
  status        -> tipo: enum("ativo", "inativo", "bloqueado"), padrao: "ativo"
  metadata      -> tipo: json, opcional: true
  criado_em     -> tipo: datetime_utc, gerado: automatico
  atualizado_em -> tipo: datetime_utc, gerado: automatico
}

endpoint POST /api/customers {
  autenticacao: api_key | bearer_token
  entrada: {
    email: obrigatorio
    nome: obrigatorio
    empresa: opcional
    documento: opcional
    telefone: opcional
    metadata: opcional
  }
  execucao: {
    1. normalizar email (lowercase, trim)
    2. validar formato de email
    3. verificar duplicidade por email
       SE duplicado: retornar erro 409
    4. SE documento fornecido: validar CPF/CNPJ
    5. criar customer no Stripe com email e nome
    6. salvar cliente no banco com stripe_customer_id
    7. disparar evento interno "cliente.criado"
    8. retornar cliente criado
  }
  saida: cliente completo, status 201
  erro: {
    email_duplicado  -> 409 { codigo: "EMAIL_EXISTS", mensagem: "Email ja cadastrado" }
    email_invalido   -> 422 { codigo: "INVALID_EMAIL", mensagem: "Formato de email invalido" }
    doc_invalido     -> 422 { codigo: "INVALID_DOCUMENT", mensagem: "CPF/CNPJ invalido" }
    stripe_falha     -> 502 { codigo: "STRIPE_ERROR", mensagem: "Erro ao criar cliente no Stripe" }
  }
}

endpoint GET /api/customers/:id {
  autenticacao: bearer_token
  execucao: {
    1. buscar cliente por id
    2. incluir assinatura ativa (se existir)
    3. retornar cliente
  }
  saida: cliente + assinatura_ativa, status 200
}

endpoint GET /api/customers {
  autenticacao: bearer_token(role: "admin")
  entrada: {
    status: opcional
    busca: opcional  // busca por nome ou email
    pagina: opcional, padrao: 1
    limite: opcional, padrao: 20, max: 100
  }
  execucao: {
    1. buscar clientes com filtros
    2. paginacao cursor-based
    3. retornar lista com total
  }
  saida: { dados: lista<cliente>, total: inteiro, pagina: inteiro }, status 200
}

endpoint PUT /api/customers/:id {
  autenticacao: bearer_token
  entrada: {
    nome: opcional
    empresa: opcional
    documento: opcional
    telefone: opcional
    metadata: opcional
  }
  execucao: {
    1. buscar cliente
    2. atualizar campos fornecidos
    3. SE nome mudou: atualizar no Stripe tambem
    4. disparar evento "cliente.atualizado"
    5. retornar cliente atualizado
  }
  saida: cliente atualizado, status 200
}

validacao {
  pre_criacao: email UNICO no banco
  pre_criacao: email FORMATO valido (RFC 5322)
  pre_criacao: SE documento FORNECIDO ENTAO documento VALIDO
  pos_criacao: stripe_customer_id PREENCHIDO
  invariante: email NAO PODE ser alterado apos criacao
  auditoria: CADA operacao GERA evidencia {
    acao, cliente_id, timestamp, ip_origem, campos_alterados
  }
}
```

### Contrato 3: Criacao de Assinatura

```siml
@contrato "subscription.subscriptions.creation"
@versao "1.0.0"
@dominio comercial.assinaturas
@depende_de ["subscription.customers.registration",
             "subscription.plans.management"]

intencao {
  objetivo: "permitir que cliente assine um plano com trial de 14 dias"
  fluxo: "cliente escolhe plano -> cria subscription no Stripe -> inicia trial"
  principio: "um cliente tem no maximo uma assinatura ativa por vez"
  principio: "trial e gratuito — cobranca so no dia 15"
}

entidade assinatura {
  id                  -> tipo: uuid_v7, gerado: automatico
  cliente_id          -> tipo: referencia(cliente), indice: true
  plano_id            -> tipo: referencia(plano), indice: true
  stripe_subscription_id -> tipo: texto, preenchido_por: integracao("stripe")
  status              -> tipo: enum("trial", "ativa", "past_due", "cancelada", "expirada")
                         padrao: "trial"
  trial_inicio        -> tipo: datetime_utc
  trial_fim           -> tipo: datetime_utc
  periodo_atual_inicio -> tipo: datetime_utc, opcional: true
  periodo_atual_fim    -> tipo: datetime_utc, opcional: true
  cancelada_em        -> tipo: datetime_utc, opcional: true
  motivo_cancelamento -> tipo: texto, opcional: true
  criado_em           -> tipo: datetime_utc, gerado: automatico
  atualizado_em       -> tipo: datetime_utc, gerado: automatico
}

endpoint POST /api/subscriptions {
  autenticacao: api_key | bearer_token
  entrada: {
    cliente_id: obrigatorio
    plano_id: obrigatorio
    metodo_pagamento_id: opcional
      semantica: "Stripe payment method. Se nao fornecido, coletado no checkout."
  }
  execucao: {
    1. buscar cliente (validar existencia e status ativo)
    2. buscar plano (validar existencia e status ativo)
    3. verificar se cliente ja tem assinatura ativa ou em trial
       SE sim: retornar erro 409
    4. criar subscription no Stripe:
       - customer: cliente.stripe_customer_id
       - price: plano.stripe_price_id
       - trial_period_days: plano.trial_dias
       - payment_behavior: "default_incomplete"
       SE metodo_pagamento_id fornecido:
         - default_payment_method: metodo_pagamento_id
    5. salvar assinatura no banco:
       - status: "trial"
       - trial_inicio: agora()
       - trial_fim: agora() + plano.trial_dias dias
       - stripe_subscription_id: resposta_stripe.id
    6. disparar evento "assinatura.criada" {
         cliente_id, plano_id, trial_fim
       }
    7. retornar assinatura criada
  }
  saida: {
    assinatura: assinatura completa
    checkout_url: texto | nulo
      semantica: "URL do Stripe Checkout se pagamento pendente"
  }, status 201
  erro: {
    cliente_nao_encontrado -> 404 "Cliente nao encontrado"
    plano_nao_encontrado   -> 404 "Plano nao encontrado"
    ja_assinante           -> 409 "Cliente ja possui assinatura ativa"
    cliente_inativo        -> 422 "Cliente esta inativo ou bloqueado"
    stripe_falha           -> 502 "Erro ao criar assinatura no Stripe"
  }
}

endpoint GET /api/subscriptions/:id {
  autenticacao: bearer_token
  execucao: {
    1. buscar assinatura por id
    2. incluir dados do plano e cliente
    3. retornar assinatura enriquecida
  }
  saida: assinatura + plano + cliente, status 200
}

endpoint GET /api/customers/:id/subscription {
  autenticacao: bearer_token
  execucao: {
    1. buscar assinatura ativa do cliente
    2. incluir dados do plano
    3. retornar assinatura ou 404
  }
  saida: assinatura + plano, status 200
}

endpoint POST /api/subscriptions/:id/cancel {
  autenticacao: bearer_token
  entrada: {
    motivo: opcional
    cancelar_imediatamente: opcional, padrao: false
      semantica: "false = cancela no fim do periodo. true = cancela agora."
  }
  execucao: {
    1. buscar assinatura
    2. validar que status permite cancelamento (trial, ativa, past_due)
    3. cancelar no Stripe:
       SE cancelar_imediatamente:
         - stripe.subscriptions.del(id)
       SENAO:
         - stripe.subscriptions.update(id, cancel_at_period_end: true)
    4. atualizar status:
       SE cancelar_imediatamente: status = "cancelada"
       SENAO: manter status atual, marcar cancel_at_period_end
    5. salvar motivo_cancelamento e cancelada_em
    6. disparar evento "assinatura.cancelada" {
         cliente_id, plano_id, motivo, imediato
       }
  }
  saida: assinatura atualizada, status 200
}

validacao {
  pre_criacao: cliente.status == "ativo"
  pre_criacao: NAO EXISTE assinatura ativa para este cliente
  pre_criacao: plano.ativo == true
  pos_criacao: stripe_subscription_id PREENCHIDO
  pos_criacao: trial_fim > trial_inicio
  invariante: um cliente TEM no maximo UMA assinatura com status IN ("trial", "ativa", "past_due")
  auditoria: CADA mudanca_status GERA evidencia {
    assinatura_id, status_anterior, status_novo, timestamp, origem
  }
}
```

### Contrato 4: Webhook de Pagamento

```siml
@contrato "subscription.webhooks.stripe"
@versao "1.0.0"
@dominio comercial.pagamentos
@depende_de ["subscription.subscriptions.creation",
             "subscription.notifications"]

intencao {
  objetivo: "processar eventos do Stripe para manter status das assinaturas sincronizado"
  principio: "Stripe e a fonte de verdade para status de pagamento"
  principio: "todo webhook e idempotente — processar duas vezes nao causa efeito duplicado"
  principio: "webhook invalido e rejeitado silenciosamente (sem expor detalhes)"
}

endpoint POST /webhook/stripe {
  autenticacao: stripe_signature(webhook_secret)
    semantica: "verificar header Stripe-Signature usando webhook signing secret"

  eventos_processados: [
    "invoice.payment_succeeded",
    "invoice.payment_failed",
    "customer.subscription.deleted",
    "customer.subscription.updated",
    "customer.subscription.trial_will_end"
  ]

  execucao {

    pre_processamento: {
      1. ler body raw (nao parsear JSON antes de verificar)
      2. verificar Stripe-Signature com webhook_secret
         SE invalido: retornar 400 sem detalhes
      3. parsear evento
      4. verificar idempotencia:
         SE evento.id ja processado: retornar 200 (noop)
      5. registrar evento.id como processado (TTL: 72h)
    }

    quando evento == "invoice.payment_succeeded" {
      1. extrair subscription_id do evento
      2. buscar assinatura local por stripe_subscription_id
         SE nao encontrada: logar warning, retornar 200
      3. atualizar assinatura:
         - status: "ativa"
         - periodo_atual_inicio: invoice.period_start
         - periodo_atual_fim: invoice.period_end
      4. disparar evento "assinatura.pagamento_ok" {
           cliente_id, plano_id, valor, periodo
         }
    }

    quando evento == "invoice.payment_failed" {
      1. extrair subscription_id do evento
      2. buscar assinatura local
      3. atualizar assinatura:
         - status: "past_due"
      4. disparar evento "assinatura.pagamento_falhou" {
           cliente_id, plano_id, valor, tentativa_numero, proxima_tentativa
         }
    }

    quando evento == "customer.subscription.deleted" {
      1. extrair subscription_id do evento
      2. buscar assinatura local
      3. atualizar assinatura:
         - status: "cancelada"
         - cancelada_em: agora()
      4. disparar evento "assinatura.cancelada_definitivamente" {
           cliente_id, plano_id
         }
    }

    quando evento == "customer.subscription.updated" {
      1. extrair subscription_id e campos alterados
      2. buscar assinatura local
      3. sincronizar campos relevantes:
         - status (mapeando status Stripe -> status local)
         - cancel_at_period_end
         - current_period_start/end
      4. SE status mudou: disparar evento correspondente
    }

    quando evento == "customer.subscription.trial_will_end" {
      1. extrair subscription_id
      2. buscar assinatura local
      3. disparar evento "assinatura.trial_expirando" {
           cliente_id, plano_id, trial_fim
         }
      semantica: "Stripe envia 3 dias antes do fim do trial"
    }
  }

  saida: status 200 (sempre, exceto assinatura invalida -> 400)
    semantica: "retornar 200 rapido para evitar retry do Stripe"

  validacao {
    pre_processamento: Stripe-Signature VALIDA
    idempotencia: evento.id processado NO MAXIMO uma vez
    resiliencia: SE erro interno ENTAO logar + retornar 200
      semantica: "preferir perder um evento a causar retries infinitos"
    auditoria: CADA evento processado GERA evidencia {
      evento_tipo, evento_id, subscription_id, acao_tomada, timestamp
    }
  }
}

mapeamento_status {
  stripe "trialing"   -> local "trial"
  stripe "active"     -> local "ativa"
  stripe "past_due"   -> local "past_due"
  stripe "canceled"   -> local "cancelada"
  stripe "unpaid"     -> local "past_due"
  stripe "incomplete" -> local "trial"
    nota: "incomplete geralmente e pre-primeiro-pagamento"
}
```

### Contrato 5: Cobranca Recorrente (Cron)

```siml
@contrato "subscription.billing.recurring"
@versao "1.0.0"
@dominio comercial.cobranca
@depende_de ["subscription.subscriptions.creation",
             "subscription.notifications"]

intencao {
  objetivo: "automatizar avisos de trial expirando e garantir transicao suave para cobranca"
  principio: "o Stripe gerencia a cobranca real — este cron gerencia notificacoes e monitoramento"
  principio: "erros no cron nunca impedem cobranca — Stripe opera independente"
}

cron aviso_trial_expirando {
  agendamento: "0 9 * * *"  // todo dia as 9h UTC
  semantica: "verificar assinaturas cujo trial expira em 3 dias"

  execucao: {
    1. buscar assinaturas WHERE:
       - status == "trial"
       - trial_fim ENTRE agora() E agora() + 3 dias
       - aviso_trial_enviado == false
    2. PARA CADA assinatura encontrada:
       a. buscar cliente
       b. buscar plano
       c. disparar evento "notificacao.trial_expirando" {
            cliente_email: cliente.email
            cliente_nome: cliente.nome
            plano_nome: plano.nome
            plano_preco: plano.preco_mensal
            trial_fim: assinatura.trial_fim
            dias_restantes: diff(assinatura.trial_fim, agora(), dias)
          }
       d. marcar aviso_trial_enviado = true
    3. logar: total de avisos enviados
  }

  tratamento_erro: {
    SE erro ao enviar notificacao para UM cliente:
      - logar erro
      - continuar para o proximo
      - NAO marcar como enviado (tentara novamente amanha)
  }
}

cron verificar_trials_expirados {
  agendamento: "0 0 * * *"  // todo dia a meia-noite UTC
  semantica: "verificar se trials expiraram sem conversao"

  execucao: {
    1. buscar assinaturas WHERE:
       - status == "trial"
       - trial_fim < agora()
    2. PARA CADA assinatura encontrada:
       a. consultar status no Stripe (stripe_subscription_id)
       b. SE Stripe status == "active":
          - atualizar local: status = "ativa"
          - disparar "assinatura.convertida_de_trial"
       c. SE Stripe status == "past_due":
          - atualizar local: status = "past_due"
          - disparar "assinatura.pagamento_falhou"
       d. SE Stripe status == "canceled" | "unpaid":
          - atualizar local: status = "expirada"
          - disparar "assinatura.trial_expirado_sem_conversao"
    3. logar: conversoes, falhas, expiracoes
  }
}

cron monitorar_pagamentos_pendentes {
  agendamento: "0 10 * * *"  // todo dia as 10h UTC
  semantica: "verificar assinaturas com pagamento atrasado ha mais de 7 dias"

  execucao: {
    1. buscar assinaturas WHERE:
       - status == "past_due"
       - atualizado_em < agora() - 7 dias
    2. PARA CADA assinatura:
       a. consultar status atualizado no Stripe
       b. SE ainda past_due:
          - disparar "notificacao.pagamento_pendente_urgente" {
              cliente_email, dias_pendente, valor
            }
       c. SE resolvido: atualizar status local
    3. logar: total de pendencias ativas
  }
}

validacao {
  cada_execucao_cron: GERA evidencia {
    cron_nome, inicio, fim, registros_processados,
    sucessos, falhas, detalhes_falhas
  }
  resiliencia: falha em UM registro NAO interrompe processamento dos demais
  observabilidade: metricas expostas {
    trials_expirando_3d: gauge
    trials_expirados_sem_conversao: counter
    pagamentos_pendentes_7d: gauge
  }
}
```

### Contrato 6: Notificacoes

```siml
@contrato "subscription.notifications"
@versao "1.0.0"
@dominio comunicacao.email
@provedor resend
@depende_de ["subscription.customers.registration"]

intencao {
  objetivo: "enviar emails transacionais em resposta a eventos do ciclo de vida da assinatura"
  principio: "todo email e rastreavel e idempotente"
  principio: "falha de email nunca bloqueia operacao de negocio"
  principio: "cliente pode ver historico de comunicacoes"
}

configuracao {
  provedor: "resend"
  api_key: env("RESEND_API_KEY")
  remetente: "noreply@seuapp.com.br"
  remetente_nome: "SeuApp Analytics"
  dominio: env("EMAIL_DOMAIN")
}

evento "cliente.criado" {
  template: "boas-vindas"
  destinatario: evento.cliente_email
  dados: {
    nome: evento.cliente_nome
    empresa: evento.empresa | "sua empresa"
  }
  conteudo: {
    assunto: "Bem-vindo ao SeuApp, {{nome}}!"
    corpo: """
      Ola {{nome}},

      Sua conta no SeuApp foi criada com sucesso.

      Proximo passo: escolha um plano e comece seu trial gratuito de 14 dias.

      {{link_planos}}

      Qualquer duvida, responda este email.

      Equipe SeuApp
    """
  }
}

evento "assinatura.criada" {
  template: "trial-iniciado"
  destinatario: buscar(cliente, evento.cliente_id).email
  dados: {
    nome: buscar(cliente, evento.cliente_id).nome
    plano: buscar(plano, evento.plano_id).nome
    trial_fim: formatar(evento.trial_fim, "DD/MM/YYYY")
    preco: formatar_moeda(buscar(plano, evento.plano_id).preco_mensal, "BRL")
  }
  conteudo: {
    assunto: "Seu trial do plano {{plano}} comecou!"
    corpo: """
      Ola {{nome}},

      Voce iniciou o trial gratuito do plano {{plano}}.

      - Trial ate: {{trial_fim}}
      - Valor apos trial: {{preco}}/mes
      - Voce nao sera cobrado durante o trial

      Aproveite para explorar todas as features do plano.

      Equipe SeuApp
    """
  }
}

evento "notificacao.trial_expirando" {
  template: "trial-expirando"
  destinatario: evento.cliente_email
  dados: {
    nome: evento.cliente_nome
    plano: evento.plano_nome
    preco: formatar_moeda(evento.plano_preco, "BRL")
    trial_fim: formatar(evento.trial_fim, "DD/MM/YYYY")
    dias_restantes: evento.dias_restantes
  }
  conteudo: {
    assunto: "Seu trial expira em {{dias_restantes}} dias"
    corpo: """
      Ola {{nome}},

      Seu trial do plano {{plano}} expira em {{dias_restantes}} dias ({{trial_fim}}).

      Apos o trial, voce sera cobrado {{preco}}/mes.

      Para continuar usando sem interrupcao, confirme seu metodo de pagamento:
      {{link_pagamento}}

      Se nao quiser continuar, nao precisa fazer nada — o trial sera encerrado automaticamente.

      Equipe SeuApp
    """
  }
}

evento "assinatura.pagamento_ok" {
  template: "pagamento-confirmado"
  destinatario: buscar(cliente, evento.cliente_id).email
  dados: {
    nome: buscar(cliente, evento.cliente_id).nome
    plano: buscar(plano, evento.plano_id).nome
    valor: formatar_moeda(evento.valor, "BRL")
    periodo_inicio: formatar(evento.periodo.inicio, "DD/MM/YYYY")
    periodo_fim: formatar(evento.periodo.fim, "DD/MM/YYYY")
  }
  conteudo: {
    assunto: "Pagamento confirmado — {{plano}}"
    corpo: """
      Ola {{nome}},

      Seu pagamento de {{valor}} referente ao plano {{plano}} foi confirmado.

      Periodo: {{periodo_inicio}} a {{periodo_fim}}

      Obrigado por usar o SeuApp!

      Equipe SeuApp
    """
  }
}

evento "assinatura.pagamento_falhou" {
  template: "pagamento-falhou"
  destinatario: buscar(cliente, evento.cliente_id).email
  prioridade: alta
  dados: {
    nome: buscar(cliente, evento.cliente_id).nome
    plano: buscar(plano, evento.plano_id).nome
    valor: formatar_moeda(evento.valor, "BRL")
    proxima_tentativa: formatar(evento.proxima_tentativa, "DD/MM/YYYY")
  }
  conteudo: {
    assunto: "⚠ Falha no pagamento do plano {{plano}}"
    corpo: """
      Ola {{nome}},

      Nao conseguimos processar seu pagamento de {{valor}} referente ao plano {{plano}}.

      Proxima tentativa automatica: {{proxima_tentativa}}

      Para evitar interrupcao do servico, atualize seu metodo de pagamento:
      {{link_pagamento}}

      Se precisar de ajuda, responda este email.

      Equipe SeuApp
    """
  }
}

evento "assinatura.cancelada_definitivamente" {
  template: "cancelamento"
  destinatario: buscar(cliente, evento.cliente_id).email
  dados: {
    nome: buscar(cliente, evento.cliente_id).nome
    plano: buscar(plano, evento.plano_id).nome
  }
  conteudo: {
    assunto: "Sua assinatura do {{plano}} foi cancelada"
    corpo: """
      Ola {{nome}},

      Sua assinatura do plano {{plano}} foi cancelada.

      Seus dados serao mantidos por 90 dias. Se quiser voltar, e so escolher um novo plano:
      {{link_planos}}

      Sentiremos sua falta.

      Equipe SeuApp
    """
  }
}

validacao {
  cada_envio: GERA evidencia {
    template, destinatario, assunto, status_envio,
    resend_message_id, timestamp, evento_origem
  }
  resiliencia: falha de envio NAO bloqueia operacao de negocio
  retry: 3 tentativas com backoff exponencial (1s, 5s, 30s)
  rate_limit: max 100 emails/minuto (limite Resend free tier)
}
```

### Contrato 7: API de Metricas

```siml
@contrato "subscription.metrics"
@versao "1.0.0"
@dominio analytics.negocio
@depende_de ["subscription.subscriptions.creation",
             "subscription.customers.registration",
             "subscription.plans.management"]

intencao {
  objetivo: "calcular e expor metricas-chave de negocio SaaS"
  principio: "metricas sao calculadas diariamente e cacheadas"
  principio: "leitura e rapida (cache), calculo e preciso (query)"
}

metricas {

  mrr {
    semantica: "Monthly Recurring Revenue — receita recorrente mensal"
    calculo: SOMA(
      PARA CADA assinatura WHERE status IN ("ativa", "past_due"):
        buscar(plano, assinatura.plano_id).preco_mensal
    )
    formato: monetario_brl
    granularidade: diaria
    historico: 12 meses
  }

  arr {
    semantica: "Annual Recurring Revenue"
    calculo: mrr * 12
    formato: monetario_brl
  }

  clientes_ativos {
    semantica: "total de clientes com assinatura ativa ou em trial"
    calculo: COUNT(
      assinaturas WHERE status IN ("trial", "ativa", "past_due")
    )
    granularidade: diaria
  }

  churn_rate {
    semantica: "taxa de cancelamento mensal"
    calculo: {
      cancelamentos_mes = COUNT(
        assinaturas WHERE status == "cancelada"
        E cancelada_em >= inicio_do_mes
        E cancelada_em < fim_do_mes
      )
      base_inicio_mes = COUNT(
        assinaturas WHERE status IN ("ativa", "past_due")
        E criado_em < inicio_do_mes
      )
      taxa = cancelamentos_mes / base_inicio_mes
    }
    formato: percentual
    granularidade: mensal
    historico: 12 meses
  }

  trial_conversion_rate {
    semantica: "percentual de trials que convertem em assinatura paga"
    calculo: {
      convertidos = COUNT(
        assinaturas WHERE status == "ativa"
        E existiu_em_status("trial")
      )
      total_trials = COUNT(
        assinaturas WHERE existiu_em_status("trial")
        E trial_fim < agora()
      )
      taxa = convertidos / total_trials
    }
    formato: percentual
    granularidade: mensal
  }

  arpu {
    semantica: "Average Revenue Per User"
    calculo: mrr / clientes_ativos
    formato: monetario_brl
    granularidade: mensal
  }

  distribuicao_planos {
    semantica: "quantidade de assinantes por plano"
    calculo: GROUP_BY(
      assinaturas WHERE status IN ("trial", "ativa", "past_due"),
      plano_id
    ) -> COUNT por grupo, incluir plano.nome
    formato: lista { plano, quantidade, percentual }
  }
}

endpoint GET /api/metrics {
  autenticacao: bearer_token(role: "admin")
  entrada: {
    periodo: opcional, padrao: "mes_atual"
      enum: ["hoje", "semana", "mes_atual", "ultimos_30d", "ultimos_90d"]
  }
  execucao: {
    1. verificar cache (Redis, TTL: 1 hora)
    2. SE cache valido: retornar cache
    3. SE cache expirado: calcular metricas
    4. salvar em cache
    5. retornar resultado
  }
  saida: {
    mrr: monetario
    arr: monetario
    clientes_ativos: inteiro
    churn_rate: percentual
    trial_conversion_rate: percentual
    arpu: monetario
    distribuicao_planos: lista
    calculado_em: datetime
  }, status 200
}

endpoint GET /api/metrics/history {
  autenticacao: bearer_token(role: "admin")
  entrada: {
    metrica: obrigatorio, enum: ["mrr", "churn_rate", "clientes_ativos",
                                  "trial_conversion_rate", "arpu"]
    meses: opcional, padrao: 6, max: 12
  }
  execucao: {
    1. buscar snapshots diarios da metrica
    2. agregar por mes
    3. retornar serie temporal
  }
  saida: {
    metrica: texto
    dados: lista { mes, valor }
  }, status 200
}

cron calcular_metricas_diarias {
  agendamento: "0 2 * * *"  // todo dia as 2h UTC
  semantica: "calcular e persistir snapshot diario de todas as metricas"

  execucao: {
    1. calcular todas as metricas
    2. salvar snapshot no banco (tabela metricas_snapshot)
    3. atualizar cache Redis
    4. SE dia 1 do mes: calcular metricas mensais consolidadas
  }

  validacao: {
    pos_calculo: mrr >= 0
    pos_calculo: churn_rate ENTRE 0 E 1
    pos_calculo: clientes_ativos >= 0
    alerta: SE churn_rate > 0.10 ENTAO notificar("admin", "churn acima de 10%")
    alerta: SE mrr diminuiu > 20% vs mes anterior ENTAO notificar("admin", "queda de MRR")
  }
}
```

---

## 4. Dados Armazenados

### 4.1 Schema Gerado pelo Engine

O SIML Runtime Engine le os contratos e gera automaticamente o schema do banco de dados. As tabelas criadas:

```sql
-- Gerado automaticamente pelo SIML Runtime Engine
-- Baseado nos contratos: subscription.*

CREATE TABLE planos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome            VARCHAR(50) NOT NULL UNIQUE,
    slug            VARCHAR(60) NOT NULL UNIQUE,
    preco_mensal    INTEGER NOT NULL CHECK (preco_mensal >= 0),
    moeda           VARCHAR(3) NOT NULL DEFAULT 'BRL',
    features        JSONB NOT NULL DEFAULT '[]',
    limite_lojas    INTEGER,  -- NULL = ilimitado
    trial_dias      INTEGER NOT NULL DEFAULT 14,
    stripe_price_id VARCHAR(255),
    ativo           BOOLEAN NOT NULL DEFAULT true,
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE clientes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email               VARCHAR(255) NOT NULL UNIQUE,
    nome                VARCHAR(100) NOT NULL,
    empresa             VARCHAR(100),
    documento           VARCHAR(20),
    telefone            VARCHAR(20),
    stripe_customer_id  VARCHAR(255),
    status              VARCHAR(20) NOT NULL DEFAULT 'ativo'
                        CHECK (status IN ('ativo', 'inativo', 'bloqueado')),
    metadata            JSONB,
    criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE assinaturas (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id              UUID NOT NULL REFERENCES clientes(id),
    plano_id                UUID NOT NULL REFERENCES planos(id),
    stripe_subscription_id  VARCHAR(255),
    status                  VARCHAR(20) NOT NULL DEFAULT 'trial'
                            CHECK (status IN ('trial', 'ativa', 'past_due',
                                              'cancelada', 'expirada')),
    trial_inicio            TIMESTAMPTZ,
    trial_fim               TIMESTAMPTZ,
    periodo_atual_inicio    TIMESTAMPTZ,
    periodo_atual_fim       TIMESTAMPTZ,
    cancelada_em            TIMESTAMPTZ,
    motivo_cancelamento     TEXT,
    aviso_trial_enviado     BOOLEAN NOT NULL DEFAULT false,
    criado_em               TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE metricas_snapshot (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    data            DATE NOT NULL,
    mrr             INTEGER NOT NULL,
    clientes_ativos INTEGER NOT NULL,
    churn_rate      NUMERIC(5,4),
    trial_conversion_rate NUMERIC(5,4),
    arpu            INTEGER,
    distribuicao    JSONB,
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE eventos_processados (
    evento_id       VARCHAR(255) PRIMARY KEY,
    tipo            VARCHAR(100) NOT NULL,
    processado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- TTL gerenciado via pg_cron ou aplicacao
    expira_em       TIMESTAMPTZ NOT NULL
);

CREATE TABLE emails_enviados (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template        VARCHAR(50) NOT NULL,
    destinatario    VARCHAR(255) NOT NULL,
    assunto         VARCHAR(255) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'enviado',
    resend_id       VARCHAR(255),
    evento_origem   VARCHAR(255),
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE auditoria (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contrato        VARCHAR(100) NOT NULL,
    acao            VARCHAR(50) NOT NULL,
    entidade_tipo   VARCHAR(50) NOT NULL,
    entidade_id     UUID,
    dados_antes     JSONB,
    dados_depois    JSONB,
    usuario_id      VARCHAR(255),
    ip_origem       INET,
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indices
CREATE INDEX idx_clientes_email ON clientes(email);
CREATE INDEX idx_clientes_status ON clientes(status);
CREATE INDEX idx_assinaturas_cliente ON assinaturas(cliente_id);
CREATE INDEX idx_assinaturas_status ON assinaturas(status);
CREATE INDEX idx_assinaturas_trial_fim ON assinaturas(trial_fim)
    WHERE status = 'trial';
CREATE INDEX idx_metricas_data ON metricas_snapshot(data);
CREATE INDEX idx_eventos_expira ON eventos_processados(expira_em);
CREATE INDEX idx_auditoria_entidade ON auditoria(entidade_tipo, entidade_id);

-- Constraint: um cliente tem no maximo uma assinatura ativa
CREATE UNIQUE INDEX idx_unique_active_subscription
    ON assinaturas(cliente_id)
    WHERE status IN ('trial', 'ativa', 'past_due');
```

### 4.2 Relacoes entre Entidades

```
┌──────────┐       ┌──────────────┐       ┌──────────┐
│  planos  │       │ assinaturas  │       │ clientes │
│          │◄──────│              │──────►│          │
│ id       │  N:1  │ id           │  N:1  │ id       │
│ nome     │       │ cliente_id   │       │ email    │
│ preco    │       │ plano_id     │       │ nome     │
│ features │       │ status       │       │ empresa  │
│ stripe_* │       │ trial_*      │       │ stripe_* │
└──────────┘       │ stripe_*     │       └──────────┘
                   │ cancelada_em │              │
                   └──────────────┘              │
                          │                      │
                          │ 1:N                  │ 1:N
                          ▼                      ▼
                   ┌──────────────┐       ┌──────────────┐
                   │  auditoria   │       │emails_enviados│
                   │              │       │              │
                   │ contrato     │       │ template     │
                   │ acao         │       │ destinatario │
                   │ entidade_*   │       │ status       │
                   │ dados_*      │       │ resend_id    │
                   └──────────────┘       └──────────────┘
```

### 4.3 Equivalente Prisma (para comparacao)

O que um desenvolvedor escreveria manualmente em Prisma para obter o mesmo resultado:

```prisma
// schema.prisma — equivalente ao que o engine gera automaticamente

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Plan {
  id            String   @id @default(uuid())
  name          String   @unique
  slug          String   @unique
  priceMonthly  Int
  currency      String   @default("BRL")
  features      Json     @default("[]")
  storeLimit    Int?
  trialDays     Int      @default(14)
  stripePriceId String?
  active        Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  subscriptions Subscription[]
}

model Customer {
  id               String   @id @default(uuid())
  email            String   @unique
  name             String
  company          String?
  document         String?
  phone            String?
  stripeCustomerId String?
  status           CustomerStatus @default(ACTIVE)
  metadata         Json?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  subscriptions Subscription[]
}

enum CustomerStatus {
  ACTIVE
  INACTIVE
  BLOCKED
}

model Subscription {
  id                    String   @id @default(uuid())
  customerId            String
  planId                String
  stripeSubscriptionId  String?
  status                SubscriptionStatus @default(TRIAL)
  trialStart            DateTime?
  trialEnd              DateTime?
  currentPeriodStart    DateTime?
  currentPeriodEnd      DateTime?
  canceledAt            DateTime?
  cancellationReason    String?
  trialWarningeSent     Boolean  @default(false)
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  customer Customer @relation(fields: [customerId], references: [id])
  plan     Plan     @relation(fields: [planId], references: [id])

  @@unique([customerId], name: "unique_active_sub",
    where: { status: { in: ["TRIAL", "ACTIVE", "PAST_DUE"] } })
}

// ... mais 3 models (MetricsSnapshot, ProcessedEvent, SentEmail)
```

A diferenca: o schema Prisma e apenas a definicao de dados. O desenvolvedor ainda precisa escrever:

- Controllers para cada endpoint
- Services com logica de negocio
- Middleware de autenticacao
- Integracao com Stripe SDK
- Integracao com Resend SDK
- Jobs de cron
- Tratamento de erros
- Validacoes
- Testes

O SIML Runtime Engine gera tudo isso a partir dos contratos.

---

## 5. Fluxo Completo: Jornada de um Cliente

Simulacao narrativa do ciclo de vida de um cliente real. Cada passo mostra a requisicao HTTP, a resposta, e os efeitos colaterais no sistema.

### Dia 0 — Cadastro do Cliente

A empresa "Loja do Ze" quer testar o SaaS.

```
POST /api/customers
Content-Type: application/json
X-API-Key: sk_live_abc123

{
  "email": "ze@lojadoze.com.br",
  "nome": "Jose Silva",
  "empresa": "Loja do Ze LTDA",
  "documento": "12.345.678/0001-90"
}
```

Resposta:

```json
{
  "id": "019539a1-7c5e-7b3a-9e1d-4a2b8c6f1234",
  "email": "ze@lojadoze.com.br",
  "nome": "Jose Silva",
  "empresa": "Loja do Ze LTDA",
  "documento": "12345678000190",
  "stripe_customer_id": "cus_R4x7mK9pQ2nL",
  "status": "ativo",
  "criado_em": "2026-03-13T10:00:00Z"
}
```

Efeitos colaterais:
- Cliente criado no Stripe (cus_R4x7mK9pQ2nL)
- Evento `cliente.criado` disparado
- Email de boas-vindas enviado para ze@lojadoze.com.br
- Registro de auditoria criado

### Dia 0 — Criacao da Assinatura

Ze escolhe o plano Growth.

```
POST /api/subscriptions
Content-Type: application/json
Authorization: Bearer eyJ...

{
  "cliente_id": "019539a1-7c5e-7b3a-9e1d-4a2b8c6f1234",
  "plano_id": "019539a0-1234-7aaa-8888-growth00001"
}
```

Resposta:

```json
{
  "assinatura": {
    "id": "019539b2-aaaa-7bbb-cccc-subscription1",
    "cliente_id": "019539a1-7c5e-7b3a-9e1d-4a2b8c6f1234",
    "plano_id": "019539a0-1234-7aaa-8888-growth00001",
    "stripe_subscription_id": "sub_1R8kP2wX4mNq",
    "status": "trial",
    "trial_inicio": "2026-03-13T10:05:00Z",
    "trial_fim": "2026-03-27T10:05:00Z",
    "criado_em": "2026-03-13T10:05:00Z"
  },
  "checkout_url": null
}
```

Efeitos colaterais:
- Subscription criada no Stripe com trial_period_days: 14
- Evento `assinatura.criada` disparado
- Email "Trial do plano Growth comecou!" enviado
- Auditoria registrada

### Dia 11 — Cron Dispara Aviso de Trial

O cron `aviso_trial_expirando` roda as 9h UTC. Encontra a assinatura do Ze (trial_fim em 3 dias).

```
[2026-03-24 09:00:01 UTC] CRON aviso_trial_expirando
  Assinaturas com trial expirando em 3 dias: 1
  - Jose Silva (ze@lojadoze.com.br): Growth, expira 2026-03-27

  Evento disparado: notificacao.trial_expirando
  Email enviado: "Seu trial expira em 3 dias"
  Status: aviso_trial_enviado = true

  Evidencia: {
    cron: "aviso_trial_expirando",
    processados: 1,
    sucessos: 1,
    falhas: 0,
    duracao: "0.3s"
  }
```

Ze recebe o email:

```
Assunto: Seu trial expira em 3 dias

Ola Jose,

Seu trial do plano Growth expira em 3 dias (27/03/2026).

Apos o trial, voce sera cobrado R$ 197,00/mes.

Para continuar usando sem interrupcao, confirme seu metodo de pagamento:
https://checkout.stripe.com/s/...

Se nao quiser continuar, nao precisa fazer nada.

Equipe SeuApp
```

### Dia 14 — Trial Expira, Cobranca Inicia

O Stripe automaticamente tenta cobrar no fim do trial. A cobranca sucede.

O Stripe envia webhook:

```
POST /webhook/stripe
Stripe-Signature: t=1711540800,v1=abc123...

{
  "id": "evt_1R8xxx",
  "type": "invoice.payment_succeeded",
  "data": {
    "object": {
      "subscription": "sub_1R8kP2wX4mNq",
      "amount_paid": 19700,
      "currency": "brl",
      "period_start": 1711540800,
      "period_end": 1714132800
    }
  }
}
```

O engine processa:

```
[2026-03-27 10:00:05 UTC] WEBHOOK invoice.payment_succeeded
  Evento: evt_1R8xxx
  Subscription: sub_1R8kP2wX4mNq
  Assinatura local encontrada: 019539b2-aaaa-7bbb-cccc-subscription1

  Acoes:
    1. Status: "trial" -> "ativa"
    2. periodo_atual_inicio: 2026-03-27
    3. periodo_atual_fim: 2026-04-27
    4. Evento disparado: assinatura.pagamento_ok
    5. Email enviado: "Pagamento confirmado - Growth"

  Evidencia: {
    webhook_id: "evt_1R8xxx",
    tipo: "invoice.payment_succeeded",
    acao: "status_atualizado",
    status_anterior: "trial",
    status_novo: "ativa"
  }
```

Ze recebe:

```
Assunto: Pagamento confirmado — Growth

Ola Jose,

Seu pagamento de R$ 197,00 referente ao plano Growth foi confirmado.

Periodo: 27/03/2026 a 27/04/2026

Obrigado por usar o SeuApp!
```

### Mes 2 — Pagamento Falha

No dia 27/04, o Stripe tenta cobrar mas o cartao de Ze esta vencido. Stripe envia webhook:

```
POST /webhook/stripe

{
  "id": "evt_2F9yyy",
  "type": "invoice.payment_failed",
  "data": {
    "object": {
      "subscription": "sub_1R8kP2wX4mNq",
      "amount_due": 19700,
      "attempt_count": 1,
      "next_payment_attempt": 1714650000
    }
  }
}
```

O engine processa:

```
[2026-04-27 10:00:03 UTC] WEBHOOK invoice.payment_failed
  Assinatura: 019539b2-aaaa-7bbb-cccc-subscription1

  Acoes:
    1. Status: "ativa" -> "past_due"
    2. Evento disparado: assinatura.pagamento_falhou
    3. Email enviado: "Falha no pagamento do plano Growth"

  Evidencia: {
    webhook_id: "evt_2F9yyy",
    tentativa: 1,
    proxima_tentativa: "2026-05-02",
    status_anterior: "ativa",
    status_novo: "past_due"
  }
```

Ze recebe email urgente:

```
Assunto: ⚠ Falha no pagamento do plano Growth

Ola Jose,

Nao conseguimos processar seu pagamento de R$ 197,00.

Proxima tentativa automatica: 02/05/2026

Para evitar interrupcao, atualize seu metodo de pagamento:
https://billing.stripe.com/p/...
```

O Stripe faz retry automatico em 5 dias. Digamos que Ze atualiza o cartao e o retry sucede. Novo webhook `invoice.payment_succeeded` chega, status volta para "ativa".

### Mes 3 — Cliente Cancela

Ze decide cancelar. Faz a requisicao:

```
POST /api/subscriptions/019539b2-aaaa-7bbb-cccc-subscription1/cancel
Authorization: Bearer eyJ...

{
  "motivo": "Vou usar outra ferramenta",
  "cancelar_imediatamente": false
}
```

Resposta:

```json
{
  "id": "019539b2-aaaa-7bbb-cccc-subscription1",
  "status": "ativa",
  "cancel_at_period_end": true,
  "cancelada_em": "2026-05-25T15:30:00Z",
  "motivo_cancelamento": "Vou usar outra ferramenta"
}
```

A assinatura continua ativa ate o fim do periodo (27/05). No dia 27/05, Stripe envia:

```
POST /webhook/stripe

{
  "id": "evt_3G0zzz",
  "type": "customer.subscription.deleted",
  "data": {
    "object": {
      "id": "sub_1R8kP2wX4mNq",
      "status": "canceled"
    }
  }
}
```

O engine processa:

```
[2026-05-27 00:00:02 UTC] WEBHOOK customer.subscription.deleted
  Assinatura: 019539b2-aaaa-7bbb-cccc-subscription1

  Acoes:
    1. Status: "ativa" -> "cancelada"
    2. cancelada_em: 2026-05-27T00:00:02Z
    3. Evento disparado: assinatura.cancelada_definitivamente
    4. Email enviado: "Sua assinatura do Growth foi cancelada"
```

Ze recebe o email de despedida:

```
Assunto: Sua assinatura do Growth foi cancelada

Ola Jose,

Sua assinatura do plano Growth foi cancelada.

Seus dados serao mantidos por 90 dias. Se quiser voltar:
https://seuapp.com.br/planos

Sentiremos sua falta.
```

### Timeline Visual Completa

```
Dia 0          Dia 11         Dia 14              Mes 2              Mes 3
  │               │              │                   │                  │
  ▼               ▼              ▼                   ▼                  ▼
CADASTRO     AVISO TRIAL    COBRANCA OK        FALHA PAG.         CANCELAMENTO
  │               │              │                   │                  │
  ├─ POST         ├─ Cron 9h     ├─ Webhook          ├─ Webhook         ├─ POST /cancel
  │  /customers   │              │  payment_          │  payment_        │
  │               ├─ Email       │  succeeded         │  failed          ├─ Stripe cancel
  ├─ Stripe       │  "3 dias"    │                    │                  │  at period end
  │  customer     │              ├─ trial→ativa       ├─ ativa→past_due  │
  │               │              │                    │                  ├─ Webhook
  ├─ POST         │              ├─ Email             ├─ Email urgente   │  sub.deleted
  │  /subscriptions               │  "pag. ok"        │                  │
  │               │              │                    ├─ Retry OK        ├─ cancelada
  ├─ Stripe       │              │                    │  (5 dias)        │
  │  subscription │              │                    │                  ├─ Email
  │  (trial 14d)  │              │                    ├─ past_due→ativa  │  "despedida"
  │               │              │                    │                  │
  ├─ Email        │              │                    │                  │
  │  "boas-vindas"│              │                    │                  │
  │               │              │                    │                  │
  ├─ Email        │              │                    │                  │
  │  "trial       │              │                    │                  │
  │   comecou"    │              │                    │                  │
  ▼               ▼              ▼                   ▼                  ▼
```

---

## 6. Evolucao Conversacional

O fundador volta ao dashboard 2 semanas depois. O sistema esta rodando, tem 47 clientes, 12 ja converteram do trial. Agora ele quer evoluir.

### 6.1 "Adicione suporte a cupons de desconto"

O fundador digita:

> "Quero poder criar cupons de desconto. Tipo 20% off por 3 meses, ou R$50 off no primeiro mes. Cupom tem codigo, limite de usos, e data de validade."

O engine gera um novo contrato:

```siml
@contrato "subscription.coupons"
@versao "1.0.0"
@dominio comercial.promocoes
@depende_de ["subscription.plans.management",
             "subscription.subscriptions.creation"]

intencao {
  objetivo: "permitir descontos promocionais em assinaturas"
  principio: "cupom e aplicado na criacao da assinatura"
  principio: "desconto refletido no Stripe (nao apenas local)"
}

entidade cupom {
  id              -> tipo: uuid_v7
  codigo          -> tipo: texto_uppercase, min: 3, max: 20, unico: true
  tipo_desconto   -> tipo: enum("percentual", "valor_fixo")
  valor_desconto  -> tipo: inteiro_positivo
                     semantica: "se percentual: 1-100. se valor_fixo: centavos"
  duracao         -> tipo: enum("uma_vez", "repeticao", "para_sempre")
  duracao_meses   -> tipo: inteiro_positivo, obrigatorio: quando(duracao == "repeticao")
  limite_usos     -> tipo: inteiro_positivo | nulo
                     semantica: "nulo = ilimitado"
  usos_atual      -> tipo: inteiro, padrao: 0
  valido_ate      -> tipo: datetime_utc | nulo
  planos_validos  -> tipo: lista<referencia(plano)> | nulo
                     semantica: "nulo = vale para todos os planos"
  ativo           -> tipo: booleano, padrao: true
  stripe_coupon_id -> tipo: texto, preenchido_por: integracao("stripe")
  criado_em       -> tipo: datetime_utc
}

endpoint POST /api/coupons {
  autenticacao: bearer_token(role: "admin")
  entrada: {
    codigo: obrigatorio
    tipo_desconto: obrigatorio
    valor_desconto: obrigatorio
    duracao: obrigatorio
    duracao_meses: condicional
    limite_usos: opcional
    valido_ate: opcional
    planos_validos: opcional
  }
  execucao: {
    1. validar codigo unico
    2. SE tipo == "percentual": validar valor entre 1 e 100
    3. criar coupon no Stripe
    4. criar promotion code no Stripe com codigo
    5. salvar cupom no banco
    6. retornar cupom criado
  }
  saida: cupom, status 201
}

endpoint POST /api/coupons/:codigo/validate {
  autenticacao: api_key | bearer_token
  entrada: {
    plano_id: obrigatorio
  }
  execucao: {
    1. buscar cupom por codigo
    2. verificar: ativo, dentro da validade, usos < limite, plano permitido
    3. calcular desconto
    4. retornar validacao
  }
  saida: {
    valido: booleano
    desconto_calculado: monetario
    preco_final: monetario
    motivo_invalido: texto | nulo
  }
}
```

E modifica o Contrato 3 (Criacao de Assinatura):

```siml
-- DIFF no contrato subscription.subscriptions.creation
-- Versao: 1.0.0 -> 1.1.0

endpoint POST /api/subscriptions {
  entrada: {
    cliente_id: obrigatorio
    plano_id: obrigatorio
    metodo_pagamento_id: opcional
+   cupom_codigo: opcional
  }
  execucao: {
    ...
    3.5. SE cupom_codigo fornecido:
         a. validar cupom (ativo, validade, limite, plano)
         b. SE invalido: retornar erro 422
         c. incrementar usos_atual
+   4. criar subscription no Stripe:
+      SE cupom_codigo:
+        - coupon: cupom.stripe_coupon_id
    ...
  }
+ erro: {
+   cupom_invalido -> 422 "Cupom invalido ou expirado"
+   cupom_plano    -> 422 "Cupom nao aplicavel a este plano"
+ }
}
```

### 6.2 "Quero um endpoint de upgrade de plano"

> "O cliente precisa poder fazer upgrade do plano. De Starter pra Growth, por exemplo. O preco deve ser calculado pro-rata."

```siml
@contrato "subscription.plan-change"
@versao "1.0.0"
@dominio comercial.assinaturas
@depende_de ["subscription.subscriptions.creation"]

intencao {
  objetivo: "permitir upgrade ou downgrade de plano com calculo pro-rata"
  principio: "upgrade e imediato, downgrade efetivo no proximo ciclo"
  principio: "Stripe calcula pro-rata automaticamente"
}

endpoint POST /api/subscriptions/:id/change-plan {
  autenticacao: bearer_token
  entrada: {
    novo_plano_id: obrigatorio
  }
  execucao: {
    1. buscar assinatura (validar status ativa ou trial)
    2. buscar plano atual e novo plano
    3. SE novo_plano == plano_atual: retornar erro 422
    4. determinar direcao:
       - upgrade: novo_plano.preco_mensal > plano_atual.preco_mensal
       - downgrade: novo_plano.preco_mensal < plano_atual.preco_mensal
    5. atualizar subscription no Stripe:
       SE upgrade:
         - items: [{ id: item_id, price: novo_plano.stripe_price_id }]
         - proration_behavior: "create_prorations"
         - payment_behavior: "pending_if_incomplete"
       SE downgrade:
         - items: [{ id: item_id, price: novo_plano.stripe_price_id }]
         - proration_behavior: "none"
         - billing_cycle_anchor: "unchanged"
           semantica: "downgrade efetivo no proximo ciclo"
    6. atualizar plano_id na assinatura local
    7. disparar evento "assinatura.plano_alterado" {
         cliente_id, plano_anterior, plano_novo, direcao, proration
       }
  }
  saida: {
    assinatura: assinatura atualizada
    direcao: "upgrade" | "downgrade"
    proration: monetario | nulo
      semantica: "valor pro-rata cobrado/creditado"
  }, status 200
  erro: {
    mesmo_plano      -> 422 "Novo plano e igual ao atual"
    plano_invalido   -> 404 "Plano nao encontrado"
    assinatura_inativa -> 422 "Assinatura nao esta ativa"
  }
}
```

### 6.3 "Quando o cliente cancela, oferecer 30% de desconto por 3 meses"

> "Quando o cliente tentar cancelar, quero oferecer 30% de desconto por 3 meses como retencao. Se ele aceitar, aplicar o desconto. Se recusar, cancelar normalmente."

O engine modifica o Contrato 3 (endpoint de cancelamento):

```siml
-- DIFF no contrato subscription.subscriptions.creation
-- Versao: 1.1.0 -> 1.2.0

endpoint POST /api/subscriptions/:id/cancel {
  execucao: {
-   1. buscar assinatura
-   2. validar que status permite cancelamento
-   3. cancelar no Stripe
+   1. buscar assinatura
+   2. validar que status permite cancelamento
+   3. verificar se cliente JA recebeu oferta de retencao
+      SE nao recebeu:
+        a. NAO cancelar ainda
+        b. retornar oferta de retencao:
+           {
+             "cancelamento_pendente": true,
+             "oferta_retencao": {
+               "desconto": 30,
+               "tipo": "percentual",
+               "duracao_meses": 3,
+               "preco_com_desconto": calcular(plano.preco * 0.70)
+             },
+             "aceitar_url": "/api/subscriptions/:id/accept-retention",
+             "confirmar_cancelamento_url": "/api/subscriptions/:id/confirm-cancel"
+           }
+      SE ja recebeu: cancelar normalmente (fluxo original)
  }
}

+ endpoint POST /api/subscriptions/:id/accept-retention {
+   autenticacao: bearer_token
+   execucao: {
+     1. buscar assinatura e oferta pendente
+     2. criar cupom de retencao no Stripe (30%, 3 meses)
+     3. aplicar cupom na subscription
+     4. limpar flag de cancelamento pendente
+     5. disparar evento "assinatura.retencao_aceita" {
+          cliente_id, plano_id, desconto, duracao
+        }
+     6. enviar email "Obrigado por ficar! Seu desconto foi aplicado."
+   }
+   saida: assinatura atualizada com desconto, status 200
+ }

+ endpoint POST /api/subscriptions/:id/confirm-cancel {
+   autenticacao: bearer_token
+   execucao: {
+     1. buscar assinatura
+     2. executar cancelamento normal (fluxo original)
+     3. disparar evento "assinatura.retencao_recusada" {
+          cliente_id, plano_id
+        }
+   }
+ }
```

### 6.4 "Adicione rate limiting de 100 requests/minuto por API key"

> "Preciso de rate limiting. 100 requests por minuto por API key. Retornar 429 quando exceder."

O engine nao cria um novo contrato. Ele adiciona uma configuracao global ao runtime:

```siml
@contrato "infrastructure.rate-limiting"
@versao "1.0.0"
@dominio infraestrutura.seguranca
@aplica_a TODOS os endpoints

intencao {
  objetivo: "proteger a API contra abuso e garantir disponibilidade"
  principio: "rate limit por API key, nao por IP"
  principio: "headers informativos para o consumidor"
}

configuracao {
  backend: "redis"
  algoritmo: "sliding_window"

  regra padrao {
    limite: 100
    janela: 60 segundos
    chave: request.api_key | request.bearer_token.sub
  }

  regra webhook {
    aplica_a: "/webhook/*"
    limite: 1000
    janela: 60 segundos
    chave: request.ip
    semantica: "webhooks Stripe tem volume maior"
  }

  regra metricas {
    aplica_a: "/api/metrics*"
    limite: 30
    janela: 60 segundos
    chave: request.bearer_token.sub
    semantica: "metricas sao pesadas, limitar mais"
  }
}

comportamento_quando_excedido {
  status: 429
  headers: {
    "X-RateLimit-Limit": limite_configurado
    "X-RateLimit-Remaining": limite - uso_atual
    "X-RateLimit-Reset": timestamp_reset_janela
    "Retry-After": segundos_ate_reset
  }
  corpo: {
    "erro": "RATE_LIMIT_EXCEEDED",
    "mensagem": "Limite de requisicoes excedido. Tente novamente em {{segundos}} segundos.",
    "limite": limite_configurado,
    "reset_em": timestamp_reset
  }
}

headers_em_toda_resposta {
  "X-RateLimit-Limit": limite_configurado
  "X-RateLimit-Remaining": limite - uso_atual
  "X-RateLimit-Reset": timestamp_reset_janela
}
```

---

## 7. Comparacao de Esforco

### 7.1 Tabela Comparativa

| Dimensao | NestJS + Prisma + Stripe SDK | SIML Runtime Engine |
|---|---|---|
| **Tempo para MVP funcional** | 6-8 semanas | 1-2 dias |
| **Tempo para setup inicial** | 2-3 dias (boilerplate, configs) | 30 minutos (docker-compose) |
| **Endpoints implementados** | 12-15 (escrita manual) | 12-15 (gerados automaticamente) |
| **Linhas de codigo** | ~3.000-5.000 (controllers + services + DTOs + testes) | 0 linhas de codigo |
| **Linhas de contrato** | N/A | ~800 linhas de contratos SIML |
| **Integracao Stripe** | 200-400 linhas (SDK + webhook handling + error handling) | Declarada nos contratos (~50 linhas) |
| **Integracao email** | 100-200 linhas (templates + envio + error handling) | Declarada nos contratos (~120 linhas) |
| **Cron jobs** | 100-200 linhas (setup + logica + error handling) | Declarados nos contratos (~80 linhas) |
| **Schema do banco** | 1 arquivo Prisma (~80 linhas) + migrations | Gerado automaticamente |
| **Validacoes** | Espalhadas por DTOs, pipes, services | Centralizadas nos contratos |
| **Autenticacao** | Middleware manual (JWT/API key) | Configuracao no engine |
| **Rate limiting** | 1 pacote + configuracao | 1 contrato |
| **Testes unitarios** | 200-500 linhas (deve escrever) | Gerados pelo engine a partir das validacoes |
| **Documentacao da API** | Swagger decorators ou manual | Gerada dos contratos |
| **Custo de profissional** | Backend senior: R$ 15-25k/mes | Fundador nao-tecnico: R$ 0 |
| **Adicionar feature nova** | 1-3 dias (design + codigo + testes + deploy) | 10-30 minutos (conversa + contrato + deploy) |
| **Manutencao mensal** | 20-40h (bugs, updates, monitoring) | 2-5h (revisar contratos, monitorar metricas) |

### 7.2 O que a tabela nao mostra

**Curva de aprendizado.** Um dev precisa saber NestJS, Prisma, TypeScript, Stripe SDK, webhooks, cron, Redis, Docker. O fundador usando SIML precisa saber descrever o que quer em portugues.

**Debt tecnico.** Codigo escrito em 6 semanas sob pressao acumula atalhos. Contratos SIML nao tem debt — eles declaram intencao, nao implementacao. Quando a implementacao melhora (engine atualizado), os contratos se beneficiam automaticamente.

**Onboarding.** Um novo dev em um codebase NestJS precisa de 1-2 semanas para entender a arquitetura. Um novo membro lendo contratos SIML entende o sistema em 30 minutos — porque os contratos sao a documentacao.

**Mas tambem.** A tabela nao mostra que o codebase NestJS pode ser debugado linha por linha. O SIML Engine e uma caixa preta. Se algo da errado no meio da execucao, o fundador depende da camada de observabilidade do engine. Se ela falhar, ele nao tem como investigar.

---

## 8. Limitacoes Honestas

### 8.1 O que esse sistema NAO conseguiria fazer bem

**Logica de negocio verdadeiramente complexa.** Se o calculo de preco do plano Enterprise envolver 15 variaveis com interdependencias nao lineares (volume de dados processados, numero de queries, bandwidth, features custom), um contrato SIML nao consegue expressar isso de forma confiavel. Contratos sao bons para fluxos. Sao fracos para algoritmos.

**Processamento de dados em massa.** Se o SaaS precisar processar 10 milhoes de registros do e-commerce do cliente para gerar analytics, o SIML Engine nao e o lugar para isso. O engine gera endpoints e orquestra fluxos. O heavy lifting de dados precisa de um pipeline dedicado (Spark, DuckDB, etc).

**UI/Frontend dinamico.** O engine gera APIs, nao interfaces. O frontend continua sendo responsabilidade do time. Nenhum contrato SIML vai gerar um dashboard React otimizado.

**Integracao com APIs exoticas.** Se o cliente precisa integrar com um ERP que tem API SOAP com autenticacao WS-Security e certificado digital, o SIML Engine provavelmente nao tem adaptador para isso. O engine funciona bem com APIs REST/JSON modernas (Stripe, Resend, etc). APIs legadas exigem adaptadores customizados.

**Multi-tenancy avancado.** Se o SaaS precisa de isolamento completo de dados por tenant (schemas separados no Postgres, por exemplo), isso e uma decisao arquitetural que esta abaixo do nivel dos contratos. O engine precisaria suportar isso nativamente.

### 8.2 Onde o SIML Engine atinge seu limite

**Concorrencia e race conditions.** Dois webhooks do Stripe chegando simultaneamente para a mesma assinatura. O contrato diz "atualizar status", mas nao especifica como lidar com writes concorrentes. O engine precisa de locking otimista ou pessimista, e isso e uma decisao de implementacao, nao de intencao.

**Transacoes distribuidas.** O contrato de criacao de assinatura faz: criar no banco local, criar no Stripe, enviar email. Se o Stripe falha apos o banco local ter gravado, o que acontece? Compensacao? Retry? O contrato precisa declarar isso explicitamente, e a semantica de transacoes distribuidas e notoriamente dificil de expressar em linguagem natural.

**Migracao de schema.** Quando um contrato muda (v1.0 para v1.1, adicionando o campo cupom_codigo), o engine precisa gerar e aplicar migrations automaticamente. Adicionar campos opcionais e trivial. Renomear campos, mover dados, alterar tipos — isso exige raciocinio que um LLM pode errar.

**Performance sob carga.** Se o SaaS escala para 10.000 clientes e 500 requests/segundo, o overhead do engine (interpretar contrato, decidir execucao, gerar queries) adiciona latencia. Codigo compilado roda em microsegundos. LLM inference roda em milissegundos a segundos. Para APIs que precisam de p99 < 50ms, o engine pode ser o gargalo.

### 8.3 Quando faz sentido escrever codigo customizado

| Cenario | SIML Engine | Codigo Custom |
|---|---|---|
| CRUD simples com integracao Stripe | Ideal | Overkill |
| Webhook processing | Bom | Similar |
| Calculo financeiro complexo | Arriscado | Necessario |
| Pipeline de dados | Inadequado | Necessario |
| Algoritmo de ML | Inadequado | Necessario |
| Migrations complexas | Fragil | Necessario |
| APIs com SLA < 50ms p99 | Possivelmente lento | Necessario |
| Prototipo/MVP rapido | Perfeito | Demorado |
| Sistema critico de pagamento | Supervisao extra necessaria | Controle total |

A regra pratica: use SIML Engine para a camada de orquestracao e APIs. Escreva codigo para logica computacional pura, processamento de dados, e qualquer coisa que exija latencia sub-milissegundo.

### 8.4 Latencia: LLM vs Codigo Compilado

```
COMPARACAO DE LATENCIA (estimada)

  Operacao                    NestJS Compilado    SIML Engine
  ──────────────────────────  ─────────────────   ──────────────
  GET /api/plans (cache)      2-5ms               10-20ms
  GET /api/plans (DB)         10-30ms             30-80ms
  POST /api/customers         50-100ms            200-500ms
  POST /api/subscriptions     200-500ms           500-1500ms
    (inclui chamada Stripe)
  POST /webhook/stripe        20-50ms             50-150ms
  GET /api/metrics (cache)    2-5ms               10-20ms
  GET /api/metrics (calculo)  100-500ms           300-1000ms

  Overhead medio do engine: 2-5x sobre codigo compilado
```

Para um SaaS com 100-1000 clientes (publico do MVP), essa latencia e irrelevante. O usuario nao percebe diferenca entre 50ms e 500ms em uma chamada de API.

Para um SaaS com 100.000+ clientes e APIs chamadas por sistemas (nao humanos), a diferenca importa. Nesse ponto, o fundador ja teria revenue para contratar um backend engineer e migrar os endpoints criticos para codigo.

### 8.5 Edge Cases Problematicos

**Dupla cobranca.** O cron tenta cobrar, o Stripe ja cobrou por webhook. Sem controle de idempotencia perfeito, o cliente e cobrado duas vezes. O contrato declara idempotencia, mas a implementacao correta depende do engine.

**Webhook replay.** O Stripe reenvia um webhook que ja foi processado. O contrato declara verificacao por evento.id, mas se o Redis de idempotencia reiniciar e perder dados, o evento e processado novamente.

**Timezone hell.** Trial de 14 dias: 14 dias em UTC? No timezone do cliente? O contrato diz "14 dias" mas nao especifica timezone. Para a maioria dos casos, UTC e suficiente. Para um cliente que contesta a cobranca dizendo "meu trial ainda nao acabou" (porque no timezone dele faltava 1 hora), e um problema real.

**Stripe API downtime.** O contrato de criacao de assinatura depende do Stripe. Se o Stripe estiver fora do ar, o que acontece? O engine precisa de uma estrategia de retry com backoff, mas o contrato nao especifica isso explicitamente. E uma responsabilidade do runtime, nao do contrato.

---

## 9. Licoes para o MVP

### 9.1 Features Essenciais para o MVP do SIML Engine

Baseado nesta simulacao, o MVP do SIML Runtime Engine precisa de:

**Tier 1 — Sem isso nao existe produto:**

1. **Gerador de endpoints REST a partir de contratos.** O motor principal. Le um contrato SIML, gera endpoint funcional com validacao, erro handling, e response.

2. **Integracao com banco de dados.** Criar tabelas automaticamente a partir de entidades declaradas nos contratos. CRUD basico funcional.

3. **Chat para gerar contratos.** Interface de conversa que traduz intencao em contratos SIML. Nao precisa ser perfeito — precisa ser editavel.

4. **Webhook receiver generico.** Capacidade de receber webhooks, verificar assinatura, e rotear para logica declarada no contrato.

**Tier 2 — Necessario para ser util:**

5. **Integracao Stripe.** Adaptador nativo. Criar customers, subscriptions, aplicar cupons, gerenciar pagamentos. Stripe e o caso de uso mais comum de SaaS.

6. **Cron jobs declarativos.** Agendar execucoes periodicas a partir de contratos. O `aviso_trial_expirando` e o caso classico.

7. **Sistema de eventos interno.** Quando uma acao acontece, disparar eventos que outros contratos podem escutar. E a cola que conecta os 7 contratos.

8. **Camada de observabilidade basica.** Dashboard mostrando: quais contratos estao ativos, ultimas execucoes, erros recentes.

**Tier 3 — Pode esperar:**

9. **Rate limiting.** Importante mas nao para dia 1.

10. **Integracao com provedores de email.** Util mas pode ser substituido por webhook para um servico externo no inicio.

11. **Metricas de negocio.** Calculaveis externamente. O engine nao precisa ser o BI tool.

12. **Evolucao conversacional.** Modificar contratos via chat. No inicio, editar o arquivo SIML diretamente e aceitavel.

### 9.2 O que pode esperar

- **Multi-tenancy**: nao e necessario para o MVP. Um engine por cliente.
- **Marketplace de contratos**: ecossistema vem depois.
- **Compilacao para codigo**: otimizacao de performance e prematura no MVP.
- **Suporte a GraphQL**: REST resolve 90% dos casos SaaS.
- **Integracao com 50 provedores**: comece com Stripe + 1 provedor de email. Adicione conforme demanda.

### 9.3 O que este caso nos ensina sobre o design do engine

**1. O contrato precisa ser auto-contido.** Cada contrato deve declarar tudo que o engine precisa para executar: entidades, endpoints, validacoes, integracoes, erros. Se o engine precisa de informacao que nao esta no contrato, o contrato esta incompleto.

**2. Eventos sao a infraestrutura critica.** Os 7 contratos deste caso se comunicam inteiramente via eventos. O sistema de eventos interno e tao importante quanto o gerador de endpoints. Sem eventos, cada contrato e uma ilha.

**3. Idempotencia nao e opcional.** Webhooks, cron jobs, notificacoes — tudo pode executar mais de uma vez. O engine precisa de primitivas de idempotencia (deduplicacao por ID, marcadores de "ja processado", operacoes upsert em vez de insert).

**4. O Stripe e o melhor primeiro adaptador.** Nao por ser o mais facil, mas por ser o mais demandado. Se o SIML Engine funcionar bem com Stripe, 80% dos SaaS founders vao querer usa-lo.

**5. A camada de observabilidade e a confianca.** O fundador nao-tecnico esta confiando seu negocio a um engine que ele nao entende internamente. A unica forma de construir confianca e mostrar exatamente o que aconteceu em cada execucao. Log nao e suficiente — precisa de narrativa: "O webhook do Stripe chegou, o engine atualizou o status de trial para ativa, enviou email de confirmacao, tudo em 340ms."

**6. Contratos evoluem incrementalmente.** Nenhum dos 7 contratos nasceu perfeito. Versao 1.0 faz o basico. O fundador volta em 2 semanas e pede cupons, upgrade de plano, retencao. O engine precisa suportar versionamento de contratos e aplicar diferencas sem derrubar o que esta funcionando.

**7. A fronteira clara entre engine e codigo.** Este caso funciona porque e um SaaS tipico: CRUD + integracoes + cron + notificacoes. Se o fundador pedisse "calcular preco dinamico baseado em machine learning", o engine deveria dizer "isso esta fora do meu escopo — voce precisa de um servico externo que eu posso chamar via API". Saber dizer "nao" e tao importante quanto saber executar.

---

## 10. Conclusao: O que esta Simulacao Demonstra

Esta simulacao nao e um produto pronto. E uma tese sobre o que e possivel quando a interface entre intencao humana e sistema de software e um contrato semantico, nao codigo.

O fundador da startup nao escreveu uma linha de codigo. Ele descreveu o que precisava. O engine traduziu em contratos formais, gerou endpoints, criou tabelas, integrou com Stripe e Resend, configurou cron jobs, e montou observabilidade.

O custo dessa conveniencia e controle. O fundador nao sabe como o endpoint funciona por dentro. Nao sabe como o engine decide a query SQL. Nao sabe se tem race condition no processamento de webhooks concorrentes.

Para um MVP com 50 clientes, isso e aceitavel. Para um sistema financeiro com 50.000 clientes, provavelmente nao.

A pergunta que o SIML Runtime Engine precisa responder nao e "voce substitui programadores?" E: **"para qual classe de problemas voce e a melhor ferramenta?"**

Se a resposta for "MVPs de SaaS, APIs de CRUD com integracao, prototipagem rapida de backends, e sistemas internos de empresas" — isso ja e um mercado enorme. E e exatamente o que esta simulacao demonstra.

---

*Simulacao produzida como parte do projeto SIML — Semantic Intent Markup Language. Runtime Engine v0.4.0 (conceitual).*
