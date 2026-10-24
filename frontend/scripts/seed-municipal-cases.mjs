import assert from "node:assert/strict"
import {mkdir,writeFile} from "node:fs/promises"
import {PrismaClient} from "@prisma/client"
import {syncMunicipalCase} from "../src/lib/municipal/case-sync.ts"
import {municipalCaseProgress} from "../src/lib/municipal/case-context.ts"
const db=new PrismaClient(),workspaceId="default-workspace",archiveId="legacy-before-municipal-showcase"
const prefix="municipal-showcase-v1-",base=process.env.DEMO_BASE_URL||"http://127.0.0.1:3001"
const legacyNumbers=["LL-2026-0182","LL-2026-0239","LL-2026-0314","LL-2026-11CA03","LL-2026-HERDEIROS"]
async function main(){
 const processes=await db.municipalProcess.findMany({where:{workspaceId,id:{startsWith:prefix}},include:{ticket:{include:{versions:{orderBy:{number:"desc"}},messages:{orderBy:{createdAt:"asc"}}}}}})
 assert.ok(processes.length>=6&&processes.every(p=>p.ticket),"Prepare a base municipal antes de continuar.")
 const legacyCases=await db.case.findMany({where:{workspaceId,caseNumber:{in:legacyNumbers}},select:{id:true,caseNumber:true}}),legacyIds=legacyCases.map(c=>c.id)
 const legacyInbox=await db.inboxItem.findMany({where:{workspaceId,OR:[{detectedCaseId:{in:legacyIds}},{rawContent:{contains:"LL-2026-0182"}},{sourceExternalId:{startsWith:"fixture-"}}]},select:{id:true}}),inboxIds=legacyInbox.map(i=>i.id)
 const jobWhere={workspaceId,OR:[{caseId:{in:legacyIds}},{inboxItemId:{in:inboxIds}}]}
 assert.equal(await db.backgroundJob.count({where:{...jobWhere,status:"running"}}),0,"Aguarde as tarefas antigas antes de arquivar.")
 await mkdir("../backups",{recursive:true});await writeFile(`../backups/municipal-cases-manifest-${Date.now()}.json`,JSON.stringify({workspaceId,archiveId,legacyCases,legacyInbox,note:"Registros preservados em workspace de arquivo, sem exclusão de anexos ou históricos."},null,2))
 await db.$transaction(async tx=>{
  await tx.workspace.upsert({where:{id:archiveId},update:{},create:{id:archiveId,slug:archiveId,name:"Arquivo da base anterior à demonstração municipal"}})
  await tx.workspaceMember.upsert({where:{workspaceId_userProfileId:{workspaceId:archiveId,userProfileId:"current-user"}},update:{},create:{workspaceId:archiveId,userProfileId:"current-user",role:"owner"}})
  await tx.backgroundJob.updateMany({where:{...jobWhere,status:{in:["queued","cancel_requested"]}},data:{status:"cancelled",progressMessage:"Base anterior arquivada para apresentação municipal"}})
  await tx.backgroundJob.updateMany({where:jobWhere,data:{workspaceId:archiveId}})
  await tx.inboxItem.updateMany({where:{workspaceId,id:{in:inboxIds}},data:{workspaceId:archiveId}})
  await tx.case.updateMany({where:{workspaceId,id:{in:legacyIds}},data:{workspaceId:archiveId}})
  for(const p of processes){
   const key=p.id.slice(prefix.length),id=`municipal-case-${key}`,progress=municipalCaseProgress(p.ticket),version=p.ticket?.versions[0]
   const data={workspaceId,municipalProcessId:p.id,clientName:p.municipality,caseType:p.name,status:progress.status,priority:version?.blockers.length?"high":"medium",assignedTo:p.owner,description:`${p.department}: implantação do processo de ${p.name.toLocaleLowerCase("pt-BR")}. Prefeitura e regras fictícias para demonstração; fontes, formulário e revisões disponíveis no Ticket.`,nextAction:progress.nextAction,lastActivity:p.ticket?.updatedAt||p.updatedAt}
   await tx.case.upsert({where:{id},update:data,create:{id,caseNumber:`MUN-2026-${key.toUpperCase()}`,...data}})

  }
 },{timeout:30000})
 for(const process of processes)await syncMunicipalCase(process.ticket.id)
 const apiCases=await fetch(base+"/api/cases").then(r=>r.json()),apiInbox=await fetch(base+"/api/inbox").then(r=>r.json())
 assert.ok(Array.isArray(apiCases)&&Array.isArray(apiInbox))
 assert.equal(apiCases.filter(c=>c.id.startsWith("municipal-case-")).length,processes.length)
 assert.ok(apiCases.every(c=>!legacyNumbers.includes(c.caseNumber)))
 assert.ok(apiInbox.every(item=>!inboxIds.includes(item.id)))
 for(const p of processes){const c=apiCases.find(c=>c.municipalProcessId===p.id);assert.ok(c);assert.equal(c.municipalProcess.ticket.id,p.ticket.id);const detail=await fetch(`${base}/api/cases/${c.id}`).then(r=>r.json());assert.ok(detail.case);assert.ok(detail.documents.length);const document=await fetch(base+detail.documents[0].url);assert.equal(document.status,200);assert.ok((await document.text()).includes("demonstração"));assert.equal(detail.case.status,municipalCaseProgress(p.ticket).status)}
 for(const item of apiInbox.filter(i=>i.id.startsWith("municipal-inbox-"))){assert.ok(item.detectedCase?.municipalProcess?.ticket);assert.equal(item.associationConfidence,null)}
 console.log(JSON.stringify({municipalCases:processes.length,municipalInbox:apiInbox.filter(i=>i.id.startsWith("municipal-inbox-")).length,archivedCases:legacyIds.length,archivedInbox:inboxIds.length,archiveId,linksVerified:true,sourceDownloadsVerified:true}))
}
try{await main()}finally{await db.$disconnect()}
