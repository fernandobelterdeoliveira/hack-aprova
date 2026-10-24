import assert from "node:assert/strict"
import { PrismaClient } from "@prisma/client"
import { unlink } from "node:fs/promises"
import path from "node:path"
const prisma=new PrismaClient(),base="http://127.0.0.1:3001",created=[],storage=[],checks=[]
let foreignId,accountId,messageId
async function request(url,{status=200,...options}={}){
 const r=await fetch(base+url,{...options,headers:{Origin:base,...options.headers},signal:AbortSignal.timeout(60000)});const text=await r.text();let body;try{body=JSON.parse(text)}catch{body=text}
 assert.equal(r.status,status,`${url}: ${JSON.stringify(body).slice(0,300)}`);checks.push(`${options.method||"GET"} ${url} -> ${status}`);return body
}
try{
 await request("/api/municipal",{method:"POST",status:403,headers:{"Content-Type":"application/json",Origin:"https://invalid-origin.example"},body:"{}"})
 await request("/api/municipal",{method:"POST",status:403,headers:{"Content-Type":"application/json",Origin:"null"},body:"{}"})
 for(const route of ["/municipal","/communications","/dashboard","/api/cases","/api/whatsapp","/api/municipal"])await request(route)
 let state=await request("/api/municipal",{method:"POST",status:201,headers:{"Content-Type":"application/json"},body:JSON.stringify({municipality:"TESTE AUTOMATIZADO",department:"Secretaria teste",name:"Alvara ficticio",templateKey:"alvara",owner:"Operador teste",contactPhone:"5511999990000"})});created.push(state.id)
 async function action(data,status=200){const body=await request(`/api/municipal/${state.id}`,{method:"PATCH",status,headers:{"Content-Type":"application/json"},body:JSON.stringify({version:state.version,...data})});if(status===200)state=body;return body}
 await action({action:"publish"},400)
 await action({action:"source",name:"Regra ficticia",content:"Pessoas físicas e jurídicas podem solicitar o serviço.\nOs documentos obrigatórios são CPF e comprovante de endereço.\nA vistoria deve ocorrer antes da aprovação.\nAtividades de baixo risco têm dispensa de vistoria.\nO prazo de análise é de 10 dias úteis.\nA secretaria é responsável pela triagem e o diretor aprova o pedido."})
 assert.ok(state.rules.every(r=>r.value&&r.excerpt&&r.sourceId));assert.equal(state.completeness,0)
 await action({action:"edit-rule",ruleId:state.rules[0].id,value:"Dado inventado",sourceId:state.sources[0].id,excerpt:"Trecho inexistente"},400)
 const oldVersion=state.version
 for(const rule of state.rules)await action({action:"approve",ruleId:rule.id})
 assert.equal(state.completeness,100)
 await request(`/api/municipal/${state.id}`,{method:"PATCH",status:409,headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"round",version:oldVersion})})
 await action({action:"generate-tests"});assert.equal(state.scenarios.length,12);await action({action:"publish"},400)
 for(const s of state.scenarios)await action({action:"test",scenarioId:s.id,result:"passed",actual:"Execucao simulada pelo teste, sem sistema Aprova."})
 await action({action:"minutes",minutes:12});await action({action:"round"});assert.equal(state.minutesSpent,12);assert.equal(state.clarificationRounds,1)
 await action({action:"publish"});assert.equal(state.status,"ready")
 const form=new FormData();form.append("file",new Blob(["O prazo de análise agora é de 15 dias úteis."],{type:"text/plain"}),"regra-ficticia.txt");form.append("version",String(state.version))
 await request(`/api/municipal/${state.id}/documents`,{method:"POST",body:form})
 state=await request(`/api/municipal/${state.id}`)
 for(const s of state.sources)if(s.storageId)storage.push(s.storageId)
 assert.ok(state.rules.find(r=>r.category==="deadlines").conflict);assert.ok(state.completeness<100);await action({action:"publish"},400)
 const source=state.sources.find(s=>s.storageId);assert.match(await request(`/api/municipal/${state.id}/documents?source=${source.id}`),/15 dias/)
 const foreign=await prisma.municipalProcess.create({data:{workspaceId:"test-other-workspace",municipality:"Isolamento",department:"Teste",name:"Nao deve aparecer",templateKey:"protocolo",owner:"Teste"}});foreignId=foreign.id
 await request(`/api/municipal/${foreignId}`,{status:404});assert.ok(!(await request("/api/municipal")).processes.some(p=>p.id===foreignId))
 const account=await prisma.connectorAccount.create({data:{provider:"whatsapp",externalAccountId:`test-${crypto.randomUUID()}`,workspaceId:"default-workspace",status:"test"}});accountId=account.id
 const stream=await fetch(base+"/api/whatsapp?stream=1");assert.ok(stream.headers.get("content-type").includes("text/event-stream"));const reader=stream.body.getReader();await reader.read()
 const message=await prisma.whatsAppChatMessage.create({data:{workspaceId:"default-workspace",accountId,phone:"5511999990000",direction:"received",content:"Teste local de sincronizacao, sem envio externo",status:"received"}});messageId=message.id
 let observed=false;for(let i=0;i<4;i++){const {value}=await reader.read();if(new TextDecoder().decode(value).includes(messageId)){observed=true;break}}await reader.cancel();assert.ok(observed);checks.push("SSE -> mensagem transmitida ao vivo")
 assert.ok((await request("/api/whatsapp")).messages.some(m=>m.id===messageId))
 await request("/api/connectors/whatsapp/webhook",{method:"POST",status:401,headers:{"Content-Type":"application/json"},body:JSON.stringify({entry:[]})})
 const batchName=`TEST-BATCH-${crypto.randomUUID()}`
 await request("/api/municipal/import",{method:"POST",status:400,headers:{"Content-Type":"application/json"},body:JSON.stringify({rows:[{municipality:batchName,department:"Teste",name:"Processo teste",owner:"Teste",templateKey:"protocolo",contactPhone:"invalido"}]})})
 assert.equal(await prisma.municipalProcess.count({where:{municipality:batchName}}),0)
 const batch=await request("/api/municipal/import",{method:"POST",status:201,headers:{"Content-Type":"application/json"},body:JSON.stringify({rows:[1,2].map(i=>({municipality:batchName,department:"Teste",name:`Processo teste ${i}`,owner:"Teste",templateKey:"protocolo"}))})});assert.equal(batch.created,2)
 for(const p of await prisma.municipalProcess.findMany({where:{municipality:batchName},select:{id:true}}))created.push(p.id)
 await request("/api/whatsapp/connect",{method:"POST",status:400,headers:{"Content-Type":"application/json"},body:JSON.stringify({phoneNumberId:"invalid"})})
 console.log(JSON.stringify({passed:checks.length,checks},null,2))
}finally{
 if(messageId)await prisma.whatsAppChatMessage.deleteMany({where:{id:messageId}})
 if(accountId)await prisma.connectorAccount.deleteMany({where:{id:accountId}})
 if(foreignId)await prisma.municipalProcess.deleteMany({where:{id:foreignId}})
 for(const processId of created){const ticket=await prisma.municipalTicket.findUnique({where:{processId}});if(ticket){await prisma.backgroundJob.updateMany({where:{type:"MUNICIPAL_TICKET",status:"queued",payload:{path:["ticketId"],equals:ticket.id}},data:{status:"cancelled"}});for(let i=0;i<30;i++){if(!await prisma.backgroundJob.count({where:{type:"MUNICIPAL_TICKET",status:"running",payload:{path:["ticketId"],equals:ticket.id}}}))break;await new Promise(r=>setTimeout(r,200))}await prisma.backgroundJob.deleteMany({where:{type:"MUNICIPAL_TICKET",payload:{path:["ticketId"],equals:ticket.id}}})}await prisma.municipalProcess.deleteMany({where:{id:processId}})}
 for(const id of storage){const o=await prisma.storedObject.findUnique({where:{id}});if(o?.storageProvider==="local"){const root=path.resolve(process.env.LOCAL_STORAGE_PATH||"data/connector-storage"),target=path.resolve(root,o.storageKey);if(target.startsWith(root+path.sep))await unlink(target).catch(()=>{})}await prisma.storedObject.deleteMany({where:{id}})}
 await prisma.$disconnect()
}
