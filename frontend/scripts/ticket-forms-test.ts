import assert from "node:assert/strict"
import {PrismaClient} from "@prisma/client"
import {initialRules,propose,type Rule} from "../src/lib/municipal/domain"
import {localDefinition,localCorrection,validateValues,generatedTests,exampleValues,definitionIssues,type FormDefinition} from "../src/lib/municipal/forms"
const prisma=new PrismaClient(),base="http://127.0.0.1:3001",tag=`TICKET-TEST-${crypto.randomUUID()}`,checks:string[]=[],storedIds:string[]=[]
let processId="",ticketId="",foreignId="",accountId="",caseId=""
async function api(route:string,options:RequestInit={},expected=200){const response=await fetch(base+route,{...options,headers:{Origin:base,...options.headers},signal:AbortSignal.timeout(60000)}),text=await response.text();let body;try{body=JSON.parse(text)}catch{body=text}assert.equal(response.status,expected,`${route}: ${JSON.stringify(body).slice(0,500)}`);checks.push(`${options.method||"GET"} ${route} -> ${expected}`);return body}
const post=(route:string,data:unknown,status=200,token?:string)=>api(route,{method:"POST",headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(data)},status)
async function waitFor(predicate:(ticket:any)=>boolean,label:string){const until=Date.now()+50000;let ticket:any;while(Date.now()<until){ticket=await api(`/api/tickets/${ticketId}`);if(predicate(ticket))return ticket;if(ticket.jobs.some((j:any)=>j.status==="dead_letter"))throw new Error(`${label}: ${JSON.stringify(ticket.jobs)}`);await new Promise(r=>setTimeout(r,700))}throw new Error(`${label}: timeout ${JSON.stringify(ticket?.jobs)}`)}
function access(ticket:any,id:string){const message=ticket.messages.find((m:any)=>m.formVersionId===id&&m.content.includes(`/review/${id}#`));assert.ok(message,"Review link must exist");const token=message.content.split(`/review/${id}#`)[1].split(/\s/)[0];return token}
async function main(){try{
 const content="Pessoas físicas e jurídicas podem solicitar o serviço.\nOs documentos obrigatórios são CPF ou CNPJ e comprovante de endereço.\nA vistoria deve ocorrer antes da aprovação.\nAtividades de baixo risco têm dispensa de vistoria.\nO prazo de análise é de 10 dias úteis.\nA secretaria é responsável pela triagem e o diretor aprova o pedido."
 const source={id:`source-${tag}`,name:"Fonte fictícia de teste",content,type:"manual",createdAt:new Date().toISOString()}
 const rules=propose(initialRules("alvara"),source).map(r=>({...r,status:"approved" as const}))
 const process=await prisma.municipalProcess.create({data:{workspaceId:"default-workspace",municipality:tag,department:"Setor de teste",owner:"Responsável de teste",name:"Alvará fictício",templateKey:"alvara",rules:JSON.parse(JSON.stringify(rules)),sources:[source]}});processId=process.id
 const linked=await prisma.case.create({data:{workspaceId:"default-workspace",municipalProcessId:process.id,caseNumber:tag,clientName:tag,caseType:process.name,assignedTo:"Teste",description:"Teste de envio após aprovação",nextAction:"Revisar"}});caseId=linked.id
 const local=localDefinition({...process,rules,sources:[source]});assert.deepEqual(local.blockers,[]);assert.ok(generatedTests(local.definition).passed);assert.ok(!validateValues(local.definition,{}).valid);assert.ok(validateValues(local.definition,exampleValues(local.definition)).valid);assert.ok(validateValues(local.definition,{...exampleValues(local.definition),tipo_pessoa:"juridica",cnpj:"12.ABC.345/01DE-35"}).valid);checks.push("Domain: conditional required fields, numeric/alphanumeric CNPJ and valid fixture")
 const correction=localCorrection(local.definition,'tornar CPF opcional; adicionar campo "E-mail" do tipo email obrigatório',"request-test");assert.deepEqual(correction.blockers,[]);assert.equal(correction.definition.fields.find(f=>f.id==="cpf")!.requiredWhen?.length,0);assert.ok(correction.definition.fields.find(f=>f.label==="E-mail")!.required);assert.ok(localCorrection(local.definition,"deixe o formulário melhor","ambiguous").blockers.length);checks.push("Domain: clear corrections applied, ambiguous request blocked")
 const broken=structuredClone(local.definition);broken.fields[0].visibleWhen=[{field:broken.fields[0].id,operator:"equals",value:"x"}];assert.ok(definitionIssues(broken).length);checks.push("Domain: circular condition rejected")
 const list=await api(`/api/tickets?process=${processId}`);ticketId=list.tickets.find((t:any)=>t.processId===processId).id
 const generate=crypto.randomUUID();await post(`/api/tickets/${ticketId}`,{action:"generate",requestKey:generate},202);await post(`/api/tickets/${ticketId}`,{action:"generate",requestKey:generate},202)
 let ticket=await waitFor(t=>t.versions.length===1&&t.messages.some((m:any)=>m.kind==="form"),"generation"),v1=ticket.versions[0],token1=access(ticket,v1.id)
 assert.equal(v1.status,"awaiting_municipality");assert.equal(ticket.messages.filter((m:any)=>m.kind==="form").length,1);checks.push("Queued generation is idempotent and available for approval in Ticket")
 await api(`/api/forms/review/${v1.id}`,{headers:{Authorization:"Bearer invalid"}},403)
 await api(`/api/forms/review/${v1.id}`,{headers:{Authorization:`Bearer ${token1}`}})
 await post(`/api/tickets/${ticketId}`,{action:"approve",versionId:v1.id},400)
 const responseKey=crypto.randomUUID();await post(`/api/forms/review/${v1.id}`,{action:"accept",author:"Analista teste",requestKey:responseKey},202,token1);await post(`/api/forms/review/${v1.id}`,{action:"accept",author:"Analista teste",requestKey:responseKey},202,token1)
 ticket=await waitFor(t=>t.versions[0].status==="awaiting_professional","municipality acceptance")
 await post(`/api/forms/review/${v1.id}`,{action:"test",author:"Analista teste",requestKey:crypto.randomUUID(),values:exampleValues(v1.definition)},200,token1)
 await post(`/api/tickets/${ticketId}`,{action:"approve",versionId:v1.id},400)
 await post(`/api/tickets/${ticketId}`,{action:"test",versionId:v1.id,values:exampleValues(v1.definition)})
 await post(`/api/tickets/${ticketId}`,{action:"approve",versionId:v1.id})
 const original=JSON.stringify((await prisma.municipalFormVersion.findUniqueOrThrow({where:{id:v1.id}})).definition)
 await post(`/api/forms/review/${v1.id}`,{action:"changes",author:"Analista teste",content:'tornar CPF opcional; adicionar campo "E-mail" do tipo email obrigatório',requestKey:crypto.randomUUID()},202,token1)
 ticket=await waitFor(t=>t.versions.length===2,"automatic correction");let v2=ticket.versions[0];assert.equal(v2.status,"awaiting_professional");assert.ok(v2.changeSet.length>=2);assert.equal(ticket.approvedVersionId,v1.id);assert.equal(JSON.stringify(ticket.versions.find((v:any)=>v.id===v1.id).definition),original);assert.equal(v2.testResults.manual,null);checks.push("Approved version preserved; corrected draft has provenance, differences and invalidated manual tests")
 await post(`/api/tickets/${ticketId}`,{action:"approve",versionId:v2.id},400)
 await post(`/api/forms/review/${v1.id}`,{action:"changes",author:"Analista teste",content:"tornar CPF obrigatório",requestKey:crypto.randomUUID()},409,token1)
 const token2=access(ticket,v2.id);await post(`/api/forms/review/${v2.id}`,{action:"changes",author:"Analista teste",content:"deixe o formulário melhor",requestKey:crypto.randomUUID()},202,token2)
 ticket=await waitFor(t=>t.versions.length===3,"ambiguity");const v3=ticket.versions[0];assert.equal(v3.status,"needs_information");assert.ok(v3.blockers.length);await post(`/api/tickets/${ticketId}`,{action:"approve",versionId:v3.id},400)
 const token3=access(ticket,v3.id);await post(`/api/forms/review/${v3.id}`,{action:"changes",author:"Analista teste",content:"tornar E-mail opcional",resolvePending:true,requestKey:crypto.randomUUID()},202,token3)
 ticket=await waitFor(t=>t.versions.length===4,"clarified correction");const v4=ticket.versions[0];assert.equal(v4.status,"awaiting_professional");assert.equal(v4.blockers.length,0)
 await post(`/api/tickets/${ticketId}`,{action:"test",versionId:v4.id,values:{...exampleValues(v4.definition),cpf:"invalid"}})
 await post(`/api/tickets/${ticketId}`,{action:"approve",versionId:v4.id},400)
 await post(`/api/tickets/${ticketId}`,{action:"test",versionId:v4.id,values:exampleValues(v4.definition)})
 await post(`/api/tickets/${ticketId}`,{action:"approve",versionId:v4.id})
 await post(`/api/tickets/${ticketId}`,{action:"minutes",minutes:9});await post(`/api/tickets/${ticketId}`,{action:"configure",accountId:null,recipient:null,baselineMinutes:30})
 ticket=await api(`/api/tickets/${ticketId}`);assert.equal(ticket.metrics.minutesSpent,9);assert.equal(ticket.metrics.recordedDifference,21);assert.ok(ticket.metrics.minutesToLatestApproval!==null)
 const foreign=await prisma.municipalProcess.create({data:{workspaceId:"foreign-test",municipality:tag,department:"Outro",name:"Outro",owner:"Outro",templateKey:"protocolo"}});foreignId=foreign.id
 await api(`/api/tickets?process=${foreignId}`,{},400)
 const invalid=structuredClone(v4.definition);invalid.context.processId=foreignId;await post(`/api/tickets/${ticketId}`,{action:"edit",versionId:v4.id,definition:invalid,content:"Não permitido",requestKey:crypto.randomUUID()},400)
 const form=new FormData();form.append("file",new Blob(["tornar Comprovante de endereço opcional"],{type:"text/plain"}),"ajuste.txt");form.append("author","Analista teste");form.append("requestKey",crypto.randomUUID())
 const token4=access(ticket,v4.id);await api(`/api/forms/review/${v4.id}/attachment`,{method:"POST",headers:{Authorization:`Bearer ${token4}`},body:form},202)
 ticket=await waitFor(t=>t.versions.length===5,"attachment correction");const v5=ticket.versions[0];assert.equal(v5.status,"awaiting_professional");assert.equal(v5.definition.fields.find((f:any)=>f.id==="comprovante_endereco").required,false)
 const attachment=ticket.messages.find((m:any)=>m.storageId);storedIds.push(attachment.storageId);await api(`/api/tickets/${ticketId}/attachments?message=${attachment.id}`)
 await post(`/api/tickets/${ticketId}`,{action:"send",content:"Mensagem interna de teste",requestKey:crypto.randomUUID()},202)
 ticket=await waitFor(t=>t.messages.some((m:any)=>m.content==="Mensagem interna de teste"&&m.deliveryStatus==="internal"),"honest delivery status");checks.push("No connector configured: available internally, never falsely marked as delivered")
 const edited=structuredClone(v5.definition);edited.fields.find((field:any)=>field.id==="cpf").help="Informe o CPF do solicitante, quando aplicável."
 const edit=await post(`/api/tickets/${ticketId}`,{action:"edit",versionId:v5.id,definition:edited,content:"Ajustar orientação do CPF sem alterar a obrigatoriedade.",requestKey:crypto.randomUUID()});ticket=await api(`/api/tickets/${ticketId}`);const v6=ticket.versions.find((v:any)=>v.id===edit.versionId);assert.equal(v6.status,"awaiting_municipality");assert.equal(v6.generatedBy,"professional-edit");assert.equal(v6.municipalityDecision,null);assert.ok(v6.requestMessageId);assert.equal(ticket.approvedVersionId,v4.id);checks.push("Professional edit creates an auditable draft and does not impersonate municipality acceptance")
 const token6=access(ticket,v6.id);await post(`/api/forms/review/${v6.id}`,{action:"accept",author:"Analista teste",requestKey:crypto.randomUUID()},202,token6);ticket=await waitFor(t=>t.versions[0].status==="awaiting_professional","edited acceptance");await post(`/api/tickets/${ticketId}`,{action:"test",versionId:v6.id,values:exampleValues(v6.definition)});await post(`/api/tickets/${ticketId}`,{action:"approve",versionId:v6.id})
 const suggestion=await prisma.proposedCaseChange.findFirstOrThrow({where:{inboxItem:{detectedCaseId:caseId},payload:{path:["formVersionId"],equals:v6.id},status:"pending"}})
 await api(`/api/inbox/${suggestion.inboxItemId}/review`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"approve",caseId,changeIds:[suggestion.id]})})
 ticket=await waitFor(t=>t.messages.some((m:any)=>m.formVersionId===v6.id&&m.kind==="form"&&m.deliveryStatus==="internal"),"approved share")
 const account=await prisma.connectorAccount.create({data:{workspaceId:"default-workspace",provider:"whatsapp",externalAccountId:`fake-${tag}`,status:"test",displayName:"TESTE SEM ENVIO"}});accountId=account.id
 await post(`/api/tickets/${ticketId}`,{action:"configure",accountId,recipient:"5511999990000"})
 const formMessage=ticket.messages.find((m:any)=>m.formVersionId===v6.id&&m.kind==="form");const failedAttempt=await post(`/api/tickets/${ticketId}`,{action:"retry_delivery",messageId:formMessage.id,requestKey:crypto.randomUUID()},202)
 ticket=await waitFor(t=>t.messages.some((m:any)=>m.id===formMessage.id&&m.deliveryStatus==="failed")&&t.jobs.some((j:any)=>j.id===failedAttempt.jobId&&j.status==="dead_letter"),"visible delivery failure")
 assert.ok(ticket.messages.find((m:any)=>m.id===formMessage.id).errorMessage);assert.equal(ticket.versions.length,6)
 await post(`/api/tickets/${ticketId}`,{action:"configure",accountId:null,recipient:null});await post(`/api/tickets/${ticketId}`,{action:"retry_delivery",messageId:formMessage.id,requestKey:crypto.randomUUID()},202)
 ticket=await waitFor(t=>t.messages.some((m:any)=>m.id===formMessage.id&&m.deliveryStatus==="internal")&&!t.jobs.some((j:any)=>j.id===failedAttempt.jobId&&j.status==="dead_letter"),"delivery resumed without duplication");assert.equal(ticket.versions.length,6);checks.push("Delivery failure is visible; resuming preserves versions and never claims external delivery")
 console.log(JSON.stringify({passed:checks.length,checks},null,2))
 }finally{
  if(ticketId){const messages=await prisma.municipalTicketMessage.findMany({where:{ticketId},select:{storageId:true}});for(const m of messages)if(m.storageId&&!storedIds.includes(m.storageId))storedIds.push(m.storageId)
   await prisma.backgroundJob.updateMany({where:{type:"MUNICIPAL_TICKET",status:"queued",payload:{path:["ticketId"],equals:ticketId}},data:{status:"cancelled"}});for(let i=0;i<30;i++){if(!await prisma.backgroundJob.count({where:{type:"MUNICIPAL_TICKET",status:"running",payload:{path:["ticketId"],equals:ticketId}}}))break;await new Promise(r=>setTimeout(r,200))}await prisma.backgroundJob.deleteMany({where:{type:"MUNICIPAL_TICKET",payload:{path:["ticketId"],equals:ticketId}}})}
  if(accountId){await prisma.outboundMessage.deleteMany({where:{connectorAccountId:accountId}});await prisma.connectorAccount.deleteMany({where:{id:accountId}})}
  if(caseId){await prisma.inboxItem.deleteMany({where:{detectedCaseId:caseId}});await prisma.case.deleteMany({where:{id:caseId}})}
  if(processId)await prisma.municipalProcess.deleteMany({where:{id:processId}})
  if(foreignId)await prisma.municipalProcess.deleteMany({where:{id:foreignId}})
  for(const id of storedIds){const stored=await prisma.storedObject.findUnique({where:{id}});if(stored?.storageProvider==="local"){const {unlink}=await import("node:fs/promises"),path=await import("node:path");const root=path.resolve(process.env.LOCAL_STORAGE_PATH||"data/connector-storage"),target=path.resolve(root,stored.storageKey);if(target.startsWith(root+path.sep))await unlink(target).catch(()=>{})}await prisma.storedObject.deleteMany({where:{id}})}
  await prisma.$disconnect()
 }
}
main().catch(e=>{console.error(e);process.exitCode=1})
