import {NextRequest,NextResponse} from "next/server"
import {prisma} from "@/lib/prisma"
import {sameOrigin} from "@/lib/request-origin"
import {currentActor} from "@/lib/auth/current-actor"
import {persistAttachment,readStoredObject} from "@/lib/connectors/storage"
import {appendTicketInput} from "@/lib/municipal/tickets"
async function identity(_req:NextRequest,id:string){const actor=await currentActor();const ticket=await prisma.municipalTicket.findFirst({where:{id,workspaceId:actor.workspaceId}});if(!ticket)throw new Error("Ticket não encontrado.");return{workspaceId:actor.workspaceId,ticketId:id,versionId:ticket.currentVersionId||undefined,actor:actor.userProfileId,public:false}}
export async function POST(req:NextRequest,ctx:{params:Promise<{id:string}>}){
 if(!sameOrigin(req))return NextResponse.json({error:"Origem inválida."},{status:403})
 try{const {id}=await ctx.params,who=await identity(req,id),form=await req.formData(),file=form.get("file"),key=form.get("requestKey"),content=String(form.get("content")||"").slice(0,10000),author=String(form.get("author")||who.actor).slice(0,120)
 if(!(file instanceof File)||!file.size||file.size>10*1024*1024)throw new Error("Envie um arquivo de até 10 MB.")
 if(typeof key!=="string"||!/^[a-f0-9-]{36}$/i.test(key))throw new Error("Identificador inválido.")
 const externalKey=`attachment:${who.ticketId}:${key}`,existing=await prisma.municipalTicketMessage.findUnique({where:{externalKey}})
 if(existing)return NextResponse.json({received:true,messageId:existing.id},{status:202})
 const stored=await persistAttachment({bytes:Buffer.from(await file.arrayBuffer()),name:file.name,mimeType:file.type||"application/octet-stream",sourceProvider:"municipal_ticket"})
 const message=await appendTicketInput({workspaceId:who.workspaceId,ticketId:who.ticketId,versionId:who.versionId,decision:who.versionId&&(who.public||form.get("decision")==="changes")?"changes":undefined,content:content||`[Anexo recebido: ${file.name}]`,author,externalKey,storageId:stored.id,extractionPending:true,information:form.get("information")==="true",resolvePending:form.get("resolvePending")==="true"})
 return NextResponse.json({received:true,messageId:message.id},{status:202})
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Falha ao receber anexo."},{status:400})}
}
export async function GET(req:NextRequest,ctx:{params:Promise<{id:string}>}){
 try{const {id}=await ctx.params,who=await identity(req,id),message=await prisma.municipalTicketMessage.findFirst({where:{id:req.nextUrl.searchParams.get("message")||"",ticketId:who.ticketId,workspaceId:who.workspaceId}})
 if(!message?.storageId)return new Response("Anexo não encontrado",{status:404});const stored=await prisma.storedObject.findUniqueOrThrow({where:{id:message.storageId}}),bytes=await readStoredObject(stored.storageProvider,stored.storageKey)
 return new Response(new Uint8Array(bytes),{headers:{"Content-Type":stored.mimeType,"Content-Disposition":`attachment; filename*=UTF-8''${encodeURIComponent(stored.originalName)}`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}})
 }catch{return new Response("Acesso inválido",{status:403})}
}
