# 13 - Connectors-as-Contracts: Como SIML se Conecta ao Mundo Real

> Conectores escritos no proprio dialeto SIML. O sistema que fala com Stripe, Slack, PostgreSQL e qualquer servico externo usando a mesma linguagem que descreve regras de negocio. Sem codigo. Sem SDKs. Apenas contratos.

---

## 1. O Problema dos Conectores Tradicionais

### 1.1 O estado atual: conectores como codigo

Toda plataforma de automacao enfrenta o mesmo problema: falar com servicos externos. A solucao universalmente adotada e escrever conectores em codigo.

**n8n:** 400+ conectores escritos em TypeScript. Cada conector e uma classe que implementa uma interface (`INodeType`), com metodos para autenticar, listar operacoes e executar requests. Um conector medio tem 500-2000 linhas de TypeScript. A Stripe node do n8n tem ~3000 linhas. A plataforma precisa de engenheiros dedicados so para manter conectores.

**Zapier:** milhares de "Zaps", cada um com logica custom. Quando uma API muda, o conector quebra silenciosamente -- o usuario descobre quando o fluxo para de funcionar. Zapier mantem uma equipe de ~30 pessoas so para atualizar conectores.

**Make (Integromat):** mesma arquitetura. Conectores em codigo, mantidos por humanos, quebram quando APIs mudam.

**Pipedream:** conectores em Node.js. Mais flexivel que Zapier, mas o problema fundamental e identico -- cada conector e codigo que alguem precisa escrever e manter.

### 1.2 Por que conectores tradicionais sao frageis

**Acoplamento com versao de API.** Um conector escrito para a Stripe API v2023-10-16 pode quebrar quando a Stripe muda para v2024-01-01. O conector testa se `response.data.charges` existe, mas a nova versao retorna `response.data.payment_intents`. O conector nao entende semantica -- ele entende formato.

**Duplicacao massiva.** n8n, Zapier, Make, Pipedream, Tray.io, Workato -- cada um reimplementa os mesmos 400+ conectores. Sao essencialmente 6 implementacoes independentes de "como falar com o Stripe". Cada uma com bugs diferentes, cobertura diferente, qualidade diferente.

**Qualidade desigual.** O conector do Stripe no n8n trata 15 tipos de erro. O conector do CRM obscuro X trata 2. Nao existe padrao de qualidade -- depende de quem escreveu e quanto tempo teve.

**Sem gap detection.** Nenhuma plataforma diz: "voce esta usando o conector de pagamento mas nao tratou o caso de cartao recusado." O conector executa o que mandaram. Se o usuario esqueceu um cenario, o problema e dele.

**Atualizacao manual.** Quando a API do Stripe muda, alguem precisa: ler o changelog, entender o impacto, atualizar o codigo do conector, testar, publicar. Isso para CADA conector, CADA plataforma. E um trabalho sisifiano que nunca termina.

### 1.3 O custo real

Uma pesquisa da Workato (2023) estimou que empresas gastam em media 35% do tempo de integracao apenas mantendo conectores existentes -- nao criando novos. Para uma empresa de automacao com 400 conectores, isso significa uma equipe inteira dedicada a impedir que as coisas que ja funcionam parem de funcionar.

O problema nao e tecnico. E arquitetural. Conectores como codigo sao uma abordagem fundamentalmente limitada porque codigo descreve COMO fazer requests, nao O QUE o servico faz. Quando o "como" muda (nova versao de API), o codigo quebra. Se o conector descrevesse o "o que" (semantica), mudancas de API seriam adaptacoes locais, nao reescritas.

---

## 2. Connectors-as-Contracts: A Proposta

### 2.1 O conceito

Um conector SIML nao e codigo. E um contrato que descreve:

1. **O que o servico faz** -- semantica, nao apenas endpoints
2. **Como autenticar** -- tipo de auth, onde buscar credenciais
3. **Quais operacoes estao disponiveis** -- cada uma com intent claro
4. **Que dados cada operacao espera e retorna** -- tipados, validaveis
5. **O que pode dar errado e como tratar** -- error catalog completo
6. **Rate limits e restricoes** -- para que o runtime respeite os limites

O runtime SIML le o contrato do conector e sabe como interagir com o servico. Nao existe codigo intermediario. O contrato E a integracao.

### 2.2 Por que funciona

A intuicao e simples: se SIML consegue descrever regras de negocio complexas (pricing dinamico, fluxos de aprovacao, sagas de pagamento), ele consegue descrever como falar com uma API REST. Uma API REST e mais simples que uma regra de negocio -- e um metodo HTTP, um path, headers, body, e responses possiveis. Tudo descritivel como contrato.

### 2.3 Principio de auto-referencia

O sistema e auto-referencial: SIML descreve como falar com servicos externos usando a mesma linguagem que descreve como processar os dados que vem desses servicos. Nao ha ruptura de abstracoes. Um contrato de negocio que diz `stripe.create_charge` e um contrato de conector que descreve o que `create_charge` significa para a Stripe estao no mesmo universo semantico.

---

## 3. Exemplos Completos de Conectores SIML

### 3.1 Stripe (pagamentos)

```siml
siml v1

-- Connector: Stripe payment processing platform
@C stripe-connector 1.0.0
  domain connectors.payments
  author connector:community
  created 2026-03-13T00:00:00Z
  tags payment stripe financial

@I
  natural "Conector para a plataforma de pagamentos Stripe"
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
      intent "Criar nova cobranca de pagamento"
      input
        amount int ! -- valor em centavos
          min 50
        currency str =usd
          in usd brl eur gbp
        source str ! -- token do metodo de pagamento
        description str ?
        metadata map[str,str] ?
        capture bool =true
      output
        id str -- charge ID (ch_xxx)
        status enum(succeeded,pending,failed)
        amount int
        currency str
        paid bool
        created ts
      errors
        card_declined
          code "card_declined"
          action notify_user "Pagamento recusado pelo cartao"
        insufficient_funds
          code "insufficient_funds"
          action notify_user "Saldo insuficiente"
        expired_card
          code "expired_card"
          action notify_user "Cartao expirado"
        rate_limited
          http_status 429
          action retry with_backoff

    create_customer
      method POST
      path "/customers"
      intent "Registrar novo cliente na plataforma Stripe"
      input
        email str !
          matches rfc5322
        name str ?
        description str ?
        metadata map[str,str] ?
        payment_method str ?
      output
        id str -- customer ID (cus_xxx)
        email str
        created ts
        livemode bool
      errors
        email_invalid
          code "email_invalid"
          action abort "Email invalido para Stripe"
        rate_limited
          http_status 429
          action retry with_backoff

    create_payment_intent
      method POST
      path "/payment_intents"
      intent "Criar intencao de pagamento (fluxo moderno, substitui charges)"
      input
        amount int !
          min 50
        currency str =usd
        customer str ? -- customer ID
        payment_method str ?
        confirm bool =false
        automatic_payment_methods
          enabled bool =true
        metadata map[str,str] ?
      output
        id str -- pi_xxx
        client_secret str -- para frontend
        status enum(requires_payment_method,requires_confirmation,requires_action,processing,requires_capture,canceled,succeeded)
        amount int
        currency str
      errors
        amount_too_small
          code "amount_too_small"
          action abort "Valor minimo nao atingido"
        rate_limited
          http_status 429
          action retry with_backoff

    create_webhook_endpoint
      method POST
      path "/webhook_endpoints"
      intent "Registrar endpoint para receber eventos Stripe"
      input
        url str ! -- URL do webhook
        enabled_events list[str] !
          -- ex: payment_intent.succeeded, charge.failed
        api_version str ?
      output
        id str -- we_xxx
        secret str -- whsec_xxx (para verificar assinatura)
        url str
        status enum(enabled,disabled)
      errors
        url_invalid
          action abort "URL do webhook invalida"

    verify_webhook_signature
      intent "Verificar que webhook veio realmente do Stripe"
      local true -- nao faz HTTP, executa localmente
      input
        payload str ! -- corpo cru da requisicao
        signature str ! -- header Stripe-Signature
        secret str ! -- webhook signing secret (whsec_xxx)
        tolerance dur =300s -- tolerancia de timestamp
      output
        valid bool
        event_type str
        event_data map[str,any]
      errors
        signature_invalid
          action abort "Assinatura do webhook invalida -- possivel fraude"
        timestamp_expired
          action abort "Webhook expirado -- possivel replay attack"
```

### 3.2 SendGrid/Resend (email)

```siml
siml v1

-- Connector: Resend email delivery platform
@C resend-connector 1.0.0
  domain connectors.email
  author connector:community
  created 2026-03-13T00:00:00Z
  tags email transactional notification

@I
  natural "Conector para envio de emails transacionais via Resend"
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
    daily_limit 100 -- free tier
    daily_limit_pro 50000
  retry_on 429 500 502 503
  retry_strategy exponential_backoff
    max 3
    base 2s

  operations
    send_email
      method POST
      path "/emails"
      intent "Enviar email transacional"
      input
        from str ! -- ex: "Acme <no-reply@acme.com>"
          matches email_with_name
        to list[str] !
          min 1
          max 50
          each matches rfc5322
        subject str !
          max 998 -- RFC 2822
        html str ? -- corpo HTML
        text str ? -- corpo texto puro
        -- pelo menos html ou text
        require html | text
        reply_to str ?
        cc list[str] ?
        bcc list[str] ?
        headers map[str,str] ?
        attachments list[attachment] ?
          attachment
            filename str !
            content str ! -- base64
            content_type str =application/octet-stream
        tags list[tag] ?
          tag
            name str !
            value str !
      output
        id str -- email ID
      errors
        validation_error
          http_status 422
          action abort "Dados do email invalidos"
        rate_limited
          http_status 429
          action retry with_backoff
        sender_not_verified
          http_status 403
          action abort "Dominio do remetente nao verificado no Resend"
        daily_limit_exceeded
          http_status 429
          action escalate ops_team "Limite diario de emails atingido"

    get_email
      method GET
      path "/emails/{email_id}"
      intent "Consultar status de email enviado"
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
          action abort "Email nao encontrado"

    create_batch
      method POST
      path "/emails/batch"
      intent "Enviar multiplos emails de uma vez"
      input
        emails list[send_email.input] !
          min 1
          max 100
      output
        data list[send_email.output]
      errors
        partial_failure
          action log_warning "Alguns emails falharam no batch"
          return partial_results
```

### 3.3 PostgreSQL (banco de dados)

```siml
siml v1

-- Connector: PostgreSQL relational database
@C postgresql-connector 1.0.0
  domain connectors.database
  author connector:community
  created 2026-03-13T00:00:00Z
  tags database sql relational

@I
  natural "Conector para banco de dados PostgreSQL"
  goal connector.operational & connector.connected

@S postgresql
  auth
    type connection_string
    format "postgresql://{user}:{password}@{host}:{port}/{database}"
    env DATABASE_URL
    -- ou parametros individuais
    env_user PGUSER
    env_password PGPASSWORD
    env_host PGHOST =localhost
    env_port PGPORT =5432
    env_database PGDATABASE
    validate SELECT 1
      expect rows 1
  primitive sql -- usa primitivo SQL, nao HTTP
  pool
    min 2
    max 20
    idle_timeout 30s
    acquire_timeout 10s
  ssl
    mode prefer -- disable|allow|prefer|require|verify-ca|verify-full
    env_ca PG_SSL_CA ?

  operations
    query
      intent "Executar consulta SQL de leitura"
      input
        sql str !
        params list[any] ? -- parametros posicionais ($1, $2...)
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
          action abort "Erro de sintaxe SQL"
        relation_not_found
          code "42P01"
          action abort "Tabela ou view nao encontrada"
        timeout
          action retry 1 then abort "Query excedeu timeout"
      guard
        -- NUNCA permitir execucao de SQL arbitrario do usuario
        -- queries devem ser construidas pelo runtime, nao pelo input externo
        deny_raw_input true
        parameterize_always true

    execute
      intent "Executar comando SQL de escrita (INSERT, UPDATE, DELETE)"
      input
        sql str !
        params list[any] ?
        timeout dur =30s
        returning bool =false
      output
        affected_rows int
        returning_rows list[map[str,any]] ? -- se returning=true
      errors
        unique_violation
          code "23505"
          action abort "Registro duplicado"
        foreign_key_violation
          code "23503"
          action abort "Referencia invalida"
        not_null_violation
          code "23502"
          action abort "Campo obrigatorio nao preenchido"
        check_violation
          code "23514"
          action abort "Restricao de validacao violada"

    transaction
      intent "Executar multiplos comandos em transacao atomica"
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
          action retry 3 with_backoff then abort "Conflito de serializacao persistente"
        deadlock
          code "40P01"
          action retry 1 then abort "Deadlock detectado"
        any_step_fails
          action rollback then propagate

    migrate
      intent "Aplicar migracao de schema"
      input
        up_sql str ! -- SQL para aplicar
        down_sql str ! -- SQL para reverter
        version str ! -- identificador da migracao
        description str ?
      output
        applied bool
        duration dur
      errors
        already_applied
          action skip "Migracao ja aplicada"
        migration_failed
          action rollback then abort "Migracao falhou"
      guard
        require_approval admin
        log_complete true
```

### 3.4 Slack (mensagens)

```siml
siml v1

-- Connector: Slack messaging platform
@C slack-connector 1.0.0
  domain connectors.messaging
  author connector:community
  created 2026-03-13T00:00:00Z
  tags messaging slack notification realtime

@I
  natural "Conector para envio de mensagens e notificacoes via Slack"
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
    tier1 1/min -- metodos especiais
    tier2 20/min -- metodos de escrita
    tier3 50/min -- metodos de leitura
    tier4 100/min -- metodos de postagem
  retry_on 429 500 502 503
  retry_strategy
    on 429 use header Retry-After
    default exponential_backoff max 3 base 1s

  operations
    send_message
      method POST
      path "/api/chat.postMessage"
      intent "Enviar mensagem para canal ou usuario"
      rate_tier tier4
      input
        channel str ! -- channel ID ou nome (#general)
        text str ! -- texto da mensagem (fallback)
        blocks list[block] ? -- rich layout blocks
          -- Slack Block Kit format
        thread_ts str ? -- reply to thread
        unfurl_links bool =true
        unfurl_media bool =true
      output
        ok bool
        ts str -- message timestamp (ID)
        channel str
      errors
        channel_not_found
          code "channel_not_found"
          action abort "Canal Slack nao encontrado"
        not_in_channel
          code "not_in_channel"
          action abort "Bot nao esta no canal"
        msg_too_long
          code "msg_too_long"
          action truncate then retry
        rate_limited
          code "rate_limited"
          action wait header:Retry-After then retry

    send_notification
      method POST
      path "/api/chat.postMessage"
      intent "Enviar notificacao formatada com contexto de sistema"
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
      -- runtime transforma input em Slack Block Kit antes de enviar
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
      intent "Criar novo canal Slack"
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
          action abort "Ja existe canal com este nome"
        restricted
          code "restricted_action"
          action abort "Permissoes insuficientes para criar canal"

    listen_events
      intent "Receber eventos do Slack via Socket Mode ou Events API"
      mode websocket
      primitive ws
      input
        event_types list[str] !
          -- ex: message, reaction_added, member_joined_channel
        socket_mode bool =true
        env_app_token SLACK_APP_TOKEN -- para socket mode
      output
        event_type str
        event_data map[str,any]
        team_id str
        event_ts str
      errors
        connection_lost
          action reconnect max 5 backoff exponential
        token_revoked
          action abort "Token do Slack revogado"
```

### 3.5 AWS S3 (storage)

```siml
siml v1

-- Connector: AWS S3 object storage
@C s3-connector 1.0.0
  domain connectors.storage
  author connector:community
  created 2026-03-13T00:00:00Z
  tags storage aws s3 files

@I
  natural "Conector para armazenamento de objetos no AWS S3"
  goal connector.operational & connector.authenticated

@S s3
  auth
    type aws_signature_v4
    service s3
    env_access_key AWS_ACCESS_KEY_ID
    env_secret_key AWS_SECRET_ACCESS_KEY
    env_region AWS_REGION =us-east-1
    env_session_token AWS_SESSION_TOKEN ?
    -- alternativa: IAM role (sem env keys)
    iam_role true ?
    validate HEAD /{bucket}
      expect status 200
  base_url "https://{bucket}.s3.{region}.amazonaws.com"
  retry_on 429 500 502 503
  retry_strategy exponential_backoff
    max 3
    base 1s

  operations
    put_object
      method PUT
      path "/{key}"
      intent "Armazenar objeto no S3"
      input
        bucket str !
        key str ! -- caminho/nome do arquivo
        body bytes ! -- conteudo do arquivo
        content_type str =application/octet-stream
        metadata map[str,str] ?
        acl enum(private,public-read,authenticated-read) =private
        server_side_encryption enum(AES256,aws:kms) ?
      output
        etag str -- hash MD5 do objeto
        version_id str ?
      errors
        no_such_bucket
          code "NoSuchBucket"
          action abort "Bucket nao existe"
        access_denied
          code "AccessDenied"
          action abort "Sem permissao para gravar neste bucket"
        entity_too_large
          code "EntityTooLarge"
          action abort "Arquivo excede o limite de tamanho"

    get_object
      method GET
      path "/{key}"
      intent "Recuperar objeto do S3"
      input
        bucket str !
        key str !
        range str ? -- ex: "bytes=0-1023"
      output
        body bytes
        content_type str
        content_length int
        etag str
        last_modified ts
        metadata map[str,str]
      errors
        no_such_key
          code "NoSuchKey"
          action abort "Objeto nao encontrado"
        access_denied
          code "AccessDenied"
          action abort "Sem permissao para ler este objeto"

    delete_object
      method DELETE
      path "/{key}"
      intent "Remover objeto do S3"
      input
        bucket str !
        key str !
        version_id str ?
      output
        deleted bool
        delete_marker bool ?
      errors
        no_such_key
          code "NoSuchKey"
          action log_warning "Objeto ja nao existe"
        access_denied
          code "AccessDenied"
          action abort "Sem permissao para deletar"

    generate_presigned_url
      intent "Gerar URL temporaria para acesso direto ao objeto"
      local true -- nao faz HTTP, gera URL localmente
      input
        bucket str !
        key str !
        method enum(GET,PUT) =GET
        expires dur =3600s
          max 604800s -- 7 dias (limite AWS)
        content_type str ? -- obrigatorio se method=PUT
      output
        url str -- URL pre-assinada
        expires_at ts
      errors
        invalid_expiration
          action abort "Tempo de expiracao fora do permitido (max 7 dias)"

    list_objects
      method GET
      path "/"
      intent "Listar objetos em um bucket/prefixo"
      input
        bucket str !
        prefix str ?
        max_keys int =1000
          max 1000
        continuation_token str ?
      output
        contents list[s3_object]
          s3_object
            key str
            size int
            etag str
            last_modified ts
            storage_class str
        is_truncated bool
        next_continuation_token str ?
      errors
        no_such_bucket
          code "NoSuchBucket"
          action abort "Bucket nao existe"
```

### 3.6 Webhook Generico (qualquer servico)

```siml
siml v1

-- Connector: Generic webhook receiver/sender
@C webhook-generic-connector 1.0.0
  domain connectors.webhook
  author connector:community
  created 2026-03-13T00:00:00Z
  tags webhook http integration generic

@I
  natural "Conector generico para receber e enviar webhooks de/para qualquer servico"
  goal connector.operational

@S webhook
  -- nao tem auth/base_url fixos -- e generico

  operations
    receive
      intent "Receber webhook de servico externo"
      mode listener
      input
        path str ! -- ex: /webhook/my-service
        methods list[str] =POST
        verify_signature
          header str ? -- ex: X-Hub-Signature-256
          algorithm enum(hmac-sha256,hmac-sha1,raw) ?
          secret_env str ? -- env var com o secret
        timeout_response dur =5s -- responder rapido ao sender
        idempotency
          key_from str ? -- campo do payload para deduplicacao
          window dur =24h
      output
        headers map[str,str]
        body map[str,any]
        method str
        source_ip str
        received_at ts
        signature_valid bool ?
      errors
        signature_mismatch
          action respond 401 "Assinatura invalida"
        duplicate_event
          action respond 200 "Evento ja processado"
          log duplicate
        payload_invalid
          action respond 400 "Payload invalido"

    send
      intent "Enviar webhook para URL externa"
      input
        url str !
        method enum(POST,PUT,PATCH) =POST
        headers map[str,str] ?
        body map[str,any] !
        sign
          algorithm enum(hmac-sha256,hmac-sha1) ?
          secret_env str ?
          header str =X-Webhook-Signature
        timeout dur =30s
        retry
          max int =3
          backoff enum(exponential,linear,fixed) =exponential
          base dur =2s
      output
        status_code int
        response_body str ?
        duration dur
        attempts int
      errors
        timeout
          action retry with_backoff
        connection_refused
          action retry with_backoff then log_error "Endpoint inacessivel"
        non_2xx
          action log_warning "Webhook respondeu {status_code}"
          -- nao aborta por default -- muitos servicos retornam 201, 202, 204

    verify_signature
      intent "Verificar assinatura de webhook recebido"
      local true
      input
        payload str ! -- corpo cru
        signature str ! -- valor do header
        secret str ! -- secret compartilhado
        algorithm enum(hmac-sha256,hmac-sha1) =hmac-sha256
      output
        valid bool
      errors
        invalid
          action abort "Assinatura invalida"
```

---

## 4. Hierarquia de Conectores

### 4.1 Duas camadas

A arquitetura de conectores tem exatamente duas camadas:

```
Camada 1: Connector Primitives (built-in, codigo real)
├── http     -- faz HTTP requests (GET, POST, PUT, DELETE, PATCH)
├── sql      -- executa queries SQL (PostgreSQL, SQLite, MySQL)
├── smtp     -- envia email via protocolo SMTP
├── ws       -- WebSocket (conexoes persistentes bidirecionais)
├── fs       -- filesystem (ler/escrever arquivos locais)
├── queue    -- pub/sub (Redis, NATS, RabbitMQ)
└── crypto   -- operacoes criptograficas (HMAC, hash, sign/verify)

Camada 2: Connector Contracts (SIML, construidos sobre primitivos)
├── stripe-connector       (usa http + crypto)
├── resend-connector       (usa http)
├── postgresql-connector   (usa sql)
├── slack-connector        (usa http + ws)
├── s3-connector           (usa http + crypto)
├── webhook-connector      (usa http + crypto)
├── openai-connector       (usa http)
├── twilio-connector       (usa http)
└── ... qualquer servico   (usa primitivos)
```

### 4.2 Primitivos: o unico codigo real

Os primitivos sao o UNICO codigo real no sistema de conectores. Sao implementados na linguagem do runtime (TypeScript no caso do SIML Runtime Engine) e fazem o que SIML nao pode fazer: interagir com protocolos de rede e sistema operacional.

**Por que primitivos precisam ser codigo:**

O SIML e um dialeto declarativo. Ele descreve O QUE fazer, nao COMO fazer. Mas em algum ponto, alguem precisa abrir um socket TCP, enviar bytes pela rede, e interpretar a resposta. Isso e fisico -- nao pode ser declarado, precisa ser executado.

Os primitivos sao essa ponte entre o mundo declarativo (SIML) e o mundo fisico (rede, disco, processos).

**Primitivo `http`** -- o mais importante:

```typescript
// Pseudo-implementacao do primitivo http
interface HttpPrimitive {
  // O runtime chama isso quando um connector SIML precisa fazer HTTP
  execute(spec: HttpSpec): Promise<HttpResult>
}

interface HttpSpec {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD"
  url: string
  headers: Record<string, string>
  body?: string | Buffer
  timeout: number       // ms
  follow_redirects: boolean
  max_redirects: number
}

interface HttpResult {
  status: number
  headers: Record<string, string>
  body: string | Buffer
  duration_ms: number
}
```

**Primitivo `sql`** -- para bancos de dados:

```typescript
interface SqlPrimitive {
  connect(spec: SqlConnectionSpec): Promise<SqlConnection>
  query(conn: SqlConnection, sql: string, params: any[]): Promise<SqlResult>
  execute(conn: SqlConnection, sql: string, params: any[]): Promise<SqlExecResult>
  transaction(conn: SqlConnection, steps: SqlStep[]): Promise<SqlTxResult>
}
```

**Primitivo `crypto`** -- para assinaturas e hashes:

```typescript
interface CryptoPrimitive {
  hmac(algorithm: string, key: string, data: string): string
  hash(algorithm: string, data: string): string
  verify_hmac(algorithm: string, key: string, data: string, signature: string): boolean
  generate_uuid_v4(): string
  generate_uuid_v7(): string
}
```

### 4.3 Como um conector SIML usa um primitivo

Quando o runtime encontra uma operacao de conector, ele:

1. Le a spec do conector (metodo, path, headers, body format)
2. Resolve variaveis (auth tokens, env vars)
3. Monta a chamada ao primitivo correspondente
4. Executa via primitivo
5. Parseia a resposta conforme o output spec do conector
6. Trata erros conforme o error catalog do conector

Exemplo concreto -- quando um contrato de negocio chama `stripe.create_charge`:

```
Contrato de negocio:
  @X
    <> stripe.create_charge
      send amount 5000 currency "brl" source "tok_visa"
      receive charge_id charge_status

Runtime resolve para:
  1. Carrega stripe-connector.siml
  2. Encontra operacao create_charge
  3. Le: method POST, path "/charges", base_url "https://api.stripe.com/v1"
  4. Resolve auth: STRIPE_API_KEY do environment -> "sk_test_xxx"
  5. Monta headers: { Authorization: "Bearer sk_test_xxx", Content-Type: "application/x-www-form-urlencoded" }
  6. Monta body: amount=5000&currency=brl&source=tok_visa
  7. Chama primitivo http.execute({ method: "POST", url: "https://api.stripe.com/v1/charges", ... })
  8. Recebe resposta HTTP { status: 200, body: '{"id":"ch_xxx","status":"succeeded",...}' }
  9. Parseia conforme output spec: { id: "ch_xxx", status: "succeeded", amount: 5000 }
  10. Retorna ao contrato de negocio: charge_id = "ch_xxx", charge_status = "succeeded"
```

O conector SIML e um mapa que traduz intencoes (create_charge) em chamadas de primitivo (HTTP POST com esses parametros). O primitivo e o musculo. O conector e o cerebro.

### 4.4 Minimo viavel de primitivos

Para o MVP, apenas 3 primitivos cobrem ~95% dos casos de uso:

| Primitivo | Cobre | Conectores que dependem |
|-----------|-------|------------------------|
| `http` | Qualquer API REST, GraphQL, webhooks | Stripe, Resend, Slack, S3, OpenAI, 90% dos servicos |
| `sql` | Bancos relacionais | PostgreSQL, SQLite, MySQL |
| `crypto` | Assinaturas, hashes, tokens | Usado por http para auth AWS, webhook signatures |

Os primitivos `ws`, `smtp`, `fs`, e `queue` podem esperar fases posteriores. A maioria absoluta de integracoes e HTTP.

---

## 5. Como o Runtime Executa um Conector

### 5.1 Fluxo passo a passo

```
1. Contrato de negocio referencia "stripe.create_charge"
   │
   v
2. Runtime consulta o Connector Registry
   "Existe conector 'stripe'?" -> Sim, stripe-connector.siml v1.0.0
   │
   v
3. Runtime carrega o conector e encontra a operacao "create_charge"
   method: POST, path: /charges, base_url: https://api.stripe.com/v1
   │
   v
4. Runtime resolve autenticacao
   auth.type: bearer_token
   auth.env: STRIPE_API_KEY
   -> Busca no environment -> "sk_live_xxx"
   -> Se nao encontrar: ERRO "STRIPE_API_KEY nao configurada"
   │
   v
5. Runtime valida input contra spec do conector
   amount: 5000 (int, >= 50) -> OK
   currency: "brl" (str, in [usd,brl,eur,gbp]) -> OK
   source: "tok_visa" (str, required) -> OK
   │
   v
6. Runtime monta request HTTP
   POST https://api.stripe.com/v1/charges
   Headers: Authorization: Bearer sk_live_xxx
            Content-Type: application/x-www-form-urlencoded
            Stripe-Version: 2024-12-18
            Idempotency-Key: <uuid_v4 gerado>
   Body: amount=5000&currency=brl&source=tok_visa
   │
   v
7. Runtime executa via primitivo http
   http.execute({ method: "POST", url: "...", headers: {...}, body: "..." })
   │
   v
8. Runtime parseia resposta conforme output spec
   HTTP 200 -> parsear JSON -> extrair campos: id, status, amount, currency, paid
   HTTP 402 -> verificar error catalog -> "card_declined" -> executar action
   HTTP 429 -> retry_strategy -> exponential_backoff, attempt 1/3
   │
   v
9. Runtime registra evidencia
   { connector: "stripe", operation: "create_charge",
     request: {...}, response: {...}, duration: 342ms,
     status: "success", timestamp: "2026-03-13T10:00:00.342Z" }
   │
   v
10. Runtime retorna resultado ao contrato de negocio
    { charge_id: "ch_xxx", charge_status: "succeeded", amount: 5000 }
```

### 5.2 Diagrama de sequencia

```
Contrato      Runtime      Connector     Primitive    Servico
Negocio                    Registry       (http)      Externo
  │               │            │             │           │
  │──create_charge│            │             │           │
  │──amount:5000──>            │             │           │
  │               │──load───-->│             │           │
  │               │<─spec──────│             │           │
  │               │                          │           │
  │               │──resolve auth─────>env   │           │
  │               │<─"sk_live_xxx"─────env   │           │
  │               │                          │           │
  │               │──validate input──>(self) │           │
  │               │<─ok──────────────>(self) │           │
  │               │                          │           │
  │               │──POST /charges──────────>│           │
  │               │                          │──HTTP───>│
  │               │                          │<─200─────│
  │               │<─response───────────────│           │
  │               │                          │           │
  │               │──parse output───>(self)  │           │
  │               │──record evidence>(store) │           │
  │               │                          │           │
  │<──charge_id───│            │             │           │
  │<──status──────│            │             │           │
```

### 5.3 Tratamento de erros em cascata

Quando algo falha, o runtime segue a cadeia de tratamento definida no conector:

```
HTTP 402 (Payment Required)
  │
  v
Conector: body.error.code == "card_declined"?
  ├── Sim -> action: notify_user "Pagamento recusado pelo cartao"
  │         -> retorna ao contrato de negocio como erro tratado
  │
  └── body.error.code == "insufficient_funds"?
      ├── Sim -> action: notify_user "Saldo insuficiente"
      │
      └── Nao -> erro desconhecido
                 -> log completo (request + response + headers)
                 -> retorna ao contrato como erro generico


HTTP 429 (Rate Limited)
  │
  v
Conector: retry_strategy exponential_backoff max 3
  ├── Tentativa 1: espera 1s -> retry
  ├── Tentativa 2: espera 2s -> retry
  ├── Tentativa 3: espera 4s -> retry
  └── Tentativa 4: max atingido -> propaga erro ao contrato


HTTP 500 (Internal Server Error)
  │
  v
Conector: retry_on inclui 500
  ├── Retry com backoff (mesmo fluxo do 429)
  └── Se persistir: erro de servico externo -> contrato decide fallback
```

---

## 6. Gap Detection em Conectores

O protocolo de interrogacao (doc 12) se estende naturalmente aos conectores. O gap detector analisa como contratos de negocio usam conectores e identifica lacunas.

### 6.1 Gaps de uso de conector

**Gap: operacao referenciada sem tratamento de erro obrigatorio**

```
AVISO: Voce referenciou stripe.create_charge mas nao tratou os
seguintes erros marcados como obrigatorios no conector:
  - card_declined (frequencia: ~3% das transacoes)
  - insufficient_funds (frequencia: ~1% das transacoes)
  - expired_card (frequencia: ~0.5% das transacoes)

Acao necessaria: adicionar tratamento em @F ou na secao de erros do @X.
```

**Gap: credencial ausente**

```
ERRO: O conector stripe-connector requer STRIPE_API_KEY
mas essa variavel de ambiente nao foi encontrada.

Opcoes:
  1. Definir STRIPE_API_KEY no environment
  2. Configurar vault path: secrets/stripe/api_key
  3. Usar modo test com STRIPE_TEST_KEY
```

**Gap: webhook sem verificacao de assinatura**

```
AVISO: Voce esta recebendo webhooks do Stripe (trigger webhook stripe)
mas nao chamou verify_webhook_signature antes de processar o evento.

Risco: Qualquer pessoa que descubra a URL do webhook pode enviar
eventos falsos. Isso e um vetor de ataque conhecido.

Acao recomendada: adicionar verificacao de assinatura como primeiro
passo do fluxo de execucao.
```

**Gap: rate limit nao considerado em operacao batch**

```
AVISO: Voce esta chamando resend.send_email dentro de um loop (*)
que pode executar ate 10000 vezes. O conector resend define
rate_limit de 10/sec e daily_limit de 100 (free tier).

Problemas potenciais:
  - Com 10000 iteracoes a 10/sec, levaria ~17 minutos
  - Daily limit de 100 seria atingido nas primeiras 10 iteracoes

Sugestao: usar resend.create_batch (maximo 100 por chamada) ou
verificar se o plano suporta o volume necessario.
```

### 6.2 Gaps no proprio conector

O gap detector tambem valida os contratos de conector:

**Gap: operacao sem tratamento de timeout**

```
AVISO no conector s3-connector: a operacao put_object nao define
timeout. Upload de arquivos grandes pode bloquear indefinidamente.

Sugestao: adicionar timeout com valor proporcional ao tamanho
esperado do objeto. Ex: timeout 120s para objetos ate 100MB.
```

**Gap: operacao sem idempotencia**

```
AVISO no conector resend-connector: a operacao send_email e retentavel
(retry_on inclui 429, 500) mas nao define estrategia de idempotencia.

Risco: se o request for bem-sucedido mas a resposta se perder,
o retry enviara o email novamente. Emails duplicados.

Sugestao: adicionar header de idempotencia ou logica de deduplicacao
por content-hash do email.
```

### 6.3 Cross-connector gaps

Quando multiplos conectores sao usados juntos:

```
AVISO: Seu fluxo cria um customer no Stripe e depois persiste
o stripe_id no PostgreSQL, mas nao ha tratamento para o cenario:
  "Stripe cria o customer com sucesso, mas o PostgreSQL falha"

Resultado: customer existe no Stripe mas nao no sistema.
Esse customer sera cobrado mas o sistema nao sabe que ele existe.

Opcoes:
  A) Adicionar compensacao: se persist falhar, deletar customer no Stripe
  B) Usar saga pattern com rollback
  C) Aceitar inconsistencia temporaria e reconciliar via cron
```

---

## 7. Connector Registry

### 7.1 Conceito

O Connector Registry e um repositorio publico de conectores SIML -- o equivalente ao npm para conectores. Qualquer pessoa pode publicar um conector, e qualquer runtime SIML pode consumi-lo.

### 7.2 Estrutura

```
registry.siml.dev/
├── connectors/
│   ├── stripe-connector/
│   │   ├── 1.0.0/
│   │   │   ├── connector.siml    -- o contrato do conector
│   │   │   ├── metadata.json     -- autor, downloads, score
│   │   │   └── tests/            -- testes de validacao
│   │   ├── 1.1.0/
│   │   └── latest -> 1.1.0
│   ├── resend-connector/
│   ├── slack-connector/
│   └── ...
├── primitives/
│   ├── http/
│   ├── sql/
│   └── crypto/
└── categories/
    ├── payments/
    ├── email/
    ├── messaging/
    ├── storage/
    └── database/
```

### 7.3 Versionamento semantico

Conectores seguem SemVer com regras especificas:

- **Patch (1.0.x):** correcoes de typo, melhoria de mensagens de erro, adicao de erros opcionais
- **Minor (1.x.0):** nova operacao adicionada, novos campos opcionais em input/output
- **Major (x.0.0):** remocao de operacao, mudanca de campos obrigatorios, mudanca de semantica

Um contrato de negocio que declara dependencia `#stripe-connector >=1.0.0 <2.0.0` tem garantia de que atualizacoes minor/patch nao quebram seu fluxo.

### 7.4 Validacao automatica

Antes de publicar, o registry valida:

1. **Sintaxe:** o conector parseia sem erros
2. **Completude:** cada operacao tem input, output, e pelo menos um erro tratado
3. **Consistencia:** tipos referenciados existem, enums sao validos
4. **Testabilidade:** existe pelo menos um teste por operacao
5. **Seguranca:** credenciais sao referenciadas por env var, nunca hardcoded

### 7.5 Scoring de qualidade

Cada conector recebe um score de 0-100 baseado em:

| Criterio | Peso | Descricao |
|----------|------|-----------|
| Cobertura de operacoes | 25 | Quantas operacoes da API o conector cobre |
| Tratamento de erros | 25 | Quantos erros possiveis estao catalogados |
| Rate limiting | 15 | Define e respeita rate limits |
| Idempotencia | 15 | Operacoes de escrita tem estrategia de idempotencia |
| Testes | 10 | Numero e qualidade dos testes |
| Documentacao | 10 | Intent claro em cada operacao, exemplos |

**Exemplo de scores:**

```
stripe-connector v1.0.0     Score: 92/100
  Operacoes: 18/25 (72%)    ████████░░ 18
  Erros:     45/52 (87%)    █████████░ 22
  Rate limit: completo       ██████████ 15
  Idempotencia: completo     ██████████ 15
  Testes: 18 testes          █████████░ 9
  Docs: completo             ██████████ 10

obscure-crm-connector v0.3  Score: 41/100
  Operacoes: 3/15 (20%)     ██░░░░░░░░ 5
  Erros:     2/30 (7%)      █░░░░░░░░░ 2
  Rate limit: ausente        ░░░░░░░░░░ 0
  Idempotencia: ausente      ░░░░░░░░░░ 0
  Testes: 0 testes           ░░░░░░░░░░ 0
  Docs: parcial              ███░░░░░░░ 3
```

### 7.6 Community curation

- Conectores com score acima de 80 recebem selo "verified"
- Top 3 conectores por categoria recebem selo "recommended"
- Conectores oficiais (mantidos pela equipe SIML) recebem selo "official"
- Qualquer um pode submeter PR para melhorar um conector existente
- O registry mostra diff semantico entre versoes (quais operacoes mudaram, quais erros foram adicionados)

---

## 8. Auto-Discovery e Auto-Update

### 8.1 A visao ambiciosa

Se a API do Stripe muda, um LLM pode LER a documentacao nova e GERAR o conector atualizado automaticamente. O runtime detecta que o conector esta desatualizado (respostas mudaram), propoe atualizacao com diff semantico, e o humano aprova.

### 8.2 Auto-Discovery: gerar conector a partir de documentacao

**O processo proposto:**

```
1. Input: URL da documentacao da API (ou OpenAPI spec)
   ex: https://stripe.com/docs/api

2. LLM (Claude/GPT-4) le a documentacao e extrai:
   - Base URL
   - Metodo de autenticacao
   - Operacoes disponiveis
   - Input/output de cada operacao
   - Codigos de erro
   - Rate limits

3. LLM gera o conector SIML

4. Validador verifica:
   - Sintaxe correta
   - Tipos consistentes
   - Operacoes fazem sentido semanticamente

5. Testes automaticos:
   - Se a API tem sandbox, testar operacoes reais
   - Se nao, gerar mocks baseados na spec e validar formato

6. Humano revisa e aprova
```

**O que funciona hoje (viavel):**

- Gerar conector a partir de OpenAPI/Swagger spec: FUNCIONA BEM. Uma spec OpenAPI e estruturada o suficiente para que um LLM produza um conector SIML preciso em 90%+ dos casos. A maioria das APIs grandes tem OpenAPI spec disponivel.

- Gerar conector a partir de documentacao HTML: FUNCIONA RAZOAVELMENTE. Documentacoes bem estruturadas (Stripe, Twilio, AWS) produzem conectores de qualidade. Documentacoes mal estruturadas produzem conectores incompletos.

- Validacao sintatica automatica: FUNCIONA. O parser SIML valida se o conector gerado e sintaticamente correto.

**O que NAO funciona ainda (incerto):**

- Cobrir 100% das operacoes de uma API complexa: IMPROVAVEL. APIs como AWS S3 tem 50+ operacoes com comportamentos sutis. Um LLM pode gerar as 10-15 mais comuns com qualidade, mas as operacoes menos documentadas terao gaps.

- Inferir rate limits de documentacao vaga: FALHA FREQUENTE. Muitas APIs documentam rate limits vagamente ("approximately 100 requests per minute") ou nao documentam. O LLM precisa assumir ou pedir input humano.

- Gerar tratamento de erros completo: PARCIAL. O LLM gera erros comuns (401, 404, 429, 500) mas perde erros especificos do dominio (Stripe tem ~40 codigos de erro especificos para pagamentos).

### 8.3 Auto-Update: detectar e adaptar a mudancas

**Deteccao passiva:**

O runtime monitora respostas dos servicos externos. Quando detecta divergencia entre o esperado (conforme o conector) e o recebido (resposta real), gera alerta:

```
DIVERGENCIA DETECTADA em stripe-connector v1.0.0

Operacao: create_charge
Esperado (output spec): { id: str, status: enum, amount: int }
Recebido: { id: str, status: str, amount: int, amount_captured: int, billing_details: {...} }

Diferencas:
  + amount_captured: campo novo nao previsto no conector
  + billing_details: campo novo nao previsto no conector
  ~ status: tipo mudou de enum para str (possivelmente novos valores)

Impacto: BAIXO (campos adicionais sao ignorados pelo runtime)
Acao sugerida: atualizar conector para incluir novos campos

Gerar conector atualizado? [s/n]
```

**Deteccao ativa (mais ambiciosa):**

Um job periodico consulta changelogs de APIs conhecidas e verifica se ha mudancas que impactam conectores:

```
CHANGELOG DETECTADO: Stripe API 2024-12-18 -> 2025-03-01

Mudancas relevantes para stripe-connector v1.0.0:
  - create_charge: DEPRECIADO, substituido por create_payment_intent
  - create_payment_intent: novo campo "automatic_tax" adicionado
  - webhooks: novo tipo de evento "payment_intent.partially_funded"

Impacto no conector:
  ALTO - create_charge depreciado
  BAIXO - create_payment_intent tem campo novo opcional
  MEDIO - novo evento de webhook pode ser relevante

Gerar proposta de atualizacao? [s/n]
```

### 8.4 Avaliacao honesta de viabilidade

| Capacidade | Viavel hoje? | Confiabilidade | Prazo estimado |
|-----------|-------------|----------------|----------------|
| Gerar conector de OpenAPI spec | Sim | 85-90% | Pronto (LLM + parser) |
| Gerar conector de docs HTML | Parcial | 60-75% | 6 meses para qualidade aceitavel |
| Detectar divergencias passivamente | Sim | 95%+ | Implementavel no runtime |
| Detectar changelogs ativamente | Parcial | Depende da API | 12+ meses |
| Auto-corrigir conector sem humano | Nao | < 50% | Nao recomendado |
| Propor correcao para humano aprovar | Sim | 80% | 3-6 meses |

**A regra de ouro:** auto-update PROPOE, humano APROVA. Nenhuma atualizacao automatica de conector entra em producao sem revisao humana. A confianca precisa ser construida gradualmente -- primeiro com propostas que o humano sempre revisa, depois (se a taxa de acerto for >99%) com auto-aprovacao para mudancas de baixo impacto (campos opcionais adicionados).

---

## 9. MCP (Model Context Protocol) vs SIML Connectors

### 9.1 O que e MCP

O Model Context Protocol (Anthropic, 2024) e um protocolo aberto para dar ferramentas a LLMs. Define um padrao para:

- **Tool discovery:** LLM descobre quais ferramentas estao disponiveis
- **Tool execution:** LLM chama ferramentas com parametros tipados
- **Tool response:** ferramenta retorna resultado ao LLM

Um MCP server expoe ferramentas. Um MCP client (tipicamente um LLM) consome. Exemplo de tool MCP:

```json
{
  "name": "stripe_create_charge",
  "description": "Create a new charge in Stripe",
  "inputSchema": {
    "type": "object",
    "properties": {
      "amount": { "type": "integer", "description": "Amount in cents" },
      "currency": { "type": "string", "default": "usd" },
      "source": { "type": "string", "description": "Payment source token" }
    },
    "required": ["amount", "source"]
  }
}
```

### 9.2 Comparacao detalhada

| Aspecto | MCP Tool | SIML Connector |
|---------|----------|----------------|
| **O que descreve** | Como chamar uma funcao | O que um servico faz e como interagir |
| **Granularidade** | Uma funcao por tool | Um servico inteiro com N operacoes |
| **Semantica** | `description` em texto livre | `intent` formal + constraints + error catalog |
| **Tratamento de erros** | Nao especificado no schema | Catalogo completo com acoes por erro |
| **Rate limiting** | Nao especificado | Declarado no contrato, runtime respeita |
| **Autenticacao** | Implementada no server | Declarada no contrato, runtime resolve |
| **Composicao** | Nao tem mecanismo nativo | Conectores referenciam outros conectores |
| **Versionamento** | Nao especificado | SemVer com compatibilidade garantida |
| **Validacao** | JSON Schema basico | Tipos ricos + constraints + gap detection |
| **Evidencia** | Nao tem | Cada chamada gera evidence trail |
| **Quem executa** | O MCP server (codigo) | O runtime SIML (interpretacao de contrato) |

### 9.3 As tres opcoes

**Opcao A: SIML substitui MCP**

SIML Connectors sao mais ricos que MCP tools. Um conector SIML tem tudo que uma MCP tool tem (nome, descricao, input schema, output schema) mais: error catalog, rate limits, auth, composicao, versionamento, e evidence.

Prós: um unico sistema, sem duplicacao de conceitos.
Contras: ignora o ecossistema MCP crescente. MCP ja tem adocao (Claude Desktop, Cursor, Windsurf, outros clientes). Rejeitar MCP e rejeitar um ecosistema.

**Opcao B: SIML complementa MCP (SIML gera MCP tools automaticamente)**

Um conector SIML pode automaticamente gerar MCP tools. Cada operacao de um conector SIML vira uma MCP tool. O SIML Runtime Engine pode funcionar como um MCP server que expoe todas as operacoes de todos os conectores como MCP tools.

```
stripe-connector.siml
  ├── create_charge      -> MCP tool: stripe_create_charge
  ├── create_customer    -> MCP tool: stripe_create_customer
  ├── create_payment_intent -> MCP tool: stripe_create_payment_intent
  └── ...
```

Pros: aproveita o ecossistema MCP. Qualquer MCP client (Claude, GPT, etc.) pode usar conectores SIML. O SIML e mais rico -- a geracao MCP perde error catalog e evidence, mas funciona.

Contras: informacao perdida na traducao. MCP nao tem como expressar rate limits, error catalog, ou evidence. O MCP client nao sabe que nao deve chamar stripe_create_charge mais de 100 vezes por segundo.

**Opcao C: SIML consome MCP (usa MCP servers como primitivos)**

Tratar MCP servers como uma fonte de primitivos. Se ja existe um MCP server para o Slack (com 15 tools implementadas), SIML pode importar esses tools como operacoes de um conector.

```siml
@S slack
  source mcp_server "npx @anthropic/slack-mcp-server"
  import_operations all
  -- ou seletivo:
  import_operations send_message create_channel list_channels

  -- SIML adiciona o que MCP nao tem:
  rate_limit 20/min
  retry_strategy exponential_backoff max 3
  error_enrichment
    channel_not_found -> abort "Canal nao encontrado"
```

Pros: aproveita MCP servers ja existentes. Nao precisa reescrever conectores que MCP ja tem. SIML adiciona a camada semantica (erros, rate limits, evidence) que MCP nao tem.

Contras: dependencia de MCP servers de terceiros. Qualidade variavel. Performance (subprocesso MCP adiciona latencia).

### 9.4 Recomendacao: Opcao B + C (hibrido pragmatico)

A melhor estrategia e bidirecional:

**SIML -> MCP (Opcao B):** O SIML Runtime Engine funciona como MCP server. Isso permite que qualquer LLM com MCP client use os conectores SIML. Isso da distribuicao imediata -- qualquer usuario de Claude Desktop, Cursor, ou outro MCP client pode acessar o ecossistema de conectores SIML sem instalar nada novo.

**MCP -> SIML (Opcao C):** O runtime pode importar MCP servers existentes como fontes de operacoes, adicionando a camada SIML (erros, rate limits, evidence, gap detection) por cima. Isso permite adocao rapida -- em vez de escrever 400 conectores do zero, importa os MCP servers que ja existem e gradualmente os substitui por conectores SIML nativos quando a qualidade nao for suficiente.

**A longo prazo:** conectores SIML nativos sao superiores (mais ricos, mais seguros, com gap detection). Mas MCP e a ponte que permite chegar la sem precisar de 400 conectores no dia 1.

Sequencia recomendada:
1. MVP com 10 conectores SIML nativos (secao 12)
2. SIML Runtime como MCP server (exposicao imediata)
3. Import de MCP servers populares como primitivos
4. Gradual substituicao por conectores SIML nativos conforme a qualidade importa

---

## 10. Connector como Contrato Bilateral

### 10.1 O conceito

Um conector tradicional e unidirecional: "eu faco requests para a API do Stripe." Um conector SIML e um CONTRATO bilateral: ambas as partes tem obrigacoes e expectativas.

### 10.2 Obrigacoes de cada lado

**O SIML se compromete a:**

```siml
@K connector_obligations
  -- Respeitar rate limits
  requests_per_second <= stripe.rate_limit
    severity fatal
    message "Runtime NUNCA excede rate limit declarado"

  -- Enviar dados validos
  input matches operation.input.spec
    severity fatal
    message "Runtime valida todo input antes de enviar"

  -- Tratar erros conforme o catalogo
  forall error in operation.errors : error.handled
    severity fatal
    message "Todo erro catalogado tem tratamento definido"

  -- Nao enviar credenciais em logs
  api_key not_in evidence.trace
    severity fatal
    message "Credenciais nunca aparecem em evidence ou logs"

  -- Usar idempotencia quando disponivel
  ? operation.idempotency : include_idempotency_key
    severity warning
    message "Operacoes idealmente incluem chave de idempotencia"
```

**O servico externo se compromete a (expectativa):**

```siml
@K service_expectations
  -- Responder no formato documentado
  response matches operation.output.spec
    on_violation detect_divergence

  -- Retornar codigos HTTP semanticamente corretos
  success implies http_status in 200..299
  client_error implies http_status in 400..499
  server_error implies http_status in 500..599

  -- Manter backward compatibility dentro da versao
  api_version = connector.api_version implies no_breaking_changes

  -- Respeitar o contrato de webhook
  ? webhook : webhook.payload matches declared_schema
  ? webhook : webhook.signature verifiable with declared_algorithm
```

### 10.3 Quando o servico "quebra" o contrato

Se o servico retorna algo fora do esperado, o runtime detecta e age:

```
ALERTA: Violacao de contrato bilateral detectada

Conector: stripe-connector v1.0.0
Operacao: create_charge
Timestamp: 2026-03-13T14:22:00Z

Esperado: response.status in enum(succeeded, pending, failed)
Recebido: response.status = "requires_action"

Classificacao: EVOLUCAO DE API (novo valor de enum)
Impacto: MEDIO (valor desconhecido nao e tratado pelo contrato de negocio)

Acoes executadas:
  1. Request completou com sucesso (HTTP 200)
  2. Campo desconhecido foi logado em evidence
  3. Alerta enviado para ops_team
  4. Contrato de negocio recebeu erro: "status desconhecido"

Acao recomendada: atualizar conector para incluir "requires_action"
no enum de status e adicionar tratamento no contrato de negocio.
```

### 10.4 Por que bilateral importa

O modelo bilateral transforma conectores de "codigo que faz HTTP" para "acordo entre duas partes." Isso permite:

1. **Deteccao precoce de mudancas de API** -- qualquer resposta fora do contrato gera alerta
2. **Auditoria de compliance** -- o runtime PROVA que respeitou rate limits e enviou dados validos
3. **Diagnostico automatico** -- quando algo falha, o runtime sabe se o problema e "nosso" (input invalido) ou "deles" (resposta inesperada)
4. **Negociacao de SLA** -- o conector formaliza o que esperar do servico, criando base para SLAs verificaveis

---

## 11. Exemplo End-to-End

### 11.1 Cenario

Contrato de negocio: "Quando um cliente se cadastra, criar conta no Stripe, enviar email de boas-vindas, e notificar a equipe no Slack."

### 11.2 Os tres conectores necessarios

O sistema usa: `stripe-connector`, `resend-connector`, `slack-connector` (definidos nas secoes 3.1, 3.2, 3.4).

### 11.3 Contrato de negocio (primeira versao)

```siml
siml v1

@C customer.onboarding 1.0.0
  domain commerce.customers
  author tradutor:claude-opus@4
  created 2026-03-13T10:00:00Z
  tags onboarding critical

@I
  natural "Cadastrar novo cliente com conta Stripe, email de boas-vindas e notificacao interna"
  goal customer.persisted & customer.stripe_synced & customer.welcomed & team.notified
  accept
    "Cliente salvo no banco com ID gerado"
    "Customer criado no Stripe com stripe_id vinculado"
    "Email de boas-vindas enviado"
    "Equipe notificada no Slack"
  reject
    "Cadastrar sem criar conta Stripe"
    "Enviar email para endereco invalido"
    "Notificar com dados incompletos"
  priority normal
  timeout 15s

@T
  http POST /api/customers
    auth bearer_token
    rate_limit 50/min

@E
  customer
    id id ~
    email str !*^
    name str !
    company str ?
    stripe_id str ~
    status enum(active,inactive) =active
    created_at ts ~

@K
  email unique within customers
    severity fatal
    message "Email ja cadastrado"
  email matches rfc5322
    severity fatal
    message "Email invalido"
  name min 2
    severity fatal
    message "Nome muito curto"

@D
  #stripe-connector >=1.0.0 <2.0.0
  #resend-connector >=1.0.0 <2.0.0
  #slack-connector >=1.0.0 <2.0.0

@X
  validate_input
    >> check_email_format email
    >> check_duplicate email within customers
  <> stripe.create_customer
    send email name
    receive stripe_id
  persist customer
  emit customer.created
  -- paralelo: email e slack nao dependem um do outro
  <> resend.send_email | <> slack.send_notification
    -- email
    send from "Acme <welcome@acme.com>" to email subject "Bem-vindo!" html welcome_template(name)
    -- slack
    send channel "#new-customers" title "Novo cliente" body "{name} ({email})" level info
```

### 11.4 Gap detection identifica problemas

O gap detector analisa o contrato e retorna:

```
╭─────────────────────────────────────────────────────────────╮
│  GAP DETECTION: customer.onboarding v1.0.0                   │
│  Encontrados: 5 gaps (2 criticos, 2 warnings, 1 info)       │
╰─────────────────────────────────────────────────────────────╯

CRITICO #1: Stripe pode rejeitar o email
  Contexto: stripe.create_customer recebe email que pode ser
  sintaticamente valido (RFC 5322) mas rejeitado pelo Stripe
  (ex: dominio inexistente).
  Pergunta: O que acontece se o Stripe rejeitar o email?
  Sugestao: adicionar fallback ou notificar usuario com mensagem
  especifica.

CRITICO #2: Sem compensacao se Stripe OK mas persist falha
  Contexto: se <> stripe.create_customer sucede mas 'persist customer'
  falha (ex: banco indisponivel), o customer existe no Stripe mas
  nao no sistema local.
  Pergunta: desfazer o customer no Stripe? Ou reconciliar depois?
  Sugestao: adicionar compensacao (@F on db_failure -> delete stripe
  customer) ou saga com reconciliacao.

WARNING #1: Email pode bouncer
  Contexto: resend.send_email pode falhar com sender_not_verified
  ou o email pode bouncer (hard bounce).
  Pergunta: se o email de boas-vindas falhar, o cadastro ainda
  e valido? Ou o email e obrigatorio para ativacao?
  Sugestao: tratar como nao-bloqueante (cliente cadastrado, email
  reenviado via cron) ou bloqueante (cadastro incompleto sem email).

WARNING #2: Slack pode estar fora do ar
  Contexto: slack.send_notification pode falhar (bot nao no canal,
  rate limit, Slack indisponivel).
  Pergunta: notificacao Slack e obrigatoria ou best-effort?
  Sugestao: ~> (fire and forget) em vez de <> (exchange sincrono)
  se a notificacao nao for critica.

INFO #1: Template de email nao definido
  Contexto: welcome_template(name) referenciado mas nao existe
  definicao de template no sistema.
  Sugestao: definir template ou usar texto inline.
```

### 11.5 Contrato corrigido apos gap detection

```siml
siml v1

@C customer.onboarding 1.1.0
  domain commerce.customers
  author tradutor:claude-opus@4
  created 2026-03-13T10:00:00Z
  tags onboarding critical

@I
  natural "Cadastrar novo cliente com conta Stripe, email de boas-vindas e notificacao interna"
  goal customer.persisted & customer.stripe_synced & customer.welcomed & team.notified
  accept
    "Cliente salvo no banco com ID gerado"
    "Customer criado no Stripe com stripe_id vinculado"
    "Email de boas-vindas enviado (ou enfileirado para retry)"
    "Equipe notificada no Slack (best-effort)"
  reject
    "Cadastrar sem criar conta Stripe"
    "Perder customer criado no Stripe se persist falhar"
  priority normal
  timeout 15s

@T
  http POST /api/customers
    auth bearer_token
    rate_limit 50/min

@E
  customer
    id id ~
    email str !*^
    name str !
    company str ?
    stripe_id str ~
    status enum(active,inactive) =active
    created_at ts ~

@K
  email unique within customers
    severity fatal
    message "Email ja cadastrado"
  email matches rfc5322
    severity fatal
    message "Email invalido"
  name min 2
    severity fatal
    message "Nome muito curto"

@D
  #stripe-connector >=1.0.0 <2.0.0
  #resend-connector >=1.0.0 <2.0.0
  #slack-connector >=1.0.0 <2.0.0

@X
  -- Passo 1: validacao
  validate_input
    >> check_email_format email
    >> check_duplicate email within customers

  -- Passo 2: criar customer no Stripe
  <> stripe.create_customer
    send email name
    receive stripe_id

  -- Passo 3: persistir no banco (com compensacao se falhar)
  persist customer

  -- Passo 4: emitir evento
  emit customer.created

  -- Passo 5: email e Slack em paralelo, ambos fire-and-forget
  ~> resend.send_email
    send from "Acme <welcome@acme.com>" to email subject "Bem-vindo a Acme!" html welcome_template(name)
  ~> slack.send_notification
    send channel "#new-customers" title "Novo cliente" body "{name} ({email})" level info

@F
  -- Se Stripe rejeitar o email
  on stripe.email_invalid
    abort "Email rejeitado pelo Stripe. Verifique o endereco."

  -- Se persist falhar APOS Stripe criar customer
  on persist_failure after stripe.create_customer
    compensate
      <> stripe.delete_customer
        send id stripe_id
    abort "Falha ao salvar cliente. Customer Stripe removido. Tente novamente."

  -- Se email bouncer
  on resend.send_email_failure
    enqueue retry_welcome_email
      delay 5m
      max_attempts 3
    log_warning "Email de boas-vindas nao enviado, enfileirado para retry"

  -- Se Slack falhar
  on slack.send_notification_failure
    log_warning "Notificacao Slack falhou -- nao-bloqueante"

@V
  -- preenchido pos-execucao
```

### 11.6 O que mudou entre v1.0 e v1.1

1. **Adicionada compensacao** para o cenario "Stripe OK, persist falha" -- o customer no Stripe e deletado para evitar inconsistencia
2. **Email mudou para fire-and-forget** (`~>` em vez de `<>``) -- se o email falhar, nao bloqueia o cadastro; entra em fila de retry
3. **Slack mudou para fire-and-forget** -- notificacao e best-effort, nao critica
4. **Fallback explicito** para cada cenario de falha identificado pelo gap detector
5. **Accept criteria atualizado** para refletir que email pode ser "enfileirado" e Slack e "best-effort"

---

## 12. Impacto: Por que Connectors-as-Contracts e Superior

### 12.1 Os argumentos a favor

**Sem codigo: qualquer um cria um conector.**

Um conector SIML e um contrato descritivo. Nao precisa saber TypeScript, nao precisa entender HTTP clients, nao precisa configurar test runners. Se voce sabe ler a documentacao de uma API, voce sabe escrever (ou pedir a um LLM que gere) um conector SIML. Isso reduz a barreira de criacao de conectores de "preciso ser dev backend" para "preciso entender a API".

**Gap detection nos conectores: qualidade garantida.**

Nenhuma plataforma existente diz "seu conector nao trata timeout" ou "voce esqueceu de validar a assinatura do webhook." O gap detector SIML aplica a mesma analise rigorosa a conectores que aplica a contratos de negocio. Resultado: conectores com menos lacunas, por design.

**Auto-update proposto: documentacao da API gera conector atualizado.**

Quando a Stripe publica uma nova versao de API, um LLM pode ler o changelog e propor um patch no conector. O humano revisa e aprova. Em vez de uma equipe de 30 pessoas atualizando 400 conectores manualmente, um LLM propoe e um humano valida.

**Composicao semantica: conectores se combinam por significado.**

Um contrato de negocio diz "enviar email de boas-vindas" e o runtime sabe que precisa do `resend-connector`, operacao `send_email`. Nao e necessario wiring manual entre componentes. O significado da operacao (intent) conecta as pecas.

**Community-driven: registry aberto.**

O registry de conectores e um commons. Qualquer um publica, qualquer um usa. A mesma dinamica que fez npm e Docker Hub crescerem exponencialmente. Um conector de qualidade para o Stripe beneficia TODOS os usuarios SIML, nao apenas uma plataforma.

**Evidence trail em integracoes.**

Cada chamada a um conector gera evidence. "As 14:22:00 chamamos Stripe, enviamos X, recebemos Y, demorou 342ms." Isso e ouro para debug, compliance e auditoria. Plataformas tradicionais tem logs, mas nao evidence semantica.

### 12.2 Os argumentos contra (honestidade)

**Latencia: resolver um contrato SIML e mais lento que executar codigo compilado.**

Um conector n8n em TypeScript compila para JavaScript, que o V8 executa em microsegundos. Um conector SIML e lido, interpretado, e traduzido em chamada de primitivo pelo runtime. Overhead estimado: 1-5ms por operacao de conector. Para a maioria dos cenarios (automacao, webhooks, cron jobs), 5ms extras sao irrelevantes. Para cenarios de latencia critica (trading, gaming), pode ser um problema.

Mitigacao: cache de conectores parseados. O runtime parseia o conector uma vez e cacheia a estrutura em memoria. Resolucoes subsequentes sao lookups, nao re-parsing.

**Confiabilidade: codigo e deterministico, SIML depende de interpretacao correta.**

Se o runtime SIML tem um bug na montagem de headers HTTP, TODOS os conectores sao afetados. Em codigo, cada conector e independente -- um bug no conector do Stripe nao afeta o conector do Slack. Em SIML, o runtime e single point of failure.

Mitigacao: testes extensivos do runtime. Os primitivos (http, sql, crypto) sao codigo testado exaustivamente. Erros de interpretacao de conector sao detectaveis por testes de contrato (spec diz X, runtime monta Y, comparar).

**Edge cases: APIs bizarras que nao se encaixam em contratos padronizados.**

A API do Stripe e bem desenhada. A API de um ERP legado de 2003 pode ter: autenticacao por cookie + CSRF token, endpoints que retornam HTML em vez de JSON, campos que mudam de tipo dependendo do valor de outro campo. Nem toda API se encaixa em um contrato limpo.

Mitigacao: o primitivo `http` e generico o suficiente para lidar com qualquer HTTP. Conectores para APIs bizarras podem ter secoes `raw` que passam requests quase sem processamento. Mas o gap detection nessas secoes sera limitado.

**Bootstrap: o dia 1 nao tem 400 conectores.**

O n8n tem 400+ conectores hoje. O SIML comeca com 10. Para um usuario que precisa de um conector que nao existe, SIML nao resolve o problema. E preciso massa critica de conectores para competir.

Mitigacao: a opcao MCP hybrid (secao 9.4) resolve temporariamente. MCP servers existentes sao importados como primitivos. Mas a longo prazo, conectores SIML nativos sao necessarios.

---

## 13. MVP: Os 10 Primeiros Conectores

### 13.1 Criterios de selecao

Os 10 primeiros conectores devem:
1. Cobrir os cenarios mais comuns de startups e PMEs
2. Demonstrar o poder do modelo connectors-as-contracts
3. Ser testáveis sem custo (APIs com sandbox/free tier)
4. Ter documentacao excelente (para auto-discovery funcionar)

### 13.2 A lista

#### 1. HTTP Generico (qualquer API REST)

**Por que e essencial:** cobre qualquer API que nao tenha conector dedicado. E o "escape hatch" universal. Um usuario que precisa falar com uma API obscura pode usar o conector HTTP generico no dia 1.

**Complexidade SIML:** Baixa. O conector e fino -- praticamente um wrapper sobre o primitivo http com config de auth, headers, e retry.

**Estimativa:** ~100 linhas SIML. 1 dia de trabalho.

```siml
@S http-generic
  operations
    request
      intent "Fazer request HTTP para qualquer URL"
      input
        method enum(GET,POST,PUT,DELETE,PATCH,HEAD) !
        url str !
        headers map[str,str] ?
        body any ?
        auth
          type enum(none,bearer,basic,api_key,custom) =none
          -- campos condicionais por tipo
        timeout dur =30s
      output
        status int
        headers map[str,str]
        body any
        duration dur
```

#### 2. PostgreSQL/SQLite

**Por que e essencial:** todo backend precisa de banco de dados. PostgreSQL e o banco padrao para producao, SQLite para prototipacao rapida. O conector cobre ambos com a mesma interface.

**Complexidade SIML:** Media. Queries SQL, transacoes, migrações, pool de conexoes. Os error codes de PostgreSQL sao muitos (~200 codigos), mas os 15 mais comuns cobrem 99% dos casos.

**Estimativa:** ~250 linhas SIML. 3 dias de trabalho.

#### 3. Stripe

**Por que e essencial:** pagamentos sao o use case mais citado em automacao. Stripe e o padrao da industria. Demonstra o poder dos conectores SIML no caso de uso mais visivel.

**Complexidade SIML:** Alta. Stripe tem ~150 operacoes. O MVP cobre 15-20 mais comuns: charges, customers, payment intents, subscriptions, webhooks. Erros de pagamento sao complexos e variados (~40 codigos especificos).

**Estimativa:** ~500 linhas SIML para MVP (20 operacoes). 5 dias de trabalho.

#### 4. SendGrid/Resend

**Por que e essencial:** email transacional e obrigatorio para qualquer SaaS. Resend e a escolha por simplicidade de API (10x mais simples que SendGrid). SendGrid tem mais adocao mas API mais complexa.

**Complexidade SIML:** Baixa. 3-5 operacoes: send, batch send, check status. Poucos erros possiveis.

**Estimativa:** ~120 linhas SIML. 1 dia de trabalho.

#### 5. Slack

**Por que e essencial:** notificacao interna e o segundo caso de uso mais citado apos pagamentos. Slack e o padrao para equipes tech. O conector tambem demonstra WebSocket (Socket Mode) como primitivo.

**Complexidade SIML:** Media. A API do Slack tem centenas de metodos, mas o MVP cobre 5: send message, send notification, create channel, list channels, listen events. Rate limiting por tier adiciona complexidade.

**Estimativa:** ~200 linhas SIML. 2 dias de trabalho.

#### 6. Webhook Generico (inbound + outbound)

**Por que e essencial:** webhooks sao o mecanismo padrao de integracao event-driven. Qualquer servico que nao tenha conector dedicado pode integrar via webhook. Cobre inbound (receber) e outbound (enviar).

**Complexidade SIML:** Baixa. Verificacao de assinatura, idempotencia, retry. Poucos erros possiveis, mas idempotencia e verificacao de assinatura sao criticos.

**Estimativa:** ~150 linhas SIML. 2 dias de trabalho.

#### 7. Cron/Scheduler

**Por que e essencial:** tarefas agendadas sao fundamentais: cobranca diaria, limpeza semanal, relatorios mensais. Nao e um conector externo -- e uma capacidade built-in do runtime, mas a interface SIML segue o mesmo padrao.

**Complexidade SIML:** Baixa. Expressao cron, timezone, retry policy, at-least-once semantics. O Scheduler ja esta descrito no doc 06, secao 3.

**Estimativa:** ~80 linhas SIML. 1 dia de trabalho (a logica ja existe no runtime).

#### 8. AWS S3

**Por que e essencial:** armazenamento de arquivos e universal. Upload de imagens, export de relatorios, backup de dados. S3 e o padrao de facto. Demonstra auth AWS Signature V4 (mais complexa que bearer token).

**Complexidade SIML:** Media. AWS Signature V4 e o principal desafio. As operacoes em si sao simples. Presigned URLs sao uma operacao local (sem HTTP), o que demonstra `local true`.

**Estimativa:** ~200 linhas SIML. 3 dias de trabalho (2 dias para auth AWS).

#### 9. OpenAI/Claude API

**Por que e essencial:** LLM-as-a-service e o cenario de meta-referencia: SIML usando LLMs para processar dados que SIML orquestra. Util para: sumarizacao, classificacao, extracao de dados, geracao de conteudo.

**Complexidade SIML:** Media. Chat completions, embeddings, e moderacao sao as 3 operacoes essenciais. Streaming e o desafio tecnico (Server-Sent Events sobre HTTP).

**Estimativa:** ~180 linhas SIML. 2 dias de trabalho.

```siml
@S openai
  auth
    type bearer_token
    header Authorization
    format "Bearer {api_key}"
    env OPENAI_API_KEY
  base_url "https://api.openai.com/v1"
  rate_limit
    tier1 60/min -- free tier
    tier2 5000/min -- paid tier

  operations
    chat_completion
      method POST
      path "/chat/completions"
      intent "Gerar resposta de um modelo de linguagem"
      input
        model str ! -- ex: gpt-4o, gpt-4o-mini
        messages list[message] !
          message
            role enum(system,user,assistant) !
            content str !
        temperature dec ? =1.0
          min 0.0
          max 2.0
        max_tokens int ?
        stream bool =false
      output
        id str
        choices list[choice]
          choice
            message
              role str
              content str
            finish_reason enum(stop,length,content_filter)
        usage
          prompt_tokens int
          completion_tokens int
          total_tokens int
      errors
        rate_limited
          http_status 429
          action retry with_backoff using header Retry-After
        context_length_exceeded
          code "context_length_exceeded"
          action abort "Mensagem excede o limite do modelo"
        content_filtered
          code "content_filter"
          action log_warning "Conteudo filtrado pela moderacao"
```

#### 10. SMTP Generico

**Por que e essencial:** alternativa ao Resend/SendGrid para quem tem servidor SMTP proprio. Empresas maiores frequentemente tem SMTP interno. Demonstra uso do primitivo `smtp` em vez do `http`.

**Complexidade SIML:** Baixa-media. Envio basico e simples. Attachments e TLS adicionam complexidade. Os erros SMTP sao codigos numericos (550, 553, etc.) menos amigaveis que HTTP.

**Estimativa:** ~130 linhas SIML. 1.5 dias de trabalho.

### 13.3 Resumo de estimativas

| # | Conector | Linhas SIML | Dias | Primitivo |
|---|----------|------------|------|-----------|
| 1 | HTTP Generico | ~100 | 1 | http |
| 2 | PostgreSQL/SQLite | ~250 | 3 | sql |
| 3 | Stripe | ~500 | 5 | http + crypto |
| 4 | Resend | ~120 | 1 | http |
| 5 | Slack | ~200 | 2 | http + ws |
| 6 | Webhook Generico | ~150 | 2 | http + crypto |
| 7 | Cron/Scheduler | ~80 | 1 | (built-in) |
| 8 | AWS S3 | ~200 | 3 | http + crypto |
| 9 | OpenAI/Claude | ~180 | 2 | http |
| 10 | SMTP Generico | ~130 | 1.5 | smtp |

**Total: ~1910 linhas SIML. ~21.5 dias de trabalho (1 pessoa, ~1 mes).**

Com 2 pessoas em paralelo: ~2.5 semanas.

Isso cobre: pagamentos, email, banco de dados, mensageria, storage, webhooks, scheduling, LLMs, e qualquer API REST via conector generico. Suficiente para construir um SaaS completo.

---

## 14. Proximos Passos

### 14.1 Sequencia de implementacao recomendada

**Semana 1-2: Infraestrutura**
1. Implementar os 3 primitivos minimos: `http`, `sql`, `crypto`
2. Implementar o loader de conector (parsear SIML connector, cachear em memoria)
3. Implementar o resolver (contrato de negocio -> conector -> primitivo)
4. Implementar o evidence recorder para chamadas de conector

**Semana 3-4: Primeiros conectores**
5. HTTP Generico (prova que o sistema funciona)
6. PostgreSQL (prova que primitivos nao-HTTP funcionam)
7. Stripe (prova que conectores complexos funcionam)
8. Resend + Webhook Generico (prova composicao)

**Semana 5-6: Restante do MVP**
9. Slack, S3, OpenAI/Claude, SMTP, Cron
10. Gap detection para conectores
11. Connector Registry local (filesystem-based, sem server)

**Semana 7-8: Distribuicao**
12. SIML Runtime como MCP server
13. Import de MCP servers como primitivos
14. Documentacao e primeiros exemplos end-to-end

### 14.2 Metricas de sucesso

- 10 conectores publicados com score > 75/100
- Gap detector identifica pelo menos 3 gaps em um contrato de exemplo que usa 3 conectores
- Um SaaS completo (o caso do doc 08) roda inteiramente com conectores SIML
- Latencia de conector < 10ms de overhead sobre a latencia da API externa
- Zero credenciais expostas em evidence ou logs

### 14.3 O que este documento define

Este documento define a camada que conecta SIML ao mundo real. Sem conectores, SIML e uma linguagem que descreve intencoes no vacuo. Com conectores-as-contracts, SIML e uma linguagem que descreve intencoes E as executa, falando com qualquer servico externo usando a mesma linguagem que descreve regras de negocio.

A proposta e ambiciosa mas pragmatica: comeca com 3 primitivos e 10 conectores, cresce organicamente via registry comunitario, e usa MCP como ponte para o ecossistema existente enquanto a massa critica de conectores nativos e construida.

O unico codigo real e o runtime e os primitivos. Todo o resto -- toda a inteligencia de como falar com Stripe, Slack, PostgreSQL, e qualquer outro servico -- e SIML sobre SIML.
