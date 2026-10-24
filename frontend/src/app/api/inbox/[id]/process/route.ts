import { NextResponse } from "next/server"
import { currentActor } from "@/lib/auth/current-actor"
import { enqueueInboxProcessing } from "@/lib/jobs/queue"
import { prisma } from "@/lib/prisma"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const actor = await currentActor()
    const item = await prisma.inboxItem.findFirst({ where: { id, workspaceId: actor.workspaceId }, select: { id: true, workspaceId: true, contentHash: true } })
    if (!item) return NextResponse.json({ error: "Entrada não encontrada" }, { status: 404 })
    const body = await request.json().catch(() => ({})) as { force?: boolean }
    const job = await enqueueInboxProcessing({ workspaceId: actor.workspaceId, inboxItemId: id, createdBy: actor.userProfileId, contentHash: item.contentHash, force: body.force })
    await prisma.inboxItem.update({ where: { id }, data: { processingStatus: "queued", errorMessage: null } })
    return NextResponse.json(job, { status: 202 })
  } catch (error) {
    console.error("Error processing inbox item:", error)
    return NextResponse.json({ error: "Não foi possível processar a entrada" }, { status: 500 })
  }
}
