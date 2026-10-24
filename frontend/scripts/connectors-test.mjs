import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { PrismaClient } from "@prisma/client"

process.loadEnvFile?.(".env.local")
const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:3001"
const secret = process.env.TEST_WHATSAPP_APP_SECRET || "connector-test-app-secret"
const verifyToken = process.env.TEST_WHATSAPP_VERIFY_TOKEN || "connector-test-verify-token"
const prisma = new PrismaClient()
const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`
const messageId = `wamid.connector-${unique}`
const phoneNumberId = `phone-${unique}`

async function request(path, options = {}, expectedStatus = 200) {
  const response = await fetch(`${baseUrl}${path}`, options)
  const contentType = response.headers.get("content-type") || ""
  const body = contentType.includes("application/json") ? await response.json() : await response.text()
  assert.equal(response.status, expectedStatus, `${options.method || "GET"} ${path}: ${JSON.stringify(body)}`)
  return body
}

try {
  const status = await request("/api/connectors")
  assert.deepEqual(new Set(status.providers.map((provider) => provider.id)), new Set(["whatsapp", "gmail", "google_drive", "outlook"]))

  const challenge = await request(`/api/connectors/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=123456`)
  assert.equal(challenge, "123456")

  const payload = {
    object: "whatsapp_business_account",
    entry: [{
      id: "waba-test",
      changes: [{
        field: "messages",
        value: {
          metadata: { phone_number_id: phoneNumberId, display_phone_number: "+55 11 90000-0000" },
          contacts: [{ wa_id: "5511999999999", profile: { name: "Cliente Conector" } }],
          messages: [{ id: messageId, from: "5511999999999", timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "Mensagem realista recebida pelo conector de teste." } }],
        },
      }],
    }],
  }
  const raw = JSON.stringify(payload)
  const signature = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`
  const options = { method: "POST", headers: { "Content-Type": "application/json", "X-Hub-Signature-256": signature }, body: raw }
  const received = await request("/api/connectors/whatsapp/webhook", options)
  assert.equal(received.processed, 1)
  await request("/api/connectors/whatsapp/webhook", options)

  const inbox = await prisma.inboxItem.findFirst({ where: { workspaceId: "default-workspace", sourceType: "whatsapp", sourceExternalId: messageId } })
  assert.ok(inbox)
  assert.equal(inbox.senderPhone, "5511999999999")
  const delivery = await prisma.connectorDelivery.findUnique({ where: { provider_externalId: { provider: "whatsapp", externalId: messageId } } })
  assert.equal(delivery.status, "processed")
  assert.equal(delivery.signatureVerified, true)
  assert.equal(await prisma.inboxItem.count({ where: { sourceType: "whatsapp", sourceExternalId: messageId } }), 1)
  assert.equal(await prisma.outboundMessage.count({ where: { inboxItemId: inbox.id } }), 0, "autoenvio deve permanecer desativado por padrão")

  await request("/api/connectors/gmail/webhook", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }, 401)
  await request("/api/connectors/google-drive/webhook", { method: "POST" }, 401)
  const validation = await request("/api/connectors/outlook/webhook?validationToken=microsoft-validation", { method: "POST" })
  assert.equal(validation, "microsoft-validation")
  await request("/api/cron/connectors/renew", { method: "POST" }, 401)

  console.log("Connector tests passed: catálogo, assinatura/idempotência, autoenvio seguro, OIDC rejeitado, Drive, Outlook e cron protegido.")
} finally {
  const delivery = await prisma.connectorDelivery.findUnique({ where: { provider_externalId: { provider: "whatsapp", externalId: messageId } } })
  if (delivery?.inboxItemId) await prisma.inboxItem.delete({ where: { id: delivery.inboxItemId } })
  if (delivery) await prisma.connectorDelivery.delete({ where: { id: delivery.id } })
  await prisma.connectorAccount.deleteMany({ where: { provider: "whatsapp", externalAccountId: phoneNumberId } })
  await prisma.$disconnect()
}
