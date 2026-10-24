import {interpretCollectionAnswer} from "./collection-domain"
import {createHash,randomBytes,timingSafeEqual} from "node:crypto"
import {Prisma,type MunicipalFormVersion} from "@prisma/client"
import {prisma} from "@/lib/prisma"
import {json} from "./service"
import {proposeWithAgent} from "./agent"
import {resolveForm} from "./forms-agent"
import {definitionSchema,definitionIssues,generatedTests,validateValues,diffDefinitions,localDefinition,type FormDefinition,type GenerationContext,type FormValues} from "./forms"
import type {Rule,Source,Audit} from "./domain"
import {readStoredObject} from "@/lib/connectors/storage"
import {refreshTicketRuntime} from "./runtime-env"
import {sendWithProvider} from "@/lib/connectors/outbound"
export const TICKET_JOB="MUNICIPAL_TICKET"
function canonical(value:unknown):unknown{if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==="object"&&!(value instanceof Date))return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));return value}
export const digest=(value:unknown)=>createHash("sha256").update(typeof value==="string"?value:JSON.stringify(canonical(value))).digest("hex")
const publicBase=()=>process.env.TICKET_PUBLIC_BASE_URL||process.env.WHATSAPP_PUBLIC_URL||process.env.APP_PUBLIC_URL||process.env.APP_BASE_URL||"http://127.0.0.1:3001"
export function contextOf(process:{id:string;municipality:string;department:string;owner:string;name:string;rules:unknown;sources:unknown}):GenerationContext{return{id:process.id,name:process.name,municipality:process.municipality,department:process.department,owner:process.owner,rules:process.rules as Rule[],sources:process.sources as Source[]}}
export async function ensureTicket(workspaceId:string,processId:string){
 const process=await prisma.municipalProcess.findFirst({where:{id:processId,workspaceId}});if(!process)throw new Error("Processo não encontrado.")
 const ticket=await prisma.municipalTicket.upsert({where:{processId},update:{},create:{workspaceId,processId}})
 if(ticket.workspaceId!==workspaceId)throw new Error("Ticket pertence a outro ambiente.")
 const existingMessages=await prisma.municipalTicketMessage.findMany({where:{ticketId:ticket.id},select:{id:true,inboxItemId:true,metadata:true}})
 const data=(process.sources as unknown as Source[]).filter(source=>!existingMessages.some(message=>message.id===source.id||Boolean(source.inboxId&&message.inboxItemId===source.inboxId))).map(source=>({workspaceId,ticketId:ticket.id,direction:"received",kind:"source",content:source.content,author:source.name,externalKey:`source:${process.id}:${source.id}`,storageId:source.storageId||null,metadata:json({sourceId:source.id})}))
 if(data.length)await prisma.municipalTicketMessage.createMany({data,skipDuplicates:true})
 return ticket
}
export async function ticketEvent(ticketId:string,content:string,kind="event",versionId?:string,metadata:unknown={}){
 const ticket=await prisma.municipalTicket.findUniqueOrThrow({where:{id:ticketId}})
 const related=metadata&&typeof metadata==="object"?String((metadata as Record<string,unknown>).messageId||""):""
 const data={workspaceId:ticket.workspaceId,ticketId,content,kind,direction:"system",author:"Sistema",formVersionId:versionId,metadata:json(metadata)}
 if(related){const externalKey=`event:${ticketId}:${related}:${digest(content)}`;return prisma.municipalTicketMessage.upsert({where:{externalKey},update:{},create:{...data,externalKey}})}
 return prisma.municipalTicketMessage.create({data})
}
export async function enqueueTicket(ticketId:string,operation:"generate"|"message"|"deliver",actor:string,key:string,messageId?:string){
 const ticket=await prisma.municipalTicket.findUniqueOrThrow({where:{id:ticketId}})
 const expectedContextHash=operation==="generate"&&key.startsWith("process:")?digest(contextOf(await prisma.municipalProcess.findUniqueOrThrow({where:{id:ticket.processId}}))):null
 const stableKey=expectedContextHash?`context:${expectedContextHash}`:key
 return prisma.backgroundJob.upsert({where:{deduplicationKey:`ticket:${digest(`${ticketId}:${operation}:${stableKey}`)}`},update:{},create:{workspaceId:ticket.workspaceId,type:TICKET_JOB,payload:{ticketId,operation,messageId:messageId||null,expectedContextHash},status:"queued",createdBy:actor,progressMessage:operation==="deliver"?"Aguardando envio pelo conector":"Processando Ticket",deduplicationKey:`ticket:${digest(`${ticketId}:${operation}:${stableKey}`)}`,maxAttempts:operation==="deliver"?1:3,timeoutMs:120000}})
}
export async function appendTicketInput(input:{workspaceId:string;ticketId:string;content:string;author:string;externalKey:string;channel?:string;versionId?:string;decision?:"accept"|"changes";storageId?:string;inboxItemId?:string;whatsappMessageId?:string;resolvePending?:boolean;extractionPending?:boolean;information?:boolean;collectionQuestionId?:string}){
 const ticket=await prisma.municipalTicket.findFirst({where:{id:input.ticketId,workspaceId:input.workspaceId}});if(!ticket)throw new Error("Ticket não encontrado.")
 const previous=await prisma.municipalTicketMessage.findUnique({where:{externalKey:input.externalKey}})
 if(previous){if(previous.ticketId!==ticket.id||previous.originalContent!==input.content)throw new Error("Identificador de mensagem reutilizado com outro conteúdo.");await enqueueTicket(ticket.id,"message",input.author,previous.id,previous.id);return previous}
 const message=await prisma.municipalTicketMessage.create({data:{workspaceId:input.workspaceId,ticketId:ticket.id,content:input.content,originalContent:input.content,author:input.author,externalKey:input.externalKey,channel:input.channel||"internal",direction:"received",kind:input.decision==="changes"?"change_request":input.decision==="accept"?"acceptance":"text",formVersionId:input.versionId,storageId:input.storageId,inboxItemId:input.inboxItemId,whatsappMessageId:input.whatsappMessageId,metadata:json({decision:input.decision||null,resolvePending:input.resolvePending||false,extractionPending:input.extractionPending||Boolean(input.storageId),sourceInformation:input.information||false,collectionQuestionId:input.collectionQuestionId||null})}})
 await enqueueTicket(ticket.id,"message",input.author,message.id,message.id)
 return message
}
async function formMessage(tx:Prisma.TransactionClient,ticket:{id:string;workspaceId:string;connectorAccountId:string|null},version:MunicipalFormVersion,token:string,correction:boolean){
 const url=`${publicBase().replace(/\/$/,"")}/review/${version.id}#${token}`
 const code=version.id.slice(-8).toUpperCase()
 return tx.municipalTicketMessage.create({data:{workspaceId:ticket.workspaceId,ticketId:ticket.id,formVersionId:version.id,kind:"form",direction:"sent",author:"Sistema",content:`${correction?"Correções aplicadas":"Formulário gerado"} · versão ${version.number}\n${url}\n\nPara aceitar, responda ACEITAR ${code}. Para solicitar ajustes: AJUSTAR ${code}: descreva a alteração.`,metadata:json({reviewUrl:url,version:version.number,code}),deliveryStatus:ticket.connectorAccountId?"pending":"internal",externalKey:`form:${version.id}`}})
}
async function createVersion(ticketId:string,key:string,actor:string,requestMessageId?:string,manualDefinition?:FormDefinition){
 const existing=await prisma.municipalFormVersion.findUnique({where:{operationKey:key}});if(existing){const message=await prisma.municipalTicketMessage.findFirst({where:{formVersionId:existing.id,direction:"sent",deliveryStatus:"pending"}});if(message)await enqueueTicket(ticketId,"deliver","workflow",message.id,message.id);return existing}
 const ticket=await prisma.municipalTicket.findUniqueOrThrow({where:{id:ticketId},include:{process:true}})
 const previous=ticket.currentVersionId?await prisma.municipalFormVersion.findUnique({where:{id:ticket.currentVersionId}}):null
 const request=requestMessageId?await prisma.municipalTicketMessage.findFirst({where:{id:requestMessageId,ticketId}}):null
 if(request?.formVersionId&&request.formVersionId!==ticket.currentVersionId)throw new Error("A versão foi alterada antes da correção. Relacione a solicitação à versão atual.")
 const isMunicipalCorrection=Boolean(request&&request.kind!=="professional_edit")
 const context=contextOf(ticket.process)
 const resolved=manualDefinition?{definition:definitionSchema.parse(manualDefinition),blockers:definitionIssues(manualDefinition),mode:"professional-edit"}:await resolveForm(context,request&&previous?definitionSchema.parse(previous.definition):undefined,request?{id:request.id,content:request.content}:undefined)
 if(resolved.definition.context.processId!==ticket.processId||resolved.definition.context.municipality!==ticket.process.municipality||resolved.definition.context.department!==ticket.process.department||resolved.definition.context.owner!==ticket.process.owner)throw new Error("Definição pertence a outro contexto.")
 const evidence=new Map(context.sources.map(s=>[s.id,s.content]));const allRequests=await prisma.municipalTicketMessage.findMany({where:{ticketId,direction:"received"},select:{id:true,content:true}});for(const item of allRequests)if(!evidence.has(item.id))evidence.set(item.id,item.content)
 for(const item of [...resolved.definition.fields,...resolved.definition.sections])for(const proof of item.evidence){const source=evidence.get(proof.sourceId);if(!source||!(proof.excerpt.trim()&&proof.excerpt.split("\n").filter(line=>line.trim()).every(line=>source.includes(line))))throw new Error("Há campos ou regras sem fonte verificável neste Ticket.")}
 const requestMetadata=(request?.metadata||{}) as Record<string,unknown>
 const carried=request&&previous&&!requestMetadata.resolvePending?previous.blockers as string[]:[]
 const contextBlockers=request?localDefinition(context).blockers.filter(b=>b.startsWith("Falta informar")||b.startsWith("Quais campos")||b.startsWith("Há evidências")):[]
 const automatic=generatedTests(resolved.definition)
 const blockers=[...new Set([...resolved.blockers,...carried,...contextBlockers,...(!automatic.passed?["Os testes automáticos identificaram problemas na definição. Revise os campos e condições."]:[])])]
 const changes=previous?diffDefinitions(definitionSchema.parse(previous.definition),resolved.definition,request?.id||`professional:${actor}`,request?.content||"Edição profissional explícita"):[]
 const token=randomBytes(32).toString("base64url")
 const result=await prisma.$transaction(async tx=>{
  const fresh=await tx.municipalProcess.findUniqueOrThrow({where:{id:ticket.processId}});if(digest(contextOf(fresh))!==digest(context))throw new Error("As informações do processo mudaram durante a geração. Tente novamente.")
  const lock=await tx.municipalTicket.updateMany({where:{id:ticket.id,revision:ticket.revision},data:{revision:{increment:1}}});if(!lock.count)throw new Error("O Ticket foi atualizado durante a geração. Tente novamente.")
  const last=await tx.municipalFormVersion.findFirst({where:{ticketId},orderBy:{number:"desc"},select:{number:true}})
  const version=await tx.municipalFormVersion.create({data:{ticketId,number:(last?.number||0)+1,status:blockers.length?"needs_information":isMunicipalCorrection?"awaiting_professional":"awaiting_municipality",definition:json(resolved.definition),contextSnapshot:json({...context,processVersion:ticket.process.version,contextHash:digest(context),pendingRequestId:request?.id||null,contextIncomplete:blockers.some(b=>b.startsWith("Falta informar")||b.startsWith("Quais campos")||b.startsWith("Há evidências"))}),changeSet:json(changes),blockers:json(blockers),generatedBy:resolved.mode,operationKey:key,requestMessageId:request?.id,previousVersionId:previous?.id,municipalityDecision:isMunicipalCorrection?"changes_applied":null,testResults:json({automatic,definitionHash:digest(resolved.definition),manual:null}),reviewTokenHash:digest(token),reviewExpiresAt:new Date(Date.now()+7*86400000)}})
  await tx.municipalTicket.update({where:{id:ticket.id},data:{currentVersionId:version.id,status:version.status,...(isMunicipalCorrection?{clarificationRounds:{increment:1}}:{})}})
  await tx.municipalTicketMessage.create({data:{workspaceId:ticket.workspaceId,ticketId,formVersionId:version.id,kind:"event",direction:"system",author:"Sistema",content:manualDefinition?`Edição profissional · versão ${version.number}. Versão anterior preservada.`:request?`Correção automática · versão ${version.number}. Versão anterior preservada.`:`Formulário gerado · versão ${version.number}.`,metadata:json({changes,mode:resolved.mode})}})
  let message
  if(blockers.length)message=await tx.municipalTicketMessage.create({data:{workspaceId:ticket.workspaceId,ticketId,formVersionId:version.id,kind:"clarification",direction:"sent",author:"Sistema",content:`Precisamos esclarecer antes de enviar o formulário v${version.number}:\n${blockers.map((b,i)=>`${i+1}. ${b}`).join("\n")}\nResponda pelo Ticket ou acesse: ${publicBase().replace(/\/$/,"")}/review/${version.id}#${token}`,deliveryStatus:ticket.connectorAccountId?"pending":"internal",externalKey:`clarification:${version.id}`}})
  else message=await formMessage(tx,ticket,version,token,isMunicipalCorrection)
  if(request)await tx.municipalTicketMessage.update({where:{id:request.id},data:{metadata:json({...requestMetadata,processed:true,resultVersionId:version.id})}})
  return{version,message}
 })
 await enqueueTicket(ticket.id,"deliver","workflow",result.message.id,result.message.id)
 return result.version
}
async function delivery(messageId:string,workspaceId:string){
 const message=await prisma.municipalTicketMessage.findFirst({where:{id:messageId,workspaceId},include:{ticket:true}});if(!message)throw new Error("Mensagem não encontrada.")
 if(["sent","delivered","read"].includes(message.deliveryStatus))return
 if(message.deliveryStatus==="sending")throw new Error("O envio anterior não foi confirmado. Confira o conector antes de solicitar uma nova tentativa.")
 const account=message.ticket.connectorAccountId?await prisma.connectorAccount.findFirst({where:{id:message.ticket.connectorAccountId,workspaceId}}):null
 if(!account||!message.ticket.recipient){await prisma.municipalTicketMessage.update({where:{id:message.id},data:{deliveryStatus:"internal",errorMessage:"Disponível no Ticket. Conector e destinatário não configurados para entrega externa."}});return}
 const hasUrl=/https:\/\//.test(publicBase())
 if(!hasUrl&&["form","clarification"].includes(message.kind))throw new Error("Configure um endereço HTTPS público no Ticket antes de enviar links à prefeitura.")
 if(["form","clarification"].includes(message.kind)&&/http:\/\/(127\.0\.0\.1|localhost)/.test(message.content))throw new Error("Esta mensagem contém um link local. Gere uma nova versão após configurar o endereço público.")
 if(message.formVersionId){const form=await prisma.municipalFormVersion.findUnique({where:{id:message.formVersionId},select:{reviewExpiresAt:true}});if(form?.reviewExpiresAt&&form.reviewExpiresAt.getTime()<Date.now())throw new Error("O link de revisão expirou. Gere uma nova versão para enviar um link válido.")}
 const claim=await prisma.municipalTicketMessage.updateMany({where:{id:message.id,deliveryStatus:{in:["pending","failed","internal"]}},data:{deliveryStatus:"sending",errorMessage:null}});if(!claim.count)return
 const outbound=await prisma.outboundMessage.upsert({where:{idempotencyKey:`municipal:${message.id}`},update:{status:"approved",errorMessage:null},create:{channel:account.provider,connectorAccountId:account.id,recipient:message.ticket.recipient,subject:"Validação de formulário municipal",content:message.content,riskLevel:"medium",messageKind:"municipal_ticket",status:"approved",approvedBy:"workflow:municipal-ticket",approvedAt:new Date(),idempotencyKey:`municipal:${message.id}`}})
 try{
  if(account.provider==="whatsapp"){
   const last=await prisma.whatsAppChatMessage.findFirst({where:{workspaceId,accountId:account.id,phone:message.ticket.recipient,direction:"received"},orderBy:{createdAt:"desc"}})
   if(!last||Date.now()-last.createdAt.getTime()>86400000)throw new Error("Janela de atendimento WhatsApp fechada. Aguarde uma mensagem do contato ou use outro conector já configurado.")
  }
  const externalId=await sendWithProvider(account,message.ticket.recipient,outbound.subject,message.content)
  await prisma.$transaction([prisma.municipalTicketMessage.update({where:{id:message.id},data:{deliveryStatus:"sent",externalId,errorMessage:null}}),prisma.outboundMessage.update({where:{id:outbound.id},data:{status:"sent",externalId,sentAt:new Date()}})])
  await ticketEvent(message.ticketId,`Enviado à prefeitura pelo conector ${account.provider}.`,"event",message.formVersionId||undefined,{messageId:message.id})
 }catch(e){const error=e instanceof Error?e.message:"Falha no envio";await prisma.$transaction([prisma.municipalTicketMessage.update({where:{id:message.id},data:{deliveryStatus:"failed",errorMessage:error}}),prisma.outboundMessage.update({where:{id:outbound.id},data:{status:"failed",errorMessage:error}})]);throw e}
}
async function addInformation(ticketId:string,messageId:string){
 const ticket=await prisma.municipalTicket.findUniqueOrThrow({where:{id:ticketId},include:{process:true}}),message=await prisma.municipalTicketMessage.findUniqueOrThrow({where:{id:messageId}})
 const metadata=message.metadata as Record<string,unknown>;if(metadata.processed)return
 const sources=ticket.process.sources as unknown as Source[];const id=message.id
 if(!sources.some(s=>s.id===id)){
  const source:Source={id,name:message.author,content:message.content,type:message.channel,createdAt:message.createdAt.toISOString(),storageId:message.storageId||undefined,inboxId:message.inboxItemId||undefined}
  let rules:Rule[]
  const questionId=typeof metadata.collectionQuestionId==="string"?metadata.collectionQuestionId:null
  const question=questionId?await prisma.municipalTicketMessage.findFirst({where:{id:questionId,ticketId,kind:"question",workspaceId:ticket.workspaceId}}):null
  if(questionId&&!question)throw new Error("Pergunta não pertence a este Ticket.")
  if(question){
   const category=(question.metadata as {category:Rule["category"]}).category
   const interpreted=interpretCollectionAnswer(category,message.content)
   source.content=`Pergunta: ${question.content}\nResposta: ${message.content}`;source.analysisMode="local:targeted-answer-v1"
   rules=(ticket.process.rules as unknown as Rule[]).map(rule=>{
    if(rule.category!==category)return rule
    const revision={...rule,version:rule.version+1,status:"proposed" as const,approvalCode:crypto.randomUUID().slice(0,8).toUpperCase()}
    if(!interpreted.value)return{...revision,conflict:{value:message.content,sourceId:source.id,excerpt:message.content}}
    if(rule.status==="approved"&&rule.value!==interpreted.value)return{...revision,conflict:{value:interpreted.value,sourceId:source.id,excerpt:source.content}}
    return{...revision,value:interpreted.value,sourceId:source.id,excerpt:source.content,conflict:undefined,approvedBy:undefined,approvedAt:undefined}
   })
   const pending=rules.some(r=>r.category===category&&r.conflict)
   await prisma.municipalTicketMessage.update({where:{id:question.id},data:{metadata:json({...question.metadata as Record<string,unknown>,collectionStatus:pending?"needs_clarification":"answered",answerMessageId:message.id,clarification:interpreted.question||null})}})
  }else rules=await proposeWithAgent(ticket.process.rules as unknown as Rule[],source)
  const result=await prisma.municipalProcess.updateMany({where:{id:ticket.processId,workspaceId:ticket.workspaceId,version:ticket.process.version},data:{sources:json([...sources,source]),rules:json(rules),version:{increment:1},status:"collecting",history:json([...(ticket.process.history as unknown as Audit[]),{at:new Date().toISOString(),actor:message.author,action:"ticket_information",details:`Informação recebida pelo Ticket ${ticket.id}`}])}})
  if(!result.count)throw new Error("O processo recebeu outra informação. A tarefa será retomada.")
 }
 await prisma.municipalTicketMessage.update({where:{id:message.id},data:{kind:"source",metadata:json({...metadata,informationAdded:true})}})
 await ticketEvent(ticket.id,"Informações recebidas pelo Ticket.","event",undefined,{messageId})
}
async function informationVersion(ticketId:string,messageId:string,key:string,actor:string){
 await addInformation(ticketId,messageId)
 const version=await createVersion(ticketId,`${key}:generation`,actor)
 const message=await prisma.municipalTicketMessage.findUniqueOrThrow({where:{id:messageId}})
 await prisma.municipalTicketMessage.update({where:{id:message.id},data:{metadata:json({...message.metadata as Record<string,unknown>,processed:true,resultVersionId:version.id})}})
 return version
}
async function processMessage(ticketId:string,messageId:string,key:string,actor:string){
 const ticket=await prisma.municipalTicket.findUniqueOrThrow({where:{id:ticketId},include:{versions:{orderBy:{number:"desc"}}}})
 let message=await prisma.municipalTicketMessage.findFirst({where:{id:messageId,ticketId}})
 if(!message)throw new Error("Mensagem não encontrada.")
 let metadata=message.metadata as Record<string,unknown>;if(metadata.processed)return
 if(metadata.informationAdded){const recovered=await prisma.municipalFormVersion.findUnique({where:{operationKey:`${key}:generation`}});if(recovered){await prisma.municipalTicketMessage.update({where:{id:message.id},data:{metadata:json({...metadata,processed:true,resultVersionId:recovered.id})}});return}}
 if(metadata.extractionPending&&message.storageId){
  const stored=await prisma.storedObject.findUniqueOrThrow({where:{id:message.storageId}}),bytes=await readStoredObject(stored.storageProvider,stored.storageKey)
  const form=new FormData();form.append("file",new Blob([new Uint8Array(bytes)],{type:stored.mimeType}),stored.originalName)
  const response=await fetch(`${process.env.PYTHON_BACKEND_URL||"http://127.0.0.1:8000"}/api/municipal/extract`,{method:"POST",body:form,signal:AbortSignal.timeout(60000)})
  const result=await response.json();if(!response.ok)throw new Error(result.detail||"Não foi possível extrair o anexo. O arquivo original está preservado no Ticket.")
  metadata={...metadata,extractionPending:false,extractor:result.extractor}
  message=await prisma.municipalTicketMessage.update({where:{id:message.id},data:{content:`${message.originalContent?.startsWith("[Anexo recebido:")?"":message.originalContent||""}\n\n${result.content}`,metadata:json(metadata)}})
 }
 let decision=metadata.decision as string|undefined,target=message.formVersionId||undefined,text=message.content
 const command=text.trim().match(/^(ACEITAR|AJUSTAR)\s+([A-Z0-9]{8})(?:\s*:\s*([\s\S]+))?$/i)
 if(command){target=ticket.versions.find(v=>v.id.slice(-8).toUpperCase()===command[2].toUpperCase())?.id;decision=command[1].toUpperCase()==="ACEITAR"?"accept":"changes";if(decision==="changes")text=command[3]?.trim()||""}
 if(decision){
  if(!target||target!==ticket.currentVersionId){await prisma.municipalTicketMessage.update({where:{id:message.id},data:{metadata:json({...metadata,processed:true,rejected:"stale_version"})}});await ticketEvent(ticketId,"Solicitação não aplicada: a versão indicada está ausente ou foi substituída. Informe o código da versão atual.","clarification");return}
  const version=ticket.versions.find(v=>v.id===target)!
  if(decision==="accept"){
   if((version.blockers as string[]).length)throw new Error("A versão possui pendências e ainda não pode ser aceita.")
   if(version.status==="approved"||version.municipalityDecision==="accepted"){await prisma.municipalTicketMessage.update({where:{id:message.id},data:{metadata:json({...metadata,processed:true})}});return}
   await prisma.$transaction(async tx=>{
    const lock=await tx.municipalTicket.updateMany({where:{id:ticketId,currentVersionId:target,revision:ticket.revision},data:{status:"awaiting_professional",revision:{increment:1}}});if(!lock.count)throw new Error("A versão mudou durante a análise.")
    await tx.municipalFormVersion.update({where:{id:target},data:{status:"awaiting_professional",municipalityDecision:"accepted",reviewedAt:new Date(),reviewedBy:message.author}})
    await tx.municipalTicketMessage.update({where:{id:message.id},data:{kind:"acceptance",metadata:json({...metadata,processed:true})}})
   });await ticketEvent(ticketId,"Prefeitura aceitou o formulário. Aguardando validação final do profissional.","event",target);return
  }
  text=text.trim();if(!text)throw new Error("Descreva os ajustes solicitados.")
  if((version.contextSnapshot as Record<string,unknown>).contextIncomplete){await informationVersion(ticketId,message.id,key,actor);return}
  await prisma.municipalTicketMessage.update({where:{id:message.id},data:{kind:"change_request",formVersionId:target,content:text,metadata:json({...metadata,decision:"changes"})}})
  await ticketEvent(ticketId,"Prefeitura solicitou alterações.","event",target,{messageId:message.id})
  await createVersion(ticketId,key,actor,message.id)
  return
 }
 if(metadata.sourceInformation){await informationVersion(ticketId,messageId,key,actor);return}
 const current=ticket.versions.find(v=>v.id===ticket.currentVersionId)
 if(current&&current.status!=="needs_information"){
  await prisma.municipalTicketMessage.update({where:{id:message.id},data:{metadata:json({...metadata,processed:true,needsVersion:true})}})
  const response=await ticketEvent(ticketId,`A mensagem foi preservada. Para relacionar uma alteração à versão correta, responda AJUSTAR ${current.id.slice(-8).toUpperCase()}: descreva o ajuste, ou use o link do formulário.`,"clarification",current.id)
  await prisma.municipalTicketMessage.update({where:{id:response.id},data:{direction:"sent",deliveryStatus:"pending"}});await enqueueTicket(ticketId,"deliver","workflow",response.id,response.id);return
 }
 await informationVersion(ticketId,messageId,key,actor)
}
export async function runTicketJob(payload:Prisma.JsonValue,workspaceId:string,jobKey:string,actor:string){
 await refreshTicketRuntime()
 const p=payload as Record<string,string>,ticket=await prisma.municipalTicket.findFirst({where:{id:p.ticketId,workspaceId}});if(!ticket)throw new Error("Ticket não encontrado no ambiente da tarefa.")
 try{
  if(p.operation==="deliver")await delivery(p.messageId,workspaceId)
  else if(p.operation==="message")await processMessage(ticket.id,p.messageId,jobKey,actor)
  else {
   const expected=(payload as Record<string,unknown>).expectedContextHash
   if(typeof expected==="string"){const process=await prisma.municipalProcess.findUniqueOrThrow({where:{id:ticket.processId}});if(digest(contextOf(process))!==expected)return{ticketId:ticket.id,operation:"skipped_stale"}}
   await createVersion(ticket.id,jobKey,actor)
  }
 }catch(e){
  const error=e instanceof Error?e.message:"Falha no processamento"
  if(p.operation==="deliver"&&p.messageId)await prisma.municipalTicketMessage.updateMany({where:{id:p.messageId,workspaceId,deliveryStatus:{notIn:["sent","delivered","read"]}},data:{deliveryStatus:"failed",errorMessage:error}})
  else{await prisma.municipalTicket.updateMany({where:{id:ticket.id,revision:ticket.revision,currentVersionId:ticket.currentVersionId},data:{status:"processing_failed"}});await ticketEvent(ticket.id,`Falha de processamento: ${error}. A tarefa pode ser retomada.`,"error")}
  throw e
 }
 const pending=await prisma.municipalTicketMessage.findMany({where:{ticketId:ticket.id,direction:"sent",deliveryStatus:"pending"},select:{id:true}})
 for(const message of pending)await enqueueTicket(ticket.id,"deliver","workflow",message.id,message.id)
 return{ticketId:ticket.id,operation:p.operation}
}
export async function manualFormVersion(workspaceId:string,ticketId:string,actor:string,definition:FormDefinition,requestKey:string,noteId?:string){
 const ticket=await prisma.municipalTicket.findFirst({where:{id:ticketId,workspaceId}});if(!ticket)throw new Error("Ticket não encontrado.")
 return createVersion(ticket.id,`manual:${ticket.id}:${requestKey}`,actor,noteId,definition)
}
export async function checkForm(versionId:string,values:FormValues,actor:string,workspaceId?:string){
 const version=await prisma.municipalFormVersion.findFirst({where:{id:versionId,...(workspaceId?{ticket:{workspaceId}}:{})},include:{ticket:true}});if(!version)throw new Error("Formulário não encontrado.")
 if(version.ticket.currentVersionId!==version.id||version.status==="approved")throw new Error("Esta versão está arquivada ou aprovada; gere nova versão para alterar seus testes.")
 const definition=definitionSchema.parse(version.definition),result=validateValues(definition,values),previous=version.testResults as Record<string,unknown>
 const saved=await prisma.municipalFormVersion.updateMany({where:{id:versionId,status:{not:"approved"},ticket:{currentVersionId:versionId}},data:{testResults:json({...previous,[workspaceId?"manual":"publicPreview"]:{...result,actor,at:new Date().toISOString(),definitionHash:digest(definition)}})}})
 if(!saved.count)throw new Error("A versão mudou ou foi aprovada durante o teste.")
 return result
}
export async function reviewAccess(versionId:string,token:string){
 const version=await prisma.municipalFormVersion.findUnique({where:{id:versionId},include:{ticket:{include:{process:true}}}})
 const hash=digest(token),expected=version?.reviewTokenHash
 if(!version||!expected||hash.length!==expected.length||!timingSafeEqual(Buffer.from(hash),Buffer.from(expected))||!version.reviewExpiresAt||version.reviewExpiresAt.getTime()<Date.now())throw new Error("Link de revisão inválido ou expirado.")
 return version
}
export async function routeConnectorToTicket(input:{workspaceId:string;accountId?:string|null;externalId:string;channel:string;content:string;author:string;phone?:string|null;email?:string|null;inboxItemId?:string|null;whatsappMessageId?:string|null;storageId?:string|null;replyTo?:string|null}){
 if(!input.phone&&!input.email)return null
 if(/^(CONFIRMAR|CORRIGIR)\s+[A-F0-9]{8}/i.test(input.content.trim()))return null
 const identity=input.phone?{contactPhone:input.phone}:{contactEmail:{equals:input.email!,mode:"insensitive" as const}}
 let processId:string|undefined,versionId:string|undefined,decision:"accept"|"changes"|undefined
 if(input.replyTo){const replied=await prisma.municipalTicketMessage.findFirst({where:{workspaceId:input.workspaceId,externalId:input.replyTo,ticket:{process:identity}},include:{ticket:true}});if(replied){processId=replied.ticket.processId;versionId=replied.formVersionId||undefined;decision=/^(aceito|aprovado|de acordo|ok)[.!]?$/i.test(input.content.trim())?"accept":"changes"}}
 const code=input.content.trim().match(/^(ACEITAR|AJUSTAR)\s+([A-Z0-9]{8})/i)
 if(!processId&&code){const matches=await prisma.municipalFormVersion.findMany({where:{id:{endsWith:code[2].toLowerCase()},ticket:{workspaceId:input.workspaceId,process:identity}},include:{ticket:true},take:2});if(matches.length===1){processId=matches[0].ticket.processId;versionId=matches[0].id}}
 if(!processId){const processes=await prisma.municipalProcess.findMany({where:{workspaceId:input.workspaceId,...identity},take:2});if(processes.length!==1)return null;processId=processes[0].id}
 const ticket=await ensureTicket(input.workspaceId,processId)
 if(ticket.connectorAccountId&&input.accountId&&ticket.connectorAccountId!==input.accountId)return null
 return appendTicketInput({workspaceId:input.workspaceId,ticketId:ticket.id,content:input.content,author:input.author,channel:input.channel,externalKey:`connector:${input.accountId||input.channel}:${input.externalId}`,inboxItemId:input.inboxItemId||undefined,whatsappMessageId:input.whatsappMessageId||undefined,storageId:input.storageId||undefined,versionId,decision})
}

export async function repairPendingTicketDeliveries(){const pending=await prisma.municipalTicketMessage.findMany({where:{direction:"sent",deliveryStatus:"pending"},select:{id:true,ticketId:true},take:400});for(const message of pending)await enqueueTicket(message.ticketId,"deliver","workflow",message.id,message.id)}
