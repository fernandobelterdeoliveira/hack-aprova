import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { currentActor } from "@/lib/auth/current-actor"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const actor = await currentActor()
    const lawCase = await prisma.case.findFirst({
      where: { id, workspaceId: actor.workspaceId },
      include: {
        state: true,
        events: { orderBy: { occurredAt: "desc" }, take: 100 },
        facts: { where: { archivedAt: null }, orderBy: { extractedAt: "desc" } },
        informationGaps: { where: { status: "open" }, orderBy: { createdAt: "desc" } },
        aiTasks: { where: { status: { notIn: ["completed", "dismissed"] } }, orderBy: { createdAt: "desc" } },
      },
    })

    if (!lawCase) return NextResponse.json({ error: "Caso não encontrado" }, { status: 404 })

    return NextResponse.json({
      caseId: lawCase.id,
      client: lawCase.clientName,
      matterType: lawCase.caseType,
      operationalStatus: lawCase.status,
      nextAction: lawCase.nextAction,
      state: lawCase.state,
      timeline: lawCase.events,
      facts: lawCase.facts,
      gaps: lawCase.informationGaps,
      tasks: lawCase.aiTasks,
      lastActivity: lawCase.lastActivity,
    })
  } catch (error) {
    console.error("Error fetching case state:", error)
    return NextResponse.json({ error: "Não foi possível carregar o estado do caso" }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const actor = await currentActor()
    const lawCase = await prisma.case.findFirst({ where: { id, workspaceId: actor.workspaceId }, select: { id: true } })
    if (!lawCase) return NextResponse.json({ error: "Caso não encontrado" }, { status: 404 })
    const body = await request.json()
    if (!body.eventType || !body.title || !body.occurredAt || !body.sourceType) {
      return NextResponse.json(
        { error: "eventType, title, occurredAt, and sourceType are required" },
        { status: 400 },
      )
    }

    const event = await prisma.$transaction(async (transaction) => {
      const created = await transaction.caseEvent.create({
        data: {
          caseId: id,
          eventType: body.eventType,
          title: body.title,
          description: body.description,
          occurredAt: new Date(body.occurredAt),
          sourceType: body.sourceType,
          sourceId: body.sourceId,
          confidence: body.confidence,
          metadata: body.metadata,
        },
      })
      await transaction.case.update({ where: { id }, data: { lastActivity: new Date() } })
      return created
    })

    return NextResponse.json(event, { status: 201 })
  } catch (error) {
    console.error("Error recording case event:", error)
    return NextResponse.json({ error: "Não foi possível registrar o evento do caso" }, { status: 500 })
  }
}
