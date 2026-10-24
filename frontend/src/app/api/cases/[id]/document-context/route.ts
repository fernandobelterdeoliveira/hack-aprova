import { NextResponse } from "next/server"
import { currentActor } from "@/lib/auth/current-actor"
import { prisma } from "@/lib/prisma"
import { buildCaseOperationalView } from "@/lib/case-operational-view"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const actor = await currentActor()
  const view = await buildCaseOperationalView(prisma, id, actor.workspaceId)
  if (!view) return NextResponse.json({ error: "Caso não encontrado" }, { status: 404 })
  return NextResponse.json({ caseId: id, generatedAt: new Date(), context: view.documentContext })
}
