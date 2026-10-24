<div align="center">

# Lexi

### Da conversa com a prefeitura ao formulário validado.

Uma central de conhecimento para coletar regras municipais, gerar formulários e conduzir revisões de forma assíncrona, com origem e histórico preservados.

![MVP](https://img.shields.io/badge/estágio-MVP-059669?style=flat-square)
![Next.js](https://img.shields.io/badge/Next.js-16-111827?style=flat-square)
![Python](https://img.shields.io/badge/Python-FastAPI-0891b2?style=flat-square)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169e1?style=flat-square)

[Conheça o fluxo](#como-funciona) · [Execute localmente](#executar-localmente) · [Teste a solução](#demonstração) · [Consulte a API](MVP_BACKEND_API.md)

</div>

---

## O problema

Implantar um processo municipal exige descobrir regras que estão espalhadas entre servidores, documentos e conversas. A informação demora a chegar, vem em formatos diferentes e, muitas vezes, as particularidades só aparecem quando alguém testa o formulário.

Com várias prefeituras em implantação, depender de reuniões e correções manuais para cada processo dificulta a entrega de formulários adaptados à realidade de cada município.

## A solução

O **Lexi** reúne informações por **prefeitura → secretaria ou setor → processo → regras**. A IA ajuda a identificar lacunas, organizar respostas e propor formulários e correções. O implantador revisa as sugestões, decide o que deve ser enviado e realiza a aprovação profissional final.

| Onde o trabalho trava | Como o MVP ajuda |
| --- | --- |
| A regra não chega | Identifica informações ausentes e gera até cinco perguntas objetivas por rodada. |
| A informação chega sem padrão | Organiza informações e evidências recebidas por mensagens e anexos. |
| A particularidade aparece no teste | Gera formulários preenchíveis com condições e validações para revisão. |
| Cada correção exige configuração manual | Aplica pedidos suficientemente claros em uma nova versão de rascunho. |
| O contexto se perde entre revisões | Preserva fontes, solicitações, versões e decisões no histórico. |

**O diferencial é manter o conhecimento rastreável:** uma mudança não apaga a regra anterior nem substitui silenciosamente uma versão aprovada.

## Como funciona

```mermaid
flowchart TD
    A[Selecionar prefeitura, setor e processo] --> B[Consultar contexto e identificar lacunas]
    B --> C[Gerar perguntas para revisão no Ticket]
    C --> D[Aprovar envio e receber respostas]
    D --> E[Organizar regras e suas fontes]
    E --> F[Gerar formulário em rascunho]
    F --> G[Revisar e aprovar compartilhamento pelo Ticket]
    G --> H[Prefeitura analisa o formulário]
    H --> I{Solicitou ajustes?}
    I -- Sim --> J[Interpretar pedido e criar nova versão]
    J --> G
    I -- Não --> K[Testar e validar com o profissional]
    K --> L[Formulário aprovado e histórico preservado]
```

### Aprovar uma sugestão tem um efeito explícito

- **Enviar no chat:** publica a mensagem ou o formulário após aprovação. A entrega externa depende do conector e do destinatário configurados.
- **Salvar dados:** registra a informação no município, sem gerar uma mensagem desnecessária.
- **Aprovar o formulário:** exige a revisão profissional e os testes da versão atual. Compartilhar para análise não equivale à aprovação final.

Pedidos ambíguos geram pendências. Solicitações repetidas não devem produzir correções ou envios duplicados.

### Um exemplo demonstrável

> **Informação inicial:** CPF ou CNPJ e comprovante de endereço são obrigatórios.<br>
> **Pedido da prefeitura:** “O comprovante de endereço não precisa ser obrigatório para pessoa jurídica.”

O sistema cria um novo rascunho: o comprovante continua obrigatório para pessoa física e passa a opcional para pessoa jurídica. A solicitação fica vinculada à alteração, a versão anterior é preservada e os testes afetados precisam ser refeitos.

Esse é um cenário fictício reconhecido pelo modo local. Ele não representa interpretação irrestrita de qualquer legislação ou pedido em linguagem natural.

## Conheça as telas

| Área | Para que serve | Rota |
| --- | --- | --- |
| **Visão geral** | Acompanhar o trabalho e acessar as áreas principais. | `/dashboard` |
| **Ticket** | Revisar entradas e sugestões, organizadas por setor, e aprovar seus efeitos. | `/inbox` |
| **Municípios** | Consultar processos, dados, regras, evidências e pendências municipais. | `/cases` |
| **Formulários** | Acompanhar conversas e formulários compartilhados no chat do processo. | `/communications` |
| **Configurações** | Gerenciar preferências e conectores. | `/settings` |
| **Visão da prefeitura** | Preencher a prévia, analisar a versão e solicitar ajustes pelo link de revisão. | `/review/{id}#token` |

Os nomes técnicos de algumas rotas vêm da base LexiLoop e foram mantidos para preservar compatibilidade. A configuração de conectores fica somente em **Configurações → Conectores**.

<details>
<summary><strong>Veja a visão da prefeitura</strong></summary>

![Visão da prefeitura: formulário municipal para análise](docs/images/revisao-prefeitura.png)

*Captura do ambiente local com prefeitura, processo e regras fictícios.*

</details>

## Arquitetura

O projeto reutiliza a base **LexiLoop**, seus serviços de ingestão, revisão, conectores e armazenamento.

| Camada | Tecnologia e responsabilidade |
| --- | --- |
| Interface e APIs da aplicação | Next.js 16, React 19 e TypeScript. |
| Componentes e estilos | Tailwind CSS e componentes Radix UI. |
| Persistência | PostgreSQL 16 e Prisma. |
| IA e extração | Python, FastAPI e integração opcional com Google Gemini. |
| Trabalho assíncrono | Worker Node.js com fila persistida, deduplicação e retomada de falhas. |
| Formulários | Definição estruturada, validações, evidências e versões preservadas. |

```text
hack-aprova/
├── frontend/
│   ├── src/app/                 # Telas e APIs Next.js
│   ├── src/components/          # Chat, formulário e componentes compartilhados
│   ├── src/lib/municipal/       # Contexto, coleta, geração, revisão e versões
│   ├── prisma/                 # Modelo de dados e migrações
│   ├── scripts/                # Workers, testes e preparação da demonstração
│   └── fixtures/municipal-validation/  # Respostas e arquivos fictícios
├── AI/                         # Serviços Python de IA e extração
├── intructions/                # Instruções de desenvolvimento
├── docs/images/                # Capturas usadas na documentação
├── run_backend.py              # Inicialização do serviço Python
└── Start-LexiLoop.ps1           # Inicialização local no Windows
```

## Executar localmente

### Pré-requisitos

O ambiente usado na validação utiliza **Node.js 24**, **Python 3.14**, **PostgreSQL 16** e **Docker Desktop**. Os comandos abaixo são para **PowerShell no Windows**. O Docker precisa estar em execução.

### 1. Clonar e instalar

```powershell
git clone https://github.com/fernandobelterdeoliveira/hack-aprova.git
cd hack-aprova

python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt

cd frontend
Copy-Item .env.example .env.local
npm ci
```

### 2. Configurar o banco e o ambiente

Na pasta `frontend`, crie o banco de desenvolvimento:

```powershell
docker run --name lexiloop-postgres-dev -e POSTGRES_USER=lexiloop -e POSTGRES_PASSWORD=lexiloop_dev -e POSTGRES_DB=lexiloop -p 127.0.0.1:55432:5432 -d postgres:16-alpine
```

Ajuste `frontend/.env.local`:

```dotenv
DATABASE_URL="postgresql://lexiloop:lexiloop_dev@127.0.0.1:55432/lexiloop?schema=public"
PYTHON_BACKEND_URL="http://127.0.0.1:8000"
INGESTION_EXTRACTOR_URL="http://127.0.0.1:8000"
APP_BASE_URL="http://127.0.0.1:3001"
ALLOW_LOCAL_AUTH="true"
```

As credenciais e a autenticação local acima são para desenvolvimento. `GOOGLE_API_KEY` é opcional para a demonstração local; adicione sua chave ao arquivo de ambiente para habilitar a IA configurada. O inicializador Python lê esse arquivo.

Aplique as migrações e gere o Prisma Client:

```powershell
node --env-file=.env.local node_modules/prisma/build/index.js migrate deploy
node --env-file=.env.local node_modules/prisma/build/index.js generate
```

### 3. Iniciar os serviços

Na raiz do repositório, com o ambiente Python ativado:

```powershell
cd ..
.\Start-LexiLoop.ps1
```

O inicializador verifica o contêiner `lexiloop-postgres-dev` e inicia a aplicação, o serviço Python e o worker municipal.

| Serviço | Endereço |
| --- | --- |
| Aplicação | http://127.0.0.1:3001/dashboard |
| Ticket | http://127.0.0.1:3001/inbox |
| Formulários | http://127.0.0.1:3001/communications |
| Documentação do serviço Python | http://127.0.0.1:8000/docs |

Se o ambiente já estiver preparado, basta ativar o ambiente Python e executar `Start-LexiLoop.ps1`. Logs locais ficam nos arquivos `frontend-*.log`, `backend-*.log` e `ticket-worker-*.log` na raiz.

## Demonstração

Com os serviços ativos, abra a aplicação uma vez para inicializar o usuário e o workspace locais. Depois, na pasta `frontend`:

```powershell
npm run seed:municipal-showcase
npm run seed:municipal-validation
npm run seed:municipal-cases
```

A preparação inclui processos em quatro prefeituras fictícias, com exemplos de coleta incompleta, revisão, correção e aprovação. Os cenários **TESTAR · Alvará** e **REFERÊNCIA · Alvará** permitem executar o fluxo e comparar com uma referência concluída. Os scripts reutilizam os registros existentes e preservam seu progresso.

### Roteiro para apresentar o MVP

1. Em **Municípios**, selecione o processo e confira seu contexto e suas fontes.
2. Gere ou consulte perguntas e registre respostas pelas [APIs de coleta](MVP_BACKEND_API.md). A geração de perguntas e o registro individual de respostas estão disponíveis por API.
3. Em **Ticket**, revise as sugestões e aprove o compartilhamento do formulário ou da mensagem. Sugestões de dados são salvas sem envio.
4. Abra o link da **visão da prefeitura**, preencha a identificação e analise o formulário.
5. Solicite a dispensa do comprovante de endereço para pessoa jurídica.
6. Confira a nova versão e aprove o compartilhamento pelo Ticket.
7. Teste as validações e conclua a aprovação profissional.

Respostas, pedidos de ajuste e valores de teste estão em [`frontend/fixtures/municipal-validation/`](frontend/fixtures/municipal-validation/). Consulte também o [guia dos dados demonstrativos](DADOS_VALIDACAO.md); exemplos de interface em guias anteriores podem usar nomes antigos. Os contratos atuais estão em [MVP_BACKEND_API.md](MVP_BACKEND_API.md).

Para preparar outra rodada sem apagar o histórico:

```powershell
npm run seed:municipal-validation -- --new-round
npm run seed:municipal-cases
```

## APIs e integração

As rotas principais são disponibilizadas pela aplicação Next.js:

| Operação | Endpoint |
| --- | --- |
| Consultar contexto e pendências | `GET /api/municipal/{id}/context` |
| Gerar ou consultar perguntas | `POST` / `GET /api/municipal/{id}/questions` |
| Registrar uma resposta | `POST /api/municipal/{id}/answers` |
| Consultar formulário, versões e mensagens | `GET /api/tickets/{id}` |
| Gerar, testar, editar ou aprovar formulário | `POST /api/tickets/{id}` com a ação correspondente |
| Consultar sugestões para revisão | `GET /api/inbox` |
| Aprovar, rejeitar ou reassociar sugestões | `PATCH /api/inbox/{id}/review` |
| Revisão da prefeitura | `GET` / `POST /api/forms/review/{id}` com token |

Consulte os exemplos JSON, requisitos de autenticação, ações e estados de entrega em **[MVP_BACKEND_API.md](MVP_BACKEND_API.md)**. O Swagger em `/docs` documenta o serviço Python, e não substitui esse contrato das APIs Next.js.

## Verificar o projeto

Na pasta `frontend`, com banco, aplicação, serviço Python e worker ativos:

```powershell
npm run typecheck
node --require ./scripts/tsx-windows-shim.cjs --env-file=.env.local --import tsx scripts/mvp-backend-test.ts
node --require ./scripts/tsx-windows-shim.cjs --env-file=.env.local --import tsx scripts/ticket-forms-test.ts
node --require ./scripts/tsx-windows-shim.cjs --env-file=.env.local --import tsx scripts/ticket-routing-test.ts
```

Esses testes cobrem coleta, isolamento de contexto, formulários condicionais, correções, preservação de versões, aprovação de sugestões e estados de entrega. Os scripts criam seus próprios registros temporários e executam sua limpeza. A validação do fluxo local não comprova entrega por um provedor externo nem qualidade de um modelo de IA sem credenciais.

## Capacidades e limites do MVP

| Recurso | Condição atual |
| --- | --- |
| Coleta, geração, correção e revisão local | Demonstráveis com dados fictícios e regras reconhecidas pelo modo local. |
| Interpretação com IA | Depende de credencial e disponibilidade do serviço configurado. Respostas inválidas ou falhas ficam explícitas. |
| OCR e áudio | OCR depende do Tesseract local; áudio exige IA configurada. |
| Compartilhamento no chat | Exige aprovação da sugestão de envio. Sem conector, permanece disponível internamente. |
| Envio por WhatsApp ou e-mail | Exige conector, destinatário e endereço HTTPS público para os links de revisão. |
| WhatsApp | Integração pela Cloud API; sem conexão por QR Code ou leitura de grupos. |
| Publicação na Aprova | Não integrada neste MVP. O teste do formulário não cria protocolos externos. |

Configurações e credenciais ficam em arquivos locais, fora do Git. Dados, anexos, logs e backups do ambiente também não são versionados. A captura deste README e os arquivos de demonstração usam informações fictícias.

### Como avaliar o resultado

O sistema registra minutos de trabalho, rodadas de esclarecimento e tempo entre geração e aprovação. Os resultados devem ser comparados com uma linha de base real, em processos equivalentes. O projeto não presume ganhos de produtividade a partir dos exemplos.

## Documentação do projeto

| Documento | Conteúdo |
| --- | --- |
| [Contrato das APIs do MVP](MVP_BACKEND_API.md) | Rotas, exemplos de integração, aprovações e estados. |
| [Dados para validação](DADOS_VALIDACAO.md) | Cenários fictícios, arquivos de teste e preparação da base. |
| [Ticket e formulários](TICKET_FORMULARIOS.md) | Detalhes do fluxo e dos serviços existentes. |
| [Instruções de desenvolvimento](intructions/intructions.md) | Convenções e cuidados ao contribuir. |
| [Coleta municipal](MUNICIPAL_COLLECTION_INSTRUCTIONS.md) | Instruções para identificar lacunas e interpretar respostas. |
| [Geração de formulários](MUNICIPAL_FORM_INSTRUCTIONS.md) | Regras de geração, validação e correção. |
| [Extração de regras](MUNICIPAL_INSTRUCTIONS.md) | Contexto, evidências e revisão das regras municipais. |
| [Conectores](CONNECTORS.md) | Provedores, configuração e dependências externas. |
| [Arquitetura da base](LEGACY_ARCHITECTURE.md) | Referência da arquitetura LexiLoop reutilizada. |

---

<div align="center">

**Conhecimento organizado. Formulários rastreáveis. Revisão humana em cada decisão.**

Desenvolvido para demonstrar a implantação assíncrona de processos municipais no Hack Aprova.

</div>
