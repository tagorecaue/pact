# Regras de Negócio Auto-Executáveis com SIML

> Análise pragmática de como contratos semânticos poderiam substituir a camada frágil entre intenção de negócio e implementação técnica de regras.

---

## 1. O Problema Atual das Regras de Negócio

### Onde as regras vivem hoje

Em qualquer empresa de médio porte, as regras de negócio estão fragmentadas em pelo menos cinco lugares distintos:

**No código-fonte.** Um `if` dentro de um serviço de cálculo de frete que ninguém lembra quem escreveu. A lógica de desconto enterrada em três camadas de herança. A validação de CPF duplicada em quatro microsserviços diferentes, cada uma com comportamento sutilmente diferente.

**No banco de dados.** Triggers que aplicam regras fiscais. Stored procedures que calculam comissões. Views materializadas que definem o que conta como "cliente ativo". Quando alguém pergunta "qual é a regra?", a resposta começa com "depende de qual tabela você está olhando".

**Em arquivos de configuração.** Feature flags que habilitam regras por região. JSONs de parametrização que definem alçadas de aprovação. Planilhas CSV importadas mensalmente com faixas de preço. Cada formato diferente, cada um com seu próprio mecanismo de leitura.

**Na cabeça das pessoas.** O analista de negócio que sabe que "cliente premium nunca paga frete acima de R$ 25, exceto para entregas internacionais, mas aí tem aquele acordo especial com o fornecedor Y". Conhecimento que existe como tradição oral corporativa.

**Em documentação desatualizada.** Wikis que descrevem o processo de 2019. Diagramas BPMN que refletem o fluxo ideal, não o real. PDFs de políticas internas que ninguém consulta porque "mudou depois disso".

### O custo real de mudança

Quando uma regra de negócio muda, o custo não é proporcional à complexidade da mudança. É proporcional à dispersão.

Considere uma mudança simples: "a partir de março, o desconto máximo para revendedores passa de 30% para 25%". Em tese, uma alteração de um número. Na prática:

1. **Descoberta** (2-5 dias): encontrar todos os pontos onde o valor 30% está referenciado. Nem sempre é literal -- pode ser `0.3`, pode ser uma constante `MAX_RESELLER_DISCOUNT`, pode ser um registro em tabela `parametros_comerciais`.
2. **Análise de impacto** (3-7 dias): entender o que quebra. O sistema de simulação de propostas usa esse valor? O relatório gerencial calcula margem baseado nele? O motor de regras de crédito considera esse desconto na análise de risco?
3. **Implementação** (1-3 dias): a mudança técnica em si -- geralmente a parte mais rápida.
4. **Teste** (3-10 dias): validar que a mudança não introduziu regressões. Como as regras estão espalhadas, os testes precisam cobrir cenários que cruzam domínios.
5. **Deploy coordenado** (1-2 dias): se há múltiplos serviços, a mudança precisa ser sincronizada.

Total: 10 a 27 dias para mudar um número. O custo não está na mudança. Está na arqueologia.

### Falhas reais por regras desatualizadas

**Caso clássico: regra fiscal não atualizada.** Uma empresa de e-commerce opera com alíquota de ICMS desatualizada por três meses porque a tabela estava em um CSV que alimentava o módulo fiscal. A atualização dependia de um processo manual que o responsável esqueceu de executar após mudar de equipe. Resultado: R$ 800 mil em diferenças tributárias identificadas em auditoria.

**Caso recorrente: política de crédito defasada.** Um banco mantinha a regra de score mínimo para aprovação de crédito em três sistemas diferentes (originação web, app mobile, mesa de operações). A atualização do score mínimo de 580 para 620 foi aplicada em dois dos três sistemas. Durante quatro meses, a mesa de operações aprovou clientes com score entre 580 e 619 que os outros canais rejeitavam. A inadimplência dessa faixa foi 3x maior que a média.

**Caso estrutural: regra de negócio como conhecimento tácito.** Uma seguradora descobriu, após a saída de um analista sênior, que a regra de precificação para seguros rurais em determinada região tinha um ajuste empírico que existia apenas na cabeça dele -- um multiplicador baseado em padrões climáticos que ele acompanhava informalmente. A fórmula no sistema era tecnicamente correta, mas incompleta. Levou seis meses para perceber que os sinistros naquela região estavam sistematicamente acima do esperado.

Esses não são casos extremos. São o dia a dia de empresas que operam com regras distribuídas entre código, configuração e pessoas.

---

## 2. Simulação: Pricing Dinâmico

### O cenário

Uma empresa de e-commerce de suprimentos industriais opera com 47 mil SKUs, 12 categorias de cliente, 3 regiões de entrega e contratos específicos com 200 contas-chave. O pricing hoje é uma combinação de:

- Tabela base atualizada mensalmente
- Regras de desconto por volume codificadas em stored procedure
- Exceções por cliente em planilha gerenciada pelo time comercial
- Margem mínima definida pela diretoria financeira, verificada manualmente em pedidos acima de R$ 50 mil
- Monitoramento informal de preço de concorrentes via scraping manual

### Declaração de intenção pelo gestor

O diretor comercial diz, em linguagem natural:

> "Quero que o sistema precifique automaticamente com margem mínima de 15% sobre o custo atualizado. Desconto progressivo por volume: 5% a partir de 100 unidades, 10% a partir de 500, 15% a partir de 1000. Nunca vender abaixo do preço do concorrente X no marketplace deles. Para contas-chave, a margem pode cair até 10%, mas precisa de aprovação do gerente regional se cair abaixo de 12%."

### Contrato semântico SIML gerado

```siml
@contrato "pricing-dinamico-v1"
@dominio  comercial.precificacao
@autor    tradutor:claude-opus@4
@origem   intencao:diretor-comercial:2026-03-10

intencao {
  objetivo: "precificação automática com margens protegidas e competitividade"
  premissa: custo.atualizado DISPONIVEL
  premissa: concorrente.preco("marketplace-x") DISPONIVEL | TOLERANCIA(24h)
  invariante: margem.bruta >= 0.15 PARA cliente.tipo != "conta-chave"
  invariante: margem.bruta >= 0.10 PARA cliente.tipo == "conta-chave"
}

regra desconto_volume {
  tipo: progressivo
  faixas: [
    { minimo: 100,  desconto: 0.05 },
    { minimo: 500,  desconto: 0.10 },
    { minimo: 1000, desconto: 0.15 }
  ]
  aplicacao: sobre preco_base APOS margem.validada
  restricao: resultado >= concorrente.preco("marketplace-x")
}

regra piso_competitivo {
  referencia: concorrente.preco("marketplace-x")
  comportamento: SE preco_calculado < referencia ENTAO preco_calculado = referencia
  cache: referencia VALIDA POR 24h
  fallback: SE referencia INDISPONIVEL ENTAO usar ultima_referencia_valida
  alerta: SE ultima_referencia_valida.idade > 72h ENTAO notificar("comercial")
}

regra conta_chave {
  condicao: cliente.tipo == "conta-chave"
  margem_minima: 0.10
  aprovacao_necessaria {
    condicao: margem.bruta < 0.12
    aprovador: gerente.regional(cliente.regiao)
    timeout: 4h
    fallback: aplicar margem 0.12
  }
}

validacao {
  pos_calculo: margem.bruta ENTRE invariante.minimo E 1.0
  pos_calculo: preco_final > 0
  pos_calculo: preco_final >= concorrente.preco OU justificativa.registrada
  auditoria: CADA calculo GERA evidencia {
    entrada: [sku, cliente, quantidade, custo, preco_concorrente]
    saida: [preco_final, margem_efetiva, desconto_aplicado, regras_ativadas]
  }
}
```

### Execução em tempo real

O executor (modelo compacto fine-tunado) recebe uma requisição de precificação:

```
sku: "ROLAMENTO-6205-2RS"
cliente: "METALURGICA-SILVA" (conta-chave, regiao: sudeste)
quantidade: 750
custo_atualizado: R$ 12,40
preco_concorrente_x: R$ 18,90
```

O executor interpreta o contrato e executa a cadeia de regras:

1. Calcula preço base com margem mínima de conta-chave: `12,40 / (1 - 0.10) = R$ 13,78`
2. Aplica desconto por volume (faixa 500+): desconto de 10% sobre preço base
3. Verifica piso competitivo: preço calculado vs. R$ 18,90
4. Calcula margem efetiva resultante
5. Se margem cai abaixo de 12%, dispara fluxo de aprovação

O ponto crítico: o executor não tem essa lógica hardcoded. Ele interpreta o contrato semântico a cada requisição. Se amanhã o diretor comercial disser "agora a margem mínima para conta-chave é 8%", o tradutor gera um novo contrato, o executor passa a usar o novo contrato. Nenhum deploy. Nenhuma stored procedure alterada.

### Validação determinística

Cada cálculo produz um registro de evidência que é verificado pelo validador:

```
evidencia:
  contrato: "pricing-dinamico-v1"
  timestamp: 2026-03-12T14:32:01Z
  invariantes_verificados:
    - margem.bruta(0.138) >= 0.10 [conta-chave] ✓
    - preco_final(19.20) >= concorrente(18.90) ✓
    - preco_final > 0 ✓
  regras_ativadas:
    - desconto_volume.faixa_500
    - conta_chave.margem_flexivel
    - piso_competitivo.acima
  aprovacao_pendente: NAO (margem 13.8% > 12%)
```

Se qualquer invariante falha, a transação é bloqueada antes de se concretizar. Não é um relatório posterior -- é uma barreira pré-execução.

---

## 3. Simulação: Compliance Bancário (KYC/AML)

### O cenário

Um banco de médio porte precisa aplicar regras de Prevenção à Lavagem de Dinheiro e Financiamento ao Terrorismo (PLD/FT) conforme Circular 3.978/2020 do BACEN, atualizada periodicamente por novas circulares e cartas-circulares. O time de compliance tem 8 pessoas. O volume de transações é de 2 milhões por dia.

O problema central: quando o BACEN publica uma nova circular alterando critérios de comunicação ao COAF, o banco tem tipicamente 90 dias para se adequar. Hoje, isso significa:

1. Jurídico interpreta a circular
2. Compliance traduz em regras operacionais
3. TI implementa as regras no sistema de monitoramento
4. Homologação testa cenários
5. Deploy em produção

Esse ciclo leva de 45 a 80 dias. Com SIML, a proposta é que o passo 3 desapareça.

### Separação entre intenção regulatória e implementação

A circular do BACEN é uma intenção regulatória. Ela diz o que precisa acontecer, não como o sistema deve implementar. Hoje, alguém traduz essa intenção em código. Com SIML, alguém traduz essa intenção em linguagem natural estruturada, e o tradutor gera o contrato.

### Contrato semântico para análise de transação suspeita

O analista de compliance declara:

> "Transação de pessoa física acima de R$ 50 mil em espécie, ou múltiplas transações do mesmo CPF que somem mais de R$ 50 mil em 24 horas, devem ser sinalizadas para análise. Se o cliente tem menos de 6 meses de relacionamento, o limiar cai para R$ 30 mil. Transferências internacionais para países da lista GAFI de alto risco devem ser sempre sinalizadas, independente do valor."

```siml
@contrato "pld-ft-monitoramento-v3"
@dominio  compliance.pld_ft
@base_legal BACEN.Circular.3978.2020 + BACEN.CartaCircular.4001.2024
@classificacao CONFIDENCIAL
@revisao_obrigatoria 90d

intencao {
  objetivo: "identificar transações que requerem comunicação ao COAF"
  contexto: regulatorio.pld_ft
  consequencia_falha: "sanção regulatória, multa, risco reputacional"
  prioridade: CRITICA
}

entidade transacao {
  campos_obrigatorios: [valor, tipo, moeda, origem, destino, timestamp]
  campos_enriquecidos: [cliente.tempo_relacionamento, cliente.perfil_risco,
                         destino.pais.classificacao_gafi]
}

regra especie_individual {
  condicao: transacao.tipo == "especie"
            E transacao.titular.tipo == "PF"
            E transacao.valor >= LIMIAR
  parametro LIMIAR {
    padrao: 50000
    excecao: SE cliente.tempo_relacionamento < 6m ENTAO 30000
  }
  acao: sinalizar(nivel: "analise", motivo: "especie-acima-limiar")
}

regra fracionamento {
  janela: 24h
  agrupamento: transacao.titular.cpf
  condicao: SOMA(transacao.valor) >= LIMIAR
            E transacao.tipo == "especie"
  parametro LIMIAR {
    padrao: 50000
    excecao: SE cliente.tempo_relacionamento < 6m ENTAO 30000
  }
  acao: sinalizar(nivel: "analise", motivo: "possivel-fracionamento")
  nota: "verificar se transações individuais ficaram abaixo de R$10k (structuring)"
}

regra pais_alto_risco {
  condicao: transacao.destino.pais IN lista_gafi.alto_risco
            E transacao.tipo == "transferencia_internacional"
  acao: sinalizar(nivel: "analise", motivo: "pais-alto-risco-gafi")
  independe_de: valor
}

validacao {
  cobertura: TODA transacao DEVE SER avaliada contra TODAS regras ativas
  latencia_maxima: 500ms POR transacao
  falso_negativo: INACEITAVEL (preferir falso positivo)
  auditoria: CADA sinalizacao GERA evidencia {
    transacao_id, regras_ativadas, dados_utilizados, timestamp_analise
  }
  retencao_evidencia: 10 ANOS (requisito legal)
}
```

### Atualização de regra: reeditar intenção, não reescrever código

Quando o BACEN publica uma nova carta-circular reduzindo o limiar de comunicação de R$ 50 mil para R$ 30 mil para todas as transações em espécie (não apenas clientes novos), a atualização no mundo SIML seria:

1. O analista de compliance reedita a intenção: "O limiar agora é R$ 30 mil para todos os clientes, independente do tempo de relacionamento"
2. O tradutor gera um novo contrato onde o bloco `parametro LIMIAR` muda:

```siml
  parametro LIMIAR {
    padrao: 30000
    -- excecao por tempo de relacionamento removida conforme
    -- BACEN.CartaCircular.4015.2026
  }
```

3. O validador verifica que o novo contrato é mais restritivo que o anterior (aceita tudo que o anterior aceitava e mais)
4. O executor passa a usar o novo contrato

Não houve PR. Não houve code review de lógica Java. Não houve deploy de microsserviço. A mudança foi semântica, e o sistema trata mudanças semânticas nativamente.

A diferença fundamental: no modelo atual, a mudança de um número em uma circular se transforma em um projeto de TI. No modelo SIML, se transforma em uma reedição de intenção com validação automática de consistência.

---

## 4. Simulação: Workflow de Aprovação Empresarial

### O cenário

Uma indústria de médio porte tem um processo de compras com as seguintes regras:

- Compras até R$ 5 mil: aprovação do gestor direto
- Compras de R$ 5 mil a R$ 50 mil: gestor direto + diretor da área
- Compras acima de R$ 50 mil: gestor + diretor + CFO
- Compras de TI acima de R$ 20 mil: adicionar aprovação do CTO
- Compras emergenciais: qualquer diretor pode aprovar sozinho, mas precisa justificativa registrada
- Se o aprovador não responder em 48h: escalar para o superior
- Fornecedores novos: adicionar aprovação de compliance

Hoje, esse fluxo está implementado em uma combinação de BPMN no Camunda, regras de alçada em tabela de banco, e exceções tratadas por e-mail informal.

### Contrato semântico capturando o processo inteiro

```siml
@contrato "workflow-compras-v2"
@dominio  operacoes.compras
@vigencia 2026-01-01 ATE revogacao

intencao {
  objetivo: "garantir que toda compra seja aprovada conforme alçadas definidas"
  principio: "segregação de funções: solicitante nunca aprova sua própria compra"
  principio: "rastreabilidade: toda decisão tem registro e justificativa"
}

entidade solicitacao_compra {
  campos: [valor, categoria, fornecedor, urgencia, justificativa, solicitante]
  derivados: [
    fornecedor.novo = fornecedor.cadastro_data > HOJE - 90d,
    ti_relevante = categoria IN ["hardware", "software", "infraestrutura", "SaaS"]
  ]
}

fluxo aprovacao {

  etapa aprovacao_gestor {
    obrigatorio: SEMPRE
    aprovador: solicitante.gestor_direto
    restricao: aprovador != solicitante
    timeout: 48h
    timeout_acao: escalar(aprovador.superior)
  }

  etapa aprovacao_diretor {
    obrigatorio: SE valor > 5000
    aprovador: solicitante.diretor_area
    timeout: 48h
    timeout_acao: escalar(CFO)
  }

  etapa aprovacao_cfo {
    obrigatorio: SE valor > 50000
    aprovador: papel("CFO")
    timeout: 48h
    timeout_acao: notificar(CEO) + manter_pendente
  }

  etapa aprovacao_cto {
    obrigatorio: SE ti_relevante E valor > 20000
    aprovador: papel("CTO")
    paralelo_com: aprovacao_diretor
    timeout: 48h
    timeout_acao: escalar(CEO)
  }

  etapa aprovacao_compliance {
    obrigatorio: SE fornecedor.novo
    aprovador: papel("analista-compliance")
    paralelo_com: aprovacao_gestor
    timeout: 72h
    timeout_acao: notificar(diretor_compliance) + manter_pendente
  }

  excecao compra_emergencial {
    condicao: urgencia == "emergencial"
    sobrepoe: fluxo.aprovacao COMPLETO
    aprovador_unico: QUALQUER papel("diretor")
    requer: justificativa.preenchida E justificativa.tamanho >= 50
    pos_aprovacao: notificar(CFO) + registrar_auditoria("aprovacao-emergencial")
  }
}

validacao {
  pre_execucao: solicitante != aprovador EM NENHUMA etapa
  pre_execucao: valor > 0
  pre_execucao: PELO_MENOS_UM aprovador definido para cada etapa obrigatoria
  pos_execucao: TODA etapa obrigatoria TEM decisao (aprovado|rejeitado)
  auditoria: CADA decisao GERA evidencia {
    etapa, aprovador, decisao, timestamp, justificativa_se_rejeitado
  }
}
```

### Auto-execução baseada em contrato

Quando uma solicitação de compra entra no sistema, o executor lê o contrato e monta o fluxo dinamicamente:

```
Entrada:
  valor: R$ 35.000
  categoria: "software"
  fornecedor: TOTVS (cadastrado há 5 anos)
  urgencia: "normal"
  solicitante: Maria (gestora de operações)

Executor interpreta contrato:
  1. valor > 5000 → aprovacao_diretor OBRIGATORIA
  2. valor <= 50000 → aprovacao_cfo NAO necessaria
  3. ti_relevante=true E valor > 20000 → aprovacao_cto OBRIGATORIA
  4. fornecedor.novo=false → aprovacao_compliance NAO necessaria
  5. urgencia != "emergencial" → fluxo normal

Fluxo montado:
  [aprovacao_gestor] → [aprovacao_diretor ∥ aprovacao_cto] → CONCLUIDO
```

O sistema não seguiu um BPMN pré-desenhado. Ele interpretou o contrato e derivou o fluxo correto para aquela solicitação específica. Se amanhã a regra de alçada muda (digamos, o limiar de TI sobe para R$ 30 mil), o contrato é atualizado e o próximo fluxo já reflete a mudança. Sem redesenho de processo, sem redeploy de workflow engine.

A diferença sutil mas importante: em um BPMN tradicional, o fluxo é o código. Em SIML, as regras são o código, e o fluxo é derivado. Isso permite que o mesmo conjunto de regras produza fluxos diferentes para situações diferentes, sem que alguém precise antecipar todos os cenários em tempo de design.

---

## 5. Motor de Regras Semântico vs Drools/BRMS

### O que existe hoje

Engines de regras de negócio (BRMS) como Drools, IBM ODM, FICO Blaze Advisor e até frameworks mais leves como Easy Rules ou json-rules-engine já atacam parte do problema. A comparação honesta é necessária.

### O que Drools faz bem

- **Rete algorithm**: avaliação eficiente de grandes conjuntos de regras contra grandes volumes de fatos. Décadas de otimização.
- **Maturidade**: usado em produção por bancos, seguradoras, telecoms. Falhas conhecidas, workarounds documentados.
- **DRL (Drools Rule Language)**: linguagem declarativa com semântica formal. Não é tão distante do que SIML propõe na camada de execução.
- **Decision tables**: interface que permite ao analista de negócio editar regras em formato de planilha.
- **Integração Java/Spring**: ecossistema robusto, deployment convencional.

### O que SIML propõe que Drools não oferece

| Aspecto | Drools | SIML (proposta) |
|---|---|---|
| **Entrada** | Analista escreve DRL ou preenche decision table | Humano declara intenção em linguagem natural |
| **Tradução** | Manual (humano codifica regras) | Automática (LLM gera contrato semântico) |
| **Ambiguidade** | Regras DRL são precisas, mas desconectadas da intenção original | Contrato mantém intenção e execução acoplados |
| **Mudança** | Editar DRL, testar, deploy | Reeditar intenção, validar contrato, ativar |
| **Rastreabilidade** | Log de execução de regras | Evidência semântica vinculada à intenção |
| **Composição** | Regras em KieBases, composição manual | Contratos se compõem formalmente |
| **Observabilidade** | Debug técnico (qual regra disparou) | "Por que o sistema fez isso?" respondido em linguagem natural |

A vantagem central do SIML não é técnica -- é cognitiva. Drools reduz o problema de "implementar regras" mas mantém o gap entre "o que o negócio quer" e "o que o sistema faz". SIML propõe eliminar esse gap tornando a intenção parte formal do sistema.

### O que Drools oferece que SIML precisaria incorporar

**Performance comprovada.** O Rete algorithm do Drools avalia milhares de regras contra milhões de fatos com latência previsível. Um executor SIML baseado em LLM (mesmo compacto) teria latência variável e throughput inferior. Para cenários de alto volume (2 milhões de transações/dia no caso bancário), isso é proibitivo sem otimizações significativas.

**Determinismo estrito.** Drools, dado o mesmo conjunto de regras e fatos, sempre produz o mesmo resultado. Um modelo de linguagem, por natureza, tem componente estocástico. SIML precisaria de mecanismos que garantam determinismo na camada de execução -- possivelmente compilando o contrato semântico para regras determinísticas antes da execução em tempo real.

**Ferramental de teste.** Drools tem frameworks de teste maduros (JUnit integrado, cenários de teste, test coverage de regras). SIML precisaria desenvolver equivalentes.

**Governança de regras.** Versioning, aprovação de mudanças, rollback, ambientes (dev/staging/prod). Décadas de lições aprendidas que SIML não deveria ignorar.

### Proposta de arquitetura híbrida

A abordagem pragmática não é substituir Drools por SIML, mas usar SIML como camada acima:

```
HUMANO → intenção natural
          ↓
     [TRADUTOR SIML]
          ↓
     contrato semântico SIML
          ↓
     [COMPILADOR]  ← aqui está a ponte
          ↓
     ┌─────────────────────────┐
     │ regras Drools (DRL)     │  ← alto volume, determinístico
     │ OU                      │
     │ executor LLM compacto   │  ← baixo volume, flexível
     └─────────────────────────┘
          ↓
     [VALIDADOR SIML]
          ↓
     evidência semântica
```

O compilador é o componente-chave. Ele analisa o contrato semântico e decide:

- **Regras estáticas de alto volume** (como as de PLD/FT que avaliam milhões de transações): compilar para DRL e executar no Drools.
- **Regras dinâmicas de baixo volume** (como aprovação de compras com exceções contextuais): executar diretamente no modelo compacto.
- **Regras mistas**: parte compilada, parte interpretada.

Isso permite que SIML herde a performance e o determinismo do Drools sem abrir mão da flexibilidade semântica. O Drools se torna um backend de execução, não a interface de definição.

---

## 6. Roadmap Incremental

### MVP: qual caso de uso atacar primeiro

O caso de uso ideal para o MVP tem estas características:

- Volume baixo de execuções (dezenas por dia, não milhões)
- Regras que mudam com frequência (justifica o investimento)
- Consequência de erro tolerável (não regulatório no início)
- Stakeholder não-técnico que sente a dor (garante engajamento)

**Recomendação: workflow de aprovação empresarial** (caso da seção 4).

Motivos:
1. Volume naturalmente baixo (dezenas de solicitações por dia)
2. Regras mudam a cada reestruturação organizacional (frequente)
3. Erro = uma aprovação que deveria ter mais uma etapa (corrigível)
4. O gestor de compras sente a dor toda vez que o fluxo não reflete a política atual
5. Já existe sistema manual/semi-manual para comparação (baseline claro)

**Não** começar por pricing dinâmico (volume alto, erro = perda financeira) nem por compliance bancário (regulatório, consequência severa).

### Como validar que funciona

**Fase 1 -- Shadow mode (4 semanas)**
- Implementar o tradutor para gerar contratos a partir de intenções do gestor de compras
- Implementar o executor para derivar fluxos de aprovação
- Rodar em paralelo com o sistema atual -- o SIML sugere o fluxo, mas o sistema real decide
- Medir: em quantos casos o fluxo SIML coincide com o fluxo real?
- Meta: 95% de concordância

**Fase 2 -- Execução assistida (4 semanas)**
- O SIML define o fluxo, mas um humano confirma antes de cada solicitação ser roteada
- Medir: quantas vezes o humano corrige o SIML? Por quê?
- Meta: <5% de correções

**Fase 3 -- Execução autônoma (ongoing)**
- O SIML define e executa o fluxo diretamente
- Validador verifica cada execução
- Alertas para anomalias
- Meta: 0 erros de segregação de função, <2% de escalações indevidas

### Métricas de sucesso

| Métrica | Baseline (sem SIML) | Meta com SIML |
|---|---|---|
| Tempo para implementar mudança de regra | 10-27 dias | < 1 dia |
| Regras desatualizadas em produção | Desconhecido (ruim) | 0 (toda regra tem versão e vigência) |
| % de fluxos corretos na primeira tentativa | ~85% | > 98% |
| Custo de TI por mudança de regra de negócio | 40-120h de desenvolvimento | 2-4h de validação |
| Tempo de onboarding para nova regra | Dias (entender código) | Horas (ler intenção) |

### Riscos de over-engineering

**Risco 1: Resolver um problema que não existe.** Se as regras de negócio da empresa mudam uma vez por ano, o custo de implementar SIML nunca se paga. O caso de uso precisa ter frequência de mudança suficiente para justificar a infraestrutura.

**Risco 2: O tradutor não é bom o suficiente.** Se o LLM gera contratos semânticos que frequentemente não refletem a intenção do gestor, o humano gasta mais tempo corrigindo o contrato do que gastaria escrevendo a regra diretamente. Validação do tradutor é pré-requisito, não feature.

**Risco 3: Complexidade acidental na linguagem.** Se SIML se torna tão complexa que exige especialistas para ler contratos, recriamos o problema que pretendíamos resolver -- apenas com uma sintaxe diferente. A linguagem precisa permanecer densa para máquinas mas inspecionável por humanos através da camada de observabilidade.

**Risco 4: Confiança prematura.** O maior perigo é o gestor acreditar que "o sistema entende" antes que o sistema realmente entenda. A fase de shadow mode existe exatamente para calibrar essa confiança com dados, não com fé.

**Risco 5: Ignorar o ecossistema existente.** Empresas já têm Drools, Camunda, regras em stored procedures. SIML precisa ser uma camada acima, não uma substituição total. Reescrever tudo em SIML é o caminho mais rápido para fracasso organizacional.

A regra de ouro: SIML só vale a pena onde o custo de manter regras no modelo atual é consistentemente maior que o custo de operar a infraestrutura SIML. Começar pequeno, medir obsessivamente, expandir apenas com evidência.

---

*Análise produzida como parte do projeto SIML -- Semantic Intent Markup Language.*
