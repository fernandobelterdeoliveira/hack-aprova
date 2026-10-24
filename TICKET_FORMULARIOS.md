# Ticket e formulários municipais

Implementação do escopo aprovado em 24/10/2026. O módulo Comunicação passou a representar o Ticket, mantendo a disposição do chat em duas colunas. Outros Canais foi removido; históricos e anexos anteriores continuam acessíveis em Histórico preservado. Os conectores e suas configurações ficam no próprio Ticket. Os retornos de login dos provedores agora voltam para esse módulo.

## Como usar

1. Cadastre ou selecione a prefeitura, secretaria, processo e responsável em Implantação municipal. Reutilize suas fontes e regras existentes; os modelos iniciais continuam demonstrativos.
2. Abra Ticket e selecione o processo. Registre informações recebidas ou anexe documentos. Atualizações de fontes e regras também disparam a geração pela fila existente.
3. O sistema gera uma definição estruturada com campos, tipos, obrigatoriedade, condições, documentos e orientações provenientes do contexto. Se faltarem dados ou houver conflito, o Ticket registra perguntas e bloqueia o envio do formulário inconsistente.
4. Uma versão consistente fica disponível automaticamente no Ticket com acesso à prévia preenchível e à visão da prefeitura. Se houver conector e destinatário configurados, o sistema tenta a entrega externa e registra seu resultado separadamente.
5. A prefeitura usa o link para testar o formulário, aceitar a versão ou solicitar alterações por texto ou anexo. Também pode responder pelo conector usando o código indicado, ou citar a mensagem original no WhatsApp. A resposta é vinculada ao Ticket e à versão correspondente.
6. Alterações claras criam uma nova versão de rascunho com diferenças, origem, autor e data. Solicitações ambíguas ficam pendentes e geram perguntas. Uma versão já aprovada não é sobrescrita: continua identificada como aprovada vigente até a aprovação de outra.
7. O profissional abre a versão atual, testa o preenchimento e aprova, edita ou devolve para esclarecimento. Edição manual cria outra versão com justificativa. A aprovação final exige revisão da prefeitura ou correção solicitada por ela, ausência de pendências e teste válido registrado pelo profissional na mesma versão.

O formulário pode ser preenchido inclusive quando aprovado ou histórico; nesses casos, o teste local não modifica a aprovação nem os testes oficiais daquela versão. O botão Baixar definição exporta seu JSON versionado. Esse fluxo não protocola pedidos nem publica diretamente na Aprova.

## Modos da caixa de mensagem

- Enviar mensagem à prefeitura: registra a mensagem de saída e utiliza o conector configurado. Sem conector, permanece disponível apenas no Ticket.
- Registrar informação recebida: incorpora a informação ao contexto deste processo e gera ou atualiza o rascunho.
- Registrar ajuste solicitado: associa a alteração à versão atual, preservando a identificação do profissional que registrou a solicitação.

Exemplos de correções interpretadas pelo modo local:

- tornar CPF opcional
- adicionar campo "E-mail" do tipo email obrigatório
- alterar rótulo de "E-mail" para "E-mail do responsável"
- remover campo "E-mail"
- mostrar campo "CPF" somente quando "Tipo de pessoa" for "Pessoa física"
- exigir campo "Comprovante de endereço" quando "Tipo de pessoa" for "Pessoa jurídica"
- alterar prazo de análise para 15 dias úteis

Comandos podem ser separados por ponto e vírgula ou por linha. O modo local pede esclarecimento quando não consegue interpretar o pedido. Com GOOGLE_API_KEY configurada no backend, o agente existente pode interpretar descrições mais livres, sempre com validação da estrutura e da origem. As instruções estão em MUNICIPAL_FORM_INSTRUCTIONS.md. A integração com IA real não foi validada por ausência de credencial.

## Configuração e entrega externa

No Ticket, abra Conectores. Reutilize as contas Google, Microsoft ou WhatsApp já configuradas. Para cada Ticket, escolha a conta de saída e o destinatário em Entrega e indicadores. O responsável continua associado ao processo.

Informe um endereço HTTPS público de revisão para que a prefeitura consiga abrir os links fora deste computador. Esse endereço também pode ser configurado em TICKET_PUBLIC_BASE_URL. Sem configuração externa, os links locais servem à demonstração e à revisão interna; não são tratados como entregues à prefeitura. Links de revisão são privados e expiram após sete dias. Gere nova versão para obter um novo link.

Falhas de geração, extração e envio aparecem no Ticket e nas tarefas. Retomar repete a operação com controle de duplicação. Falhas de entrega não provocam uma nova versão do formulário. Se um envio anterior estiver sem confirmação, confira o provedor antes de solicitar reenvio.

Quando o mesmo contato atende vários processos ou prefeituras, o sistema exige um vínculo inequívoco de versão, como código, resposta citada ou link. Não associa informações a uma prefeitura por suposição.

A integração WhatsApp permanece a Cloud API existente; não foi adicionado QR Code, espelhamento do histórico pessoal ou grupos. Mensagens livres respeitam a janela de atendimento; templates fora dela não foram implementados.

## Documentos e validações

O armazenamento e o extrator anteriores foram reutilizados. Arquivos originais ficam preservados no Ticket. Texto, PDF com texto, Word e planilhas usam o extrator local; imagens dependem de OCR disponível e áudio depende de IA configurada. Falhas não são interpretadas como extração concluída. Arquivos de até 10 MB podem ser anexados ao fluxo.

A prévia possui validações executáveis para obrigatoriedade, condições, tipos, opções, limites de texto e número, data, e-mail, CPF/CNPJ e metadados de arquivos. Os dados fictícios do botão de teste não representam uma solicitação real. A referência técnica do CNPJ está no [manual da Receita Federal](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/cnpj/manual-dv-cnpj.pdf).

## Indicadores

Em Entrega e indicadores, registre minutos de trabalho e uma linha de base real. O sistema registra rodadas de esclarecimento, tempo de geração até aprovação de cada versão e duração total do ciclo do Ticket. A diferença em relação à linha de base é um cálculo sobre os registros, não uma comprovação de ganho. Alterar apenas o tempo registrado não invalida um formulário cujas regras permaneceram iguais.

## Operação e verificação

Execute Start-LexiLoop.ps1 na pasta do projeto. Ele liga o banco, o backend, o frontend e um worker dedicado ao Ticket. A fila reutiliza os mecanismos existentes de deduplicação, tentativas e recuperação. O worker dedicado não processa tarefas jurídicas antigas.

Endereços locais: Ticket em http://127.0.0.1:3001/communications, contexto municipal em http://127.0.0.1:3001/municipal e backend na porta 8000.

Suítes executadas:

- scripts/ticket-forms-test.ts: geração, análise, correções, anexos, aprovação, edição profissional, testes invalidados e falha/retomada de entrega.
- scripts/ticket-routing-test.ts: informações faltantes, contexto entre prefeituras, respostas citadas, duplicação e registro de tempo sem invalidar regras.
- scripts/municipal-smoke-test.mjs: regressão das funções municipais anteriores.
- scripts/municipal-whatsapp-test.ts: compatibilidade com confirmações e status de WhatsApp existentes.
- TypeScript, ESLint dos arquivos alterados e compilação Python.

Os testes usam registros temporários e não enviam mensagens externas. A comparação de IDs com o backup não encontrou registros originais ausentes nas tabelas verificadas de casos, mensagens, arquivos, perfis e conectores. O backup anterior está indicado em ticket-backup-path.txt. Capturas e relatórios ficam em artifacts.

A demonstração existente ganhou um formulário real preenchível, identificado como fictício, aguardando análise da prefeitura. Não foi feito ensaio de carga de 400 usuários simultâneos, deploy público, teste com credenciais reais dos provedores nem integração de publicação na Aprova.
