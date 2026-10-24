import { NextResponse } from "next/server"
import { currentActor } from "@/lib/auth/current-actor"
import { prisma } from "@/lib/prisma"
import { regenerateCaseSummary } from "@/lib/case-operational-view"

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const actor = await currentActor()
    const summary = await regenerateCaseSummary(prisma, id, actor.workspaceId, actor.userProfileId)
    if (!summary) return NextResponse.json({ error: "Caso não encontrado" }, { status: 404 })
    return NextResponse.json(summary)
  } catch (error) {
    console.error("Erro ao regenerar resumo:", error)
    return NextResponse.json({ error: "Não foi possível regenerar o resumo" }, { status: 500 })
  }
}
