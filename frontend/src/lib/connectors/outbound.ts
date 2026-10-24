import { createHash } from "node:crypto"
import type { ConnectorAccount } from "@prisma/client"
import { prisma } from "@/lib/prisma"

const RECEIPT_TEXT = "Recebemos sua mensagem e ela foi encaminhada para análise da equipe. Esta confirmação não contém orientação jurídica."
const RECEIPT_SUBJECT = "Confirmação de recebimento"

function whatsappToken() {
  if (!process.env.WHATSAPP_ACCESS_TOKEN) throw new Error("WHATSAPP_ACCESS_TOKEN não configurado")
  return process.env.WHATSAPP_ACCESS_TOKEN
}

function isSafeRecipient(value: string) {
  const normalized = value.toLowerCase()
  return !/(^|[._-])(no-?reply|mailer-daemon|postmaster)(@|[._-])/.test(normalized)
}

export async function sendWithProvider(account: ConnectorAccount, recipient: string, subject: string | null, content: string) {
  if (account.provider === "whatsapp") {
    const response = await fetch(`https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || "v23.0"}/${encodeURIComponent(account.externalAccountId)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${whatsappToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: recipient, type: "text", text: { body: content } }),
    })
    if (!response.ok) throw new Error(`WhatsApp envio retornou ${response.status}`)
    const result = await response.json() as { messages?: Array<{ id: string }> }
    return result.messages?.[0]?.id || null
  }
  if (account.provider === "gmail") {
    const { googleAccessToken } = await import("@/lib/connectors/google")
    const token = await googleAccessToken(account)
    const raw = [
      `To: ${recipient}`,
      `Subject: ${subject || "Mensagem"}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Auto-Submitted: auto-replied",
      "X-Auto-Response-Suppress: All",
      "",
      content,
    ].join("\r\n")
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: Buffer.from(raw).toString("base64url") }),
    })
    if (!response.ok) throw new Error(`Gmail envio retornou ${response.status}`)
    return (await response.json() as { id?: string }).id || null
  }
  if (account.provider === "outlook") {
    const { microsoftAccessToken } = await import("@/lib/connectors/microsoft")
    const token = await microsoftAccessToken(account)
    const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { subject: subject || "Mensagem", body: { contentType: "Text", content }, toRecipients: [{ emailAddress: { address: recipient } }] }, saveToSentItems: true }),
    })
    if (!response.ok) throw new Error(`Outlook envio retornou ${response.status}`)
    return null
  }
  throw new Error(`Canal ${account.provider} não suporta envio`)
}

export async function dispatchOutboundMessage(id: string) {
  const message = await prisma.outboundMessage.findUnique({ where: { id }, include: { connectorAccount: true } })
  if (!message) throw new Error("Mensagem de saída não encontrada")
  if (message.status === "sent") return message
  if (message.status !== "approved" && message.status !== "queued") throw new Error("Mensagem não está autorizada para envio")
  if (message.riskLevel !== "low" || message.messageKind !== "receipt_acknowledgement") throw new Error("Somente confirmação determinística de baixo risco pode ser enviada automaticamente")
  try {
    const externalId = await sendWithProvider(message.connectorAccount, message.recipient, message.subject, message.content)
    return prisma.outboundMessage.update({ where: { id }, data: { status: "sent", sentAt: new Date(), externalId, errorMessage: null } })
  } catch (error) {
    await prisma.outboundMessage.update({ where: { id }, data: { status: "failed", errorMessage: error instanceof Error ? error.message : "Falha no envio" } })
    throw error
  }
}

export async function createAutomaticReceipt(input: { accountId: string; inboxItemId: string }) {
  if (process.env.CONNECTOR_AUTO_ACK_ENABLED !== "true") return null
  const inbox = await prisma.inboxItem.findUnique({ where: { id: input.inboxItemId } })
  const account = await prisma.connectorAccount.findUnique({ where: { id: input.accountId } })
  if (!inbox || !account) return null
  const recipient = account.provider === "whatsapp" ? inbox.senderPhone : inbox.senderEmail
  if (!recipient || !isSafeRecipient(recipient) || recipient.toLowerCase() === account.email?.toLowerCase()) return null
  const idempotencyKey = createHash("sha256").update(`receipt:${account.id}:${inbox.id}:${recipient}`).digest("hex")
  const message = await prisma.outboundMessage.upsert({
    where: { idempotencyKey },
    update: {},
    create: {
      channel: account.provider,
      connectorAccountId: account.id,
      caseId: inbox.detectedCaseId,
      inboxItemId: inbox.id,
      recipient,
      subject: account.provider === "whatsapp" ? null : RECEIPT_SUBJECT,
      content: RECEIPT_TEXT,
      riskLevel: "low",
      messageKind: "receipt_acknowledgement",
      status: "approved",
      approvedBy: "policy:automatic-low-risk-receipt-v1",
      approvedAt: new Date(),
      idempotencyKey,
    },
  })
  if (message.status === "sent") return message
  return dispatchOutboundMessage(message.id)
}
