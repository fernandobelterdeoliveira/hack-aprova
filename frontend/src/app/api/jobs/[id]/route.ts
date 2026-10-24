import { NextResponse } from "next/server"

import { currentActor } from "@/lib/auth/current-actor"
import { prisma } from "@/lib/prisma"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const actor = await currentActor()
  const job = await prisma.backgroundJob.findFirst({ where: { id, workspaceId: actor.workspaceId } })
  if (!job) return NextResponse.json({ error: "Processamento não encontrado" }, { status: 404 })
  return NextResponse.json(job)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const actor = await currentActor()
  const job = await prisma.backgroundJob.findFirst({ where: { id, workspaceId: actor.workspaceId } })
  if (!job) return NextResponse.json({ error: "Processamento não encontrado" }, { status: 404 })
  if (["completed", "failed", "dead_letter", "cancelled"].includes(job.status)) {
    return NextResponse.json({ error: "Este processamento já foi finalizado" }, { status: 409 })
  }
  const updated = job.status === "queued"
    ? await prisma.backgroundJob.update({ where: { id }, data: { status: "cancelled", cancelRequestedAt: new Date(), completedAt: new Date(), progressMessage: "Cancelado antes da execução" } })
    : await prisma.backgroundJob.update({ where: { id }, data: { cancelRequestedAt: new Date(), progressMessage: "Cancelamento solicitado" } })
  return NextResponse.json(updated)
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const actor = await currentActor()
  const job = await prisma.backgroundJob.findFirst({ where: { id, workspaceId: actor.workspaceId } })
  if (!job) return NextResponse.json({ error: "Processamento não encontrado" }, { status: 404 })
  if (!['failed', 'dead_letter', 'cancelled'].includes(job.status)) return NextResponse.json({ error: "A tarefa não pode ser reenviada agora" }, { status: 409 })
  const updated = await prisma.backgroundJob.update({ where: { id }, data: { status: "queued", attempts: 0, availableAt: new Date(), cancelRequestedAt: null, completedAt: null, deadLetteredAt: null, lastError: null, progress: 0, progressMessage: "Reenviado para a fila" } })
  return NextResponse.json(updated, { status: 202 })
}
