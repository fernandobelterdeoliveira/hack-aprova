type TicketState={id:string;status:string;currentVersionId:string|null}
export const municipalCaseInclude={select:{id:true,municipality:true,department:true,name:true,ticket:{select:{id:true,status:true,currentVersionId:true}}}} as const
export function municipalCaseProgress(ticket:TicketState|null|undefined){
 if(!ticket)return{status:"open",nextAction:"Receber as informações da secretaria pelo Ticket"}
 const states:Record<string,{status:string;nextAction:string}>={
  approved:{status:"closed",nextAction:"Formulário aprovado; acompanhar novas solicitações no Ticket"},
  awaiting_professional:{status:"active",nextAction:"Testar as alterações e concluir a validação profissional"},
  awaiting_municipality:{status:"pending",nextAction:"Aguardar análise da prefeitura sobre a versão enviada"},
  needs_information:{status:"on-hold",nextAction:"Esclarecer as pendências com a secretaria pelo Ticket"},
  information_received:{status:"open",nextAction:"Completar as regras e gerar o formulário municipal"},
  processing_failed:{status:"on-hold",nextAction:"Conferir a falha e retomar o processamento no Ticket"},
 }
 return states[ticket.status]||{status:"active",nextAction:"Acompanhar a geração e revisão no Ticket"}
}
