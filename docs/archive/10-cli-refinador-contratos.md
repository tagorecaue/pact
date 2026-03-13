# 10 - CLI Refinador de Contratos SIML

> Design de uma interface de terminal onde o humano conversa em linguagem natural e o sistema gera, refina e gerencia contratos SIML de forma iterativa. Nao e um editor de texto — e um tradutor bidirecional entre intencao humana e contrato formal.

---

## 1. Experiencia do Usuario (UX de Terminal)

A CLI e projetada para parecer uma conversa, nao um formulario. O humano nunca precisa escrever SIML diretamente — ele fala o que quer, e a maquina traduz.

### 1.1 Sessao: Criando um Contrato do Zero

```
$ siml new

  ╔══════════════════════════════════════════════════╗
  ║  SIML Contract Builder v0.1                      ║
  ║  Tradutor: Claude claude-sonnet-4-20250514                     ║
  ║  Dominio: e-commerce (via .siml/config.siml)     ║
  ╚══════════════════════════════════════════════════╝

  Descreva o que voce precisa:

  > Quero um endpoint que recebe dados de pagamento do Stripe,
  > valida a assinatura, atualiza o status do pedido e envia email

  Interpretando...

  Entendi o seguinte:
    Tipo: webhook receiver
    Trigger: HTTP POST externo (Stripe)
    Acoes: validar -> atualizar -> notificar
    Entidades envolvidas: pagamento, pedido, cliente

  Isso esta correto? (s/n/refine)
  > s

  Gerando contrato...

  ╭─────────────────────────────────────────────────────╮
  │  CONTRATO: webhook-stripe-payment v1.0              │
  │                                                     │
  │  INTENCAO                                           │
  │  ├ Receber webhook de pagamento do Stripe           │
  │  ├ Validar assinatura criptografica                 │
  │  ├ Atualizar status do pedido para "pago"           │
  │  └ Enviar email de confirmacao ao cliente           │
  │                                                     │
  │  TRIGGER                                            │
  │  └ POST /webhook/stripe-payment                     │
  │                                                     │
  │  ENTIDADES                                          │
  │  ├ payment (payload Stripe)                         │
  │  ├ order   (status, valor, cliente_id)              │
  │  └ customer (email, nome)                           │
  │                                                     │
  │  RESTRICOES                                         │
  │  ├ Assinatura Stripe DEVE ser valida                │
  │  ├ Pedido DEVE existir no sistema                   │
  │  └ Email DEVE ser enviado em ate 30s                │
  │                                                     │
  │  FLUXO                                              │
  │  validate_signature                                 │
  │    -> find_order                                    │
  │      -> update_order_status                         │
  │        -> send_confirmation_email                   │
  │                                                     │
  │  EVIDENCIA                                          │
  │  └ Registrar: payload recebido, resultado           │
  │    validacao, order_id atualizado, email_id         │
  ╰─────────────────────────────────────────────────────╯

  Contrato gerado: .siml/contracts/webhook-stripe-payment.siml

  Refinar? (descreva mudancas ou 'ok' para confirmar)
```

O resumo e apresentado em linguagem natural, nao em SIML cru. O humano le intencao, nao sintaxe. Se quiser ver o SIML, digita `show raw`.

### 1.2 Sessao: Refinando o Contrato

```
  Refinar? (descreva mudancas ou 'ok' para confirmar)

  > adicione retry de 3x se o email falhar
  > e logue o payload completo em caso de assinatura invalida

  Refinando...

  ╭─ MUDANCAS ──────────────────────────────────────────╮
  │                                                     │
  │  + RESTRICAO adicionada:                            │
  │    Email: retry ate 3x com backoff exponencial      │
  │    (1s, 2s, 4s). Apos 3 falhas -> alerta critico.  │
  │                                                     │
  │  + ACAO adicionada:                                 │
  │    Se assinatura invalida: logar payload completo   │
  │    no evidence store com tag "security:invalid_sig" │
  │                                                     │
  │  ~ FLUXO atualizado:                                │
  │    validate_signature                               │
  │      -> [FALHA] log_invalid_payload -> REJEITAR     │
  │      -> [OK] find_order                             │
  │        -> update_order_status                       │
  │          -> send_email                              │
  │            -> [FALHA] retry(3x, backoff)            │
  │              -> [FALHA] alert_critical              │
  │                                                     │
  ╰─────────────────────────────────────────────────────╯

  Refinar?
  > ok

  Contrato salvo: .siml/contracts/webhook-stripe-payment.siml
  Versao: 1.0 -> 1.1
  Historico: .siml/.history/webhook-stripe-payment.history
```

### 1.3 Sessao: Vendo o SIML Cru

```
  Refinar?
  > show raw

  --- webhook-stripe-payment.siml (v1.1) ---

  @contrato "webhook.stripe.payment"              # azul
  @versao "1.1.0"                                 # azul
  @dominio comercial.pagamentos                   # azul
  @gerado_por tradutor:claude-sonnet@4            # cinza
  @refinado_por humano:operador:2026-03-13        # cinza

  intencao {                                      # verde
    objetivo: "processar webhook de pagamento Stripe"
    contexto: "e-commerce, pedidos ja existem no sistema"
    principio: "rejeitar silenciosamente se assinatura invalida,
                nunca processar payload nao verificado"
  }

  trigger {                                       # amarelo
    tipo: http_post
    rota: "/webhook/stripe-payment"
    headers_requeridos: ["Stripe-Signature"]
    content_type: "application/json"
  }

  entidade pagamento_stripe {                     # ciano
    event_type   -> tipo: texto, esperado: "checkout.session.completed"
    amount       -> tipo: monetario_brl
    customer_email -> tipo: email
    order_id     -> tipo: referencia(pedido.id)
    stripe_sig   -> tipo: texto, origem: header("Stripe-Signature")
  }

  fluxo principal {                               # branco
    passo validate_signature {
      acao: verificar_assinatura_stripe(stripe_sig, payload)
      falha -> log_and_reject
    }
    passo find_order {
      acao: buscar(pedido, por: order_id)
      falha -> erro("pedido nao encontrado", 404)
    }
    passo update_status {
      acao: atualizar(pedido.status, para: "pago")
    }
    passo send_email {
      acao: enviar_email(
        para: customer_email,
        template: "payment_confirmed"
      )
      falha -> retry(3, backoff: exponencial, base: 1s)
      falha_final -> alerta_critico("email_falhou_3x")
    }
  }

  fluxo log_and_reject {                          # vermelho
    passo log_payload {
      acao: registrar_evidencia(
        payload_completo,
        tag: "security:invalid_sig",
        severidade: alta
      )
    }
    passo rejeitar {
      acao: responder(status: 401, corpo: "invalid signature")
    }
  }

  restricoes {                                    # magenta
    assinatura_obrigatoria: true
    timeout: 30s
    retry_email: { tentativas: 3, backoff: exponencial }
    audit: completo
  }

  evidencia {                                     # cinza
    registrar: [payload_recebido, resultado_validacao,
                order_id_atualizado, email_id_enviado]
    retencao: 90 dias
  }

  # As cores indicadas sao as cores ANSI usadas no terminal.
  # Cada secao tem sua cor para facilitar leitura rapida.
```

### 1.4 Codigos de Cor do Terminal

A CLI usa cores ANSI para diferenciar as secoes do contrato:

```
  SECAO               COR ANSI         CODIGO
  ─────────────────────────────────────────────
  @metadados          azul brilhante   \033[94m
  intencao {}         verde            \033[32m
  trigger {}          amarelo          \033[33m
  entidade {}         ciano            \033[36m
  fluxo {}            branco (padrao)  \033[37m
  fluxo (erro) {}     vermelho         \033[31m
  restricoes {}       magenta          \033[35m
  evidencia {}        cinza            \033[90m
  + adicionado        verde brilhante  \033[92m
  - removido          vermelho brilh.  \033[91m
  ~ modificado        amarelo brilh.   \033[93m
  comentarios         cinza escuro     \033[90m
```

---

## 2. Comandos da CLI

### 2.1 `siml init`

Inicializa um diretorio `.siml` no projeto atual.

```
$ siml init

  Inicializando SIML...

  Dominio do projeto (ex: e-commerce, fintech, saude):
  > e-commerce

  Provedor LLM (claude/openai/local):
  > claude

  Modelo padrao:
  > claude-sonnet-4-20250514

  Criando estrutura:
    .siml/config.siml
    .siml/contracts/
    .siml/schemas/
    .siml/evidence/
    .siml/.history/

  Pronto. Execute `siml new` para criar seu primeiro contrato.
```

### 2.2 `siml new`

Inicia sessao interativa para criar um contrato a partir de linguagem natural. Sessao completa demonstrada na secao 1.1.

```
$ siml new

  # Inicia conversa interativa (ver secao 1.1)
```

Opcoes:

```
$ siml new --from-template webhook    # inicia a partir de template
$ siml new --domain pagamentos        # sugere contexto de dominio
$ siml new --non-interactive          # le de stdin, gera sem conversa
```

### 2.3 `siml refine <arquivo>`

Abre sessao de refinamento sobre um contrato existente.

```
$ siml refine .siml/contracts/webhook-stripe-payment.siml

  Carregando contrato: webhook-stripe-payment v1.1

  Resumo atual:
    Recebe webhook Stripe, valida assinatura, atualiza pedido,
    envia email com retry 3x.

  O que voce quer mudar?
  > o timeout ta muito curto, aumenta pra 60s
  > e adiciona verificacao de idempotencia — se o mesmo evento
  > vier 2x, ignora o segundo

  Refinando...

  ╭─ MUDANCAS ──────────────────────────────────────────╮
  │                                                     │
  │  ~ RESTRICAO modificada:                            │
  │    timeout: 30s -> 60s                              │
  │                                                     │
  │  + PASSO adicionado (no inicio do fluxo):           │
  │    check_idempotency: verificar se event_id ja foi  │
  │    processado. Se sim -> responder 200 e encerrar.  │
  │                                                     │
  │  + ENTIDADE atualizada:                             │
  │    pagamento_stripe.event_id -> tipo: texto, unico  │
  │                                                     │
  ╰─────────────────────────────────────────────────────╯

  Aplicar mudancas? (s/n/refine)
  > s

  Contrato atualizado: v1.1 -> v1.2
```

### 2.4 `siml explain <arquivo>`

Explica um contrato em linguagem natural, sem jargao tecnico.

```
$ siml explain .siml/contracts/webhook-stripe-payment.siml

  ╭─ Explicacao: webhook-stripe-payment ────────────────╮
  │                                                     │
  │  Este contrato define um endpoint que recebe        │
  │  notificacoes de pagamento do Stripe.               │
  │                                                     │
  │  Quando o Stripe avisa que um pagamento foi         │
  │  concluido, o sistema:                              │
  │                                                     │
  │  1. Verifica se a notificacao e autentica           │
  │     (assinatura criptografica do Stripe)            │
  │  2. Checa se ja processou essa mesma notificacao    │
  │     antes (evita duplicatas)                        │
  │  3. Encontra o pedido no banco de dados             │
  │  4. Marca o pedido como "pago"                      │
  │  5. Envia email de confirmacao ao cliente            │
  │                                                     │
  │  Se o email falhar, tenta mais 3 vezes (esperando   │
  │  1s, 2s, 4s entre tentativas). Se ainda falhar,     │
  │  gera um alerta critico.                            │
  │                                                     │
  │  Se a assinatura for invalida, registra o conteudo  │
  │  suspeito para investigacao e rejeita com erro 401. │
  │                                                     │
  │  Timeout maximo: 60 segundos.                       │
  │  Versao: 1.2 (refinado 2x desde a criacao)          │
  ╰─────────────────────────────────────────────────────╯
```

Opcoes:

```
$ siml explain <arquivo> --audience dev       # linguagem tecnica
$ siml explain <arquivo> --audience manager   # linguagem executiva
$ siml explain <arquivo> --audience new-hire  # linguagem didatica
```

### 2.5 `siml validate <arquivo>`

Valida sintaxe e semantica de um contrato.

```
$ siml validate .siml/contracts/webhook-stripe-payment.siml

  Validando webhook-stripe-payment.siml...

  Sintaxe     [OK]  Estrutura SIML valida
  Entidades   [OK]  3 entidades, todas com tipos definidos
  Fluxos      [OK]  2 fluxos, sem ciclos, sem dead ends
  Restricoes  [OK]  4 restricoes, todas atingiveis
  Evidencia   [OK]  4 pontos de registro definidos
  Referencias [OK]  referencia(pedido.id) -> schema encontrado

  Resultado: VALIDO

  Avisos:
    - trigger.rota "/webhook/stripe-payment" nao tem rate_limit
      explicito (usando padrao do config: 100 req/min)
    - evidencia.retencao "90 dias" pode violar LGPD se contem
      dados pessoais. Considere anonimizacao.
```

Validacao completa do projeto:

```
$ siml validate --all

  Validando 3 contratos...

  webhook-stripe-payment.siml  [VALIDO]   2 avisos
  cadastro-cliente.siml        [VALIDO]   0 avisos
  relatorio-diario.siml        [ERRO]     1 erro, 1 aviso

  Erros:
    relatorio-diario.siml:34
      Referencia a entidade "metricas_vendas" nao encontrada.
      Nenhum schema define essa entidade.
      Sugestao: criar .siml/schemas/metricas-vendas.schema.siml

  Total: 2 validos, 1 com erro
```

### 2.6 `siml diff <v1> <v2>`

Diff semantico entre versoes de um contrato. Nao e diff textual — e diff de significado.

```
$ siml diff webhook-stripe-payment@1.0 webhook-stripe-payment@1.2

  ╭─ Diff semantico: v1.0 -> v1.2 ─────────────────────╮
  │                                                     │
  │  INTENCAO          sem mudanca                      │
  │                                                     │
  │  ENTIDADES                                          │
  │  + pagamento_stripe.event_id (idempotencia)         │
  │                                                     │
  │  FLUXO                                              │
  │  + passo check_idempotency (novo, posicao 1)        │
  │  ~ passo send_email: adicionado retry 3x            │
  │  + fluxo log_and_reject (novo fluxo de erro)        │
  │                                                     │
  │  RESTRICOES                                         │
  │  ~ timeout: 30s -> 60s                              │
  │  + retry_email: 3x com backoff exponencial          │
  │  + idempotencia: por event_id                       │
  │                                                     │
  │  RESUMO                                             │
  │  O contrato v1.2 e mais robusto que v1.0:           │
  │  adicionou protecao contra duplicatas, retry em     │
  │  email, logging de payloads suspeitos e aumentou    │
  │  o timeout.                                         │
  ╰─────────────────────────────────────────────────────╯
```

### 2.7 `siml compose <a> <b>`

Mostra como dois contratos se conectam e gera visualizacao do fluxo composto.

```
$ siml compose cadastro-cliente webhook-stripe-payment

  ╭─ Composicao: cadastro-cliente + webhook-stripe ─────╮
  │                                                     │
  │  PONTO DE CONEXAO                                   │
  │  cadastro-cliente.entidade.customer.id              │
  │    -> webhook-stripe-payment.entidade.order.cliente │
  │                                                     │
  │  FLUXO COMPOSTO                                     │
  │                                                     │
  │  [cadastro-cliente]                                 │
  │    POST /api/customers                              │
  │    -> cria customer (id, email, nome)               │
  │    -> customer faz pedido (gera order)              │
  │                                                     │
  │         │                                           │
  │         v                                           │
  │                                                     │
  │  [webhook-stripe-payment]                           │
  │    POST /webhook/stripe-payment                     │
  │    -> recebe pagamento                              │
  │    -> encontra order -> encontra customer           │
  │    -> atualiza status, envia email para customer    │
  │                                                     │
  │  ENTIDADES COMPARTILHADAS                           │
  │  customer (id, email, nome) -- criado por A,        │
  │                                lido por B           │
  │                                                     │
  │  DEPENDENCIA: B depende de A                        │
  │  (order referencia customer que deve existir)       │
  ╰─────────────────────────────────────────────────────╯
```

### 2.8 `siml list`

Lista contratos no diretorio com resumo.

```
$ siml list

  ╭─ Contratos em .siml/contracts/ ─────────────────────╮
  │                                                     │
  │  CONTRATO                    VERSAO  STATUS         │
  │  ────────────────────────────────────────────       │
  │  webhook-stripe-payment      v1.2    valido         │
  │  cadastro-cliente            v1.0    valido         │
  │  relatorio-diario            v0.3    1 erro         │
  │                                                     │
  │  3 contratos, 2 validos, 1 com erro                 │
  ╰─────────────────────────────────────────────────────╯

$ siml list --verbose

  webhook-stripe-payment v1.2
    Trigger: POST /webhook/stripe-payment
    Entidades: 3 (payment, order, customer)
    Refinamentos: 2
    Ultimo: 2026-03-13 14:32

  cadastro-cliente v1.0
    Trigger: POST /api/customers
    Entidades: 1 (customer)
    Refinamentos: 0
    Ultimo: 2026-03-13 10:15

  relatorio-diario v0.3
    Trigger: cron("0 6 * * *")
    Entidades: 2 (metricas_vendas, relatorio)
    Refinamentos: 3
    Ultimo: 2026-03-13 16:01
    ERRO: referencia a entidade nao resolvida
```

### 2.9 `siml inspect <arquivo>`

Visualizacao detalhada e interativa de um contrato.

```
$ siml inspect .siml/contracts/webhook-stripe-payment.siml

  ╔══════════════════════════════════════════════════════╗
  ║  webhook-stripe-payment v1.2                         ║
  ║  Dominio: comercial.pagamentos                       ║
  ║  Criado: 2026-03-13 10:30                            ║
  ║  Refinado: 2x (ultimo: 2026-03-13 14:32)            ║
  ╠══════════════════════════════════════════════════════╣
  ║                                                      ║
  ║  INTENCAO                                            ║
  ║  Processar webhook de pagamento Stripe. Validar      ║
  ║  assinatura, atualizar pedido, notificar cliente.    ║
  ║                                                      ║
  ║  TRIGGER                                             ║
  ║  POST /webhook/stripe-payment                        ║
  ║  Headers: Stripe-Signature (obrigatorio)             ║
  ║  Content-Type: application/json                      ║
  ║                                                      ║
  ║  GRAFO DE EXECUCAO                                   ║
  ║                                                      ║
  ║  [check_idempotency]                                 ║
  ║        │                                             ║
  ║    duplicado?──sim──> [responder 200, encerrar]      ║
  ║        │                                             ║
  ║       nao                                            ║
  ║        │                                             ║
  ║  [validate_signature]                                ║
  ║        │                                             ║
  ║    invalida?──sim──> [log_payload] -> [rejeitar 401] ║
  ║        │                                             ║
  ║      valida                                          ║
  ║        │                                             ║
  ║  [find_order]                                        ║
  ║        │                                             ║
  ║  [update_status -> "pago"]                           ║
  ║        │                                             ║
  ║  [send_email]                                        ║
  ║        │                                             ║
  ║    falhou?──sim──> [retry 3x backoff]                ║
  ║        │                  │                          ║
  ║       ok             falhou 3x?                      ║
  ║        │                  │                          ║
  ║      [FIM]          [alerta_critico]                 ║
  ║                                                      ║
  ║  RESTRICOES                                          ║
  ║  ├ timeout: 60s                                      ║
  ║  ├ assinatura: obrigatoria                           ║
  ║  ├ idempotencia: por event_id                        ║
  ║  ├ retry email: 3x, backoff exponencial              ║
  ║  └ audit: completo                                   ║
  ║                                                      ║
  ║  EVIDENCIA REGISTRADA                                ║
  ║  payload_recebido, resultado_validacao,              ║
  ║  order_id_atualizado, email_id_enviado               ║
  ║  Retencao: 90 dias                                   ║
  ║                                                      ║
  ╚══════════════════════════════════════════════════════╝

  [r]aw  [h]istory  [d]iff  [e]xplain  [q]uit
```

### 2.10 `siml export <arquivo> --format json|yaml`

Exporta contrato para formato consumivel por outras ferramentas.

```
$ siml export .siml/contracts/webhook-stripe-payment.siml --format json

  Exportando para JSON...

  Salvo: .siml/exports/webhook-stripe-payment.json

$ siml export .siml/contracts/webhook-stripe-payment.siml --format yaml

  Exportando para YAML...

  Salvo: .siml/exports/webhook-stripe-payment.yaml

$ siml export --all --format json

  Exportando 3 contratos para JSON...

  .siml/exports/webhook-stripe-payment.json
  .siml/exports/cadastro-cliente.json
  .siml/exports/relatorio-diario.json

  3 contratos exportados.
```

### 2.11 `siml test <arquivo>`

Simula execucao do contrato com dados de teste gerados ou fornecidos.

```
$ siml test .siml/contracts/webhook-stripe-payment.siml

  Gerando dados de teste para webhook-stripe-payment...

  ╭─ Cenario 1: Pagamento valido ───────────────────────╮
  │                                                     │
  │  INPUT                                              │
  │  POST /webhook/stripe-payment                       │
  │  Stripe-Signature: t=1710...,v1=abc...              │
  │  Body: { type: "checkout.session.completed",        │
  │          data: { amount: 9700, order_id: "ORD-1" }} │
  │                                                     │
  │  EXECUCAO SIMULADA                                  │
  │  [1] check_idempotency    OK  (event_id novo)       │
  │  [2] validate_signature   OK  (assinatura valida)   │
  │  [3] find_order           OK  (ORD-1 encontrado)    │
  │  [4] update_status        OK  (status -> "pago")    │
  │  [5] send_email           OK  (email simulado)      │
  │                                                     │
  │  OUTPUT: 200 OK                                     │
  │  RESULTADO: SUCESSO                                 │
  ╰─────────────────────────────────────────────────────╯

  ╭─ Cenario 2: Assinatura invalida ────────────────────╮
  │                                                     │
  │  INPUT                                              │
  │  POST /webhook/stripe-payment                       │
  │  Stripe-Signature: t=1710...,v1=INVALIDO            │
  │  Body: { ... }                                      │
  │                                                     │
  │  EXECUCAO SIMULADA                                  │
  │  [1] check_idempotency    OK  (event_id novo)       │
  │  [2] validate_signature   FALHA (sig invalida)      │
  │  [3] log_payload          OK  (registrado)          │
  │  [4] rejeitar             OK  (401)                 │
  │                                                     │
  │  OUTPUT: 401 Unauthorized                           │
  │  RESULTADO: REJEICAO CORRETA                        │
  ╰─────────────────────────────────────────────────────╯

  ╭─ Cenario 3: Evento duplicado ───────────────────────╮
  │                                                     │
  │  INPUT                                              │
  │  POST /webhook/stripe-payment                       │
  │  (mesmo event_id do cenario 1)                      │
  │                                                     │
  │  EXECUCAO SIMULADA                                  │
  │  [1] check_idempotency    DUPLICADO (ja processado) │
  │  [2] responder 200        OK                        │
  │                                                     │
  │  OUTPUT: 200 OK (sem processamento)                 │
  │  RESULTADO: IDEMPOTENCIA CORRETA                    │
  ╰─────────────────────────────────────────────────────╯

  ╭─ Cenario 4: Falha de email com retry ───────────────╮
  │                                                     │
  │  INPUT                                              │
  │  POST /webhook/stripe-payment                       │
  │  (pagamento valido, email service fora do ar)       │
  │                                                     │
  │  EXECUCAO SIMULADA                                  │
  │  [1] check_idempotency    OK                        │
  │  [2] validate_signature   OK                        │
  │  [3] find_order           OK                        │
  │  [4] update_status        OK                        │
  │  [5] send_email           FALHA (tentativa 1)       │
  │  [6] send_email           FALHA (tentativa 2, +2s)  │
  │  [7] send_email           FALHA (tentativa 3, +4s)  │
  │  [8] alerta_critico       OK (alerta gerado)        │
  │                                                     │
  │  OUTPUT: 200 OK (pedido atualizado, email falhou)   │
  │  RESULTADO: DEGRADACAO GRACEFUL                     │
  ╰─────────────────────────────────────────────────────╯

  4 cenarios executados. 4 comportamentos corretos.
  Cobertura de fluxo: 100% (todos os caminhos testados)
```

Com dados customizados:

```
$ siml test webhook-stripe-payment.siml --input test-data.json
$ siml test webhook-stripe-payment.siml --scenario "pedido inexistente"
```

### 2.12 `siml serve`

Inicia o runtime engine localmente, carregando todos os contratos do diretorio.

```
$ siml serve

  Carregando contratos...
    webhook-stripe-payment.siml  [OK]
    cadastro-cliente.siml        [OK]
    relatorio-diario.siml        [ERRO] referencia nao resolvida

  2 de 3 contratos carregados.

  SIML Runtime Engine v0.4.0
  ──────────────────────────

  Endpoints ativos:
    POST /webhook/stripe-payment    <- webhook-stripe-payment
    POST /api/customers             <- cadastro-cliente
    GET  /api/customers/:id         <- cadastro-cliente

  Triggers ativos:
    (nenhum — relatorio-diario nao carregou)

  Dashboard: http://localhost:3000
  API:       http://localhost:8080

  Logs em tempo real (Ctrl+C para encerrar):

  [10:30:01] ENGINE  Aguardando requests...
  [10:30:15] POST /api/customers -> cadastro-cliente
             200 OK (142ms) | customer_id: cust_abc123
  [10:31:02] POST /webhook/stripe-payment -> webhook-stripe
             200 OK (89ms) | order ORD-1 -> pago | email enviado
```

---

## 3. Estrutura de Diretorio

### 3.1 Layout Completo

```
projeto/
├── .siml/
│   ├── config.siml              -- configuracao global do projeto
│   ├── contracts/               -- contratos de negocio
│   │   ├── webhook-stripe.siml
│   │   ├── cadastro-cliente.siml
│   │   └── relatorio-diario.siml
│   ├── schemas/                 -- definicoes de entidades
│   │   ├── customer.schema.siml
│   │   └── order.schema.siml
│   ├── templates/               -- templates reutilizaveis
│   │   ├── webhook.template.siml
│   │   └── crud.template.siml
│   ├── evidence/                -- rastros de execucao
│   │   └── 2026-03-13/
│   │       ├── webhook-stripe-exec-001.evidence.siml
│   │       ├── webhook-stripe-exec-002.evidence.siml
│   │       └── cadastro-cliente-exec-001.evidence.siml
│   ├── exports/                 -- contratos exportados para JSON/YAML
│   │   └── webhook-stripe-payment.json
│   └── .history/                -- historico de refinamentos
│       ├── webhook-stripe.history
│       ├── cadastro-cliente.history
│       └── relatorio-diario.history
```

### 3.2 Funcao de Cada Diretorio e Arquivo

**`.siml/config.siml`** — Configuracao do projeto. Define provedor LLM, modelo, dominio, restricoes padrao. Lido por todos os comandos. Um contrato herda defaults daqui.

**`.siml/contracts/`** — Diretorio principal. Cada arquivo `.siml` e um contrato de negocio autonomo. O engine carrega todos os contratos deste diretorio ao iniciar. Nome do arquivo = slug do contrato.

**`.siml/schemas/`** — Definicoes reutilizaveis de entidades. Quando um contrato referencia `tipo: referencia(pedido.id)`, o validador busca aqui. Funciona como types compartilhados entre contratos.

**`.siml/templates/`** — Contratos parciais que servem de ponto de partida para `siml new --from-template`. Nao sao executados diretamente — sao esqueletos.

**`.siml/evidence/`** — Rastros de execucao gerados pelo runtime. Organizados por data. Cada arquivo registra o que aconteceu em uma execucao especifica: inputs, decisoes, outputs, tempos. Imutaveis apos criacao.

**`.siml/exports/`** — Saida do comando `siml export`. Contratos convertidos para JSON ou YAML para consumo por ferramentas externas, pipelines CI/CD ou documentacao.

**`.siml/.history/`** — Historico de refinamentos. Cada arquivo registra todas as versoes de um contrato, quem pediu a mudanca (em linguagem natural), e qual foi o diff semantico. Usado por `siml diff` para navegar versoes.

### 3.3 Convencoes de Nomenclatura

```
  TIPO                  PADRAO                     EXEMPLO
  ─────────────────────────────────────────────────────────────
  Contrato              slug-kebab.siml            webhook-stripe.siml
  Schema                nome.schema.siml           customer.schema.siml
  Template              nome.template.siml         webhook.template.siml
  Evidencia             slug-exec-NNN.evidence.siml  webhook-stripe-exec-001.evidence.siml
  Historico             slug.history               webhook-stripe.history
  Exportacao            slug.json ou slug.yaml     webhook-stripe.json
```

---

## 4. Fluxo de Refinamento

### 4.1 Diagrama Completo

```
  ┌──────────────────────────────────────────────────────────┐
  │                                                          │
  │  [1] HUMANO EXPRESSA INTENCAO                            │
  │      "Quero um endpoint que recebe pagamento..."         │
  │                                                          │
  │                        │                                 │
  │                        v                                 │
  │                                                          │
  │  [2] LLM INTERPRETA                                      │
  │      Analisa linguagem natural, extrai:                  │
  │      - tipo de contrato (webhook, cron, api, evento)     │
  │      - entidades mencionadas                             │
  │      - fluxo implicito                                   │
  │      - restricoes implicitas                             │
  │                                                          │
  │                        │                                 │
  │                        v                                 │
  │                                                          │
  │  [3] LLM GERA SIML DRAFT                                │
  │      Produz contrato SIML completo seguindo a            │
  │      gramatica formal e os templates do dominio.         │
  │                                                          │
  │                        │                                 │
  │                        v                                 │
  │                                                          │
  │  [4] PARSER VALIDA ESTRUTURA                       ◄─┐  │
  │      - Sintaxe SIML correta?                         │  │
  │      - Entidades bem tipadas?                        │  │
  │      - Fluxos sem ciclos ou dead ends?               │  │
  │      - Referencias resolviveis?                      │  │
  │                                                      │  │
  │          │                      │                    │  │
  │        VALIDO               INVALIDO                 │  │
  │          │                      │                    │  │
  │          v                      v                    │  │
  │                                                      │  │
  │  [5] APRESENTA RESUMO    REPROMPT AUTOMATICO ────────┘  │
  │      Mostra ao humano     (humano nao ve a falha;       │
  │      em linguagem         LLM corrige e tenta           │
  │      natural, nao SIML.   novamente, ate 3x)            │
  │                                                          │
  │                        │                                 │
  │                        v                                 │
  │                                                          │
  │  [6] HUMANO DECIDE                                       │
  │      - "ok" → vai para [9]                               │
  │      - descreve mudancas → vai para [7]                  │
  │      - "cancel" → descarta tudo                          │
  │      - "show raw" → mostra SIML e volta para [6]        │
  │                                                          │
  │                        │                                 │
  │                        v                                 │
  │                                                          │
  │  [7] LLM AJUSTA CONTRATO                                │
  │      Recebe: contrato atual + feedback em linguagem      │
  │      natural. Gera novo SIML com mudancas.               │
  │                                                          │
  │                        │                                 │
  │                        v                                 │
  │                                                          │
  │  [8] VOLTA PARA [4]                                      │
  │      Parser valida o SIML ajustado.                      │
  │      Apresenta diff ao humano. Loop.                     │
  │                                                          │
  │                        │                                 │
  │                        v                                 │
  │                                                          │
  │  [9] HUMANO CONFIRMA                                     │
  │      Contrato salvo em .siml/contracts/                  │
  │      Versao incrementada. Historico registrado.           │
  │                                                          │
  └──────────────────────────────────────────────────────────┘
```

### 4.2 Regras do Fluxo

**Reprompt automatico**: Se o LLM gera SIML sintaticamente invalido, a CLI faz reprompt silencioso. O humano nunca ve SIML quebrado. Limite de 3 tentativas — apos isso, mostra mensagem de erro generica e pede ao humano para reformular.

**Versionamento**: Cada refinamento incrementa a versao minor (1.0 -> 1.1 -> 1.2). Mudancas na intencao fundamental incrementam a major (1.2 -> 2.0). O LLM decide qual incremento, baseado na magnitude da mudanca.

**Historico**: Cada refinamento e registrado em `.history` com:
- Timestamp
- Input do humano (linguagem natural exata)
- Diff semantico (o que mudou, nao o texto)
- Versao anterior e nova

**Cancelamento**: `cancel` em qualquer momento descarta a sessao inteira. Se estava refinando contrato existente, a versao anterior permanece intacta.

---

## 5. Visualizacao no Terminal

### 5.1 Modo Resumo (padrao)

O modo padrao ao apresentar um contrato. Mostra a intencao e restricoes em linguagem natural, sem sintaxe SIML.

```
  ╭─ webhook-stripe-payment v1.2 ───────────────────────╮  <- borda ciano
  │                                                     │
  │  INTENCAO                                 [verde]   │
  │  Processar webhook Stripe. Validar assinatura,      │
  │  atualizar pedido, notificar cliente.               │
  │                                                     │
  │  TRIGGER                                [amarelo]   │
  │  POST /webhook/stripe-payment                       │
  │                                                     │
  │  ENTIDADES                                [ciano]   │
  │  payment, order, customer                           │
  │                                                     │
  │  RESTRICOES                             [magenta]   │
  │  Assinatura obrigatoria, timeout 60s,               │
  │  retry email 3x, idempotente                        │
  │                                                     │
  ╰─────────────────────────────────────────────────────╯
```

### 5.2 Modo Completo (SIML cru)

Ativado com `show raw` ou `siml inspect --raw`. Mostra o SIML com syntax highlighting via cores ANSI.

```
  @contrato "webhook.stripe.payment"             [azul brilhante]
  @versao "1.2.0"                                [azul brilhante]
  @dominio comercial.pagamentos                  [azul brilhante]

  intencao {                                     [verde]
    objetivo: "processar webhook de pagamento"   [verde]
    contexto: "e-commerce"                       [verde]
  }                                              [verde]

  trigger {                                      [amarelo]
    tipo: http_post                              [amarelo]
    rota: "/webhook/stripe-payment"              [amarelo, string=laranja]
  }                                              [amarelo]

  entidade pagamento_stripe {                    [ciano]
    event_type -> tipo: texto                    [ciano, tipo=branco]
    amount     -> tipo: monetario_brl            [ciano, tipo=branco]
  }                                              [ciano]

  fluxo principal {                              [branco]
    passo validate_signature {                   [branco, nome=amarelo]
      acao: verificar_assinatura(...)            [branco]
      falha -> log_and_reject                    [vermelho]
    }
  }

  restricoes {                                   [magenta]
    timeout: 60s                                 [magenta, valor=branco]
    retry_email: { tentativas: 3 }               [magenta, valor=branco]
  }
```

### 5.3 Modo Diff

Ativado com `siml diff`. Usa convencoes familiares de +/- com cores.

```
  ╭─ Diff: v1.0 -> v1.2 ───────────────────────────────╮
  │                                                     │
  │   restricoes {                                      │
  │ -   timeout: 30s                       [vermelho]   │
  │ +   timeout: 60s                       [verde]      │
  │ +   retry_email: {                     [verde]      │
  │ +     tentativas: 3                    [verde]      │
  │ +     backoff: exponencial             [verde]      │
  │ +   }                                  [verde]      │
  │ +   idempotencia: por event_id         [verde]      │
  │   }                                                 │
  │                                                     │
  │   fluxo principal {                                 │
  │ +   passo check_idempotency {          [verde]      │
  │ +     acao: verificar_duplicata(...)   [verde]      │
  │ +     duplicado -> responder(200)      [verde]      │
  │ +   }                                  [verde]      │
  │     passo validate_signature {                      │
  │ ~     falha -> log_and_reject          [amarelo]    │
  │     }                                               │
  │   }                                                 │
  │                                                     │
  │ + fluxo log_and_reject {               [verde]      │
  │ +   passo log_payload { ... }          [verde]      │
  │ +   passo rejeitar { ... }             [verde]      │
  │ + }                                    [verde]      │
  │                                                     │
  ╰─────────────────────────────────────────────────────╯
```

### 5.4 Indicadores Visuais

```
  SIMBOLO   SIGNIFICADO                COR
  ──────────────────────────────────────────
  [OK]      Validacao passou           verde
  [ERRO]    Validacao falhou           vermelho
  [AVISO]   Potencial problema         amarelo
  +         Linha/secao adicionada     verde brilhante
  -         Linha/secao removida       vermelho brilhante
  ~         Linha/secao modificada     amarelo brilhante
  ->        Fluxo de dados/execucao    branco
  =>        Implicacao/consequencia    ciano
  |         Alternativa/branch         magenta
```

---

## 6. Integracao com LLM

### 6.1 Provedor e Modelo

A CLI suporta multiplos provedores, configurados em `.siml/config.siml`:

```
  PROVEDOR      MODELO RECOMENDADO        USO
  ─────────────────────────────────────────────────────────
  Anthropic     claude-sonnet-4-20250514           Padrao, melhor relacao custo/qualidade
  Anthropic     claude-opus-4-20250514            Contratos complexos, composicao
  OpenAI        gpt-4o                  Alternativa
  Local         ollama/llama3           Offline, sem custo, menor qualidade
```

Configuracao:

```
# .siml/config.siml
@C siml-config 1.0
provider claude
model claude-sonnet-4-20250514
api_key_env ANTHROPIC_API_KEY    -- le da variavel de ambiente, nunca do arquivo
fallback_provider openai         -- se o primario falhar
fallback_model gpt-4o
```

### 6.2 Prompt Engineering

O prompt enviado ao LLM tem estrutura fixa com secoes variaveis:

```
SYSTEM PROMPT (fixo):
───────────────────────────────────────────────────────────────

Voce e um tradutor de intencao humana para contratos SIML.

Regras:
1. Gere APENAS SIML valido. Nao inclua explicacoes fora do contrato.
2. Use a gramatica SIML fornecida abaixo.
3. Extraia intencao, entidades, fluxo e restricoes do input humano.
4. Se algo for ambiguo, escolha a interpretacao mais segura
   e adicione um comentario "# ASSUMIDO: <razao>".
5. Sempre inclua secao de evidencia.
6. Respeite os defaults do dominio fornecido.

Gramatica SIML:
<gramatica PEG completa aqui>

Dominio: {dominio_do_config}
Defaults: {defaults_do_config}
Schemas existentes: {lista de schemas em .siml/schemas/}
Contratos existentes: {lista de contratos em .siml/contracts/}

───────────────────────────────────────────────────────────────

USER PROMPT (variavel):
───────────────────────────────────────────────────────────────

Crie um contrato SIML para:
"{input do humano}"

───────────────────────────────────────────────────────────────
```

Para refinamentos, o prompt muda:

```
USER PROMPT (refinamento):
───────────────────────────────────────────────────────────────

Contrato atual:
```siml
{contrato SIML atual completo}
```

O humano pediu as seguintes mudancas:
"{input do humano}"

Gere o contrato atualizado com as mudancas aplicadas.
Incremente a versao. Adicione @refinado_por humano.

───────────────────────────────────────────────────────────────
```

### 6.3 Few-Shot Examples

O prompt inclui 2-3 exemplos embutidos para calibrar o formato:

```
EXEMPLO 1 (embutido no system prompt):
───────────────────────────────────────────────────────────────

Input humano: "Quero um CRUD de produtos com nome, preco e categoria"

Saida esperada:
@contrato "produto.crud"
@versao "1.0.0"
@dominio comercial.catalogo
@gerado_por tradutor:claude-sonnet@4

intencao {
  objetivo: "gerenciar catalogo de produtos"
  contexto: "operacoes CRUD basicas"
}

entidade produto {
  id         -> tipo: uuid_v7, gerado: automatico
  nome       -> tipo: texto, min: 1, max: 200
  preco      -> tipo: monetario_brl, min: 0
  categoria  -> tipo: texto, min: 1, max: 100
  criado_em  -> tipo: datetime_utc, gerado: automatico
}

operacoes {
  criar    -> POST   /api/produtos        -> requer: [nome, preco, categoria]
  listar   -> GET    /api/produtos        -> paginado: true
  buscar   -> GET    /api/produtos/:id
  atualizar -> PUT   /api/produtos/:id    -> requer: [nome, preco, categoria]
  remover  -> DELETE /api/produtos/:id    -> soft_delete: true
}

restricoes {
  autenticacao: obrigatoria
  audit: completo
}

evidencia {
  registrar: [operacao, usuario, timestamp, dados_antes, dados_depois]
}

───────────────────────────────────────────────────────────────

EXEMPLO 2 (embutido no system prompt):
───────────────────────────────────────────────────────────────

Input humano: "Todo dia as 6h da manha, gera relatorio de vendas
               do dia anterior e envia por email pro gerente"

Saida esperada:
@contrato "relatorio.vendas.diario"
@versao "1.0.0"
@dominio comercial.relatorios
@gerado_por tradutor:claude-sonnet@4

intencao {
  objetivo: "gerar e enviar relatorio diario de vendas"
  contexto: "relatorio automatico para gestao"
  principio: "mesmo sem vendas, envia relatorio vazio
              com nota explicativa"
}

trigger {
  tipo: cron
  expressao: "0 6 * * *"
  timezone: "America/Sao_Paulo"
}

fluxo principal {
  passo coletar_dados {
    acao: consultar(vendas, periodo: "dia_anterior")
  }
  passo gerar_relatorio {
    acao: formatar(template: "relatorio_vendas_diario",
                   dados: vendas_coletadas)
  }
  passo enviar {
    acao: enviar_email(
      para: config("email_gerente"),
      assunto: "Vendas {data_anterior}",
      corpo: relatorio_gerado
    )
    falha -> retry(3, backoff: exponencial)
  }
}

restricoes {
  timeout: 120s
  retry_email: { tentativas: 3, backoff: exponencial }
}

evidencia {
  registrar: [vendas_coletadas, relatorio_gerado,
              email_enviado, duracao_total]
  retencao: 365 dias
}

───────────────────────────────────────────────────────────────
```

### 6.4 Validacao Pos-Geracao

Depois que o LLM retorna o SIML, o parser local valida antes de mostrar ao humano:

```
  LLM retorna SIML
        │
        v
  [Parser PEG]
        │
    valido? ─── sim ──> apresenta resumo ao humano
        │
       nao
        │
        v
  [Extrair erros de sintaxe]
        │
        v
  [Reprompt automatico]
  "O SIML gerado tem os seguintes erros:
   - linha 12: secao 'fluxo' sem chave de fechamento
   - linha 25: tipo 'monetario' nao existe (voce quis dizer 'monetario_brl'?)
   Corrija e gere novamente."
        │
        v
  [LLM corrige]
        │
        v
  [Parser PEG] ─── ate 3 tentativas
        │
    3 falhas
        │
        v
  [Mensagem ao humano]
  "Nao consegui gerar um contrato valido. Tente reformular
   sua descricao com mais detalhes."
```

### 6.5 Custos Estimados por Operacao

```
  OPERACAO             TOKENS (input+output)   CUSTO CLAUDE SONNET
  ──────────────────────────────────────────────────────────────────
  siml new             ~2000 + ~800            ~$0.01
  siml refine          ~3000 + ~1000           ~$0.015
  siml explain         ~1500 + ~500            ~$0.007
  siml compose         ~4000 + ~1200           ~$0.02
  siml test (gerir)    ~2500 + ~600            ~$0.012
  reprompt (falha)     ~3500 + ~800            ~$0.015
  ──────────────────────────────────────────────────────────────────
  Sessao tipica (new + 2 refines + explain): ~$0.05
```

---

## 7. Configuracao

### 7.1 Arquivo `config.siml`

```
@C siml-config 1.0

# Provedor LLM
provider claude
model claude-sonnet-4-20250514
api_key_env ANTHROPIC_API_KEY
fallback_provider openai
fallback_model gpt-4o

# Dominio do projeto
domain e-commerce
language pt-BR

# Defaults aplicados a todos os contratos
default_constraints
  audit_all true
  max_retry 3
  timeout 30s
  autenticacao obrigatoria

# Convencoes de nomenclatura
naming
  entidades singular_snake     # pedido, cliente, produto
  rotas plural_kebab           # /api/produtos, /api/clientes
  contratos slug_kebab         # webhook-stripe, cadastro-cliente

# Evidencia
evidence
  retencao 90d
  formato siml
  compressao true

# Runtime
runtime
  porta 8080
  dashboard_porta 3000
  hot_reload true
  log_level info
```

### 7.2 Variaveis de Ambiente

```
  VARIAVEL                 DESCRICAO                        OBRIGATORIA
  ──────────────────────────────────────────────────────────────────────
  ANTHROPIC_API_KEY        Chave da API Anthropic           Sim (se provider=claude)
  OPENAI_API_KEY           Chave da API OpenAI              Sim (se provider=openai)
  SIML_CONFIG_PATH         Caminho alternativo do config    Nao (default: .siml/)
  SIML_LOG_LEVEL           Nivel de log (debug/info/warn)   Nao (default: info)
  SIML_OFFLINE             Desabilita chamadas LLM          Nao (default: false)
```

### 7.3 Configuracao por Contrato

Cada contrato pode sobrescrever defaults do config:

```
@contrato "webhook.stripe"
@versao "1.0.0"
@config_override
  timeout 60s            -- sobrescreve o default de 30s
  model claude-opus-4-20250514  -- usa modelo mais potente para este contrato
```

---

## 8. Sessao Completa: Do Zero ao Sistema

Uma narrativa de terminal mostrando a criacao de um mini-sistema de e-commerce com 3 contratos interconectados.

### 8.1 Inicializacao

```
$ siml init

  ╔══════════════════════════════════════════════════╗
  ║  SIML v0.1 — Inicializacao                       ║
  ╚══════════════════════════════════════════════════╝

  Dominio do projeto:
  > e-commerce

  Provedor LLM:
  > claude

  Modelo:
  > claude-sonnet-4-20250514

  Criando estrutura...

    .siml/config.siml
    .siml/contracts/
    .siml/schemas/
    .siml/evidence/
    .siml/templates/
    .siml/.history/

  Configuracao salva em .siml/config.siml

  Pronto. Execute `siml new` para criar seu primeiro contrato.
```

### 8.2 Contrato 1: Cadastro de Cliente

```
$ siml new

  ╔══════════════════════════════════════════════════╗
  ║  SIML Contract Builder v0.1                      ║
  ║  Dominio: e-commerce                             ║
  ╚══════════════════════════════════════════════════╝

  Descreva o que voce precisa:

  > Preciso cadastrar clientes. Nome, email (unico), telefone
  > opcional. Quando cadastrar, envia email de boas vindas.
  > Preciso buscar por id e listar todos com paginacao.

  Interpretando...

  Entendi:
    Tipo: CRUD + acao pos-criacao
    Entidade: cliente (nome, email, telefone)
    Operacoes: criar, buscar, listar
    Pos-criacao: email de boas vindas
    Restricoes: email unico

  Correto? (s/n/refine)
  > s

  Gerando contrato...

  ╭─ CONTRATO: cadastro-cliente v1.0 ───────────────────╮
  │                                                     │
  │  INTENCAO                                           │
  │  Gerenciar cadastro de clientes com notificacao     │
  │  automatica de boas vindas.                         │
  │                                                     │
  │  ENTIDADE: cliente                                  │
  │  ├ id (uuid, auto)                                  │
  │  ├ nome (texto, obrigatorio)                        │
  │  ├ email (email, unico, obrigatorio)                │
  │  ├ telefone (texto, opcional)                       │
  │  └ criado_em (datetime, auto)                       │
  │                                                     │
  │  OPERACOES                                          │
  │  ├ POST   /api/clientes          criar              │
  │  ├ GET    /api/clientes/:id      buscar             │
  │  └ GET    /api/clientes          listar (paginado)  │
  │                                                     │
  │  POS-CRIACAO                                        │
  │  └ Enviar email de boas vindas                      │
  │                                                     │
  │  RESTRICOES                                         │
  │  ├ Email unico no sistema                           │
  │  ├ Autenticacao obrigatoria                         │
  │  └ Audit completo                                   │
  │                                                     │
  ╰─────────────────────────────────────────────────────╯

  Refinar?
  > ok

  Contrato salvo: .siml/contracts/cadastro-cliente.siml
  Schema gerado: .siml/schemas/cliente.schema.siml
```

### 8.3 Contrato 2: Webhook de Pagamento

```
$ siml new

  Descreva o que voce precisa:

  > Webhook do Stripe pra quando o pagamento e confirmado.
  > Valida assinatura, encontra o pedido pelo metadata do Stripe,
  > marca como pago e avisa o cliente por email.

  Interpretando...

  Entendi:
    Tipo: webhook receiver
    Fonte: Stripe (checkout.session.completed)
    Fluxo: validar -> buscar pedido -> atualizar -> notificar
    Entidades: pagamento (Stripe), pedido, cliente (existente)

  Correto? (s/n/refine)
  > sim, mas adiciona idempotencia e retry no email

  Refinando interpretacao...

  ╭─ CONTRATO: webhook-stripe-payment v1.0 ─────────────╮
  │                                                     │
  │  INTENCAO                                           │
  │  Processar webhook Stripe de pagamento confirmado.  │
  │                                                     │
  │  TRIGGER                                            │
  │  POST /webhook/stripe-payment                       │
  │                                                     │
  │  ENTIDADES                                          │
  │  ├ pagamento_stripe (event_id, amount, order_id)    │
  │  ├ pedido (referencia existente)                    │
  │  └ cliente (referencia existente)                   │
  │                                                     │
  │  FLUXO                                              │
  │  check_idempotency -> validate_signature            │
  │    -> find_order -> update_status -> send_email     │
  │                                                     │
  │  RESTRICOES                                         │
  │  ├ Assinatura Stripe obrigatoria                    │
  │  ├ Idempotencia por event_id                        │
  │  ├ Retry email 3x (backoff exponencial)             │
  │  ├ Timeout 60s                                      │
  │  └ Log payload se assinatura invalida               │
  │                                                     │
  ╰─────────────────────────────────────────────────────╯

  Refinar?
  > ok

  Contrato salvo: .siml/contracts/webhook-stripe-payment.siml
  Schema gerado: .siml/schemas/pedido.schema.siml

  Nota: contrato referencia entidade "cliente" de
  .siml/schemas/cliente.schema.siml (ja existente).
```

### 8.4 Contrato 3: Relatorio Diario

```
$ siml new

  Descreva o que voce precisa:

  > Todo dia as 6h manda email pro gerente com resumo de vendas
  > do dia anterior. Total de pedidos, valor total, ticket medio,
  > lista dos maiores pedidos. Se nao teve venda, manda mesmo
  > assim avisando.

  Interpretando...

  Gerando contrato...

  ╭─ CONTRATO: relatorio-vendas-diario v1.0 ────────────╮
  │                                                     │
  │  INTENCAO                                           │
  │  Gerar e enviar relatorio automatico de vendas.     │
  │                                                     │
  │  TRIGGER                                            │
  │  Cron: todo dia as 06:00 (America/Sao_Paulo)       │
  │                                                     │
  │  DADOS COLETADOS                                    │
  │  ├ Total de pedidos (dia anterior)                  │
  │  ├ Valor total faturado                             │
  │  ├ Ticket medio                                     │
  │  └ Top 5 maiores pedidos                            │
  │                                                     │
  │  FLUXO                                              │
  │  coletar_dados -> calcular_metricas                 │
  │    -> gerar_relatorio -> enviar_email               │
  │                                                     │
  │  RESTRICOES                                         │
  │  ├ Envia mesmo com zero vendas (com nota)           │
  │  ├ Retry email 3x                                   │
  │  └ Timeout 120s                                     │
  │                                                     │
  ╰─────────────────────────────────────────────────────╯

  Refinar?
  > ok

  Contrato salvo: .siml/contracts/relatorio-vendas-diario.siml
```

### 8.5 Composicao: Visualizando Conexoes

```
$ siml compose cadastro-cliente webhook-stripe-payment

  ╭─ Composicao ────────────────────────────────────────╮
  │                                                     │
  │  cadastro-cliente                                   │
  │    CRIA: cliente (id, nome, email)                  │
  │                                                     │
  │         │                                           │
  │         │ cliente.id referenciado por                │
  │         v                                           │
  │                                                     │
  │  webhook-stripe-payment                             │
  │    LE: cliente (para enviar email de confirmacao)    │
  │    ATUALIZA: pedido (status -> pago)                │
  │                                                     │
  │  DEPENDENCIA: webhook depende de cadastro           │
  │  (cliente deve existir para receber notificacao)    │
  ╰─────────────────────────────────────────────────────╯

$ siml compose webhook-stripe-payment relatorio-vendas-diario

  ╭─ Composicao ────────────────────────────────────────╮
  │                                                     │
  │  webhook-stripe-payment                             │
  │    ATUALIZA: pedido.status -> "pago"                │
  │                                                     │
  │         │                                           │
  │         │ pedidos com status="pago" alimentam       │
  │         v                                           │
  │                                                     │
  │  relatorio-vendas-diario                            │
  │    LE: pedidos (status=pago, periodo=dia_anterior)  │
  │    GERA: metricas agregadas                         │
  │                                                     │
  │  DEPENDENCIA: relatorio consome dados do webhook    │
  │  (pedidos marcados como pagos aparecem no relatorio)│
  ╰─────────────────────────────────────────────────────╯

$ siml compose --all

  ╭─ Grafo do Sistema ──────────────────────────────────╮
  │                                                     │
  │  [cadastro-cliente]                                 │
  │        │                                            │
  │        │ cria: cliente                              │
  │        v                                            │
  │  [webhook-stripe-payment]                           │
  │        │                                            │
  │        │ atualiza: pedido.status                    │
  │        v                                            │
  │  [relatorio-vendas-diario]                          │
  │        │                                            │
  │        │ agrega: pedidos pagos                      │
  │        v                                            │
  │  [email: gerente]                                   │
  │                                                     │
  │  ENTIDADES COMPARTILHADAS                           │
  │  ├ cliente  (criado por cadastro, lido por webhook) │
  │  └ pedido   (atualizado por webhook, lido por       │
  │              relatorio)                             │
  │                                                     │
  │  FLUXO DO SISTEMA                                   │
  │  1. Cliente se cadastra (cadastro-cliente)          │
  │  2. Cliente faz pedido e paga via Stripe            │
  │  3. Stripe envia webhook (webhook-stripe-payment)   │
  │  4. Sistema atualiza pedido e avisa cliente         │
  │  5. Todo dia, relatorio agrega vendas e envia       │
  │     pro gerente (relatorio-vendas-diario)           │
  ╰─────────────────────────────────────────────────────╯
```

### 8.6 Validacao Geral

```
$ siml validate --all

  Validando 3 contratos...

  cadastro-cliente.siml          [VALIDO]  0 erros, 0 avisos
  webhook-stripe-payment.siml    [VALIDO]  0 erros, 1 aviso
  relatorio-vendas-diario.siml   [VALIDO]  0 erros, 0 avisos

  Avisos:
    webhook-stripe-payment.siml
      Rota /webhook/stripe-payment sem rate_limit explicito.
      Usando default: 100 req/min.

  Validacao cruzada:
    Referencias entre contratos      [OK]
    Schemas necessarios existem      [OK]
    Sem conflitos de rotas           [OK]
    Sem ciclos de dependencia        [OK]

  Resultado: 3/3 contratos validos. Sistema coerente.
```

### 8.7 Servindo o Sistema

```
$ siml serve

  Carregando contratos...
    cadastro-cliente.siml          [OK]
    webhook-stripe-payment.siml    [OK]
    relatorio-vendas-diario.siml   [OK]

  3 de 3 contratos carregados.

  ╔══════════════════════════════════════════════════════╗
  ║  SIML Runtime Engine v0.4.0                          ║
  ╠══════════════════════════════════════════════════════╣
  ║                                                      ║
  ║  Endpoints ativos:                                   ║
  ║    POST /api/clientes             <- cadastro        ║
  ║    GET  /api/clientes/:id         <- cadastro        ║
  ║    GET  /api/clientes             <- cadastro        ║
  ║    POST /webhook/stripe-payment   <- webhook         ║
  ║                                                      ║
  ║  Triggers ativos:                                    ║
  ║    cron 06:00 America/Sao_Paulo   <- relatorio       ║
  ║                                                      ║
  ║  Dashboard: http://localhost:3000                     ║
  ║  API:       http://localhost:8080                     ║
  ║                                                      ║
  ╚══════════════════════════════════════════════════════╝

  [14:01:00] ENGINE  3 contratos carregados. Aguardando...
  [14:01:15] POST /api/clientes -> cadastro-cliente
             201 Created (95ms) | id: cust_7f3a...
             -> email boas vindas enviado
  [14:02:30] POST /api/clientes -> cadastro-cliente
             409 Conflict (12ms) | email ja cadastrado
  [14:05:12] POST /webhook/stripe-payment -> webhook-stripe
             200 OK (142ms) | pedido ORD-0042 -> pago
             -> email confirmacao enviado
  [14:05:13] POST /webhook/stripe-payment -> webhook-stripe
             200 OK (3ms) | idempotente: evento ja processado
```

---

## 9. Stack Tecnica da CLI

### 9.1 Decisao de Linguagem

```
  OPCAO          VANTAGENS                         DESVANTAGENS
  ───────────────────────────────────────────────────────────────────
  TypeScript     Ecossistema npm, facil distribuir  Depende de Node.js
  (recomendado)  Ink/React pra TUI rico            instalado
                 SDKs da Anthropic/OpenAI prontos
                 Mesmo ecossistema do runtime

  Rust           Binario unico, sem dependencias   Curva de aprendizado
                 Performance excelente              SDKs LLM menos maduros
                 Otimo para parser PEG             TUI libraries menos ricas

  Go             Binario unico, cross-compile      Ecossistema menor
                 Boa stdlib                        TUI razoavel (bubbletea)
```

Recomendacao: **TypeScript** para v1.0 (velocidade de desenvolvimento, ecossistema, reutilizacao com o runtime engine). Considerar port para Rust para distribuicao como binario standalone apos estabilizacao.

### 9.2 Dependencias Principais

```
  MODULO               BIBLIOTECA          FUNCAO
  ─────────────────────────────────────────────────────────────
  CLI framework        commander.js        Parsing de comandos e argumentos
  TUI rendering        Ink (React)         Componentes de terminal reativos
  Cores/estilo         chalk               Cores ANSI, bold, underline
  Caixas/bordas        boxen + cli-table3  Caixas decoradas, tabelas
  Spinner              ora                 Indicador de progresso
  Prompt interativo    inquirer            Input do humano
  LLM (Anthropic)      @anthropic-ai/sdk   Chamadas ao Claude
  LLM (OpenAI)         openai              Chamadas ao GPT
  Parser SIML          peggy (PEG.js)      Parser PEG customizado
  File system          fs-extra            Operacoes de arquivo
  Diff                 diff                Diff textual (base)
  Config               cosmiconfig         Leitura de config
  Versionamento        semver              Incremento de versao semantica
```

### 9.3 Estrutura do Projeto

```
siml-cli/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                 -- entry point, registra comandos
│   ├── commands/
│   │   ├── init.ts              -- siml init
│   │   ├── new.ts               -- siml new
│   │   ├── refine.ts            -- siml refine
│   │   ├── explain.ts           -- siml explain
│   │   ├── validate.ts          -- siml validate
│   │   ├── diff.ts              -- siml diff
│   │   ├── compose.ts           -- siml compose
│   │   ├── list.ts              -- siml list
│   │   ├── inspect.ts           -- siml inspect
│   │   ├── export.ts            -- siml export
│   │   ├── test.ts              -- siml test
│   │   └── serve.ts             -- siml serve
│   ├── core/
│   │   ├── parser/
│   │   │   ├── siml.peggy       -- gramatica PEG do SIML
│   │   │   ├── parser.ts        -- wrapper do parser gerado
│   │   │   └── validator.ts     -- validacao semantica pos-parse
│   │   ├── translator/
│   │   │   ├── translator.ts    -- interface generica
│   │   │   ├── claude.ts        -- implementacao Anthropic
│   │   │   ├── openai.ts        -- implementacao OpenAI
│   │   │   ├── local.ts         -- implementacao Ollama
│   │   │   └── prompts/
│   │   │       ├── system.ts    -- system prompt base
│   │   │       ├── new.ts       -- prompt para novo contrato
│   │   │       ├── refine.ts    -- prompt para refinamento
│   │   │       ├── explain.ts   -- prompt para explicacao
│   │   │       └── examples.ts  -- few-shot examples
│   │   ├── renderer/
│   │   │   ├── summary.tsx      -- modo resumo (Ink)
│   │   │   ├── raw.tsx          -- modo SIML cru com syntax highlight
│   │   │   ├── diff.tsx         -- modo diff colorido
│   │   │   ├── inspect.tsx      -- visualizacao completa interativa
│   │   │   └── colors.ts       -- mapa de cores por secao
│   │   ├── prompter/
│   │   │   ├── session.ts       -- gerencia sessao de conversa
│   │   │   ├── history.ts       -- leitura/escrita de historico
│   │   │   └── loop.ts         -- loop de refinamento
│   │   └── writer/
│   │       ├── contract.ts      -- salva .siml
│   │       ├── schema.ts        -- gera .schema.siml
│   │       ├── evidence.ts      -- grava evidencia
│   │       ├── history.ts       -- registra refinamento
│   │       └── export.ts        -- exporta json/yaml
│   ├── config/
│   │   ├── loader.ts            -- carrega .siml/config.siml
│   │   └── defaults.ts          -- valores padrao
│   └── utils/
│       ├── semver.ts            -- incremento de versao
│       ├── slug.ts              -- gera slug a partir de nome
│       └── logger.ts            -- log formatado
├── grammars/
│   └── siml.peggy               -- gramatica PEG (fonte)
└── tests/
    ├── parser.test.ts
    ├── translator.test.ts
    ├── validator.test.ts
    └── commands/
        ├── new.test.ts
        ├── refine.test.ts
        └── validate.test.ts
```

### 9.4 Distribuicao

```
  CANAL             COMANDO                   PUBLICO
  ─────────────────────────────────────────────────────────────
  npm (global)      npm install -g siml-cli    Devs com Node.js
  npx (sem install) npx siml-cli new           Teste rapido
  Binario (pkg)     ./siml new                 Sem Node.js
  Docker            docker run siml/cli new    CI/CD
  Homebrew          brew install siml          macOS
```

---

## 10. Arquitetura Interna da CLI

### 10.1 Diagrama de Modulos

```
┌─────────────────────────────────────────────────────────────────┐
│                          CLI LAYER                               │
│                                                                  │
│  Responsabilidade: parsing de comandos, roteamento               │
│                                                                  │
│  ┌──────┐ ┌──────┐ ┌────────┐ ┌──────┐ ┌──────┐ ┌──────┐      │
│  │ new  │ │refine│ │validate│ │ diff │ │ list │ │ ...  │      │
│  └──┬───┘ └──┬───┘ └───┬────┘ └──┬───┘ └──┬───┘ └──┬───┘      │
│     │        │         │         │        │        │            │
└─────┼────────┼─────────┼─────────┼────────┼────────┼────────────┘
      │        │         │         │        │        │
      v        v         │         │        │        │
┌─────────────────────┐  │         │        │        │
│    PROMPTER         │  │         │        │        │
│                     │  │         │        │        │
│  Responsabilidade:  │  │         │        │        │
│  Gerenciar sessao   │  │         │        │        │
│  de conversa com    │  │         │        │        │
│  o humano. Loop     │  │         │        │        │
│  de refinamento.    │  │         │        │        │
│                     │  │         │        │        │
│  Input: texto livre │  │         │        │        │
│  Output: intencao   │  │         │        │        │
│  estruturada        │  │         │        │        │
│                     │  │         │        │        │
└────────┬────────────┘  │         │        │        │
         │               │         │        │        │
         v               │         │        │        │
┌─────────────────────┐  │         │        │        │
│    TRANSLATOR       │  │         │        │        │
│                     │  │         │        │        │
│  Responsabilidade:  │  │         │        │        │
│  Chamar LLM para    │  │         │        │        │
│  converter intencao │  │         │        │        │
│  em SIML.           │  │         │        │        │
│                     │  │         │        │        │
│  Provedores:        │  │         │        │        │
│  - Claude SDK       │  │         │        │        │
│  - OpenAI SDK       │  │         │        │        │
│  - Ollama (local)   │  │         │        │        │
│                     │  │         │        │        │
│  Input: prompt      │  │         │        │        │
│  Output: SIML text  │  │         │        │        │
│                     │  │         │        │        │
└────────┬────────────┘  │         │        │        │
         │               │         │        │        │
         v               v         v        │        │
┌───────────────────────────────────────┐   │        │
│    PARSER                             │   │        │
│                                       │   │        │
│  Responsabilidade:                    │   │        │
│  Parsear SIML text em AST.           │   │        │
│  Validar sintaxe (PEG grammar).      │   │        │
│  Validar semantica (tipos, refs).    │   │        │
│                                       │   │        │
│  Input: SIML text                    │   │        │
│  Output: AST validada ou erros       │   │        │
│                                       │   │        │
└────────┬──────────────────────────────┘   │        │
         │                                  │        │
         v                                  v        v
┌───────────────────────────────────────────────────────────┐
│    RENDERER                                                │
│                                                            │
│  Responsabilidade:                                         │
│  Transformar AST em visualizacao de terminal.              │
│  Multiplos modos: resumo, raw, diff, inspect.             │
│                                                            │
│  Input: AST + modo de visualizacao                        │
│  Output: texto formatado com cores ANSI                   │
│                                                            │
└────────┬──────────────────────────────────────────────────┘
         │
         v
┌───────────────────────────────────────────────────────────┐
│    WRITER                                                  │
│                                                            │
│  Responsabilidade:                                         │
│  Persistir contratos, schemas, evidencia, historico.       │
│  Gerenciar versionamento de arquivos.                      │
│                                                            │
│  Input: AST validada + metadados                          │
│  Output: arquivos em .siml/                               │
│                                                            │
└───────────────────────────────────────────────────────────┘
```

### 10.2 Fluxo de Dados por Comando

```
  COMANDO          MODULOS ACIONADOS (em ordem)
  ──────────────────────────────────────────────────────────────
  siml new         CLI -> Prompter -> Translator -> Parser
                   -> Renderer (resumo) -> Prompter (loop)
                   -> Writer

  siml refine      CLI -> Writer (leitura) -> Prompter
                   -> Translator -> Parser -> Renderer (diff)
                   -> Prompter (loop) -> Writer

  siml explain     CLI -> Writer (leitura) -> Parser
                   -> Translator (explain prompt) -> Renderer

  siml validate    CLI -> Writer (leitura) -> Parser
                   -> Renderer (resultado)

  siml diff        CLI -> Writer (leitura 2x) -> Parser (2x)
                   -> Renderer (diff)

  siml compose     CLI -> Writer (leitura 2x) -> Parser (2x)
                   -> Renderer (composicao)

  siml list        CLI -> Writer (scan diretorio)
                   -> Renderer (tabela)

  siml inspect     CLI -> Writer (leitura) -> Parser
                   -> Renderer (inspect interativo)

  siml export      CLI -> Writer (leitura) -> Parser
                   -> Writer (exportacao json/yaml)

  siml test        CLI -> Writer (leitura) -> Parser
                   -> Translator (gerar cenarios)
                   -> Renderer (resultado simulacao)

  siml serve       CLI -> Writer (scan) -> Parser (todos)
                   -> Runtime Engine (separado)
```

### 10.3 Interfaces entre Modulos

Cada modulo se comunica por tipos bem definidos:

```typescript
// Prompter -> Translator
interface TranslationRequest {
  mode: 'new' | 'refine' | 'explain';
  humanInput: string;
  existingContract?: string;      // SIML text (para refine)
  domainConfig: DomainConfig;
  schemas: SchemaRef[];
}

// Translator -> Parser
interface TranslationResult {
  simlText: string;               // SIML cru gerado pelo LLM
  tokensUsed: { input: number; output: number };
  model: string;
}

// Parser -> Renderer / Writer
interface ParsedContract {
  ast: ContractAST;               // Arvore sintatica abstrata
  metadata: ContractMetadata;     // @contrato, @versao, etc.
  entities: Entity[];
  flows: Flow[];
  constraints: Constraint[];
  evidence: EvidenceSpec;
  warnings: ValidationWarning[];
}

// Parser (erro) -> Translator (reprompt)
interface ParseError {
  line: number;
  column: number;
  message: string;
  suggestion?: string;
}
```

### 10.4 Principios de Design

**Separacao estrita**: Nenhum modulo conhece o modulo anterior ou posterior. A CLI orquestra, os modulos processam.

**LLM isolado no Translator**: O unico modulo que faz chamadas de rede ao LLM e o Translator. Parser, Renderer e Writer sao completamente deterministicos e offline.

**Parser como gatekeeper**: Todo SIML, vindo do LLM ou do disco, passa pelo Parser antes de chegar ao Renderer ou Writer. Nenhum SIML invalido e apresentado ao humano ou salvo em disco.

**Renderer sem estado**: O Renderer recebe AST e produz texto formatado. Nao mantem estado entre chamadas. Cada visualizacao e uma funcao pura.

**Writer idempotente**: Salvar o mesmo contrato duas vezes produz o mesmo resultado. Versionamento e gerenciado pelo Writer, nao pelo chamador.

---

## Resumo

A CLI `siml` e a interface principal entre humano e contratos SIML. O humano nunca precisa aprender a sintaxe SIML — ele conversa, e a maquina traduz. O fluxo de refinamento iterativo (intencao -> draft -> revisao -> refinamento -> confirmacao) garante que o contrato final reflete a intencao real. A separacao entre Prompter, Translator, Parser, Renderer e Writer permite evoluir cada parte independentemente: trocar de LLM sem mudar o parser, trocar o renderer sem mudar o translator, adicionar novos comandos sem mexer no core.

O resultado pratico: qualquer pessoa que sabe descrever o que precisa em portugues consegue produzir contratos SIML validos e executaveis.
