# LexiLoop — Arquitetura MCP e conectores externos

## Objetivo

Permitir dois fluxos independentes e seguros:

1. usuários do LexiLoop conectam Gmail, Drive, Calendar e Outlook;
2. usuários conectam o LexiLoop ao ChatGPT como um plugin MCP.

Os tokens do Google nunca são enviados ao ChatGPT. O ChatGPT recebe um token
emitido para o LexiLoop e chama ferramentas MCP; o LexiLoop resolve a identidade,
aplica as permissões e usa internamente a conta Google correta quando necessário.

## Arquitetura adaptada

```text
                           ┌────────────────────┐
                           │ Usuário / advogado │
                           └─────────┬──────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    │                                 │
                    ▼                                 ▼
          ┌──────────────────┐              ┌──────────────────┐
          │ LexiLoop Web App │              │     ChatGPT      │
          └────────┬─────────┘              │   OAuth Client   │
                   │                        └────────┬─────────┘
           Login LexiLoop                            │ OAuth 2.1 + PKCE
                   │                                 ▼
                   ▼                        ┌──────────────────┐
          ┌──────────────────┐              │ LexiLoop MCP     │
          │ Provedor de      │◄─────────────│ Resource Server  │
          │ identidade       │ valida token └────────┬─────────┘
          │ (recomendado:    │                       │
          │ Auth0/IdP)       │                       │ ferramentas tipadas
          └──────────────────┘                       ▼
                                          ┌──────────────────────┐
                                          │ Policy Engine        │
                                          │ autorização + risco  │
                                          └──────────┬───────────┘
                                                     │
                                                     ▼
                                          ┌──────────────────────┐
                                          │ Case State / Inbox   │
                                          │ ProposedCaseChange   │
                                          └──────────┬───────────┘
                                                     │
                                                     │ conta externa do
                                                     │ usuário/escritório
                                                     ▼
                                          ┌──────────────────────┐
                                          │ Connector Service    │
                                          │ Google / Microsoft   │
                                          └──────────┬───────────┘
                                                     │ OAuth do provedor
                                                     ▼
                                          ┌──────────────────────┐
                                          │ Gmail / Drive /      │
                                          │ Calendar / Outlook   │
                                          └──────────────────────┘
```

## Fronteiras de autenticação

### OAuth A — ChatGPT para LexiLoop

- cliente: ChatGPT;
- resource server: servidor MCP do LexiLoop;
- authorization server: provedor de identidade do LexiLoop;
- token audience/resource: URL canônica HTTPS do MCP;
- scopes iniciais: `profile.read`, `cases.read`, `inbox.read`,
  `changes.propose` e `tasks.propose`;
- transporte: Streamable HTTP em `/mcp`;
- descoberta: `/.well-known/oauth-protected-resource`;
- todas as chamadas validam assinatura, issuer, audience, expiração e escopos.

### OAuth B — LexiLoop para Google/Microsoft

- cliente: aplicativo OAuth do LexiLoop;
- resource servers: APIs Google e Microsoft Graph;
- credenciais criptografadas em `ConnectorAccount`;
- cada conta deve possuir `userId` e `workspaceId`;
- tokens externos nunca são retornados por API ou ferramenta MCP.

## Ferramentas MCP da primeira versão

### Leitura

- `get_profile()`
- `search_cases(query, status?)`
- `get_case_state(caseId)`
- `get_case_timeline(caseId)`
- `get_case_facts(caseId)`
- `get_information_gaps(caseId)`
- `get_case_tasks(caseId)`
- `get_case_documents(caseId)`
- `read_document(documentId, page?)`
- `search_case_content(caseId, query)`

### Propostas

- `propose_event(caseId, data, evidence)`
- `propose_fact(caseId, data, evidence)`
- `propose_task(caseId, data, evidence)`
- `propose_information_gap(caseId, data, evidence)`
- `propose_gap_resolution(caseId, data, evidence)`
- `propose_deadline(caseId, data, evidence)`
- `request_human_review(caseId, reason, evidence)`

As ferramentas de proposta criam `ProposedCaseChange` e passam pelo Policy
Engine. Elas nunca modificam diretamente o estado oficial.

## Ferramentas que não serão expostas

- `approve_change`
- `apply_change`
- `update_case_directly`
- `delete_case`
- `send_client_message`
- `accept_settlement`
- `file_legal_document`
- `modify_deadline`
- qualquer ferramenta que devolva tokens ou credenciais externas

Aprovação, comunicação jurídica e ações críticas permanecem na interface do
LexiLoop com revisão humana.

## Mudanças necessárias no banco

1. criar `Workspace` e `WorkspaceMember`;
2. ligar `UserProfile` a uma identidade persistente do IdP;
3. adicionar `userId` e `workspaceId` a `ConnectorAccount`;
4. adicionar `workspaceId` a casos e demais registros operacionais;
5. criar `MCPToolExecution` para auditoria de ferramenta, escopo, latência,
   resultado e usuário;
6. criar índices e filtros obrigatórios por workspace;
7. migrar a conta local atual para um workspace inicial sem perder dados.

## Política MCP

| Operação | Escopo | Resultado |
|---|---|---|
| consultar caso | `cases.read` | permitido após autorização |
| consultar Inbox | `inbox.read` | permitido após autorização |
| criar proposta | `changes.propose` | cria item pendente |
| sugerir tarefa | `tasks.propose` | cria proposta pendente |
| aplicar fato/evento | não exposto | somente revisão LexiLoop |
| enviar comunicação | não exposto | somente fluxo humano |
| prazo/acordo/protocolo | não exposto | ação manual obrigatória |

## Sequência de implementação

### Fase 1 — identidade e isolamento

- escolher e configurar um IdP compatível com OAuth 2.1, PKCE e metadata;
- introduzir workspace e usuário autenticado;
- migrar `ConnectorAccount` e casos para escopo de workspace;
- adicionar autorização central às APIs atuais.

### Fase 2 — MCP somente leitura

- instalar o SDK MCP oficial;
- criar o endpoint Streamable HTTP `/mcp`;
- publicar protected-resource metadata;
- implementar validação de token e escopos;
- expor perfil, busca, estado, timeline, fatos, lacunas, tarefas e documentos;
- registrar todas as execuções.

### Fase 3 — propostas auditáveis

- expor somente ferramentas `propose_*`;
- reutilizar proveniência, Policy Engine, idempotência e revisão existentes;
- garantir que toda proposta apareça na Inbox antes de qualquer aplicação.

### Fase 4 — conectores por usuário

- concluir OAuth Google/Microsoft com contas reais;
- adicionar Google Calendar;
- resolver sempre a conta externa pelo usuário/workspace autenticado;
- manter Gmail, Drive, Calendar e Outlook atrás do mesmo Policy Engine.

### Fase 5 — publicação no ChatGPT

- implantar o MCP em domínio HTTPS estável;
- validar com MCP Inspector;
- adicionar o servidor MCP personalizado no ChatGPT;
- instalar como plugin em workspace de teste;
- testar cada ferramenta, escopo, recusa e confirmação antes de publicar.

## Requisitos externos ainda ausentes

- domínio HTTPS público para o MCP;
- provedor de identidade OAuth 2.1;
- Client IDs/Secrets Google e Microsoft;
- configuração dos redirect URIs;
- tenant/workspace e usuários reais;
- credenciais para publicação e testes no ChatGPT.

## Estado da implementação em 07/10/2026

As fases 1 e 2 foram iniciadas no código. Já existem `Workspace`,
`WorkspaceMember`, vínculo Auth0 no perfil, `MCPToolExecution`, validação OAuth
para o MCP, metadata de recurso protegido e oito ferramentas somente leitura.
Casos, Inbox, perfil e listagem de conectores já usam o workspace autenticado.

Ainda não devem ser consideradas concluídas: configuração de um tenant Auth0
real, publicação HTTPS, conexão pelo ChatGPT, ferramentas `propose_*`, Calendar
e autorização por workspace em todas as rotas auxiliares antigas. O token local
é apenas um recurso de desenvolvimento.

## Referências oficiais

- [Adicionar servidor MCP personalizado](https://developers.openai.com/api/docs/guides/custom-mcp-server)
- [Autenticação de plugins MCP](https://developers.openai.com/plugins/build/auth)
- [Construir servidor MCP](https://developers.openai.com/plugins/build/mcp-server)
