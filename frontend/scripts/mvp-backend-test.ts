import assert from "node:assert/strict"
import {PrismaClient} from "@prisma/client"
import {exampleValues,validateValues,localCorrection,localDefinition,type FormDefinition,type FormField} from "../src/lib/municipal/forms"
import {collectionGaps,interpretCollectionAnswer} from "../src/lib/municipal/collection-domain"
type Question={id:string;category:string;text:string}
type TestMessage={id:string;metadata:Record<string,unknown>}
type TestVersion={id:string;status:string;isDraft:boolean;definition:FormDefinition;blockers:string[];testResults:{manual:unknown};changeSet:Array<{path:string}>}
type TestTicket={status:string;approvedVersionId:string|null;jobs:Array<{status:string}>;messages:TestMessage[];versions:TestVersion[]}
const db=new PrismaClient(),base="http://127.0.0.1:3001",tag=`MVP-${crypto.randomUUID()}`,owned:string[]=[],checks:string[]=[]
let ticketId="",municipalCaseId=""
async function api(path:string,data?:unknown,expected:number|number[]=200,headers:Record<string,string>={}){
 const response=await fetch(base+path,{method:data?"POST":"GET",headers:{Origin:base,"Content-Type":"application/json",...headers},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(60000)}),body=await response.json()
 assert.ok((Array.isArray(expected)?expected:[expected]).includes(response.status),`${path} -> ${response.status}: ${JSON.stringify(body).slice(0,500)}`);return body
}
async function wait(predicate:(t:TestTicket)=>boolean){for(let n=0;n<120;n++){const t=await api(`/api/tickets/${ticketId}`);if(t.jobs.some((j:{status:string})=>["failed","dead_letter"].includes(j.status)))throw new Error(JSON.stringify(t.jobs));if(predicate(t)&&!t.jobs.some((j:{status:string})=>["queued","running"].includes(j.status)))return t;await new Promise(r=>setTimeout(r,350))}throw new Error("Worker timeout")}
async function main(){try{
 const process=await api("/api/municipal",{municipality:`Prefeitura fictícia ${tag}`,department:"Desenvolvimento Econômico",name:"Solicitação de Alvará",templateKey:"alvara",owner:"Implantador de teste"},201);owned.push(process.id)
 const municipalCase=await db.case.create({data:{workspaceId:"default-workspace",municipalProcessId:process.id,caseNumber:`MUNICIPAL-${tag}`,clientName:process.municipality,caseType:process.name,assignedTo:"Implantador de teste",description:"Contexto municipal fictício para verificar projeção de regras e mensagens.",nextAction:"Coletar regras"}});municipalCaseId=municipalCase.id
 const path=`/api/municipal/${process.id}`
 let context=await api(path+"/context");assert.equal(context.known.length,0);assert.equal(context.missing.length,6)
 await api(path+"/questions",{},403,{Origin:"https://origem-estranha.invalid"})
 const first=await api(path+"/questions",{});ticketId=first.ticketId;assert.equal(first.questions.length,5)
 const again=await api(path+"/questions",{});assert.deepEqual(again.questions.map((q:Question)=>q.id),first.questions.map((q:Question)=>q.id));checks.push("Five questions maximum, Ticket persistence, idempotent generation and origin check")
 // Suggested content is reviewed in Ticket before becoming a chat message.
 const questionMessage=await db.municipalTicketMessage.findUniqueOrThrow({where:{id:first.questions[0].id}})
 assert.equal(questionMessage.deliveryStatus,"awaiting_approval")
 async function approveInbox(inboxId:string,ids:string[]){const response=await fetch(base+`/api/inbox/${inboxId}/review`,{method:"PATCH",headers:{Origin:base,"Content-Type":"application/json"},body:JSON.stringify({action:"approve",caseId:municipalCaseId,changeIds:ids})});const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body}
 const proposal=await db.proposedCaseChange.findUniqueOrThrow({where:{id:`municipal-send-${questionMessage.id}`}})
 assert.equal((await approveInbox(proposal.inboxItemId,[proposal.id])).sentToChat,1)
 await wait(()=>true)
 assert.equal((await db.municipalTicketMessage.findUniqueOrThrow({where:{id:questionMessage.id}})).deliveryStatus,"internal")
 assert.equal((await approveInbox(proposal.inboxItemId,[proposal.id])).sentToChat,0)
 checks.push("Suggested questions stay hidden until approved; approval publishes to chat once without claiming external delivery")
 const other=await api("/api/municipal",{municipality:`Outro município ${tag}`,department:"Obras",name:"Outra solicitação",templateKey:"obras",owner:"Outro responsável"},201);owned.push(other.id)
 await api(`/api/municipal/${other.id}/questions`,{})
 await api(`/api/municipal/${other.id}/answers`,{questionId:first.questions[0].id,content:"CPF",author:"Analista fictício",requestKey:crypto.randomUUID()},404)
 const foreign=await db.municipalProcess.create({data:{workspaceId:`foreign-${tag}`,municipality:"Prefeitura de outro workspace",department:"Outro setor",name:"Outro processo",owner:"Outro responsável",templateKey:"protocolo"}});owned.push(foreign.id)
 await api(`/api/municipal/${foreign.id}/context`,undefined,404);await api(`/api/municipal/${foreign.id}/questions`,{},404)
 const before=await db.outboundMessage.count()
 async function answer(question:Question,content:string){const request={questionId:question.id,content,author:"Analista municipal fictício",requestKey:crypto.randomUUID()};const result=await api(path+"/answers",request,[200,202]);await wait(t=>t.messages.some((m:TestMessage)=>m.id===result.messageId&&m.metadata.processed));return request}
 const doc=first.questions.find((q:Question)=>q.category==="documents")
 await answer(doc,"Talvez CPF, depende do caso.")
 let t=await api(`/api/tickets/${ticketId}`);assert.equal(t.status,"needs_information");assert.ok(t.versions[0].blockers.length)
 let questions=await api(path+"/questions",{});const clarifyDoc=questions.questions.find((q:Question)=>q.category==="documents");assert.notEqual(clarifyDoc.id,doc.id)
 const answered=await answer(clarifyDoc,"CPF, comprovante de endereço e, para empresas, CNPJ.")
 context=await api(path+"/context");assert.ok(context.known.some((r:{category:string})=>r.category==="documents"));assert.ok(!context.missing.some((r:{category:string})=>r.category==="documents"));checks.push("Ambiguous answers stay pending; clarification becomes sourced business context")
 for(const [category,content] of [["eligibility","Pessoas físicas e jurídicas podem solicitar o serviço."],["conditions","A conferência documental deve ocorrer antes da aprovação."],["exceptions","Não há outras dispensas ou exceções neste processo."]])await answer(first.questions.find((q:Question)=>q.category===category),content)
 await answer(first.questions.find((q:Question)=>q.category==="deadlines"),"10 dias")
 questions=await api(path+"/questions",{});assert.ok(!questions.questions.some((q:Question)=>q.category==="documents"));assert.ok(questions.questions.length<=5)
 await answer(questions.questions.find((q:Question)=>q.category==="deadlines"),"10 dias úteis")
 await answer(questions.questions.find((q:Question)=>q.category==="responsibility"),"A secretaria faz a triagem e o diretor aprova o pedido.")
 context=await api(path+"/context");assert.equal(context.missing.length,0);assert.equal(context.known.length,6);assert.equal((await api(path+"/questions",{})).questions.length,0);assert.equal((await api(`/api/municipal/${other.id}/context`)).known.length,0)
 t=await api(`/api/tickets/${ticketId}`);let current=t.versions[0];assert.equal(current.status,"awaiting_municipality");assert.equal(current.isDraft,true);assert.ok(current.definition.fields.some((f:FormField)=>f.id==="tipo_pessoa"));assert.ok(current.definition.fields.some((f:FormField)=>f.id==="cnpj"));checks.push("Complete scoped answers generate a fillable draft; answered questions do not recur")
 const formMessage=await db.municipalTicketMessage.findFirstOrThrow({where:{ticketId,formVersionId:current.id,kind:"form"}})
 assert.equal(formMessage.deliveryStatus,"awaiting_approval")
 const formProposal=await db.proposedCaseChange.findUniqueOrThrow({where:{id:`municipal-send-${formMessage.id}`}})
 assert.equal((await approveInbox(formProposal.inboxItemId,[formProposal.id])).sentToChat,1)
 await wait(()=>true)
 assert.equal((await db.municipalTicketMessage.findUniqueOrThrow({where:{id:formMessage.id}})).deliveryStatus,"internal")
 // A normal reviewed fact is saved without generating any outbound message.
 const dataInbox=await db.inboxItem.create({data:{workspaceId:"default-workspace",sourceType:"manual",receivedAt:new Date(),rawContent:"Dado fictício para salvar",contentHash:crypto.randomUUID(),detectedCaseId:municipalCaseId,processingStatus:"completed",reviewStatus:"ready"}})
 const run=await db.inboxProcessingRun.create({data:{inboxItemId:dataInbox.id,model:"test",promptVersion:"test",extractorVersion:"test",processingVersion:"test",status:"completed"}})
 const fact=await db.proposedCaseChange.create({data:{inboxItemId:dataInbox.id,caseId:municipalCaseId,type:"FACT",fingerprint:crypto.randomUUID(),processingRunId:run.id,confidence:1,riskLevel:"low",sourceId:dataInbox.id,sourceType:"manual",sourceExcerpt:dataInbox.rawContent,payload:{fieldName:"Dado aprovado sem envio",value:{display:"Informação fictícia",status:"confirmed"}}}})
 const messagesBefore=await db.municipalTicketMessage.count({where:{ticketId}})
 assert.equal((await approveInbox(dataInbox.id,[fact.id])).sentToChat,0)
 assert.equal(await db.caseFact.count({where:{caseId:municipalCaseId,fieldName:"Dado aprovado sem envio"}}),1)
 assert.equal(await db.municipalTicketMessage.count({where:{ticketId}}),messagesBefore)
 checks.push("Approving a form suggestion shares the version; approving a fact saves data without a chat message")
 const count=t.versions.length,sourceCount=context.sources.length
 const retry=await api(path+"/answers",answered,200);assert.equal(retry.deduplicated,true);await wait(()=>true);assert.equal((await api(`/api/tickets/${ticketId}`)).versions.length,count);assert.equal((await api(path+"/context")).sources.length,sourceCount)
 await api(path+"/answers",{...answered,content:"Outro conteúdo"},409)
 const generated=await api(`/api/tickets/${ticketId}`,{action:"generate",requestKey:crypto.randomUUID()},202);assert.ok(generated.jobId);t=await wait((ticket:TestTicket)=>ticket.versions.length===count+1);current=t.versions[0]
 const original=JSON.stringify(current.definition),oldId=current.id
 const correction={action:"message",versionId:oldId,decision:"changes",content:"O comprovante de endereço não precisa ser obrigatório para pessoa jurídica",requestKey:crypto.randomUUID()}
 await api(`/api/tickets/${ticketId}`,correction,202);await api(`/api/tickets/${ticketId}`,correction,202)
 t=await wait((ticket:TestTicket)=>ticket.versions.length===count+2);const changed=t.versions[0],field=changed.definition.fields.find((f:FormField)=>f.id==="comprovante_endereco")
 assert.ok((await api(`/api/cases/${municipalCaseId}`)).stats.pendingReviews>=1)
 assert.equal(changed.status,"awaiting_professional");assert.equal(changed.isDraft,true);assert.equal(field.required,false);assert.deepEqual(field.requiredWhen,[{field:"tipo_pessoa",operator:"equals",value:"fisica"}]);assert.equal(JSON.stringify(t.versions.find((v:TestVersion)=>v.id===oldId).definition),original);assert.equal(changed.testResults.manual,null);assert.ok(changed.changeSet.some((c:{path:string})=>c.path==="fields.comprovante_endereco"));assert.ok(changed.definition.sections.some((section:{text:string})=>section.text.includes("Exceção solicitada para revisão")))
 const physical={...exampleValues(changed.definition),tipo_pessoa:"fisica",comprovante_endereco:[]},legal={...physical,tipo_pessoa:"juridica"}
 assert.equal(validateValues(changed.definition,physical).valid,false);assert.equal(validateValues(changed.definition,legal).valid,true);assert.equal(validateValues(changed.definition,{...legal,cnpj:"123"}).valid,false)
 assert.deepEqual(localCorrection(changed.definition,"Ajuste conforme necessário","ambiguous").definition.fields,changed.definition.fields)
 assert.ok(localCorrection(changed.definition,"Ajuste conforme necessário","ambiguous").blockers.length)
 checks.push("Natural language conditional correction, idempotency, immutable previous version, CNPJ/CPF validation and test invalidation")
 await api(`/api/tickets/${ticketId}`,{action:"approve",versionId:changed.id},400)
 const tested=await api(`/api/tickets/${ticketId}`,{action:"test",versionId:changed.id,values:legal});assert.equal(tested.valid,true)
 await api(`/api/tickets/${ticketId}`,{action:"approve",versionId:changed.id});t=await api(`/api/tickets/${ticketId}`);assert.equal(t.status,"approved");assert.equal(t.approvedVersionId,changed.id);assert.equal(t.versions[0].isDraft,false)
 const caseView=await api(`/api/cases/${municipalCaseId}`);assert.equal(caseView.case.status,"closed");assert.equal(caseView.facts.length,7);assert.ok(!caseView.primaryData.client.some((field:{label:string})=>field.label==="Data de nascimento"));assert.ok(caseView.facts.some((fact:{value:string})=>fact.value.includes("Exceção solicitada para revisão")))
 const inputRows=await db.inboxItem.findMany({where:{detectedCaseId:municipalCaseId}});assert.ok(inputRows.length>=6);assert.ok(inputRows.every(row=>row.workspaceId==="default-workspace"))
 const auditBefore=await db.caseDataChange.count({where:{caseId:municipalCaseId}})

 await api(`/api/tickets/${ticketId}`,{action:"message",versionId:oldId,decision:"changes",content:"tornar CPF obrigatório",requestKey:crypto.randomUUID()},400)
 await api(`/api/tickets/${ticketId}`,{action:"message",versionId:changed.id,decision:"changes",content:"Melhore o formulário conforme necessário",requestKey:crypto.randomUUID()},202)
 t=await wait((ticket:TestTicket)=>ticket.versions.length===count+3);assert.equal(t.versions[0].status,"needs_information");assert.equal(t.approvedVersionId,changed.id);assert.deepEqual(t.versions[0].definition.fields,changed.definition.fields);assert.equal(await db.outboundMessage.count(),before);assert.equal((await api(`/api/cases/${municipalCaseId}`)).case.status,"on-hold");assert.ok((await api(`/api/cases/${municipalCaseId}`)).facts.some((fact:{value:string;status:string})=>fact.value.includes("Exceção solicitada para revisão")&&fact.status==="confirmed"));assert.equal(await db.caseDataChange.count({where:{caseId:municipalCaseId}}),auditBefore)
 for(const v of t.versions){assert.equal(v.definition.context.processId,process.id);const sources=new Set([...context.sources.map((s:{id:string})=>s.id),...t.messages.map((m:TestMessage)=>m.id)]);for(const f of v.definition.fields)for(const proof of f.evidence)assert.ok(sources.has(proof.sourceId))}
 checks.push("Final professional approval requires a valid test; ambiguous/stale requests cannot replace the approved form; no external messages")
 const sample=localDefinition({id:"sample",name:"Teste",municipality:"Fictícia",department:"Teste",owner:"Teste",rules:[],sources:[]});assert.ok(sample.blockers.length)
 assert.equal(interpretCollectionAnswer("deadlines","10 dias").value,null);assert.equal(collectionGaps([],[]).length,6)
 assert.equal(interpretCollectionAnswer("documents","CPF e comprovante de endereço opcionais").value,null);assert.equal(interpretCollectionAnswer("eligibility","Pessoa física não pode, apenas jurídica").value,null)
 checks.push("Negated eligibility and ambiguous document optionality require clarification instead of invented requirements")
 console.log(JSON.stringify({passed:checks.length,checks},null,2))
 }finally{
  for(const id of owned){const ticket=await db.municipalTicket.findUnique({where:{processId:id}});if(ticket){const where={type:"MUNICIPAL_TICKET",payload:{path:["ticketId"],equals:ticket.id}};await db.backgroundJob.updateMany({where:{...where,status:"queued"},data:{status:"cancelled"}});for(let n=0;n<60;n++){if(!await db.backgroundJob.count({where:{...where,status:"running"}}))break;await new Promise(r=>setTimeout(r,250))}assert.equal(await db.backgroundJob.count({where:{...where,status:"running"}}),0);await db.backgroundJob.deleteMany({where})}await db.municipalProcess.deleteMany({where:{id}})}
  if(municipalCaseId){await db.inboxItem.deleteMany({where:{detectedCaseId:municipalCaseId}});await db.case.deleteMany({where:{id:municipalCaseId}})}
  await db.$disconnect()
 }
}
main().catch(e=>{console.error(e);process.exitCode=1})
