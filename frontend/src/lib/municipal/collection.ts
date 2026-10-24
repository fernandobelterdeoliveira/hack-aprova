import {syncMunicipalCase} from "./case-sync"
import {prisma} from "@/lib/prisma"
import {json} from "./service"
import {ensureTicket,appendTicketInput,enqueueTicket,digest,contextOf} from "./tickets"
import {collectionGaps} from "./collection-domain"
import {categories,type Rule,type Source} from "./domain"
import {z} from "zod"
export class CollectionError extends Error{constructor(message:string,public status=400){super(message)}}
const metadata=(value:unknown)=>value as Record<string,unknown>
async function scopedProcess(workspaceId:string,id:string){
 const process=await prisma.municipalProcess.findFirst({where:{id,workspaceId},include:{ticket:{include:{messages:{where:{kind:"question"},orderBy:{createdAt:"asc"}},versions:{orderBy:{number:"desc"},take:1}}}}})
 if(!process)throw new CollectionError("Processo municipal não encontrado.",404)
 return process
}
export async function collectionContext(workspaceId:string,id:string){
 const process=await scopedProcess(workspaceId,id),context=contextOf(process),missing=collectionGaps(context.rules,context.sources)
 const current=process.ticket?.versions[0]
 const questions=(process.ticket?.messages||[]).map(message=>{
  const m=metadata(message.metadata),gap=missing.find(g=>g.category===m.category)
  const status=!gap?"answered":m.ruleVersion!==gap.ruleVersion?"superseded":m.collectionStatus==="answered"?"open":m.collectionStatus||"open"
  return{id:message.id,category:m.category,text:message.content,status,answerMessageId:m.answerMessageId||null,clarification:m.clarification||null,createdAt:message.createdAt}
 })
 return{process:{id:process.id,municipality:process.municipality,department:process.department,name:process.name,owner:process.owner,version:process.version},ticketId:process.ticket?.id||null,known:context.rules.filter(rule=>!missing.some(g=>g.category===rule.category)).map(rule=>({category:rule.category,title:rule.title,value:rule.value,status:rule.status,sourceId:rule.sourceId,excerpt:rule.excerpt})),missing,pendingRuleApprovals:context.rules.filter(r=>r.value&&r.status!=="approved").length,sources:context.sources,questions,currentForm:current?{id:current.id,number:current.number,status:current.status,isDraft:current.status!=="approved",blockers:current.blockers}:null}
}
const questionResult=z.object({mode:z.string(),model:z.string().optional(),warning:z.string().optional(),questions:z.array(z.object({category:z.enum(categories),text:z.string().trim().min(8).max(500)})).max(5).optional()})
export async function generateCollectionQuestions(workspaceId:string,id:string){
 const process=await scopedProcess(workspaceId,id),ticket=await ensureTicket(workspaceId,id),gaps=collectionGaps(process.rules as Rule[],process.sources as Source[]).slice(0,5)
 const candidates=gaps.map(gap=>({...gap,text:gap.question}));let mode="local:context-gaps-v1",warning:string|undefined
 if(candidates.length){try{
  const response=await fetch(`${processEnvBackend()}/api/municipal/questions`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({context:contextOf(process),gaps}),signal:AbortSignal.timeout(14000)})
  if(!response.ok)throw new Error("Serviço de perguntas indisponível")
  const result=questionResult.parse(await response.json())
  if(result.warning)warning=result.warning
  if(result.mode==="gemini"){
   if(new Set(result.questions?.map(q=>q.category)).size!==result.questions?.length||result.questions?.some(q=>!gaps.some(g=>g.category===q.category)))throw new Error("Perguntas fora das lacunas ou repetidas")
   // The model can phrase known gaps, but cannot reintroduce answered categories.
   for(const candidate of candidates){const suggestion=result.questions?.find(q=>q.category===candidate.category);if(suggestion)candidate.text=suggestion.text}
   mode=`gemini:${result.model||"configured"}`
  }else if(result.mode!=="local")throw new Error("Resposta de IA inválida")
 }catch{warning="IA indisponível ou resposta inválida; perguntas geradas a partir das lacunas verificáveis no modo local."}}
 const fresh=await scopedProcess(workspaceId,id),remaining=collectionGaps(fresh.rules as Rule[],fresh.sources as Source[])
 for(const candidate of candidates){
  if(!remaining.some(g=>g.category===candidate.category&&g.ruleVersion===candidate.ruleVersion))continue
  const key=`collection-question:${ticket.id}:${candidate.category}:${candidate.ruleVersion}`
  const message=await prisma.municipalTicketMessage.upsert({where:{externalKey:key},update:{},create:{workspaceId,ticketId:ticket.id,kind:"question",direction:"sent",author:"Sistema",content:`${process.name}: ${candidate.text}`,externalKey:key,deliveryStatus:"awaiting_approval",metadata:json({category:candidate.category,ruleVersion:candidate.ruleVersion,collectionStatus:"open",reason:candidate.reason,mode})}})
  if(message.deliveryStatus==="pending")await enqueueTicket(ticket.id,"deliver","collection",message.id,message.id)
 }
 await syncMunicipalCase(ticket.id)
 const context=await collectionContext(workspaceId,id)
 return{ticketId:ticket.id,mode,...(warning?{warning}:{}),questions:context.questions.filter(q=>q.status==="open").slice(0,5),missing:context.missing}
}
function processEnvBackend(){return process.env.PYTHON_BACKEND_URL||"http://127.0.0.1:8000"}
export async function answerCollectionQuestion(workspaceId:string,id:string,input:{questionId:string;content:string;author:string;requestKey:string}){
 const process=await scopedProcess(workspaceId,id)
 if(!process.ticket)throw new CollectionError("Gere as perguntas antes de responder.",409)
 const question=process.ticket.messages.find(q=>q.id===input.questionId)
 if(!question)throw new CollectionError("Pergunta não pertence a este processo.",404)
 const key=`collection-answer:${process.ticket.id}:${input.requestKey}`,previous=await prisma.municipalTicketMessage.findUnique({where:{externalKey:key}})
 if(previous&&(previous.originalContent!==input.content||metadata(previous.metadata).collectionQuestionId!==question.id||previous.author!==input.author))throw new CollectionError("Identificador da resposta reutilizado com outros dados.",409)
 if(!previous){
  const m=metadata(question.metadata),gap=collectionGaps(process.rules as Rule[],process.sources as Source[]).find(g=>g.category===m.category)
  if(!gap||gap.ruleVersion!==m.ruleVersion)throw new CollectionError("A pergunta já foi respondida ou substituída. Consulte as pendências atuais.",409)
  const inFlight=await prisma.municipalTicketMessage.findFirst({where:{ticketId:process.ticket.id,direction:"received",metadata:{path:["collectionQuestionId"],equals:question.id}},orderBy:{createdAt:"desc"}})
  if(inFlight&&!metadata(inFlight.metadata).processed)throw new CollectionError("Uma resposta a esta pergunta ainda está em processamento.",409)
 }
 const message=await appendTicketInput({workspaceId,ticketId:process.ticket.id,content:input.content,author:input.author,externalKey:key,information:true,collectionQuestionId:question.id})
 return{messageId:message.id,ticketId:process.ticket.id,questionId:question.id,queued:!metadata(message.metadata).processed,deduplicated:Boolean(previous),operationKey:digest(key)}
}
