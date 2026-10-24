import assert from "node:assert/strict"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const suffix = crypto.randomUUID().slice(0, 8)
const workspaceId = `foreign-${suffix}`
const baseUrl = process.env.TEST_BASE_URL || "http://127.0.0.1:3000"

async function expectHidden(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init)
  assert.equal(response.status, 404, `${path} deveria responder 404, recebeu ${response.status}: ${await response.text()}`)
}

try {
  await prisma.workspace.create({ data: { id: workspaceId, name: "Outro escritório", slug: workspaceId } })
  const lawCase = await prisma.case.create({ data: {
    workspaceId,
    caseType: "SEGREDO-ISOLAMENTO",
    clientName: `Cliente estrangeiro ${suffix}`,
    caseNumber: `FOREIGN-${suffix}`,
    assignedTo: "Outro usuário",
    description: `conteudo-ultrassecreto-${suffix}`,
    nextAction: "Não deve aparecer",
  } })
  const file = await prisma.files.create({ data: { caseId: lawCase.id, uploadedBy: "foreign", name: `segredo-${suffix}.pdf`, url: "https://example.test/secret.pdf", type: "application/pdf", size: "10 KB" } })
  const inbox = await prisma.inboxItem.create({ data: { workspaceId, sourceType: "manual", rawContent: `mensagem-ultrassecreta-${suffix}`, contentHash: `hash-${suffix}` } })
  const job = await prisma.backgroundJob.create({ data: { workspaceId, caseId: lawCase.id, inboxItemId: inbox.id, type: "PROCESS_INBOX_ITEM", payload: { inboxItemId: inbox.id }, createdBy: "foreign" } })
  const action = await prisma.reasonChain.create({ data: { caseId: lawCase.id, agentType: "analysis", action: `acao-secreta-${suffix}`, reasoning: "privado", status: "pending", impact: "high", confidence: 1 } })

  await expectHidden(`/api/cases/${lawCase.id}`)
  await expectHidden(`/api/cases/${lawCase.id}/analyze`)
  await expectHidden(`/api/jobs/${job.id}`)
  await expectHidden(`/api/files/${file.id}/download`)
  await expectHidden(`/api/cases/${lawCase.id}/call`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phoneNumber: "+5511999999999", message: "teste" }) })
  await expectHidden(`/api/cases/${lawCase.id}/email`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to: "x@example.test", subject: "teste", content: "teste" }) })

  const search = await fetch(`${baseUrl}/api/search?q=${encodeURIComponent(suffix)}`).then((response) => response.text())
  assert.ok(!search.includes(lawCase.id) && !search.includes(suffix), "A pesquisa global vazou dados de outro workspace")
  const communications = await fetch(`${baseUrl}/api/communications`).then((response) => response.text())
  assert.ok(!communications.includes(inbox.id) && !communications.includes(suffix), "Comunicações vazaram dados de outro workspace")
  const actions = await fetch(`${baseUrl}/api/actions`).then((response) => response.text())
  assert.ok(!actions.includes(action.id) && !actions.includes(suffix), "Ações vazaram dados de outro workspace")

  console.log(JSON.stringify({ isolation: "ok", checkedRoutes: 9 }, null, 2))
} finally {
  await prisma.workspace.deleteMany({ where: { id: workspaceId } })
  await prisma.$disconnect()
}
