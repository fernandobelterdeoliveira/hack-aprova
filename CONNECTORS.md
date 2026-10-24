# Conectores de entrada e saída controlada

Todos os conectores convergem para `InboxItem` e, portanto, reutilizam
associação ao caso, extração, `ProposedCaseChange`, Policy Engine e revisão
humana. Nenhum conector altera o estado oficial diretamente. A única saída
automática permitida é uma confirmação fixa de recebimento, de baixo risco e
explicitamente habilitada por configuração.

## Modelos

- `ConnectorAccount`: conta externa, cursores, expiração e credenciais cifradas.
- `ConnectorDelivery`: payload original, identificador externo, validação de
  assinatura, estado do processamento e relação com a Inbox.
- `StoredObject`: cópia privada permanente, hash SHA-256 e proveniência do anexo.
- `OutboundMessage`: fila auditável, risco, aprovação, idempotência e resultado.

Credenciais são cifradas com AES-256-GCM. Configure chaves independentes e
aleatórias em `CONNECTOR_ENCRYPTION_KEY` e `CONNECTOR_STATE_SECRET`.

## Login em um clique

Depois da configuração única das credenciais do aplicativo, o usuário conecta
Google ou Microsoft clicando em **Entrar com Google** ou **Entrar com
Microsoft** na página `Configurações > Plugins`. O provedor realiza o login e o
consentimento; o callback retorna automaticamente para a lista de plugins com a
conta vinculada.

Para desenvolvimento local, cadastre nos consoles dos provedores exatamente:

- Google: `http://localhost:3001/api/connectors/google/callback`
- Microsoft: `http://localhost:3001/api/connectors/microsoft/callback`

Variáveis mínimas para liberar o login Google:

- `GOOGLE_CONNECTOR_CLIENT_ID`
- `GOOGLE_CONNECTOR_CLIENT_SECRET`
- `GOOGLE_CONNECTOR_REDIRECT_URI`
- `CONNECTOR_ENCRYPTION_KEY`
- `CONNECTOR_STATE_SECRET`

Variáveis mínimas para liberar o login Microsoft:

- `MICROSOFT_CONNECTOR_CLIENT_ID`
- `MICROSOFT_CONNECTOR_CLIENT_SECRET`
- `MICROSOFT_CONNECTOR_REDIRECT_URI`
- `CONNECTOR_ENCRYPTION_KEY`
- `CONNECTOR_STATE_SECRET`

Pub/Sub, domínio público e webhooks são necessários para recebimento automático,
mas não bloqueiam mais o primeiro login da conta.

## WhatsApp Business

Endpoint: `/api/connectors/whatsapp/webhook`.

O GET implementa o desafio de verificação da Meta. O POST valida
`X-Hub-Signature-256` usando `WHATSAPP_APP_SECRET` antes de aceitar mensagens.
Textos e legendas entram na Inbox. Mídias são baixadas com o token da Cloud API,
copiadas para o storage privado e vinculadas à entrega e à entrada.

## Gmail

OAuth: `/api/connectors/google/start`.
Webhook Pub/Sub: `/api/connectors/gmail/webhook`.

Configure um tópico Pub/Sub e conceda publicação para
`gmail-api-push@system.gserviceaccount.com`. O conector cria `users.watch`,
mantém `historyId`, consulta `history.list`, busca a mensagem completa e baixa
anexos por `users.messages.attachments.get`. O webhook exige o JWT OIDC emitido
pelo Pub/Sub e valida audiência, e-mail da service account, emissor e expiração.

## Google Drive

OAuth compartilhado com Gmail. Webhook:
`/api/connectors/google-drive/webhook`.

O canal usa UUID e token secretos. Como a notificação não traz os detalhes do
arquivo, o conector consulta `changes.list`, persiste o novo cursor e cria uma
entrada para cada versão alterada. Nesta versão são preservados metadados e a URL
original. Arquivos binários são baixados com OAuth; documentos nativos Google
são exportados para PDF antes da cópia privada.

## Outlook

OAuth: `/api/connectors/microsoft/start`.
Webhook: `/api/connectors/outlook/webhook`.

O conector cria uma subscription do Microsoft Graph para novas mensagens na
Inbox, valida `clientState`, busca a mensagem e seus anexos e os normaliza.

## Storage privado

`OBJECT_STORAGE_PROVIDER=local` grava em `LOCAL_STORAGE_PATH` para
desenvolvimento. Em produção use `OBJECT_STORAGE_PROVIDER=s3` e configure as
variáveis `S3_*`. Downloads internos usam URLs HMAC com expiração; o caminho do
objeto nunca é exposto diretamente.

## Renovação automática

O endpoint `POST /api/cron/connectors/renew` exige `Authorization: Bearer
CONNECTOR_CRON_SECRET`. Execute `npm run connectors:scheduler` como processo
separado (ou invoque o endpoint por cron da infraestrutura). Ele renova Gmail,
substitui canais do Drive e estende subscriptions do Outlook antes da expiração.

## Saída controlada

Gmail, Outlook e WhatsApp implementam envio. Para habilitar apenas a confirmação
fixa de recebimento, configure `CONNECTOR_AUTO_ACK_ENABLED=true`. A mensagem é
idempotente, marcada como resposta automática e nunca contém orientação
jurídica. Qualquer comunicação jurídica, prazo, acordo ou estratégia permanece
fora da automação e exige revisão humana.

## Limites atuais

- Credenciais reais, consent screens e domínio HTTPS não fazem parte do código.
- Gmail/Drive/Outlook não podem ser validados ponta a ponta sem contas externas.
- O endpoint OIDC usa `tokeninfo` com cache curto. Em volume elevado, substitua
  por validação local das chaves públicas do Google com rotação de JWKS.
- O storage local é persistente apenas na máquina; produção deve usar S3 ou
  serviço compatível com backup, retenção e criptografia administrados.
- A renovação automática depende do processo scheduler ou de um cron externo
  estar ativo; o servidor web sozinho não cria relógios duráveis.
