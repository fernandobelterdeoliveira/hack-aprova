import { randomUUID } from "node:crypto"
import type { Prisma } from "@prisma/client"

import { processInboxItem } from "@/lib/ingestion"
import { processCaseAnalysis } from "@/lib/case-analysis"
import { runTicketJob, repairPendingTicketDeliveries, TICKET_JOB } from "@/lib/municipal/tickets"
import { prisma } from "@/lib/prisma"
import { JOB_TYPES, JobCancelledError, cancelJob, claimNextJob, completeJob, failJob, recoverStaleJobs, updateJobProgress } from "@/lib/jobs/queue"

function payloadRecord(value: Prisma.JsonValue) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {}
}

async function executeClaimedJob(job: Awaited<ReturnType<typeof claimNextJob>>) {
  if (!job) return false
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error(`Timeout de ${job.timeoutMs}ms excedido`)), job.timeoutMs)
  try {
    if (job.cancelRequestedAt) throw new JobCancelledError()
    if (job.type === TICKET_JOB) {
      const result = await runTicketJob(job.payload, job.workspaceId, job.deduplicationKey || job.id, job.createdBy)
      await completeJob(job.id, result)
      return true
    }
    if (job.type === JOB_TYPES.PROCESS_INBOX_ITEM) {
      const payload = payloadRecord(job.payload)
      const inboxItemId = typeof payload.inboxItemId === "string" ? payload.inboxItemId : job.inboxItemId
      if (!inboxItemId) throw new Error("Job sem inboxItemId")
      const item = await processInboxItem(inboxItemId, {
        workspaceId: job.workspaceId,
        signal: controller.signal,
        onProgress: (progress, message) => updateJobProgress(job.id, progress, message),
      })
      await completeJob(job.id, { inboxItemId, reviewStatus: item?.reviewStatus || null })
      return true
    }
    if (job.type === JOB_TYPES.ANALYZE_CASE) {
      const payload = payloadRecord(job.payload)
      const caseId = typeof payload.caseId === "string" ? payload.caseId : job.caseId
      const userRequest = typeof payload.userRequest === "string" ? payload.userRequest : ""
      const fileUrls = Array.isArray(payload.fileUrls) ? payload.fileUrls.filter((value): value is string => typeof value === "string") : []
      if (!caseId || !userRequest) throw new Error("Job de análise incompleto")
      const result = await processCaseAnalysis({ workspaceId: job.workspaceId, caseId, userRequest, fileUrls, signal: controller.signal, onProgress: (progress, message) => updateJobProgress(job.id, progress, message) })
      await completeJob(job.id, result as unknown as Prisma.InputJsonValue)
      return true
    }
    throw new Error(`Tipo de job não suportado: ${job.type}`)
  } catch (error) {
    if (error instanceof JobCancelledError) await cancelJob(job.id)
    else await failJob(job, controller.signal.aborted ? controller.signal.reason || error : error)
    return true
  } finally {
    clearTimeout(timeout)
  }
}

export async function runWorker(options?: { once?: boolean; concurrency?: number; pollMs?: number; types?: string[] }) {
  const workerId = `${process.env.COMPUTERNAME || "worker"}-${process.pid}-${randomUUID().slice(0, 8)}`
  const concurrency = Math.max(1, options?.concurrency || Number(process.env.JOB_WORKER_CONCURRENCY || 2))
  const pollMs = Math.max(250, options?.pollMs || Number(process.env.JOB_POLL_INTERVAL_MS || 1000))
  await recoverStaleJobs(options?.types)
  if(options?.types?.includes(TICKET_JOB))await repairPendingTicketDeliveries()
  let lastRecovery = Date.now()
  let stopping = false
  const stop = () => { stopping = true }
  process.once("SIGINT", stop)
  process.once("SIGTERM", stop)
  const runners = Array.from({ length: concurrency }, async () => {
    do {
      if (options?.types?.length && Date.now() - lastRecovery > 30000) { await recoverStaleJobs(options.types); if(options.types.includes(TICKET_JOB))await repairPendingTicketDeliveries(); lastRecovery = Date.now() }
      const worked = await executeClaimedJob(await claimNextJob(workerId, options?.types))
      if (options?.once) return
      if (!worked) await new Promise((resolve) => setTimeout(resolve, pollMs))
    } while (!stopping)
  })
  await Promise.all(runners)
  await prisma.$disconnect()
}
