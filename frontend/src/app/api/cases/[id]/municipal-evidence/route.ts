import {NextRequest,NextResponse} from "next/server"
import {prisma} from "@/lib/prisma"
import {currentActor} from "@/lib/auth/current-actor"
export async function GET(req:NextRequest,ctx:{params:Promise<{id:string}>}){
 const actor=await currentActor(),{id}=await ctx.params
 const record=await prisma.case.findFirst({where:{id,workspaceId:actor.workspaceId},include:{municipalProcess:true}})
 const process=record?.municipalProcess
 if(!process||process.workspaceId!==actor.workspaceId)return NextResponse.json({error:"Fonte municipal não encontrada."},{status:404})
 const sources=process.sources as Array<{id:string;name:string;content:string}>,source=sources.find(s=>s.id===req.nextUrl.searchParams.get("source"))
 if(!source)return NextResponse.json({error:"Fonte municipal não encontrada."},{status:404})
 return new NextResponse(`${process.municipality} · ${process.name}\n${source.name}\n\n${source.content}`,{headers:{"Content-Type":"text/plain; charset=utf-8","Content-Disposition":'attachment; filename="levantamento-municipal.txt"',"Cache-Control":"private, no-store"}})
}
