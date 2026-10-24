import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { createInboxItem } from "@/lib/inbox-service"
import { signedStoragePath } from "@/lib/connectors/storage"
import { currentActor } from "@/lib/auth/current-actor"

const inboxInput = z.object({
  sourceType: z.enum(["email", "whatsapp", "upload", "audio", "document", "manual"]),
  sourceExternalId: z.string().trim().optional(),
  senderName: z.string().trim().optional(),
  senderEmail: z.string().trim().email().optional().or(z.literal("")),
  senderPhone: z.string().trim().optional(),
  receivedAt: z.string().datetime().optional(),
  rawContent: z.string().trim().min(1),
  fileName: z.string().trim().optional(),
  fileType: z.string().trim().optional(),
  fileUrl: z.string().trim().url().optional().or(z.literal("")),
})

export async function GET(request: NextRequest) {
  try {
    const actor = await currentActor()
    const status = request.nextUrl.searchParams.get("status")
    const items = await prisma.inboxItem.findMany({
      where: { workspaceId: actor.workspaceId, ...(status && status !== "all" ? { reviewStatus: status } : {}) },
      include: {
        detectedCase: { select: { id: true, caseNumber: true, clientName: true, caseType: true } },
        proposedChanges: { orderBy: { createdAt: "asc" } },
        processingRuns: { orderBy: { startedAt: "desc" }, take: 1 },
        aiExecutions: { orderBy: { startedAt: "desc" }, take: 10 },
        storedObjects: { orderBy: { createdAt: "asc" } },
        backgroundJobs: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { receivedAt: "desc" },
      take: 100,
    })
    return NextResponse.json(items.map((item) => ({
      ...item,
      storedObjects: item.storedObjects.map((object) => ({ ...object, downloadUrl: signedStoragePath(object.id) })),
    })))
  } catch (error) {
    console.error("Error fetching inbox:", error)
    return NextResponse.json({ error: "Não foi possível carregar a caixa de entrada" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await currentActor()
    const parsed = inboxInput.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "Entrada da caixa de entrada inválida", details: parsed.error.flatten() }, { status: 400 })
    }
    const input = parsed.data
    const result = await createInboxItem({ ...input, workspaceId: actor.workspaceId, createdBy: actor.userProfileId, receivedAt: input.receivedAt || null })
    return NextResponse.json(result.item, {
      status: result.deduplicated ? 200 : 201,
      headers: result.deduplicated ? { "X-Inbox-Deduplicated": "true" } : undefined,
    })
  } catch (error) {
    console.error("Error creating inbox item:", error)
    return NextResponse.json(
      { error: "Não foi possível criar a entrada", details: error instanceof Error ? error.message : "Erro desconhecido" },
      { status: 500 },
    )
  }
}
