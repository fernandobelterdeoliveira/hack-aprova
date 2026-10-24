import { NextRequest, NextResponse } from "next/server"
import { enqueueTicket } from "@/lib/municipal/tickets"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { applyInboxItem } from "@/lib/ingestion"
import { sameOrigin } from "@/lib/request-origin"
import { currentActor } from "@/lib/auth/current-actor"

const reviewInput = z.object({
  action: z.enum(["approve", "reject", "reassign"]),
  caseId: z.string().optional(),
  changeIds: z.array(z.string()).optional(),
  decidedBy: z.string().optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if(!sameOrigin(request))return NextResponse.json({error:"Origem inválida."},{status:403})
  try {
    const { id } = await params
    const actor = await currentActor()
    if(!["owner","admin","member","professional","reviewer"].includes(actor.role))return NextResponse.json({error:"Sem permissão para revisar este Ticket."},{status:403})
    const parsed = reviewInput.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: "Solicitação de revisão inválida" }, { status: 400 })
    const { action, caseId, changeIds, decidedBy } = parsed.data

    const item = await prisma.inboxItem.findFirst({ where: { id, workspaceId: actor.workspaceId } })
    if (!item) return NextResponse.json({ error: "Entrada não encontrada" }, { status: 404 })

    if (action === "reject") {
      await prisma.$transaction([
        prisma.proposedCaseChange.updateMany({
          where: { inboxItemId: id, status: "pending" },
          data: { status: "rejected", decidedBy: decidedBy || actor.userProfileId, decidedAt: new Date() },
        }),
        prisma.inboxItem.update({ where: { id }, data: { reviewStatus: "rejected" } }),
      ])
      return NextResponse.json({ rejected: true })
    }

    if (!caseId) return NextResponse.json({ error: "O caso é obrigatório" }, { status: 400 })
    const targetCase = await prisma.case.findFirst({ where: { id: caseId, workspaceId: actor.workspaceId }, select: { id: true } })
    if (!targetCase) return NextResponse.json({ error: "Caso não encontrado neste escritório" }, { status: 404 })

    if (action === "reassign") {
      await prisma.$transaction([
        prisma.inboxItem.update({
          where: { id },
          data: {
            detectedCaseId: caseId,
            associationConfidence: null,
            associationSignals: {
              autoAssociated: false,
              manuallyAssigned: true,
              explanation: "Caso selecionado manualmente; não representa confiança calculada pelo associador.",
            },
            reviewStatus: "ready",
          },
        }),
        prisma.proposedCaseChange.updateMany({
          where: { inboxItemId: id, status: "pending" },
          data: { caseId },
        }),
      ])
      return NextResponse.json({ reassigned: true })
    }

    const result=await applyInboxItem(id, caseId, changeIds, actor.userProfileId)
    for(const message of result.outgoing)await enqueueTicket(message.ticketId,"deliver",actor.userProfileId,message.messageId,message.messageId)
    return NextResponse.json({...result,sentToChat:result.outgoing.length})
  } catch (error) {
    console.error("Error reviewing inbox item:", error)
    return NextResponse.json(
      { error: "Não foi possível revisar a entrada", details: error instanceof Error ? error.message : "Erro desconhecido" },
      { status: 500 },
    )
  }
}
