import {syncMunicipalCase} from "@/lib/municipal/case-sync"
import {NextRequest,NextResponse} from "next/server"
import {z} from "zod"
import {prisma} from "@/lib/prisma"
import {currentActor} from "@/lib/auth/current-actor"
import {sameOrigin} from "@/lib/request-origin"
import {json} from "@/lib/municipal/service"
import {definitionSchema} from "@/lib/municipal/forms"
import {appendTicketInput,checkForm,contextOf,digest,enqueueTicket,manualFormVersion,ticketEvent,TICKET_JOB} from "@/lib/municipal/tickets"
type Context={params:Promise<{id:string}>}
export async function GET(_req:NextRequest,ctx:Context){
 const actor=await currentActor(),{id}=await ctx.params
 const ticket=await prisma.municipalTicket.findFirst({where:{id,workspaceId:actor.workspaceId},include:{process:true,versions:{orderBy:{number:"desc"}},messages:{orderBy:{createdAt:"asc"}}}})
 if(!ticket)return NextResponse.json({error:"Ticket não encontrado."},{status:404})
 const jobs=await prisma.backgroundJob.findMany({where:{workspaceId:actor.workspaceId,type:TICKET_JOB,payload:{path:["ticketId"],equals:id}},select:{id:true,status:true,progressMessage:true,lastError:true,createdAt:true},orderBy:{createdAt:"desc"},take:15})
 const approved=ticket.versions.filter(v=>v.approvedAt),durations=approved.map(v=>Math.round((v.approvedAt!.getTime()-v.createdAt.getTime())/60000))
 return NextResponse.json({...ticket,versions:ticket.versions.map(version=>({...version,isDraft:version.status!=="approved",reviewTokenHash:undefined})),jobs,metrics:{minutesSpent:ticket.minutesSpent,clarificationRounds:ticket.clarificationRounds,approvedForms:approved.length,minutesToLatestApproval:durations[0]??null,totalCycleMinutes:approved[0]?Math.round((approved[0].approvedAt!.getTime()-ticket.createdAt.getTime())/60000):null,baselineMinutes:ticket.baselineMinutes,recordedDifference:ticket.baselineMinutes===null?null:ticket.baselineMinutes-ticket.minutesSpent}})
}
const command=z.object({action:z.enum(["send","message","generate","test","approve","return","edit","configure","minutes","round","retry_delivery","retry_job"]),requestKey:z.string().uuid().optional(),content:z.string().trim().min(1).max(100000).optional(),versionId:z.string().optional(),values:z.record(z.string(),z.unknown()).optional(),definition:definitionSchema.optional(),accountId:z.string().nullable().optional(),recipient:z.string().max(250).nullable().optional(),minutes:z.number().int().min(1).max(480).optional(),baselineMinutes:z.number().int().min(1).max(100000).optional(),messageId:z.string().optional(),jobId:z.string().optional(),decision:z.enum(["accept","changes"]).optional(),resolvePending:z.boolean().optional(),information:z.boolean().optional(),whatsappMessageId:z.string().optional()})
export async function POST(req:NextRequest,ctx:Context){
 if(!sameOrigin(req))return NextResponse.json({error:"Origem inválida."},{status:403})
 try{
  const actor=await currentActor(),{id}=await ctx.params,c=command.parse(await req.json())
  if(!["owner","admin","member","professional","reviewer"].includes(actor.role))return NextResponse.json({error:"Sem permissão para operar este Ticket."},{status:403})
  const ticket=await prisma.municipalTicket.findFirst({where:{id,workspaceId:actor.workspaceId},include:{process:true}});if(!ticket)return NextResponse.json({error:"Ticket não encontrado."},{status:404})
  if(c.action==="generate"){if(!c.requestKey)throw new Error("Identificador da operação ausente.");const job=await enqueueTicket(id,"generate",actor.userProfileId,c.requestKey);return NextResponse.json({queued:true,jobId:job.id},{status:202})}
  if(c.action==="send"){
   if(!c.content||!c.requestKey)throw new Error("Informe a mensagem.")
   const message=await prisma.municipalTicketMessage.upsert({where:{externalKey:`send:${id}:${c.requestKey}`},update:{},create:{workspaceId:actor.workspaceId,ticketId:id,content:c.content,author:actor.userProfileId,direction:"sent",kind:"text",formVersionId:c.versionId||null,externalKey:`send:${id}:${c.requestKey}`,deliveryStatus:ticket.connectorAccountId?"pending":"internal"}})
   await enqueueTicket(id,"deliver",actor.userProfileId,message.id,message.id)
   return NextResponse.json({messageId:message.id,queued:true},{status:202})
  }
  if(c.action==="message"){
   if(!c.content||!c.requestKey)throw new Error("Informe a mensagem.")
   if(c.versionId&&c.versionId!==ticket.currentVersionId)throw new Error("A versão mudou. Abra o formulário atual.")
   const original=c.whatsappMessageId?await prisma.whatsAppChatMessage.findFirst({where:{id:c.whatsappMessageId,workspaceId:actor.workspaceId,direction:"received"}}):null
   if(c.whatsappMessageId&&!original)throw new Error("Mensagem original não encontrada.")
   const originalAttachments=original?.attachments as unknown as Array<{id:string}>|undefined
   const message=await appendTicketInput({workspaceId:actor.workspaceId,ticketId:id,content:original?.content||c.content,author:original?.contactName||original?.phone||actor.userProfileId,externalKey:original?`connector:${original.accountId}:${original.providerId||original.id}`:`internal:${id}:${c.requestKey}`,versionId:c.versionId,decision:c.decision,resolvePending:c.resolvePending,information:c.information,whatsappMessageId:original?.id,storageId:originalAttachments?.[0]?.id})
   return NextResponse.json({messageId:message.id,queued:true},{status:202})
  }
  if(c.action==="configure"){
   const account=c.accountId?await prisma.connectorAccount.findFirst({where:{id:c.accountId,workspaceId:actor.workspaceId,provider:{in:["whatsapp","gmail","outlook"]}}}):null
   if(c.accountId&&!account)throw new Error("Conector não encontrado neste ambiente ou sem envio de mensagens.")
   const recipient=c.recipient?.trim()||null
   if(account?.provider==="whatsapp"&&(!recipient||!/^\d{10,15}$/.test(recipient)))throw new Error("Informe o telefone com DDI e DDD, somente números.")
   if(account&&account.provider!=="whatsapp"&&(!recipient||!z.email().safeParse(recipient).success))throw new Error("Informe o e-mail do responsável.")
   await prisma.$transaction([prisma.municipalTicket.update({where:{id},data:{connectorAccountId:account?.id||null,recipient,baselineMinutes:c.baselineMinutes??ticket.baselineMinutes,revision:{increment:1}}}),prisma.municipalProcess.update({where:{id:ticket.processId},data:account?.provider==="whatsapp"?{contactPhone:recipient}:account?{contactEmail:recipient}:{}})])
   await ticketEvent(id,account?`Entrega externa vinculada ao conector ${account.provider}.`:"Entrega mantida somente no Ticket.")
   return NextResponse.json({saved:true})
  }
  if(c.action==="minutes"||c.action==="round"){if(c.action==="minutes"&&!c.minutes)throw new Error("Informe os minutos.");await prisma.municipalTicket.update({where:{id},data:c.action==="minutes"?{minutesSpent:{increment:c.minutes!}}:{clarificationRounds:{increment:1}}});return NextResponse.json({saved:true})}
  if(c.action==="retry_delivery"){
   const message=await prisma.municipalTicketMessage.findFirst({where:{id:c.messageId,ticketId:id,direction:"sent"}});if(!message||["sent","delivered","read","sending"].includes(message.deliveryStatus))throw new Error("Essa mensagem já foi enviada ou está em envio.")
   await prisma.backgroundJob.updateMany({where:{workspaceId:actor.workspaceId,type:TICKET_JOB,payload:{path:["messageId"],equals:message.id},status:{in:["failed","dead_letter"]}},data:{status:"cancelled",progressMessage:"Substituída por nova tentativa solicitada no Ticket"}});await prisma.municipalTicketMessage.update({where:{id:message.id},data:{deliveryStatus:"pending"}});const job=await enqueueTicket(id,"deliver",actor.userProfileId,c.requestKey||crypto.randomUUID(),message.id);return NextResponse.json({queued:true,jobId:job.id},{status:202})
  }
  if(c.action==="retry_job"){
   const job=await prisma.backgroundJob.findFirst({where:{id:c.jobId,workspaceId:actor.workspaceId,type:TICKET_JOB,payload:{path:["ticketId"],equals:id},status:{in:["failed","dead_letter","cancelled"]}}});if(!job)throw new Error("Tarefa não encontrada ou já em execução.")
   await prisma.backgroundJob.update({where:{id:job.id},data:{status:"queued",availableAt:new Date(),attempts:0,lastError:null,completedAt:null,deadLetteredAt:null,cancelRequestedAt:null,lockedAt:null,lockedBy:null}});return NextResponse.json({queued:true},{status:202})
  }
  const version=await prisma.municipalFormVersion.findFirst({where:{id:c.versionId||ticket.currentVersionId||"",ticketId:id}})
  if(!version||version.id!==ticket.currentVersionId)return NextResponse.json({error:"Esta versão não é a versão atual."},{status:409})
  if(c.action==="test"){if(!c.values)throw new Error("Preencha os campos para testar.");return NextResponse.json(await checkForm(version.id,c.values,actor.userProfileId,actor.workspaceId))}
  if(c.action==="edit"){
   if(!c.definition||!c.content||!c.requestKey)throw new Error("Informe os campos e a justificativa da edição.")
   const note=await prisma.municipalTicketMessage.upsert({where:{externalKey:`edit:${id}:${c.requestKey}`},update:{},create:{workspaceId:actor.workspaceId,ticketId:id,direction:"received",kind:"professional_edit",author:actor.userProfileId,content:c.content,formVersionId:version.id,metadata:json({resolvePending:c.resolvePending||false}),externalKey:`edit:${id}:${c.requestKey}`}})
   const previous=definitionSchema.parse(version.definition),definition=structuredClone(c.definition)
   for(const field of definition.fields)if(JSON.stringify(field)!==JSON.stringify(previous.fields.find(f=>f.id===field.id)))field.evidence=[...field.evidence,{sourceId:note.id,excerpt:c.content}]
   for(const section of definition.sections)if(JSON.stringify(section)!==JSON.stringify(previous.sections.find(s=>s.id===section.id)))section.evidence=[...section.evidence,{sourceId:note.id,excerpt:c.content}]
   const result=await manualFormVersion(actor.workspaceId,id,actor.userProfileId,definition,c.requestKey,note.id)
   return NextResponse.json({versionId:result.id,number:result.number})
  }
  if(version.status==="approved")return NextResponse.json(c.action==="approve"?{approved:true}:{error:"Crie uma nova versão para modificar uma versão aprovada."},{status:c.action==="approve"?200:409})
  if(c.action==="return"){
   if(!c.content)throw new Error("Descreva o esclarecimento necessário.")
   await prisma.$transaction([prisma.municipalFormVersion.update({where:{id:version.id},data:{status:"needs_information",blockers:json([...(version.blockers as string[]),c.content])}}),prisma.municipalTicket.update({where:{id},data:{status:"needs_information",revision:{increment:1}}})])
   const message=await ticketEvent(id,`Profissional solicitou esclarecimento: ${c.content}`,"clarification",version.id);await prisma.municipalTicketMessage.update({where:{id:message.id},data:{direction:"sent",deliveryStatus:"pending"}});await enqueueTicket(id,"deliver",actor.userProfileId,message.id,message.id);return NextResponse.json({returned:true})
  }
  if(c.action==="approve"){
   if(!["owner","admin","professional","reviewer"].includes(actor.role))return NextResponse.json({error:"A aprovação final exige um profissional autorizado."},{status:403})
   const tests=version.testResults as {automatic?:{passed:boolean};definitionHash?:string;manual?:{valid:boolean;actor:string;definitionHash:string}},snapshot=version.contextSnapshot as {processVersion?:number;contextHash?:string}
   if(version.status!=="awaiting_professional"||!version.municipalityDecision)throw new Error("Aguarde a análise da prefeitura ou a aplicação das correções solicitadas.")
   if((version.blockers as string[]).length)throw new Error("Resolva as pendências antes da aprovação.")
   if(!tests.automatic?.passed||!tests.manual?.valid||tests.manual.actor!==actor.userProfileId||tests.manual.definitionHash!==digest(version.definition))throw new Error("Teste o preenchimento desta versão com seu usuário profissional antes de aprovar.")
   if((snapshot.contextHash||digest(contextOf(version.contextSnapshot as unknown as Parameters<typeof contextOf>[0])))!==digest(contextOf(ticket.process)))throw new Error("As regras do processo mudaram. Gere uma versão atualizada antes de aprovar.")
   await prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT "id" FROM "MunicipalFormVersion" WHERE "id" = ${version.id} FOR UPDATE`;const fresh=await tx.municipalFormVersion.findUniqueOrThrow({where:{id:version.id}});const latestTests=fresh.testResults as typeof tests;if(!latestTests.manual?.valid||latestTests.manual.actor!==actor.userProfileId||latestTests.manual.definitionHash!==digest(fresh.definition))throw new Error("O resultado do teste mudou. Valide novamente antes de aprovar.");const lock=await tx.municipalTicket.updateMany({where:{id,revision:ticket.revision,currentVersionId:version.id},data:{status:"approved",approvedVersionId:version.id,revision:{increment:1}}});if(!lock.count)throw new Error("O Ticket mudou durante a aprovação.");await tx.municipalFormVersion.update({where:{id:version.id},data:{status:"approved",approvedBy:actor.userProfileId,approvedAt:new Date()}});await tx.municipalTicketMessage.create({data:{workspaceId:actor.workspaceId,ticketId:id,formVersionId:version.id,kind:"event",direction:"system",author:actor.userProfileId,content:`Validação final concluída. Formulário v${version.number} aprovado.`,externalKey:`approval:${version.id}`}})})
   try{await syncMunicipalCase(id)}catch(error){console.error("Municipal case projection:",error);return NextResponse.json({approved:true,warning:"Aprovação registrada; a visão do município precisa ser sincronizada."})}
   return NextResponse.json({approved:true})
  }
  throw new Error("Operação indisponível.")
 }catch(e){return NextResponse.json({error:e instanceof z.ZodError?"Confira os dados obrigatórios, os rótulos e os tipos dos campos.":e instanceof Error?e.message:"Não foi possível processar o Ticket."},{status:400})}
}
