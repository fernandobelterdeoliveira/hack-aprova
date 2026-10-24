import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { contentFingerprint } from "@/lib/ingestion-hash"
import { enqueueInboxProcessing } from "@/lib/jobs/queue"

export type InboxInput = {
  workspaceId?: string
  sourceType: "email" | "whatsapp" | "upload" | "audio" | "document" | "manual"
  sourceExternalId?: string | null
  senderName?: string | null
  senderEmail?: string | null
  senderPhone?: string | null
  receivedAt?: Date | string | null
  rawContent: string
  fileName?: string | null
  fileType?: string | null
  fileUrl?: string | null
  createdBy?: string | null
}

const inboxInclude = {
  detectedCase: { select: { id: true, caseNumber: true, clientName: true, caseType: true } },
  proposedChanges: { orderBy: { createdAt: "asc" as const } },
  processingRuns: { orderBy: { startedAt: "desc" as const }, take: 1 },
  aiExecutions: { orderBy: { startedAt: "desc" as const }, take: 10 },
  backgroundJobs: { orderBy: { createdAt: "desc" as const }, take: 1 },
}

export async function createInboxItem(input: InboxInput) {
  const workspaceId = input.workspaceId || "default-workspace"
  const contentHash = contentFingerprint({
    sourceExternalId: input.sourceExternalId || null,
    content: input.rawContent.trim().replace(/\s+/g, " "),
    senderEmail: input.senderEmail || null,
    senderPhone: input.senderPhone || null,
    senderName: input.senderName || null,
    fileName: input.fileName || null,
    fileUrl: input.fileUrl || null,
  })
  const identity = input.sourceExternalId
    ? { workspaceId, sourceType: input.sourceType, sourceExternalId: input.sourceExternalId }
    : { workspaceId, sourceType: input.sourceType, contentHash }
  const existing = await prisma.inboxItem.findFirst({ where: identity, include: inboxInclude })
  if (existing) return { item: existing, deduplicated: true }

  try {
    const created = await prisma.inboxItem.create({
      data: {
        workspaceId,
        sourceType: input.sourceType,
        sourceExternalId: input.sourceExternalId || null,
        senderName: input.senderName || null,
        senderEmail: input.senderEmail || null,
        senderPhone: input.senderPhone || null,
        receivedAt: input.receivedAt ? new Date(input.receivedAt) : new Date(),
        rawContent: input.rawContent,
        contentHash,
        fileName: input.fileName || null,
        fileType: input.fileType || null,
        fileUrl: input.fileUrl || null,
        processingStatus: "queued",
      },
    })
    await enqueueInboxProcessing({ workspaceId, inboxItemId: created.id, createdBy: input.createdBy || "connector", contentHash })
    return {
      item: await prisma.inboxItem.findUnique({ where: { id: created.id }, include: inboxInclude }),
      deduplicated: false,
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await prisma.inboxItem.findFirst({ where: identity, include: inboxInclude })
      if (raced) return { item: raced, deduplicated: true }
    }
    throw error
  }
}
