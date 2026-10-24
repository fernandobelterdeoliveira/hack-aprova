# Arquitetura híbrida de decisão e inteligência de casos

## Princípio de segurança

O caso continua sendo a fonte oficial de verdade. Providers de IA interpretam,
classificam, investigam e criam `ProposedCaseChange`; eles não possuem uma
ferramenta capaz de alterar diretamente `CaseState`, fatos, eventos, tarefas ou
prazos.

```text
Entrada bruta imutável
        ↓
Associação híbrida e explicável
        ↓
Decision Router (determinístico / Jev / OpenAI)
        ↓
Case Intelligence, somente quando necessário
        ↓
ProposedCaseChange com evidência
        ↓
Policy Engine em código
        ↓
Revisão humana
        ↓
Aplicação transacional e idempotente no caso
```

O `AI_AUTO_APPLY_ENABLED` permanece `false` por padrão. Mesmo sugestões de
baixo risco ficam pendentes de revisão nesta iteração.

## Camadas implementadas

### Associação híbrida

O associador anterior foi preservado e ampliado. O score soma contribuições
visíveis de número do caso, e-mail, telefone, nome, relacionamento anterior,
contexto e similaridade semântica. Identificadores fortes têm peso superior ao
embedding. O resultado usa os estados `AUTO_SUGGEST`, `NEEDS_REVIEW`,
`AMBIGUOUS` e `NO_MATCH`, com thresholds configuráveis.

`AUTO_SUGGEST` significa apenas que a interface pode sugerir o caso com alta
confiança; não aplica nenhuma mudança oficial automaticamente.

### Providers de decisão

- `DeterministicDecisionProvider`: sempre disponível e usado como fallback.
- `JevDecisionProvider`: adaptador real para `POST /v1/systemone`, com perguntas
  tipadas `choice`, `score` e `noul`.
- `MockJevDecisionProvider`: valida localmente o contrato quando não há chave;
  não faz chamada externa e não deve ser confundido com integração validada.
- `OpenAIDecisionProvider`: usa a Responses API com Structured Outputs.

Cada execução cria um `AIExecution` com provider, modelo, versões, hashes,
latência, uso de tokens, status e erro. Não é armazenado raciocínio interno.

### Embeddings

A interface `EmbeddingProvider` oferece um fallback local determinístico de 128
dimensões e um adaptador OpenAI para `text-embedding-3-small`. Uma falha externa
não interrompe a ingestão: o sistema volta ao embedding local e mantém os sinais
de identidade.

Nesta iteração os vetores ficam em JSONB. `pgvector` não foi ativado porque a
extensão instalada no PostgreSQL deste ambiente não pôde ser confirmada e o
Prisma exige SQL/migration específicos para o tipo `vector`. Para volume alto, o
próximo passo é validar `CREATE EXTENSION vector`, criar coluna
`Unsupported("vector")`/migration SQL e índice HNSW ou IVFFlat.

### Case Intelligence Agent

O antigo conceito de agente criativo foi substituído por um agente orientado a
evidência. Ele usa a Responses API e recebe apenas ferramentas de leitura e de
proposta. Não existem ferramentas de `update_case`, exclusão, envio de mensagem,
aceitação de acordo ou execução de ação jurídica.

Sem configuração OpenAI, um fallback determinístico limitado detecta linguagem
de conflito/correção e solicita revisão. Isso não equivale ao agente externo
completo.

### Policy Engine

As políticas estão em TypeScript, fora dos prompts:

- baixo: elegível a auto-apply apenas se explicitamente habilitado;
- médio: revisão de equipe;
- alto: revisão obrigatória de advogado;
- crítico: somente fluxo manual;
- sem fonte/tipo/trecho: bloqueado.

A política é avaliada ao criar a proposta e novamente dentro da transação de
aprovação. Isso evita aplicar uma proposta alterada ou desatualizada.

## Configuração

Consulte `frontend/.env.example`. Nenhum modelo OpenAI de raciocínio é assumido
por padrão; ele precisa ser escolhido explicitamente em
`OPENAI_DECISION_MODEL` e `OPENAI_CASE_INTELLIGENCE_MODEL`.

Jev permanece opcional. A documentação oficial consultada em 2026-10-01 expõe
`https://api.typesafe.ai/v1/systemone`, mas a chamada real não foi validada neste
ambiente por falta de `JEV_API_KEY`.

## Banco e migration

Migration: `20261001010000_hybrid_ai_pipeline`.

Ela adiciona metadados de roteamento e risco a `InboxItem`, proveniência e
versões a `ProposedCaseChange`, e cria `AIExecution` e `EmbeddingRecord`.
Antes do deploy, o diff banco→schema foi revisado. Seis migrations antigas já
presentes fisicamente no banco foram reconciliadas no ledger do Prisma; somente
a migration híbrida executou DDL novo.

## Benchmark

`POST /api/ai/benchmark` recebe amostras anonimizadas rotuladas e compara os
providers disponíveis. A resposta calcula acurácia de associação e classificação,
falsos positivos/negativos, override humano, calibração, p50/p95 e custo por mil.
Custos ficam nulos até que uma tabela de preços versionada seja configurada.

## Limitações conhecidas

- Jev real não foi chamado sem credencial; somente adaptador e mock foram testados.
- OpenAI real não foi chamado sem credencial/modelo; fallback foi testado.
- OCR/STT e coordenadas de layout continuam dependendo do extrator Python atual.
- Vetores em JSONB são adequados ao protótipo, não a busca vetorial em grande escala.
- Identidade autenticada e perfis de permissão de revisores ainda precisam ser integrados.

