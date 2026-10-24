import { sameOrigin } from "@/lib/request-origin"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { currentActor } from "@/lib/auth/current-actor"
import { initialRules, templates } from "@/lib/municipal/domain"
import { json, projection } from "@/lib/municipal/service"
const input = z.object({ municipality: z.string().trim().min(2).max(150), department: z.string().trim().min(2).max(150), name: z.string().trim().min(3).max(200), templateKey: z.enum(["alvara", "obras", "protocolo"]), owner: z.string().trim().min(2).max(150), contactPhone: z.string().regex(/^\d{10,15}$/).optional().or(z.literal("")), targetDate: z.string().datetime().optional() })
export async function GET() {
 try {
  const actor = await currentActor()
  const processes = await prisma.municipalProcess.findMany({ where: { workspaceId: actor.workspaceId }, orderBy: { updatedAt: "desc" } })
  return NextResponse.json({ processes: processes.map(projection), templates })
 } catch { return NextResponse.json({ error: "Não foi possível carregar as implantações." }, { status: 500 }) }
}
export async function POST(req: NextRequest) {
 if (!sameOrigin(req)) return NextResponse.json({error:"Origem da solicitação inválida."},{status:403})
 try {
  const actor = await currentActor(); const data = input.parse(await req.json())
  const process = await prisma.municipalProcess.create({ data: { ...data, contactPhone: data.contactPhone || null, targetDate: data.targetDate ? new Date(data.targetDate) : null, workspaceId: actor.workspaceId, rules: json(initialRules(data.templateKey)), history: json([{ at: new Date().toISOString(), actor: actor.userProfileId, action: "created", details: "Processo criado a partir de modelo demonstrativo; regras locais exigem confirmação." }]) } })
  return NextResponse.json(projection(process), { status: 201 })
 } catch (e) { return NextResponse.json({ error: e instanceof z.ZodError ? e.issues[0].message : "Não foi possível criar o processo." }, { status: 400 }) }
}
