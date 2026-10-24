import {NextRequest,NextResponse} from "next/server"
import {z} from "zod"
import {currentActor} from "@/lib/auth/current-actor"
import {sameOrigin} from "@/lib/request-origin"
import {answerCollectionQuestion,CollectionError} from "@/lib/municipal/collection"
const input=z.object({questionId:z.string().min(1),content:z.string().trim().min(1).max(8000),author:z.string().trim().min(2).max(150),requestKey:z.string().uuid()}).strict()
export async function POST(req:NextRequest,ctx:{params:Promise<{id:string}>}){if(!sameOrigin(req))return NextResponse.json({error:"Origem inválida."},{status:403});try{const actor=await currentActor();if(!["owner","admin","member","professional","reviewer"].includes(actor.role))return NextResponse.json({error:"Sem permissão para responder este processo."},{status:403});const{id}=await ctx.params;const result=await answerCollectionQuestion(actor.workspaceId,id,input.parse(await req.json()));return NextResponse.json(result,{status:result.queued?202:200})}catch(e){return NextResponse.json({error:e instanceof z.ZodError?"Informe pergunta, resposta, autor e requestKey válido.":e instanceof Error?e.message:"Falha ao registrar resposta."},{status:e instanceof CollectionError?e.status:400})}}
