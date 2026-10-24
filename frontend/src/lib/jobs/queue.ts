import { Prisma, type BackgroundJob } from "@prisma/client"

import { contentFingerprint } from "@/lib/ingestion-hash"
import { prisma } from "@/lib/prisma"

export const JOB_TYPES = {
  PROCESS_INBOX_ITEM: "PROCESS_INBOX_ITEM",
  ANALYZE_CASE: "ANALYZE_CASE",
} as const

export type JobProgress = (progress: number, message: string) => Promise<void>

export async function enqueueInboxProcessing(input: {
  workspaceId: string
  inboxItemId: string
  createdBy: string
  contentHash: string
  force?: boolean
}) {
  const deduplicationKey = input.force
    ? null
    : contentFingerprint({ type: JOB_TYPES.PROCESS_INBOX_ITEM, inboxItemId: input.inboxItemId, contentHash: input.contentHash, version: "1" })
  if (deduplicationKey) {
    const existing = await prisma.backgroundJob.findUnique({ where: { deduplicationKey } })
    if (existing) return existing
  }
  return prisma.backgroundJob.create({
    data: {
      workspaceId: input.workspaceId,
      inboxItemId: input.inboxItemId,
      type: JOB_TYPES.PROCESS_INBOX_ITEM,
      payload: { inboxItemId: input.inboxItemId },
      status: "queued",
      progress: 0,
      progressMessage: "Aguardando processamento",
      maxAttempts: Number(process.env.JOB_MAX_ATTEMPTS || 3),
      timeoutMs: Number(process.env.JOB_TIMEOUT_MS || 300_000),
      createdBy: input.createdBy,
      deduplicationKey,
    },
  })
}

export async function enqueueCaseAnalysis(input: {
  workspaceId: string
  caseId: string
  createdBy: string
  userRequest: string
  fileUrls: string[]
}) {
  return prisma.backgroundJob.create({
    data: {
      workspaceId: input.workspaceId,
      caseId: input.caseId,
      type: JOB_TYPES.ANALYZE_CASE,
      payload: { caseId: input.caseId, userRequest: input.userRequest, fileUrls: input.fileUrls },
      status: "queued",
      progressMessage: "Aguardando análise",
      maxAttempts: Number(process.env.JOB_MAX_ATTEMPTS || 3),
      timeoutMs: Number(process.env.CASE_ANALYSIS_TIMEOUT_MS || 600_000),
      createdBy: input.createdBy,
    },
  })
}

export async function claimNextJob(workerId: string, types?: string[]): Promise<BackgroundJob | null> {
  const jobs = await prisma.$queryRaw<BackgroundJob[]>(Prisma.sql`
    UPDATE "BackgroundJob"
    SET "status" = 'running',
        "lockedAt" = NOW(),
        "lockedBy" = ${workerId},
        "startedAt" = COALESCE("startedAt", NOW()),
        "attempts" = "attempts" + 1,
        "progressMessage" = 'Processamento iniciado',
        "updatedAt" = NOW()
    WHERE "id" = (
      SELECT "id" FROM "BackgroundJob"
      WHERE "status" = 'queued'
        AND "availableAt" <= NOW()
        ${types?.length ? Prisma.sql`AND "type" IN (${Prisma.join(types)})` : Prisma.empty}
        AND "cancelRequestedAt" IS NULL
      ORDER BY "priority" DESC, "availableAt" ASC, "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *
  `)
  return jobs[0] || null
}

export async function recoverStaleJobs(types?: string[]) {
  const staleBefore = new Date(Date.now() - Number(process.env.JOB_STALE_AFTER_MS || 15 * 60_000))
  const stale = await prisma.backgroundJob.findMany({ where: { status: "running", lockedAt: { lt: staleBefore }, ...(types?.length ? {type:{in:types}} : {}) } })
  for (const job of stale) {
    const dead = job.attempts >= job.maxAttempts
    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: dead
        ? { status: "dead_letter", deadLetteredAt: new Date(), completedAt: new Date(), lockedAt: null, lockedBy: null, lastError: "Worker interrompido ou lease expirada" }
        : { status: "queued", availableAt: new Date(), lockedAt: null, lockedBy: null, lastError: "Worker interrompido; tarefa devolvida à fila" },
    })
  }
  return stale.length
}

export async function updateJobProgress(jobId: string, progress: number, message: string) {
  const result = await prisma.backgroundJob.updateMany({
    where: { id: jobId, status: "running", cancelRequestedAt: null },
    data: { progress: Math.max(0, Math.min(99, Math.round(progress))), progressMessage: message, lockedAt: new Date() },
  })
  if (!result.count) throw new JobCancelledError()
}

export class JobCancelledError extends Error {
  constructor() { super("Processamento cancelado pelo usuário"); this.name = "JobCancelledError" }
}

export async function completeJob(jobId: string, result: Prisma.InputJsonValue) {
  return prisma.backgroundJob.update({ where: { id: jobId }, data: { status: "completed", result, progress: 100, progressMessage: "Concluído", completedAt: new Date(), lockedAt: null, lockedBy: null } })
}

export async function cancelJob(jobId: string, message = "Cancelado") {
  return prisma.backgroundJob.update({ where: { id: jobId }, data: { status: "cancelled", progressMessage: message, completedAt: new Date(), lockedAt: null, lockedBy: null } })
}

export async function failJob(job: BackgroundJob, error: unknown) {
  const message = error instanceof Error ? error.message : "Falha desconhecida"
  const dead = job.attempts >= job.maxAttempts
  const delaySeconds = Math.min(300, 5 * (2 ** Math.max(0, job.attempts - 1)))
  return prisma.backgroundJob.update({
    where: { id: job.id },
    data: dead
      ? { status: "dead_letter", lastError: message, deadLetteredAt: new Date(), completedAt: new Date(), progressMessage: "Falha permanente", lockedAt: null, lockedBy: null }
      : { status: "queued", lastError: message, availableAt: new Date(Date.now() + delaySeconds * 1000), progressMessage: `Nova tentativa em ${delaySeconds}s`, lockedAt: null, lockedBy: null },
  })
}
