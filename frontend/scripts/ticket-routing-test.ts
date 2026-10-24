import assert from "node:assert/strict"
import {PrismaClient} from "@prisma/client"
import {initialRules,propose} from "../src/lib/municipal/domain"
import {ensureTicket,routeConnectorToTicket} from "../src/lib/municipal/tickets"
const prisma=new PrismaClient(),base="http://127.0.0.1:3001",created:string[]=[],ticketIds:string[]=[],phone="5511988880000",tag=`ROUTING-${crypto.randomUUID()}`
const content="Pessoas físicas e jurídicas podem solicitar.\nOs documentos obrigatórios são CPF ou CNPJ e comprovante de endereço.\nA vistoria deve ocorrer antes da aprovação.\nAtividades de baixo risco têm dispensa de vistoria.\nO prazo é de 10 dias úteis.\nA secretaria é responsável e o diretor aprova."
async function api(path:string,data?:unknown,token?:string,status=200){const r=await fetch(base+path,{method:data?"POST":"GET",headers:{Origin:base,...(data?{"Content-Type":"application/json"}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},body:data?JSON.stringify(data):undefined}),body=await r.json();assert.equal(r.status,status,JSON.stringify(body).slice(0,400));return body}
async function wait(id:string,predicate:(data:any)=>boolean){const limit=Date.now()+45000;while(Date.now()<limit){const data=await api(`/api/tickets/${id}`);if(predicate(data))return data;const failure=data.jobs.find((j:any)=>j.status==="dead_letter");if(failure)throw new Error(failure.lastError);await new Promise(r=>setTimeout(r,700))}throw new Error("Timeout")}
async function main(){try{
 const tickets=[]
 for(let i=0;i<3;i++){const source={id:`source-${tag}-${i}`,content,name:"Fonte fictícia",type:"manual",createdAt:new Date().toISOString()},rules=i===2?initialRules("alvara"):propose(initialRules("alvara"),source).map(r=>({...r,status:"approved"}))
 const process=await prisma.municipalProcess.create({data:{workspaceId:"default-workspace",municipality:`${tag}-${i}`,department:`Setor ${i}`,name:"Processo de teste",owner:"Responsável teste",templateKey:"alvara",contactPhone:i<2?phone:null,rules:JSON.parse(JSON.stringify(rules)),sources:i===2?[]:[source]}});created.push(process.id);const ticket=await ensureTicket("default-workspace",process.id);ticketIds.push(ticket.id);tickets.push(ticket);await api(`/api/tickets/${ticket.id}`,{action:"generate",requestKey:crypto.randomUUID()},undefined,202)}
 const a=await wait(tickets[0].id,t=>t.versions.length>0),b=await wait(tickets[1].id,t=>t.versions.length>0),missing=await wait(tickets[2].id,t=>t.versions.length>0)
 assert.equal(a.versions[0].definition.context.municipality,`${tag}-0`);assert.equal(b.versions[0].definition.context.municipality,`${tag}-1`);assert.equal(missing.status,"needs_information");assert.ok(missing.messages.some((m:any)=>m.kind==="clarification"));assert.ok(missing.versions[0].blockers.length)
 const unresolved=await routeConnectorToTicket({workspaceId:"default-workspace",externalId:crypto.randomUUID(),channel:"whatsapp",content:"tornar CPF opcional",author:"Contato teste",phone});assert.equal(unresolved,null)
 const id=crypto.randomUUID(),code=a.versions[0].id.slice(-8).toUpperCase(),input={workspaceId:"default-workspace",externalId:id,channel:"whatsapp",content:`ACEITAR ${code}`,author:"Contato teste",phone}
 const first=await routeConnectorToTicket(input),second=await routeConnectorToTicket(input);assert.equal(first!.id,second!.id)
 await wait(tickets[0].id,t=>t.versions[0].status==="awaiting_professional");assert.equal((await api(`/api/tickets/${tickets[1].id}`)).versions[0].status,"awaiting_municipality")
 const message=a.messages.find((m:any)=>m.kind==="form"),externalId=`reply-${crypto.randomUUID()}`;await prisma.municipalTicketMessage.update({where:{id:message.id},data:{externalId}})
 await routeConnectorToTicket({workspaceId:"default-workspace",externalId:crypto.randomUUID(),channel:"whatsapp",content:"tornar CPF opcional",author:"Contato teste",phone,replyTo:externalId})
 const corrected=await wait(tickets[0].id,t=>t.versions.length===2);assert.equal(corrected.versions[0].status,"awaiting_professional");assert.equal((await api(`/api/tickets/${tickets[1].id}`)).versions.length,1)
 const v=missing.versions[0],link=missing.messages.find((m:any)=>m.content.includes(`/review/${v.id}#`)).content,token=link.split(`/review/${v.id}#`)[1].split(/\s/)[0]
 await api(`/api/forms/review/${v.id}`,{action:"accept",author:"Analista teste",requestKey:crypto.randomUUID()},token,400)
 await api(`/api/forms/review/${v.id}`,{action:"changes",author:"Analista teste",content,resolvePending:true,requestKey:crypto.randomUUID()},token,202)
 const complete=await wait(tickets[2].id,t=>t.versions.length===2);assert.equal(complete.versions[0].status,"awaiting_municipality");assert.equal(complete.versions[0].blockers.length,0)
 await ensureTicket("default-workspace",created[2]);await ensureTicket("default-workspace",created[2]);assert.equal(await prisma.municipalTicketMessage.count({where:{ticketId:tickets[2].id,content}}),1)
 const recordTime=await fetch(base+`/api/municipal/${created[2]}`,{method:"PATCH",headers:{Origin:base,"Content-Type":"application/json"},body:JSON.stringify({action:"minutes",version:complete.process.version,minutes:5})});assert.equal(recordTime.status,200)
 const current=complete.versions[0],reviewMessage=complete.messages.find((m:any)=>m.formVersionId===current.id&&m.kind==="form"),currentToken=reviewMessage.content.split(`/review/${current.id}#`)[1].split(/\s/)[0]
 await api(`/api/forms/review/${current.id}`,{action:"accept",author:"Analista teste",requestKey:crypto.randomUUID()},currentToken,202)
 await wait(tickets[2].id,t=>t.versions[0].status==="awaiting_professional")
 const {exampleValues}=await import("../src/lib/municipal/forms")
 await api(`/api/tickets/${tickets[2].id}`,{action:"test",versionId:current.id,values:exampleValues(current.definition)})
 await api(`/api/tickets/${tickets[2].id}`,{action:"approve",versionId:current.id})
 assert.equal((await api(`/api/tickets/${tickets[2].id}`)).versions.length,2)

 console.log("PASS: missing information collected through Ticket; same contact across municipalities is never guessed; version codes and quoted replies route correctly; duplicate input is idempotent; source history is not duplicated.")
 }finally{
  for(const ticketId of ticketIds){await prisma.backgroundJob.updateMany({where:{type:"MUNICIPAL_TICKET",status:"queued",payload:{path:["ticketId"],equals:ticketId}},data:{status:"cancelled"}});for(let i=0;i<30;i++){if(!await prisma.backgroundJob.count({where:{type:"MUNICIPAL_TICKET",status:"running",payload:{path:["ticketId"],equals:ticketId}}}))break;await new Promise(r=>setTimeout(r,200))}await prisma.backgroundJob.deleteMany({where:{type:"MUNICIPAL_TICKET",payload:{path:["ticketId"],equals:ticketId}}})}
  await prisma.municipalProcess.deleteMany({where:{id:{in:created}}});await prisma.$disconnect()
 }
}
main().catch(error=>{console.error(error);process.exitCode=1})
