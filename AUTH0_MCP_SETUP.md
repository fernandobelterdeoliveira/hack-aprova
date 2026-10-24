# Auth0 e MCP no LexiLoop

Esta implementação separa duas autorizações diferentes:

1. o usuário autentica no LexiLoop pelo Auth0;
2. o ChatGPT recebe um token OAuth limitado para consultar o servidor MCP do LexiLoop.

Os tokens do Google e da Microsoft continuam privados no LexiLoop. Eles nunca
são entregues ao ChatGPT.

## O que já está implementado

- workspace e membros persistentes;
- vínculo entre `UserProfile` e o `sub` do Auth0;
- modo local compatível com os dados existentes;
- endpoint MCP Streamable HTTP em `/mcp`;
- metadata OAuth em `/.well-known/oauth-protected-resource`;
- validação JWT por JWKS, issuer e audience;
- scopes `profile.read` e `cases.read`;
- oito ferramentas MCP somente leitura;
- isolamento das ferramentas MCP por workspace;
- auditoria de cada ferramenta em `MCPToolExecution`;
- token local opcional apenas para desenvolvimento.

## Configuração do Auth0

Crie no mesmo tenant uma aplicação web para o painel LexiLoop e uma API para o
servidor MCP, com audience próprio. Adicione as permissões `profile.read` e
`cases.read` nessa API.

Configure na aplicação web:

- Allowed Callback URL: `https://SEU_DOMINIO/auth/callback`
- Allowed Logout URL: `https://SEU_DOMINIO`
- Allowed Web Origin: `https://SEU_DOMINIO`

Variáveis necessárias:

```env
APP_BASE_URL="https://app.seudominio.com"
AUTH0_DOMAIN="seu-tenant.auth0.com"
AUTH0_CLIENT_ID="..."
AUTH0_CLIENT_SECRET="..."
AUTH0_SECRET="uma-chave-longa-e-aleatoria"
AUTH0_MCP_AUDIENCE="https://mcp.seudominio.com"
MCP_PUBLIC_URL="https://mcp.seudominio.com/mcp"
```

`AUTH0_SECRET` deve ter no mínimo 32 bytes de entropia. Não registre nenhum
segredo no Git.

## Desenvolvimento local

Sem variáveis Auth0, o painel usa `current-user` e `default-workspace`, mantendo
compatibilidade com a instalação atual. O MCP permanece fechado, a menos que um
token local seja definido explicitamente:

```env
MCP_LOCAL_TOKEN="um-token-local-longo"
```

Esse modo não deve ser usado em produção e não substitui OAuth.

## Ferramentas expostas atualmente

- `get_profile`
- `search_cases`
- `get_case_state`
- `get_case_timeline`
- `get_case_facts`
- `get_information_gaps`
- `get_case_tasks`
- `get_case_documents`

Nenhuma delas aplica alterações, envia mensagens, modifica prazo, aceita acordo
ou executa ação jurídica.

## Próxima fase

Antes de liberar ferramentas `propose_*`, todas as rotas auxiliares restantes do
painel e todos os callbacks de conectores devem receber a mesma autorização por
workspace. Depois disso, propostas MCP devem entrar como `ProposedCaseChange`,
passar pelo Policy Engine e aparecer para revisão humana na Inbox.
