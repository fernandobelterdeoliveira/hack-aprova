import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"
import { z } from "zod"

import { currentActor } from "@/lib/auth/current-actor"
import { buildCaseOperationalView } from "@/lib/case-operational-view"
import { prisma } from "@/lib/prisma"

const updateSchema = z.object({
  value: z.string().trim().min(1, "Informe um valor."),
  status: z.enum(["confirmed", "alleged", "contradictory", "pending"]).optional(),
})

const coreFields = {
  clientName: "Nome",
  clientDob: "Data de nascimento",
  clientPhone: "Telefone",
  clientEmail: "E-mail",
} as const

type CoreField = keyof typeof coreFields

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}

function editedFactValue(current: Prisma.JsonValue, value: string, status: string) {
  const record = current && typeof current === "object" && !Array.isArray(current)
    ? { ...(current as Prisma.JsonObject) }
    : {}
  return {
    ...record,
    display: value,
    status,
    alleged: status === "alleged",
    conflict: status === "contradictory",
  } satisfies Prisma.InputJsonObject
}

async function scopedCase(caseId: string, workspaceId: string) {
  return prisma.case.findFirst({
    where: { id: caseId, workspaceId },
    select: { id: true, clientName: true, clientDob: true, clientPhone: true, clientEmail: true },
  })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; dataId: string }> }) {
  try {
    const { id, dataId: encodedDataId } = await params
    const dataId = decodeURIComponent(encodedDataId)
    const actor = await currentActor()
    const parsed = updateSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Dados inválidos." }, { status: 400 })

    const lawCase = await scopedCase(id, actor.workspaceId)
    if (!lawCase) return NextResponse.json({ error: "Caso não encontrado." }, { status: 404 })

    if (dataId.startsWith("case:")) {
      const field = dataId.slice(5) as CoreField
      if (!(field in coreFields)) return NextResponse.json({ error: "Campo não editável." }, { status: 400 })
      if (field === "clientEmail" && !z.string().email().safeParse(parsed.data.value).success) {
        return NextResponse.json({ error: "Informe um e-mail válido." }, { status: 400 })
      }

      const previousValue = lawCase[field]
      await prisma.$transaction([
        prisma.case.update({ where: { id }, data: { [field]: parsed.data.value, lastActivity: new Date() } }),
        prisma.caseDataChange.create({ data: {
          caseId: id, entityType: "case", entityId: id, fieldName: field, action: "updated",
          previousValue: jsonValue({ value: previousValue }), newValue: jsonValue({ value: parsed.data.value }), changedBy: actor.userProfileId,
        } }),
      ])
    } else if (dataId.startsWith("fact:")) {
      const factId = dataId.slice(5)
      const fact = await prisma.caseFact.findFirst({ where: { id: factId, caseId: id, archivedAt: null } })
      if (!fact) return NextResponse.json({ error: "Informação não encontrada." }, { status: 404 })
      const reviewer = await prisma.userProfile.findUnique({ where: { id: actor.userProfileId }, select: { name: true } })
      const status = parsed.data.status || "pending"
      const nextValue = editedFactValue(fact.value, parsed.data.value, status)
      const now = new Date()
      await prisma.$transaction([
        prisma.caseFact.update({ where: { id: fact.id }, data: {
          value: nextValue,
          verifiedAt: status === "confirmed" ? now : null,
          verifiedBy: status === "confirmed" ? reviewer?.name || actor.userProfileId : null,
          lastEditedAt: now,
          lastEditedBy: actor.userProfileId,
        } }),
        prisma.caseDataChange.create({ data: {
          caseId: id, entityType: "case_fact", entityId: fact.id, fieldName: fact.fieldName, action: "updated",
          previousValue: jsonValue(fact.value), newValue: nextValue, changedBy: actor.userProfileId,
        } }),
        prisma.case.update({ where: { id }, data: { lastActivity: now } }),
      ])
    } else {
      return NextResponse.json({ error: "Informação não editável." }, { status: 400 })
    }

    const view = await buildCaseOperationalView(prisma, id, actor.workspaceId)
    return NextResponse.json(view)
  } catch (error) {
    console.error("Erro ao editar dado do caso:", error)
    return NextResponse.json({ error: "Não foi possível salvar a alteração." }, { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; dataId: string }> }) {
  try {
    const { id, dataId: encodedDataId } = await params
    const dataId = decodeURIComponent(encodedDataId)
    const actor = await currentActor()
    const lawCase = await scopedCase(id, actor.workspaceId)
    if (!lawCase) return NextResponse.json({ error: "Caso não encontrado." }, { status: 404 })

    const now = new Date()
    if (dataId.startsWith("case:")) {
      const field = dataId.slice(5) as CoreField
      if (!(field in coreFields)) return NextResponse.json({ error: "Campo não removível." }, { status: 400 })
      if (field === "clientName") return NextResponse.json({ error: "O nome do cliente é obrigatório e não pode ser removido." }, { status: 400 })
      const previousValue = lawCase[field]
      await prisma.$transaction([
        prisma.case.update({ where: { id }, data: { [field]: null, lastActivity: now } }),
        prisma.caseDataChange.create({ data: {
          caseId: id, entityType: "case", entityId: id, fieldName: field, action: "removed",
          previousValue: jsonValue({ value: previousValue }), newValue: jsonValue({ value: null }), changedBy: actor.userProfileId,
        } }),
      ])
    } else if (dataId.startsWith("fact:")) {
      const factId = dataId.slice(5)
      const fact = await prisma.caseFact.findFirst({ where: { id: factId, caseId: id, archivedAt: null } })
      if (!fact) return NextResponse.json({ error: "Informação não encontrada." }, { status: 404 })
      await prisma.$transaction([
        prisma.caseFact.update({ where: { id: fact.id }, data: { archivedAt: now, archivedBy: actor.userProfileId } }),
        prisma.caseDataChange.create({ data: {
          caseId: id, entityType: "case_fact", entityId: fact.id, fieldName: fact.fieldName, action: "archived",
          previousValue: jsonValue(fact.value), newValue: jsonValue({ archived: true }), changedBy: actor.userProfileId,
        } }),
        prisma.case.update({ where: { id }, data: { lastActivity: now } }),
      ])
    } else {
      return NextResponse.json({ error: "Informação não removível." }, { status: 400 })
    }

    const view = await buildCaseOperationalView(prisma, id, actor.workspaceId)
    return NextResponse.json(view)
  } catch (error) {
    console.error("Erro ao remover dado do caso:", error)
    return NextResponse.json({ error: "Não foi possível remover a informação." }, { status: 500 })
  }
}
