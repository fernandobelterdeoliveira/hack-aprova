> Atualização: o fluxo de formulários e Ticket está documentado em [TICKET_FORMULARIOS.md](TICKET_FORMULARIOS.md). O conteúdo abaixo registra a etapa anterior.

# Alterações implementadas em 24/10/2026

- Módulo municipal: prefeitura, secretaria, responsável, contato e meta; importação de até 400 processos por CSV.
- Seis dimensões de regra com fonte e trecho exato, versões, aprovação e tratamento de nova evidência divergente.
- Extrator local e agente opcional com contrato validado; documentos originais preservados; áudio exige chave de IA e imagem exige OCR local.
- Perguntas sobre lacunas e mensagens de confirmação preparadas para envio humano pelo WhatsApp.
- Comparação entre modelo demonstrativo e regra local; cenários de validação com resultado observado e bloqueio de liberação até confirmações e testes da versão atual.
- Indicadores de completude, pendências, tempo registrado e rodadas; exportação de dossiê em JSON.
- Comunicação com interface de chat, sincronização SSE, recebimento via webhook assinado, envio humano pela Cloud API, anexos e status de entrega/leitura.
- Formulário local de conexão da conta; as credenciais são verificadas na Meta antes de salvar. Não foram configuradas credenciais reais.
- Confirmação por código e telefone cadastrado; correções invalidam o código anterior e exigem nova confirmação.
- Inicialização que liga o banco antes dos servidores; backup anterior em backups/20261024-102535.

## Validação realizada

48 verificações de integração passaram, além do teste isolado do fluxo de WhatsApp (contato errado, aprovação, repetição, correção, código antigo e ordenação dos status). TypeScript, ESLint dos arquivos alterados e compilação Python passaram. As capturas de desktop e celular não apresentaram erros de execução no navegador de testes.

Nenhuma mensagem foi enviada a contatos reais nos testes. Os registros temporários foram removidos. Existe um único processo de demonstração explicitamente fictício para revisão visual.

## Limites da entrega

Não há credenciais WhatsApp/IA reais no ambiente. A integração é Cloud API, sem login por QR Code, sem grupos e sem importação de histórico do aplicativo. O chat mostra até 500 mensagens recentes. Os cenários são roteiros para execução humana, não testes automáticos em um formulário da Aprova; não há integração de publicação na Aprova. Modelos são exemplos, não catálogo normativo. Não foi feito ensaio de carga de 400 processos em uso simultâneo. Não foi produzido vídeo; o roteiro e as capturas estão disponíveis como apoio à demonstração.

O guia de operação está em DEMO_MUNICIPAL.md; as instruções do agente em MUNICIPAL_INSTRUCTIONS.md.
