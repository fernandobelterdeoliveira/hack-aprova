import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { currentActor } from "@/lib/auth/current-actor"
import { enqueueCaseAnalysis } from "@/lib/jobs/queue"
import { prisma } from "@/lib/prisma"

const analysisSchema = z.object({
  userRequest: z.string().trim().min(3),
  fileUrls: z.array(z.string().trim().min(1)).default([]),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await currentActor()
    const { id } = await params
    const parsed = analysisSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "Informe o objetivo da análise e uma lista válida de arquivos." }, { status: 400 })
    }
    const caseRecord = await prisma.case.findFirst({ where: { id, workspaceId: actor.workspaceId }, select: { id: true } })
    if (!caseRecord) return NextResponse.json({ error: "Caso não encontrado" }, { status: 404 })

    const job = await enqueueCaseAnalysis({
      workspaceId: actor.workspaceId,
      caseId: id,
      createdBy: actor.userProfileId,
      userRequest: parsed.data.userRequest,
      fileUrls: parsed.data.fileUrls,
    })
    return NextResponse.json({
      success: true,
      jobId: job.id,
      status: job.status,
      progressUrl: `/api/jobs/${job.id}`,
      message: "Análise adicionada à fila.",
    }, { status: 202 })
  } catch (error) {
    console.error("Erro ao enfileirar análise:", error)
    return NextResponse.json({ error: "Não foi possível iniciar a análise." }, { status: 500 })
  }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await currentActor()
    const { id } = await params
    const caseRecord = await prisma.case.findFirst({ where: { id, workspaceId: actor.workspaceId }, select: { id: true } })
    if (!caseRecord) return NextResponse.json({ error: "Caso não encontrado" }, { status: 404 })

    const analyses = await prisma.reasonChain.findMany({
      where: {
        caseId: id,
        agentType: { in: ["orchestrator", "docu", "sherlock", "client_coms", "analysis", "case_intelligence"] },
      },
      orderBy: { timestamp: "desc" },
    })
    return NextResponse.json(analyses)
  } catch (error) {
    console.error("Erro ao carregar análises:", error)
    return NextResponse.json({ error: "Não foi possível carregar as análises." }, { status: 500 })
  }
}
