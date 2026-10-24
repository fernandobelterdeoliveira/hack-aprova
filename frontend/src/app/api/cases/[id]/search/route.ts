import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { currentActor } from "@/lib/auth/current-actor"
import { prisma } from "@/lib/prisma"
import { searchCaseEvidence } from "@/lib/case-operational-view"

const inputSchema = z.object({ question: z.string().trim().min(3).max(500) })

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const parsed = inputSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: "Digite uma pergunta sobre o caso" }, { status: 400 })
    const actor = await currentActor()
    const result = await searchCaseEvidence(prisma, id, actor.workspaceId, parsed.data.question)
    if (!result) return NextResponse.json({ error: "Caso não encontrado" }, { status: 404 })
    return NextResponse.json(result)
  } catch (error) {
    console.error("Erro na busca contextual:", error)
    return NextResponse.json({ error: "Não foi possível pesquisar o caso" }, { status: 500 })
  }
}
