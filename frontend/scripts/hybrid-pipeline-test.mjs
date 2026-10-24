import assert from "node:assert/strict"
import { PrismaClient } from "@prisma/client"

process.loadEnvFile?.(".env.local")

const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:3001"
const prisma = new PrismaClient()
const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
const caseIds = []
const inboxIds = []

async function api(path, options = {}, expectedStatus) {
  const response = await fetch(`${baseUrl}${path}`, options)
  const contentType = response.headers.get("content-type") || ""
  const body = contentType.includes("application/json") ? await response.json() : await response.text()
  if (expectedStatus === undefined) {
    assert.ok(response.ok, `${options.method || "GET"} ${path} retornou ${response.status}: ${JSON.stringify(body)}`)
  } else {
    assert.equal(response.status, expectedStatus, `${options.method || "GET"} ${path}: ${JSON.stringify(body)}`)
  }
  return { response, body }
}

const json = (body, method = "POST") => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

async function createCase(data) {
  const created = await prisma.case.create({
    data: {
      clientDob: "1990-01-01",
      status: "open",
      priority: "medium",
      assignedTo: "Teste automatizado",
      nextAction: "Revisar entrada",
      ...data,
      state: { create: { stage: "open", summary: data.description, healthScore: 70 } },
    },
  })
  caseIds.push(created.id)
  return created
}

async function createInbox(payload) {
  const result = await api("/api/inbox", json({
    sourceType: "whatsapp",
    sourceExternalId: `hybrid-${runId}-${Math.random().toString(16).slice(2)}`,
    receivedAt: new Date().toISOString(),
    ...payload,
  }))
  if (result.response.status === 201) inboxIds.push(result.body.id)
  return result
}

try {
  const exactCase = await createCase({
    caseNumber: `HYB-${runId}-001`,
    clientName: "João Teste Híbrido",
    clientEmail: `joao-${runId}@example.test`,
    clientPhone: "+55 11 98888-1111",
    caseType: "Acidente automobilístico",
    description: "Acidente com tratamento médico e fisioterapia em andamento.",
  })
  const ambiguousA = await createCase({
    caseNumber: `HYB-${runId}-002A`,
    clientName: "Maria Homônima",
    clientEmail: `maria-${runId}@example.test`,
    caseType: "Responsabilidade civil",
    description: "Primeiro caso ativo da mesma cliente.",
  })
  const ambiguousB = await createCase({
    caseNumber: `HYB-${runId}-002B`,
    clientName: "Maria Homônima",
    clientEmail: `maria-${runId}@example.test`,
    caseType: "Relação de consumo",
    description: "Segundo caso ativo da mesma cliente.",
  })

  // Match inequívoco, explicação do score e nenhuma aplicação silenciosa.
  const exact = await createInbox({
    senderName: exactCase.clientName,
    senderEmail: exactCase.clientEmail,
    senderPhone: exactCase.clientPhone,
    rawContent: `Caso ${exactCase.caseNumber}: comecei fisioterapia hoje.`,
  })
  assert.equal(exact.body.detectedCaseId, exactCase.id)
  assert.equal(exact.body.reviewStatus, "ready")
  assert.ok(exact.body.associationConfidence >= 0.85)
  assert.ok(exact.body.associationSignals.candidates[0].signals.some((signal) => signal.kind === "case_number"))
  assert.ok(exact.body.associationSignals.candidates[0].signals.some((signal) => signal.kind === "email"))
  assert.ok(exact.body.proposedChanges.length >= 2)
  assert.ok(exact.body.proposedChanges.every((change) => change.status === "pending" && change.sourceId && change.sourceExcerpt))
  assert.ok(exact.body.proposedChanges.every((change) => change.policyDecision && change.requiresReview))
  assert.equal(await prisma.caseEvent.count({ where: { sourceId: exact.body.id } }), 0)

  const benchmark = await api("/api/ai/benchmark", json({
    samples: [{
      inboxItemId: exact.body.id,
      expectedCaseId: exactCase.id,
      expectedMessageType: "medical_update",
      humanOverride: false,
    }],
  }))
  const benchmarkProviders = new Set(benchmark.body.metrics.map((metric) => metric.provider))
  assert.ok(benchmarkProviders.has("associador_atual"))
  assert.ok(benchmarkProviders.has("embeddings"))
  assert.ok(benchmarkProviders.has("hibrida"))
  assert.ok(benchmarkProviders.has("jev_mock"))

  // Webhook duplicado é idempotente; uma origem externa diferente não é descartada só por semântica.
  const duplicate = await api("/api/inbox", json({
    sourceType: "whatsapp",
    sourceExternalId: exact.body.sourceExternalId,
    senderName: exactCase.clientName,
    senderEmail: exactCase.clientEmail,
    rawContent: exact.body.rawContent,
  }))
  assert.equal(duplicate.body.id, exact.body.id)
  assert.equal(duplicate.response.headers.get("x-inbox-deduplicated"), "true")

  const repeatedContent = await createInbox({
    senderName: exactCase.clientName,
    senderEmail: exactCase.clientEmail,
    rawContent: exact.body.rawContent,
  })
  assert.notEqual(repeatedContent.body.id, exact.body.id)

  // Mesmo remetente com dois casos e nomes iguais deve ficar ambíguo.
  const ambiguous = await createInbox({
    senderName: ambiguousA.clientName,
    senderEmail: ambiguousA.clientEmail,
    rawContent: "Tenho uma atualização importante para o meu caso.",
  })
  assert.equal(ambiguous.body.reviewStatus, "needs_association")
  assert.equal(ambiguous.body.associationSignals.status, "AMBIGUOUS")
  assert.ok([ambiguousA.id, ambiguousB.id].includes(ambiguous.body.detectedCaseId))

  // Remetente desconhecido e conteúdo sem identidade não podem ganhar um caso por similaridade.
  const unknown = await createInbox({
    senderName: "Pessoa Desconhecida",
    senderEmail: `desconhecido-${runId}@example.test`,
    rawContent: "ZXQ-991 informação sem qualquer referência identificável.",
  })
  assert.equal(unknown.body.reviewStatus, "needs_association")
  assert.equal(unknown.body.associationSignals.status, "NO_MATCH")
  assert.equal(unknown.body.detectedCaseId, null)

  // Prazo é sempre risco alto e exige advogado.
  const deadline = await createInbox({
    senderEmail: exactCase.clientEmail,
    rawContent: `Caso ${exactCase.caseNumber}: prazo judicial em 15/10/2026.`,
  })
  const deadlineChange = deadline.body.proposedChanges.find((change) => change.type === "DEADLINE")
  assert.ok(deadlineChange)
  assert.equal(deadlineChange.riskLevel, "high")
  assert.equal(deadlineChange.policyDecision, "ATTORNEY_REVIEW")

  // Contradição aciona raciocínio profundo; sem OpenAI, o fallback ainda produz proposta auditável.
  const contradiction = await createInbox({
    senderEmail: exactCase.clientEmail,
    rawContent: `Caso ${exactCase.caseNumber}: corrigindo, o acidente não foi na data informada antes.`,
  })
  assert.equal(contradiction.body.requiresDeepReasoning, true)
  assert.ok(contradiction.body.aiExecutions.length >= 2)
  assert.ok(contradiction.body.proposedChanges.some((change) => change.riskLevel === "high"))

  // Rejeição não altera o Case State.
  const rejectItem = await createInbox({
    senderEmail: exactCase.clientEmail,
    rawContent: `Caso ${exactCase.caseNumber}: nova informação para rejeitar.`,
  })
  await api(`/api/inbox/${rejectItem.body.id}/review`, json({ action: "reject", decidedBy: "teste" }, "PATCH"))
  const rejected = await prisma.inboxItem.findUnique({ where: { id: rejectItem.body.id }, include: { proposedChanges: true } })
  assert.equal(rejected.reviewStatus, "rejected")
  assert.ok(rejected.proposedChanges.every((change) => change.status === "rejected"))

  // Aprovação parcial aplica somente o selecionado e rejeita os demais em transação.
  const selectedId = exact.body.proposedChanges[0].id
  const partial = await api(`/api/inbox/${exact.body.id}/review`, json({
    action: "approve",
    caseId: exactCase.id,
    changeIds: [selectedId],
    decidedBy: "teste",
  }, "PATCH"))
  assert.equal(partial.body.applied, 1)
  assert.equal(partial.body.rejected, exact.body.proposedChanges.length - 1)
  assert.equal(await prisma.caseEvent.count({ where: { sourceId: exact.body.id } }), 1)

  // Falha de política causa rollback: sem proveniência, nada oficial é criado.
  const rollbackItem = await createInbox({
    senderEmail: exactCase.clientEmail,
    rawContent: `Caso ${exactCase.caseNumber}: informação usada no teste de rollback.`,
  })
  const rollbackChange = rollbackItem.body.proposedChanges[0]
  await prisma.proposedCaseChange.update({
    where: { id: rollbackChange.id },
    data: {
      sourceId: null,
      sourceType: null,
      sourceExcerpt: null,
      payload: { title: "Alteração sem fonte", description: "Deve ser bloqueada", evidence: {} },
    },
  })
  const beforeEvents = await prisma.caseEvent.count({ where: { caseId: exactCase.id } })
  await api(`/api/inbox/${rollbackItem.body.id}/review`, json({
    action: "approve",
    caseId: exactCase.id,
    changeIds: [rollbackChange.id],
    decidedBy: "teste",
  }, "PATCH"), 500)
  assert.equal(await prisma.caseEvent.count({ where: { caseId: exactCase.id } }), beforeEvents)
  assert.equal((await prisma.proposedCaseChange.findUnique({ where: { id: rollbackChange.id } })).status, "pending")

  // Documento/webhook duplicado preserva uma única entrada pelo ID externo.
  const documentPayload = {
    sourceType: "document",
    sourceExternalId: `document-${runId}`,
    rawContent: `Relatório do caso ${exactCase.caseNumber}`,
    fileName: "relatorio.pdf",
    fileType: "application/pdf",
    fileUrl: "https://example.test/relatorio.pdf",
  }
  const document = await api("/api/inbox", json(documentPayload))
  inboxIds.push(document.body.id)
  const duplicateDocument = await api("/api/inbox", json(documentPayload))
  assert.equal(duplicateDocument.body.id, document.body.id)
  assert.equal(duplicateDocument.response.headers.get("x-inbox-deduplicated"), "true")

  if (process.env.EXPECT_PROVIDER_FALLBACK === "true") {
    const executions = await prisma.aIExecution.findMany({ where: { inboxItemId: exact.body.id } })
    assert.ok(executions.some((execution) => execution.provider === "openai" && execution.status === "failed"))
    assert.ok(executions.some((execution) => execution.provider === "deterministic" && execution.status === "completed"))
  }

  console.log("Hybrid pipeline test passed: association, ambiguity, no-match, provenance, risk, review, rollback, deduplication and audit.")
} finally {
  if (inboxIds.length) await prisma.inboxItem.deleteMany({ where: { id: { in: inboxIds } } })
  if (caseIds.length) await prisma.case.deleteMany({ where: { id: { in: caseIds } } })
  await prisma.$disconnect()
}
