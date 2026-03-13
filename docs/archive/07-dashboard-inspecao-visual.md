# 07 - Dashboard de Inspecao Visual e Operacao do SIML Runtime Engine

> Design detalhado da interface web onde humanos inspecionam, monitoram, comandam e expandem sistemas semanticos rodando no SIML Runtime Engine. Nao e um IDE — e um observatorio com sala de comando.

---

## 1. Filosofia do Dashboard

### 1.1 O que este dashboard NAO e

Este dashboard nao e um IDE. Nao e um editor de codigo. Nao e um lugar onde o humano escreve contratos manualmente, arrasta blocos visuais ou configura JSONs.

O modelo mental correto e outro:

```
IDE tradicional                    Dashboard SIML
━━━━━━━━━━━━━━━                    ━━━━━━━━━━━━━━
Humano escreve codigo              Humano conversa com LLM
Humano compila                     Engine executa contratos
Humano depura linha a linha        Dashboard mostra evidencia
Humano deploya                     Sistema ja esta rodando
Humano monitora logs               Dashboard explica o que aconteceu
```

### 1.2 Principios fundamentais

**Observatorio, nao oficina.** O dashboard mostra tudo que esta acontecendo no engine em tempo real. Contratos ativos, execucoes em andamento, erros, integrações — tudo visivel, tudo rastreavel.

**Sala de comando, nao sala de codigo.** O humano da ordens em linguagem natural. "Crie um endpoint que recebe pagamentos." O LLM traduz isso em contratos semanticos. O humano revisa, confirma, e o sistema evolui.

**Confianca atraves de transparencia.** Cada decisao que o engine toma e explicavel. Cada execucao tem um trace completo. Cada mudanca tem autor, timestamp e motivo. Nada e magico — tudo e auditavel.

**Confirmacao humana obrigatoria.** O LLM propoe. O humano dispoe. Nenhuma mudanca estrutural e aplicada sem aprovacao explicita. O dashboard e o ponto de controle onde a autoridade humana se manifesta.

```
CICLO DE OPERACAO DO DASHBOARD

  ┌──────────────────────────────────────────────────┐
  │                                                  │
  │   OBSERVAR ───► ENTENDER ───► COMANDAR           │
  │       │              │             │              │
  │   Dashboard      Evidencia     Chat LLM          │
  │   mostra o       explica o     executa a         │
  │   estado         por que       intencao          │
  │       │              │             │              │
  │       └──────────────┴─────────────┘              │
  │                    │                              │
  │              CONFIRMAR                            │
  │           (humano aprova)                         │
  │                    │                              │
  │               EVOLUIR                             │
  │          (sistema se adapta)                      │
  │                                                  │
  └──────────────────────────────────────────────────┘
```

### 1.3 Quem usa este dashboard

| Persona          | Uso principal                                      | Frequencia      |
|------------------|----------------------------------------------------|-----------------|
| Fundador tecnico | Cria e evolui o sistema via chat                   | Diaria          |
| Operador         | Monitora saude, pausa/retoma contratos             | Continua        |
| Auditor          | Revisa traces, verifica conformidade               | Semanal         |
| Desenvolvedor    | Testa endpoints, inspeciona dados                  | Diaria          |
| Gestor           | Ve metricas de uso, custo, erros                   | Semanal         |

---

## 2. Telas Principais

### 2.1 Tela 1: Overview / Home

A tela inicial e o painel de controle central. Mostra a saude geral do sistema em um unico olhar.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ◉ SIML Engine    [meu-projeto]                    ▣ Operator  │ ⚙ │ 👤  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌────────┐│
│  │  CONTRATOS       │  │  EXECUCOES 24H  │  │  ERROS          │  │ UPTIME ││
│  │                  │  │                  │  │                  │  │        ││
│  │   12 ativos      │  │   1.847          │  │   3 erros       │  │ 99.8%  ││
│  │    2 pausados    │  │   ▂▃▅▇▆▅▃▄▅▇▅▃ │  │   ↓ 40% vs ontem│  │ 30 dias││
│  │    1 com erro    │  │                  │  │                  │  │        ││
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  └────────┘│
│                                                                             │
│  CONTRATOS ATIVOS                                              [+ Novo]    │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  │ Status │ Nome                        │ Tipo     │ Execucoes │ Ultimo   ││
│  │────────│─────────────────────────────│──────────│───────────│──────────││
│  │ ● ativo│ processar-pedido            │ endpoint │    342    │ 2min     ││
│  │ ● ativo│ validar-estoque             │ endpoint │    341    │ 2min     ││
│  │ ● ativo│ cobrar-stripe               │ endpoint │    298    │ 5min     ││
│  │ ● ativo│ notificar-envio             │ evento   │    156    │ 12min    ││
│  │ ● ativo│ relatorio-diario            │ cron     │      1   │ 6h       ││
│  │ ◐ pausa│ sync-erp-legado             │ cron     │      0   │ 2d       ││
│  │ ✖ erro │ importar-catalogo           │ cron     │      0   │ 1h       ││
│  │        │ └─ "Timeout ao conectar     │          │          │          ││
│  │        │    API do fornecedor"       │          │          │          ││
│  │                                                                         │
│  EXECUCOES RECENTES                                                        │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  │ 14:32:01 │ ● sucesso │ processar-pedido    │ pedido #4821 │ 230ms   ││
│  │ 14:31:58 │ ● sucesso │ validar-estoque     │ SKU-99201    │  45ms   ││
│  │ 14:31:55 │ ● sucesso │ cobrar-stripe       │ R$ 189,90    │ 1.2s    ││
│  │ 14:30:12 │ ✖ falha   │ importar-catalogo   │ timeout      │ 30s     ││
│  │ 14:28:44 │ ● sucesso │ notificar-envio     │ pedido #4819 │ 890ms   ││
│  │ 14:25:01 │ ● sucesso │ relatorio-diario    │ 23 pedidos   │ 4.2s    ││
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│  │ 💬 Chat │  "O que voce gostaria de fazer?"                     [►]    ││
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Elementos-chave:**

- **Cards de metricas** no topo: visao instantanea dos numeros criticos
- **Sparkline** de execucoes: padrao visual das ultimas 24h sem precisar de graficos pesados
- **Lista de contratos**: ordenada por atividade recente, com status visual imediato
- **Erro inline**: quando um contrato esta em erro, a razao aparece direto na lista
- **Execucoes recentes**: feed em tempo real via WebSocket/SSE
- **Chat embutido**: barra de comando sempre acessivel no rodape

**Cores de status:**

```
● verde   = ativo, saudavel, sucesso
◐ amarelo = pausado, aguardando
✖ vermelho = erro, falha
○ cinza   = inativo, desabilitado
```

---

### 2.2 Tela 2: Contrato Individual

A tela de contrato individual e a visao mais importante do dashboard. Ela mostra um contrato em tres camadas — exatamente como definido na especificacao SIML.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ◉ SIML Engine  ›  Contratos  ›  processar-pedido          ● Ativo  v2.1  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                      │
│  │ Intencao │ │ Execucao │ │Evidencia │ │Historico │                      │
│  │  ▔▔▔▔▔▔  │ │          │ │          │ │          │                      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘                      │
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════    │
│  ABA: INTENCAO                                                             │
│  ═══════════════════════════════════════════════════════════════════════    │
│                                                                             │
│  O QUE FAZ                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Recebe um pedido via API REST (POST /api/pedidos), valida os      │   │
│  │  dados do cliente e dos itens, verifica disponibilidade de          │   │
│  │  estoque para cada item, e se tudo estiver valido, cria o          │   │
│  │  pedido no sistema com status "pendente_pagamento".                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  OBJETIVO                                                                  │
│  Criar pedido valido no sistema com garantia de estoque reservado.         │
│                                                                             │
│  RESTRICOES                                                                │
│  • Todos os itens devem ter estoque disponivel                             │
│  • Cliente deve ter cadastro ativo                                         │
│  • Valor minimo do pedido: R$ 10,00                                        │
│  • Maximo de 50 itens por pedido                                           │
│                                                                             │
│  CRITERIOS DE ACEITE                                                       │
│  ✓ Pedido criado com ID unico                                              │
│  ✓ Estoque reservado para cada item                                        │
│  ✓ Evento "pedido.criado" emitido                                          │
│  ✓ Resposta HTTP 201 com dados do pedido                                   │
│                                                                             │
│  CRITERIOS NEGATIVOS                                                       │
│  ✗ Nao deve criar pedido com estoque insuficiente                          │
│  ✗ Nao deve cobrar antes da confirmacao                                    │
│  ✗ Nao deve expor dados de pagamento na resposta                           │
│                                                                             │
│  META                                                                      │
│  ┌────────────────────────────────────────────────────┐                    │
│  │ Tipo: endpoint                                     │                    │
│  │ Rota: POST /api/pedidos                            │                    │
│  │ Prioridade: critical                               │                    │
│  │ Timeout: 10s                                       │                    │
│  │ Criado por: usuario@email.com                      │                    │
│  │ Criado em: 2026-03-10 14:22:01 UTC                 │                    │
│  │ Versao: 2.1.0                                      │                    │
│  └────────────────────────────────────────────────────┘                    │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│  [⏸ Pausar]  [📋 Duplicar]  [💬 Perguntar ao LLM]  [🗑 Remover]          │
│  ─────────────────────────────────────────────────────────────────────────  │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Aba Execucao** — mostra o fluxo visual de como o contrato executa:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ═══════════════════════════════════════════════════════════════════════    │
│  ABA: EXECUCAO                                                             │
│  ═══════════════════════════════════════════════════════════════════════    │
│                                                                             │
│  FLUXO DE EXECUCAO (DAG)                                                   │
│                                                                             │
│  ┌───────────────┐                                                         │
│  │  HTTP Request  │                                                         │
│  │  POST /pedidos │                                                         │
│  └───────┬───────┘                                                         │
│          │                                                                  │
│          ▼                                                                  │
│  ┌───────────────┐     ┌───────────────┐                                   │
│  │ Validar dados │────►│ Validar       │                                   │
│  │ do payload    │     │ cliente ativo │                                   │
│  └───────┬───────┘     └───────┬───────┘                                   │
│          │                     │                                            │
│          └──────────┬──────────┘                                            │
│                     ▼                                                       │
│          ┌───────────────────┐                                              │
│          │ Verificar estoque │                                              │
│          │ (para cada item)  │                                              │
│          └─────────┬─────────┘                                              │
│                    │                                                        │
│              ┌─────┴─────┐                                                  │
│              ▼           ▼                                                   │
│     ┌──────────────┐ ┌──────────────┐                                      │
│     │ ● Disponivel │ │ ✖ Sem estoque│                                      │
│     └──────┬───────┘ └──────┬───────┘                                      │
│            │                │                                               │
│            ▼                ▼                                                │
│     ┌──────────────┐ ┌──────────────┐                                      │
│     │ Reservar     │ │ Rejeitar     │                                      │
│     │ estoque      │ │ HTTP 409     │                                      │
│     └──────┬───────┘ └──────────────┘                                      │
│            │                                                                │
│            ▼                                                                │
│     ┌──────────────┐                                                       │
│     │ Criar pedido │                                                       │
│     │ (store)      │                                                       │
│     └──────┬───────┘                                                       │
│            │                                                                │
│            ▼                                                                │
│     ┌──────────────┐                                                       │
│     │ Emitir evento│                                                       │
│     │pedido.criado │                                                       │
│     └──────┬───────┘                                                       │
│            │                                                                │
│            ▼                                                                │
│     ┌──────────────┐                                                       │
│     │ HTTP 201     │                                                       │
│     │ + payload    │                                                       │
│     └──────────────┘                                                       │
│                                                                             │
│  BINDINGS                                                                  │
│  ┌──────────────────────────────────────────────────────┐                  │
│  │ store.pedidos    → PostgreSQL / tabela "pedidos"     │                  │
│  │ store.estoque    → PostgreSQL / tabela "estoque"     │                  │
│  │ event.bus        → Redis Pub/Sub                     │                  │
│  │ external.cliente → servico: validar-cliente          │                  │
│  └──────────────────────────────────────────────────────┘                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Aba Evidencia** — log das ultimas execucoes:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ═══════════════════════════════════════════════════════════════════════    │
│  ABA: EVIDENCIA                                                            │
│  ═══════════════════════════════════════════════════════════════════════    │
│                                                                             │
│  ULTIMAS EXECUCOES                                    [Filtrar] [Exportar] │
│                                                                             │
│  │ Hora     │ Status  │ Duracao │ Input (resumo)      │ Output (resumo)  ││
│  │──────────│─────────│─────────│─────────────────────│──────────────────││
│  │ 14:32:01 │ ● ok    │  230ms  │ 3 itens, cli #891  │ pedido #4821     ││
│  │ 14:29:44 │ ● ok    │  198ms  │ 1 item, cli #445   │ pedido #4820     ││
│  │ 14:25:12 │ ✖ falha │  120ms  │ 2 itens, cli #002  │ "estoque insuf." ││
│  │ 14:22:33 │ ● ok    │  310ms  │ 5 itens, cli #721  │ pedido #4819     ││
│  │ 14:18:01 │ ● ok    │  245ms  │ 1 item, cli #891   │ pedido #4818     ││
│  │ ...      │         │         │                     │                  ││
│                                                                             │
│  METRICAS DE EVIDENCIA                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Ultimas 24h:  342 execucoes  │  98.2% sucesso  │  p50: 210ms     │   │
│  │  Ultima semana: 2.841 exec.   │  97.8% sucesso  │  p95: 890ms     │   │
│  │  Ultimo mes:    11.203 exec.  │  98.1% sucesso  │  p99: 2.1s      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  VERIFICACAO DE INTENCAO                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ✓ Todos os pedidos criados tem ID unico              342/342      │   │
│  │  ✓ Estoque reservado em todas as aprovacoes            335/335     │   │
│  │  ✓ Evento "pedido.criado" emitido em todos             335/335     │   │
│  │  ✓ Nenhum pedido criado com estoque insuficiente       0 violacoes │   │
│  │  ✓ Nenhum dado de pagamento exposto                    0 violacoes │   │
│  │                                                                     │   │
│  │  Conformidade com intencao: 100%                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Aba Historico** — diff semantico entre versoes:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ═══════════════════════════════════════════════════════════════════════    │
│  ABA: HISTORICO                                                            │
│  ═══════════════════════════════════════════════════════════════════════    │
│                                                                             │
│  VERSOES DO CONTRATO                                                       │
│                                                                             │
│  v2.1.0  ● atual    2026-03-10 14:22    usuario@email.com                  │
│  │  "Adicionada validacao de valor minimo R$10"                            │
│  │                                                                         │
│  v2.0.0            2026-03-08 09:15    usuario@email.com                   │
│  │  "Adicionada verificacao de cliente ativo"                              │
│  │                                                                         │
│  v1.0.0            2026-03-05 16:40    usuario@email.com                   │
│     "Versao inicial — recebe pedido e valida estoque"                      │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│  DIFF SEMANTICO: v2.0.0 → v2.1.0                                          │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  INTENCAO                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │    Recebe um pedido via API REST (POST /api/pedidos), valida os    │   │
│  │    dados do cliente e dos itens, verifica disponibilidade de        │   │
│  │    estoque para cada item, e se tudo estiver valido, cria o        │   │
│  │    pedido no sistema com status "pendente_pagamento".              │   │
│  │                                                                     │   │
│  │  + NOVA RESTRICAO                                                   │   │
│  │  + Valor minimo do pedido: R$ 10,00                                 │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  EXECUCAO                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  + Novo passo adicionado ao DAG:                                    │   │
│  │    "Validar dados do payload" agora inclui verificacao:             │   │
│  │    soma(itens.valor * itens.quantidade) >= 10.00                    │   │
│  │                                                                     │   │
│  │  + Novo fallback:                                                   │   │
│  │    Se valor < R$10 → HTTP 422 "Valor minimo nao atingido"          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  IMPACTO ESTIMADO                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Baseado nas ultimas 100 execucoes:                                 │   │
│  │  • 3 pedidos teriam sido rejeitados (valores: R$5, R$8, R$9.50)   │   │
│  │  • 97% das execucoes nao seriam afetadas                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 2.3 Tela 3: Execucao Individual (Trace)

Cada execucao de contrato gera um trace completo. Esta tela e a visao forense — mostra exatamente o que aconteceu, passo a passo, com explicacoes do LLM.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ◉ SIML Engine  ›  processar-pedido  ›  Execucao #exec-4821               │
│                                                                             │
│  Status: ● Sucesso    Duracao total: 230ms    Inicio: 14:32:01.122 UTC    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  TIMELINE                                                                  │
│                                                                             │
│  14:32:01.122 ────────────────────────────────────────── 14:32:01.352      │
│  │▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│ 230ms total      │
│                                                                             │
│  ┌─ PASSO 1: Receber request                            12ms ─────────┐   │
│  │                                                                     │   │
│  │  INPUT                                                              │   │
│  │  ┌──────────────────────────────────────────────────────────────┐   │   │
│  │  │ POST /api/pedidos                                            │   │   │
│  │  │ Content-Type: application/json                               │   │   │
│  │  │                                                              │   │   │
│  │  │ {                                                            │   │   │
│  │  │   "cliente_id": "cli-891",                                   │   │   │
│  │  │   "itens": [                                                 │   │   │
│  │  │     { "sku": "SKU-001", "qtd": 2, "preco": 49.95 },        │   │   │
│  │  │     { "sku": "SKU-044", "qtd": 1, "preco": 90.00 }         │   │   │
│  │  │   ]                                                          │   │   │
│  │  │ }                                                            │   │   │
│  │  └──────────────────────────────────────────────────────────────┘   │   │
│  │                                                                     │   │
│  │  DECISAO: Payload valido, prosseguir com validacao.                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─ PASSO 2: Validar dados do payload                    8ms ──────────┐  │
│  │                                                                      │  │
│  │  VERIFICACOES                                                        │  │
│  │  ✓ cliente_id presente e formato valido                              │  │
│  │  ✓ itens e array nao vazio (2 itens)                                 │  │
│  │  ✓ cada item tem sku, qtd > 0, preco > 0                            │  │
│  │  ✓ valor total R$ 189,90 >= minimo R$ 10,00                         │  │
│  │                                                                      │  │
│  │  DECISAO: Payload valido. Nenhum campo ausente ou malformado.        │  │
│  │                                                                      │  │
│  │  ❓ POR QUE?                                                         │  │
│  │  ┌──────────────────────────────────────────────────────────────┐    │  │
│  │  │ O contrato exige que todos os campos obrigatorios estejam    │    │  │
│  │  │ presentes e com tipos corretos. O valor total (soma de       │    │  │
│  │  │ preco * quantidade de cada item = R$189,90) atende a         │    │  │
│  │  │ restricao de valor minimo de R$10,00 definida na v2.1.0.     │    │  │
│  │  └──────────────────────────────────────────────────────────────┘    │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─ PASSO 3: Validar cliente ativo                      35ms ──────────┐  │
│  │                                                                      │  │
│  │  CHAMADA: servico "validar-cliente" com cli-891                      │  │
│  │  RESPOSTA: { "ativo": true, "nome": "Jo██ ██lva" }                  │  │
│  │            (dados sensiveis sanitizados)                              │  │
│  │                                                                      │  │
│  │  DECISAO: Cliente ativo, prosseguir.                                 │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─ PASSO 4: Verificar estoque                          52ms ──────────┐  │
│  │                                                                      │  │
│  │  CONSULTA: store.estoque WHERE sku IN ('SKU-001', 'SKU-044')        │  │
│  │  RESULTADO:                                                          │  │
│  │    SKU-001: disponivel 48, solicitado 2  ✓                           │  │
│  │    SKU-044: disponivel 12, solicitado 1  ✓                           │  │
│  │                                                                      │  │
│  │  DECISAO: Todos os itens com estoque suficiente. Prosseguir         │  │
│  │  para reserva.                                                       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─ PASSO 5: Reservar estoque                           38ms ──────────┐  │
│  │                                                                      │  │
│  │  OPERACAO: UPDATE estoque SET reservado += qtd                       │  │
│  │    SKU-001: reservado 2 unidades (46 restantes)                      │  │
│  │    SKU-044: reservado 1 unidade (11 restantes)                       │  │
│  │                                                                      │  │
│  │  DECISAO: Estoque reservado com sucesso. Transacao atomica.          │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─ PASSO 6: Criar pedido                               45ms ──────────┐  │
│  │                                                                      │  │
│  │  INSERT store.pedidos:                                               │  │
│  │    id: "ped-4821"                                                    │  │
│  │    cliente_id: "cli-891"                                             │  │
│  │    itens: [SKU-001 x2, SKU-044 x1]                                  │  │
│  │    valor_total: 189.90                                               │  │
│  │    status: "pendente_pagamento"                                      │  │
│  │    criado_em: 2026-03-13T14:32:01.295Z                              │  │
│  │                                                                      │  │
│  │  DECISAO: Pedido persistido com sucesso.                             │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─ PASSO 7: Emitir evento                              18ms ──────────┐  │
│  │                                                                      │  │
│  │  EVENTO: "pedido.criado"                                             │  │
│  │  PAYLOAD: { pedido_id: "ped-4821", valor: 189.90 }                  │  │
│  │  DESTINO: Redis Pub/Sub → canal "eventos.pedidos"                   │  │
│  │                                                                      │  │
│  │  DECISAO: Evento emitido. 2 contratos escutam este canal:           │  │
│  │    - cobrar-stripe                                                   │  │
│  │    - notificar-envio                                                 │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─ PASSO 8: Responder HTTP                              22ms ─────────┐  │
│  │                                                                      │  │
│  │  OUTPUT                                                              │  │
│  │  ┌──────────────────────────────────────────────────────────────┐    │  │
│  │  │ HTTP 201 Created                                             │    │  │
│  │  │ {                                                            │    │  │
│  │  │   "id": "ped-4821",                                          │    │  │
│  │  │   "status": "pendente_pagamento",                            │    │  │
│  │  │   "valor_total": 189.90,                                     │    │  │
│  │  │   "itens": 3,                                                │    │  │
│  │  │   "criado_em": "2026-03-13T14:32:01.295Z"                   │    │  │
│  │  │ }                                                            │    │  │
│  │  └──────────────────────────────────────────────────────────────┘    │  │
│  │                                                                      │  │
│  │  DECISAO: Resposta conforme contrato. Nenhum dado sensivel exposto. │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════    │
│  VERIFICACAO FINAL                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ✓ Pedido criado com ID unico                     ped-4821         │   │
│  │  ✓ Estoque reservado para cada item               2 itens          │   │
│  │  ✓ Evento "pedido.criado" emitido                 1 evento         │   │
│  │  ✓ HTTP 201 retornado                             201 Created      │   │
│  │  ✓ Nenhum dado de pagamento exposto               conforme         │   │
│  │                                                                     │   │
│  │  RESULTADO: Intencao satisfeita integralmente.                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Destaques do trace:**

- **Dados sensiveis sanitizados**: nomes, emails e dados de pagamento sao mascarados automaticamente (ex: "Jo██ ██lva")
- **"Por que?" expandivel**: cada passo tem uma explicacao do LLM sobre a decisao tomada
- **Timeline visual**: barra no topo mostra proporcao de tempo de cada passo
- **Verificacao final**: compara o resultado contra os criterios de aceite do contrato

---

### 2.4 Tela 4: Chat LLM (Comando)

A interface de chat e onde a magia acontece. O humano conversa com o LLM para criar, modificar, diagnosticar e operar o sistema.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ◉ SIML Engine  ›  Chat                                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                                                                       │ │
│  │  VOCE                                              14:35              │ │
│  │  ┌───────────────────────────────────────────────────────────────┐    │ │
│  │  │ Adicione notificacao por email quando o pedido for enviado.  │    │ │
│  │  │ Use o SendGrid como provedor.                                │    │ │
│  │  └───────────────────────────────────────────────────────────────┘    │ │
│  │                                                                       │ │
│  │  SIML ENGINE                                       14:35              │ │
│  │  ┌───────────────────────────────────────────────────────────────┐    │ │
│  │  │ Entendi. Vou criar um novo contrato que:                     │    │ │
│  │  │                                                              │    │ │
│  │  │ 1. Escuta o evento `pedido.enviado`                          │    │ │
│  │  │ 2. Busca os dados do pedido e do cliente                     │    │ │
│  │  │ 3. Envia email via SendGrid com template de confirmacao      │    │ │
│  │  │ 4. Registra o envio no historico do pedido                   │    │ │
│  │  │                                                              │    │ │
│  │  │ Isso tambem exige:                                           │    │ │
│  │  │ • Nova integracao externa: SendGrid API                      │    │ │
│  │  │ • Credencial: SENDGRID_API_KEY (voce precisa fornecer)      │    │ │
│  │  │ • Template de email (posso gerar um padrao)                  │    │ │
│  │  │                                                              │    │ │
│  │  │ Quer que eu prossiga?                                        │    │ │
│  │  └───────────────────────────────────────────────────────────────┘    │ │
│  │                                                                       │ │
│  │  VOCE                                              14:36              │ │
│  │  ┌───────────────────────────────────────────────────────────────┐    │ │
│  │  │ Sim, prossiga. Gere o template padrao.                       │    │ │
│  │  └───────────────────────────────────────────────────────────────┘    │ │
│  │                                                                       │ │
│  │  SIML ENGINE                                       14:36              │ │
│  │  ┌───────────────────────────────────────────────────────────────┐    │ │
│  │  │ Pronto. Aqui esta o que sera criado:                         │    │ │
│  │  │                                                              │    │ │
│  │  │ ┌─ PREVIEW ─────────────────────────────────────────────┐    │    │ │
│  │  │ │                                                       │    │    │ │
│  │  │ │  NOVO CONTRATO: notificar-envio-email                 │    │    │ │
│  │  │ │                                                       │    │    │ │
│  │  │ │  Intencao:                                            │    │    │ │
│  │  │ │  Quando um pedido for marcado como enviado, enviar    │    │    │ │
│  │  │ │  email de notificacao ao cliente com numero de        │    │    │ │
│  │  │ │  rastreio e previsao de entrega.                      │    │    │ │
│  │  │ │                                                       │    │    │ │
│  │  │ │  Trigger: evento "pedido.enviado"                     │    │    │ │
│  │  │ │  Tipo: reativo                                        │    │    │ │
│  │  │ │  Integracao: SendGrid (nova)                          │    │    │ │
│  │  │ │                                                       │    │    │ │
│  │  │ │  Restricoes:                                          │    │    │ │
│  │  │ │  • Maximo 1 email por evento (idempotente)            │    │    │ │
│  │  │ │  • Fallback: retry 3x com backoff exponencial         │    │    │ │
│  │  │ │  • Nao bloquear o fluxo principal em caso de falha    │    │    │ │
│  │  │ │                                                       │    │    │ │
│  │  │ └───────────────────────────────────────────────────────┘    │    │ │
│  │  │                                                              │    │ │
│  │  │  NOVA INTEGRACAO: SendGrid                                   │    │ │
│  │  │ ┌───────────────────────────────────────────────────────┐    │    │ │
│  │  │ │  API: https://api.sendgrid.com/v3/mail/send           │    │    │ │
│  │  │ │  Auth: Bearer token (SENDGRID_API_KEY)                │    │    │ │
│  │  │ │  Health check: GET /v3/scopes                         │    │    │ │
│  │  │ └───────────────────────────────────────────────────────┘    │    │ │
│  │  │                                                              │    │ │
│  │  │  ┌──────────────────┐  ┌──────────────────┐                 │    │ │
│  │  │  │  ✓ APLICAR       │  │  ✗ CANCELAR      │                 │    │ │
│  │  │  └──────────────────┘  └──────────────────┘                 │    │ │
│  │  └───────────────────────────────────────────────────────────────┘    │ │
│  │                                                                       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  💬 Digite sua mensagem...                                     [►]   │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  Sugestoes rapidas:                                                        │
│  ┌────────────────┐ ┌──────────────────────┐ ┌────────────────────────┐   │
│  │ O que posso     │ │ Por que o ultimo      │ │ Mostre os contratos   │   │
│  │ criar?          │ │ erro aconteceu?       │ │ com mais falhas       │   │
│  └────────────────┘ └──────────────────────┘ └────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Capacidades do chat:**

| Tipo de comando          | Exemplo                                              |
|--------------------------|------------------------------------------------------|
| Criar contrato           | "Crie um endpoint que recebe webhook do Stripe"      |
| Diagnosticar             | "Por que a ultima execucao falhou?"                  |
| Explicar                 | "O que esse contrato faz?"                           |
| Modificar                | "Adicione validacao de email no cadastro"            |
| Operar                   | "Pause o contrato de envio de emails"                |
| Consultar dados          | "Quantos pedidos tivemos ontem?"                     |
| Refatorar                | "Separe a validacao de estoque em contrato proprio"  |
| Analisar                 | "Quais contratos estao mais lentos que o normal?"    |

**Regras de seguranca do chat:**

1. **Preview obrigatorio** — toda mudanca estrutural mostra diff semantico antes de aplicar
2. **Confirmacao humana** — o botao "Aplicar" e explicito e nao pode ser pulado
3. **Rollback disponivel** — apos aplicar, um botao "Desfazer" fica disponivel por 5 minutos
4. **Operacoes destrutivas** — remover contrato exige confirmacao dupla ("tem certeza?" + digitar nome)
5. **Audit trail** — toda interacao do chat e registrada com timestamp e autor

---

### 2.5 Tela 5: Endpoints & Rotas

Lista de todas as URLs expostas pelo engine, com teste integrado.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ◉ SIML Engine  ›  Endpoints & Rotas                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  BASE URL: https://meu-projeto.siml.run                                    │
│                                                                             │
│  ROTAS ATIVAS                                              [Filtrar]       │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  │ Metodo │ Rota                  │ Contrato             │ Status │ Lat. ││
│  │────────│───────────────────────│──────────────────────│────────│──────││
│  │ POST   │ /api/pedidos          │ processar-pedido     │ ● ativo│ 230ms││
│  │ GET    │ /api/pedidos/:id      │ buscar-pedido        │ ● ativo│  45ms││
│  │ GET    │ /api/pedidos          │ listar-pedidos       │ ● ativo│ 120ms││
│  │ POST   │ /api/webhook/stripe   │ processar-pagamento  │ ● ativo│ 890ms││
│  │ POST   │ /api/webhook/transp   │ atualizar-rastreio   │ ● ativo│ 150ms││
│  │ GET    │ /api/estoque/:sku     │ consultar-estoque    │ ● ativo│  30ms││
│  │ GET    │ /health               │ (interno)            │ ● ativo│   5ms││
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════    │
│  DETALHE: POST /api/pedidos                                                │
│  ═══════════════════════════════════════════════════════════════════════    │
│                                                                             │
│  Contrato: processar-pedido (v2.1.0)                                       │
│  Descricao: Recebe e valida um novo pedido                                 │
│                                                                             │
│  PAYLOAD ESPERADO                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ {                                                                   │   │
│  │   "cliente_id": "string (obrigatorio)",                             │   │
│  │   "itens": [                                                        │   │
│  │     {                                                               │   │
│  │       "sku": "string (obrigatorio)",                                │   │
│  │       "qtd": "number > 0 (obrigatorio)",                           │   │
│  │       "preco": "number > 0 (obrigatorio)"                          │   │
│  │     }                                                               │   │
│  │   ]                                                                 │   │
│  │ }                                                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  RESPOSTAS POSSIVEIS                                                       │
│  ┌────────┬────────────────────────────────────────────────────────────┐   │
│  │  201   │ Pedido criado com sucesso. Retorna dados do pedido.       │   │
│  │  400   │ Payload invalido. Campos ausentes ou tipos incorretos.    │   │
│  │  409   │ Estoque insuficiente para um ou mais itens.               │   │
│  │  422   │ Valor minimo nao atingido (< R$10,00).                    │   │
│  │  500   │ Erro interno do engine.                                    │   │
│  └────────┴────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  TESTAR                                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ {                                                                   │   │
│  │   "cliente_id": "cli-teste-001",                                    │   │
│  │   "itens": [                                                        │   │
│  │     { "sku": "SKU-001", "qtd": 1, "preco": 49.95 }                │   │
│  │   ]                                                                 │   │
│  │ }                                                                   │   │
│  │                                                                     │   │
│  │           [▶ Enviar]    [Gerar payload aleatorio]                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  RESULTADO DO TESTE                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  HTTP 201 Created (198ms)                                           │   │
│  │  {                                                                  │   │
│  │    "id": "ped-test-0042",                                           │   │
│  │    "status": "pendente_pagamento",                                  │   │
│  │    "valor_total": 49.95,                                            │   │
│  │    "criado_em": "2026-03-13T14:40:12.001Z"                         │   │
│  │  }                                                                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  COPIAR COMO                                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ cURL:                                                               │   │
│  │ curl -X POST https://meu-projeto.siml.run/api/pedidos \            │   │
│  │   -H "Content-Type: application/json" \                             │   │
│  │   -H "Authorization: Bearer sk_..." \                               │   │
│  │   -d '{"cliente_id":"cli-001","itens":[...]}'                      │   │
│  │                                                          [Copiar]   │   │
│  │                                                                     │   │
│  │ fetch:                                                              │   │
│  │ const res = await fetch('https://meu-projeto.siml.run/api/pedi..  │   │
│  │                                                          [Copiar]   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 2.6 Tela 6: Cron & Schedulers

Gerenciamento de jobs agendados.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ◉ SIML Engine  ›  Cron & Schedulers                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  JOBS AGENDADOS                                                            │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ● relatorio-diario                                                 │   │
│  │                                                                     │   │
│  │  Agenda:    Diariamente as 08:00 UTC (0 8 * * *)                   │   │
│  │  Contrato:  gerar-relatorio-vendas                                  │   │
│  │  Proxima:   2026-03-14 08:00 UTC (em 17h 20min)                    │   │
│  │                                                                     │   │
│  │  Ultimas execucoes:                                                 │   │
│  │  │ 13/mar 08:00 │ ● ok    │ 4.2s  │ 23 pedidos processados       ││   │
│  │  │ 12/mar 08:00 │ ● ok    │ 3.8s  │ 19 pedidos processados       ││   │
│  │  │ 11/mar 08:00 │ ● ok    │ 5.1s  │ 31 pedidos processados       ││   │
│  │  │ 10/mar 08:00 │ ✖ falha │ 30s   │ "Timeout conexao DB"         ││   │
│  │  │ 09/mar 08:00 │ ● ok    │ 3.5s  │ 15 pedidos processados       ││   │
│  │                                                                     │   │
│  │  [⏸ Pausar]  [▶ Executar agora]  [💬 Perguntar ao LLM]            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ◐ sync-erp-legado (PAUSADO)                                       │   │
│  │                                                                     │   │
│  │  Agenda:    A cada 6 horas (0 */6 * * *)                           │   │
│  │  Contrato:  sincronizar-erp                                         │   │
│  │  Pausado:   2026-03-11 por usuario@email.com                       │   │
│  │  Motivo:    "ERP em manutencao ate sexta"                           │   │
│  │                                                                     │   │
│  │  [▶ Retomar]  [💬 Perguntar ao LLM]                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ✖ importar-catalogo (ERRO)                                        │   │
│  │                                                                     │   │
│  │  Agenda:    Diariamente as 03:00 UTC (0 3 * * *)                   │   │
│  │  Contrato:  importar-catalogo-fornecedor                            │   │
│  │  Erro desde: 2026-03-13 03:00                                       │   │
│  │  Motivo:     "Timeout ao conectar API do fornecedor"                │   │
│  │                                                                     │   │
│  │  Ultimas tentativas:                                                │   │
│  │  │ 13/mar 03:00 │ ✖ falha │ 30s │ timeout                        ││   │
│  │  │ 13/mar 03:05 │ ✖ falha │ 30s │ timeout (retry 1)              ││   │
│  │  │ 13/mar 03:15 │ ✖ falha │ 30s │ timeout (retry 2)              ││   │
│  │                                                                     │   │
│  │  [▶ Retry agora]  [⏸ Pausar]  [💬 Diagnosticar com LLM]           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  CALENDARIO VISUAL (proximas 24h)                                          │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  15h    18h    21h    00h    03h    06h    08h    09h    12h    15h         │
│  │──────│──────│──────│──────│──────│──────│──────│──────│──────│          │
│  ·      ·      ·      ·      ▲      ·      ▲      ·      ·      ·         │
│                               │             │                              │
│                          importar      relatorio                           │
│                          catalogo       diario                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 2.7 Tela 7: Integracoes Externas

Painel de saude e monitoramento das APIs e servicos externos conectados.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ◉ SIML Engine  ›  Integracoes Externas                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  INTEGRACOES ATIVAS                                                        │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ● Stripe API                                                       │   │
│  │                                                                     │   │
│  │  URL:         https://api.stripe.com/v1                             │   │
│  │  Auth:        Bearer token (configurado)                            │   │
│  │  Health:      ● Saudavel (ultimo check: 2min atras)                │   │
│  │  Latencia:    p50: 320ms  p95: 890ms  p99: 1.8s                    │   │
│  │  Usada por:   cobrar-stripe, processar-reembolso                    │   │
│  │                                                                     │   │
│  │  Ultimas chamadas:                                                  │   │
│  │  │ 14:31:55 │ POST /charges │ ● 200 │ 340ms │ cobrar-stripe      ││   │
│  │  │ 14:28:12 │ POST /charges │ ● 200 │ 290ms │ cobrar-stripe      ││   │
│  │  │ 14:15:44 │ POST /refunds │ ● 200 │ 510ms │ processar-reemb.   ││   │
│  │                                                                     │   │
│  │  Taxa de sucesso (24h): 99.7% (298/299)                             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ● SendGrid API                                                     │   │
│  │                                                                     │   │
│  │  URL:         https://api.sendgrid.com/v3                           │   │
│  │  Auth:        Bearer token (configurado)                            │   │
│  │  Health:      ● Saudavel (ultimo check: 5min atras)                │   │
│  │  Latencia:    p50: 180ms  p95: 450ms  p99: 1.2s                    │   │
│  │  Usada por:   notificar-envio-email                                 │   │
│  │                                                                     │   │
│  │  Taxa de sucesso (24h): 100% (156/156)                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ✖ API Fornecedor Catalogo                                          │   │
│  │                                                                     │   │
│  │  URL:         https://api.fornecedor.com.br/v2                      │   │
│  │  Auth:        API Key (configurada)                                 │   │
│  │  Health:      ✖ FORA DO AR (desde 2026-03-13 02:45 UTC)           │   │
│  │  Latencia:    timeout (30s)                                         │   │
│  │  Usada por:   importar-catalogo                                     │   │
│  │                                                                     │   │
│  │  Ultimas tentativas:                                                │   │
│  │  │ 03:15 │ GET /products │ ✖ timeout │ 30s │ importar-catalogo   ││   │
│  │  │ 03:05 │ GET /products │ ✖ timeout │ 30s │ importar-catalogo   ││   │
│  │  │ 03:00 │ GET /products │ ✖ timeout │ 30s │ importar-catalogo   ││   │
│  │                                                                     │   │
│  │  Taxa de sucesso (24h): 0% (0/3)                                    │   │
│  │                                                                     │   │
│  │  [🔔 Alertar quando voltar]  [💬 Diagnosticar com LLM]             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  WEBHOOKS DE SAIDA (este engine envia para)                                │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  │ Destino                          │ Evento           │ Ultimo envio    ││
│  │──────────────────────────────────│──────────────────│─────────────────││
│  │ https://slack.com/api/webhook    │ erro.critico     │ 10/mar 03:00   ││
│  │ https://meu-erp.com/api/pedidos  │ pedido.criado    │ 14:32:01       ││
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 2.8 Tela 8: Dados / Store

Navegacao e consulta nos dados criados e gerenciados pelos contratos.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ◉ SIML Engine  ›  Dados / Store                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  TABELAS                           CONSULTA POR LINGUAGEM NATURAL          │
│  ┌─────────────────────┐           ┌───────────────────────────────────┐   │
│  │ ▸ pedidos      1.203│           │ "Mostre os pedidos da ultima      │   │
│  │ ▸ estoque        847│           │  semana com valor > 1000"         │   │
│  │ ▸ clientes       312│           │                           [▶]     │   │
│  │ ▸ envios         298│           └───────────────────────────────────┘   │
│  │ ▸ pagamentos     301│                                                   │
│  │ ▸ emails_log     892│                                                   │
│  └─────────────────────┘                                                   │
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════    │
│  TABELA: pedidos                                        1.203 registros    │
│  ═══════════════════════════════════════════════════════════════════════    │
│                                                                             │
│  [Filtrar ▾]  [Ordenar: criado_em DESC ▾]  [Colunas ▾]  [Exportar CSV]   │
│                                                                             │
│  │ id       │ cliente │ valor   │ status        │ itens │ criado_em       ││
│  │──────────│─────────│─────────│───────────────│───────│─────────────────││
│  │ ped-4821 │ cli-891 │ 189.90  │ ● pago        │ 3     │ 13/mar 14:32   ││
│  │ ped-4820 │ cli-445 │  79.90  │ ● pago        │ 1     │ 13/mar 14:29   ││
│  │ ped-4819 │ cli-721 │ 459.50  │ ● enviado     │ 5     │ 13/mar 14:22   ││
│  │ ped-4818 │ cli-891 │  49.95  │ ◐ pendente    │ 1     │ 13/mar 14:18   ││
│  │ ped-4817 │ cli-103 │ 1250.00 │ ● pago        │ 8     │ 13/mar 13:55   ││
│  │ ped-4816 │ cli-202 │ 320.00  │ ✖ cancelado   │ 2     │ 13/mar 13:40   ││
│  │ ...      │         │         │               │       │                 ││
│                                                                             │
│  Pagina 1 de 121                                 [◄ Anterior] [Proximo ►] │
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════    │
│  RESULTADO DA CONSULTA NATURAL                                             │
│  ═══════════════════════════════════════════════════════════════════════    │
│                                                                             │
│  Consulta: "pedidos da ultima semana com valor > 1000"                     │
│  Interpretacao: SELECT * FROM pedidos                                      │
│                 WHERE valor > 1000                                          │
│                 AND criado_em >= '2026-03-06'                               │
│                 ORDER BY valor DESC                                         │
│                                                                             │
│  │ id       │ cliente │ valor    │ status    │ criado_em               │   │
│  │──────────│─────────│──────────│───────────│─────────────────────────│   │
│  │ ped-4801 │ cli-050 │ 3.200.00 │ ● enviado │ 12/mar 09:15           │   │
│  │ ped-4789 │ cli-012 │ 2.100.50 │ ● pago    │ 11/mar 16:22           │   │
│  │ ped-4771 │ cli-333 │ 1.890.00 │ ● enviado │ 10/mar 11:05           │   │
│  │ ped-4755 │ cli-721 │ 1.450.00 │ ● entregue│ 08/mar 14:30           │   │
│  │ ped-4817 │ cli-103 │ 1.250.00 │ ● pago    │ 13/mar 13:55           │   │
│                                                                             │
│  5 resultados encontrados. Valor total: R$ 9.890,50                        │
│                                                                             │
│  [💬 "Desses, quais ja foram enviados?"]                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Experiencia de Criacao de Sistema

Narrativa completa de como um usuario cria um sistema do zero usando o dashboard.

### Passo 1: Dashboard vazio

O usuario abre o dashboard pela primeira vez. Nao ha contratos, nao ha dados, nao ha endpoints.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ◉ SIML Engine    [meu-projeto]                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                                                                             │
│                                                                             │
│                 ┌─────────────────────────────────────┐                     │
│                 │                                     │                     │
│                 │    Seu engine esta vazio.            │                     │
│                 │                                     │                     │
│                 │    Descreva o sistema que voce       │                     │
│                 │    quer criar e o SIML Engine        │                     │
│                 │    fara o resto.                     │                     │
│                 │                                     │                     │
│                 └─────────────────────────────────────┘                     │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  💬 "Quero um sistema de pedidos. Recebe pedido via API, valida      │ │
│  │     estoque, cobra via Stripe, envia para transportadora."           │ │
│  │                                                                 [►]  │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  Exemplos:                                                                 │
│  • "Sistema de agendamento de consultas medicas"                           │
│  • "API de e-commerce com carrinho, pagamento e frete"                     │
│  • "Bot que monitora precos e envia alerta por email"                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Passo 2: LLM analisa e propoe

O usuario descreve o sistema. O LLM analisa, decompos em contratos e apresenta um plano.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  SIML ENGINE                                                               │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                                                                       │ │
│  │  Entendi. Voce precisa de um sistema de gestao de pedidos com         │ │
│  │  4 etapas principais. Vou criar os seguintes contratos:               │ │
│  │                                                                       │ │
│  │  ┌─ PLANO DE CONTRATOS ──────────────────────────────────────────┐   │ │
│  │  │                                                                │   │ │
│  │  │  1. processar-pedido (endpoint)                                │   │ │
│  │  │     POST /api/pedidos                                          │   │ │
│  │  │     Recebe pedido, valida dados, verifica estoque, cria        │   │ │
│  │  │     pedido com status "pendente_pagamento"                     │   │ │
│  │  │                                                                │   │ │
│  │  │  2. cobrar-stripe (reativo)                                    │   │ │
│  │  │     Escuta: pedido.criado                                      │   │ │
│  │  │     Cria cobranca no Stripe, atualiza status do pedido         │   │ │
│  │  │                                                                │   │ │
│  │  │  3. processar-pagamento (endpoint)                             │   │ │
│  │  │     POST /api/webhook/stripe                                   │   │ │
│  │  │     Recebe confirmacao do Stripe, marca pedido como pago       │   │ │
│  │  │                                                                │   │ │
│  │  │  4. enviar-transportadora (reativo)                            │   │ │
│  │  │     Escuta: pedido.pago                                        │   │ │
│  │  │     Envia pedido para API da transportadora                    │   │ │
│  │  │                                                                │   │ │
│  │  │  + Auxiliares:                                                 │   │ │
│  │  │  5. validar-estoque (interno)                                  │   │ │
│  │  │  6. buscar-pedido (endpoint GET /api/pedidos/:id)              │   │ │
│  │  │  7. listar-pedidos (endpoint GET /api/pedidos)                 │   │ │
│  │  │                                                                │   │ │
│  │  │  Integracoes necessarias:                                      │   │ │
│  │  │  • Stripe API (voce fornece a chave)                          │   │ │
│  │  │  • API Transportadora (preciso da URL e credenciais)           │   │ │
│  │  │                                                                │   │ │
│  │  │  Dados criados:                                                │   │ │
│  │  │  • Tabela: pedidos                                             │   │ │
│  │  │  • Tabela: estoque                                             │   │ │
│  │  │  • Tabela: pagamentos                                          │   │ │
│  │  │  • Tabela: envios                                              │   │ │
│  │  └────────────────────────────────────────────────────────────────┘   │ │
│  │                                                                       │ │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐    │ │
│  │  │  ✓ APLICAR TUDO  │  │  ✎ AJUSTAR       │  │  ✗ CANCELAR     │    │ │
│  │  └──────────────────┘  └──────────────────┘  └──────────────────┘    │ │
│  │                                                                       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Passo 3: Usuario confirma

O usuario clica em "Aplicar tudo". O engine cria os contratos, as tabelas e expoe os endpoints.

```
┌───────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│  APLICANDO...                                                             │
│                                                                           │
│  ✓ Contrato processar-pedido criado                                       │
│  ✓ Contrato cobrar-stripe criado                                          │
│  ✓ Contrato processar-pagamento criado                                    │
│  ✓ Contrato enviar-transportadora criado                                  │
│  ✓ Contrato validar-estoque criado                                        │
│  ✓ Contrato buscar-pedido criado                                          │
│  ✓ Contrato listar-pedidos criado                                         │
│  ✓ Tabela pedidos criada                                                  │
│  ✓ Tabela estoque criada                                                  │
│  ✓ Tabela pagamentos criada                                               │
│  ✓ Tabela envios criada                                                   │
│  ● Aguardando: Stripe API key                                             │
│  ● Aguardando: URL da transportadora                                      │
│                                                                           │
│  Sistema operacional! 5/7 contratos ativos.                               │
│  2 contratos aguardam configuracao de integracoes.                        │
│                                                                           │
│  Endpoints ativos:                                                        │
│  • POST https://meu-projeto.siml.run/api/pedidos                          │
│  • GET  https://meu-projeto.siml.run/api/pedidos/:id                      │
│  • GET  https://meu-projeto.siml.run/api/pedidos                          │
│  • POST https://meu-projeto.siml.run/api/webhook/stripe                   │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

### Passo 4: Teste via Swagger embutido

O usuario vai ate a tela de Endpoints, encontra `POST /api/pedidos`, e testa direto no dashboard.

### Passo 5: Refinamento conversacional

O sistema esta rodando. O usuario volta ao chat:

```
VOCE: "Adicione notificacao por email quando o pedido for enviado."

SIML ENGINE: [propoe novo contrato notificar-envio-email, mostra preview]

VOCE: "Aplica."

SIML ENGINE: ✓ Contrato notificar-envio-email criado e ativo.
```

### Passo 6: Evolucao continua

```
VOCE: "O relatorio diario deveria incluir tambem os pedidos cancelados."

SIML ENGINE: [mostra diff semantico da mudanca no contrato gerar-relatorio-vendas]

VOCE: "Aplica."

SIML ENGINE: ✓ Contrato gerar-relatorio-vendas atualizado para v1.1.0.
```

**O ciclo se repete indefinidamente.** O sistema evolui por conversa, nao por codigo.

---

## 4. Design System

### 4.1 Paleta de cores

O dashboard usa dark mode como padrao. A paleta e inspirada em ferramentas de desenvolvimento modernas (Vercel, Linear, Supabase) com foco em legibilidade e reducao de fadiga visual.

```
CORES PRINCIPAIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Background
  ┌──────────┐
  │ #0A0A0B  │  bg-primary      Fundo principal
  │ #111113  │  bg-secondary    Cards, paineis
  │ #1A1A1F  │  bg-tertiary     Hover, selecao
  │ #232329  │  bg-elevated     Modais, dropdowns
  └──────────┘

  Texto
  ┌──────────┐
  │ #FAFAFA  │  text-primary    Texto principal
  │ #A1A1AA  │  text-secondary  Labels, descricoes
  │ #71717A  │  text-muted      Placeholders, dicas
  └──────────┘

  Bordas
  ┌──────────┐
  │ #27272A  │  border-default  Bordas normais
  │ #3F3F46  │  border-hover    Bordas em hover
  └──────────┘

  Status
  ┌──────────┐
  │ #22C55E  │  status-success  Verde: ativo, sucesso
  │ #EAB308  │  status-warning  Amarelo: pausado, atencao
  │ #EF4444  │  status-error    Vermelho: erro, falha
  │ #3B82F6  │  status-info     Azul: informacao, link
  └──────────┘

  Acentos
  ┌──────────┐
  │ #8B5CF6  │  accent-primary  Roxo: acoes primarias, botoes CTA
  │ #6366F1  │  accent-indigo   Indigo: LLM, chat, IA
  │ #06B6D4  │  accent-cyan     Ciano: dados, metricas
  └──────────┘
```

### 4.2 Tipografia

```
TIPOGRAFIA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Sans-serif (UI, navegacao, labels)
  ┌────────────────────────────────────────────────┐
  │  Font: Inter                                    │
  │  Fallback: system-ui, -apple-system, sans-serif │
  │                                                 │
  │  h1:  24px / 700 / -0.02em                     │
  │  h2:  20px / 600 / -0.01em                     │
  │  h3:  16px / 600 / 0                           │
  │  body: 14px / 400 / 0                          │
  │  small: 12px / 400 / 0.01em                    │
  │  micro: 11px / 500 / 0.02em (badges, tags)     │
  └────────────────────────────────────────────────┘

  Monospace (dados, codigo, traces, payloads)
  ┌────────────────────────────────────────────────┐
  │  Font: JetBrains Mono                           │
  │  Fallback: Fira Code, Consolas, monospace       │
  │                                                 │
  │  Usado em:                                      │
  │  • Payloads JSON                               │
  │  • IDs de contrato, execucao, pedido            │
  │  • Valores numericos em tabelas                 │
  │  • Blocos de cURL/fetch                         │
  │  • Logs e traces                                │
  │  • Expressoes cron                              │
  └────────────────────────────────────────────────┘
```

### 4.3 Componentes reutilizaveis

```
COMPONENTES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  StatusBadge
  ┌────────────────────┐
  │  ● ativo           │  verde + texto
  │  ◐ pausado         │  amarelo + texto
  │  ✖ erro            │  vermelho + texto
  │  ○ inativo         │  cinza + texto
  └────────────────────┘

  ContractCard
  ┌─────────────────────────────────────────────┐
  │  ● processar-pedido            endpoint     │
  │  Recebe e valida pedidos via API REST       │
  │  342 execucoes  │  98.2% sucesso  │  v2.1   │
  └─────────────────────────────────────────────┘

  MetricCard
  ┌─────────────────────┐
  │  EXECUCOES 24H      │
  │  1.847              │
  │  ▂▃▅▇▆▅▃▄▅▇▅▃      │
  │  ↑ 12% vs ontem    │
  └─────────────────────┘

  TimelineStep
  ┌─ PASSO N: Descricao                  Xms ─┐
  │  INPUT: ...                                │
  │  DECISAO: ...                              │
  │  OUTPUT: ...                               │
  └────────────────────────────────────────────┘

  DiffBlock (diff semantico)
  ┌─────────────────────────────────────────────┐
  │   texto que nao mudou                       │
  │ + texto adicionado (fundo verde escuro)     │
  │ - texto removido (fundo vermelho escuro)    │
  │ ~ texto modificado (fundo amarelo escuro)   │
  └─────────────────────────────────────────────┘

  ChatMessage
  ┌─────────────────────────────────────────────┐
  │  VOCE                          14:35        │
  │  ┌──────────────────────────────────────┐   │
  │  │  Mensagem do usuario                │   │
  │  └──────────────────────────────────────┘   │
  │                                             │
  │  SIML ENGINE                   14:35        │
  │  ┌──────────────────────────────────────┐   │
  │  │  Resposta com markdown rendering    │   │
  │  │  [✓ APLICAR]  [✗ CANCELAR]          │   │
  │  └──────────────────────────────────────┘   │
  └─────────────────────────────────────────────┘

  DataTable
  ┌──────────────────────────────────────────────┐
  │  [Filtrar]  [Ordenar]  [Colunas]  [Exportar] │
  │  │ col1  │ col2  │ col3  │ col4  │           │
  │  │───────│───────│───────│───────│           │
  │  │ dado  │ dado  │ dado  │ dado  │           │
  │  Pagina 1 de N          [◄] [►]              │
  └──────────────────────────────────────────────┘
```

### 4.4 Inspiracoes visuais

| Referencia          | O que pegar                                           |
|---------------------|-------------------------------------------------------|
| **Vercel Dashboard** | Minimalismo, dark mode, feedback imediato de deploys  |
| **Linear**          | Fluidez de navegacao, atalhos de teclado, velocidade  |
| **Supabase**        | Table editor, SQL runner, integracao de dados         |
| **Datadog**         | Dashboards de monitoramento, timelines de traces      |
| **Retool**          | Componentes pre-construidos, layout de admin panel    |

### 4.5 Principios de interacao

1. **Feedback instantaneo** — toda acao mostra resposta visual em menos de 100ms
2. **Atalhos de teclado** — Cmd+K para busca global, Cmd+J para chat, Cmd+. para acoes rapidas
3. **Navegacao por breadcrumb** — sempre saber onde esta: Engine > Contrato > Execucao > Passo
4. **Dados em tempo real** — execucoes e logs atualizam via WebSocket/SSE sem reload
5. **Responsivo mas desktop-first** — projetado para monitores, funcional em tablets
6. **Acessibilidade** — contraste minimo WCAG AA, navegavel por teclado, roles ARIA

---

## 5. Modelo de Permissoes

### 5.1 Roles

```
HIERARQUIA DE PERMISSOES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  OWNER
  ├── Tudo que Operator pode
  ├── Gerenciar membros e roles
  ├── Configurar integracoes (chaves de API)
  ├── Deletar contratos
  ├── Acessar dados sensiveis nao-sanitizados
  └── Configurar billing e limites
      │
  OPERATOR
  ├── Tudo que Viewer pode
  ├── Criar contratos via chat
  ├── Aprovar mudancas do LLM
  ├── Pausar/retomar contratos e crons
  ├── Testar endpoints
  ├── Executar queries de dados
  └── Executar crons manualmente
      │
  VIEWER
  ├── Ver overview e metricas
  ├── Ver contratos (intencao e evidencia)
  ├── Ver traces de execucao
  ├── Ver endpoints (sem testar)
  ├── Ver dados (somente leitura, sanitizados)
  └── Ver integracoes (status, sem credenciais)
```

### 5.2 Matriz de permissoes detalhada

| Acao                          | Owner | Operator | Viewer |
|-------------------------------|-------|----------|--------|
| Ver overview                  | ✓     | ✓        | ✓      |
| Ver contratos                 | ✓     | ✓        | ✓      |
| Criar contrato (via chat)     | ✓     | ✓        | ✗      |
| Aprovar mudanca do LLM        | ✓     | ✓        | ✗      |
| Deletar contrato              | ✓     | ✗        | ✗      |
| Pausar/retomar contrato       | ✓     | ✓        | ✗      |
| Ver traces                    | ✓     | ✓        | ✓      |
| Ver dados (sanitizados)       | ✓     | ✓        | ✓      |
| Ver dados (completos)         | ✓     | ✗        | ✗      |
| Testar endpoints              | ✓     | ✓        | ✗      |
| Configurar integracoes        | ✓     | ✗        | ✗      |
| Gerenciar membros             | ✓     | ✗        | ✗      |
| Ver audit log                 | ✓     | ✓        | ✓      |
| Exportar dados                | ✓     | ✓        | ✗      |
| Executar cron manualmente     | ✓     | ✓        | ✗      |
| Query natural nos dados       | ✓     | ✓        | ✗      |

### 5.3 Audit Log

Toda acao significativa e registrada no audit log.

```
AUDIT LOG
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

│ Quando            │ Quem               │ O que                              │
│───────────────────│────────────────────│────────────────────────────────────│
│ 13/mar 14:36:22   │ usuario@email.com  │ Criou contrato notificar-envio     │
│ 13/mar 14:36:20   │ usuario@email.com  │ Aprovou mudanca via chat           │
│ 13/mar 14:22:01   │ usuario@email.com  │ Atualizou processar-pedido v2.1   │
│ 11/mar 10:30:00   │ usuario@email.com  │ Pausou sync-erp-legado             │
│ 10/mar 14:22:00   │ usuario@email.com  │ Adicionou integracao Stripe        │
│ 05/mar 16:40:00   │ usuario@email.com  │ Criou sistema inicial (7 contratos)│

  Filtros: [Todos ▾]  [Todos os usuarios ▾]  [Ultima semana ▾]
```

**O que e registrado:**
- Criacao, modificacao e remocao de contratos
- Aprovacao de mudancas propostas pelo LLM
- Pause/resume de contratos e crons
- Configuracao de integracoes (sem valores de credenciais)
- Login/logout e mudancas de permissao
- Exportacao de dados
- Cada interacao do chat que resulta em acao

---

## 6. Tecnologias Sugeridas

### 6.1 Stack principal

```
STACK DO DASHBOARD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  FRAMEWORK
  ┌────────────────────────────────────────────────┐
  │  Opcao A (recomendada): Next.js 15 (App Router)│
  │  • SSR para performance inicial                │
  │  • Server Components para dados pesados        │
  │  • Route Groups para organizacao de telas      │
  │  • Streaming para chat LLM                     │
  │                                                │
  │  Opcao B: SvelteKit                            │
  │  • Menor bundle, melhor performance percebida  │
  │  • Reatividade nativa sem hooks                │
  │  • Curva de aprendizado menor                  │
  └────────────────────────────────────────────────┘

  UI / ESTILO
  ┌────────────────────────────────────────────────┐
  │  Tailwind CSS 4.x                              │
  │  • Utility-first, dark mode nativo             │
  │  • Design tokens via CSS variables             │
  │                                                │
  │  + shadcn/ui (se Next.js)                      │
  │  • Componentes copiados, nao instalados        │
  │  • Customizaveis ao extremo                    │
  │  • Dialog, Dropdown, Table, Tabs prontos       │
  │                                                │
  │  + Skeleton (se SvelteKit)                     │
  │  • Equivalente ao shadcn para Svelte           │
  └────────────────────────────────────────────────┘

  REAL-TIME
  ┌────────────────────────────────────────────────┐
  │  Server-Sent Events (SSE) para:                │
  │  • Feed de execucoes em tempo real             │
  │  • Atualizacao de status de contratos          │
  │  • Logs live                                   │
  │                                                │
  │  WebSocket (fallback ou complementar) para:    │
  │  • Chat bidirecional com LLM                   │
  │  • Notificacoes push                           │
  │                                                │
  │  Biblioteca: nativa (EventSource API) ou       │
  │  socket.io para WebSocket                      │
  └────────────────────────────────────────────────┘

  GRAFICOS / CHARTS
  ┌────────────────────────────────────────────────┐
  │  Opcao A: Recharts                             │
  │  • Declarativo, composavel, React-native       │
  │  • Bom para sparklines e line charts           │
  │                                                │
  │  Opcao B: Chart.js + react-chartjs-2           │
  │  • Mais leve, canvas-based                     │
  │  • Melhor performance com muitos data points   │
  │                                                │
  │  Opcao C: Nivo                                 │
  │  • Built on D3, mais visual                    │
  │  • Otimo para dashboards complexos             │
  └────────────────────────────────────────────────┘

  CHAT / LLM STREAMING
  ┌────────────────────────────────────────────────┐
  │  Vercel AI SDK                                 │
  │  • useChat hook para streaming nativo          │
  │  • Suporte a multiplos providers de LLM        │
  │  • Streaming de markdown com rendering          │
  │                                                │
  │  Markdown rendering: react-markdown            │
  │  • Com remark-gfm para tabelas e listas        │
  │  • Syntax highlighting: shiki ou prism         │
  │  • Rendering de blocos de preview customizados │
  └────────────────────────────────────────────────┘

  AUTENTICACAO
  ┌────────────────────────────────────────────────┐
  │  Opcao A: Clerk                                │
  │  • Pronto para producao, UI pre-construida     │
  │  • Roles e permissoes built-in                 │
  │  • Webhook para sync de usuarios               │
  │                                                │
  │  Opcao B: Auth.js (NextAuth v5)                │
  │  • Open source, mais controle                  │
  │  • Multiplos providers (Google, GitHub, email)  │
  │  • Exige implementar roles manualmente         │
  │                                                │
  │  Opcao C: Simple JWT                           │
  │  • Maximo controle, minima dependencia          │
  │  • Ideal para self-hosted                      │
  │  • Exige implementar tudo manualmente          │
  └────────────────────────────────────────────────┘

  ESTADO / DATA FETCHING
  ┌────────────────────────────────────────────────┐
  │  TanStack Query (React Query)                  │
  │  • Cache inteligente de dados do server        │
  │  • Revalidacao automatica                      │
  │  • Otimistic updates para acoes do chat        │
  │                                                │
  │  Zustand (estado local)                        │
  │  • Leve, sem boilerplate                       │
  │  • Preferencias do usuario, filtros, UI state  │
  └────────────────────────────────────────────────┘
```

### 6.2 Estrutura de rotas sugerida (Next.js)

```
app/
├── (auth)/
│   ├── login/page.tsx
│   └── layout.tsx
├── (dashboard)/
│   ├── layout.tsx                    # Sidebar + header
│   ├── page.tsx                      # Tela 1: Overview
│   ├── contracts/
│   │   ├── page.tsx                  # Lista de contratos
│   │   └── [id]/
│   │       ├── page.tsx              # Tela 2: Contrato individual
│   │       └── executions/
│   │           └── [execId]/
│   │               └── page.tsx      # Tela 3: Trace
│   ├── chat/
│   │   └── page.tsx                  # Tela 4: Chat LLM
│   ├── endpoints/
│   │   └── page.tsx                  # Tela 5: Endpoints & Rotas
│   ├── cron/
│   │   └── page.tsx                  # Tela 6: Cron & Schedulers
│   ├── integrations/
│   │   └── page.tsx                  # Tela 7: Integracoes
│   ├── data/
│   │   ├── page.tsx                  # Tela 8: Store
│   │   └── [table]/page.tsx          # Tabela individual
│   ├── audit/
│   │   └── page.tsx                  # Audit log
│   └── settings/
│       ├── page.tsx                  # Configuracoes gerais
│       ├── members/page.tsx          # Gerenciar membros
│       └── integrations/page.tsx     # Chaves de API
└── api/
    ├── chat/route.ts                 # Endpoint de streaming do LLM
    ├── contracts/route.ts            # CRUD de contratos
    ├── executions/route.ts           # Consulta de execucoes
    └── data/route.ts                 # Proxy para queries de dados
```

### 6.3 Comunicacao com o SIML Engine

```
ARQUITETURA DE COMUNICACAO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ┌────────────┐         ┌──────────────┐         ┌──────────────┐
  │            │  REST   │              │  gRPC/   │              │
  │  Dashboard │ ◄─────► │  Dashboard   │  REST    │  SIML        │
  │  (Browser) │  + SSE  │  Backend     │ ◄──────► │  Runtime     │
  │            │         │  (Next.js)   │          │  Engine      │
  └────────────┘         └──────────────┘         └──────────────┘
        │                       │                        │
        │                       │                        │
        ▼                       ▼                        ▼
   UI rendering          Auth, cache,             Execucao de
   Estado local          rate limiting,           contratos,
   Real-time             proxy para engine        store, eventos
```

O dashboard backend atua como proxy autenticado entre o browser e o engine. Isso permite:

- **Rate limiting** por usuario/role
- **Cache** de dados que nao mudam frequentemente (contratos, schema)
- **Sanitizacao** de dados sensiveis antes de enviar ao browser
- **Aggregacao** de metricas para os cards de overview
- **Streaming** de respostas do LLM via SSE

---

## 7. Navegacao Global

```
SIDEBAR
━━━━━━━━━━━━━━━━━━━━━━━━━

  ◉ SIML Engine

  ─────────────────────
  ▸ Overview          /
  ▸ Contratos         /contracts
  ▸ Endpoints         /endpoints
  ▸ Cron              /cron
  ▸ Integracoes       /integrations
  ▸ Dados             /data
  ─────────────────────
  ▸ Chat LLM          /chat          (destaque visual)
  ─────────────────────
  ▸ Audit Log         /audit
  ▸ Configuracoes     /settings
  ─────────────────────

  ATALHOS DE TECLADO
  Cmd+K    Busca global
  Cmd+J    Abrir chat LLM
  Cmd+.    Acoes rapidas
  Cmd+1-8  Navegar para tela N
  Esc      Fechar modal/painel
```

A busca global (Cmd+K) permite encontrar qualquer coisa no sistema:

```
┌─────────────────────────────────────────────────────┐
│  🔍 Buscar contratos, execucoes, dados...           │
│─────────────────────────────────────────────────────│
│                                                     │
│  CONTRATOS                                          │
│  ▸ processar-pedido                 endpoint        │
│  ▸ processar-pagamento              endpoint        │
│                                                     │
│  EXECUCOES                                          │
│  ▸ #exec-4821  processar-pedido     ● ok  14:32    │
│  ▸ #exec-4820  processar-pedido     ● ok  14:29    │
│                                                     │
│  ENDPOINTS                                          │
│  ▸ POST /api/pedidos                                │
│                                                     │
│  DADOS                                              │
│  ▸ Tabela: pedidos (1.203 registros)                │
│                                                     │
│  ACOES                                              │
│  ▸ "Perguntar ao LLM sobre processar-pedido"        │
│  ▸ "Pausar processar-pagamento"                     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 8. Consideracoes Finais

### O que diferencia este dashboard

1. **Nao e um IDE** — e impossivel escrever codigo. Toda interacao e semantica.
2. **Chat como interface primaria** — a barra de chat esta em todas as telas. O usuario pode perguntar, comandar e diagnosticar de qualquer lugar.
3. **Transparencia radical** — cada decisao do engine e explicavel. Cada execucao tem trace completo. O humano nunca precisa adivinhar o que aconteceu.
4. **Evolucao conversacional** — o sistema nao e "deployado" — ele evolui. Cada mudanca e uma conversa, um preview, uma confirmacao.
5. **Dados como cidadao de primeira classe** — o navegador de dados com query natural torna a inspecao acessivel a nao-tecnicos.

### Sequencia de implementacao recomendada

```
FASE 1 (MVP)
├── Tela 1: Overview (basica, sem graficos)
├── Tela 2: Contrato individual (aba Intencao apenas)
├── Tela 4: Chat LLM (criar e listar contratos)
└── Tela 5: Endpoints (listar e testar)

FASE 2 (Observabilidade)
├── Tela 3: Trace de execucao
├── Tela 2: abas Execucao e Evidencia
├── Real-time via SSE
└── Overview com sparklines

FASE 3 (Operacao completa)
├── Tela 6: Cron
├── Tela 7: Integracoes
├── Tela 8: Dados / Store
└── Busca global (Cmd+K)

FASE 4 (Colaboracao)
├── Modelo de permissoes (Owner/Operator/Viewer)
├── Audit log
├── Tela 2: aba Historico com diff semantico
└── Light mode (opcional)
```

> *"O melhor dashboard nao e o que mostra mais dados. E o que cria mais confianca."*
