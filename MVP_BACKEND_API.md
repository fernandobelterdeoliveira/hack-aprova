# MVP Back-end — Hack Aprova

A API reutiliza MunicipalProcess, MunicipalTicket, mensagens, fila MUNICIPAL_TICKET, gerador de formulários e versões já existentes. Não adiciona módulos visuais, agentes independentes, canais ou publicação na Aprova. As três rotas novas são contexto, perguntas e respostas; geração, correção, testes e aprovação continuam no Ticket.

## Executar localmente

Pré-requisitos: Node e dependências do frontend instalados, PostgreSQL e as migrações existentes aplicadas. Use `Start-LexiLoop.ps1` na raiz para iniciar os serviços configurados ou execute, em terminais separados, a aplicação e o worker na pasta `frontend`:

```powershell
npm run dev -- --hostname 127.0.0.1 --port 3001
node --require ./scripts/tsx-windows-shim.cjs --env-file=.env.local --import tsx scripts/ticket-worker.ts
```

O Python existente atende em `PYTHON_BACKEND_URL` (padrão `http://127.0.0.1:8000`). Inicie-o com `python run_backend.py` na raiz. O fluxo de texto também funciona se o Python/IA estiver indisponível, usando regras locais conservadoras e avisos de fallback. O worker e o banco são obrigatórios para concluir operações assíncronas.

A IA generativa usa o `GOOGLE_API_KEY` e o orquestrador Gemini já existentes no Python. Sem essa credencial, perguntas, interpretação dirigida e correções explícitas usam modo local, identificado nos resultados. Não é necessário configurar WhatsApp, e-mail ou publicação externa para demonstrar o MVP.

## Autenticação e integração

Base local: `http://127.0.0.1:3001`. As rotas municipais e do Ticket usam `currentActor`, sessão existente e isolamento por workspace. POSTs exigem origem compatível; mantenha o front-end sob a mesma origem ou use um proxy de desenvolvimento. Não desative a verificação de origem. No browser, use `credentials: "include"`; exemplos de curl devem enviar `Origin: http://127.0.0.1:3001` e `Content-Type: application/json`.

No modo local existente, a identidade é `current-user` no `default-workspace`. Em produção é necessária a autenticação já suportada pelo projeto. Operações exigem papel owner, admin, member, professional ou reviewer; a aprovação final aceita apenas owner, admin, professional ou reviewer. O campo `author` identifica o analista na trilha; não substitui a autorização da sessão.

Use `requestKey: crypto.randomUUID()` por operação. Reenvie a mesma chave e os mesmos dados em um retry. Reutilizar uma chave de resposta com outro conteúdo, autor ou pergunta retorna 409.

## Rotas disponíveis

| Rota | Função |
| --- | --- |
| `GET /api/municipal` | Listar processos e modelos existentes |
| `POST /api/municipal` | Criar processo municipal de demonstração ou implantação |
| `GET /api/municipal/{processId}` | Consultar regras, fontes, cenários e histórico existentes |
| `GET /api/municipal/{processId}/context` | Consultar contexto, informações conhecidas, lacunas, perguntas e formulário atual |
| `POST /api/municipal/{processId}/questions` | Gerar/persistir até cinco perguntas de lacunas e registrá-las no Ticket |
| `GET /api/municipal/{processId}/questions` | Consultar histórico de perguntas e pendências |
| `POST /api/municipal/{processId}/answers` | Registrar resposta atribuída ao analista, com extração e geração assíncronas |
| `GET /api/tickets?process={processId}` | Obter/criar o Ticket do processo pelo mecanismo existente |
| `GET /api/tickets/{ticketId}` | Consultar mensagens, tarefas, formulário atual, versões, diferenças e testes |
| `POST /api/tickets/{ticketId}` | Gerar formulário, receber alterações, testar, aprovar e retomar falhas |
| `GET /api/jobs/{jobId}` | Consultar tarefa existente, quando seu ID for retornado |
| `GET/POST /api/forms/review/{versionId}` | Revisão da prefeitura pelo link/token de acesso já existente |

### Vínculo com Municípios e Caixa de entrada

Os registros preparados têm `Case.municipalProcessId` associado ao processo correspondente. `GET /api/cases` mantém a rota por compatibilidade e inclui `municipalProcess` com prefeitura, secretaria, processo e Ticket. `GET /api/cases/{id}` expõe esse vínculo em `case.municipalProcess`; os fatos, documentos e histórico são consultáveis pelos mecanismos existentes.

`GET /api/inbox` inclui o vínculo em `detectedCase.municipalProcess`. As entradas projetadas do Ticket são identificadas como registros locais, sem confiança de IA inventada nem entrega WhatsApp simulada. Fontes textuais podem ser baixadas em `GET /api/cases/{id}/municipal-evidence?source={sourceId}`, com a mesma autorização e isolamento por workspace.

O worker atualiza registros municipais já vinculados após as operações do Ticket. O estado da aprovação final permanece no Ticket; se a sincronização da visão municipal falhar após a aprovação, a resposta pode conter `warning` e a aprovação continua registrada. A preparação `npm run seed:municipal-cases` também permite refazer essa projeção. Casos sem vínculo municipal não são alterados por esse serviço.

### 1. Criar e selecionar processo

`POST /api/municipal` → 201:

```json
{"municipality":"Prefeitura fictícia de Serra Clara","department":"Desenvolvimento Econômico","name":"Solicitação de Alvará","templateKey":"alvara","owner":"Implantador de demonstração"}
```

Retorna o processo, incluindo `id`, regras iniciais sem confirmação e fontes vazias. Não aproveite o modelo de outra cidade como regra local.

`GET /api/municipal/{processId}/context` → 200, exemplo abreviado:

```json
{
  "process":{"id":"process-id","municipality":"Prefeitura fictícia de Serra Clara","department":"Desenvolvimento Econômico","name":"Solicitação de Alvará","owner":"Implantador de demonstração","version":1},
  "ticketId":null,
  "known":[],
  "missing":[{"category":"documents","ruleVersion":1,"reason":"missing_information","question":"Quais documentos e dados são obrigatórios? Informe também quais são opcionais e para quem são exigidos."}],
  "pendingRuleApprovals":0,
  "sources":[],
  "questions":[],
  "currentForm":null
}
```

A resposta real pode ter seis lacunas: `documents`, `eligibility`, `conditions`, `exceptions`, `deadlines`, `responsibility`. `known` significa informação com fonte e sem conflito, ainda sujeita à revisão profissional; não equivale a regra individualmente aprovada. `pendingRuleApprovals` distingue essas situações.

### 2. Gerar perguntas

`POST /api/municipal/{processId}/questions` com `{}` → 200:

```json
{
  "ticketId":"ticket-id",
  "mode":"local:context-gaps-v1",
  "questions":[{"id":"question-id","category":"documents","text":"Solicitação de Alvará: Quais documentos e dados são obrigatórios? Informe também quais são opcionais e para quem são exigidos.","status":"open","answerMessageId":null,"clarification":null,"createdAt":"2026-10-24T12:00:00.000Z"}],
  "missing":[{"category":"documents","ruleVersion":1,"reason":"missing_information","question":"Quais documentos e dados são obrigatórios? Informe também quais são opcionais e para quem são exigidos."}]
}
```

O endpoint retorna no máximo cinco perguntas abertas, embora `missing` possa ter seis itens. Depois das respostas, chame novamente para as lacunas restantes. Chamadas repetidas reutilizam os registros da mesma categoria/revisão. Informações respondidas com evidência deixam de gerar perguntas. Ambiguidade ou contradição cria necessidade de esclarecimento, sem escolher uma regra arbitrariamente.

`GET .../questions` retorna o histórico, incluindo perguntas `open`, `answered` ou `superseded`. Não use perguntas substituídas para novas respostas. `mode` pode ser `gemini:{modelo}`; `warning`, quando presente, informa fallback. A IA recebe somente o contexto desse processo e as categorias ainda pendentes; a aplicação rejeita categorias extras e duplicadas.

### 3. Registrar respostas

`POST /api/municipal/{processId}/answers` → 202:

```json
{"questionId":"question-id","content":"CPF, comprovante de endereço e, para empresas, CNPJ.","author":"Analista da prefeitura — demonstração","requestKey":"6aaed902-278c-4f4c-b267-28e26f99d57d"}
```

```json
{"messageId":"answer-message-id","ticketId":"ticket-id","questionId":"question-id","queued":true,"deduplicated":false,"operationKey":"hash-da-operacao"}
```

A mensagem preserva o texto original. A fonte registra pergunta e resposta, e a regra mantém o ID dessa fonte e o trecho de evidência. O worker interpreta a categoria perguntada, incorpora a informação e reutiliza o gerador. Cada nova resposta pode produzir um rascunho intermediário com pendências; é esperado. Não aplique as respostas por edição manual de JSON no front-end.

Consulte o Ticket até a mensagem ter `metadata.processed: true`; então atualize o contexto. Um retry já concluído retorna 200 e `deduplicated: true`, sem duplicar a regra ou versão. Uma resposta nova para pergunta respondida/substituída retorna 409. Para outra informação, gere as perguntas atuais ou registre informação pelo Ticket existente.

Exemplos de respostas locais claras às demais categorias:

```json
{
  "eligibility":"Pessoas físicas e jurídicas podem solicitar o serviço.",
  "conditions":"A conferência documental deve ocorrer antes da aprovação.",
  "exceptions":"Não há outras dispensas ou exceções neste processo.",
  "deadlines":"10 dias úteis",
  "responsibility":"A secretaria faz a triagem e o diretor aprova o pedido."
}
```

Esse objeto ilustra conteúdos para respostas individuais, não é um payload de envio em lote. “10 dias” pede esclarecimento sobre úteis/corridos; “talvez”, “depende” ou uma resposta sem requisito reconhecível não se tornam regras definitivas. Uma divergência de regra já aprovada fica pendente de conciliação pela revisão de regras existente (`PATCH /api/municipal/{processId}`, ação `edit-rule` com fonte/trecho), seguida de nova geração.

### 4. Gerar ou consultar formulário

As respostas já disparam geração pelo worker. Para geração explícita, use `POST /api/tickets/{ticketId}` → 202:

```json
{"action":"generate","requestKey":"33965a4f-0a45-408a-881a-e4bb05f5f16c"}
```

```json
{"queued":true,"jobId":"job-id"}
```

`GET /api/tickets/{ticketId}` retorna, entre os demais dados:

```json
{
  "id":"ticket-id",
  "status":"awaiting_municipality",
  "currentVersionId":"version-id",
  "approvedVersionId":null,
  "versions":[{
    "id":"version-id","number":1,"status":"awaiting_municipality","isDraft":true,
    "definition":{
      "schemaVersion":1,"title":"Solicitação de Alvará","description":"Prefeitura fictícia de Serra Clara · Desenvolvimento Econômico",
      "context":{"processId":"process-id","municipality":"Prefeitura fictícia de Serra Clara","department":"Desenvolvimento Econômico","owner":"Implantador de demonstração"},
      "fields":[{"id":"cpf","label":"CPF","type":"cpf","required":false,"help":"","visibleWhen":[{"field":"tipo_pessoa","operator":"equals","value":"fisica"}],"requiredWhen":[{"field":"tipo_pessoa","operator":"equals","value":"fisica"}],"evidence":[{"sourceId":"answer-message-id","excerpt":"Trecho literal da fonte"}]}],
      "sections":[],"warnings":[]
    },
    "blockers":[],"changeSet":[],"testResults":{"manual":null},"generatedBy":"local:evidence-rules-v1"
  }],
  "jobs":[{"id":"job-id","status":"completed","progressMessage":"Concluído","lastError":null}]
}
```

Exemplo abreviado: a definição completa contém também `tipo_pessoa`, CNPJ e demais campos sustentados pelas fontes. Renderize a definição completa retornada pela API. Tipos, condições, documentos e regras ficam estruturados; um resumo textual não substitui `definition`.

Todos os estados diferentes de `approved` retornam `isDraft: true`. `awaiting_municipality` significa versão consistente disponível para análise, ainda não aprovada. `needs_information` contém perguntas em `blockers`; não apresente esse estado como formulário pronto. O link de revisão fica na mensagem `kind: "form"`, em `metadata.reviewUrl`.

### 5. Solicitar correção pelo Ticket

`POST /api/tickets/{ticketId}` → 202:

```json
{"action":"message","versionId":"version-id","decision":"changes","content":"O comprovante de endereço não precisa ser obrigatório para pessoa jurídica","requestKey":"eeaa1e95-86ea-4a19-b7da-d0ec065362b1"}
```

```json
{"messageId":"request-message-id","queued":true}
```

Após o worker, `GET .../tickets/{ticketId}` mostra uma nova versão `awaiting_professional`, com a anterior preservada, `requestMessageId`, `previousVersionId`, `changeSet` e teste manual invalidado. Para o exemplo:

```json
{"id":"comprovante_endereco","required":false,"requiredWhen":[{"field":"tipo_pessoa","operator":"equals","value":"fisica"}]}
```

O campo continua visível para ambos os tipos e permanece obrigatório para pessoa física. A dispensa não torna todos os campos opcionais. O ajuste requer seleção inequívoca entre pessoa física e jurídica; se não houver essa seleção, o sistema pergunta em vez de presumir. Condições prévias complexas também exigem esclarecimento.

O modo local também reconhece comandos como `tornar CPF opcional`, `adicionar campo "E-mail" do tipo email obrigatório`, `alterar o prazo para 15 dias úteis` e condições simples previstas no interpretador existente. Pedidos não compreendidos geram `needs_information`; a parte ambígua não altera campos. Uma versão aprovada continua vigente enquanto novos rascunhos são revisados.

Prefeituras podem usar o endpoint público existente `POST /api/forms/review/{versionId}` com `Authorization: Bearer {token-do-link}`, `author`, `requestKey`, `action: "changes"` e `content`, ou `action: "accept"`. O token está no fragmento `#` do link e deve ser enviado pelo cliente no header, nunca em logs. Links expiram; versões antigas são rejeitadas. As APIs novas de coleta exigem sessão: para o analista responder antes de existir formulário, use acesso autenticado ao workspace ou um cliente autorizado que registre a resposta atribuída no Ticket.

### 6. Validar e aprovar

`POST /api/tickets/{ticketId}` → 200:

```json
{"action":"test","versionId":"corrected-version-id","values":{"tipo_pessoa":"juridica","cnpj":"11222333000181"}}
```

```json
{"valid":true,"errors":{}}
```

Esse exemplo de CNPJ é de teste; os demais campos obrigatórios existentes no formulário também precisam ser preenchidos. Arquivos são representados por metadados no preenchimento de teste, por exemplo `[{"name":"comprovante.pdf","size":1024,"type":"application/pdf"}]`; isso não protocola um documento na Aprova.

Depois, com o mesmo usuário profissional que executou o teste:

```json
{"action":"approve","versionId":"corrected-version-id"}
```

```json
{"approved":true}
```

A aprovação exige: versão atual, análise/alteração da prefeitura registrada, ausência de pendências, testes automáticos e teste profissional válidos para a definição atual, contexto inalterado e papel autorizado. Aceite da prefeitura pode pular correções, mas não a validação profissional. Não use a revisão pública da prefeitura como substituta do teste do profissional.

### Falhas e retomada

- `400`: payload inválido ou operação não permitida no estado atual; a resposta tem `error`.
- `403`: origem, papel ou token de revisão inválido.
- `404`: processo/pergunta não encontrado no workspace acessível.
- `409`: pergunta respondida/substituída, resposta em processamento ou chave reutilizada com dados diferentes. Rotas de versão existentes também podem retornar 400/409 para versão antiga.
- Tarefas falhas aparecem em `jobs` com `lastError`, `failed`/`dead_letter`, sem marcar envio como concluído. Retome com `{"action":"retry_job","jobId":"job-id"}` no Ticket.
- Sem conector configurado, mensagens ficam `internal`, disponíveis no Ticket. Isso não é entrega WhatsApp/e-mail. O MVP não exige envio externo.

## Testes e demonstração sem UI

Com aplicação, banco e worker ativos, na pasta `frontend`:

```powershell
node --require ./scripts/tsx-windows-shim.cjs --env-file=.env.local --import tsx scripts/mvp-backend-test.ts
node --require ./scripts/tsx-windows-shim.cjs --env-file=.env.local --import tsx scripts/ticket-forms-test.ts
node --require ./scripts/tsx-windows-shim.cjs --env-file=.env.local --import tsx scripts/ticket-routing-test.ts
node node_modules/typescript/bin/tsc --noEmit
```

Na pasta `AI`: `python -m unittest test_municipal_questions.py`.

O teste MVP cria processos fictícios isolados, gera perguntas, responde ambiguidades, verifica não repetição, coleta as seis dimensões, gera formulário, aplica a dispensa por tipo de pessoa, testa as validações e conclui aprovação. Também testa retries, origem inválida, preservação de versão aprovada e isolamento entre municípios. Remove somente os registros que criou, após drenar/cancelar suas tarefas. Não muda dados de demonstração existentes nem envia mensagens externas.

## Limites reais

- A qualidade do Gemini com credenciais reais depende do modelo e das fontes; testes locais de integração usam o fallback e testes Python usam respostas de modelo simuladas. Não se afirma uma validação de produção da IA.
- O modo local suporta vocabulário municipal limitado, seis categorias de coleta e correções explícitas. Regras ou documentos fora desse repertório geram pendência; não há interpretação irrestrita de qualquer lei ou fala.
- Informação recebida pode gerar vários rascunhos durante a coleta. O front-end deve acompanhar `currentVersionId` e guardar `versionId` em cada solicitação.
- Extração de PDF/Office/OCR/áudio e conectores continuam com as dependências/credenciais já existentes. Áudio necessita da IA configurada; o fluxo de texto demonstrado não depende disso.
- Não há tramitação completa, publicação na Aprova, integração externa nova, dashboard novo ou promessa de redução medida de tempo. A aprovação final é sempre profissional.
- As APIs independem da navegação. Os dados preparados para o teste manual e o roteiro local estão em `DADOS_VALIDACAO.md`.


### Revisar sugestões antes de enviar ao chat

Perguntas, pedidos de esclarecimento e formulários sugeridos pelo sistema recebem `deliveryStatus: "awaiting_approval"`. O chat oculta esse estado e `superseded`. O Ticket (`GET /api/inbox`) contém propostas com `payload.municipalAction: "send_message"`, `ticketId`, `messageId` e, quando aplicável, `formVersionId`. Propostas de dados são salvas sem envio. Versões substituídas não podem ser compartilhadas pela proposta antiga.

Aprovação: `PATCH /api/inbox/{id}/review`

```json
{"action":"approve","caseId":"municipio-associado","changeIds":["proposta-selecionada"]}
```

Resposta:

```json
{"applied":1,"rejected":0,"outgoing":[{"ticketId":"ticket-id","messageId":"mensagem-id"}],"sentToChat":1}
```

`sentToChat` indica publicação autorizada no chat, não comprovação de entrega externa. Sem conector, a mensagem permanece `internal`. Com conector, os estados `pending`, `sent`, `delivered` e `failed` registram o resultado real. Aprovação repetida não duplica o envio. Compartilhar o formulário para análise não substitui sua aprovação profissional final, que mantém os testes obrigatórios. Conectores ficam em `/settings?section=connectors`.
