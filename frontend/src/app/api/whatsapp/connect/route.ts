import { sameOrigin } from "@/lib/request-origin"
import { NextRequest, NextResponse } from "next/server"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { currentActor } from "@/lib/auth/current-actor"
const input = z.object({ phoneNumberId: z.string().regex(/^\d{5,30}$/), accessToken: z.string().min(20).max(5000).regex(/^[^\r\n]+$/), appSecret: z.string().min(16).max(200).regex(/^[^\r\n]+$/), verifyToken: z.string().min(16).max(200).regex(/^[A-Za-z0-9_-]+$/), publicUrl: z.string().url().refine(v=>v.startsWith("https://"),"Use um endereço HTTPS público").optional().or(z.literal("")) })
export async function POST(req: NextRequest) {
 if (!sameOrigin(req)) return NextResponse.json({error:"Origem da solicitação inválida."},{status:403})
 try {
  const actor = await currentActor()
  if (!["owner","admin"].includes(actor.role) || process.env.NODE_ENV !== "development") return NextResponse.json({ error: "Configuração local disponível somente para o administrador no ambiente de desenvolvimento." }, { status: 403 })
  const data = input.parse(await req.json())
  const existing = await prisma.connectorAccount.findUnique({ where: {provider_externalAccountId:{provider:"whatsapp",externalAccountId:data.phoneNumberId}} })
  if(existing && existing.workspaceId !== actor.workspaceId) return NextResponse.json({error:"Este número já está associado a outro ambiente."},{status:409})
  const response = await fetch(`https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || "v23.0"}/${data.phoneNumberId}?fields=display_phone_number,verified_name`,{headers:{Authorization:`Bearer ${data.accessToken}`},signal:AbortSignal.timeout(12000)})
  if(!response.ok) return NextResponse.json({error:"A Meta não validou o número e o token. Confira o Phone Number ID, as permissões e a validade do token."},{status:400})
  const profile = await response.json() as {display_phone_number?:string;verified_name?:string}
  const values:Record<string,string> = {WHATSAPP_PHONE_NUMBER_ID:data.phoneNumberId,WHATSAPP_ACCESS_TOKEN:data.accessToken,WHATSAPP_APP_SECRET:data.appSecret,WHATSAPP_VERIFY_TOKEN:data.verifyToken}
  if(data.publicUrl)values.WHATSAPP_PUBLIC_URL=data.publicUrl.replace(/\/$/,"")
  const file=path.join(process.cwd(),".env.local");let content=await readFile(file,"utf-8").catch(()=>"")
  for(const [key,value] of Object.entries(values)){const line=`${key}=${JSON.stringify(value)}`;const pattern=new RegExp(`^${key}=.*$`,"m");content=pattern.test(content)?content.replace(pattern,()=>line):`${content.trimEnd()}\n${line}\n`}
  await writeFile(file,content,{encoding:"utf-8"})
  for(const [key,value] of Object.entries(values))process.env[key]=value
  await prisma.connectorAccount.upsert({where:{provider_externalAccountId:{provider:"whatsapp",externalAccountId:data.phoneNumberId}},update:{status:"configured",displayName:profile.verified_name||profile.display_phone_number,errorMessage:null},create:{workspaceId:actor.workspaceId,userProfileId:actor.userProfileId,provider:"whatsapp",externalAccountId:data.phoneNumberId,status:"configured",displayName:profile.verified_name||profile.display_phone_number}})
  return NextResponse.json({configured:true,displayName:profile.verified_name||profile.display_phone_number,webhook:data.publicUrl?`${data.publicUrl.replace(/\/$/,"")}/api/connectors/whatsapp/webhook`:null,note:"Cadastre e valide o webhook na Meta para receber mensagens."})
 } catch(e){return NextResponse.json({error:e instanceof z.ZodError?e.issues[0].message:"Não foi possível salvar a conexão. Nenhuma mensagem foi enviada."},{status:400})}
}
