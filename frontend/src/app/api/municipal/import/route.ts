import { sameOrigin } from "@/lib/request-origin"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { currentActor } from "@/lib/auth/current-actor"
import { initialRules } from "@/lib/municipal/domain"
import { json } from "@/lib/municipal/service"
const rowSchema = z.object({ municipality: z.string().trim().min(2).max(150), department: z.string().trim().min(2).max(150), name: z.string().trim().min(3).max(200), owner: z.string().trim().min(2).max(150), contactPhone: z.string().regex(/^\d{10,15}$/).optional().or(z.literal("")), templateKey: z.enum(["alvara","obras","protocolo"]).default("protocolo") })
export async function POST(req: NextRequest) {
 if (!sameOrigin(req)) return NextResponse.json({error:"Origem da solicitação inválida."},{status:403})
 try {
  const actor = await currentActor(); const input = z.object({ rows: z.array(rowSchema).min(1).max(400) }).parse(await req.json())
  const now = new Date().toISOString()
  const result = await prisma.municipalProcess.createMany({data:input.rows.map(row => ({...row, workspaceId:actor.workspaceId,contactPhone:row.contactPhone||null,rules:json(initialRules(row.templateKey)),history:json([{at:now,actor:actor.userProfileId,action:"import",details:"Processo cadastrado em lote; nenhuma regra local está aprovada."}])}))})
  return NextResponse.json({created:result.count},{status:201})
 } catch(e) { return NextResponse.json({error:e instanceof z.ZodError ? `Linha inválida: ${e.issues[0].path.join(".")} — ${e.issues[0].message}` : "Não foi possível importar."},{status:400}) }
}
