import {NextRequest,NextResponse} from "next/server"
import {z} from "zod"
import {prisma} from "@/lib/prisma"
import {sameOrigin} from "@/lib/request-origin"
import {appendTicketInput,checkForm,reviewAccess} from "@/lib/municipal/tickets"
function token(req:NextRequest){return req.headers.get("authorization")?.replace(/^Bearer /,"")||""}
type Context={params:Promise<{id:string}>}
export async function GET(req:NextRequest,ctx:Context){try{const {id}=await ctx.params;const version=await reviewAccess(id,token(req));return NextResponse.json({id:version.id,number:version.number,status:version.status,definition:version.definition,blockers:version.blockers,stale:version.ticket.currentVersionId!==version.id,approvedActive:version.ticket.approvedVersionId===version.id,context:{municipality:version.ticket.process.municipality,department:version.ticket.process.department,process:version.ticket.process.name},changes:version.changeSet},{headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}})}catch{return NextResponse.json({error:"Link de revisão inválido ou expirado."},{status:403})}}
const input=z.object({action:z.enum(["accept","changes","test"]),content:z.string().trim().max(100000).optional(),author:z.string().trim().min(2).max(120),requestKey:z.string().uuid(),values:z.record(z.string(),z.unknown()).optional(),resolvePending:z.boolean().optional()})
export async function POST(req:NextRequest,ctx:Context){
 if(!sameOrigin(req))return NextResponse.json({error:"Origem inválida."},{status:403})
 try{const {id}=await ctx.params,version=await reviewAccess(id,token(req)),data=input.parse(await req.json())
 if(data.action!=="test"){const previous=await prisma.municipalTicketMessage.findUnique({where:{externalKey:`review:${id}:${data.requestKey}`}});if(previous){const expected=data.content||(data.action==="accept"?`Aceito o formulário v${version.number}.`:"");if(previous.originalContent!==expected||previous.author!==`Prefeitura: ${data.author}`)throw new Error("Identificador de resposta reutilizado com outros dados.");return NextResponse.json({received:true,messageId:previous.id,deduplicated:true},{status:202})}}
 if(version.ticket.currentVersionId!==version.id||version.status==="approved"&&data.action!=="changes")return NextResponse.json({error:"Esta versão foi substituída ou já está aprovada. Solicite o link atual pelo Ticket."},{status:409})
 if(data.action==="test")return NextResponse.json(await checkForm(id,data.values||{},`prefeitura:${data.author}`))
 if(data.action==="accept"&&(version.blockers as string[]).length)throw new Error("Existem pendências de informação. Responda pelo Ticket antes de aceitar.")
 if(data.action==="changes"&&!data.content)throw new Error("Descreva a alteração ou o esclarecimento.")
 const message=await appendTicketInput({workspaceId:version.ticket.workspaceId,ticketId:version.ticketId,content:data.content||(data.action==="accept"?`Aceito o formulário v${version.number}.`:""),author:`Prefeitura: ${data.author}`,externalKey:`review:${id}:${data.requestKey}`,channel:"review_link",versionId:id,decision:data.action==="accept"?"accept":"changes",resolvePending:data.resolvePending})
 return NextResponse.json({received:true,messageId:message.id},{status:202})
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Falha ao registrar análise."},{status:400})}
}
