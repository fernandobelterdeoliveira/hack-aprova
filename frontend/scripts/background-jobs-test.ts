import assert from "node:assert/strict"

import { createInboxItem } from "../src/lib/inbox-service"
import { runWorker } from "../src/lib/jobs/worker"
import { prisma } from "../src/lib/prisma"

const suffix = crypto.randomUUID().slice(0, 8)
const workspaceId = `jobs-test-${suffix}`

async function main() {
try {
  await prisma.workspace.create({ data: { id: workspaceId, name: "Teste de fila", slug: `jobs-test-${suffix}` } })
  const lawCase = await prisma.case.create({
    data: {
      workspaceId,
      caseType: "Acidente de trânsito",
      clientName: "João Teste",
      clientEmail: `joao-${suffix}@example.test`,
      caseNumber: `JOB-${suffix}`,
      assignedTo: "Equipe de teste",
      description: "Caso criado para validar processamento assíncrono.",
      nextAction: "Revisar entrada",
    },
  })

  const created = await createInboxItem({
    workspaceId,
    createdBy: "automated-test",
    sourceType: "manual",
    sourceExternalId: `source-${suffix}`,
    senderName: "João Teste",
    senderEmail: `joao-${suffix}@example.test`,
    rawContent: `Caso ${lawCase.caseNumber}: comecei fisioterapia hoje.`,
  })
  assert.ok(created.item)
  const queuedJob = await prisma.backgroundJob.findFirstOrThrow({ where: { inboxItemId: created.item!.id } })
  assert.equal(queuedJob.status, "queued")

  const poisonJob = await prisma.backgroundJob.create({
    data: {
      workspaceId,
      type: "UNSUPPORTED_TEST_JOB",
      status: "queued",
      payload: {},
      maxAttempts: 1,
      timeoutMs: 5_000,
      createdBy: "automated-test",
    },
  })

  await runWorker({ once: true, concurrency: 2, pollMs: 50 })

  const [completed, deadLetter, processedItem] = await Promise.all([
    prisma.backgroundJob.findUniqueOrThrow({ where: { id: queuedJob.id } }),
    prisma.backgroundJob.findUniqueOrThrow({ where: { id: poisonJob.id } }),
    prisma.inboxItem.findUniqueOrThrow({ where: { id: created.item!.id }, include: { proposedChanges: true } }),
  ])
  assert.equal(completed.status, "completed")
  assert.equal(completed.progress, 100)
  assert.equal(deadLetter.status, "dead_letter")
  assert.match(deadLetter.lastError || "", /não suportado/i)
  assert.equal(processedItem.processingStatus, "completed")
  assert.ok(processedItem.proposedChanges.length > 0)
  assert.ok(processedItem.proposedChanges.every((change) => Boolean(change.sourceId) && typeof change.confidence === "number"))

  const cancellable = await prisma.backgroundJob.create({
    data: { workspaceId, type: "UNSUPPORTED_TEST_JOB", status: "cancelled", payload: {}, createdBy: "automated-test", cancelRequestedAt: new Date(), completedAt: new Date() },
  })
  assert.equal(cancellable.status, "cancelled")

  console.log(JSON.stringify({
    queue: "ok",
    completedJob: completed.id,
    progress: completed.progress,
    deadLetter: deadLetter.id,
    proposedChanges: processedItem.proposedChanges.length,
    cancellation: "ok",
  }, null, 2))
} finally {
  await prisma.workspace.deleteMany({ where: { id: workspaceId } })
  await prisma.$disconnect()
}
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
