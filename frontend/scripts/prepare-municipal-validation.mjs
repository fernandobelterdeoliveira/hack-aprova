import assert from "node:assert/strict"
import {readFile,mkdir,writeFile} from "node:fs/promises"
import {PrismaClient} from "@prisma/client"
import {initialRules} from "../src/lib/municipal/domain.ts"
import {exampleValues,validateValues} from "../src/lib/municipal/forms.ts"
const db=new PrismaClient(),base=process.env.DEMO_BASE_URL||"http://127.0.0.1:3001",fixture=JSON.parse(await readFile("fixtures/municipal-validation/cenario.json","utf-8")),suffix=process.argv.includes("--new-round")?`-${Date.now()}`:""
async function api(path,data,expected=[200,201,202]){const r=await fetch(base+path,{method:data?"POST":"GET",headers:{Origin:base,"Content-Type":"application/json"},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(60000)}),body=await r.json();assert.ok(expected.includes(r.status),`${path}: ${r.status} ${JSON.stringify(body)}`);return body}
async function wait(id,predicate){for(let n=0;n<150;n++){const t=await api(`/api/tickets/${id}`);if(t.jobs.some(j=>["failed","dead_letter"].includes(j.status)))throw new Error(JSON.stringify(t.jobs));if(predicate(t)&&!t.jobs.some(j=>["queued","running"].includes(j.status)))return t;await new Promise(r=>setTimeout(r,400))}throw new Error("Worker não concluiu a preparação.")}
async function create(key,name){const id=`municipal-showcase-v1-${key}${suffix}`,source={id:`${id}-context`,name:"Contexto do cenário de demonstração",type:"demonstration",content:"Cenário fictício para testar a coleta de regras municipais. As respostas do analista ainda não foram fornecidas. Nenhuma regra de outro município deve ser presumida.",createdAt:new Date().toISOString()};await db.municipalProcess.upsert({where:{id},update:{},create:{id,workspaceId:"default-workspace",municipality:fixture.municipality,department:fixture.department,name,owner:fixture.owner,templateKey:"alvara",rules:initialRules("alvara"),sources:[source],history:[{at:new Date().toISOString(),actor:"Preparação da validação",action:"created",details:"Cenário fictício iniciado sem regras respondidas, para teste de ponta a ponta."}]}});await api(`/api/tickets?process=${id}`);await api(`/api/municipal/${id}/questions`,{});return id}
async function main(){
 const ready=await create("validacao-inicial","TESTAR · Alvará — coleta e correção"),reference=await create("validacao-referencia","REFERÊNCIA · Alvará — correção aprovada")
 let context=await api(`/api/municipal/${reference}/context`),ticket=await api(`/api/tickets/${context.ticketId}`)
 if(ticket.status!=="approved"){
  for(let round=0;round<12;round++){
   const batch=await api(`/api/municipal/${reference}/questions`,{});if(!batch.missing.length)break
   assert.ok(batch.questions.length,"Pergunta aberta necessária")
   for(const question of batch.questions){const result=await api(`/api/municipal/${reference}/answers`,{questionId:question.id,content:fixture.answers[question.category],author:fixture.author,requestKey:crypto.randomUUID()});ticket=await wait(batch.ticketId,t=>t.messages.some(m=>m.id===result.messageId&&m.metadata.processed))}
  }
  context=await api(`/api/municipal/${reference}/context`);assert.equal(context.missing.length,0)
  ticket=await api(`/api/tickets/${context.ticketId}`);let v=ticket.versions[0]
  if(!ticket.messages.some(m=>m.kind==="change_request"&&m.content===fixture.correction)){
   await api(`/api/tickets/${ticket.id}`,{action:"message",versionId:v.id,decision:"changes",content:fixture.correction,requestKey:crypto.randomUUID()});ticket=await wait(ticket.id,t=>t.versions[0].number>v.number);v=ticket.versions[0]
  }
  assert.equal(v.status,"awaiting_professional");await api(`/api/tickets/${ticket.id}`,{action:"approve",versionId:v.id},[400])
  const values={...exampleValues(v.definition),tipo_pessoa:"juridica",comprovante_endereco:[]};assert.equal(validateValues(v.definition,values).valid,true)
  assert.equal((await api(`/api/tickets/${ticket.id}`,{action:"test",versionId:v.id,values})).valid,true)
  await api(`/api/tickets/${ticket.id}`,{action:"approve",versionId:v.id});ticket=await api(`/api/tickets/${ticket.id}`)
 }
 assert.equal(ticket.status,"approved")
 const v=ticket.versions[0],field=v.definition.fields.find(f=>f.id==="comprovante_endereco")
 assert.equal(field.required,false);assert.deepEqual(field.requiredWhen,[{field:"tipo_pessoa",operator:"equals",value:"fisica"}]);assert.ok(v.testResults.manual.valid)
 const physical={...exampleValues(v.definition),tipo_pessoa:"fisica",comprovante_endereco:[]};assert.equal(validateValues(v.definition,physical).valid,false)
 const initial=await api(`/api/municipal/${ready}/context`)
 const links={demonstration:true,createdAt:new Date().toISOString(),ready:{processId:ready,ticketId:initial.ticketId,status:initial.currentForm?.status||"information_received",ticket:`${base}/communications?process=${ready}`,municipality:`${base}/cases/municipal-case-${ready.slice("municipal-showcase-v1-".length)}`,questions:initial.questions.filter(q=>q.status==="open")},reference:{processId:reference,ticketId:ticket.id,status:ticket.status,version:v.number,ticket:`${base}/communications?ticket=${ticket.id}`,form:`${base}/communications?ticket=${ticket.id}&form=${v.id}`,municipality:`${base}/cases/municipal-case-${reference.slice("municipal-showcase-v1-".length)}`}}
 await mkdir("../artifacts",{recursive:true});await writeFile("../artifacts/municipal-validation.json",JSON.stringify(links,null,2))
 console.log(JSON.stringify({ready:links.ready.ticket,readyQuestions:links.ready.questions.length,reference:links.reference.ticket,referenceVersion:v.number,referenceApproved:true,conditionalCorrectionVerified:true},null,2))
}
try{await main()}finally{await db.$disconnect()}
