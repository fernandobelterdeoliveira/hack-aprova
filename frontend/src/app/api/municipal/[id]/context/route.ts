import {NextResponse} from "next/server"
import {currentActor} from "@/lib/auth/current-actor"
import {collectionContext,CollectionError} from "@/lib/municipal/collection"
export async function GET(_req:Request,ctx:{params:Promise<{id:string}>}){try{const actor=await currentActor(),{id}=await ctx.params;return NextResponse.json(await collectionContext(actor.workspaceId,id))}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Falha ao consultar contexto."},{status:e instanceof CollectionError?e.status:500})}}
