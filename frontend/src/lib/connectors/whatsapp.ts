import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { confirmFromWhatsApp } from "@/lib/municipal/service"
import { processConnectorDelivery } from "@/lib/connectors/delivery"

type WhatsAppMessage = {
  id: string
  context?: { id?: string }
  from: string
  timestamp?: string
  type?: string
  text?: { body?: string }
  image?: { id?: string; mime_type?: string; caption?: string }
  document?: { id?: string; mime_type?: string; filename?: string; caption?: string }
  audio?: { id?: string; mime_type?: string }
  video?: { id?: string; mime_type?: string; caption?: string }
}

async function downloadWhatsAppMedia(media: { id?: string; mime_type?: string }, fallbackName?: string) {
  if (!media.id) return []
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  if (!token) throw new Error("WHATSAPP_ACCESS_TOKEN não configurado para baixar a mídia")
  const metadataResponse = await fetch(`https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || "v23.0"}/${encodeURIComponent(media.id)}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!metadataResponse.ok) throw new Error(`WhatsApp media metadata retornou ${metadataResponse.status}`)
  const metadata = await metadataResponse.json() as { url: string; mime_type?: string; file_size?: number; sha256?: string }
  const mediaResponse = await fetch(metadata.url, { headers: { Authorization: `Bearer ${token}` } })
  if (!mediaResponse.ok) throw new Error(`WhatsApp media download retornou ${mediaResponse.status}`)
  const mimeType = metadata.mime_type || media.mime_type || mediaResponse.headers.get("content-type") || "application/octet-stream"
  const extension = mimeType.split("/")[1]?.split(";")[0]?.replace("jpeg", "jpg") || "bin"
  return [{
    bytes: Buffer.from(await mediaResponse.arrayBuffer()),
    name: fallbackName || `whatsapp-${media.id}.${extension}`,
    mimeType,
    sourceExternalId: media.id,
    metadata: { upstreamSha256: metadata.sha256 || null, upstreamSize: metadata.file_size || null },
  }]
}

export async function processWhatsAppPayload(payload: unknown) {
  const root = payload as {
    entry?: Array<{ id?: string; changes?: Array<{ value?: { metadata?: { phone_number_id?: string; display_phone_number?: string }; contacts?: Array<{ wa_id?: string; profile?: { name?: string; picture_url?: string; profile_picture_url?: string; image_url?: string } }>; statuses?: Array<{ id: string; status: string; errors?: Array<{ title?: string; message?: string }> }>; messages?: WhatsAppMessage[] } }> }>
  }
  const results = []
  for (const entry of root.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value
      const phoneNumberId = value?.metadata?.phone_number_id || entry.id || "unknown"
      const known = await prisma.connectorAccount.findUnique({ where: { provider_externalAccountId: { provider: "whatsapp", externalAccountId: phoneNumberId } } })
      if (!known && phoneNumberId !== process.env.WHATSAPP_PHONE_NUMBER_ID) throw new Error("Número de WhatsApp não configurado neste servidor")
      const account = await prisma.connectorAccount.upsert({
        where: { provider_externalAccountId: { provider: "whatsapp", externalAccountId: phoneNumberId } },
        update: { status: "connected", errorMessage: null, config: { displayPhoneNumber: value?.metadata?.display_phone_number || null } },
        create: { provider: "whatsapp", externalAccountId: phoneNumberId, displayName: value?.metadata?.display_phone_number, config: { displayPhoneNumber: value?.metadata?.display_phone_number || null } },
      })
      for (const delivery of value?.statuses || []) {
        const previous = await prisma.whatsAppChatMessage.findUnique({ where: { providerId: delivery.id } })
        const rank: Record<string, number> = { sending: 0, sent: 1, delivered: 2, read: 3, failed: 4 }
        const ticketMessage = await prisma.municipalTicketMessage.findFirst({where:{externalId:delivery.id,workspaceId:account.workspaceId,ticket:{connectorAccountId:account.id}}})
        if(ticketMessage && (rank[delivery.status]??-1)>=(rank[ticketMessage.deliveryStatus]??-1))await prisma.municipalTicketMessage.update({where:{id:ticketMessage.id},data:{deliveryStatus:delivery.status,errorMessage:delivery.errors?.map(e=>e.title||e.message).join("; ")||null}})
        if (previous && (rank[delivery.status] ?? -1) >= (rank[previous.status] ?? -1)) await prisma.whatsAppChatMessage.updateMany({ where: { providerId: delivery.id, accountId: account.id }, data: { status: delivery.status, errorMessage: delivery.errors?.map(e => e.title || e.message).join("; ") || null } })
      }
      for (const message of value?.messages || []) {
        const contact = value?.contacts?.find((item) => item.wa_id === message.from) || value?.contacts?.[0]
        const media = message.document || message.image || message.audio || message.video
        const caption = "caption" in (media || {}) ? String((media as { caption?: string }).caption || "") : ""
        const content = message.text?.body || caption || `[${message.type || "mensagem"} recebida pelo WhatsApp]`
        const receivedAt = message.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date()
        const chat = await prisma.whatsAppChatMessage.upsert({
          where: { providerId: message.id }, update: {},
          create: { workspaceId: account.workspaceId, accountId: account.id, providerId: message.id, phone: message.from, contactName: contact?.profile?.name, direction: "received", content, status: "received", createdAt: receivedAt },
        })
        await confirmFromWhatsApp(account.workspaceId, message.from, content, chat.id)
        await prisma.connectorAccount.update({ where: { id: account.id }, data: { lastSyncedAt: new Date() } })
        const attachments = media ? await downloadWhatsAppMedia(media, message.document?.filename) : []
        const senderAvatarUrl = contact?.profile?.picture_url || contact?.profile?.profile_picture_url || contact?.profile?.image_url || null
        const processed = await processConnectorDelivery({
          accountId: account.id,
          signatureVerified: true,
          payload: { ...message, senderProfile: contact?.profile || null } as unknown as Prisma.InputJsonValue,
          normalized: {
            provider: "whatsapp",
            externalId: message.id,
            accountExternalId: phoneNumberId,
            sourceType: message.audio ? "audio" : media ? "document" : "whatsapp",
            sourceExternalId: message.id,
            senderName: contact?.profile?.name,
            senderPhone: message.from,
            receivedAt: message.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date(),
            rawContent: content,
            fileName: message.document?.filename,
            fileType: media?.mime_type,
            metadata: { mediaId: media?.id || null, messageType: message.type || null, senderAvatarUrl, replyTo: message.context?.id || null },
            attachments,
          },
        })
        results.push(processed)
        const storedObjects = await prisma.storedObject.findMany({ where: { connectorDeliveryId: processed.delivery.id }, select: { id: true, originalName: true, mimeType: true } })
        if (storedObjects.length) await prisma.whatsAppChatMessage.update({ where: { id: chat.id }, data: { attachments: storedObjects.map(object => ({ id: object.id, name: object.originalName, mimeType: object.mimeType })) } })
      }
    }
  }
  return results
}
