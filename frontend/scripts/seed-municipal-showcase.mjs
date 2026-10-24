import assert from "node:assert/strict"
import {mkdir,writeFile} from "node:fs/promises"
import {PrismaClient} from "@prisma/client"
import {initialRules} from "../src/lib/municipal/domain.ts"
import {exampleValues,validateValues} from "../src/lib/municipal/forms.ts"

// Fictional municipalities and staff. No official laws, messages or performance gains are claimed.
const prisma=new PrismaClient(),base=process.env.DEMO_BASE_URL||"http://127.0.0.1:3001"
const prefix="municipal-showcase-v1",workspaceId="default-workspace"
const scenarios=[
 {key:"serra-alvara",municipality:"Prefeitura de Serra Clara",department:"Desenvolvimento Econômico",name:"Alvará de funcionamento",owner:"Marina Costa",analyst:"Carolina Mendes",templateKey:"alvara",stage:"approved",
 rules:["Pessoas físicas e jurídicas podem solicitar o alvará. Nome completo e e-mail são obrigatórios para contato.","Os documentos obrigatórios são CPF ou CNPJ e comprovante de endereço.","A triagem documental deve anteceder a análise da atividade econômica.","Atividades de baixo risco têm dispensa de vistoria prévia; a triagem documental permanece necessária.","O prazo de análise é de 10 dias úteis após a documentação completa.","A secretaria realiza a triagem e a diretora de Desenvolvimento Econômico aprova o pedido."],
 correction:'adicionar campo "Nome do estabelecimento" do tipo texto obrigatório'},
 {key:"serra-obras",municipality:"Prefeitura de Serra Clara",department:"Obras e Urbanismo",name:"Licença para reforma residencial",owner:"Rafael Nogueira",analyst:"Bruno Azevedo",templateKey:"obras",stage:"corrected",
 rules:["Pessoas físicas proprietárias podem solicitar a licença. Nome completo é obrigatório.","Os documentos obrigatórios são CPF, matrícula do imóvel, projeto e responsabilidade técnica.","A equipe técnica deve conferir o projeto e a responsabilidade técnica antes da emissão da licença.","Não há dispensa da responsabilidade técnica neste processo de reforma.","O prazo de análise é de 20 dias úteis após a documentação completa.","A secretaria de Obras realiza a análise técnica e o diretor de Urbanismo aprova o pedido."],
 correction:'adicionar campo "Área da reforma em m²" do tipo número obrigatório; adicionar campo "Inscrição imobiliária" do tipo texto obrigatório'},
 {key:"vale-transporte",municipality:"Prefeitura de Vale das Araucárias",department:"Educação",name:"Cadastro no transporte escolar rural",owner:"Lívia Andrade",analyst:"Helena Duarte",templateKey:"protocolo",stage:"review",
 rules:["Pessoas físicas responsáveis pelo estudante podem solicitar o cadastro. Nome completo é obrigatório.","Os documentos obrigatórios são CPF, documento de identificação e comprovante de endereço.","A equipe deve conferir a matrícula escolar e a disponibilidade de rota rural antes da inclusão.","Não há dispensa da conferência de rota; pedidos fora da área rural recebem orientação para o atendimento da Educação.","O prazo de análise é de 5 dias úteis após a documentação completa.","A secretaria de Educação realiza a triagem e a coordenadora do transporte escolar aprova o cadastro."],
 additions:'adicionar campo "Nome do estudante" do tipo texto obrigatório; adicionar campo "Escola" do tipo texto obrigatório; adicionar campo "Comunidade rural" do tipo texto obrigatório'},
 {key:"rio-sanitaria",municipality:"Prefeitura de Rio Dourado",department:"Saúde e Vigilância Sanitária",name:"Licença sanitária de estabelecimento",owner:"Camila Rocha",analyst:"André Martins",templateKey:"alvara",stage:"clarification",
 rules:["Pessoas jurídicas responsáveis pelo estabelecimento podem solicitar a licença. Nome completo e e-mail são obrigatórios para contato.","Os documentos obrigatórios são CNPJ e comprovante de endereço.","A equipe de vigilância deve conferir o cadastro da atividade antes da vistoria sanitária.","Não há dispensa automática de vistoria sanitária neste processo.","O prazo de análise é de 15 dias úteis após a documentação completa.","A secretaria de Saúde realiza a triagem e o diretor de Vigilância Sanitária aprova a licença."],
 correction:"Ajustar o documento conforme o risco do estabelecimento."},
 {key:"aurora-iptu",municipality:"Prefeitura de Santa Aurora",department:"Fazenda e Tributação",name:"Revisão cadastral de imóvel",owner:"Diego Fernandes",analyst:"Patrícia Lima",templateKey:"protocolo",stage:"review",
 rules:["Pessoas físicas proprietárias podem solicitar a revisão cadastral. Nome completo e e-mail são obrigatórios para contato.","Os documentos obrigatórios são CPF, matrícula do imóvel e comprovante de endereço.","A equipe deve comparar os documentos com o cadastro imobiliário antes de concluir a revisão.","Não há alteração tributária automática; divergências de titularidade são encaminhadas para análise cadastral.","O prazo de análise é de 12 dias úteis após a documentação completa.","A secretaria de Fazenda realiza a análise cadastral e a diretora de Tributação aprova a atualização."],
 additions:'adicionar campo "Inscrição imobiliária" do tipo texto obrigatório; adicionar campo "Descrição da divergência" do tipo texto obrigatório'},
 {key:"aurora-espaco",municipality:"Prefeitura de Santa Aurora",department:"Cultura e Esportes",name:"Reserva de espaço público para evento",owner:"Joana Ribeiro",analyst:"Lucas Teixeira",templateKey:"protocolo",stage:"collection",
 rules:["Pessoas físicas e jurídicas podem solicitar a reserva de espaço público.","Os documentos obrigatórios são CPF ou CNPJ e comprovante de endereço.","A equipe deve conferir a disponibilidade do espaço antes de reservar.","", "", "A secretaria de Cultura recebe o pedido; falta confirmar o responsável pela autorização final."]}
]
async function api(path,data,method="POST",token){const response=await fetch(base+path,{method:data?method:"GET",headers:{Origin:base,"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(60000)});const body=await response.json();if(!response.ok)throw new Error(`${path}: ${JSON.stringify(body)}`);return body}
const command=(ticket,data)=>api(`/api/tickets/${ticket.id}`,data)
async function wait(ticketId,predicate){for(let n=0;n<100;n++){const ticket=await api(`/api/tickets/${ticketId}`);if(ticket.jobs.some(j=>["dead_letter","failed"].includes(j.status)))throw new Error(JSON.stringify(ticket.jobs));if(predicate(ticket)&&!ticket.jobs.some(j=>["queued","running"].includes(j.status)))return ticket;await new Promise(resolve=>setTimeout(resolve,400))}throw new Error(`Timeout: ${ticketId}`)}
function reviewToken(ticket,version){const message=ticket.messages.find(m=>m.formVersionId===version.id&&typeof m.metadata.reviewUrl==="string");assert.ok(message,"Missing review link");return new URL(message.metadata.reviewUrl).hash.slice(1)}
async function backup(){const processes=await prisma.municipalProcess.findMany({where:{workspaceId},include:{ticket:{include:{messages:true,versions:true}}}}),jobs=await prisma.backgroundJob.findMany({where:{workspaceId,type:"MUNICIPAL_TICKET"}});await mkdir("../backups",{recursive:true});const file=`../backups/municipal-showcase-${Date.now()}.json`;await writeFile(file,JSON.stringify({createdAt:new Date().toISOString(),processes,jobs},null,2));return file}
async function main(){
 const backupFile=await backup(),results=[]
 for(const s of scenarios){
  const id=`${prefix}-${s.key}`,sourceId=`${id}-source`,now=new Date().toISOString()
  let process=await prisma.municipalProcess.findUnique({where:{id}})
  if(!process){
   const content=`Cenário de demonstração. Município, pessoas e regras fictícios; não constitui norma municipal.\n\n${s.rules.filter(Boolean).join("\n")}${s.additions?"\n\nCampos adicionais especificados para o cenário:\n"+s.additions:""}`
   const source={id:sourceId,name:`Levantamento de ${s.analyst} · demonstração`,type:"demonstration",content,createdAt:now}
   const rules=initialRules(s.templateKey).map((rule,index)=>({...rule,value:s.rules[index],sourceId:s.rules[index]?sourceId:"",excerpt:s.rules[index],status:s.stage==="collection"?"proposed":"approved",...(s.stage!=="collection"?{approvedBy:"Revisão do cenário de demonstração",approvedAt:now}:{})}))
   process=await prisma.municipalProcess.create({data:{id,workspaceId,municipality:s.municipality,department:s.department,name:s.name,owner:s.owner,templateKey:s.templateKey,status:s.stage==="collection"?"collecting":"validating",sources:[source],rules,history:[{at:now,actor:"Preparação da demonstração",action:"created",details:"Cenário municipal fictício criado com fontes próprias e regras específicas. Métricas não representam atendimento real."}]}})
  }
  if(s.stage!=="collection"&&process.status==="collecting")await prisma.municipalProcess.update({where:{id},data:{status:"validating"}})
  const list=await api(`/api/tickets?process=${id}`),summary=list.tickets.find(t=>t.processId===id)
  let ticket=await api(`/api/tickets/${summary.id}`)
  if(!ticket.messages.some(m=>m.externalKey===`${id}-welcome`))await prisma.municipalTicketMessage.upsert({where:{externalKey:`${id}-welcome`},update:{},create:{workspaceId,ticketId:ticket.id,direction:"system",kind:"event",author:"Sistema",content:"Demonstração municipal: pessoas, prefeitura e regras fictícias. Operações executadas neste ambiente; nenhuma mensagem externa foi enviada.",externalKey:`${id}-welcome`,metadata:{demonstration:true}}})
  if(s.stage==="collection"){
   await prisma.municipalTicketMessage.upsert({where:{externalKey:`${id}-pending`},update:{},create:{workspaceId,ticketId:ticket.id,direction:"sent",kind:"clarification",author:s.owner,content:"Precisamos confirmar o prazo de resposta, as dispensas aplicáveis e quem autoriza a reserva. A geração ficará pendente até completar essas informações.",externalKey:`${id}-pending`,deliveryStatus:"internal",metadata:{demonstration:true}}})
  }else{
   if(!ticket.currentVersionId){await command(ticket,{action:"generate",requestKey:crypto.randomUUID()});ticket=await wait(ticket.id,t=>t.versions.length===1)}
   let version=ticket.versions[0]
   if(s.additions&&version.number===1){
    const {localCorrection}=await import("../src/lib/municipal/forms.ts"),extended=localCorrection(version.definition,s.additions,sourceId)
    assert.deepEqual(extended.blockers,[])
    await command(ticket,{action:"edit",versionId:version.id,definition:extended.definition,content:s.additions,requestKey:crypto.randomUUID()})
    ticket=await wait(ticket.id,t=>t.versions.length===2);version=ticket.versions[0]
   }
   if(s.correction&&version.number===1){await api(`/api/forms/review/${version.id}`,{action:"changes",author:`${s.analyst} · demonstração`,content:s.correction,requestKey:crypto.randomUUID()},"POST",reviewToken(ticket,version));ticket=await wait(ticket.id,t=>t.versions.length===2);version=ticket.versions[0]}
   if(s.stage==="approved"&&version.status!=="approved"){
    if(version.status==="awaiting_municipality"){await api(`/api/forms/review/${version.id}`,{action:"accept",author:`${s.analyst} · demonstração`,requestKey:crypto.randomUUID()},"POST",reviewToken(ticket,version));ticket=await wait(ticket.id,t=>t.versions[0].status==="awaiting_professional");version=ticket.versions[0]}
    assert.equal(validateValues(version.definition,exampleValues(version.definition)).valid,true)
    await command(ticket,{action:"test",versionId:version.id,values:exampleValues(version.definition)})
    await command(ticket,{action:"approve",versionId:version.id})
   }
  }
  ticket=await wait(ticket.id,()=>true)
  const version=ticket.versions[0]
  if(s.stage==="approved")assert.equal(ticket.status,"approved")
  if(s.stage==="corrected"){assert.equal(ticket.status,"awaiting_professional");assert.ok(version.changeSet.length>=2);assert.equal(version.testResults.manual,null)}
  if(s.stage==="clarification"){assert.equal(ticket.status,"needs_information");assert.ok(version.blockers.length)}
  if(s.stage==="review")assert.equal(ticket.status,"awaiting_municipality")
  if(s.stage==="collection")assert.equal(ticket.versions.length,0)
  for(const v of ticket.versions){assert.equal(v.definition.context.processId,id);assert.equal(v.definition.context.municipality,s.municipality);if(!v.blockers.length)assert.equal(validateValues(v.definition,exampleValues(v.definition)).valid,true)}
  assert.ok(ticket.messages.every(m=>!["delivered","read","sent"].includes(m.deliveryStatus)))
  results.push({processId:id,municipality:s.municipality,process:s.name,stage:ticket.status,ticket:`${base}/communications?ticket=${ticket.id}`,form:version?`${base}/communications?ticket=${ticket.id}&form=${version.id}`:null,municipalityView:version?ticket.messages.find(m=>m.formVersionId===version.id&&m.metadata.reviewUrl)?.metadata.reviewUrl:null,versions:ticket.versions.length,fields:version?.definition.fields.length||0})
  console.log(JSON.stringify({municipality:s.municipality,process:s.name,status:ticket.status,versions:ticket.versions.length,fields:version?.definition.fields.length||0}))
 }
 // Replace only the exact old municipal sample after all new scenarios validate.
 const old=await prisma.municipalProcess.findMany({where:{workspaceId,municipality:"DEMONSTRAÇÃO — Município Horizonte",name:"DEMO · Alvará de funcionamento"},include:{ticket:true}})
 for(const p of old){if(!p.sources.every(source=>source.name==="Relato fictício para demonstração — não é norma municipal"))continue;if(p.ticket){assert.equal(await prisma.backgroundJob.count({where:{type:"MUNICIPAL_TICKET",status:{in:["queued","running"]},payload:{path:["ticketId"],equals:p.ticket.id}}}),0);await prisma.backgroundJob.deleteMany({where:{workspaceId,type:"MUNICIPAL_TICKET",payload:{path:["ticketId"],equals:p.ticket.id}}})}await prisma.municipalProcess.delete({where:{id:p.id}})}
 await mkdir("../artifacts",{recursive:true});await writeFile("../artifacts/municipal-showcase.json",JSON.stringify({demonstration:true,backupFile,results},null,2))
 const main=results[0];await writeFile("../artifacts/ticket-demo-links.json",JSON.stringify({ticket:main.ticket,form:main.form,municipality:main.municipalityView},null,2))
 console.log(`PASS: ${results.length} processes, 4 fictional municipalities, isolated context, real workflow checks, no external delivery. Backup: ${backupFile}`)
}
try{await main()}finally{await prisma.$disconnect()}
