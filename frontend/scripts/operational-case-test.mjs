import assert from "node:assert/strict"
import { PrismaClient } from "@prisma/client"

process.loadEnvFile?.(".env.local")
const prisma = new PrismaClient()
const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:3001"
let emptyCaseId
let duplicateFileId
let noSourceFactId
let operationalCaseId
const testStartedAt = new Date()

try {
  const lawCase = await prisma.case.findUnique({ where: { caseNumber: "LL-2026-HERDEIROS" } })
  assert.ok(lawCase, "Execute npm run seed:case-operational antes do teste")
  operationalCaseId = lawCase.id
  const emptyCase = await prisma.case.create({ data: { workspaceId: "default-workspace", caseNumber: `EMPTY-${Date.now()}`, clientName: "Caso sem documentos", clientDob: "1990-01-01", caseType: "Teste operacional", status: "open", priority: "low", assignedTo: "Equipe de teste", description: "Caso temporário sem documentos.", nextAction: "Aguardar documentos", state: { create: { stage: "open", summary: "Caso temporário sem documentos." } } } })
  emptyCaseId = emptyCase.id
  const emptyResponse = await fetch(`${baseUrl}/api/cases/${emptyCase.id}`)
  const emptyView = await emptyResponse.json()
  assert.equal(emptyView.documents.length, 0, "Caso sem documentos deve renderizar estado vazio")

  duplicateFileId = (await prisma.files.create({ data: { caseId: lawCase.id, name: "foto_cerca_12-03.jpg", type: "image", size: "2.4 MB", uploadedBy: "Teste de duplicidade", url: "https://example.test/foto-duplicada.jpg" } })).id
  noSourceFactId = (await prisma.caseFact.create({ data: { caseId: lawCase.id, fieldName: "unverified_note", value: { display: "Informação sem documento de origem" }, sourceType: "manual", confidence: 0.4 } })).id
  const response = await fetch(`${baseUrl}/api/cases/${lawCase.id}`)
  assert.equal(response.status, 200)
  const view = await response.json()
  assert.equal(view.case.clientName, "João Silva")
  assert.ok(view.timeline.length >= 4, "Timeline deve reunir eventos e documentos")
  assert.ok(view.facts.some((fact) => fact.status === "confirmed"), "Deve haver fato confirmado")
  assert.ok(view.facts.some((fact) => fact.status === "alleged"), "Deve haver alegação separada")
  assert.ok(view.facts.every((fact) => fact.source?.label), "Todo fato deve apresentar fonte")
  assert.ok(view.contradictions.length >= 1, "Datas divergentes devem gerar contradição")
  assert.ok(view.gaps.filter((gap) => gap.status === "open").length >= 3)
  assert.match(view.nextBestAction.title, /matrícula/i)
  assert.ok(view.documents.some((document) => document.extractedInformation.length > 0))
  assert.ok(view.documents.filter((document) => document.name === "foto_cerca_12-03.jpg").every((document) => document.duplicate), "Documento duplicado deve ser sinalizado")
  assert.ok(view.facts.some((fact) => fact.id === noSourceFactId && fact.status === "pending" && fact.source.label), "Dado sem fonte não pode aparecer como confirmado")
  assert.ok(view.risks.some((risk) => risk.level === "high"), "Caso deve apresentar risco alto")
  assert.ok(view.summary.warnings.length > 0, "Resumo com alegações deve exibir aviso")
  assert.ok(view.documentSummary.total >= 7, "Caso com muitos documentos deve ser resumido")

  const editFact = await fetch(`${baseUrl}/api/cases/${lawCase.id}/data/${encodeURIComponent(`fact:${noSourceFactId}`)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value: "Informação revisada pelo profissional", status: "confirmed" }),
  })
  assert.equal(editFact.status, 200, "Edição de fato deve funcionar")
  const editedFact = await prisma.caseFact.findUnique({ where: { id: noSourceFactId } })
  assert.equal(editedFact.value.display, "Informação revisada pelo profissional")
  assert.ok(editedFact.verifiedAt, "Fato confirmado deve registrar verificação")
  assert.ok(await prisma.caseDataChange.findFirst({ where: { entityId: noSourceFactId, action: "updated" } }), "Edição deve ser auditada")

  const removeFact = await fetch(`${baseUrl}/api/cases/${lawCase.id}/data/${encodeURIComponent(`fact:${noSourceFactId}`)}`, { method: "DELETE" })
  assert.equal(removeFact.status, 200, "Remoção de fato deve funcionar")
  const removedView = await removeFact.json()
  assert.ok(!removedView.facts.some((fact) => fact.id === noSourceFactId), "Fato arquivado não deve permanecer na visão oficial")
  const archivedFact = await prisma.caseFact.findUnique({ where: { id: noSourceFactId } })
  assert.ok(archivedFact.archivedAt, "Remoção deve arquivar, não excluir fisicamente")
  assert.ok(await prisma.caseDataChange.findFirst({ where: { entityId: noSourceFactId, action: "archived" } }), "Arquivamento deve ser auditado")

  const originalPhone = lawCase.clientPhone
  const editPhone = await fetch(`${baseUrl}/api/cases/${lawCase.id}/data/${encodeURIComponent("case:clientPhone")}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: "+55 11 90000-0000" }),
  })
  assert.equal(editPhone.status, 200, "Edição de cadastro deve funcionar")
  assert.equal((await prisma.case.findUnique({ where: { id: lawCase.id } })).clientPhone, "+55 11 90000-0000")
  if (originalPhone) await fetch(`${baseUrl}/api/cases/${lawCase.id}/data/${encodeURIComponent("case:clientPhone")}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: originalPhone }),
  })

  const found = await fetch(`${baseUrl}/api/cases/${lawCase.id}/search`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: "Qual documento comprova a matrícula?" }) })
  const foundBody = await found.json()
  assert.equal(found.status, 200)
  assert.ok(foundBody.matches.length > 0)
  assert.ok(foundBody.matches[0].source.label)

  const missing = await fetch(`${baseUrl}/api/cases/${lawCase.id}/search`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: "Qual é a cor do carro do vizinho?" }) })
  const missingBody = await missing.json()
  assert.equal(missingBody.answer, "Não encontrei evidência suficiente.")

  const summary = await fetch(`${baseUrl}/api/cases/${lawCase.id}/summary`, { method: "POST" })
  assert.equal(summary.status, 200)
  const updated = await prisma.caseState.findUnique({ where: { caseId: lawCase.id } })
  assert.ok(updated.summarySourceRefs)
  assert.ok(updated.summaryUpdatedAt)

  const dates = view.timeline.map((item) => new Date(item.date).getTime())
  assert.deepEqual(dates, [...dates].sort((a, b) => b - a), "Timeline deve estar em ordem decrescente")
  console.log("Operational case test passed: editing, audited archival, summary, provenance, contradictions, documents, search and timeline.")
} finally {
  if (noSourceFactId) await prisma.caseDataChange.deleteMany({ where: { entityId: noSourceFactId } }).catch(() => undefined)
  if (operationalCaseId) await prisma.caseDataChange.deleteMany({ where: { caseId: operationalCaseId, fieldName: "clientPhone", createdAt: { gte: testStartedAt } } }).catch(() => undefined)
  if (noSourceFactId) await prisma.caseFact.delete({ where: { id: noSourceFactId } }).catch(() => undefined)
  if (duplicateFileId) await prisma.files.delete({ where: { id: duplicateFileId } }).catch(() => undefined)
  if (emptyCaseId) await prisma.case.delete({ where: { id: emptyCaseId } }).catch(() => undefined)
  await prisma.$disconnect()
}
