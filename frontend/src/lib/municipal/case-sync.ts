import {createHash} from "node:crypto"
import {prisma} from "@/lib/prisma"
import {json} from "./service"
import {municipalCaseProgress} from "./case-context"
import type {Rule,Source} from "./domain"
import type {FormDefinition} from "./forms"
import {collectionGaps} from "./collection-domain"
const hash=(text:string)=>createHash("sha256").update(text).digest("hex").slice(0,24)
// Projection only: Ticket, source history and form versions remain authoritative.
export async function syncMunicipalCase(ticketId:string){
 const base=await prisma.municipalTicket.findUnique({where:{id:ticketId},select:{processId:true,workspaceId:true}})
 if(!base)return
 const record=await prisma.case.findFirst({where:{municipalProcessId:base.processId,workspaceId:base.workspaceId},select:{id:true}})
 if(!record)return
 await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT "id" FROM "Case" WHERE "id" = ${record.id} FOR UPDATE`
  const ticket=await tx.municipalTicket.findUniqueOrThrow({where:{id:ticketId},include:{process:true,versions:{orderBy:{number:"desc"},take:1},messages:{orderBy:{createdAt:"asc"}}}})
  const p=ticket.process,version=ticket.versions[0],rules=p.rules as Rule[],sources=p.sources as Source[],progress=municipalCaseProgress(ticket),now=new Date(),demo=sources.some(s=>s.type==="demonstration")
  if(p.workspaceId!==base.workspaceId)throw new Error("Contexto municipal pertence a outro workspace.")
  await tx.case.update({where:{id:record.id},data:{status:progress.status,nextAction:progress.nextAction,lastActivity:ticket.updatedAt}})
  const fileIds=new Map<string,string>()
  for(const source of sources){
   const id=`municipal-source-${hash(record.id+source.id)}`;fileIds.set(source.id,id)
   const data={name:`Fonte - ${source.name}.txt`,url:`/api/cases/${record.id}/municipal-evidence?source=${encodeURIComponent(source.id)}`,type:"text/plain",size:`${Buffer.byteLength(source.content)} bytes`}
   await tx.files.upsert({where:{id},update:data,create:{id,caseId:record.id,uploadedBy:source.name,...data}})
  }
  const inboxIds=new Map<string,string>()
  let firstInbox:string|undefined
  for(const message of ticket.messages.filter(m=>m.direction==="received")){
   const original=message.inboxItemId?await tx.inboxItem.findFirst({where:{id:message.inboxItemId,workspaceId:ticket.workspaceId}}):null
   const inboxId=original?.id||`municipal-inbox-${message.id}`,source=message.kind==="source",rawContent=`${p.municipality} · ${p.name}\n\n${message.content}${demo?"\n\nRegistro de demonstração recebido internamente no Ticket.":""}`
   if(original?.detectedCaseId&&original.detectedCaseId!==record.id)continue
   const update={detectedCaseId:record.id,...(original?.sourceExternalId?.startsWith("municipal-ticket:")&&original.reviewStatus!=="rejected"?{reviewStatus:source||ticket.status==="approved"||original.reviewStatus==="approved"?"approved":"ready",requiresHumanReview:!source&&ticket.status!=="approved"&&original.reviewStatus!=="approved"}:{})}
   await tx.inboxItem.upsert({where:{id:inboxId},update,create:{id:inboxId,workspaceId:ticket.workspaceId,sourceType:message.channel==="whatsapp"?"whatsapp":"manual",sourceExternalId:`municipal-ticket:${message.id}`,senderName:message.author,receivedAt:message.createdAt,rawContent,contentHash:hash(rawContent),detectedCaseId:record.id,associationConfidence:null,associationSignals:json({autoAssociated:false,manuallyAssigned:true,ticketId,municipalProcessId:p.id,demonstration:demo,candidates:[{caseId:record.id,clientName:p.municipality,caseType:p.name,signals:[{detail:"Vínculo explícito com o processo e o Ticket municipais.",contribution:1}]}]}),classification:source?"municipal_rules":"municipal_changes",processingStatus:"completed",reviewStatus:source||ticket.status==="approved"?"approved":"ready",requiresHumanReview:!source&&ticket.status!=="approved",decisionProvider:"municipal-ticket-local",riskLevel:source?"low":"medium"}})
   if(!message.inboxItemId)await tx.municipalTicketMessage.update({where:{id:message.id},data:{inboxItemId:inboxId}})
   const review=await tx.inboxItem.findUniqueOrThrow({where:{id:inboxId}})
   if(review.reviewStatus==="ready"&&!await tx.proposedCaseChange.count({where:{inboxItemId:inboxId}})){
    const runId=`municipal-data-review-${message.id}`
    await tx.inboxProcessingRun.upsert({where:{id:runId},update:{},create:{id:runId,inboxItemId:inboxId,model:"municipal-workflow",promptVersion:"data-review-v1",extractorVersion:"1",processingVersion:"1",status:"completed",completedAt:now}})
    await tx.proposedCaseChange.create({data:{id:`municipal-data-${message.id}`,inboxItemId:inboxId,caseId:record.id,type:"FACT",processingRunId:runId,fingerprint:hash(message.id),confidence:1,riskLevel:"medium",sourceId:message.id,sourceType:"municipal_ticket",sourceExcerpt:message.content,payload:json({title:"Registrar informação recebida",fieldName:"Informação recebida pelo Ticket",value:{display:message.content,status:"confirmed"},description:message.content,municipalAction:"save_data"})}})
   }
   inboxIds.set(message.id,inboxId);firstInbox??=inboxId
  }
  // Reuse the existing review queue for explicit outbound suggestions.
  for(const message of ticket.messages.filter(m=>m.direction==="sent"&&m.deliveryStatus==="awaiting_approval")){
   const obsolete=Boolean(message.formVersionId&&message.formVersionId!==ticket.currentVersionId)||(message.kind==="question"&&(message.metadata as Record<string,unknown>).collectionStatus==="answered")
   if(obsolete){
    await tx.municipalTicketMessage.update({where:{id:message.id},data:{deliveryStatus:"superseded"}})
    await tx.inboxItem.updateMany({where:{id:`municipal-outgoing-${message.id}`,reviewStatus:{not:"approved"}},data:{reviewStatus:"rejected"}})
    await tx.proposedCaseChange.updateMany({where:{id:`municipal-send-${message.id}`,status:"pending"},data:{status:"rejected",decidedBy:"municipal-workflow",decidedAt:now}})
    continue
   }
   const inboxId=`municipal-outgoing-${message.id}`,runId=`municipal-review-${message.id}`,proposalId=`municipal-send-${message.id}`
   const title=message.kind==="form"?`Enviar formulário v${ticket.versions.find(v=>v.id===message.formVersionId)?.number||String((message.metadata as Record<string,unknown>).version||"")}`:"Enviar mensagem sugerida"
   const rawContent=message.kind==="form"?`${title} para análise da prefeitura. Revise o formulário antes de aprovar o envio.`:message.content
   await tx.inboxItem.upsert({where:{id:inboxId},update:{},create:{id:inboxId,workspaceId:ticket.workspaceId,sourceType:"manual",senderName:"Assistente municipal",receivedAt:message.createdAt,rawContent,contentHash:hash(rawContent+message.id),detectedCaseId:record.id,classification:"municipal_changes",processingStatus:"completed",reviewStatus:"ready",requiresHumanReview:true,riskLevel:"medium",sourceExternalId:`municipal-outgoing:${message.id}`}})
   await tx.inboxProcessingRun.upsert({where:{id:runId},update:{},create:{id:runId,inboxItemId:inboxId,model:"municipal-workflow",promptVersion:"approval-v1",extractorVersion:"1",processingVersion:"1",status:"completed",completedAt:now}})
   await tx.proposedCaseChange.upsert({where:{id:proposalId},update:{},create:{id:proposalId,inboxItemId:inboxId,caseId:record.id,type:"TASK",processingRunId:runId,fingerprint:hash(message.id),confidence:1,riskLevel:"medium",sourceId:message.id,sourceType:"municipal_ticket",sourceExcerpt:message.content,payload:json({title,description:rawContent,municipalAction:"send_message",ticketId:ticket.id,messageId:message.id,formVersionId:message.formVersionId})}})
  }
  const approved=ticket.approvedVersionId?await tx.municipalFormVersion.findFirst({where:{id:ticket.approvedVersionId,ticketId}}):null
  const effective=approved||version,effectiveDefinition=effective?.definition as unknown as FormDefinition|undefined
  for(const rule of rules){
   const id=`municipal-fact-${rule.id}`,before=await tx.caseFact.findUnique({where:{id}})
   if(!rule.value||rule.status==="rejected"){if(before&&!before.archivedAt)await tx.caseFact.update({where:{id},data:{archivedAt:now,archivedBy:"municipal-ticket"}});continue}
   const section=effectiveDefinition?.sections.find(s=>s.id===rule.id),proof=section?.evidence.at(-1),override=section&&section.text!==rule.value&&proof&&inboxIds.has(proof.sourceId)
   const confirmed=override?effective?.status==="approved":rule.status==="approved",value={display:override?section.text:rule.value,status:confirmed?"confirmed":"pending"}
   const data={fieldName:rule.title,value:json(value),sourceType:override?"manual":"document",sourceId:override?inboxIds.get(proof.sourceId)||null:fileIds.get(rule.sourceId)||null,sourceExcerpt:override?proof.excerpt:rule.excerpt,verifiedAt:confirmed?(override?effective?.approvedAt||null:rule.approvedAt?new Date(rule.approvedAt):null):null,verifiedBy:confirmed?(override?effective?.approvedBy||null:rule.approvedBy||null):null,archivedAt:null}
   const previous=before?.value as {display?:string;status?:string}|undefined
   if(before&&(previous?.display!==value.display||previous?.status!==value.status))await tx.caseDataChange.create({data:{caseId:record.id,entityType:"fact",entityId:id,fieldName:rule.title,action:"updated",previousValue:json(before.value),newValue:json(value),changedBy:"municipal-ticket"}})
   await tx.caseFact.upsert({where:{id},update:data,create:{id,caseId:record.id,...data}})
  }
  for(const message of ticket.messages.filter(m=>m.direction==="system"))await tx.caseEvent.upsert({where:{id:`municipal-event-${message.id}`},update:{},create:{id:`municipal-event-${message.id}`,caseId:record.id,eventType:"municipal_ticket",title:message.content.split("\n")[0],description:message.content,occurredAt:message.createdAt,sourceType:"manual",sourceId:firstInbox,metadata:json({ticketId,messageId:message.id})}})
  const blockers=version?(version.blockers as string[]):collectionGaps(rules,sources).map(g=>g.question)
  const currentGapIds=blockers.map(text=>`municipal-gap-${hash(record.id+text)}`)
  await tx.informationGap.updateMany({where:{caseId:record.id,id:{startsWith:"municipal-gap-",notIn:currentGapIds},status:"open"},data:{status:"resolved",resolvedAt:now}})
  for(const [index,text]of blockers.entries())await tx.informationGap.upsert({where:{id:currentGapIds[index]},update:{status:"open",resolvedAt:null},create:{id:currentGapIds[index],caseId:record.id,title:text,description:"Esclarecer no Ticket do processo correspondente.",priority:"high",suggestedQuestion:text,sourceEventId:firstInbox}})
  const summary=`${p.municipality} / ${p.department}. ${p.name}. ${progress.nextAction}.${version?` Versão ${version.number}, com ${((version.definition as {fields:unknown[]}).fields).length} campos.`:" Aguardando coleta das regras pelo Ticket."}`
  const stages:Record<string,string>={information_received:"Coleta de informações",awaiting_municipality:"Análise da prefeitura",awaiting_professional:"Validação profissional",needs_information:"Aguardando esclarecimento",approved:"Formulário aprovado",processing_failed:"Falha em processamento"}
  const state={summary,stage:stages[ticket.status]||ticket.status,summaryUpdatedAt:now,summarySourceRefs:json(sources.map(s=>({sourceType:"document",sourceId:fileIds.get(s.id),label:s.name}))),summaryWarnings:json(demo?["Cenário de demonstração com prefeitura, equipe e regras fictícias."]:[])}
  await tx.caseState.upsert({where:{caseId:record.id},update:state,create:{caseId:record.id,...state,summaryGeneratedBy:"municipal-ticket-local"}})
  const taskId=`municipal-task-${record.id}`,task={title:progress.nextAction,description:`Acompanhar ${p.name} em ${p.municipality} pelo Ticket vinculado.`,category:blockers.length?"communication":"follow-up",priority:blockers.length?"high":"medium",status:ticket.status==="approved"?"completed":"pending",completedAt:ticket.status==="approved"?version?.approvedAt||now:null}
  await tx.aITask.upsert({where:{id:taskId},update:task,create:{id:taskId,caseId:record.id,...task,createdBy:"municipal-ticket-local",reasoning:"Ação derivada do estado do Ticket, sem chamada de IA simulada."}})
 },{timeout:30000})
}
