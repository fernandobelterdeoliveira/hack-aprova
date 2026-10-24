> Atualização: o fluxo de formulários e Ticket está documentado em [TICKET_FORMULARIOS.md](TICKET_FORMULARIOS.md). O conteúdo abaixo registra a etapa anterior.

# Demonstração — coleta e validação de regras

Abra http://127.0.0.1:3001/municipal. O módulo jurídico continua disponível nas outras opções do menu.

## Roteiro de 3 minutos

1. Cadastre um processo em uma prefeitura fictícia, selecionando um dos modelos demonstrativos.
2. Em Fontes e documentos, cole o relato abaixo e clique em Extrair propostas.
3. Revise os seis cartões, abra a comparação com o modelo e confirme uma regra.
4. Cadastre o telefone do responsável. Use Validar no WhatsApp para preparar o texto; nenhuma mensagem é enviada apenas ao clicar em preparar.
5. Com uma conta real conectada, o responsável pode responder CONFIRMAR seguido do código exibido; correções usam CORRIGIR código: texto.
6. Gere os cenários, execute no formulário clonado e registre o observado. A liberação fica bloqueada enquanto faltam confirmações ou testes da versão atual.
7. Exporte o dossiê JSON para orientar a configuração na Aprova. Não existe publicação direta na Aprova nesta versão.

## Relato fictício para demonstrar

Pessoas físicas e jurídicas podem solicitar o serviço.
Os documentos obrigatórios são CPF ou CNPJ e comprovante de endereço.
A vistoria deve ocorrer antes da aprovação.
Atividades de baixo risco têm dispensa de vistoria.
O prazo de análise é de 10 dias úteis.
A secretaria é responsável pela triagem e o diretor aprova o pedido.

Estes dados são fictícios e não representam norma de um município real.

## Métricas

Registre minutos efetivos e rodadas de esclarecimento. Compare processos equivalentes em um piloto para medir redução de tempo. Completude significa seis dimensões com regras aprovadas e evidência; não garante cobertura de toda legislação.

## Plano B

As capturas em artifacts mostram a interface local. O relato acima permite reproduzir a demonstração sem serviços de IA: o modo local seleciona trechos por categoria e exige revisão. O chat real depende da Meta e não deve ser apresentado como conectado sem credenciais. Faça uma gravação curta do fluxo antes da apresentação se precisar de vídeo.

## Inicialização

Execute Start-LexiLoop.ps1 na pasta do projeto. Ele liga o PostgreSQL existente antes de iniciar o backend e o frontend. Endereços: frontend 3001, backend 8000, PostgreSQL 55432.

## WhatsApp real

Em Comunicação, clique em Configurar conexão e informe Phone Number ID, token de acesso, App Secret, token de verificação e endereço HTTPS público. O número é validado antes de salvar no ambiente local. Depois cadastre o webhook /api/connectors/whatsapp/webhook na Meta. Novas mensagens e status de entrega entram pelo webhook e são transmitidos à tela por SSE. Sem QR Code, sem importação de histórico pessoal e sem grupos nesta implementação. Mensagens livres exigem janela de atendimento; templates fora da janela não foram implementados.

Referência de webhooks da Meta: https://www.postman.com/meta/whatsapp-business-platform/folder/lboq68h/webhooks

## IA e documentos

run_backend.py lê frontend/.env.local. Configure GOOGLE_API_KEY para extração pelo agente e transcrição de áudio. As instruções estão em MUNICIPAL_INSTRUCTIONS.md. Sem chave, a extração de regras usa seleção local explícita. PDF precisa conter texto; imagens dependem do Tesseract local. Anexos, regras e transcrições devem ser conferidos. Não foram testadas credenciais externas reais.

## Verificação

- node --env-file=.env.local scripts/municipal-smoke-test.mjs
- node --require ./scripts/tsx-windows-shim.cjs --env-file=.env.local --import tsx scripts/municipal-whatsapp-test.ts
- npx tsc --noEmit

Os testes usam dados temporários e removem seus próprios registros. Não enviam mensagens externas.
