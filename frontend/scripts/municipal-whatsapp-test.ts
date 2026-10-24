import assert from "node:assert/strict"
import { PrismaClient } from "@prisma/client"
import { initialRules, propose, type Rule } from "../src/lib/municipal/domain"
import { processWhatsAppPayload } from "../src/lib/connectors/whatsapp"
async function main() {
const prisma = new PrismaClient()
const workspaceId = `municipal-test-${crypto.randomUUID()}`
const numberId = `test-number-${crypto.randomUUID()}`
const phone = "5511999990000"
process.env.CONNECTOR_AUTO_ACK_ENABLED = "false"
try {
 await prisma.workspace.create({data:{id:workspaceId,name:"Isolated test",slug:workspaceId}})
 const account = await prisma.connectorAccount.create({data:{workspaceId,provider:"whatsapp",externalAccountId:numberId,status:"test"}})
 const source = {id:"test-source",name:"Teste",content:"Pessoas físicas podem solicitar. O prazo é de 10 dias úteis.",type:"manual",createdAt:new Date().toISOString()}
 const rules = propose(initialRules("alvara"),source)
 const dossier = await prisma.municipalProcess.create({data:{workspaceId,municipality:"Teste",department:"Teste",name:"Processo teste",templateKey:"alvara",owner:"Teste",contactPhone:phone,rules:JSON.parse(JSON.stringify(rules)),sources:[source]}})
 const rule = rules.find(r=>r.category==="deadlines")!
 async function receive(id:string,text:string,sender=phone) {
  await processWhatsAppPayload({entry:[{changes:[{value:{metadata:{phone_number_id:numberId},contacts:[{wa_id:sender,profile:{name:"Contato de teste"}}],messages:[{id,from:sender,timestamp:String(Math.floor(Date.now()/1000)),type:"text",text:{body:text}}]}}]}]})
 }
 const wrongId=`wrong-${crypto.randomUUID()}`;await receive(wrongId,`CONFIRMAR ${rule.approvalCode}`,"5511888880000")
 let state = await prisma.municipalProcess.findUniqueOrThrow({where:{id:dossier.id}})
 assert.equal((state.rules as unknown as Rule[]).find(r=>r.id===rule.id)!.status,"proposed")
 const messageId=`inbound-${crypto.randomUUID()}`;await receive(messageId,`CONFIRMAR ${rule.approvalCode}`)
 state = await prisma.municipalProcess.findUniqueOrThrow({where:{id:dossier.id}})
 assert.equal((state.rules as unknown as Rule[]).find(r=>r.id===rule.id)!.status,"approved")
 const version=state.version;await receive(messageId,`CONFIRMAR ${rule.approvalCode}`)
 assert.equal(await prisma.whatsAppChatMessage.count({where:{providerId:messageId}}),1)
 assert.equal((await prisma.municipalProcess.findUniqueOrThrow({where:{id:dossier.id}})).version,version)
 const first=rules.find(r=>r.category==="eligibility")!
 await receive(`correction-${crypto.randomUUID()}`,`CORRIGIR ${first.approvalCode}: Somente pessoas jurídicas podem solicitar.`)
 state = await prisma.municipalProcess.findUniqueOrThrow({where:{id:dossier.id}})
 const corrected=(state.rules as unknown as Rule[]).find(r=>r.id===first.id)!
 assert.notEqual(corrected.approvalCode,first.approvalCode);assert.equal(corrected.status,"proposed")
 await receive(`stale-${crypto.randomUUID()}`,`CONFIRMAR ${first.approvalCode}`)
 assert.equal((await prisma.municipalProcess.findUniqueOrThrow({where:{id:dossier.id}})).version,state.version)
 await receive(`confirm-${crypto.randomUUID()}`,`CONFIRMAR ${corrected.approvalCode}`)
 assert.equal(((await prisma.municipalProcess.findUniqueOrThrow({where:{id:dossier.id}})).rules as unknown as Rule[]).find(r=>r.id===corrected.id)!.status,"approved")
 const outbound=await prisma.whatsAppChatMessage.create({data:{workspaceId,accountId:account.id,phone,direction:"sent",content:"Teste sem envio externo",providerId:`outbound-${crypto.randomUUID()}`,status:"sent"}})
 for(const status of ["read","delivered"])await processWhatsAppPayload({entry:[{changes:[{value:{metadata:{phone_number_id:numberId},statuses:[{id:outbound.providerId,status}]}}]}]})
 assert.equal((await prisma.whatsAppChatMessage.findUniqueOrThrow({where:{id:outbound.id}})).status,"read")
 console.log("PASS: wrong-contact isolation, remote approval, delivery deduplication, correction, stale-code rejection, renewed approval and ordered delivery status. No external messages sent.")
} finally {
 await prisma.backgroundJob.deleteMany({where:{workspaceId}})
 const accounts=await prisma.connectorAccount.findMany({where:{workspaceId},select:{id:true}})
 await prisma.connectorDelivery.deleteMany({where:{accountId:{in:accounts.map(a=>a.id)}}})
 await prisma.inboxItem.deleteMany({where:{workspaceId}})
 await prisma.whatsAppChatMessage.deleteMany({where:{workspaceId}})
 await prisma.municipalProcess.deleteMany({where:{workspaceId}})
 await prisma.connectorAccount.deleteMany({where:{workspaceId}})
 await prisma.workspace.deleteMany({where:{id:workspaceId}})
 await prisma.$disconnect()
}

}
main().catch(error => { console.error(error); process.exitCode = 1 })
