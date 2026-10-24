# Hack Aprova — Ticket e formulários municipais

Coleta assíncrona de regras de processos municipais, geração de formulários preenchíveis e revisão pelo Ticket. O projeto adapta a base LexiLoop, preservando as funcionalidades anteriores.

## Fluxo

Informações pelo Ticket → formulário versionado → análise da prefeitura → ajustes → correção automática → validação profissional.

- Contexto por prefeitura, secretaria, processo e responsável, com origem das regras identificada.
- Campos, documentos, obrigatoriedade, condições e validações executáveis.
- Revisão da prefeitura por link privado, com mensagens e anexos ligados à versão correta.
- Novos rascunhos preservam versões aprovadas e registram diferenças, autor e data.
- Conectores no Ticket; histórico anterior preservado.
- Fila persistente, deduplicação, falhas visíveis e retomada.
- Registro de tempo, rodadas de esclarecimento e tempo de geração até aprovação.

## Executar no ambiente já preparado

```powershell
.\Start-LexiLoop.ps1
```

Ticket: http://127.0.0.1:3001/communications  
Implantação municipal: http://127.0.0.1:3001/municipal  
Backend: http://127.0.0.1:8000/docs

O inicializador espera o contêiner `lexiloop-postgres-dev` e inicia o backend, o frontend e o worker dedicado ao Ticket.

## Instalação nova

Ambiente usado na validação: Node.js 24, Python 3.14, PostgreSQL 16 e Docker Desktop.

```powershell
git clone https://github.com/fernandobelterdeoliveira/hack-aprova.git
cd hack-aprova
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
docker run --name lexiloop-postgres-dev -e POSTGRES_USER=lexiloop -e POSTGRES_PASSWORD=lexiloop_dev -e POSTGRES_DB=lexiloop -p 127.0.0.1:55432:5432 -d postgres:16-alpine
cd frontend
Copy-Item .env.example .env.local
npm ci
```

Ajuste `DATABASE_URL` no arquivo local de configuração para corresponder ao seu banco. No exemplo acima:

```dotenv
DATABASE_URL=postgresql://lexiloop:lexiloop_dev@127.0.0.1:55432/lexiloop?schema=public
PYTHON_BACKEND_URL=http://127.0.0.1:8000
INGESTION_EXTRACTOR_URL=http://127.0.0.1:8000
```

As credenciais acima são exclusivamente um exemplo de desenvolvimento local. Em seguida:

```powershell
node --env-file=.env.local node_modules/prisma/build/index.js migrate deploy
node --env-file=.env.local node_modules/prisma/build/index.js generate
cd ..
.\Start-LexiLoop.ps1
```

## Configuração e limites

Sem credencial de IA, existe um modo local para campos reconhecidos e correções explícitas; dúvidas geram pendências. Configure `GOOGLE_API_KEY` no backend para usar o agente existente. OCR depende do Tesseract local; áudio exige IA configurada.

Envio externo exige conector, destinatário e endereço HTTPS público, configurados no Ticket. A integração WhatsApp utiliza a Cloud API, sem QR Code ou grupos. Publicação na Aprova não está integrada. A prévia valida o formulário, mas não cria protocolos externos.

Credenciais, banco, anexos, backups, logs e dados locais não são versionados. Copie apenas os modelos `.env.example` e configure suas próprias credenciais.

## Documentação

- [Guia do Ticket e formulários](TICKET_FORMULARIOS.md)
- [Instruções do agente de formulários](MUNICIPAL_FORM_INSTRUCTIONS.md)
- [Instruções de extração de regras](MUNICIPAL_INSTRUCTIONS.md)
- [Conectores](CONNECTORS.md)
- [Arquitetura original](LEGACY_ARCHITECTURE.md)

## Validação

A partir de `frontend`, com os serviços ativos:

```powershell
node --require ./scripts/tsx-windows-shim.cjs --env-file=.env.local --import tsx scripts/ticket-forms-test.ts
node --require ./scripts/tsx-windows-shim.cjs --env-file=.env.local --import tsx scripts/ticket-routing-test.ts
node --env-file=.env.local scripts/municipal-smoke-test.mjs
node --require ./scripts/tsx-windows-shim.cjs --env-file=.env.local --import tsx scripts/municipal-whatsapp-test.ts
npm run typecheck
```

Os testes utilizam registros temporários. Consulte o guia para as condições de execução e a demonstração com dados fictícios.
