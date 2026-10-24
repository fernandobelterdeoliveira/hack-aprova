import {NextRequest,NextResponse} from "next/server"
import {prisma} from "@/lib/prisma"
import {currentActor} from "@/lib/auth/current-actor"
import {ensureTicket} from "@/lib/municipal/tickets"
export async function GET(request:NextRequest){
 try{const actor=await currentActor();const processId=request.nextUrl.searchParams.get("process");if(processId)await ensureTicket(actor.workspaceId,processId)
 const tickets=await prisma.municipalTicket.findMany({where:{workspaceId:actor.workspaceId},include:{process:{select:{id:true,name:true,municipality:true,department:true,owner:true}},versions:{orderBy:{number:"desc"},take:1,select:{id:true,number:true,status:true,createdAt:true}},messages:{orderBy:{createdAt:"desc"},take:1,select:{content:true,createdAt:true}}},orderBy:{updatedAt:"desc"},take:400})
 return NextResponse.json({tickets})}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Não foi possível carregar os Tickets."},{status:400})}
}
