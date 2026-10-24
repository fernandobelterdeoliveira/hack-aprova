import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { createInboxItem } from "@/lib/inbox-service"
import type { NormalizedConnectorItem } from "@/lib/connectors/types"
import { persistAttachment, signedStoragePath } from "@/lib/connectors/storage"
import { routeConnectorToTicket } from "@/lib/municipal/tickets"
import { createAutomaticReceipt } from "@/lib/connectors/outbound"

export async function processConnectorDelivery(input: {
  normalized: NormalizedConnectorItem
  payload: Prisma.InputJsonValue
  signatureVerified: boolean
  accountId?: string | null
}) {
  const existing = await prisma.connectorDelivery.findUnique({
    where: { provider_externalId: { provider: input.normalized.provider, externalId: input.normalized.externalId } },
    include: { inboxItem: true },
  })
  if (existing) return { delivery: existing, deduplicated: true }

  const delivery = await prisma.connectorDelivery.create({
    data: {
      provider: input.normalized.provider,
      externalId: input.normalized.externalId,
      accountId: input.accountId || null,
      payload: input.payload,
      signatureVerified: input.signatureVerified,
    },
  })
  try {
    const account = input.accountId
      ? await prisma.connectorAccount.findUnique({ where: { id: input.accountId }, select: { workspaceId: true } })
      : null
    const stored = []
    for (const attachment of input.normalized.attachments || []) {
      stored.push(await persistAttachment({
        ...attachment,
        sourceProvider: input.normalized.provider,
        connectorAccountId: input.accountId,
        connectorDeliveryId: delivery.id,
      }))
    }
    const primary = stored[0]
    const result = await createInboxItem({
      workspaceId: account?.workspaceId,
      sourceType: input.normalized.sourceType,
      sourceExternalId: input.normalized.externalId,
      senderName: input.normalized.senderName,
      senderEmail: input.normalized.senderEmail,
      senderPhone: input.normalized.senderPhone,
      receivedAt: input.normalized.receivedAt,
      rawContent: input.normalized.rawContent,
      fileName: primary?.originalName || input.normalized.fileName,
      fileType: primary?.mimeType || input.normalized.fileType,
      fileUrl: primary ? signedStoragePath(primary.id) : input.normalized.fileUrl,
    })
    if (result.item?.id && stored.length) {
      await prisma.storedObject.updateMany({ where: { id: { in: stored.map((item) => item.id) } }, data: { inboxItemId: result.item.id } })
    }
    if (result.item?.id && input.accountId) {
      await createAutomaticReceipt({ accountId: input.accountId, inboxItemId: result.item.id }).catch(() => undefined)
    }
    if (result.item?.id) {
      try {
        await routeConnectorToTicket({ workspaceId: account?.workspaceId || "default-workspace", accountId: input.accountId, externalId: input.normalized.externalId, channel: input.normalized.provider, content: input.normalized.rawContent, author: input.normalized.senderName || input.normalized.senderEmail || input.normalized.senderPhone || "Contato", phone: input.normalized.senderPhone, email: input.normalized.senderEmail, inboxItemId: result.item.id, storageId: primary?.id, replyTo: typeof (input.normalized.metadata as Record<string,unknown> | undefined)?.replyTo === "string" ? String((input.normalized.metadata as Record<string,unknown>).replyTo) : undefined })
      } catch (error) {
        await prisma.connectorDelivery.update({where:{id:delivery.id},data:{errorMessage:`Ticket: ${error instanceof Error ? error.message : "falha no encaminhamento"}. Entrada original preservada.`}})
      }
    }
    return {
      delivery: await prisma.connectorDelivery.update({
        where: { id: delivery.id },
        data: { inboxItemId: result.item?.id || null, status: "processed", processedAt: new Date() },
      }),
      deduplicated: result.deduplicated,
    }
  } catch (error) {
    await prisma.connectorDelivery.update({
      where: { id: delivery.id },
      data: { status: "failed", errorMessage: error instanceof Error ? error.message : "Falha desconhecida", processedAt: new Date() },
    })
    throw error
  }
}
