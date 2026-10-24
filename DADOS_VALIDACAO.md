# Dados prontos para validar o Hack Aprova

A base local contém **oito processos em quatro prefeituras fictícias**, todos vinculados a Municípios, Caixa de entrada e Ticket. Há dois percursos de alvará: um para executar o teste e outro já concluído pelas APIs como referência. Regras, nomes e documentos são exemplos sem validade normativa. Não houve envio externo nem ganho de produtividade presumido.

## Comece aqui

- **Municípios:** http://127.0.0.1:3001/cases
- **Caixa de entrada municipal:** http://127.0.0.1:3001/inbox
- **Teste aberto:** http://127.0.0.1:3001/communications?process=municipal-showcase-v1-validacao-inicial
- **Referência aprovada:** http://127.0.0.1:3001/communications?process=municipal-showcase-v1-validacao-referencia
- **Conhecimento da referência:** http://127.0.0.1:3001/cases/municipal-case-validacao-referencia

“Casos” passou a se chamar “Municípios” na navegação. Cada registro municipal corresponde a um processo e à sua prefeitura, com vínculo explícito ao Ticket. Os itens “Implantação municipal” e “Fila de revisão” foram retirados do menu; as rotas de regras e validação continuam disponíveis aos fluxos existentes.

## O que está preparado

| Prefeitura fictícia | Processo | Estado preparado |
| --- | --- | --- |
| Serra Clara | TESTAR · Alvará — coleta e correção | Sem respostas, com cinco perguntas abertas e seis dimensões a coletar |
| Serra Clara | REFERÊNCIA · Alvará — correção aprovada | Respostas coletadas pelas APIs; sete versões; correção condicional; teste e aprovação registrados |
| Serra Clara | Alvará de funcionamento | Exemplo aprovado, com versões anteriores preservadas |
| Serra Clara | Licença para reforma residencial | Correção aplicada, aguardando teste e validação profissional |
| Vale das Araucárias | Cadastro no transporte escolar rural | Formulário disponível para análise da prefeitura |
| Rio Dourado | Licença sanitária de estabelecimento | Pedido ambíguo, com esclarecimento pendente |
| Santa Aurora | Revisão cadastral de imóvel | Formulário disponível para análise da prefeitura |
| Santa Aurora | Reserva de espaço público para evento | Coleta incompleta, sem formulário aprovado |

A referência é produzida pelo fluxo de perguntas, respostas, geração, solicitação de alteração, teste e aprovação das APIs. Não é um registro com `approved` inserido diretamente no banco. Os seis exemplos anteriores preservam sua identificação de demonstração.

## Roteiro de validação manual

Use o percurso **TESTAR**, deixando a referência aprovada como comparação.

1. Abra o Ticket de teste. Confira a prefeitura, o setor, o processo e as perguntas. Ainda não há formulário aprovado nem regras presumidas a partir de outra prefeitura.
2. Para usar o chat existente, selecione **Registrar informação recebida** e cole o conteúdo de `frontend/fixtures/municipal-validation/01-resposta-analista.txt`. Também é possível anexar esse arquivo. Para testar as perguntas individualmente pela API, use os conteúdos de `cenario.json` com `POST /api/municipal/{id}/answers`, conforme `MVP_BACKEND_API.md`.
3. Aguarde o worker. O contexto deverá apresentar informações sobre solicitantes, documentos, condições, exceções, prazo e responsáveis. A geração disponibiliza uma nova versão preenchível. A informação e suas fontes aparecem também na área do município e na Caixa de entrada.
4. Abra o formulário. Para pessoa física, confira CPF; para pessoa jurídica, confira CNPJ. O comprovante de endereço é obrigatório inicialmente. Não aprove esta versão só porque ela foi gerada.
5. No Ticket, selecione **Registrar ajuste solicitado para vN** e envie o texto de `02-pedido-de-correcao.txt`: “O comprovante de endereço não precisa ser obrigatório para pessoa jurídica”.
6. Confira a nova versão e as diferenças. O comprovante deve continuar obrigatório para pessoa física e passar a opcional para pessoa jurídica. A versão anterior permanece preservada; a exceção fica rastreável na definição e na visão consolidada do município.
7. Execute o teste de preenchimento da nova versão com pessoa jurídica e CNPJ de teste `11222333000181`, sem comprovante. Esse preenchimento deve passar. Pessoa física sem comprovante e CNPJ `123` devem falhar. Use `valores-de-teste.json` como referência.
8. Depois do teste válido, o profissional pode aprovar a versão. A aprovação sem teste deve ser rejeitada. O status e a próxima ação do município acompanham o Ticket.
9. Teste opcional: envie `03-pedido-ambiguo.txt` como pedido de ajuste. Deve surgir pendência, sem aplicação arbitrária de mudanças nem substituição silenciosa da versão aprovada.

Ao receber novas respostas e revisões, o worker sincroniza o contexto dos registros municipais vinculados: mensagens na Caixa de entrada, fatos com origem, documentos, histórico, pendências e próxima ação. Revisões de formulário ainda não aprovadas não substituem o conhecimento da versão aprovada na visão consolidada. Os detalhes da proposta continuam no Ticket.

## Arquivos de teste

Pasta versionada: `frontend/fixtures/municipal-validation/`.

- `01-resposta-analista.txt`: resposta completa para o fluxo pelo chat.
- `02-pedido-de-correcao.txt`: alteração condicional reconhecida pelo modo local.
- `03-pedido-ambiguo.txt`: solicitação que deve exigir esclarecimento.
- `comprovante-ficticio.txt`: arquivo real para testar seleção/anexo, sem validade documental.
- `valores-de-teste.json`: preenchimentos e resultado esperado por tipo de pessoa.
- `cenario.json`: respostas por categoria, autor fictício e critérios da demonstração.

Não use o exemplo de dispensa de vistoria como prova de interpretação local irrestrita de regras. O caso executável validado aqui é a dispensa do comprovante por tipo de pessoa. Pedidos fora do repertório suportado precisam ser esclarecidos ou tratados pela IA configurada, sempre com revisão profissional.

## Preparar novamente

Com aplicação, banco e worker em execução, na pasta `frontend`:

```powershell
npm run seed:municipal-showcase
npm run seed:municipal-validation
npm run seed:municipal-cases
```

As migrações e o Prisma Client precisam estar atualizados conforme as instruções normais do projeto. Os comandos reutilizam os registros existentes e preservam o progresso do teste; não reiniciam silenciosamente o que você respondeu ou aprovou.

Para começar outra rodada sem apagar o histórico:

```powershell
npm run seed:municipal-validation -- --new-round
npm run seed:municipal-cases
```

Os novos links são impressos no terminal e ficam em `artifacts/municipal-validation.json`. O arquivo aponta para a rodada mais recente. Rodadas adicionais aumentam a quantidade de registros; as oito linhas da tabela correspondem à preparação inicial.

## Preservação e limites

Os cinco casos antigos e suas 59 entradas foram movidos para o workspace `legacy-before-municipal-showcase`, com seus IDs e relações preservados. Os anexos e históricos não foram apagados. Há um backup SQL anterior à preparação em `backups/before-validation-data-*.sql` e manifestos do arquivamento em `backups/municipal-cases-manifest-*.json`. Esses arquivos locais não entram no Git.

A base nova não inventa entregas de WhatsApp nem resultados reais de clientes. O banco e o worker são obrigatórios. A demonstração de texto funciona no modo local sem credenciais; Gemini exige a chave configurada e não foi validado com credenciais reais neste teste. Publicação na Aprova não faz parte deste roteiro.
