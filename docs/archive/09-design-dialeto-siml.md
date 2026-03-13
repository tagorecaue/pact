# 09 - Design Definitivo do Dialeto SIML

> Especificacao completa da sintaxe, gramatica, tipos e semantica do dialeto SIML — o formato textual que IAs usam para comunicar contratos semanticos entre si. Este documento e suficiente para implementar um parser.

---

## 1. Principios de Design

### 1.1 O publico-alvo nao e humano

SIML e um protocolo IA-para-IA. O fluxo de comunicacao e:

```
Humano (linguagem natural)
   |
   v
Tradutor (LLM grande — Claude, GPT, etc.)
   |
   v  <-- SIML trafega aqui
Executor (modelo compacto — Qwen, Phi, Mistral)
   |
   v  <-- SIML trafega aqui
Validador (sistema deterministico — parser + regras)
   |
   v
Evidencia (estruturada, auditavel)
```

O humano nunca precisa ler ou escrever SIML diretamente. Ele interage pela camada de intencao (chat em linguagem natural) e pela camada de evidencia (dashboard visual). O dialeto existe para que duas IAs — ou uma IA e um validador deterministico — interpretem o mesmo contrato sem ambiguidade.

Isso muda radicalmente as prioridades de design:

| Prioridade         | Para humanos   | Para SIML (IA-para-IA) |
|--------------------|----------------|------------------------|
| Legibilidade       | Critica        | Irrelevante            |
| Token-efficiency   | Irrelevante    | Critica                |
| Nao-ambiguidade    | Desejavel      | Obrigatoria            |
| Parseabilidade     | Nice-to-have   | Obrigatoria            |
| Familiaridade      | Critica        | Irrelevante            |
| Extensibilidade    | Desejavel      | Critica                |

### 1.2 Por que nao formatos existentes

**JSON** — verbose por design. Cada chave precisa de aspas duplas. Cada string precisa de aspas. Sem comentarios. Um contrato medio em JSON consome ~40% mais tokens que o necessario. Exemplo:

```json
{"contract":{"name":"customer.create","version":"1.0.0","domain":"commerce"}}
```

Tokens estimados (BPE cl100k_base): ~18 tokens.

**YAML** — ambiguidade de tipos e o problema fatal. `yes` e booleano ou string? `3.0` e float ou string? `null` vs `~` vs vazio? Dois LLMs diferentes podem interpretar o mesmo YAML de formas diferentes. Isso viola o principio fundamental de nao-ambiguidade. Alem disso, a sensibilidade a espacos vs tabs e uma fonte de erros silenciosos.

**S-expressions (Lisp-like)** — token-eficientes, nao-ambiguas, parseaveis. Candidato forte. O problema: profundidade de nesting. Um contrato real com 4-5 niveis de aninhamento produz cadeias de `)))))` que confundem a janela de atencao de LLMs menores. Modelos compactos (7B params) cometem erros de balanceamento de parenteses com frequencia mensuravel.

**XML/HTML** — overhead de tags duplicadas (abertura + fechamento) consome tokens sem carregar informacao. `<contract>...</contract>` usa 2 tokens para transmitir o que `@C` transmite em 1.

**Protocol Buffers / MessagePack** — binarios. Excelentes para transmissao maquina-maquina, mas LLMs operam sobre texto tokenizado. Um formato binario exigiria encode/decode antes e depois de cada inferencia, adicionando latencia e pontos de falha.

**TOML** — razoavelmente nao-ambiguo, mas tabelas aninhadas ficam verbosas. Sem expressividade para fluxos de execucao.

### 1.3 Justificativa para formato custom

A combinacao de requisitos — token-eficiente, nao-ambiguo, parseavel deterministicamente, com expressividade para fluxos de execucao — nao e atendida por nenhum formato existente. SIML precisa de:

1. Prefixos de secao compactos (1-2 caracteres)
2. Tipos implicitos por posicao (sem redundancia de declaracao)
3. Operadores simbolicos para fluxo (sem keywords verbosas)
4. Indentacao para hierarquia (sem delimitadores de bloco)
5. Referencia cruzada nativa entre contratos

Nenhum formato existente oferece os cinco simultaneamente.

### 1.4 Analise real de token-efficiency

Tokenizadores BPE (como cl100k_base do GPT-4 e o tokenizador do Claude) processam texto em subwords. O que realmente economiza tokens:

**Economias significativas:**
- Eliminar aspas em chaves: `name` vs `"name"` — economiza 1 token por campo. Em um contrato com 50 campos, sao 50 tokens.
- Prefixos de secao curtos: `@C` vs `contract:` ou `[contract]` — economiza 1-2 tokens por secao. Com 6 secoes obrigatorias, sao 6-12 tokens.
- Operadores simbolicos: `>` vs `then` ou `sequence` — economiza 1-3 tokens por operador de fluxo. Um contrato com 15 passos de execucao economiza 15-45 tokens.
- Sem delimitadores de bloco: eliminar `{` e `}` economiza 2 tokens por bloco. Com ~20 blocos por contrato, sao 40 tokens.

**Total estimado por contrato medio:** 110-150 tokens economizados vs JSON equivalente.

**Micro-otimizacoes inuteis (evitadas):**
- Abreviar nomes de campos para 1 caractere (`n` em vez de `name`) — economia de ~0.5 token por campo, mas torna o formato ininteligivel ate para IAs. LLMs dependem de tokens semanticos para manter coerencia.
- Remover espacos de indentacao — economia de 1-2 tokens por bloco, mas impede parsing por posicao. O custo de ambiguidade supera a economia.
- Usar encoding numerico para tipos — `1` em vez de `str` economiza 0 tokens (ambos sao 1 token) e perde todo o significado semantico.

**Regra pratica:** se a otimizacao prejudica a capacidade de um LLM de 7B parametros interpretar o contrato corretamente, ela nao vale a economia de tokens.

---

## 2. Anatomia do Formato

### 2.1 Extensao e encoding

- Extensao de arquivo: `.siml`
- Encoding: UTF-8 sem BOM
- Quebra de linha: `\n` (LF, nunca CRLF)
- Indentacao: 2 espacos (nunca tabs)

### 2.2 Estrutura geral

Um arquivo `.siml` e composto por:
1. Header de versao do dialeto (obrigatorio, primeira linha)
2. Secoes marcadas com `@` seguido de sigla
3. Campos dentro de cada secao, definidos por indentacao
4. Comentarios com `--`

```siml
siml v1

@C customer.create 1.0.0
  domain commerce.customers
  author tradutor:claude-opus@4
  created 2026-03-13T10:00:00Z

@I
  natural "Cadastrar novo cliente no sistema"
  goal customer.exists & customer.valid

@E
  name str
  email str
  doc opt[str]

@K
  email unique within customers
  email matches rfc5322
  doc ? doc matches cpf | doc matches cnpj

@X
  validate email > check_duplicate email
  >> create_stripe_customer email name
  >> persist customer
  >> emit customer.created

@V
  -- preenchido pos-execucao
```

### 2.3 Regras sintaticas fundamentais

**Prefixos de secao:** sempre `@` seguido de uma letra maiuscula. Ocupam uma linha propria. Podem ter argumentos na mesma linha.

```
@C nome versao          -- secao com argumentos posicionais
@I                      -- secao sem argumentos (conteudo indentado)
```

**Indentacao:** 2 espacos definem hierarquia. Cada nivel de indentacao cria um escopo filho.

```
@K
  email unique          -- nivel 1: constraint
    within customers    -- nivel 2: qualificador da constraint
    severity fatal      -- nivel 2: atributo da constraint
```

**Strings:** sem aspas quando nao contem espacos. Com aspas duplas quando contem espacos.

```
domain commerce             -- sem aspas: token unico
natural "Cadastrar cliente" -- com aspas: contem espaco
```

**Sem delimitadores de bloco:** nao existe `{`, `}`, `begin`, `end`. A hierarquia e inteiramente por indentacao. Isso elimina ambiguidade de escopo — o parser sabe exatamente onde cada bloco comeca e termina pela contagem de espacos.

**Comentarios:** `--` ate o fim da linha. Nao existe comentario de bloco.

```
-- isto e um comentario
@C transfer 1.0.0  -- isto tambem
```

**Referencias entre contratos:** prefixo `#` seguido do nome do contrato.

```
@D
  #customer.create >=1.0.0
  #payment.process >=2.0.0 <3.0.0
```

**Listas:** itens na mesma indentacao, um por linha, sem marcador.

```
@K
  email unique within customers
  email matches rfc5322
  name min_length 2
```

**Valores nomeados:** `chave valor` na mesma linha, separados por espaco.

```
  name str
  email str
  amount dec
```

**Valores compostos:** quando um campo tem sub-campos, usa indentacao.

```
  address
    street str
    city str
    zip str
```

---

## 3. Secoes Obrigatorias do Contrato

### 3.1 @C — Contract (identidade)

Declara a identidade unica do contrato. Argumentos posicionais na mesma linha da sigla.

**Sintaxe:**

```
@C <nome> <versao>
  domain <dominio>
  author <identidade>
  created <timestamp>
  tags <tag1> <tag2> ...
```

**Campos:**

| Campo     | Tipo   | Posicao      | Obrigatorio | Descricao                                |
|-----------|--------|--------------|-------------|------------------------------------------|
| nome      | id     | arg 1        | Sim         | Nome unico do contrato (dot-notation)    |
| versao    | str    | arg 2        | Sim         | Versao semantica (SemVer)                |
| domain    | id     | indentado    | Sim         | Dominio de negocio (dot-notation)        |
| author    | str    | indentado    | Sim         | Quem gerou este contrato                 |
| created   | ts     | indentado    | Sim         | Timestamp de criacao ISO-8601            |
| tags      | list   | indentado    | Nao         | Tags de classificacao                    |

**Exemplo:**

```siml
@C checkout.complete 2.1.0
  domain commerce.orders
  author tradutor:claude-opus@4
  created 2026-03-13T14:30:00Z
  tags critical payment multi-step
```

### 3.2 @I — Intent (intencao)

Declara a intencao em linguagem natural e o objetivo formal. Esta secao e a ponte entre o humano e a maquina.

**Sintaxe:**

```
@I
  natural "<descricao em linguagem natural>"
  goal <predicado formal>
  accept
    <criterio 1>
    <criterio 2>
  reject
    <criterio negativo 1>
    <criterio negativo 2>
  priority <critical|high|normal|low>
  timeout <duracao>
```

**Campos:**

| Campo     | Tipo   | Obrigatorio | Descricao                                          |
|-----------|--------|-------------|-----------------------------------------------------|
| natural   | str    | Sim         | Intencao em linguagem natural (para humanos/logs)   |
| goal      | expr   | Sim         | Predicado formal que define sucesso                 |
| accept    | list   | Nao         | Criterios de aceite decomponiveis                   |
| reject    | list   | Nao         | O que NAO deve acontecer                            |
| priority  | enum   | Nao         | Prioridade de execucao (default: normal)            |
| timeout   | dur    | Nao         | Tempo maximo para conclusao                         |

**Exemplo:**

```siml
@I
  natural "Processar checkout completo com reserva de estoque, cobranca e envio"
  goal order.status = completed & payment.captured & shipment.created
  accept
    "Estoque reservado para todos os itens"
    "Pagamento capturado no valor total"
    "Etiqueta de envio gerada"
  reject
    "Cobrar sem ter estoque reservado"
    "Enviar sem confirmacao de pagamento"
  priority critical
  timeout 30s
```

### 3.3 @E — Entities (entidades)

Declara as entidades envolvidas no contrato com seus atributos tipados.

**Sintaxe:**

```
@E
  <nome_entidade>
    <campo> <tipo> [modificadores]
    <campo> <tipo> [modificadores]
  <outra_entidade>
    <campo> <tipo>
```

**Modificadores de campo:**

| Modificador | Significado                            |
|-------------|----------------------------------------|
| !           | Obrigatorio (default para campos sem ?) |
| ?           | Opcional                               |
| *           | Unico (unique)                         |
| =<valor>    | Valor padrao                           |
| ^           | Indexado                               |
| ~           | Gerado automaticamente                 |

**Exemplo:**

```siml
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
  order
    id id ~
    customer_id ref[customer] !^
    items list[order_item] !
    total dec !
    status enum(pending,paid,shipped,delivered,cancelled) =pending
  order_item
    product_id ref[product] !
    quantity int !
    unit_price dec !
```

### 3.4 @K — Constraints (restricoes)

Declara restricoes e invariantes. A sigla "K" vem de "Kontrolle" para evitar colisao com @C (Contract).

**Sintaxe:**

```
@K
  <expressao de constraint>
    severity <fatal|error|warning>
    message "<explicacao>"
    enforced <parse|runtime|both>
  <outra constraint>
```

Constraints usam uma mini-linguagem de predicados:

| Sintaxe                     | Significado                                    |
|-----------------------------|------------------------------------------------|
| `campo unique`              | Valor unico globalmente                        |
| `campo unique within X`     | Valor unico dentro do escopo X                 |
| `campo matches <pattern>`   | Valor casa com padrao                          |
| `campo min <n>`             | Valor minimo (numeros) ou comprimento (strings)|
| `campo max <n>`             | Valor maximo                                   |
| `campo in <a> <b> <c>`     | Valor pertence ao conjunto                     |
| `campo = <valor>`           | Valor exato                                    |
| `campo != <valor>`          | Valor diferente                                |
| `campo > <valor>`           | Maior que                                      |
| `campo < <valor>`           | Menor que                                      |
| `A & B`                     | Ambas verdadeiras                              |
| `A \| B`                    | Pelo menos uma verdadeira                      |
| `!A`                        | Negacao                                        |
| `A ? B`                     | Se A entao B (implicacao)                      |
| `count(X) <op> <n>`         | Contagem satisfaz operador                     |
| `forall X in Y : P`         | Para todo X em Y, P e verdadeiro               |
| `exists X in Y : P`         | Existe X em Y tal que P e verdadeiro           |

**Exemplo:**

```siml
@K
  email unique within customers
    severity fatal
    message "Email ja cadastrado"
  email matches rfc5322
    severity fatal
    message "Formato de email invalido"
  doc ? doc matches cpf | doc matches cnpj
    severity fatal
    message "CPF ou CNPJ invalido"
  order.total > 0
    severity fatal
    message "Valor do pedido deve ser positivo"
  order.total < 100000
    severity error
    message "Pedidos acima de R$100.000 exigem aprovacao manual"
  forall item in order.items : item.quantity > 0
    severity fatal
    message "Quantidade deve ser positiva"
```

### 3.5 @X — Execution (plano de execucao)

Declara o plano de execucao usando operadores de fluxo. Esta secao pode ser preenchida pelo Tradutor ou pelo Executor.

**Sintaxe:**

```
@X
  <passo> [operador] <passo> [operador] <passo>
  -- ou em multiplas linhas com indentacao
  <passo>
    <sub-passo> > <sub-passo>
```

Os operadores de fluxo sao definidos na secao 5. O corpo da secao @X e uma sequencia de passos conectados por operadores.

**Exemplo:**

```siml
@X
  validate_input
    >> check_email_format email
    >> check_duplicate email within customers
  ? doc_provided
    validate_doc doc
  create_stripe_customer email name
    >> bind stripe_id
  persist customer
  emit customer.created
    ~> notify_admin
    ~> log_audit
```

### 3.6 @V — Evidence (evidencia)

Preenchida pos-execucao. Registra o que aconteceu, com provas verificaveis.

**Sintaxe:**

```
@V
  outcome <success|partial|failure>
  goals
    <predicado> <met|unmet>
      evidence <artefato>
  trace
    <timestamp> <passo> <resultado> [duracao]
  effects
    <efeito colateral registrado>
  hash <sha256>
  chain <sha256_anterior>
  verified_by <identidade>
  verified_at <timestamp>
  summary "<resumo em linguagem natural>"
```

**Exemplo:**

```siml
@V
  outcome success
  goals
    customer.exists met
      evidence record:cust-a8f3-2026
    customer.valid met
      evidence validation:pass
    stripe_synced met
      evidence stripe:cus_Rf8kX2mN
  trace
    2026-03-13T10:00:00.100Z validate_input ok 12ms
    2026-03-13T10:00:00.115Z check_duplicate ok 45ms
    2026-03-13T10:00:00.162Z create_stripe ok 230ms
    2026-03-13T10:00:00.395Z persist ok 18ms
    2026-03-13T10:00:00.415Z emit ok 3ms
  effects
    audit_log customer.created cust-a8f3-2026
    notification admin email_sent
  hash sha256:7f3a9b2c1d4e5f6a
  chain sha256:none
  verified_by validator:v1.0
  verified_at 2026-03-13T10:00:00.420Z
  summary "Cliente cadastrado com sucesso. Stripe sincronizado. Email: ana@corp.com. ID: cust-a8f3-2026. Duracao total: 320ms."
```

---

## 4. Secoes Opcionais

### 4.1 @T — Triggers (ativacao)

Define quando o contrato e ativado.

**Sintaxe:**

```
@T
  <tipo_trigger> <configuracao>
```

**Tipos de trigger:**

| Tipo     | Sintaxe                              | Descricao                        |
|----------|--------------------------------------|----------------------------------|
| http     | `http <METODO> <path>`               | Requisicao HTTP                  |
| cron     | `cron "<expressao>"`                 | Agendamento periodico            |
| event    | `event <nome_evento>`                | Evento interno do sistema        |
| webhook  | `webhook <provider> <event_type>`    | Webhook externo                  |
| manual   | `manual`                             | Acionado manualmente             |
| queue    | `queue <nome_fila>`                  | Mensagem em fila                 |

**Exemplo:**

```siml
@T
  http POST /api/customers
    auth bearer_token
    rate_limit 100/min
  webhook stripe payment_intent.succeeded
    secret env:STRIPE_WEBHOOK_SECRET
    verify_signature true
  cron "0 2 * * *"
    timezone America/Sao_Paulo
    retry 3 backoff exponential base 5m
  event customer.created
    from #customer.create
```

### 4.2 @F — Fallbacks (recuperacao)

Define estrategias de recuperacao para falhas.

**Sintaxe:**

```
@F
  on <condicao_de_falha>
    <estrategia>
```

**Estrategias:**

| Estrategia | Sintaxe                            | Descricao                    |
|------------|------------------------------------|------------------------------|
| retry      | `retry <n> backoff <tipo> <base>`  | Tentar novamente             |
| fallback   | `fallback <acao_alternativa>`      | Executar alternativa         |
| compensate | `compensate <passos>`              | Desfazer o que foi feito     |
| escalate   | `escalate <destino>`               | Escalar para outro agente    |
| abort      | `abort <mensagem>`                 | Abortar com mensagem         |

**Exemplo:**

```siml
@F
  on stripe_timeout
    retry 3 backoff exponential base 2s
  on stripe_error
    fallback create_pending_payment
    escalate ops_team via slack
  on db_unavailable
    retry 5 backoff linear base 1s
    abort "Banco de dados indisponivel apos 5 tentativas"
  on validation_failure
    abort "Dados invalidos"
```

### 4.3 @D — Dependencies (dependencias)

Declara contratos dos quais este depende.

**Sintaxe:**

```
@D
  #<nome_contrato> <range_versao>
    bind <campo_local> <- <campo_remoto>
```

**Exemplo:**

```siml
@D
  #customer.create >=1.0.0 <2.0.0
    bind customer <- customer
  #payment.process >=2.0.0
    bind amount <- order.total
    bind method <- payment_method
  #inventory.reserve >=1.0.0
    bind items <- order.items
```

### 4.4 @S — Schema (estrutura de dados)

Define a estrutura de dados que o contrato manipula. Util quando a entidade em @E e uma representacao simplificada e o schema completo precisa ser formalizado para validacao ou geracao de banco de dados.

**Sintaxe:**

```
@S
  <nome_schema>
    <campo> <tipo> [constraints inline]
    <campo> <tipo>
      <constraint>
      <constraint>
```

**Exemplo:**

```siml
@S
  subscription_plan
    id id ~
    name str min 3 max 50 *
    slug str derived_from name *
    price_cents int > 0
    currency enum(BRL,USD) =BRL
    features list[str] min 1
    shop_limit int ? > 0
      -- null significa ilimitado
    trial_days int > 0 =14
    stripe_price_id str ~
    active bool =true
    created_at ts ~
    updated_at ts ~
  subscription
    id id ~
    customer_id ref[customer] !^
    plan_id ref[subscription_plan] !^
    stripe_sub_id str ~
    status enum(trial,active,past_due,cancelled,expired) =trial
    trial_start ts !
    trial_end ts !
    period_start ts ?
    period_end ts ?
    cancelled_at ts ?
    cancel_reason str ?
```

---

## 5. Operadores de Fluxo

Os operadores de fluxo sao usados dentro da secao @X para descrever a logica de execucao.

### 5.1 Tabela de operadores

| Operador | Nome               | Semantica                                     | Exemplo                          |
|----------|--------------------|-----------------------------------------------|----------------------------------|
| `>`      | then               | Executa B apos A (sequencial)                 | `validate > persist`             |
| `>>`     | pipe               | Output de A e input de B                      | `fetch >> transform >> save`     |
| `\|`     | parallel           | Executa A e B simultaneamente                 | `notify_admin \| notify_user`    |
| `?`      | if                 | Executa B somente se A e verdadeiro           | `? has_doc : validate_doc`       |
| `??`     | match              | Switch/pattern matching                       | `?? status`                      |
| `!`      | not                | Negacao de condicao                           | `? !cancelled : process`         |
| `*`      | loop               | Repete enquanto condicao                      | `* has_next : process_item`      |
| `@>`     | delegate           | Delega execucao a outro contrato              | `@> #payment.process`            |
| `~>`     | async              | Envia e nao espera resposta (fire and forget) | `~> notify_admin`                |
| `<>`     | exchange           | Troca bidirecional de dados                   | `<> external_api`                |
| `=>`     | transform          | Transforma/mapeia dados                       | `items => calculate_total`       |

### 5.2 Regras de precedencia

Da maior para menor:

1. `!` (negacao) — unario, maior precedencia
2. `>>` (pipe) — encadeia operacoes em sequencia com passagem de dados
3. `>` (then) — sequencia simples sem passagem implicita
4. `=>` (transform) — mapeamento
5. `|` (parallel) — execucao concorrente
6. `?` / `??` (condicional/match) — controle de fluxo
7. `*` (loop) — repeticao
8. `@>` / `~>` / `<>` (delegacao/async/exchange) — operacoes entre contratos

Parenteses `( )` podem ser usados para desambiguar:

```siml
(validate > check_stock) | (validate > check_payment)
-- executa as duas branches em paralelo
```

### 5.3 Detalhamento dos operadores

**`>` — then (sequencial)**

Executa o proximo passo somente apos o anterior completar com sucesso.

```siml
@X
  validate > persist > emit
```

Equivale a: execute `validate`. Se ok, execute `persist`. Se ok, execute `emit`.

**`>>` — pipe (sequencial com passagem de dados)**

O output do passo anterior se torna o input do proximo.

```siml
@X
  fetch_items >> calculate_subtotals >> apply_discounts >> calculate_total
```

O resultado de `fetch_items` e passado para `calculate_subtotals`, cujo resultado e passado para `apply_discounts`, e assim por diante.

**`|` — parallel**

Executa ambos os ramos simultaneamente. Ambos devem completar.

```siml
@X
  reserve_stock | authorize_payment
  > create_shipment
```

`reserve_stock` e `authorize_payment` executam em paralelo. Somente quando ambos completam, `create_shipment` executa.

Para controle fino de join:

```siml
  reserve_stock |all authorize_payment   -- ambos devem completar (default)
  notify_email |any notify_sms           -- basta um completar
  check_a |2of3 check_b check_c          -- pelo menos 2 de 3
```

**`?` — condicional (if)**

Avalia uma condicao e executa o proximo passo somente se verdadeira.

```siml
@X
  ? amount > 1000
    require_token > validate_token
  ? amount > 50000
    require_director_approval
```

Com else (usando `?!` para o ramo falso):

```siml
@X
  ? customer.is_premium
    apply_premium_discount
  ?!
    apply_standard_discount
```

**`??` — match (switch)**

Pattern matching sobre um valor.

```siml
@X
  ?? payment.method
    credit_card : process_card >> capture
    pix : generate_pix_code >> await_confirmation
    boleto : generate_boleto ~> send_email
    _ : abort "Metodo de pagamento desconhecido"
```

O `_` e o caso default (obrigatorio quando o enum nao e exaustivo).

**`*` — loop**

Repete enquanto a condicao for verdadeira.

```siml
@X
  * has_pending_items max 1000
    dequeue_item >> process_item >> mark_done
```

O `max` e obrigatorio — SIML nao permite loops potencialmente infinitos. O parser rejeita `*` sem `max`.

**`@>` — delegate**

Delega execucao para outro contrato.

```siml
@X
  @> #inventory.reserve
    bind items <- order.items
    timeout 10s
    expect reservation.confirmed
```

**`~>` — async (fire and forget)**

Envia para execucao assincrona. Nao espera resultado.

```siml
@X
  persist > emit
  ~> send_welcome_email
  ~> track_analytics
```

O contrato continua imediatamente apos o `~>`. Os passos assincronos executam em background.

**`<>` — exchange (troca bidirecional)**

Para interacoes que exigem request-response com sistema externo.

```siml
@X
  <> stripe.create_customer
    send email name
    receive stripe_customer_id
```

**`=>` — transform**

Mapeia/transforma dados.

```siml
@X
  order.items => calculate_line_total
  -- aplica calculate_line_total a cada item
```

---

## 6. Sistema de Tipos Minimo

### 6.1 Tipos primitivos

| Tipo           | Descricao                    | Exemplo de valor          | Tokens BPE |
|----------------|------------------------------|---------------------------|------------|
| `str`          | String UTF-8                 | `"Ana Silva"`             | 1          |
| `int`          | Inteiro (64-bit)             | `42`, `-7`, `0`           | 1          |
| `dec`          | Decimal (precisao fixa)      | `199.90`, `0.01`          | 1          |
| `bool`         | Booleano                     | `true`, `false`           | 1          |
| `ts`           | Timestamp ISO-8601           | `2026-03-13T10:00:00Z`   | 1          |
| `dur`          | Duracao                      | `30s`, `5m`, `2h`, `14d` | 1          |
| `id`           | Identificador unico (UUIDv7) | `cust-a8f3-2026`         | 1          |
| `ref[T]`       | Referencia a entidade T      | `ref[customer]`          | 1-2        |
| `list[T]`      | Lista tipada                 | `list[str]`              | 1-2        |
| `map[K,V]`     | Mapa tipado                  | `map[str,int]`           | 1-3        |
| `opt[T]`       | Opcional (pode ser ausente)  | `opt[str]`               | 1-2        |
| `enum(a,b,c)`  | Enumeracao                   | `enum(active,inactive)`  | 1-3        |
| `any`          | Qualquer tipo                | —                        | 1          |

### 6.2 Regras de tipos

**Tipos implicitos por posicao:** em certas secoes, o tipo pode ser inferido.

```siml
@C customer.create 1.0.0
--  ^id             ^str (SemVer)
```

Dentro de `@C`, o primeiro argumento e sempre `id` e o segundo e sempre `str` (SemVer). Nao precisa declarar.

**Tipos em @E sao explicitos:** entidades sempre declaram tipos para nao-ambiguidade.

```siml
@E
  customer
    name str       -- tipo explicito obrigatorio
    age int        -- tipo explicito obrigatorio
```

**Literais tipados pelo formato:**

| Formato              | Tipo inferido | Exemplos                  |
|----------------------|---------------|---------------------------|
| Numero sem ponto     | `int`         | `42`, `-7`, `0`           |
| Numero com ponto     | `dec`         | `199.90`, `0.01`          |
| `true` / `false`     | `bool`        | `true`                    |
| ISO-8601 com T e Z   | `ts`          | `2026-03-13T10:00:00Z`    |
| Numero + unidade      | `dur`         | `30s`, `5m`, `2h`         |
| Texto sem espacos     | `str` ou `id` | (depende do contexto)     |
| Texto entre aspas     | `str`         | `"Ana Silva"`             |

**Coercao:** SIML nao faz coercao implicita. `"42"` e string, `42` e inteiro. Nunca se convertem automaticamente. Isso e fundamental para nao-ambiguidade entre LLMs.

### 6.3 Composicao de tipos

Tipos se compoem sem limites de profundidade:

```
list[ref[customer]]          -- lista de referencias a customers
map[str, list[int]]          -- mapa de string para lista de inteiros
opt[list[str]]               -- lista de strings opcional
list[map[str, opt[dec]]]     -- lista de mapas de string para decimais opcionais
```

O parser valida tipos compostos recursivamente. Tipos desconhecidos sao erro de parse.

---

## 7. Exemplos Completos

### 7.1 Exemplo 1: Cadastro de cliente (contrato simples)

```siml
siml v1

-- Contrato: cadastro de novo cliente
@C customer.create 1.0.0
  domain commerce.customers
  author tradutor:claude-opus@4
  created 2026-03-13T10:00:00Z

@I
  natural "Cadastrar novo cliente com validacao de email e sincronizacao com Stripe"
  goal customer.persisted & customer.stripe_synced
  accept
    "Cliente salvo no banco com ID gerado"
    "Customer criado no Stripe com stripe_customer_id vinculado"
    "Evento customer.created emitido"
  reject
    "Cadastrar cliente com email duplicado"
    "Salvar cliente sem sincronizar Stripe"
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
    message "Email ja cadastrado"
  email matches rfc5322
    severity fatal
    message "Formato de email invalido"
  name min 2
    severity fatal
    message "Nome deve ter pelo menos 2 caracteres"
  doc ? doc matches cpf | doc matches cnpj
    severity fatal
    message "Documento invalido: deve ser CPF ou CNPJ valido"

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
    abort "Falha ao criar cliente no Stripe"
  on db_duplicate
    abort "Email ja cadastrado"

@V
  -- preenchido pelo executor apos execucao
```

### 7.2 Exemplo 2: Webhook de pagamento (com trigger HTTP)

```siml
siml v1

@C payment.webhook.stripe 1.0.0
  domain finance.payments
  author tradutor:claude-opus@4
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
  natural "Processar webhooks do Stripe para atualizar status de pagamentos e assinaturas"
  goal payment.status_updated & subscription.status_synced
  accept
    "Pagamento marcado como capturado quando succeeded"
    "Assinatura ativada quando primeiro pagamento confirmado"
    "Assinatura marcada como past_due quando pagamento falha"
    "Evidencia completa registrada para auditoria"
  reject
    "Processar webhook com assinatura invalida"
    "Atualizar pagamento sem verificar existencia"
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
    message "Assinatura do webhook invalida — possivel fraude"
  payment.amount_cents > 0
    severity fatal
    message "Valor do pagamento deve ser positivo"

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
        ~> notify_customer "Pagamento confirmado"
        ~> log_audit
    payment_intent.payment_failed
      update_payment status failed failed_at now failure_reason
      >> find_subscription payment.subscription_id
      update_subscription status past_due
      emit payment.failed
        ~> notify_customer "Falha no pagamento"
        ~> notify_admin "Pagamento falhou"
        ~> log_audit
    _
      log_unknown_event webhook_event.type
      abort "Tipo de evento nao suportado"

@F
  on payment_not_found
    log_warning "Pagamento nao encontrado para stripe_id"
    abort "Pagamento desconhecido"
  on db_error
    retry 3 backoff exponential base 1s

@V
  -- preenchido pos-execucao
```

### 7.3 Exemplo 3: Relatorio diario (com cron)

```siml
siml v1

@C reports.daily_metrics 1.0.0
  domain analytics.reports
  author tradutor:claude-opus@4
  created 2026-03-13T09:00:00Z
  tags cron report automated

@T
  cron "0 6 * * *"
    timezone America/Sao_Paulo
    retry 3 backoff exponential base 10m
    alert_on_failure ops_team via slack

@I
  natural "Gerar relatorio diario de metricas de negocio: MRR, churn, novos clientes, pagamentos"
  goal report.generated & report.delivered
  accept
    "MRR calculado corretamente a partir de assinaturas ativas"
    "Churn rate calculado com base em cancelamentos do periodo"
    "Relatorio entregue por email aos stakeholders"
    "Dados armazenados para historico"
  reject
    "Enviar relatorio com dados incompletos"
    "Calcular MRR incluindo assinaturas canceladas"
  priority normal
  timeout 5m

@E
  daily_report
    id id ~
    date ts !
    mrr dec !
    mrr_change dec !
    active_subscriptions int !
    new_customers int !
    churned_customers int !
    churn_rate dec !
    revenue_today dec !
    payments_today int !
    failures_today int !
    generated_at ts ~

@D
  #customer.create >=1.0.0
  #payment.webhook.stripe >=1.0.0

@K
  daily_report.mrr >= 0
    severity fatal
    message "MRR nao pode ser negativo"
  daily_report.churn_rate >= 0 & daily_report.churn_rate <= 1
    severity fatal
    message "Churn rate deve estar entre 0 e 1"
  daily_report.date = yesterday
    severity error
    message "Relatorio deve ser do dia anterior"

@X
  define_period yesterday_start yesterday_end
  count_active_subscriptions
    >> calculate_mrr
    >> calculate_mrr_change vs previous_report
  count_new_customers period
  count_churned_customers period
    >> calculate_churn_rate
  count_payments period
    | count_failures period
  => compose_report
  persist daily_report
  >> format_email_html daily_report
  ~> send_email stakeholders "Relatorio Diario"
  ~> store_to_analytics_db daily_report

@F
  on query_timeout
    retry 2 backoff linear base 30s
  on email_failure
    retry 3 backoff exponential base 1m
    fallback store_report_mark_unsent
  on data_incomplete
    escalate data_team via slack
    abort "Dados incompletos para gerar relatorio"

@V
  -- preenchido pos-execucao
```

### 7.4 Exemplo 4: Composicao — checkout de e-commerce

Este exemplo demonstra tres contratos que se referenciam para compor um checkout completo.

**Contrato 4a: Reserva de estoque**

```siml
siml v1

@C inventory.reserve 1.0.0
  domain commerce.inventory
  author tradutor:claude-opus@4
  created 2026-03-13T14:00:00Z
  tags inventory atomic

@I
  natural "Reservar estoque para itens de um pedido"
  goal forall item in items : item.reserved = true
  accept
    "Cada item tem estoque suficiente"
    "Reserva criada com TTL de 15 minutos"
  reject
    "Reservar mais do que o estoque disponivel"
    "Criar reserva sem TTL"
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
    message "Quantidade deve ser positiva"
  forall item in items : stock(item.product_id) >= item.quantity
    severity fatal
    message "Estoque insuficiente"
  reservation.expires_at > now
    severity fatal
    message "Reserva deve ter TTL futuro"

@X
  * has_next_item max 500
    check_stock item.product_id item.quantity
    ? stock_sufficient
      reserve_item item.product_id item.quantity
    ?!
      release_all_reserved
      abort "Estoque insuficiente para {item.product_id}"
  set_expiration reservation 15m
  persist reservation
  emit inventory.reserved

@F
  on stock_changed_during_reserve
    release_all_reserved
    retry 1
  on db_error
    release_all_reserved
    abort "Erro ao reservar estoque"

@V
  -- preenchido pos-execucao
```

**Contrato 4b: Processamento de pagamento**

```siml
siml v1

@C payment.process 2.0.0
  domain finance.payments
  author tradutor:claude-opus@4
  created 2026-03-13T14:00:00Z
  tags payment stripe critical

@I
  natural "Processar pagamento via Stripe para um pedido"
  goal payment.captured & payment.amount = order.total
  accept
    "Pagamento autorizado e capturado no valor correto"
    "Comprovante de pagamento gerado"
  reject
    "Capturar valor diferente do pedido"
    "Processar pagamento sem reserva de estoque ativa"
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
    message "Valor deve ser positivo"
  amount_cents = order.total_cents
    severity fatal
    message "Valor do pagamento deve ser igual ao total do pedido"

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
        abort "Pagamento recusado pelo emissor"
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
    abort "Cartao recusado"
  on stripe_insufficient_funds
    abort "Saldo insuficiente"

@V
  -- preenchido pos-execucao
```

**Contrato 4c: Checkout completo (orquestrador)**

```siml
siml v1

@C checkout.complete 1.0.0
  domain commerce.orders
  author tradutor:claude-opus@4
  created 2026-03-13T14:00:00Z
  tags checkout saga critical multi-step

@I
  natural "Executar checkout completo: reservar estoque, cobrar pagamento, criar envio"
  goal order.status = completed & payment.captured & shipment.created
  accept
    "Estoque reservado para todos os itens"
    "Pagamento capturado no valor total"
    "Envio criado com etiqueta e codigo de rastreio"
    "Email de confirmacao enviado ao cliente"
  reject
    "Cobrar sem ter estoque reservado"
    "Criar envio sem pagamento confirmado"
    "Deixar reserva pendente se pagamento falhar"
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
    message "Total do pedido deve ser positivo"
  forall item in order.items : item.quantity > 0
    severity fatal
    message "Quantidade deve ser positiva"
  forall item in order.items : item.unit_price_cents > 0
    severity fatal
    message "Preco unitario deve ser positivo"
  order.total_cents = sum(item.quantity * item.unit_price_cents for item in order.items)
    severity fatal
    message "Total nao confere com soma dos itens"

@X
  -- Saga: cada passo tem compensacao
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
    abort "Estoque insuficiente"
  on payment_declined
    @> #inventory.release
      bind reservation_id <- reservation.id
    update_order status failed
    abort "Pagamento recusado"
  on shipment_error
    @> #payment.refund
      bind payment_id <- payment.id
    @> #inventory.release
      bind reservation_id <- reservation.id
    update_order status failed
    escalate ops_team via slack
    abort "Erro ao criar envio"

@V
  -- preenchido pos-execucao
```

### 7.5 Exemplo 5: Schema com validacao complexa

```siml
siml v1

@C loan.application 1.0.0
  domain finance.credit
  author tradutor:claude-opus@4
  created 2026-03-13T15:00:00Z
  tags credit scoring validation complex

@I
  natural "Avaliar pedido de emprestimo com scoring de credito, validacao de documentos e regras de alcada"
  goal application.decision != pending & application.evidence_complete
  accept
    "Score calculado com base em dados verificados"
    "Decisao tomada conforme tabela de alcada"
    "Toda documentacao validada"
  reject
    "Aprovar sem validar documentos"
    "Aprovar valor acima da alcada sem escalacao"

@S
  loan_application
    id id ~
    applicant
      cpf str ! matches cpf
      name str ! min 5
      birth_date ts !
      income_monthly_cents int ! > 0
      employer str ?
      employment_months int ? >= 0
    requested
      amount_cents int ! > 0
      term_months int ! in 6 12 18 24 36 48 60
      purpose enum(personal,vehicle,home,business) !
    scoring
      serasa_score int ? >= 0 <= 1000
      internal_score int ? >= 0 <= 100
      combined_score int ~
      risk_class enum(A,B,C,D,E) ~
    documents list[document] !
    decision
      status enum(pending,approved,denied,manual_review) =pending
      approved_amount_cents int ?
      approved_rate_pct dec ?
      decided_by str ?
      decided_at ts ?
      reason str ?
  document
    type enum(id_front,id_back,income_proof,address_proof,selfie) !
    url str !
    verified bool =false
    verified_at ts ?
    verified_by str ?
    rejection_reason str ?

@K
  applicant.cpf unique within active_applications
    severity fatal
    message "Ja existe solicitacao ativa para este CPF"
  applicant.birth_date < today - 18y
    severity fatal
    message "Solicitante deve ter pelo menos 18 anos"
  requested.amount_cents >= 100000
    severity fatal
    message "Valor minimo de R$1.000,00"
  requested.amount_cents <= 50000000
    severity fatal
    message "Valor maximo de R$500.000,00"
  requested.amount_cents <= applicant.income_monthly_cents * requested.term_months * 0.3
    severity error
    message "Valor solicitado excede 30% da renda projetada"
  count(documents where type = id_front) >= 1
    severity fatal
    message "Documento de identidade (frente) obrigatorio"
  count(documents where type = income_proof) >= 1
    severity fatal
    message "Comprovante de renda obrigatorio"
  count(documents where type = selfie) >= 1
    severity fatal
    message "Selfie obrigatoria para prova de vida"

@X
  -- Fase 1: Validacao de documentos (paralelo)
  documents => validate_document
    verify_authenticity
    ? type = id_front | type = id_back
      extract_ocr >> match_cpf_name
    ? type = income_proof
      extract_income_value >> validate_against_declared
    ? type = selfie
      match_face_against_id

  -- Fase 2: Scoring (paralelo)
  > fetch_serasa_score applicant.cpf
    | calculate_internal_score applicant
  >> combine_scores serasa internal
  >> classify_risk combined_score

  -- Fase 3: Decisao
  > ?? risk_class
    A
      ? requested.amount_cents <= 1000000
        auto_approve rate 1.49
      ?!
        ? requested.amount_cents <= 5000000
          auto_approve rate 1.89
        ?!
          route_to_analyst level senior
    B
      ? requested.amount_cents <= 500000
        auto_approve rate 2.49
      ?!
        route_to_analyst level pleno
    C
      ? requested.amount_cents <= 200000
        auto_approve rate 3.99
      ?!
        route_to_analyst level senior
    D
      route_to_analyst level senior
    E
      auto_deny reason "Score abaixo do minimo"

  > persist loan_application
  > emit loan.application.decided
    ~> notify_applicant decision
    ~> log_audit

@F
  on serasa_unavailable
    calculate_internal_score_only
    route_to_analyst level pleno reason "Serasa indisponivel"
  on document_verification_failed
    update_application status manual_review
    route_to_analyst level pleno reason "Verificacao de documento falhou"
  on face_match_failed
    update_application status manual_review
    route_to_analyst level senior reason "Match facial nao confirmado"

@V
  -- preenchido pos-execucao
```

---

## 8. Gramatica Formal (BNF)

A gramatica abaixo define completamente a sintaxe do dialeto SIML v1. Implementavel em qualquer gerador de parser PEG ou LR(1).

```bnf
(* ============================================================ *)
(*  SIML v1 — Gramatica Formal Completa                         *)
(*  Notacao: EBNF estendida (ISO 14977 com extensoes)           *)
(* ============================================================ *)

(* --- Nivel do Arquivo --- *)

file            = header , newline , { section } , EOF ;

header          = "siml" , ws , version_id ;
version_id      = "v" , digits ;

(* --- Secoes --- *)

section         = section_C
                | section_I
                | section_E
                | section_K
                | section_X
                | section_V
                | section_T
                | section_F
                | section_D
                | section_S ;

(* @C — Contract *)
section_C       = "@C" , ws , identifier , ws , semver , newline ,
                  { indent , c_field , newline } ;
c_field         = "domain" , ws , dotted_id
                | "author" , ws , value
                | "created" , ws , timestamp
                | "tags" , ws , identifier , { ws , identifier } ;

(* @I — Intent *)
section_I       = "@I" , newline ,
                  { indent , i_field , newline } ;
i_field         = "natural" , ws , quoted_string
                | "goal" , ws , expression
                | "accept" , newline , { indent2 , quoted_string , newline }
                | "reject" , newline , { indent2 , quoted_string , newline }
                | "priority" , ws , priority_value
                | "timeout" , ws , duration ;
priority_value  = "critical" | "high" | "normal" | "low" ;

(* @E — Entities *)
section_E       = "@E" , newline ,
                  { indent , entity_def } ;
entity_def      = identifier , newline ,
                  { indent2 , field_def , newline } ;
field_def       = identifier , ws , type_expr , { ws , modifier } ;

(* @K — Constraints *)
section_K       = "@K" , newline ,
                  { indent , constraint_def } ;
constraint_def  = constraint_expr , newline ,
                  { indent2 , constraint_attr , newline } ;
constraint_attr = "severity" , ws , severity_value
                | "message" , ws , quoted_string
                | "enforced" , ws , enforced_value ;
severity_value  = "fatal" | "error" | "warning" ;
enforced_value  = "parse" | "runtime" | "both" ;

(* @X — Execution *)
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

(* @V — Evidence *)
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

(* @T — Triggers *)
section_T       = "@T" , newline ,
                  { indent , trigger_def } ;
trigger_def     = trigger_type , { ws , argument } , newline ,
                  { indent2 , trigger_attr , newline } ;
trigger_type    = "http" | "cron" | "event" | "webhook"
                | "manual" | "queue" ;
trigger_attr    = identifier , ws , value ;

(* @F — Fallbacks *)
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

(* @D — Dependencies *)
section_D       = "@D" , newline ,
                  { indent , dep_def } ;
dep_def         = "#" , dotted_id , ws , version_range , newline ,
                  { indent2 , bind_def , newline } ;
bind_def        = "bind" , ws , identifier , "<-" , ws , dotted_id ;
version_range   = version_comp , { ws , version_comp } ;
version_comp    = ( ">=" | ">" | "<=" | "<" | "=" ) , semver ;

(* @S — Schema *)
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

(* --- Operadores de Fluxo --- *)

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
match_arm       = ( identifier | "_" ) , newline ,
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

(* --- Expressoes --- *)

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

(* --- Sistema de Tipos --- *)

type_expr       = base_type
                | "ref[" , identifier , "]"
                | "list[" , type_expr , "]"
                | "map[" , type_expr , "," , type_expr , "]"
                | "opt[" , type_expr , "]"
                | "enum(" , identifier , { "," , identifier } , ")" ;
base_type       = "str" | "int" | "dec" | "bool" | "ts"
                | "dur" | "id" | "any" ;

(* --- Modificadores de Campo --- *)

modifier        = "!"                  (* obrigatorio *)
                | "?"                  (* opcional *)
                | "*"                  (* unico *)
                | "^"                  (* indexado *)
                | "~"                  (* gerado automaticamente *)
                | "=" , value ;        (* valor padrao *)

(* --- Terminais --- *)

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
                  ( "Z" | ( ( "+" | "-" ) , digit , digit , ":" , digit , digit ) ) ;
duration        = digits , dur_unit ;
dur_unit        = "ms" | "s" | "m" | "h" | "d" | "w" | "y" ;
value           = quoted_string | number | "true" | "false"
                | "null" | "now" | "none" | timestamp
                | duration | identifier | dotted_id ;

comment         = "--" , { any_char } ;
ws              = " " , { " " } ;
newline         = [ comment ] , "\n" ;
indent          = "  " ;               (* 2 espacos — nivel 1 *)
indent2         = "    " ;             (* 4 espacos — nivel 2 *)
indent3         = "      " ;           (* 6 espacos — nivel 3 *)
indent_next     = indent , indent ;    (* relativo ao bloco pai *)
indent_next2    = indent_next , indent ;

letter          = "a"-"z" | "A"-"Z" ;
digit           = "0"-"9" ;
hex_digit       = digit | "a"-"f" | "A"-"F" ;
any_char        = ? qualquer caractere Unicode exceto newline ? ;

EOF             = ? fim do arquivo ? ;
```

---

## 9. Analise de Token-Efficiency

Usando o Exemplo 4c (checkout completo) como base de comparacao. Estimativas de tokens baseadas no tokenizador BPE cl100k_base (GPT-4/Claude).

### 9.1 Versao SIML

O contrato 4c como definido na secao 7.4 tem aproximadamente:

- Linhas de texto: ~98
- Caracteres: ~3.200
- **Tokens estimados: ~820**

### 9.2 Versao JSON equivalente

```json
{
  "contract": {
    "name": "checkout.complete",
    "version": "1.0.0",
    "domain": "commerce.orders",
    "author": "tradutor:claude-opus@4",
    "created": "2026-03-13T14:00:00Z",
    "tags": ["checkout", "saga", "critical", "multi-step"]
  },
  "intent": {
    "natural": "Executar checkout completo: reservar estoque, cobrar pagamento, criar envio",
    "goal": "order.status == 'completed' && payment.captured && shipment.created",
    "accept": [
      "Estoque reservado para todos os itens",
      "Pagamento capturado no valor total",
      "Envio criado com etiqueta e codigo de rastreio",
      "Email de confirmacao enviado ao cliente"
    ],
    "reject": [
      "Cobrar sem ter estoque reservado",
      "Criar envio sem pagamento confirmado",
      "Deixar reserva pendente se pagamento falhar"
    ],
    "priority": "critical",
    "timeout": "60s"
  },
  "entities": {
    "order": {
      "fields": {
        "id": {"type": "id", "generated": true},
        "customer_id": {"type": "ref", "target": "customer", "required": true, "indexed": true},
        "items": {"type": "list", "element": "order_item", "required": true},
        "total_cents": {"type": "int", "required": true},
        "status": {"type": "enum", "values": ["pending","processing","completed","failed","cancelled"], "default": "pending"},
        "payment_id": {"type": "ref", "target": "payment", "required": false},
        "shipment_id": {"type": "ref", "target": "shipment", "required": false},
        "created_at": {"type": "ts", "generated": true}
      }
    },
    "order_item": {
      "fields": {
        "product_id": {"type": "ref", "target": "product", "required": true},
        "quantity": {"type": "int", "required": true},
        "unit_price_cents": {"type": "int", "required": true}
      }
    },
    "shipment": {
      "fields": {
        "id": {"type": "id", "generated": true},
        "order_id": {"type": "ref", "target": "order", "required": true},
        "tracking_code": {"type": "str", "required": false},
        "label_url": {"type": "str", "required": false},
        "carrier": {"type": "str", "required": false},
        "status": {"type": "enum", "values": ["pending","shipped","delivered"], "default": "pending"}
      }
    }
  },
  "dependencies": [
    {"contract": "inventory.reserve", "version": ">=1.0.0"},
    {"contract": "payment.process", "version": ">=2.0.0"},
    {"contract": "customer.create", "version": ">=1.0.0"}
  ],
  "constraints": [
    {"expression": "order.total_cents > 0", "severity": "fatal", "message": "Total do pedido deve ser positivo"},
    {"expression": "forall(item in order.items, item.quantity > 0)", "severity": "fatal", "message": "Quantidade deve ser positiva"},
    {"expression": "forall(item in order.items, item.unit_price_cents > 0)", "severity": "fatal", "message": "Preco unitario deve ser positivo"},
    {"expression": "order.total_cents == sum(item.quantity * item.unit_price_cents for item in order.items)", "severity": "fatal", "message": "Total nao confere com soma dos itens"}
  ],
  "execution": {
    "steps": [
      {"action": "update_order", "params": {"field": "status", "value": "processing"}},
      {"action": "delegate", "contract": "inventory.reserve", "bind": {"items": "order.items"}, "timeout": "5s", "expect": "reservation.status == 'active'", "compensate": {"delegate": "inventory.release"}},
      {"action": "delegate", "contract": "payment.process", "bind": {"amount_cents": "order.total_cents", "customer_id": "order.customer_id", "method": "payment_method"}, "timeout": "30s", "expect": "payment.status == 'captured'", "compensate": {"delegate": "payment.refund"}},
      {"action": "sequence", "steps": [{"action": "create_shipment", "params": {"order": "order"}}, {"action": "generate_label"}, {"action": "get_tracking_code"}], "compensate": {"action": "cancel_shipment"}},
      {"action": "update_order", "params": {"field": "status", "value": "completed"}},
      {"action": "persist", "entity": "order"},
      {"action": "emit", "event": "order.completed", "async": [{"action": "send_confirmation_email", "params": {"to": "customer", "data": "order"}}, {"action": "notify_warehouse", "params": {"data": "shipment"}}, {"action": "track_analytics", "params": {"data": "order"}}]}
    ]
  },
  "fallbacks": [
    {"on": "inventory_insufficient", "actions": [{"action": "update_order", "params": {"status": "failed"}}, {"action": "abort", "message": "Estoque insuficiente"}]},
    {"on": "payment_declined", "actions": [{"action": "delegate", "contract": "inventory.release", "bind": {"reservation_id": "reservation.id"}}, {"action": "update_order", "params": {"status": "failed"}}, {"action": "abort", "message": "Pagamento recusado"}]},
    {"on": "shipment_error", "actions": [{"action": "delegate", "contract": "payment.refund", "bind": {"payment_id": "payment.id"}}, {"action": "delegate", "contract": "inventory.release", "bind": {"reservation_id": "reservation.id"}}, {"action": "update_order", "params": {"status": "failed"}}, {"action": "escalate", "to": "ops_team", "via": "slack"}, {"action": "abort", "message": "Erro ao criar envio"}]}
  ]
}
```

- Caracteres: ~4.850
- **Tokens estimados: ~1.310**

### 9.3 Versao YAML equivalente

```yaml
contract:
  name: checkout.complete
  version: "1.0.0"
  domain: commerce.orders
  author: "tradutor:claude-opus@4"
  created: "2026-03-13T14:00:00Z"
  tags: [checkout, saga, critical, multi-step]
intent:
  natural: "Executar checkout completo: reservar estoque, cobrar pagamento, criar envio"
  goal: "order.status == completed && payment.captured && shipment.created"
  accept:
    - "Estoque reservado para todos os itens"
    - "Pagamento capturado no valor total"
    - "Envio criado com etiqueta e codigo de rastreio"
    - "Email de confirmacao enviado ao cliente"
  reject:
    - "Cobrar sem ter estoque reservado"
    - "Criar envio sem pagamento confirmado"
    - "Deixar reserva pendente se pagamento falhar"
  priority: critical
  timeout: 60s
entities:
  order:
    id: {type: id, generated: true}
    customer_id: {type: ref, target: customer, required: true, indexed: true}
    items: {type: list, element: order_item, required: true}
    total_cents: {type: int, required: true}
    status: {type: enum, values: [pending, processing, completed, failed, cancelled], default: pending}
    payment_id: {type: ref, target: payment}
    shipment_id: {type: ref, target: shipment}
    created_at: {type: ts, generated: true}
  order_item:
    product_id: {type: ref, target: product, required: true}
    quantity: {type: int, required: true}
    unit_price_cents: {type: int, required: true}
  shipment:
    id: {type: id, generated: true}
    order_id: {type: ref, target: order, required: true}
    tracking_code: {type: str}
    label_url: {type: str}
    carrier: {type: str}
    status: {type: enum, values: [pending, shipped, delivered], default: pending}
dependencies:
  - contract: inventory.reserve
    version: ">=1.0.0"
  - contract: payment.process
    version: ">=2.0.0"
  - contract: customer.create
    version: ">=1.0.0"
constraints:
  - expr: "order.total_cents > 0"
    severity: fatal
    message: "Total do pedido deve ser positivo"
  - expr: "forall item in order.items: item.quantity > 0"
    severity: fatal
    message: "Quantidade deve ser positiva"
  - expr: "forall item in order.items: item.unit_price_cents > 0"
    severity: fatal
    message: "Preco unitario deve ser positivo"
  - expr: "order.total_cents == sum(item.quantity * item.unit_price_cents for item in order.items)"
    severity: fatal
    message: "Total nao confere com soma dos itens"
execution:
  - update_order: {status: processing}
  - delegate: inventory.reserve
    bind: {items: order.items}
    timeout: 5s
    expect: "reservation.status == active"
    compensate: {delegate: inventory.release}
  - delegate: payment.process
    bind: {amount_cents: order.total_cents, customer_id: order.customer_id, method: payment_method}
    timeout: 30s
    expect: "payment.status == captured"
    compensate: {delegate: payment.refund}
  - sequence: [create_shipment, generate_label, get_tracking_code]
    compensate: cancel_shipment
  - update_order: {status: completed}
  - persist: order
  - emit: order.completed
    async: [send_confirmation_email, notify_warehouse, track_analytics]
fallbacks:
  - on: inventory_insufficient
    actions: [{update_order: {status: failed}}, {abort: "Estoque insuficiente"}]
  - on: payment_declined
    actions: [{delegate: inventory.release}, {update_order: {status: failed}}, {abort: "Pagamento recusado"}]
  - on: shipment_error
    actions: [{delegate: payment.refund}, {delegate: inventory.release}, {update_order: {status: failed}}, {escalate: {to: ops_team, via: slack}}, {abort: "Erro ao criar envio"}]
```

- Caracteres: ~3.650
- **Tokens estimados: ~1.050**

### 9.4 Versao TypeScript equivalente

```typescript
const checkoutContract = {
  name: "checkout.complete",
  version: "1.0.0",
  domain: "commerce.orders",
  async execute(order: Order, paymentMethod: PaymentMethod) {
    order.status = "processing";
    await db.save(order);
    const reservation = await inventoryService.reserve(order.items, { timeout: 5000 });
    if (!reservation.active) throw new InsufficientStockError();
    try {
      const payment = await paymentService.process({
        amountCents: order.totalCents,
        customerId: order.customerId,
        method: paymentMethod
      }, { timeout: 30000 });
      if (payment.status !== "captured") {
        await inventoryService.release(reservation.id);
        throw new PaymentDeclinedError();
      }
    } catch (e) {
      await inventoryService.release(reservation.id);
      order.status = "failed";
      await db.save(order);
      throw e;
    }
    let shipment: Shipment;
    try {
      shipment = await shippingService.create(order);
      shipment.label = await shippingService.generateLabel(shipment);
      shipment.trackingCode = await shippingService.getTrackingCode(shipment);
    } catch (e) {
      await paymentService.refund(payment.id);
      await inventoryService.release(reservation.id);
      order.status = "failed";
      await db.save(order);
      await alertService.escalate("ops_team", "slack", e);
      throw new ShipmentError(e);
    }
    order.status = "completed";
    order.paymentId = payment.id;
    order.shipmentId = shipment.id;
    await db.save(order);
    eventBus.emit("order.completed", order);
    /* fire and forget */
    emailService.sendConfirmation(order.customerId, order).catch(log);
    warehouseService.notify(shipment).catch(log);
    analyticsService.track("checkout", order).catch(log);
  }
};
```

- Caracteres: ~1.950
- **Tokens estimados: ~690**

### 9.5 Tabela comparativa

| Formato     | Tokens est. | vs SIML     | Informacao semantica preservada                |
|-------------|-------------|-------------|------------------------------------------------|
| **SIML**    | **~820**    | **base**    | Completa: intencao, constraints, evidencia, fallbacks |
| JSON        | ~1.310      | +60%        | Completa (mesmo conteudo, mais tokens)         |
| YAML        | ~1.050      | +28%        | Completa (mesmo conteudo, mais tokens)         |
| TypeScript  | ~690        | -16%        | Parcial: sem intencao formal, sem constraints declarativas, sem evidencia, sem fallbacks estruturados |

### 9.6 Interpretacao dos resultados

**SIML vs JSON:** economia de ~37% de tokens. A fonte principal da economia sao chaves sem aspas, ausencia de delimitadores `{}` e `[]`, e operadores simbolicos em vez de estruturas aninhadas.

**SIML vs YAML:** economia de ~22%. YAML ja elimina aspas em chaves, mas mantem estrutura de mapeamento verbosa. Os operadores de fluxo do SIML sao significativamente mais compactos que a representacao YAML equivalente.

**SIML vs TypeScript:** TypeScript e mais compacto em tokens brutos (~16% menor), mas carrega informacao semantica incompleta. O codigo TypeScript perde:
- Intencao declarativa (o que e por que, nao apenas o como)
- Constraints formalmente verificaveis (viram `if` buried no codigo)
- Estrutura de evidencia (sem framework de auditoria)
- Fallbacks estruturados (tratamento de erro ad-hoc)
- Dependencias declarativas (imports, mas sem versionamento semantico)

Se adicionassemos ao TypeScript toda a informacao semantica que SIML carrega (JSDoc de intencao, Zod schemas para constraints, framework de auditoria, error handling completo), o codigo facilmente triplicaria em tamanho, ultrapassando 2.000 tokens.

**Conclusao:** SIML ocupa o sweet spot entre compacidade de tokens e completude semantica. Quando comparado com formatos que carregam a mesma informacao, e consistentemente mais eficiente. Quando comparado com codigo que e mais compacto, a diferenca e que o codigo omite informacao critica que SIML preserva.

---

## 10. Parsing e Validacao

### 10.1 Arquitetura do parser

O parser SIML opera em tres fases:

```
Texto .siml
    |
    v
[FASE 1: Lexer]  ---  tokens + indentacao
    |
    v
[FASE 2: Parser] ---  AST (Abstract Syntax Tree)
    |
    v
[FASE 3: Validador Semantico] --- AST validada
```

**Fase 1 — Lexer:** converte texto em stream de tokens. O lexer e responsavel por:
- Contar niveis de indentacao e emitir tokens INDENT/DEDENT
- Ignorar comentarios (`--`)
- Reconhecer tokens especiais: `@C`, `@I`, `@E`, `@K`, `@X`, `@V`, `@T`, `@F`, `@D`, `@S`
- Reconhecer operadores: `>`, `>>`, `|`, `?`, `??`, `!`, `*`, `@>`, `~>`, `<>`, `=>`
- Reconhecer literais: strings, numeros, timestamps, duracoes, booleanos

**Fase 2 — Parser:** constroi AST a partir dos tokens. Implementavel como PEG parser (Parsing Expression Grammar) por nao ter ambiguidade. Cada secao `@X` tem sua propria sub-gramatica, o que permite parsing modular.

**Fase 3 — Validador Semantico:** verifica regras que a gramatica sintatica nao captura:
- Tipos referenciados existem (`ref[customer]` exige que `customer` esteja definido em `@E`)
- Contratos referenciados em `@D` existem no registry
- Ranges de versao em dependencias sao satisfativeis
- Loops em `@X` tem `max` definido
- Constraints referenciam campos que existem nas entidades
- Fluxo de execucao nao tem ciclos (DAG)

### 10.2 Validacao sintatica vs semantica

| Validacao                                    | Tipo       | Fase   |
|----------------------------------------------|------------|--------|
| Header `siml v1` presente                    | Sintatica  | Parser |
| Secao `@C` como primeira secao               | Sintatica  | Parser |
| Indentacao correta (multiplos de 2)          | Sintatica  | Lexer  |
| Secoes obrigatorias presentes (@C,@I,@E,@K,@X,@V) | Sintatica | Parser |
| Tipos reconhecidos (`str`, `int`, etc.)      | Sintatica  | Parser |
| Operadores reconhecidos (`>`, `>>`, etc.)    | Sintatica  | Parser |
| Strings fechadas (aspas balanceadas)         | Sintatica  | Lexer  |
| SemVer valida em `@C`                        | Sintatica  | Parser |
| Timestamp ISO-8601 valida                    | Sintatica  | Parser |
| `ref[X]` — X existe em `@E`                 | Semantica  | Validador |
| `#contrato` em `@D` — contrato existe        | Semantica  | Validador |
| Campos em `@K` existem em `@E`              | Semantica  | Validador |
| Loop `*` tem `max`                           | Semantica  | Validador |
| Fluxo `@X` e DAG (sem ciclos)               | Semantica  | Validador |
| `enum()` usado com valor valido              | Semantica  | Validador |
| Tipo de campo consistente com uso            | Semantica  | Validador |

### 10.3 Mensagens de erro

Erros de parsing devem ser claros e acionaveis. Formato padrao:

```
SIML-<CODIGO>: <mensagem>
  at <arquivo>:<linha>:<coluna>
  |
  | <linha de contexto>
  | <marcador de posicao>
  |
  hint: <sugestao de correcao>
```

**Exemplos de erros:**

```
SIML-E001: Header ausente. Todo arquivo .siml deve comecar com 'siml v1'
  at contract.siml:1:1
  |
  | @C customer.create 1.0.0
  | ^
  |
  hint: Adicione 'siml v1' como primeira linha do arquivo

SIML-E010: Indentacao invalida. Esperados 2 espacos (nivel 1), encontrados 3
  at contract.siml:5:1
  |
  |    domain commerce
  |    ^
  |
  hint: Use exatamente 2 espacos por nivel de indentacao

SIML-E020: Tipo desconhecido 'string'. Tipos validos: str, int, dec, bool, ts, dur, id, any
  at contract.siml:12:15
  |
  |     name string !
  |          ^^^^^^
  |
  hint: Use 'str' em vez de 'string'

SIML-E030: Referencia nao resolvida. ref[product] referencia entidade 'product' que nao esta definida em @E
  at contract.siml:18:20
  |
  |     product_id ref[product] !
  |                    ^^^^^^^
  |
  hint: Defina a entidade 'product' na secao @E ou importe-a via @D

SIML-E040: Loop sem limite. Todo operador * deve ter 'max' definido
  at contract.siml:35:3
  |
  |   * has_items
  |   ^
  |
  hint: Adicione 'max <numero>' apos a condicao: * has_items max 1000

SIML-E050: Secao obrigatoria ausente: @V (Evidence)
  at contract.siml:EOF
  |
  hint: Adicione a secao @V ao final do contrato (pode estar vazia com comentario)
```

**Catalogo de codigos de erro:**

| Range       | Categoria                |
|-------------|--------------------------|
| E001-E009   | Erros de header          |
| E010-E019   | Erros de indentacao      |
| E020-E029   | Erros de tipo            |
| E030-E039   | Erros de referencia      |
| E040-E049   | Erros de fluxo           |
| E050-E059   | Erros de estrutura       |
| E060-E069   | Erros de constraint      |
| E070-E079   | Erros de versionamento   |
| W001-W099   | Warnings                 |

### 10.4 Proposta de implementacao: PEG parser

A gramatica SIML e naturalmente PEG (Parsing Expression Grammar) porque:
- Nao tem ambiguidade (toda producao tem exatamente uma interpretacao)
- O lookahead e limitado (geralmente 1-2 tokens)
- Indentacao pode ser tratada pelo lexer emitindo tokens INDENT/DEDENT

**Bibliotecas recomendadas por linguagem:**

| Linguagem  | Biblioteca                | Notas                                  |
|------------|---------------------------|----------------------------------------|
| JavaScript | `pegjs` / `peggy`         | Madura, boa integracao com Node.js     |
| Python     | `parsimonious` / `arpeggio` | Boa para prototipagem rapida         |
| Rust       | `pest`                    | Performance excelente, tipagem forte   |
| Go         | `pigeon`                  | Gera parser Go nativo                  |

**Estrutura do parser (pseudocodigo):**

```
class SIMLParser:
  lexer: SIMLLexer
  tokens: Stream<Token>

  parse(source: string) -> AST:
    tokens = lexer.tokenize(source)
    header = expect_header(tokens)
    sections = []
    while not tokens.eof():
      section = parse_section(tokens)
      sections.append(section)
    ast = AST(header, sections)
    validate_structure(ast)    -- secoes obrigatorias
    validate_semantics(ast)    -- referencias, tipos, etc.
    return ast

  parse_section(tokens) -> Section:
    marker = tokens.expect(SECTION_MARKER)  -- @C, @I, etc.
    match marker:
      "@C" -> parse_contract(tokens)
      "@I" -> parse_intent(tokens)
      "@E" -> parse_entities(tokens)
      "@K" -> parse_constraints(tokens)
      "@X" -> parse_execution(tokens)
      "@V" -> parse_evidence(tokens)
      "@T" -> parse_triggers(tokens)
      "@F" -> parse_fallbacks(tokens)
      "@D" -> parse_dependencies(tokens)
      "@S" -> parse_schema(tokens)
      _    -> error(E050, "Secao desconhecida: {marker}")
```

A AST resultante e uma estrutura tipada que pode ser serializada para JSON (para debug), MessagePack (para transmissao), ou consumida diretamente pelo executor.

---

## 11. Versionamento do Dialeto

### 11.1 Header de versao

Todo arquivo SIML comeca com:

```
siml v<numero>
```

O numero e um inteiro simples: `v1`, `v2`, `v3`. Nao e SemVer — o dialeto usa versionamento major-only. Toda mudanca no dialeto que altera a gramatica incrementa o numero.

O parser DEVE verificar a versao antes de processar. Se `siml v2` e apresentado a um parser v1, o parser rejeita com erro claro:

```
SIML-E070: Versao do dialeto nao suportada. Arquivo requer SIML v2, parser suporta ate v1
  hint: Atualize o parser SIML para a versao mais recente
```

### 11.2 Regras de evolucao

**Mudancas que NAO incrementam versao (patch — podem ser feitas dentro de v1):**
- Adicionar novas secoes opcionais (ex: novo `@M` para Metrics)
- Adicionar novos tipos primitivos (ex: `url`, `email`)
- Adicionar novos operadores de fluxo
- Adicionar novos modificadores de campo
- Expandir enum de severity ou priority

O parser existente ignora secoes desconhecidas com warning, nao com erro. Isso permite forward compatibility.

**Mudancas que incrementam versao (v1 -> v2):**
- Alterar sintaxe de secoes existentes
- Mudar semantica de operadores existentes
- Remover tipos ou secoes
- Mudar regras de indentacao
- Alterar o formato do header

### 11.3 Backward compatibility

Um parser v2 DEVE ser capaz de processar arquivos v1. O contrato declara sua versao; o parser adapta.

```
class SIMLParser:
  supported_versions: [1, 2]

  parse(source):
    version = extract_header_version(source)
    if version not in supported_versions:
      error(E070)
    grammar = load_grammar(version)
    return grammar.parse(source)
```

### 11.4 Migracao entre versoes

Quando v2 e lancada, uma ferramenta CLI de migracao e fornecida:

```bash
siml migrate contract.siml --from v1 --to v2
```

A ferramenta:
1. Faz parse com a gramatica v1
2. Aplica transformacoes de migracao (documentadas no changelog v2)
3. Gera arquivo v2
4. Valida com a gramatica v2
5. Emite diff para revisao humana

Migracoes sao deterministicas e reversiveis.

### 11.5 Deprecacao

Quando uma feature e marcada para remocao em v(N+1):
1. O parser v(N) emite warning ao encontrar a feature
2. O changelog de v(N+1) documenta a remocao e a alternativa
3. A ferramenta de migracao transforma automaticamente

---

## 12. Anti-patterns

### 12.1 O que NAO colocar no dialeto

**Logica imperativa detalhada.** SIML descreve *o que* acontece e em que *ordem*, nao *como* cada passo e implementado. Se um contrato esta especificando algoritmos (quicksort, hash maps, binary search), ele esta no nivel errado de abstracao.

Anti-pattern:
```siml
-- ERRADO: implementando algoritmo
@X
  set i 0
  * i < items.length max 1000
    set j i + 1
    ? items[i].price > items[j].price
      swap items[i] items[j]
    set i i + 1
```

Correto:
```siml
-- CERTO: declarando intencao
@X
  items => sort_by price ascending
```

**Strings longas como logica.** Se o campo `natural` em `@I` esta sendo usado como especificacao tecnica em vez de descricao de intencao, algo esta errado.

Anti-pattern:
```siml
@I
  natural "Primeiro, buscar o cliente pelo ID na tabela customers usando index btree, depois verificar o campo status que deve ser 'active', entao consultar a tabela subscriptions fazendo join por customer_id..."
```

Correto:
```siml
@I
  natural "Verificar se o cliente tem assinatura ativa"
  goal customer.exists & customer.status = active & subscription.active
```

**Aninhamento excessivo.** Se o contrato tem mais de 4 niveis de indentacao em `@X`, ele deve ser decomposto em subcontratos via `@>`.

Anti-pattern: contrato unico com 200+ linhas em `@X` com 6 niveis de aninhamento.

Correto: contrato orquestrador com 20 linhas em `@X` delegando para 5 subcontratos especializados.

**Constraints que sao regras de negocio complexas.** `@K` e para invariantes e limites simples. Regras de negocio complexas com muitas condicoes sao subcontratos, nao constraints.

Anti-pattern:
```siml
@K
  ? customer.type = premium & order.total > 500 & !order.has_discount & customer.region in SP RJ MG & customer.created_at < today - 90d
    order.shipping_free = true
    severity warning
    message "Regra de frete gratis premium regional"
```

Correto: criar um subcontrato `#shipping.free_eligibility` que encapsula essa logica.

**Usar `any` como tipo padrao.** O tipo `any` existe para casos raros de interoperabilidade. Se mais de 10% dos campos de um contrato sao `any`, o contrato esta mal modelado.

**Duplicar entidades entre contratos.** Se dois contratos definem a mesma entidade `customer` com campos diferentes, deve existir um contrato canonico e os outros referenciam via `ref[customer]` e `@D`.

### 12.2 Sinais de over-engineering

O dialeto esta sendo "abusado" quando:

1. **Um contrato unico tenta resolver mais de um problema de negocio.** Se a `@I` tem duas intencoes separadas por "e tambem", sao dois contratos.

2. **A secao `@K` tem mais linhas que `@X`.** Constraints devem ser limites claros. Se a secao de restricoes e maior que a execucao, a logica de negocio esta no lugar errado.

3. **Contratos se referenciam circularmente.** `#A` depende de `#B` que depende de `#A`. Isso indica acoplamento excessivo. Extrair a dependencia compartilhada para um `#C`.

4. **A secao `@S` replica o schema do banco de dados.** `@S` define a estrutura semantica, nao o DDL. Se tem `index btree`, `varchar(255)`, ou `foreign key`, esta no nivel errado.

5. **Operadores de fluxo encadeados sem clareza.** `a >> b > c | d >> e ? f > g` sem quebra de linha ou parenteses e um sinal de que o contrato precisa ser refatorado.

6. **Meta-contratos que geram contratos.** SIML nao e uma linguagem de meta-programacao. Se um contrato esta "gerando" outros contratos em runtime, a arquitetura precisa ser revista. Composicao estatica via `@D` e `@>` e o mecanismo correto.

### 12.3 Limites intencionais

O que SIML deliberadamente NAO tenta expressar:

**Interface de usuario.** SIML nao descreve telas, formularios, layouts ou interacoes visuais. A camada de apresentacao e responsabilidade de outro sistema.

**Algoritmos computacionais.** Ordenacao, busca, criptografia, compressao — sao implementacoes que o executor resolve. SIML diz "ordenar por preco", nao como ordenar.

**Gerenciamento de infraestrutura.** Deploy, scaling, provisioning, networking. SIML opera na camada de logica de negocio, nao na camada de infraestrutura.

**Estado de sessao ou navegacao.** Cookies, tokens de sessao, rotas de frontend. SIML contratos sao stateless — o estado e das entidades, nao da "sessao".

**Comunicacao humano-humano.** Mensagens de chat, emails narrativos, documentacao. O campo `natural` em `@I` e uma descricao, nao um canal de comunicacao.

**Regras de CSS ou estilizacao.** Se alguem esta tentando colocar cores, fontes ou espacamento em SIML, houve um mal-entendido fundamental sobre o proposito do formato.

---

## Apendice A: Referencia Rapida de Sintaxe

```
HEADER:     siml v1
SECOES:     @C @I @E @K @X @V @T @F @D @S
TIPOS:      str int dec bool ts dur id ref[T] list[T] map[K,V] opt[T] enum(a,b) any
MODIF:      ! (obrig) ? (opc) * (unico) ^ (index) ~ (gerado) =val (default)
FLUXO:      > (then) >> (pipe) | (parallel) ? (if) ?? (match) ! (not)
            * (loop) @> (delegate) ~> (async) <> (exchange) => (transform)
REFS:       #contrato.nome (referencia entre contratos)
COMMENT:    -- texto
INDENT:     2 espacos por nivel
STRINGS:    sem aspas (token unico) ou "com aspas" (tem espacos)
```

## Apendice B: Checklist de Validacao do Contrato

Checklist que um parser deterministico executa antes de declarar um contrato valido:

```
[ ] Header 'siml v1' presente na primeira linha
[ ] Secao @C presente com nome e versao validos
[ ] Secao @I presente com 'natural' e 'goal'
[ ] Secao @E presente com pelo menos uma entidade
[ ] Secao @K presente (pode estar vazia)
[ ] Secao @X presente com pelo menos um passo
[ ] Secao @V presente (pode ter somente comentario)
[ ] Todos os ref[T] referenciam entidades definidas em @E
[ ] Todas as #refs em @D apontam para contratos conhecidos
[ ] Todo loop * tem max definido
[ ] Toda condicao ?? tem caso _ (default) quando enum nao e exaustivo
[ ] Indentacao consistente (multiplos de 2 espacos)
[ ] Nenhuma secao duplicada
[ ] SemVer valida em @C
[ ] Timestamps em formato ISO-8601
[ ] Sem referencia circular entre contratos
[ ] Tipos compostos validos (list[list[ref[X]]] — X existe)
[ ] Constraints referenciam campos existentes
[ ] Fluxo @X forma DAG (sem ciclos)
```
