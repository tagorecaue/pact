# Navegador Semântico: SIML como Protocolo para a Web Pós-Visual

> *"A web foi construída para olhos humanos. E se ela fosse construída para intenções humanas?"*

---

## 1. A Web Atual vs Web Semântica

### A web visual-first

A web como conhecemos é uma máquina de renderização visual. HTML descreve estrutura para olhos. CSS descreve aparência para olhos. JavaScript manipula interações para olhos. Toda a stack existe para produzir pixels em uma tela que um humano vai interpretar.

Quando você quer comprar uma passagem aérea, o site te mostra uma grade de voos. Seus olhos escaneiam preços, horários, conexões. Seu cérebro compara. Sua mão clica. Todo esse processo é otimizado para a cognição visual humana — e é extraordinariamente ineficiente quando o que você quer é simplesmente "o voo mais barato para São Paulo na sexta".

```
WEB ATUAL: Ciclo de Interação

  HUMANO                          SITE
    │                               │
    │  "quero voo barato pra SP"    │
    │                               │
    │  ──── olhos escaneiam ────►   │  renderiza 47 opções visuais
    │                               │
    │  ◄─── cérebro compara ─────   │  nenhuma ajuda semântica
    │                               │
    │  ──── mão clica ──────────►   │  recebe 1 clique genérico
    │                               │
    │  ◄─── nova tela ──────────    │  renderiza formulário
    │                               │
    │       (repita 12 vezes)       │
    │                               │
    ▼                               ▼
  COMPRA FEITA (15 minutos depois)
```

A intenção era uma frase. A execução exigiu 15 minutos de tradução manual entre intenção e interface.

### O fracasso parcial da Web Semântica

Tim Berners-Lee propôs a Semantic Web no início dos anos 2000. A visão era elegante: dados na web estruturados com significado formal. RDF para representar relações. OWL para ontologias. SPARQL para consultas.

Por que não pegou?

**1. Custo de produção absurdo.** Para cada página HTML que um desenvolvedor criava em minutos, a versão RDF exigia horas de modelagem ontológica. O incentivo econômico era zero — ninguém pagava mais por um site com RDF.

**2. Complexidade acadêmica.** OWL Full é indecidível. SPARQL é poderoso mas incompreensível para 99% dos desenvolvedores. A stack era projetada por lógicos para lógicos.

**3. Sem consumidor visível.** Não havia um "navegador semântico" que tornasse a experiência do usuário final melhor. Sem demanda do consumidor, sem incentivo do produtor. Ciclo vicioso.

**4. Vocabulários fragmentados.** Cada domínio criava suas ontologias. Interoperabilidade — a promessa central — exigia mapeamento manual entre vocabulários.

Schema.org sobreviveu como exceção parcial: Google incentivou adoção porque melhora SEO. Mas schema.org é metadata para motores de busca, não um protocolo de interação.

### O que mudou com LLMs

Duas coisas fundamentais mudaram:

**1. O custo de produção caiu para quase zero.** Um LLM pode gerar contratos semânticos a partir de documentação existente, APIs, ou até da própria interface visual do site. O produtor não precisa modelar ontologias manualmente — a IA faz isso.

**2. Surgiu o consumidor.** Agentes de IA são consumidores nativos de estrutura semântica. Eles não precisam de pixels. Precisam de contratos. A demanda que não existia em 2005 agora existe estruturalmente.

```
2005: Semantic Web                    2026: SIML / Web Semântica

  Produtor: humano modela RDF          Produtor: IA gera contrato SIML
  (caro, lento, sem incentivo)         (barato, rápido, incentivo direto)

  Consumidor: ???                      Consumidor: agente IA + humano
  (não existia)                        (demanda real e crescente)

  Vocabulário: acadêmico, rígido       Vocabulário: emergente, adaptável
  (OWL, indecidível)                   (semântica contextual, verificável)
```

### A oportunidade

A oportunidade é clara: sites que publicam contratos semânticos SIML ao lado do HTML visual. O humano continua vendo a página bonita. O agente semântico lê o contrato e interage diretamente com a intenção.

Não é substituição. É uma camada adicional — como JSON APIs surgiram ao lado de páginas HTML sem eliminá-las.

---

## 2. Simulação: Site Semântico de E-commerce

### O cenário

Imagine a loja "TechBR" — um e-commerce de eletrônicos. Hoje ela tem:
- Um site HTML bonito com fotos, reviews, carrosséis
- Uma API REST interna que alimenta o front-end
- Talvez um schema.org básico para SEO

Com SIML, ela adicionaria uma terceira camada:

```
techbr.com.br
├── /                          ← HTML visual (humanos)
├── /api/v2/                   ← REST API (desenvolvedores)
└── /.well-known/siml/         ← Contratos semânticos (agentes)
    ├── manifest.siml          ← catálogo de capacidades
    ├── contracts/
    │   ├── buscar-produto.siml
    │   ├── consultar-preco.siml
    │   ├── calcular-frete.siml
    │   ├── realizar-compra.siml
    │   └── acompanhar-pedido.siml
    └── schema/
        ├── produto.siml
        ├── pagamento.siml
        └── entrega.siml
```

### O contrato semântico de busca

O contrato `buscar-produto.siml` não seria uma documentação de API. Seria uma declaração de capacidade com semântica formal:

```
contrato buscar-produto {
  intencao: "Encontrar produtos que atendam critérios do comprador"

  entrada {
    criterios: lista<criterio> {
      cada criterio {
        atributo:  referencia(schema/produto, campo)
        operador:  enum(igual, menor, maior, contem, entre)
        valor:     dinamico(tipo_do_atributo)
      }
    }
    ordenacao?:  enum(preco_asc, preco_desc, relevancia, avaliacao)
    limite?:     inteiro(1..100, padrao: 20)
  }

  saida {
    produtos: lista<produto> com {
      garantia: campos_presentes(nome, preco, disponibilidade)
      garantia: preco_atualizado(max_defasagem: 5min)
    }
  }

  restricoes {
    autenticacao: nenhuma
    limite_taxa:  100/minuto
    custo:        gratuito
  }

  evidencia {
    cada_resultado: rastreavel(origem: catalogo_interno, timestamp)
  }
}
```

### A interação semântica

O humano diz ao navegador semântico:

> "Quero o notebook mais barato com pelo menos 16GB de RAM e entrega até sexta-feira."

O navegador semântico:

```
PASSO 1: Decompõe a intenção
┌─────────────────────────────────────────────────┐
│  Intenção decomposta:                           │
│  ├── buscar: notebook, RAM >= 16GB              │
│  ├── ordenar: preço ascendente                  │
│  ├── filtrar: entrega <= sexta-feira (2026-03-13)│
│  └── selecionar: primeiro resultado             │
└─────────────────────────────────────────────────┘

PASSO 2: Mapeia para contratos disponíveis
┌─────────────────────────────────────────────────┐
│  Plano de execução:                             │
│  1. buscar-produto(                             │
│       criterios: [                              │
│         {categoria = "notebook"},               │
│         {ram >= 16}                             │
│       ],                                        │
│       ordenacao: preco_asc                      │
│     )                                           │
│  2. Para cada resultado:                        │
│     calcular-frete(                             │
│       destino: localizacao_usuario,             │
│       urgencia: entrega_ate("2026-03-13")       │
│     )                                           │
│  3. Filtrar: apenas com entrega viável          │
│  4. Retornar: primeiro resultado                │
└─────────────────────────────────────────────────┘

PASSO 3: Executa e apresenta
┌─────────────────────────────────────────────────┐
│  Resultado:                                     │
│  Notebook XYZ — R$ 3.299,00                     │
│  16GB RAM, 512GB SSD                            │
│  Entrega: quinta-feira (2026-03-12)             │
│  Frete: R$ 29,90 (expresso)                     │
│                                                 │
│  Evidência:                                     │
│  - Preço verificado às 14:32 (defasagem: 0min)  │
│  - 7 notebooks atendiam RAM >= 16GB             │
│  - 3 tinham entrega até sexta                   │
│  - Este é o mais barato dos 3                   │
│                                                 │
│  [Comprar] [Ver alternativas] [Modificar busca] │
└─────────────────────────────────────────────────┘
```

### Chatbot vs Navegador Semântico

A diferença é fundamental:

| Aspecto | Chatbot | Navegador Semântico |
|---------|---------|---------------------|
| Modelo de interação | Reativo (responde perguntas) | Proativo (executa intenções) |
| Conhecimento do site | Treinado/hardcoded | Descobre contratos dinamicamente |
| Composição | Limitada ao site único | Cross-site nativo |
| Verificabilidade | "Confie em mim" | Evidência auditável por contrato |
| Atualização | Retreino necessário | Lê contratos em tempo real |
| Controle do usuário | Conversa livre (imprevisível) | Plano de execução explícito |

O chatbot é um ser humano simulado conversando sobre o site. O navegador semântico é um executor que entende o que o site oferece e compõe ações para satisfazer a intenção do usuário.

---

## 3. Simulação: Composição de Serviços Cross-Site

### O cenário

O usuário diz:

> "Preciso ir para São Paulo na sexta, voltar domingo. Voo + hotel + carro alugado. Melhor custo-benefício, mas hotel tem que ser perto da Faria Lima."

### Descoberta de contratos

O navegador semântico consulta um índice de contratos (análogo a um motor de busca, mas para capacidades semânticas):

```
DESCOBERTA DE CONTRATOS

  Domínio: viagem-aerea
  ├── gol.com.br/siml         → buscar-voo, reservar-voo
  ├── latam.com.br/siml       → buscar-voo, reservar-voo
  └── azul.com.br/siml        → buscar-voo, reservar-voo

  Domínio: hospedagem
  ├── hotel-x.com.br/siml     → buscar-quarto, reservar-quarto
  ├── hotel-y.com.br/siml     → buscar-quarto, reservar-quarto
  └── airbnb.com.br/siml      → buscar-acomodacao, reservar

  Domínio: aluguel-veiculo
  ├── localiza.com.br/siml    → buscar-veiculo, alugar-veiculo
  └── movida.com.br/siml      → buscar-veiculo, alugar-veiculo
```

### Composição do plano

O navegador gera um plano de execução composto:

```
PLANO DE EXECUÇÃO COMPOSTO
══════════════════════════

  Fase 1: Coleta paralela (sem compromisso)
  ┌─────────────────────────────────────────────┐
  │                                             │
  │   ┌──────────┐  ┌──────────┐  ┌──────────┐ │
  │   │   GOL    │  │  LATAM   │  │   AZUL   │ │
  │   │buscar-voo│  │buscar-voo│  │buscar-voo│ │
  │   │ SP ↔ ida │  │ SP ↔ ida │  │ SP ↔ ida │ │
  │   │ sex/dom  │  │ sex/dom  │  │ sex/dom  │ │
  │   └────┬─────┘  └────┬─────┘  └────┬─────┘ │
  │        │              │              │       │
  │        └──────────┐   │   ┌──────────┘       │
  │                   ▼   ▼   ▼                  │
  │              ┌──────────────┐                 │
  │              │  COMPARADOR  │                 │
  │              │ custo-benefic│                 │
  │              └──────┬───────┘                 │
  │                     │                         │
  │   ┌──────────┐  ┌──┴───────┐  ┌──────────┐  │
  │   │ HOTEL X  │  │ HOTEL Y  │  │  AIRBNB  │  │
  │   │buscar-qt │  │buscar-qt │  │buscar-ac │  │
  │   │Faria Lima│  │Faria Lima│  │Faria Lima│  │
  │   │ sex→dom  │  │ sex→dom  │  │ sex→dom  │  │
  │   └────┬─────┘  └────┬─────┘  └────┬─────┘  │
  │        └──────────┐   │   ┌──────────┘       │
  │                   ▼   ▼   ▼                  │
  │              ┌──────────────┐                 │
  │              │  COMPARADOR  │                 │
  │              │ dist+preco   │                 │
  │              └──────┬───────┘                 │
  │                     │                         │
  │   ┌────────────┐  ┌┴───────────┐             │
  │   │  LOCALIZA  │  │   MOVIDA   │             │
  │   │buscar-veic │  │buscar-veic │             │
  │   │ SP sex→dom │  │ SP sex→dom │             │
  │   └─────┬──────┘  └─────┬──────┘             │
  │         └────────┐ ┌────┘                    │
  │                  ▼ ▼                          │
  │             ┌──────────┐                      │
  │             │COMPARADOR│                      │
  │             └────┬─────┘                      │
  │                  │                             │
  └──────────────────┼─────────────────────────── ┘
                     ▼
  Fase 2: Otimização combinada
  ┌─────────────────────────────────────────────┐
  │  Combinar melhor voo + hotel + carro        │
  │  Otimizar custo total, não individual       │
  │  Considerar horários (voo chega → check-in) │
  │  Considerar localização (aeroporto → hotel) │
  └──────────────────┬──────────────────────────┘
                     │
                     ▼
  Fase 3: Apresentação com evidência
  ┌─────────────────────────────────────────────┐
  │  PROPOSTA OTIMIZADA                         │
  │                                             │
  │  Voo: LATAM 3412, sex 07:00 → 08:10        │
  │       LATAM 3487, dom 20:30 → 21:40        │
  │       R$ 890,00 (ida e volta)               │
  │                                             │
  │  Hotel: Hotel Y — 400m da Faria Lima        │
  │         Quarto standard, sex-dom            │
  │         R$ 340,00 (2 diárias)               │
  │                                             │
  │  Carro: Localiza — Compacto                 │
  │         Retirada: aeroporto sex 08:30       │
  │         Devolução: aeroporto dom 19:00      │
  │         R$ 210,00 (2 diárias)               │
  │                                             │
  │  TOTAL: R$ 1.440,00                         │
  │                                             │
  │  Evidência:                                 │
  │  - 14 combinações analisadas                │
  │  - 2a melhor opção: R$ 1.520 (GOL+HotelX)  │
  │  - Hotel Y: 4.2/5 (823 avaliações)         │
  │  - Todos os preços verificados às 14:45     │
  │                                             │
  │  [Reservar tudo] [Ajustar] [Ver detalhes]   │
  └─────────────────────────────────────────────┘
```

### Fase 4: Execução com confirmação humana

O humano aprova. O navegador executa:

```
EXECUÇÃO SEQUENCIAL COM EVIDÊNCIA
                                              Status
  1. reservar-voo(LATAM, 3412+3487)          ✓ Confirmado: LOC ABC123
  2. reservar-quarto(HotelY, sex-dom)        ✓ Confirmado: RES 78901
  3. alugar-veiculo(Localiza, sex-dom)       ✓ Confirmado: CTR 45678
                                              │
  Evidência consolidada:                      │
  ├── 3 confirmações independentes            │
  ├── Total cobrado: R$ 1.440,00              │
  ├── Todos os comprovantes armazenados       │
  └── Rollback disponível até 24h antes       │
```

### Agregador vs Composição Semântica Aberta

| Aspecto | Agregador (Booking, Kayak) | Composição Semântica |
|---------|---------------------------|---------------------|
| Cobertura | Apenas parceiros integrados | Qualquer site com contrato SIML |
| Modelo de negócio | Comissão (viés de recomendação) | Neutro (otimiza para o usuário) |
| Cross-domínio | Limitado (voo OU hotel) | Nativo (voo + hotel + carro + ...) |
| Atualização | Integração por integração | Lê contratos em tempo real |
| Transparência | "Melhor preço" (confia ou não) | Evidência completa de decisão |
| Lock-in | Plataforma do agregador | Protocolo aberto |

O agregador é um intermediário que monetiza informação assimétrica. A composição semântica elimina a assimetria.

---

## 4. Simulação: Governo Digital Semântico

### O cenário

O cidadão diz:

> "Preciso abrir uma empresa de tecnologia em São Paulo."

Hoje, isso significa semanas navegando sites diferentes, cada um com seus formulários, exigências, prazos, e nenhuma coordenação entre eles.

### Descoberta e composição

O navegador semântico descobre os contratos de serviços públicos:

```
DESCOBERTA DE SERVIÇOS PÚBLICOS
════════════════════════════════

  gov.br/siml/
  ├── receita-federal/
  │   ├── consultar-cnpj.siml
  │   ├── registrar-empresa.siml        ← CNPJ
  │   └── optar-simples-nacional.siml
  │
  ├── junta-comercial-sp/
  │   ├── consultar-viabilidade.siml
  │   ├── registrar-contrato-social.siml  ← NIRE
  │   └── emitir-certidao.siml
  │
  ├── sefaz-sp/
  │   ├── inscrever-estadual.siml        ← IE
  │   └── solicitar-nfe.siml
  │
  ├── prefeitura-sp/
  │   ├── inscrever-municipal.siml       ← CCM
  │   └── solicitar-alvara.siml
  │
  └── previdencia/
      └── registrar-empregador.siml
```

### O fluxo composto

```
FLUXO: ABERTURA DE EMPRESA DE TECNOLOGIA EM SÃO PAULO
══════════════════════════════════════════════════════

  Entrada do cidadão:
  ├── Tipo: empresa de tecnologia
  ├── Local: São Paulo - SP
  ├── Sócios: [dados pessoais]
  ├── Capital social: R$ 50.000
  └── Regime tributário desejado: Simples Nacional

     │
     ▼
  ┌──────────────────────────────────────────┐
  │ 1. JUNTA COMERCIAL — Viabilidade         │
  │    Contrato: consultar-viabilidade       │
  │    Entrada: nome empresarial, CNAE, local│
  │    Saída: aprovação ou sugestão de nome  │
  │    Prazo estimado: 2-5 dias              │
  │    Evidência: protocolo + despacho       │
  └────────────────────┬─────────────────────┘
                       │ aprovado
                       ▼
  ┌──────────────────────────────────────────┐
  │ 2. JUNTA COMERCIAL — Contrato Social     │
  │    Contrato: registrar-contrato-social   │
  │    Entrada: viabilidade + contrato social│
  │    Saída: NIRE                           │
  │    Prazo estimado: 3-7 dias              │
  │    Evidência: NIRE + certidão digital    │
  │                                          │
  │    ⚠ REQUER ASSINATURA DIGITAL          │
  │    → Navegador solicita ao cidadão       │
  └────────────────────┬─────────────────────┘
                       │ NIRE obtido
                       ▼
  ┌──────────────────────────────────────────┐
  │ 3. RECEITA FEDERAL — CNPJ               │
  │    Contrato: registrar-empresa           │
  │    Entrada: NIRE + dados societários     │
  │    Saída: CNPJ                           │
  │    Prazo estimado: 1-3 dias              │
  │    Evidência: comprovante de inscrição   │
  └──────────┬───────────────────────────────┘
             │ CNPJ obtido
             │
     ┌───────┴───────┐
     │               │
     ▼               ▼
  ┌──────────┐  ┌──────────────┐
  │ 4a.SEFAZ │  │ 4b. PREF-SP  │  ← execução paralela
  │ IE       │  │ CCM          │
  │ 1-5 dias │  │ 3-10 dias    │
  └────┬─────┘  └──────┬───────┘
       │               │
       └───────┬───────┘
               │ ambos obtidos
               ▼
  ┌──────────────────────────────────────────┐
  │ 5. RECEITA FEDERAL — Simples Nacional    │
  │    Contrato: optar-simples-nacional      │
  │    Entrada: CNPJ + IE + CCM             │
  │    Saída: deferimento ou indeferimento   │
  │    Prazo: imediato (se tudo regular)     │
  │    Evidência: termo de opção             │
  └────────────────────┬─────────────────────┘
                       │
                       ▼
  ┌──────────────────────────────────────────┐
  │ 6. PREFEITURA-SP — Alvará               │
  │    Contrato: solicitar-alvara            │
  │    Entrada: CNPJ + CCM + endereço        │
  │    Saída: alvará de funcionamento        │
  │    Prazo: 5-15 dias                      │
  │    Evidência: alvará digital             │
  └────────────────────┬─────────────────────┘
                       │
                       ▼
  ┌──────────────────────────────────────────┐
  │           EMPRESA ABERTA                 │
  │                                          │
  │  CNPJ: 12.345.678/0001-90               │
  │  NIRE: 35.123.456.789                   │
  │  IE: 123.456.789.000                    │
  │  CCM: 1.234.567-8                       │
  │  Simples Nacional: Deferido             │
  │  Alvará: Concedido                      │
  │                                          │
  │  Tempo total: 18 dias                   │
  │  (vs ~45 dias no processo manual)       │
  │                                          │
  │  Evidências: 6 protocolos rastreáveis   │
  │  Cada etapa com timestamp e hash        │
  └──────────────────────────────────────────┘
```

### O que muda

**Hoje:** O cidadão é o orquestrador. Ele precisa saber a ordem, os pré-requisitos, os documentos de cada etapa. Ele descobre erroneamente que faltou um passo quando é rejeitado no passo seguinte.

**Com SIML:** O navegador semântico é o orquestrador. Ele lê os contratos de cada órgão, entende dependências, identifica paralelismos possíveis, e executa com evidência em cada etapa. O cidadão autoriza. O cidadão não precisa ser especialista em burocracia.

O impacto social é enorme. Quem mais sofre com burocracia complexa é quem tem menos acesso a contadores e despachantes. Um navegador semântico democratiza o acesso à máquina pública.

---

## 5. Protocolo SIML para a Web

### Sinalização HTTP

Um site que suporta SIML sinalizaria via HTTP header e meta tag:

```
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
X-SIML-Contracts: /.well-known/siml/manifest.siml
X-SIML-Version: 1.0
```

```html
<head>
  <meta name="siml-manifest" content="/.well-known/siml/manifest.siml">
  <meta name="siml-version" content="1.0">
  <link rel="siml-contracts" href="/.well-known/siml/manifest.siml">
</head>
```

### Analogias com padrões existentes

```
EVOLUÇÃO DOS PROTOCOLOS DE DESCOBERTA NA WEB

  1994  robots.txt       "O que crawlers podem acessar"
  2005  sitemap.xml      "Quais páginas existem"
  2011  schema.org       "O que os dados significam" (metadata)
  20XX  siml/manifest    "O que este site sabe fazer" (capacidades)
```

A progressão é natural: de permissão, para mapa, para significado, para capacidade.

### Estrutura do manifesto

```
/.well-known/siml/
├── manifest.siml              ← ponto de entrada
│   {
│     identidade: "techbr.com.br"
│     versao_siml: "1.0"
│     dominio: "e-commerce/eletronicos"
│     contratos: [
│       { ref: "contracts/buscar-produto.siml", tipo: "consulta" },
│       { ref: "contracts/realizar-compra.siml", tipo: "transacao" },
│       ...
│     ]
│     autenticacao: {
│       metodos: ["oauth2", "api-key"]
│       registro: "https://techbr.com.br/developer"
│     }
│     limites: {
│       consultas: "1000/hora"
│       transacoes: "100/hora"
│     }
│   }
│
├── contracts/                 ← contratos individuais
│   ├── buscar-produto.siml
│   ├── consultar-preco.siml
│   └── realizar-compra.siml
│
└── schema/                    ← tipos de dados
    ├── produto.siml
    └── pagamento.siml
```

### Versionamento e backward compatibility

O versionamento precisa ser semântico e pragmático:

```
VERSIONAMENTO DE CONTRATOS

  contrato buscar-produto {
    versao: "2.1.0"
    compativel_com: ["2.0.x", "1.x (parcial)"]
    deprecado_em: "1.0.x"
    fim_de_vida: "1.0.x a partir de 2027-01-01"

    // Campos adicionados em 2.1:
    // + filtro_por_avaliacao (opcional)
    // Nenhum campo removido desde 2.0
  }
```

Regras:
- **Patch** (2.1.0 → 2.1.1): correções que não mudam semântica
- **Minor** (2.1.x → 2.2.0): campos opcionais adicionados, nenhum removido
- **Major** (2.x → 3.0): mudanças que quebram compatibilidade

O navegador semântico negocia a versão automaticamente, preferindo a mais recente que ambos suportam.

### Segurança

A segurança é o desafio mais crítico. Contratos maliciosos poderiam:

1. **Roubar dados:** contrato que exige informações desnecessárias
2. **Executar ações indesejadas:** contrato que faz compra sem confirmação clara
3. **Mentir sobre capacidades:** contrato que promete entrega mas não cumpre

Mitigações necessárias:

```
MODELO DE SEGURANÇA

  Camada 1: CLASSIFICAÇÃO DE RISCO
  ┌─────────────────────────────────────────────┐
  │  Consulta (buscar, listar)     → risco baixo │
  │  Ação reversível (favoritar)   → risco médio │
  │  Transação (comprar, reservar) → risco alto  │
  │  Delegação (agir em meu nome)  → risco máximo│
  └─────────────────────────────────────────────┘

  Camada 2: CONFIRMAÇÃO PROPORCIONAL
  ┌─────────────────────────────────────────────┐
  │  Risco baixo  → execução automática          │
  │  Risco médio  → notificação                  │
  │  Risco alto   → confirmação explícita         │
  │  Risco máximo → autenticação + confirmação    │
  └─────────────────────────────────────────────┘

  Camada 3: AUDITORIA
  ┌─────────────────────────────────────────────┐
  │  Toda execução gera evidência               │
  │  Evidência é imutável e verificável         │
  │  O usuário pode revisar qualquer ação       │
  │  Rollback quando possível                   │
  └─────────────────────────────────────────────┘

  Camada 4: REPUTAÇÃO
  ┌─────────────────────────────────────────────┐
  │  Contratos assinados criptograficamente     │
  │  Histórico de cumprimento público           │
  │  Score de confiança por domínio             │
  │  Blacklist comunitária de contratos nocivos │
  └─────────────────────────────────────────────┘
```

---

## 6. Análise de Viabilidade e Adoção

### Por que HTML/HTTP venceu

HTML venceu porque era ridiculamente simples. Qualquer pessoa com um editor de texto podia criar uma página. Qualquer navegador podia renderizá-la. O ciclo de feedback era instantâneo: salva, recarrega, vê.

SIML não pode ignorar essa lição. Complexidade mata adoção.

### Adoção incremental

A estratégia correta é coexistência, não substituição:

```
EVOLUÇÃO INCREMENTAL

  Estágio 0 (hoje):
    Site HTML + API REST privada

  Estágio 1 (adoção inicial):
    Site HTML + API REST + manifest.siml básico
    (apenas contratos de consulta, somente leitura)

  Estágio 2 (adoção intermediária):
    + Contratos transacionais
    + Autenticação via protocolo padrão
    + Evidência básica

  Estágio 3 (adoção avançada):
    + Composição cross-site
    + Vocabulário compartilhado do domínio
    + Evidência completa com auditoria

  Estágio 4 (maturidade):
    + Sites SIML-first (interface visual gerada a partir de contratos)
    + Navegador semântico como modo primário de interação
```

### O paralelo com JSON APIs

A história das JSON APIs é instrutiva:

```
TIMELINE PARALELA

  Páginas HTML (1995)
    │
    │  Sites serviam apenas HTML
    │
  AJAX + JSON APIs (2005)
    │
    │  Sites passaram a ter duas interfaces:
    │  HTML para humanos, JSON para programas
    │  Mesmos dados, formatos diferentes
    │
  API-first (2012)
    │
    │  Alguns serviços nasceram API-first
    │  (Stripe, Twilio, SendGrid)
    │  Interface visual é wrapper da API
    │
  ═══════════════════════════════════
  Agora projete para SIML:
  ═══════════════════════════════════
    │
  HTML + SIML (2027-2029?)
    │
    │  Sites servem HTML + contratos semânticos
    │  Como schema.org, mas para capacidades
    │
  SIML-aware (2029-2032?)
    │
    │  Navegadores semânticos consomem contratos
    │  Composição cross-site começa a funcionar
    │
  SIML-first (2032-2035?)
    │
    │  Novos serviços nascem contract-first
    │  Interface visual é gerada dos contratos
```

### Estratégia de adoção: começar pelo nicho de alto valor

Não tentar ferver o oceano. Começar onde a dor é maior e o valor mais claro:

**Tier 1 — Governo digital (2-3 anos)**
- Dor extrema: burocracia, processos multi-órgão
- Incentivo político: modernização do Estado
- Benefício social visível (argumento para financiamento)
- Poucos players, decisão centralizada

**Tier 2 — Saúde (3-5 anos)**
- Interoperabilidade entre hospitais, planos, laboratórios
- Regulação forte que exige auditoria (SIML tem evidência nativa)
- Padrões existentes (HL7/FHIR) como ponte

**Tier 3 — E-commerce e viagens (5-7 anos)**
- Volume alto, muitos players
- Efeito de rede: quanto mais sites, mais valioso o navegador
- Monetização clara (economia de tempo do consumidor)

**Tier 4 — Web geral (7-10 anos)**
- Adoção orgânica conforme ferramentas amadurecem
- Frameworks que geram contratos SIML automaticamente
- Navegadores mainstream integram suporte

### Timeline realista

Honestamente: **7-10 anos para adoção significativa, se tudo correr bem.**

Razões para otimismo:
- LLMs tornam produção e consumo de contratos barato
- Agentes de IA são consumidores naturais
- A dor de interfaces visuais para tarefas complexas é real e crescente

Razões para cautela:
- Efeito de rede exige massa crítica
- Padrões levam anos para estabilizar
- Incumbentes (Google, Amazon) podem cooptar ou ignorar
- Ninguém previu corretamente o timing de nenhuma revolução tecnológica

---

## 7. Riscos e Contrapontos

### Centralização vs descentralização

**Risco:** Um navegador semântico dominante (o "Google dos contratos") vira gatekeeper. Ele decide quais contratos são descobertos, quais são priorizados, quais são confiáveis.

**Contraponto:** O protocolo precisa ser aberto e descentralizado desde o início. Contratos vivem nos sites, não em um repositório central. A descoberta pode ser federada, como email (não como redes sociais).

**Mitigação concreta:** O manifesto SIML vive no domínio do site (/.well-known/siml/). Indexadores podem existir múltiplos, concorrentes. O formato é aberto, sem licença restritiva.

### Privacidade e consentimento

**Risco:** O navegador semântico, para compor serviços cross-site, precisa compartilhar dados do usuário entre sites. "Reservar voo + hotel" exige que o hotel saiba quando você chega — informação que veio da companhia aérea.

**Contraponto:** O modelo deve ser explícito sobre fluxo de dados:

```
FLUXO DE DADOS COM CONSENTIMENTO

  USUÁRIO                    NAVEGADOR                 SITES
    │                           │                        │
    │  "voo + hotel SP"         │                        │
    │ ─────────────────────►    │                        │
    │                           │                        │
    │                           │  buscar-voo            │
    │                           │ ──────────────────►    │ GOL
    │                           │  ◄─ opções             │
    │                           │                        │
    │  ⚠ CONSENTIMENTO:        │                        │
    │  "Compartilhar horário    │                        │
    │   do voo com Hotel Y     │                        │
    │   para otimizar check-in?"│                        │
    │                           │                        │
    │  [Sim] [Não] [Detalhes]   │                        │
    │ ─── Sim ─────────────►    │                        │
    │                           │  buscar-quarto         │
    │                           │  (com: chegada 08:10)  │
    │                           │ ──────────────────►    │ HOTEL
    │                           │                        │
```

O navegador é fiduciário do usuário, não dos sites. Dados fluem apenas com consentimento explícito e granular.

### Quem controla o vocabulário semântico?

**Risco:** Se um vocabulário domina (como schema.org domina metadata), quem o controla tem poder desproporcional. Google controla schema.org de fato.

**Contraponto:** SIML pode ter vocabulários emergentes e concorrentes:

- **Vocabulários de domínio:** Cada setor (saúde, governo, e-commerce) mantém o seu, por consórcio do setor
- **Mapeamento por IA:** Ao contrário de 2005, um LLM pode mapear entre vocabulários diferentes automaticamente. "preço" e "valor_unitario" e "price" podem ser reconhecidos como semanticamente equivalentes
- **Governança aberta:** Modelo similar ao W3C, mas com participação de produtores e consumidores reais

A grande diferença do passado: vocabulários não precisam ser idênticos para interoperar. LLMs são tradutores universais de semântica. Isso muda fundamentalmente o problema de padronização.

### Risco de walled gardens semânticos

**Risco:** Grandes plataformas (Amazon, Google, Apple) criam seus próprios "protocolos semânticos" proprietários. Contratos funcionam dentro do ecossistema mas são incompatíveis com o exterior. A web aberta é substituída por jardins murados semânticos.

```
CENÁRIO DE FRAGMENTAÇÃO

  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
  │   AMAZON     │  │   GOOGLE     │  │   APPLE      │
  │  SEMANTIC    │  │  SEMANTIC    │  │  SEMANTIC    │
  │  PROTOCOL    │  │  PROTOCOL    │  │  PROTOCOL    │
  │              │  │              │  │              │
  │  Sites       │  │  Sites       │  │  Sites       │
  │  Amazon-only │  │  Google-only │  │  Apple-only  │
  │              │  │              │  │              │
  │  ✗ fechado   │  │  ✗ fechado   │  │  ✗ fechado   │
  └──────────────┘  └──────────────┘  └──────────────┘

       vs

  ┌────────────────────────────────────────────────┐
  │              SIML ABERTO                       │
  │                                                │
  │  Qualquer site publica                         │
  │  Qualquer navegador consome                    │
  │  Vocabulários federados                        │
  │                                                │
  │  ✓ aberto                                      │
  └────────────────────────────────────────────────┘
```

**Mitigação:** A história mostra que protocolos abertos vencem quando:
1. Surgem antes dos proprietários se consolidarem
2. Têm massa crítica de adotantes
3. São mais simples que as alternativas proprietárias

Email venceu. HTTP venceu. RSS perdeu para redes sociais. A janela de oportunidade existe, mas é finita.

### Outros riscos concretos

**Manipulação semântica:** Sites poderiam criar contratos que tecnicamente cumprem o que prometem mas manipulam o contexto. "Melhor preço" definido como "melhor preço entre os que pagam comissão para nós." A evidência precisa ser honesta, e mecanismos de auditoria independente são necessários.

**Complexidade acidental:** Se a especificação SIML ficar complexa demais, repete-se o erro da Semantic Web. A regra deve ser: se um LLM não consegue gerar um contrato correto em uma tentativa, o formato é complexo demais.

**Responsabilidade legal:** Se o navegador semântico compõe e executa uma transação que dá errado, quem é responsável? O site que publicou o contrato? O navegador que compôs? O LLM que interpretou? Frameworks legais precisam evoluir junto.

---

## Conclusão

A Web Semântica do início dos anos 2000 tinha a visão certa e o timing errado. Faltavam produtores capazes de gerar estrutura semântica barata e consumidores capazes de utilizá-la.

LLMs mudaram ambos os lados da equação. Produzir contratos semânticos é agora viável economicamente. Consumi-los é o modo nativo de operação de agentes de IA.

SIML como protocolo para a web não é uma utopia — é uma extensão natural do que já está acontecendo. APIs já são a web semântica informal. SIML formaliza isso com contratos verificáveis, evidência auditável, e composição segura.

O navegador semântico não substitui o navegador visual. Ele resolve a classe de problemas que o navegador visual nunca resolveu bem: tarefas multi-passo, cross-site, orientadas por intenção.

A pergunta não é se isso vai acontecer. É quem vai definir o protocolo — e se será aberto ou proprietário.

---

*"A web foi construída para mostrar informação. O próximo passo é construí-la para executar intenção."*
