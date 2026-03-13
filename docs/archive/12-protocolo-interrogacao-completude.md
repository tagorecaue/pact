# 12 - Protocolo de Interrogacao e Verificacao de Completude

> O cerebro do SIML: o sistema que se recusa a executar contratos incompletos. Antes de qualquer acao, a IA se pergunta "tenho 100% de clareza para nao cometer erros?" — se a resposta for nao, ela pergunta ao humano. Nao assume. Nao adivinha. Pergunta.

---

## 1. O Problema que Resolve

### 1.1 A degradacao silenciosa de intencao

Toda vez que uma intencao humana e traduzida para codigo, ela passa por uma cadeia de traducoes. Cada traducao perde informacao:

```
Humano (intencao original: 100% de contexto)
   |
   | -15% perdido: o que "parece obvio" nao e dito
   v
Analista (documento de requisitos: 85%)
   |
   | -20% perdido: ambiguidade interpretada como certeza
   v
Desenvolvedor (entendimento tecnico: 65%)
   |
   | -15% perdido: edge cases nao considerados
   v
Codigo (implementacao: 50%)
   |
   | -10% perdido: bugs de integracao, configs erradas
   v
Producao (comportamento real: 40%)
```

O humano queria uma coisa. Producao faz outra. A diferenca de 60% nao e incompetencia de ninguem — e entropia inevitavel de traducoes em cadeia. Cada pessoa na cadeia toma micro-decisoes baseadas no que *acha* que a intencao original era. E cada micro-decisao tem uma chance de estar errada.

**O SIML reduz essa cadeia para dois saltos:**

```
Humano (intencao: 100%)
   |
   | O Protocolo de Interrogacao garante: perda < 5%
   v
Contrato Semantico (95%+)
   |
   | Parser deterministico: perda ~0%
   v
Execucao (95%+)
```

O protocolo de interrogacao e a peca que transforma o primeiro salto — de 100% para "alguma coisa" — em um salto controlado com perda maxima de 5%.

### 1.2 Exemplos reais de bugs causados por gaps nao detectados

**Caso 1: O campo que ninguem mencionou**

Uma fintech implementou transferencias via Pix. O requisito dizia: "receber dados do destinatario e fazer a transferencia." O dev implementou. Seis meses depois, um usuario transferiu R$ 50.000 de uma vez. Nao existia limite de valor por transacao. Ninguem mencionou. Ninguem perguntou. O limite regulatorio do Banco Central era de R$ 1.000 para transacoes noturnas Pix para contas nao-identificadas. A multa custou mais que o faturamento do trimestre.

**Pergunta que teria evitado:** "Existe limite de valor por transacao? Varia por horario ou tipo de conta?"

**Caso 2: O else que nao existia**

Um marketplace implementou cancelamento de pedidos. "Se o pedido estiver em 'aguardando envio', permitir cancelamento." O dev implementou o if. Nao implementou o else. Resultado: pedidos em qualquer outro status (enviado, entregue, devolvido) retornavam HTTP 200 sem fazer nada. O frontend mostrava "cancelamento solicitado" sem erro. Clientes achavam que tinham cancelado pedidos ja entregues. O suporte gastou 400 horas em 3 meses resolvendo reclamacoes.

**Pergunta que teria evitado:** "O que acontece quando o pedido NAO esta em 'aguardando envio'? Que resposta o usuario ve?"

**Caso 3: O webhook duplicado**

Uma plataforma de assinaturas integrou com o Stripe. Implementaram o webhook de pagamento. Funcionou. Tres meses depois, descobriram que o Stripe reenvia webhooks quando nao recebe resposta 2xx em 5 segundos. O handler demorava 8 segundos (buscava no banco, atualizava, enviava email). Resultado: cada pagamento era processado 2-3 vezes. Clientes recebiam 3 emails de confirmacao. O estoque era decrementado 3 vezes. Levou duas semanas para encontrar e corrigir o problema, mais uma semana para limpar os dados duplicados.

**Pergunta que teria evitado:** "O que acontece se esse webhook chegar duas vezes com o mesmo evento?"

**Caso 4: O timezone fantasma**

Um sistema de agendamento de consultas medicas. "Cron roda todo dia as 8h para enviar lembretes." O servidor estava configurado em UTC. Os clientes estavam em UTC-3 (Brasilia). Os lembretes chegavam as 5h da manha. Nenhum paciente reclamou oficialmente — eles simplesmente pararam de usar o sistema. A taxa de no-show subiu 40% antes de alguem correlacionar com os lembretes.

**Pergunta que teria evitado:** "Qual timezone? Do servidor, do usuario, ou fixo?"

### 1.3 O custo de "assumir" vs o custo de "perguntar"

O argumento contra perguntar e que "atrasa o desenvolvimento." Vamos comparar:

| | Custo de Perguntar | Custo de Assumir Errado |
|---|---|---|
| **Tempo** | 30 segundos (responder uma pergunta) | 2-40 horas (debug + fix + deploy + cleanup) |
| **Dinheiro** | Zero | Bug em producao: de centenas a milhoes de reais |
| **Confianca** | Humano se sente ouvido | Humano perde confianca no sistema |
| **Dados** | Nenhum impacto | Dados corrompidos, duplicados, ou perdidos |
| **Risco regulatorio** | Nenhum | Multas, processos, exposicao de dados |

A assimetria e grotesca. Perguntar custa segundos. Assumir errado custa horas, dinheiro e confianca. Nao existe cenario racional onde assumir e melhor que perguntar — exceto quando a resposta e genuinamente obvia (e para esses casos, existem os defaults inteligentes da secao 7).

### 1.4 Por que humanos sao ruins em detectar gaps

**Vies de confirmacao:** O humano que escreveu o requisito ja decidiu mentalmente que funciona. Ele le o que escreveu e confirma que esta completo — porque ele preenche os gaps inconscientemente com o que ja sabe. Um terceiro lendo o mesmo texto encontraria duzias de ambiguidades.

**Happy path bias:** Humanos pensam naturalmente no caminho feliz. "O usuario faz login, ve o dashboard, clica em exportar." Ninguem naturalmente pensa: "o usuario faz login, a sessao expira no meio da exportacao, o arquivo fica corrompido no S3, o job de limpeza deleta antes do retry."

**Maldicao do conhecimento:** Quem entende o dominio esquece que outros nao entendem. "O pagamento atualiza o saldo" — qual saldo? Saldo disponivel? Saldo total? Saldo bloqueado? Para quem conhece o sistema, e obvio. Para o codigo, nao e.

**Fadiga de especificacao:** Apos escrever 10 requisitos, o humano esta mentalmente esgotado. Os ultimos requisitos sao os menos detalhados — e frequentemente os mais criticos.

**Pressao por velocidade:** "Depois a gente ajusta." Depois nunca chega. Ou chega como incidente em producao as 3h da manha.

### 1.5 Por que LLMs sao potencialmente bons nisso

LLMs nao sofrem de nenhum dos vieses acima. Eles operam com vantagens estruturais:

**Exposicao a milhoes de padroes de falha.** Um LLM treinado em bilhoes de tokens de codigo, issues, post-mortems e Stack Overflow ja "viu" praticamente todo tipo de bug que existe. Quando le "webhook de pagamento", imediatamente ativa padroes como "idempotencia", "verificacao de assinatura", "timeout de resposta" — nao porque raciocina sobre eles, mas porque esses padroes co-ocorrem sistematicamente no corpus de treinamento.

**Sem fadiga.** O decimo contrato recebe a mesma atencao que o primeiro.

**Sem pressao social.** O LLM nao tem medo de parecer chato por fazer perguntas. Nao tem ego. Nao "acha que entendeu."

**Checklist infinito.** Enquanto um dev seniora mantem mentalmente 20-30 preocupacoes em paralelo, o LLM pode sistematicamente verificar centenas de padroes sem perder nenhum.

**A limitacao:** LLMs podem ter falsos positivos (perguntar coisas obvias) e falsos negativos (perder gaps genuinamente novos). O sistema hibrido da secao 9 mitiga ambos.

---

## 2. Taxonomia de Gaps

Uma classificacao exaustiva de tudo que pode estar faltando em uma intencao. Cada gap e um ponto onde a ambiguidade pode se transformar em bug.

### 2.1 Gaps de Dados

Lacunas sobre as informacoes que o contrato manipula.

| Gap | Descricao | Exemplo |
|-----|-----------|---------|
| Campo obrigatorio nao mencionado | Entidade tem campo critico que ninguem listou | "Cadastrar cliente" — CPF e obrigatorio? |
| Formato de dado ambiguo | Mesmo dado pode ser interpretado de formas diferentes | "Data de nascimento" — DD/MM/AAAA ou AAAA-MM-DD? |
| Fonte de dado nao especificada | Nao esta claro de onde o dado vem | "Saldo do cliente" — de qual sistema? Cache ou fonte primaria? |
| Transformacao implicita nao declarada | Dado precisa ser convertido e ninguem disse | Preco em centavos (Stripe) vs reais (sistema interno) |
| Unicidade nao definida | Nao esta claro se campo deve ser unico | Email do cliente — pode cadastrar dois com o mesmo email? |
| Valor default nao declarado | Campo opcional sem valor default | Status do pedido ao criar — "rascunho"? "pendente"? null? |
| Encoding nao especificado | Texto pode chegar em encodings diferentes | Nome com acentos: UTF-8? Latin-1? O banco aceita qual? |
| Precisao numerica omitida | Numeros sem precisao definida | Valor monetario: 2 casas decimais? Arredonda ou trunca? |

### 2.2 Gaps de Logica

Lacunas nas regras e decisoes do contrato.

| Gap | Descricao | Exemplo |
|-----|-----------|---------|
| Condicao sem else | So define o que acontece quando a condicao e verdadeira | "Se estoque > 0, vender" — e se estoque = 0? |
| Loop sem condicao de parada | Iteracao que pode rodar para sempre | "Reprocessar ate dar certo" — e se nunca der? |
| Ordem de operacoes ambigua | Multiplas acoes sem sequencia clara | "Validar, salvar, notificar" — notifica se salvar falhar? |
| Regra contraditoria | Duas regras que nao podem coexistir | "Todos os campos sao opcionais" + "Nome e obrigatorio" |
| Precedencia nao definida | Multiplas regras aplicaveis, sem prioridade | Desconto de 10% + cupom de 20% — soma? Maior vence? |
| Condicao de corrida implicita | Logica assume atomicidade que nao existe | "Verificar saldo e debitar" — outro debito entre os dois? |
| Transitividade nao verificada | A implica B, B implica C, mas A implica C? | Permissao de admin inclui permissao de gerente que inclui permissao de usuario? |

### 2.3 Gaps de Edge Cases

Lacunas sobre situacoes fora do caminho feliz.

| Gap | Descricao | Exemplo |
|-----|-----------|---------|
| Input vazio ou null | O que acontece com ausencia de dado | Buscar cliente por nome — nome vazio retorna todos? |
| Input duplicado (idempotencia) | Mesma operacao executada duas vezes | Mesmo pagamento chega duas vezes — debita duas vezes? |
| Input fora do range | Valor alem do esperado | Idade = -5? Preco = 999.999.999? |
| Concorrencia | Dois requests simultaneos na mesma entidade | Dois usuarios editam o mesmo pedido ao mesmo tempo |
| Timeout | Operacao demora mais que o esperado | API externa demora 60s — esperar? Cancelar? Em quanto tempo? |
| Overflow | Volume acima da capacidade | 10.000 webhooks em 1 segundo — o sistema aguenta? |
| Dados no limite (boundary) | Valores exatamente no limite de uma regra | Desconto para pedidos > R$ 100 — R$ 100,00 tem desconto? |
| Estado inconsistente | Entidade em estado nao previsto | Pedido com status "pago" mas sem transacao de pagamento |

### 2.4 Gaps de Falha

Lacunas sobre o que acontece quando as coisas dao errado.

| Gap | Descricao | Exemplo |
|-----|-----------|---------|
| Servico externo fora do ar | Dependencia nao responde | Stripe fora do ar — o pedido fica em que status? |
| Retry policy indefinida | Tentar de novo? Quantas vezes? | Email nao enviou — retry imediato? Com delay? Quantos? |
| Backoff nao especificado | Retry sem espacamento crescente | 3 retries imediatos em 1s = DDoS acidental |
| Rollback parcial vs total | Ate onde desfazer | 3 de 5 passos executados, passo 4 falha — desfaz tudo ou so 4? |
| Notificacao de falha | Quem sabe quando algo da errado | Cron falha as 3h — ninguem ve ate segunda de manha |
| Dead letter queue | Para onde vao mensagens nao processaveis | Evento com formato invalido — descarta ou guarda? |
| Degradacao graceful | O que o usuario ve quando algo falha | API de CEP fora do ar — bloquear cadastro ou permitir sem CEP? |
| Falha em cascata | Uma falha que causa outras | Banco de dados lento faz timeout no gateway que faz retry que piora o banco |

### 2.5 Gaps de Seguranca

Lacunas sobre protecao e controle de acesso.

| Gap | Descricao | Exemplo |
|-----|-----------|---------|
| Permissao nao definida | Quem pode executar a operacao | Qualquer usuario pode deletar qualquer pedido? |
| Dados sensiveis expostos | Informacao pessoal em logs ou respostas | CPF aparece no log? Numero do cartao no payload de resposta? |
| Input nao sanitizado | Dados do usuario usados sem limpeza | Nome do cliente com `<script>` salvo e renderizado |
| Rate limiting ausente | Sem limite de requisicoes | Bot faz 10.000 requests por segundo no endpoint de login |
| Autenticacao nao especificada | Endpoint publico ou protegido? | POST /api/users requer token? Qual tipo? |
| Autorizacao por nivel | Diferentes niveis de acesso | Admin ve todos os pedidos, usuario so os dele? |
| Auditoria insuficiente | Acoes sensiveis sem registro | Quem deletou o registro? Quando? De qual IP? |
| Dados em transito | Dados trafegam sem criptografia | HTTP vs HTTPS? TLS minimo? |

### 2.6 Gaps de Integracao

Lacunas sobre comunicacao com sistemas externos.

| Gap | Descricao | Exemplo |
|-----|-----------|---------|
| API externa muda formato | Versao da API externa nao fixada | Stripe muda v2023 para v2024 — o parser quebra |
| Webhook nao entregue | Mensagem de callback perdida | Stripe tentou entregar, servidor retornou 503 |
| Ordem de eventos nao garantida | Eventos chegam fora de sequencia | Evento "pago" chega antes de "pedido criado" |
| Dados inconsistentes entre sistemas | Fonte de verdade nao definida | Preco no cache difere do preco no banco |
| Formato de data/hora divergente | Sistemas usam formatos diferentes | API retorna Unix timestamp, banco espera ISO-8601 |
| Credenciais nao gerenciadas | API keys hard-coded ou sem rotacao | Chave do Stripe no .env sem plano de rotacao |
| Circuit breaker ausente | Sem protecao contra servico degradado | API lenta causa cascata de timeouts |
| Contrato de API nao documentado | Integracao baseada em "funciona hoje" | Endpoint sem documentacao muda sem aviso |

### 2.7 Gaps de Observabilidade

Lacunas sobre visibilidade e monitoramento.

| Gap | Descricao | Exemplo |
|-----|-----------|---------|
| Logging insuficiente | Informacao critica nao registrada | Erro generico "algo deu errado" sem detalhes |
| Logging excessivo | Dados sensiveis nos logs | Payload completo com dados de cartao no log |
| Metricas nao definidas | Nao sabe medir saude do sistema | Qual a latencia p99? Taxa de erro? |
| Alertas nao configurados | Falha acontece e ninguem sabe | Erro 500 em loop por 6 horas, zero notificacoes |
| Tracing ausente | Nao consegue rastrear um request entre servicos | Request falhou — em qual passo? |
| Dashboards inexistentes | Dados existem mas ninguem visualiza | Metricas no Prometheus, zero dashboards no Grafana |

### 2.8 Gaps de Negocio

Lacunas sobre regras do dominio que ninguem explicitou.

| Gap | Descricao | Exemplo |
|-----|-----------|---------|
| Regra regulatoria omitida | Lei ou norma que afeta a implementacao | LGPD: usuario pode pedir exclusao de dados? |
| Excecao nao documentada | Caso especial que quebra a regra geral | "Todos pagam frete" — exceto assinantes premium |
| Aprovacao necessaria | Acao requer aprovacao de alguem | Reembolso acima de R$ 500 precisa de gerente? |
| Limite de alcada | Valor ou permissao tem teto | Operador pode dar desconto de ate quanto? |
| Calendario de negocio | Datas que afetam comportamento | Black Friday: regras de preco mudam? Limite de estoque muda? |
| SLA implicito | Expectativa de tempo nao documentada | "Relatorio deve estar pronto" — em 1 segundo? 1 hora? 1 dia? |
| Multiplas moedas/locales | Internacionalizacao nao considerada | Preco em BRL, mas e se o cliente for de Portugal? |
| Politica de retencao de dados | Quanto tempo manter dados | Logs de 5 anos atras — manter, arquivar, ou deletar? |

---

## 3. Checklists por Tipo de Contrato

Para cada tipo de trigger que um contrato SIML pode ter, existe um checklist especifico de perguntas que o sistema verifica antes de considerar o contrato completo.

### 3.1 Checklist: Endpoint HTTP (API)

```
□ Metodo HTTP definido? (GET, POST, PUT, PATCH, DELETE)
□ Rota/path definida?
□ Autenticacao especificada? (bearer, API key, session, publica)
□ Autorizacao definida? (quem pode chamar, com qual papel)
□ Payload de entrada com schema? (campos, tipos, obrigatoriedade)
□ Todos os campos obrigatorios listados?
□ Validacao de cada campo definida? (formato, range, regex)
□ Resposta de sucesso definida? (status code, corpo, headers)
□ Resposta de erro definida? (por tipo de erro: 400, 401, 403, 404, 500)
□ Rate limiting definido? (requests por minuto/hora por IP/usuario)
□ Idempotencia considerada? (POST duplicado, PUT repetido)
□ Timeout definido? (tempo maximo de processamento)
□ Versionamento de API considerado? (/v1/ no path, header, query param)
□ Content-Type esperado? (JSON, form-data, multipart)
□ CORS configurado? (quais origens, metodos, headers)
□ Paginacao necessaria? (limit, offset, cursor)
□ Ordenacao/filtros necessarios?
```

**Score minimo para execucao:** Os primeiros 10 itens sao bloqueadores. Os demais sao warnings com defaults aplicaveis.

### 3.2 Checklist: Webhook (entrada)

```
□ Assinatura/autenticacao do sender verificada? (HMAC, token, IP whitelist)
□ Idempotencia tratada? (mesmo evento duplicado nao causa efeito duplo)
□ Payload valido vs invalido? (schema de validacao, campos esperados)
□ Resposta esperada pelo sender? (2xx em quantos ms)
□ Retry policy do sender conhecida? (quantos retries, intervalo, backoff)
□ Ordem de eventos garantida? (ou precisa reordenar)
□ Acao em caso de falha interna? (retry, dead letter, notificar)
□ Timeout de processamento? (processar sincrono ou async)
□ Formato de payload documentado? (exemplo real do sender)
□ Evolucao de schema do sender? (o que acontece se o sender adicionar campos)
□ Eventos que devem ser ignorados? (tipos de evento irrelevantes)
□ Logging de payloads? (logar ou nao por questoes de dados sensiveis)
```

**Score minimo para execucao:** Os primeiros 7 itens sao bloqueadores.

### 3.3 Checklist: Cron/Scheduled

```
□ Timezone especificada? (UTC, America/Sao_Paulo, timezone do usuario)
□ Expressao cron ou intervalo definido? (a cada 5min, diario as 8h)
□ O que acontece se execucao anterior ainda esta rodando? (skip, queue, kill)
□ Janela de dados definida? (ultimas 24h, desde ultima execucao, tudo)
□ Timeout da execucao? (maximo de tempo antes de considerar travado)
□ Notificacao de falha definida? (quem, como, quando)
□ Idempotencia garantida? (executar 2x produz mesmo resultado)
□ Lock distribuido necessario? (multiplas instancias do servidor)
□ Volume de dados esperado? (processar 100 registros ou 10 milhoes)
□ Horario de manutencao? (deploy no meio da execucao do cron)
□ Historico de execucao? (guardar logs de cada rodada)
□ Mecanismo de catch-up? (se o servidor ficou fora por 2h, executa o acumulado)
```

**Score minimo para execucao:** Os primeiros 7 itens sao bloqueadores.

### 3.4 Checklist: Integracao com Servico Externo

```
□ URL/endpoint do servico documentado?
□ Credenciais/autenticacao definidas? (API key, OAuth, basic auth)
□ Timeout de chamada definido? (quantos segundos esperar)
□ Retry policy definida? (quantas vezes, com qual intervalo)
□ Circuit breaker configurado? (apos X falhas, parar de tentar por Y segundos)
□ Fallback definido? (o que fazer se servico esta indisponivel)
□ Formato de dados esperado? (request e response schemas)
□ Versionamento da API externa fixado? (v1, v2, latest)
□ Rate limiting da API externa respeitado? (nao exceder cota)
□ Plano de rotacao de credenciais? (chave expira quando)
□ Sandbox vs producao? (ambiente correto configurado)
□ SLA do servico externo conhecido? (uptime, latencia esperada)
□ Dados sensiveis na chamada? (PII, tokens, senhas)
□ Tratamento de respostas inesperadas? (HTML quando espera JSON, status codes novos)
```

**Score minimo para execucao:** Os primeiros 8 itens sao bloqueadores.

### 3.5 Checklist: Manipulacao de Dados (CRUD)

```
□ Validacao de unicidade? (campo X deve ser unico na tabela)
□ Validacao de integridade referencial? (FK existe na tabela referenciada)
□ Soft delete ou hard delete? (marcar como deletado ou apagar de verdade)
□ Historico de mudancas? (audit trail de alteracoes)
□ Permissoes por operacao? (quem pode criar, ler, atualizar, deletar)
□ Dados sensiveis identificados? (PII, financeiros, medicos)
□ Indices necessarios? (campos de busca frequente)
□ Cascata de delecao? (deletar pai deleta filhos?)
□ Tamanho maximo de campos? (texto sem limite? arquivo sem limite de tamanho?)
□ Validacao de formato por campo? (email valido, CPF valido, telefone valido)
□ Valores default para campos opcionais?
□ Tratamento de conflitos de atualizacao? (optimistic locking, last-write-wins)
```

**Score minimo para execucao:** Os primeiros 6 itens sao bloqueadores.

### 3.6 Checklist: Notificacao

```
□ Canal definido? (email, SMS, push, webhook, Slack, in-app)
□ Template de mensagem definido? (texto, variaveis, formatacao)
□ Destinatario definido? (usuario especifico, grupo, todos)
□ Acao em falha de envio? (retry, fallback para outro canal, ignorar)
□ Rate limiting por destinatario? (maximo de N notificacoes por hora)
□ Opt-out/unsubscribe? (usuario pode desativar)
□ Prioridade da notificacao? (urgente vs informativa)
□ Idioma da mensagem? (fixo ou baseado no locale do usuario)
□ Agendamento? (enviar agora ou em horario especifico)
□ Dados sensiveis no conteudo? (nao enviar senha por email)
□ Confirmacao de leitura necessaria? (track de abertura)
□ Canal de fallback? (email falha, tenta SMS)
```

**Score minimo para execucao:** Os primeiros 4 itens sao bloqueadores.

---

## 4. Score de Confianca

O score de confianca e um numero de 0 a 100 que representa quao completo e seguro um contrato esta para execucao. E a metrica central do protocolo de interrogacao.

### 4.1 Classificacao de Gaps

Cada gap identificado recebe uma classificacao:

| Classificacao | Simbolo | Peso | Significado |
|---|---|---|---|
| BLOQUEADOR | vermelho | 0 (zera o item) | Contrato NAO pode ser executado sem resposta humana |
| WARNING | amarelo | 0.5 (metade do peso) | Pode assumir default, mas deveria confirmar |
| INFO | verde | 1.0 (peso completo) | Coberto, vale mencionar a decisao tomada |
| N/A | branco | Excluido do calculo | Nao se aplica a este tipo de contrato |

### 4.2 Formula de Calculo

```
Para cada item do checklist aplicavel (nao N/A):
  - Se BLOQUEADOR:  contribuicao = 0
  - Se WARNING:     contribuicao = peso_do_item * 0.5
  - Se INFO/coberto: contribuicao = peso_do_item * 1.0

Score = (soma_contribuicoes / soma_pesos_totais) * 100
```

**Pesos por categoria:**

| Categoria | Peso Base | Justificativa |
|---|---|---|
| Seguranca | 3x | Falha de seguranca e irreversivel e pode ter impacto legal |
| Falha/Rollback | 2x | Sem tratamento de falha, sistema para em producao |
| Dados (schema/validacao) | 2x | Dados corrompidos sao dificeis de limpar |
| Logica (fluxo/condicoes) | 2x | Bug de logica afeta todo request |
| Edge Cases | 1.5x | Afeta subconjunto de requests |
| Integracao | 1.5x | Depende de fatores externos |
| Observabilidade | 1x | Importante mas nao impede execucao |
| Negocio | 1x a 3x | Depende do dominio e regulacao |

### 4.3 Threshold para Execucao

```
Score >= 95%  →  PRONTO para execucao (SELADO)
Score 80-94%  →  QUASE PRONTO (somente warnings pendentes, defaults aplicaveis)
Score 50-79%  →  INCOMPLETO (bloqueadores presentes, requer respostas humanas)
Score < 50%   →  RASCUNHO (muita informacao faltando, precisa de refinamento significativo)
```

O threshold de 95% e configuravel por dominio. Um sistema financeiro pode exigir 99%. Um prototipo interno pode aceitar 85%.

### 4.4 Exemplo Visual Completo

```
+-- Completude: webhook-stripe-payment ----------------------+
|                                                             |
|  Score: 68% >>>>>>>>--------  INCOMPLETO                   |
|                                                             |
|  BLOQUEADORES (3):                                          |
|     [!] Acao em falha de pagamento nao definida             |
|         Cenario: Stripe retorna status "failed" no          |
|         webhook. O pedido fica em que status?               |
|         Sugestao: status "pagamento_falhou" + notificar     |
|         Pergunta: "Quando o pagamento falha, o pedido       |
|         deve ir para qual status? Notificar o cliente?"     |
|                                                             |
|     [!] Idempotencia nao tratada                            |
|         Cenario: Stripe reenvia mesmo webhook 3x em         |
|         30s. Pedido e processado 3 vezes.                   |
|         Sugestao: dedup por event_id do Stripe              |
|         Pergunta: "Posso usar o event_id do Stripe para     |
|         ignorar webhooks duplicados?"                       |
|                                                             |
|     [!] Permissao do endpoint nao definida                  |
|         Cenario: qualquer IP pode chamar /webhook/stripe.   |
|         Atacante simula webhooks falsos.                    |
|         Sugestao: verificar Stripe-Signature + IP whitelist |
|         Pergunta: "Alem da assinatura, devo restringir      |
|         por IP do Stripe?"                                  |
|                                                             |
|  WARNINGS (4):                                              |
|     [?] Timeout assumido: 30s -- confirma?                  |
|         Default aplicado. Stripe espera resposta em 5-20s.  |
|         Se discordar, informe o valor desejado.             |
|                                                             |
|     [?] Retry de email assumido: 3x -- confirma?            |
|         Default: 3 tentativas, backoff exponencial          |
|         (1s, 2s, 4s). Apos falha: alerta critico.          |
|                                                             |
|     [?] Log de payload assumido: sim -- confirma?           |
|         Default: logar payload SEM dados de cartao.         |
|         Mascarar campos: card.number, card.cvc.             |
|                                                             |
|     [?] Assinatura Stripe assumida: HMAC-SHA256 -- ok?      |
|         Default: verificar header Stripe-Signature com      |
|         HMAC-SHA256 usando webhook secret.                  |
|                                                             |
|  COBERTOS (8):                                              |
|     [ok] Happy path completo                                |
|     [ok] Validacao de payload (schema definido)             |
|     [ok] Persistencia de status (atualizar pedido)          |
|     [ok] Notificacao por email (template definido)          |
|     [ok] Formato de resposta ao Stripe (200 OK)             |
|     [ok] Estrutura de dados do pedido (entidade definida)   |
|     [ok] Campos obrigatorios listados (5 de 5)              |
|     [ok] Transformacao de dados (centavos -> reais)         |
|                                                             |
+-------------------------------------------------------------+
|  Para chegar a 95%:                                         |
|  - Responda os 3 bloqueadores                               |
|  - Confirme ou ajuste os 4 defaults                         |
|  Tempo estimado: ~2 minutos                                 |
+-------------------------------------------------------------+
```

---

## 5. O Loop de Refinamento

O loop de refinamento e o fluxo que transforma uma intencao vaga em um contrato completo e verificado. Ele nunca para antes de 95% — ou antes que o humano explicitamente aceite os riscos dos gaps restantes.

### 5.1 Fluxo Passo-a-Passo

```
ETAPA 1: DECLARACAO DE INTENCAO
+---------------------------------------------------------------+
|  Humano: "Quero um endpoint que recebe pagamento do Stripe,   |
|  valida a assinatura, atualiza o pedido e envia email"        |
+---------------------------------------------------------------+
         |
         v
ETAPA 2: GERACAO DO DRAFT
+---------------------------------------------------------------+
|  IA gera contrato SIML com base na intencao                   |
|  - Identifica tipo: webhook receiver                          |
|  - Identifica entidades: pagamento, pedido, cliente           |
|  - Identifica fluxo: validar -> buscar -> atualizar -> email  |
|  - Aplica defaults do tipo "webhook inbound"                  |
+---------------------------------------------------------------+
         |
         v
ETAPA 3: GAP DETECTION (Checklist Deterministico)
+---------------------------------------------------------------+
|  Sistema percorre checklist de "Webhook (entrada)":           |
|  - 12 itens verificados                                       |
|  - 7 cobertos pelo draft                                      |
|  - 3 bloqueadores identificados                               |
|  - 2 warnings com defaults aplicados                          |
+---------------------------------------------------------------+
         |
         v
ETAPA 4: SCORE < 95%?
+---------------------------------------------------------------+
|  Score = 68%. SIM, menor que 95%.                             |
|                                                                |
|  IA apresenta gaps ao humano:                                  |
|  "Encontrei 3 pontos que preciso esclarecer antes de          |
|  executar este contrato. Mais 4 pontos onde assumi defaults   |
|  que voce pode querer ajustar."                               |
|                                                                |
|  [lista bloqueadores + warnings]                               |
+---------------------------------------------------------------+
         |
         v
ETAPA 5: HUMANO RESPONDE
+---------------------------------------------------------------+
|  Humano: "Pagamento falho -> status 'falhou', notifica sim.   |
|  Idempotencia pelo event_id, pode sim.                        |
|  IP whitelist nao precisa, assinatura basta.                  |
|  Defaults estao bons."                                        |
+---------------------------------------------------------------+
         |
         v
ETAPA 6: IA ATUALIZA CONTRATO
+---------------------------------------------------------------+
|  Contrato atualizado com as respostas:                        |
|  - Novo passo: handle_payment_failed                          |
|  - Novo campo: dedup via stripe_event_id                      |
|  - Decisao registrada: sem IP whitelist (razao: assinatura)   |
|  - Defaults confirmados pelo humano                           |
+---------------------------------------------------------------+
         |
         | (volta para etapa 3)
         v
ETAPA 3 (segunda iteracao): GAP DETECTION
+---------------------------------------------------------------+
|  Checklist reprocessado:                                       |
|  - 12 itens verificados                                       |
|  - 11 cobertos                                                |
|  - 0 bloqueadores                                             |
|  - 1 warning (novo: e se o email de falha tambem falhar?)     |
+---------------------------------------------------------------+
         |
         v
ETAPA 4 (segunda iteracao): SCORE < 95%?
+---------------------------------------------------------------+
|  Score = 96%. NAO, maior que 95%.                             |
|  Contrato considerado PRONTO.                                  |
+---------------------------------------------------------------+
         |
         v
ETAPA 7: VALIDACAO ESTRUTURAL (Parser)
+---------------------------------------------------------------+
|  Parser SIML valida a estrutura do contrato:                  |
|  - Sintaxe valida                                             |
|  - Tipos corretos                                             |
|  - Referencias resolvem (entidades mencionadas existem)       |
|  - Fluxo e um DAG valido (sem ciclos)                         |
|  - Constraints sao satisfaziveis                              |
+---------------------------------------------------------------+
         |
         v
ETAPA 8: ANALISE ADVERSARIAL
+---------------------------------------------------------------+
|  IA tenta QUEBRAR o contrato (detalhes na secao 6):           |
|  - Gera inputs maliciosos                                     |
|  - Simula falhas de servicos                                  |
|  - Testa concorrencia                                         |
|  - Verifica boundaries                                        |
|  Score se mantem >= 95%? SIM.                                  |
+---------------------------------------------------------------+
         |
         v
ETAPA 9: CONTRATO SELADO
+---------------------------------------------------------------+
|  Contrato recebe selo de completude:                           |
|  - Hash do contrato final                                     |
|  - Score de confianca: 96%                                    |
|  - Timestamp de selagem                                       |
|  - Decisoes registradas (audit trail)                         |
|  - Versao: 1.0.0                                              |
|                                                                |
|  Status: SELADO -- pronto para execucao                        |
+---------------------------------------------------------------+
```

### 5.2 Regras do Loop

1. **Maximo de iteracoes: 5.** Se apos 5 rodadas o score nao chegou a 95%, o sistema alerta que o contrato pode ser intrinsecamente complexo demais para uma unica sessao. Sugere dividir em contratos menores.

2. **Perguntas sao agrupadas.** O sistema nunca faz uma pergunta por vez. Todas as perguntas pendentes sao apresentadas de uma vez, agrupadas por categoria.

3. **Respostas parciais sao aceitas.** O humano pode responder 2 de 5 perguntas e dizer "o resto depois." O sistema atualiza o score com o que tem e guarda as pendentes.

4. **Decisoes sao irreversiveis dentro da sessao.** Uma vez que o humano responde "sim, idempotencia por event_id", o sistema nao pergunta de novo. Mas o humano pode a qualquer momento dizer "muda a decisao X" e o sistema reprocessa.

5. **Cada iteracao gera uma versao.** O historico completo de refinamento e preservado. Se daqui a 6 meses alguem perguntar "por que nao tem IP whitelist?", a resposta esta no historico: "humano decidiu em 2026-03-13 que assinatura era suficiente."

### 5.3 Experiencia na CLI

```
$ siml refine webhook-stripe-payment

  Analisando contrato...

  Score atual: 68% >>>>>>>>-------- INCOMPLETO

  Preciso esclarecer 3 pontos antes de aprovar este contrato:

  1. PAGAMENTO FALHO
     Quando o Stripe envia webhook com status "failed",
     o que deve acontecer com o pedido?
     a) Marcar como "pagamento_falhou" e notificar cliente
     b) Manter como "aguardando" e tentar novamente
     c) Outro: [descreva]

  2. DUPLICATA
     O Stripe pode reenviar o mesmo webhook. Como tratar?
     a) Ignorar se ja processado (dedup por event_id)
     b) Reprocessar sempre (idempotente por design)
     c) Outro: [descreva]

  3. ACESSO AO ENDPOINT
     Como proteger /webhook/stripe contra chamadas falsas?
     a) Verificar Stripe-Signature (HMAC) apenas
     b) Stripe-Signature + IP whitelist
     c) Outro: [descreva]

  Alem disso, assumi estes defaults:
     - Timeout: 30s
     - Retry de email: 3x com backoff
     - Log de payload: sim, sem dados de cartao
     - Verificacao: HMAC-SHA256
  Aceita todos? (s/n/ajustar)

  > 1a, 2a, 3a, s

  Atualizando contrato...

  Score atualizado: 96% >>>>>>>>>>>>>>> PRONTO

  Contrato selado. Versao: 1.0.0
  Hash: sha256:a1b2c3d4e5f6...
  Caminho: .siml/contracts/webhook-stripe-payment.siml
```

---

## 6. Analise Adversarial

Apos o gap detection validar que o contrato esta completo, a analise adversarial tenta destrui-lo. Se o gap detection pergunta "voce cobriu isso?", a analise adversarial pergunta "e se alguem fizer ISSO?"

### 6.1 Categorias de Ataque

**Inputs Maliciosos**
O sistema gera inputs projetados para quebrar o contrato:

```
Contrato: webhook-stripe-payment
Ataque: inputs maliciosos

Teste 1: Payload com campo amount negativo
  Input:  { "amount": -5000, "currency": "brl", "order_id": "123" }
  Pergunta: O contrato valida que amount > 0?
  Resultado: NAO COBERTO -> adicionar constraint amount > 0

Teste 2: Payload com order_id inexistente
  Input:  { "amount": 5000, "order_id": "nao-existe-abc" }
  Pergunta: O contrato trata order nao encontrado?
  Resultado: COBERTO -> fluxo define erro 404

Teste 3: Payload com injection no campo customer_email
  Input:  { "customer_email": "test@test.com\nBcc: hacker@evil.com" }
  Pergunta: O campo email e sanitizado antes de usar no envio?
  Resultado: NAO COBERTO -> adicionar sanitizacao de email

Teste 4: Payload absurdamente grande (10MB)
  Input:  { ... 10MB de dados ... }
  Pergunta: Ha limite de tamanho de payload?
  Resultado: NAO COBERTO -> adicionar max payload size
```

**Simulacao de Falhas de Servicos**
O sistema imagina cenarios onde dependencias falham:

```
Contrato: webhook-stripe-payment
Ataque: falha de servicos

Cenario 1: Banco de dados indisponivel
  Momento: passo "find_order"
  Impacto: nao consegue buscar pedido
  Resposta do contrato: timeout -> retry? -> sem definicao de retry para DB
  Resultado: PARCIALMENTE COBERTO -> definir retry policy para DB

Cenario 2: Servico de email fora do ar
  Momento: passo "send_email"
  Impacto: email nao enviado
  Resposta do contrato: retry 3x -> alerta critico
  Resultado: COBERTO

Cenario 3: Banco de dados lento (responde em 25s)
  Momento: passo "find_order"
  Impacto: timeout do webhook (Stripe espera resposta em 20s)
  Resposta do contrato: timeout de 30s > timeout do Stripe
  Resultado: PROBLEMA -> Stripe vai reenviar webhook antes de terminar
  Sugestao: responder 200 imediatamente, processar async
```

**Simulacao de Concorrencia**
O sistema testa cenarios com multiplos requests simultaneos:

```
Contrato: webhook-stripe-payment
Ataque: concorrencia

Cenario 1: Mesmo webhook chega 2x em 50ms
  Request A: event_id=evt_123, passo find_order
  Request B: event_id=evt_123, passo find_order
  Problema: ambos encontram pedido em "pendente"
            ambos atualizam para "pago"
            contrato tem dedup por event_id, mas a checagem e atomica?
  Resultado: DEPENDE -> se dedup usa lock atomico (upsert), ok
             se dedup e "SELECT + INSERT", tem race condition
  Sugestao: usar constraint UNIQUE no event_id + upsert

Cenario 2: Webhook de pagamento + webhook de cancelamento simultaneos
  Request A: payment.succeeded para order 456
  Request B: order.cancelled para order 456
  Problema: qual chega primeiro? Pedido fica pago ou cancelado?
  Resultado: NAO COBERTO -> definir precedencia entre eventos conflitantes
```

**Boundary Testing**
O sistema testa valores nos limites:

```
Contrato: webhook-stripe-payment
Ataque: boundary testing

Teste 1: amount = 0
  Pergunta: pagamento de R$ 0,00 e valido?
  Resultado: NAO COBERTO -> definir amount minimo

Teste 2: amount = 999999999 (overflow de centavos -> reais)
  Pergunta: R$ 9.999.999,99 e um valor plausivel?
  Resultado: NAO COBERTO -> definir amount maximo

Teste 3: customer_email com 500 caracteres
  Pergunta: email com 500 chars e valido (RFC permite ate 254)?
  Resultado: NAO COBERTO -> validar tamanho maximo

Teste 4: order_id com caracteres especiais
  Input: order_id = "123'; DROP TABLE orders;--"
  Pergunta: order_id e sanitizado antes de query?
  Resultado: COBERTO -> SIML usa parametrized queries por default
```

### 6.2 Report Adversarial Consolidado

```
+-- Analise Adversarial: webhook-stripe-payment ---------------+
|                                                               |
|  Testes executados: 14                                        |
|  Vulnerabilidades encontradas: 5                              |
|                                                               |
|  CRITICO (2):                                                 |
|  [!] Race condition no dedup de event_id                      |
|      SELECT + INSERT nao e atomico. Usar UNIQUE + upsert.     |
|  [!] Timeout do contrato (30s) > timeout do Stripe (20s)      |
|      Stripe reenvia antes de terminar. Processar async.       |
|                                                               |
|  ALTO (2):                                                    |
|  [!] Amount negativo ou zero nao validado                     |
|  [!] Payload size sem limite (DoS potencial)                  |
|                                                               |
|  MEDIO (1):                                                   |
|  [?] Eventos conflitantes sem precedencia definida            |
|      (pagamento + cancelamento simultaneos)                   |
|                                                               |
|  Score pos-adversarial: 89% (caiu de 96%)                     |
|  Status: REQUER CORRECAO antes de selar                       |
|                                                               |
+---------------------------------------------------------------+
```

Se o score cai abaixo de 95% apos a analise adversarial, o contrato volta para o loop de refinamento com as novas perguntas.

---

## 7. Defaults Inteligentes

Para gaps classificados como WARNING (nao bloqueadores), o sistema pode aplicar defaults sensatos em vez de exigir resposta humana. Isso acelera o refinamento sem sacrificar seguranca.

### 7.1 Defaults por Tipo de Contrato

```
defaults http_endpoint {
  timeout: 30s
  retry: 3 tentativas, backoff exponencial (1s, 2s, 4s)
  auth: bearer token via header Authorization
  rate_limit: 100 requests/minuto por IP
  idempotency: por header X-Request-Id (se presente)
  logging: payload completo, mascarar campos com "password", "token",
           "secret", "card", "cvv", "ssn", "cpf" no nome
  cors: nenhuma origem permitida (explicitar se necessario)
  content_type: application/json
  max_payload: 1MB
  response_format: { data: ..., error: null } ou { data: null, error: ... }
}

defaults webhook_inbound {
  verify_signature: true (mecanismo depende do sender)
  respond_within: 5s (aceitar rapido, processar async se necessario)
  idempotency: por event_id do sender
  retry_policy: responder 200 imediatamente, processar em background
  dead_letter: guardar payloads nao-processaveis por 30 dias
  ignore_unknown_events: true (logar mas nao falhar)
  max_payload: 5MB
  logging: payload completo, mascarar dados sensiveis
}

defaults cron_job {
  timezone: UTC (SEMPRE explicitar, nunca "local")
  overlap: skip se execucao anterior ainda esta rodando
  timeout: 5 minutos
  notify_failure: dono do contrato, via canal primario configurado
  idempotent: true (executar 2x produz mesmo resultado)
  lock: distribuido via advisory lock no banco
  catchup: nao (se perdeu janela, espera proxima)
  logging: inicio, fim, duracao, registros processados, erros
}

defaults integracao_externa {
  timeout: 10s
  retry: 3 tentativas, backoff exponencial (1s, 2s, 4s)
  circuit_breaker: abrir apos 5 falhas consecutivas, fechar apos 30s
  fallback: retornar erro claro ao chamador (nao engolir silenciosamente)
  credenciais: via variavel de ambiente (nunca hard-coded)
  tls: minimo TLS 1.2
  logging: request/response, mascarar headers de autenticacao
}

defaults notificacao {
  retry: 2 tentativas com intervalo de 5s
  rate_limit: maximo 10 por hora por destinatario
  canal_fallback: nenhum (explicitar se necessario)
  tracking: registrar tentativa de envio e status
  opt_out: respeitar preferencias do usuario
  template: requer pelo menos assunto e corpo
}

defaults manipulacao_dados {
  delete_strategy: soft delete (campo deleted_at)
  audit_trail: registrar quem, quando, o que mudou
  unique_validation: por campo marcado como identificador
  cascade: nao (negar delecao se tem dependentes, explicitar se diferente)
  encoding: UTF-8
  date_format: ISO-8601
  monetary_precision: 2 casas decimais, arredondamento HALF_UP
}
```

### 7.2 Como Defaults sao Apresentados

O sistema nunca aplica defaults silenciosamente. Ele sempre informa:

```
  Assumi os seguintes defaults para este contrato:

  Timeout ............. 30s (padrao para webhooks)
  Retry email ......... 3x com backoff exponencial
  Log de payload ...... sim, sem dados de cartao
  Verificacao ......... HMAC-SHA256 via Stripe-Signature
  Processamento ....... async (responder 200 imediato)
  Dead letter ......... guardar payloads falhos por 30 dias

  Aceita todos? (s/n/ajustar N)

  Exemplos de ajuste:
  > ajustar 1: timeout 15s
  > ajustar 3: nao logar payload
  > n (rejeitar todos e definir manualmente)
```

### 7.3 Defaults que se Adaptam

O sistema aprende com as decisoes do humano ao longo do tempo:

```
Se o humano tem 10 contratos no dominio "e-commerce":
  - 9 de 10 usam timeout de 15s (nao 30s)
  - O sistema ajusta o default para o proximo contrato de e-commerce:
    "Timeout: 15s (baseado nos seus contratos anteriores)"

Se o humano SEMPRE aceita defaults de retry:
  - O sistema para de perguntar e apenas informa:
    "Retry: 3x com backoff (seu padrao — diga 'ajustar' se quiser mudar)"

Se o humano NUNCA aceita um default especifico:
  - O sistema promove de WARNING para pergunta direta:
    "Qual rate limit? (voce geralmente muda o padrao de 100/min)"
```

---

## 8. Perguntas que Nenhum Dev Faz (mas Deveria)

As dez perguntas mais valiosas que o protocolo de interrogacao faria sistematicamente — e que humanos esquecam de forma consistente.

### 8.1 "O que acontece se esse endpoint receber o mesmo request duas vezes?"

**Por que ninguem pergunta:** Desenvolvedores pensam em requests como eventos unicos. Na realidade, duplicatas acontecem por retry automatico, double-click do usuario, replay de filas, e bugs de integracao.

**Bug real que teria sido evitado:** Um sistema de e-commerce processava pagamentos via API. O frontend tinha um bug que enviava o POST de pagamento duas vezes em conexoes lentas (timeout do fetch + retry automatico). Cada POST gerava uma cobranca no cartao. 847 clientes foram cobrados em dobro em um fim de semana. O refund custou R$ 180.000 em taxas de estorno e 3 semanas de trabalho manual.

**O que o protocolo perguntaria:** "Se POST /pagamento receber o mesmo request com os mesmos dados duas vezes em 5 segundos, o que deve acontecer? (a) Processar duas vezes (b) Ignorar a segunda (c) Retornar o resultado da primeira."

### 8.2 "Se o servico X estiver fora do ar, o usuario ve o que?"

**Por que ninguem pergunta:** O caminho feliz e tao natural que a falha parece improvavel. "O Stripe nunca fica fora do ar." Fica sim. E quando fica, o usuario ve uma pagina branca com stack trace, ou pior, um spinner infinito.

**Bug real que teria sido evitado:** Uma plataforma de cursos online dependia de uma API de video (Vimeo) para exibir aulas. A API ficou fora do ar por 4 horas em uma terca-feira as 20h (horario de pico). O frontend chamava a API sincrono e sem timeout. Resultado: pagina inteira nao carregava. 2.400 alunos nao conseguiram assistir aulas. O suporte recebeu 600 tickets. A solucao era trivial: timeout de 3 segundos e fallback "video indisponivel temporariamente, tente em 5 minutos."

**O que o protocolo perguntaria:** "Se a API do Vimeo nao responder em X segundos, o que o usuario deve ver? (a) Mensagem de indisponibilidade (b) Pagina inteira falha (c) Conteudo parcial sem video."

### 8.3 "Quando esse dado e deletado, o que acontece com quem referencia ele?"

**Por que ninguem pergunta:** Delecao parece simples. DELETE FROM tabela WHERE id = X. Mas se outra tabela tem foreign key para esse registro, o banco rejeita (se tiver constraint) ou fica com referencia orfao (se nao tiver).

**Bug real que teria sido evitado:** Um SaaS de gestao de projetos permitia deletar membros da equipe. Cada tarefa tinha um campo assignee_id referenciando o membro. Ao deletar o membro, as tarefas ficavam com assignee_id apontando para registro inexistente. O frontend exibia "Atribuido a: undefined." Ninguem percebeu por meses porque as tarefas nao davam erro — so mostravam "undefined." Quando perceberam, 3.000 tarefas estavam com atribuicao fantasma.

**O que o protocolo perguntaria:** "Quando um membro e deletado, o que deve acontecer com as tarefas atribuidas a ele? (a) Reatribuir para o gerente (b) Marcar como 'nao atribuida' (c) Impedir delecao se tiver tarefas."

### 8.4 "Esse campo pode ser vazio? E se for?"

**Por que ninguem pergunta:** Campos obrigatorios parecem obvios. Mas "obrigatorio" no formulario nao significa "nao-null no banco." E APIs podem receber dados sem frontend.

**Bug real que teria sido evitado:** Um sistema de CRM recebia leads de multiplas fontes: formulario web, API de parceiros, importacao CSV. O formulario exigia telefone. A API nao. O CSV as vezes tinha celula vazia. O sistema de discagem automatica recebia lista de leads, tentava ligar para numeros null, e o servico de telefonia cobrava R$ 0,10 por tentativa de chamada invalida. Em um mes, 12.000 tentativas para numeros inexistentes = R$ 1.200 jogados fora, alem de poluir metricas de conversao.

**O que o protocolo perguntaria:** "O campo 'telefone' pode ser vazio/null? Se sim, o que acontece nos processos que dependem dele (discagem, SMS, WhatsApp)?"

### 8.5 "Se dois usuarios fizerem isso ao mesmo tempo, o que acontece?"

**Por que ninguem pergunta:** Concorrencia e invisivel no desenvolvimento local. O dev testa sozinho, um request de cada vez. Em producao, centenas de requests chegam simultaneamente.

**Bug real que teria sido evitado:** Um sistema de reservas de restaurante. Duas pessoas veem a mesma mesa disponivel. Ambas clicam em "reservar" ao mesmo tempo. O sistema faz SELECT (mesa disponivel? sim) -> UPDATE (marcar como reservada). Sem lock, ambos os SELECTs retornam "disponivel." Ambos os UPDATEs executam. Mesa reservada para duas pessoas diferentes. Resultado: duas familias chegam no restaurante e so tem uma mesa. O restaurante perdeu a confianca no sistema.

**O que o protocolo perguntaria:** "Se dois usuarios tentarem reservar a mesma mesa ao mesmo tempo, como resolver o conflito? (a) Primeiro que commitar ganha (b) Lock otimista com retry (c) Fila de reservas."

### 8.6 "Quanto tempo isso pode ficar fora do ar sem impacto?"

**Por que ninguem pergunta:** SLA e coisa de contrato formal entre empresas. Internamente, ninguem define. Mas todo sistema tem um SLA implicito — o tempo maximo que pode ficar fora do ar antes que o negocio sofra.

**Bug real que teria sido evitado:** Uma plataforma de pagamentos ficou fora do ar por 6 horas em um sabado. Ninguem percebeu porque o monitoramento notificava por Slack e ninguem olhava Slack no sabado. O sistema processava pagamentos recorrentes de assinaturas. 2.000 cobrancos falharam. Clientes receberam email de "pagamento nao processado" do servico que dependia desses pagamentos. Recovery demorou 3 dias uteis.

**O que o protocolo perguntaria:** "Se esse contrato ficar inoperante, em quanto tempo o impacto comeca? (a) Imediato (b) Minutos (c) Horas (d) Dias. Quem precisa ser notificado e em quanto tempo?"

### 8.7 "Quem deveria ser notificado se isso falhar as 3h da manha?"

**Por que ninguem pergunta:** Todo mundo assume que "alguem" vai ver. Ninguem define quem. Em producao, alertas vao para canais que ninguem olha fora do horario comercial.

**Bug real que teria sido evitado:** Um cron job de consolidacao financeira rodava todo dia as 2h. Falhava silenciosamente quando um campo de moeda vinha com formato inesperado. A falha aconteceu em uma quarta-feira as 2h. Na sexta, o time financeiro percebeu que os relatorios de quinta e sexta estavam errados. Tres dias de dados financeiros foram reprocessados manualmente. Se o cron tivesse uma notificacao por SMS para o engenheiro de plantao, a falha seria corrigida em 1 hora.

**O que o protocolo perguntaria:** "Se esse cron job falhar fora do horario comercial, quem deve ser notificado? Por qual canal? (email pode demorar para ser lido, SMS/telefone e imediato)."

### 8.8 "Esse dado e pessoal/sensivel? Precisa de LGPD?"

**Por que ninguem pergunta:** Compliance parece coisa de advogado. Mas todo campo com nome, email, CPF, endereco ou telefone e dado pessoal segundo a LGPD. E o custo de nao-compliance e brutal.

**Bug real que teria sido evitado:** Uma startup de saude armazenava historico medico de pacientes em texto plano no banco de dados, com backups nao-criptografados no S3. Um bucket S3 configurado como publico por erro expou dados medicos de 15.000 pacientes. Multa da ANPD + processo coletivo + dano reputacional. A startup fechou em 8 meses.

**O que o protocolo perguntaria:** "O contrato manipula dados pessoais (nome, email, CPF, endereco, telefone, dados de saude, dados financeiros)? Se sim: (a) Dados devem ser criptografados em repouso? (b) Logs devem mascarar esses campos? (c) Existe politica de retencao/exclusao? (d) Usuario pode solicitar exclusao (LGPD Art. 18)?"

### 8.9 "Se a API externa mudar a versao, o que quebra?"

**Por que ninguem pergunta:** Integracoes sao configuradas uma vez e esquecidas. Ate o dia em que a API externa deprecia a versao e tudo para de funcionar.

**Bug real que teria sido evitado:** Um marketplace integrado com os Correios para calculo de frete. A API dos Correios mudou de SOAP para REST sem aviso previo claro. O endpoint antigo retornou 404. Todo calculo de frete falhou. Como nao tinha fallback, o botao "calcular frete" retornava erro para 100% dos usuarios. Vendas cairam 90% em um dia. O fix demorou 4 horas porque ninguem sabia a URL nova nem o formato novo.

**O que o protocolo perguntaria:** "Qual versao da API esta sendo usada? O que acontece se essa versao for depreciada? Existe fallback (tabela de precos cached, outra API de frete)?"

### 8.10 "Daqui a 6 meses quando ninguem lembrar o que isso faz, o que e mais confuso?"

**Por que ninguem pergunta:** No momento da criacao, tudo e obvio. Seis meses depois, sem contexto, o contrato e um enigma.

**Bug real que teria sido evitado:** Um microservico de "reconciliacao" foi criado por um dev que saiu da empresa. O servico rodava um cron diario que comparava dados entre dois bancos de dados e "corrigia discrepancias." Ninguem sabia exatamente quais discrepancias, qual era a fonte de verdade, ou por que as discrepancias existiam. Quando o cron comecou a "corrigir" dados que na verdade estavam certos (porque o outro sistema mudou a logica), levou 2 semanas para alguem perceber e 1 semana para reverter os dados.

**O que o protocolo perguntaria:** "Registre no contrato: (a) Por que esse contrato existe (contexto historico) (b) Qual e a fonte de verdade para cada entidade (c) O que NAO e responsabilidade deste contrato (d) Quem consultar se algo parecer errado."

---

## 9. Implementacao Tecnica

Tres abordagens para implementar o gap detector, com analise de trade-offs de cada uma.

### 9.1 Opcao A: Rule-based (Deterministico)

Checklist hard-coded por tipo de contrato. Para cada tipo, uma lista de verificacoes que podem ser avaliadas sem ambiguidade.

**Vantagens:**
- Rapido (milissegundos, sem chamada a LLM)
- Previsivel (mesmo contrato sempre produz mesmo resultado)
- Auditavel (regras sao explicitas e verificaveis)
- Sem custo variavel (nao consome tokens)
- Funciona offline

**Desvantagens:**
- So detecta gaps que alguem ja pensou e codificou
- Nao entende contexto ou dominio
- Nao faz conexoes nao-obvias entre campos
- Manutencao manual de regras

**Pseudo-codigo:**

```python
class RuleBasedGapDetector:

    def __init__(self):
        self.checklists = {
            "http_endpoint": CHECKLIST_HTTP,
            "webhook_inbound": CHECKLIST_WEBHOOK,
            "cron_job": CHECKLIST_CRON,
            "integracao_externa": CHECKLIST_INTEGRACAO,
            "crud": CHECKLIST_CRUD,
            "notificacao": CHECKLIST_NOTIFICACAO,
        }
        self.defaults = load_defaults()

    def detect(self, contrato: ContratoSIML) -> GapReport:
        tipo = contrato.trigger.tipo
        checklist = self.checklists[tipo]

        gaps = []
        for item in checklist:
            status = item.verificar(contrato)

            if status == NaoCoberto:
                if item.bloqueador:
                    gaps.append(Gap(
                        tipo="BLOQUEADOR",
                        descricao=item.descricao,
                        pergunta=item.pergunta_sugerida,
                        peso=item.peso
                    ))
                elif item.tem_default:
                    gaps.append(Gap(
                        tipo="WARNING",
                        descricao=item.descricao,
                        default_aplicado=self.defaults[item.chave],
                        peso=item.peso
                    ))
            elif status == Coberto:
                gaps.append(Gap(
                    tipo="INFO",
                    descricao=item.descricao,
                    decisao=status.valor,
                    peso=item.peso
                ))
            # status == NaoAplicavel -> ignora

        score = calcular_score(gaps)
        return GapReport(gaps=gaps, score=score)

    def calcular_score(self, gaps: list[Gap]) -> float:
        peso_total = 0
        peso_coberto = 0

        for gap in gaps:
            if gap.tipo == "N/A":
                continue
            peso_total += gap.peso

            if gap.tipo == "INFO":
                peso_coberto += gap.peso
            elif gap.tipo == "WARNING":
                peso_coberto += gap.peso * 0.5
            # BLOQUEADOR contribui 0

        if peso_total == 0:
            return 100.0
        return (peso_coberto / peso_total) * 100
```

**Exemplo de item de checklist:**

```python
ChecklistItem(
    chave="idempotencia",
    descricao="Tratamento de requests duplicados",
    verificar=lambda contrato: (
        Coberto(contrato.restricoes.get("idempotencia"))
        if contrato.restricoes.get("idempotencia")
        else NaoCoberto
    ),
    bloqueador=True,
    peso=2.0,  # categoria: edge case (1.5x) * importancia
    pergunta_sugerida=(
        "O que acontece se esse {tipo_trigger} chegar duplicado? "
        "Sugestao: dedup por {campo_sugerido}."
    ),
    tem_default=False,
    aplicavel_a=["webhook_inbound", "http_endpoint"]
)
```

### 9.2 Opcao B: LLM-based (Heuristico)

O LLM analisa o contrato como um revisor humano faria, mas com a vantagem de ter visto milhoes de padroes de falha.

**Vantagens:**
- Descobre gaps que regras nao cobrem (contextuais, de dominio)
- Entende linguagem natural (intencao do contrato)
- Faz conexoes nao-obvias ("esse campo parece CPF, precisa de LGPD")
- Nao requer manutencao de regras

**Desvantagens:**
- Latencia (2-10 segundos por analise)
- Custo por chamada (tokens de input + output)
- Nao-deterministico (pode dar resultados diferentes para o mesmo contrato)
- Falsos positivos (perguntas desnecessarias que irritam o usuario)
- Falsos negativos (pode perder gaps que uma regra fixa pegaria)
- Requer conexao com API do LLM

**Prompt template (detalhado na secao 10).**

### 9.3 Opcao C: Hibrido (Recomendado)

A abordagem recomendada combina ambos: checklist deterministico primeiro, LLM segundo.

```
FASE 1: Deterministico (rapido, confiavel)
  - Percorre checklist do tipo de contrato
  - Identifica gaps obvios (campos faltando, fluxos sem else)
  - Aplica defaults onde aplicavel
  - Tempo: <100ms
  - Resultado: floor de qualidade garantido

FASE 2: LLM (criativo, contextual)
  - Recebe contrato + resultado da fase 1
  - NAO repete verificacoes ja feitas
  - Foca em gaps que regras nao cobrem:
    * Gaps de dominio (regras de negocio implicitas)
    * Gaps de contexto (interacao com outros contratos)
    * Gaps de cenario (combinacoes nao-obvias de inputs)
    * Gaps de evolucao (o que muda se o negocio crescer)
  - Tempo: 2-5 segundos
  - Resultado: ceiling de qualidade aumentado
```

**Pseudo-codigo da implementacao hibrida:**

```python
class HybridGapDetector:

    def __init__(self, llm_client, config):
        self.rule_detector = RuleBasedGapDetector()
        self.llm_client = llm_client
        self.config = config

    def detect(self, contrato: ContratoSIML) -> GapReport:
        # FASE 1: Deterministico
        rule_report = self.rule_detector.detect(contrato)

        # Se score ja e 100% no deterministico E contrato e simples,
        # LLM pode ser opcional
        if rule_report.score >= 100 and contrato.complexidade == "baixa":
            return rule_report

        # FASE 2: LLM
        llm_report = self.llm_detect(contrato, rule_report)

        # COMBINAR: regras tem precedencia para gaps ja cobertos
        # LLM adiciona gaps novos
        combined = self.combinar_reports(rule_report, llm_report)

        return combined

    def llm_detect(self, contrato, rule_report) -> GapReport:
        prompt = self.build_prompt(contrato, rule_report)

        response = self.llm_client.complete(
            model=self.config.modelo_gap_detection,
            prompt=prompt,
            temperature=0.3,  # baixo: queremos consistencia
            max_tokens=2000,
        )

        return self.parse_llm_response(response)

    def combinar_reports(self, rule_report, llm_report) -> GapReport:
        # Gaps do checklist sao definitivos (nao override por LLM)
        gaps = list(rule_report.gaps)

        # Gaps do LLM sao adicionados SE nao duplicam regras
        for llm_gap in llm_report.gaps:
            if not self.duplica_gap_existente(llm_gap, gaps):
                # LLM gaps tem peso reduzido (0.7x) vs regras (1.0x)
                # porque LLM pode ter falsos positivos
                llm_gap.peso *= 0.7
                llm_gap.origem = "llm"
                gaps.append(llm_gap)

        score = self.calcular_score_combinado(gaps)
        return GapReport(gaps=gaps, score=score)

    def duplica_gap_existente(self, novo_gap, gaps_existentes) -> bool:
        # Verifica se o LLM encontrou algo que o checklist ja cobriu
        for existente in gaps_existentes:
            if self.similaridade_semantica(novo_gap, existente) > 0.8:
                return True
        return False
```

**Decisao de quando chamar o LLM:**

```python
def precisa_llm(contrato, rule_report):
    # Sempre chamar LLM para contratos novos (primeiro deploy)
    if contrato.versao == "1.0.0":
        return True

    # Sempre chamar para contratos de alta criticidade
    if contrato.prioridade in ["critical", "high"]:
        return True

    # Chamar se o dominio e regulado (financeiro, saude)
    if contrato.dominio in ["financeiro", "saude", "juridico"]:
        return True

    # Nao chamar para ajustes menores em contratos ja selados
    if contrato.mudanca_tipo == "patch" and rule_report.score >= 95:
        return False

    # Default: chamar
    return True
```

---

## 10. Prompt Engineering para Gap Detection

O prompt enviado ao LLM na fase 2 do detector hibrido. Este prompt e o nucleo da capacidade de descobrir gaps nao-obvios.

### 10.1 Prompt Principal

```
Voce e um analista de sistemas senior com 20 anos de experiencia em producao.
Voce ja foi acordado as 3h da manha por sistemas que falharam por causa de
gaps que ninguem pensou. Sua obsessao e encontrar esses gaps ANTES que causem
problemas.

CONTRATO SIML PARA REVISAO:
---
{contrato_siml_completo}
---

CHECKLIST DETERMINISTICO JA EXECUTADO:
---
{resultado_checklist_formatado}
---

GAPS JA IDENTIFICADOS PELO CHECKLIST:
{lista_gaps_deterministicos}

SUA TAREFA:
Encontre gaps ADICIONAIS que o checklist deterministico NAO cobriu.
Nao repita o que ja foi encontrado. Foque em:

1. Gaps de DOMINIO: regras de negocio implicitas que ninguem disse mas que
   existem no mundo real deste tipo de operacao.

2. Gaps de CONTEXTO: interacoes com outros contratos ou sistemas que podem
   causar problemas (efeitos colaterais, dependencias ocultas).

3. Gaps de CENARIO: combinacoes nao-obvias de inputs ou estados que criam
   situacoes nao tratadas.

4. Gaps de EVOLUCAO: o que vai quebrar quando o negocio crescer 10x? 100x?
   Quando mudar de regiao? Quando adicionar uma feature adjacente?

Para CADA gap encontrado, responda EXATAMENTE neste formato:

GAP: [descricao curta do gap]
CATEGORIA: BLOQUEADOR | WARNING | INFO
CENARIO: [descreva a situacao concreta em que isso causa problema]
PERGUNTA: [a pergunta exata a fazer ao humano]
DEFAULT: [se aplicavel, o default que voce sugeriria]
JUSTIFICATIVA: [por que isso importa — preferencialmente com referencia a
                incidentes reais ou padroes conhecidos de falha]

Se nao encontrar nenhum gap adicional, responda apenas:
NENHUM_GAP_ADICIONAL

Pense como alguem que vai ser acordado as 3h da manha quando isso falhar.
Pense como alguem que vai ser processado judicialmente quando dados vazarem.
Pense como alguem que vai explicar ao CEO por que o sistema parou no Black Friday.
```

### 10.2 Prompt para Analise Adversarial

```
Voce e um pentester e chaos engineer. Seu trabalho e QUEBRAR este contrato.

CONTRATO SIML (JA APROVADO PELO GAP DETECTION):
---
{contrato_siml_completo}
---

SCORE ATUAL: {score}%
GAPS COBERTOS: {lista_gaps_cobertos}
DEFAULTS APLICADOS: {lista_defaults}

SUA TAREFA:
Tente destruir este contrato. Gere cenarios que fariam ele falhar.

CATEGORIAS DE ATAQUE:

1. INPUTS MALICIOSOS
   Gere 5 inputs projetados para quebrar o contrato.
   Para cada: descreva o input, o que deveria acontecer, e o que
   realmente aconteceria.

2. FALHA DE DEPENDENCIAS
   Para cada servico externo que o contrato usa, descreva o que
   acontece se esse servico: (a) cair totalmente (b) ficar lento
   (c) retornar dados invalidos (d) mudar o formato de resposta.

3. CONCORRENCIA
   Descreva 3 cenarios onde requests simultaneos causariam
   resultados inesperados.

4. BOUNDARY TESTING
   Para cada campo de input, teste: valor minimo, valor maximo,
   zero, negativo, null, vazio, tipo errado, valor no exato limite
   de uma condicao.

5. CASCATA DE FALHAS
   Descreva 2 cenarios onde uma falha parcial causa efeitos em
   cadeia que amplificam o problema.

Para CADA vulnerabilidade encontrada:

VULNERABILIDADE: [descricao]
SEVERIDADE: CRITICO | ALTO | MEDIO | BAIXO
CENARIO_ATAQUE: [passo a passo de como explorar]
IMPACTO: [o que acontece se nao for tratado]
MITIGACAO: [como corrigir no contrato]

Se o contrato e genuinamente robusto, diga:
CONTRATO_ROBUSTO: nenhuma vulnerabilidade significativa encontrada.
```

### 10.3 Prompt para Dominio Especifico

Para dominios regulados, um contexto adicional e injetado:

```
CONTEXTO DE DOMINIO: {dominio}

dominios/financeiro:
  Regulacoes relevantes: Banco Central, CVM, LGPD, PCI-DSS
  Riscos especificos: lavagem de dinheiro, fraude, exposicao de dados financeiros
  Campos sensiveis: CPF, conta bancaria, cartao de credito, renda
  Verificacoes obrigatorias: KYC, AML screening, limites de transacao

dominios/saude:
  Regulacoes relevantes: LGPD, CFM, ANVISA, HIPAA (se internacional)
  Riscos especificos: exposicao de dados medicos, erro de medicacao, laudo errado
  Campos sensiveis: CRM, diagnostico, prescricao, resultado de exame
  Verificacoes obrigatorias: anonimizacao, consentimento, retencao minima de prontuario

dominios/e-commerce:
  Regulacoes relevantes: CDC, LGPD, regulacao de marketplace
  Riscos especificos: estorno de pagamento, fraude em pedido, dados de cartao
  Campos sensiveis: cartao de credito, endereco, CPF
  Verificacoes obrigatorias: PCI compliance, politica de devolucao, nota fiscal

dominios/educacao:
  Regulacoes relevantes: LGPD, MEC (se institucional)
  Riscos especificos: dados de menores, historico academico, fraude em certificado
  Campos sensiveis: dados de alunos menores, notas, frequencia
  Verificacoes obrigatorias: consentimento de responsavel (menores), retencao de historico
```

### 10.4 Calibracao do Prompt

O prompt nao e estatico. Ele e calibrado com base em feedback:

**Se muitos falsos positivos (perguntas inuteis):**
- Adicionar ao prompt: "Nao pergunte sobre {categoria} a menos que haja evidencia concreta no contrato de que se aplica."
- Aumentar threshold de confianca para reportar gap.

**Se falsos negativos (gaps perdidos que viraram bugs):**
- Adicionar o gap perdido como exemplo no prompt: "Um gap que frequentemente nao e detectado: {descricao do gap}."
- Reduzir threshold para ser mais agressivo.

**Metricas de calibracao:**
- Taxa de aceitacao de gaps pelo humano (target: 80%+)
- Taxa de rejeicao "isso e obvio" (target: <10%)
- Gaps que escaparam e causaram incidente (target: <1%)

---

## 11. Metricas do Protocolo

Como medir se o protocolo de interrogacao esta cumprindo seu proposito.

### 11.1 Metricas de Eficacia

**Taxa de completude na primeira iteracao:**
```
% de contratos que chegam a 95%+ sem perguntas ao humano.
Target: 20-30% (se for >50%, o checklist esta frouxo demais)
        (se for <10%, o sistema de defaults precisa melhorar)
```

**Numero medio de perguntas por contrato:**
```
Media de perguntas feitas ao humano por contrato.
Target: 3-7 perguntas para contrato simples
        8-15 para contrato complexo
        (se >15, o sistema esta perguntando demais)
        (se <3, provavelmente esta perdendo gaps)
```

**Taxa de aceitacao de defaults:**
```
% de defaults que o humano aceita sem modificar.
Target: 85-95%
        (se >95%, os defaults sao bons — considerar automatizar)
        (se <70%, os defaults precisam ser recalibrados)
```

**Incidentes evitados:**
```
Contratos que passaram por gap detection vs incidentes em producao.
Comparar com: contratos criados antes do protocolo vs depois.
Target: reducao de 80%+ em incidentes por gaps.
```

### 11.2 Metricas de Experiencia

**Tempo de refinamento:**
```
Tempo entre "primeira intencao" e "contrato selado."
Target: <5 minutos para contrato simples
        <15 minutos para contrato complexo
        (se >30 minutos, o processo esta travado — provavelmente
         muitos bloqueadores ou perguntas confusas)
```

**Taxa de falsos positivos:**
```
% de perguntas que o humano responde com variacao de "isso e obvio."
Target: <10%
Medir por: respostas como "sim", "obvio", "claro", "ja disse" sem
           adicionar informacao nova.
```

**Net Promoter do Protocolo:**
```
"As perguntas do sistema ajudaram ou atrapalharam?"
Medir por: survey apos selagem do contrato.
Target: 80%+ dizendo "ajudou."
```

**Taxa de abandono:**
```
% de sessoes de refinamento que o humano abandona antes do selo.
Target: <5%
Se >10%: o processo esta cansativo ou as perguntas sao irritantes.
```

### 11.3 Metricas de Qualidade do LLM

**Precisao de gaps LLM vs deterministico:**
```
% de gaps encontrados pelo LLM que foram aceitos pelo humano.
Target: 70%+ (LLM vai ter mais falsos positivos que regras)
```

**Gaps unicos do LLM:**
```
% de gaps encontrados SOMENTE pelo LLM (que regras nao pegariam).
Target: 10-20% do total de gaps por contrato.
Se <5%: o LLM nao esta agregando valor, avaliar custo/beneficio.
Se >30%: o checklist deterministico precisa ser expandido.
```

**Consistencia do LLM:**
```
Mesmo contrato enviado 3x produz os mesmos gaps?
Target: 80%+ de overlap entre as 3 execucoes.
Se <60%: temperatura do LLM esta alta demais ou prompt precisa de ajuste.
```

### 11.4 Dashboard de Metricas

```
+-- Metricas do Protocolo (ultimos 30 dias) ------------------+
|                                                               |
|  Contratos analisados ......... 142                           |
|  Tempo medio de refinamento ... 4m12s                         |
|  Score medio primeira iteracao  72%                           |
|  Score medio final ............ 97%                           |
|                                                               |
|  Perguntas ao humano                                          |
|  Total ........................ 847                            |
|  Media por contrato ........... 5.9                           |
|  Aceitas sem mudanca .......... 91%                           |
|  Falsos positivos ............. 7%                            |
|                                                               |
|  Defaults                                                     |
|  Aplicados .................... 423                            |
|  Aceitos ...................... 89%                            |
|  Modificados .................. 8%                             |
|  Rejeitados ................... 3%                             |
|                                                               |
|  Qualidade                                                    |
|  Incidentes em producao ....... 3                             |
|  Incidentes que passaram gap .. 1 (33%)                       |
|  Gap perdido adicionado ....... sim (atualizado no checklist) |
|                                                               |
|  LLM                                                          |
|  Chamadas ..................... 128 (90% dos contratos)        |
|  Gaps unicos do LLM ........... 18% do total                  |
|  Precisao LLM ................. 74%                           |
|  Custo total tokens ........... $12.40                        |
|                                                               |
+---------------------------------------------------------------+
```

---

## 12. Evolucao: Gap Detection que Aprende

O protocolo de interrogacao nao e estatico. Ele evolui com cada contrato analisado, cada resposta humana, e cada incidente em producao.

### 12.1 Feedback Loop de Producao

Quando um contrato selado falha em producao, o sistema executa um post-mortem automatico:

```
INCIDENTE DETECTADO:
  Contrato: webhook-stripe-payment v1.2
  Tipo: comportamento inesperado
  Descricao: webhook de reembolso parcial causou status inconsistente

ANALISE AUTOMATICA:
  1. Buscar no gap report original: este cenario foi verificado?
     Resultado: NAO. Reembolso parcial nao estava no checklist.

  2. Classificar o gap que faltou:
     Tipo: edge case de negocio
     Categoria: estado de entidade nao previsto
     Trigger: webhook com tipo "charge.refunded" e amount < original

  3. Gerar nova regra de checklist:
     ChecklistItem(
       chave="reembolso_parcial",
       descricao="Tratamento de reembolso parcial",
       verificar=lambda c: verifica_fluxo_reembolso_parcial(c),
       bloqueador=True,
       peso=2.0,
       pergunta_sugerida="O que acontece com um reembolso parcial?
         O status do pedido muda? Para qual?",
       aplicavel_a=["webhook_inbound"]  # quando sender = gateway de pagamento
     )

  4. Adicionar ao prompt do LLM:
     "Gap historico: reembolsos parciais frequentemente nao sao tratados.
      Se o contrato envolve pagamentos, verificar explicitamente:
      reembolso total, reembolso parcial, reembolso apos X dias."

  5. Recalibrar score:
     Peso de gaps de "edge case de negocio em pagamentos" sobe de 1.5x para 2.0x
```

### 12.2 Feedback Loop de Respostas Humanas

Cada resposta do humano alimenta o sistema:

**Quando o humano aceita um default:**
```
default "timeout: 30s" aceito pelo humano.
Dominio: e-commerce. Tipo: webhook.
Contador: 47 vezes aceito, 3 vezes modificado.
Taxa de aceitacao: 94% -> default e bom para este contexto.
Acao: nenhuma. Manter default.
```

**Quando o humano rejeita um default consistentemente:**
```
default "rate_limit: 100/min" rejeitado pelo humano.
Dominio: webhook. Ajustado para: 1000/min.
Contador: 2 vezes aceito, 8 vezes modificado para >= 500/min.
Taxa de aceitacao: 20% -> default esta errado para webhooks.
Acao: atualizar default de rate_limit para webhooks de 100/min para 1000/min.
```

**Quando o humano marca uma pergunta como inutill:**
```
Pergunta: "O campo nome pode conter emojis?"
Resposta do humano: "irrelevante" / resposta curta irritada.
Contador: 12 vezes marcada como irrelevante.
Acao: mover de checklist para "LLM only" — so perguntar se o LLM
      identificar contexto onde emojis importam (ex: banco de dados
      com charset limitado).
```

### 12.3 Feedback Loop entre Contratos

Contratos do mesmo dominio informam uns aos outros:

```
Contexto: dominio "e-commerce" tem 23 contratos.

Padrao detectado:
  - 20 de 23 contratos usam a entidade "pedido"
  - 18 de 23 tem tratamento de "estoque"
  - 15 de 23 integram com "gateway de pagamento"

Quando um novo contrato de e-commerce e criado:
  "Baseado nos seus outros contratos, este contrato provavelmente
   vai interagir com: pedidos, estoque, pagamentos.
   Confirma? Alguma dessas entidades esta envolvida?"

Padrao de gaps recorrentes:
  - 5 de 23 contratos tiveram gap de "concorrencia em estoque"
  - Agora, todo contrato de e-commerce que menciona estoque recebe
    automaticamente a pergunta sobre concorrencia como BLOQUEADOR
    (nao mais como WARNING).
```

### 12.4 Metricas de Evolucao

```
+-- Evolucao do Protocolo (historico) -------------------------+
|                                                               |
|  Versao do checklist .......... v3.7 (147 regras)             |
|  Regras originais ............. 89                            |
|  Regras adicionadas por incidente .. 31                       |
|  Regras adicionadas por feedback ... 27                       |
|  Regras removidas (falso positivo) . 12                       |
|                                                               |
|  Taxa de incidentes por gap nao-detectado:                    |
|  v1.0 (marco 2026) ........... 18% dos contratos              |
|  v2.0 (junho 2026) ........... 9% dos contratos               |
|  v3.0 (setembro 2026) ........ 4% dos contratos               |
|  v3.7 (marco 2027) ........... 1.2% dos contratos             |
|                                                               |
|  Defaults recalibrados ........ 34 vezes                      |
|  Perguntas promovidas a bloqueador . 8                        |
|  Perguntas rebaixadas a info ....... 15                       |
|                                                               |
|  Confianca do protocolo:                                      |
|  "Contratos que passam pelo protocolo tem 98.8% de chance     |
|   de nao causar incidente por gap nao-detectado."             |
|                                                               |
+---------------------------------------------------------------+
```

### 12.5 Guardrails da Evolucao

O sistema que aprende precisa de limites para nao degradar:

**Regra 1: Nunca remover regra de seguranca automaticamente.**
Se uma regra de seguranca gera falsos positivos, ela e desativada para revisao humana — nao removida. Um administrador deve aprovar a remocao.

**Regra 2: Novas regras de incidente entram como WARNING por 30 dias.**
Uma regra gerada automaticamente por incidente nao vira BLOQUEADOR imediatamente. Ela entra como WARNING, e monitorada, e so e promovida se nao gerar falsos positivos excessivos.

**Regra 3: Taxa de falsos positivos tem teto.**
Se o protocolo inteiro exceder 15% de falsos positivos, o sistema congela evolucao automatica e alerta o administrador. Perguntas demais irritam o humano e prejudicam adocao.

**Regra 4: Rollback de regras e possivel.**
Se uma regra nova causa problemas, ela pode ser desativada com um unico comando:
```
$ siml checklist disable regra_xyz --motivo "falso positivo em 80% dos casos"
```

**Regra 5: O humano tem a palavra final.**
O protocolo sugere, pergunta, alerta. Mas nunca impede. Se o humano disser "aceito o risco, selar com score de 82%", o sistema sela — registrando a decisao e o risco aceito no audit trail.

---

## Sintese

O protocolo de interrogacao e o que separa o SIML de toda outra abordagem de geracao de codigo ou automacao por IA. Enquanto outros sistemas assumem que o humano disse tudo que precisava dizer, o SIML parte do principio oposto: o humano quase certamente esqueceu algo.

O protocolo nao e um formulario. Nao e um wizard. E um revisor automatico que pensa como o engenheiro mais paranoico da equipe — aquele que sempre pergunta "mas e se..." — combinado com a disciplina de nunca deixar uma ambiguidade passar.

A formula e simples:

```
Checklist deterministico (rapido, previsivel)
  + LLM heuristico (criativo, contextual)
  + Analise adversarial (destrutiva, exaustiva)
  + Defaults inteligentes (pratico, adaptativo)
  + Feedback de producao (evolutivo, calibrado)
  = Contrato que sobrevive ao mundo real.
```

O custo de implementar isso e modesto: um checklist por tipo de contrato, um prompt bem calibrado, e um loop de feedback. O custo de NAO implementar e repetir os mesmos bugs que a industria de software repete ha 50 anos — bugs que existem nao por falta de competencia, mas por falta de alguem que perguntasse "e se?" no momento certo.

O protocolo de interrogacao e esse "alguem."
