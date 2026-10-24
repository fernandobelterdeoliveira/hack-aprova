import { randomUUID } from "node:crypto"
import type { ConnectorAccount, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { decryptCredentials, encryptCredentials, signedState } from "@/lib/connectors/crypto"
import { processConnectorDelivery } from "@/lib/connectors/delivery"
import type { OAuthCredentials } from "@/lib/connectors/types"

const SCOPES = ["openid", "profile", "email", "offline_access", "User.Read", "Mail.Read", "Mail.Send"]

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} não configurada`)
  return value
}

function tenant() {
  return process.env.MICROSOFT_CONNECTOR_TENANT_ID || "common"
}

export function microsoftConfigured() {
  return Boolean(process.env.MICROSOFT_CONNECTOR_CLIENT_ID && process.env.MICROSOFT_CONNECTOR_CLIENT_SECRET && process.env.CONNECTOR_ENCRYPTION_KEY)
}

export function microsoftRedirectUri() {
  return process.env.MICROSOFT_CONNECTOR_REDIRECT_URI || `${required("APP_BASE_URL")}/api/connectors/microsoft/callback`
}

export function microsoftAuthorizationUrl() {
  const params = new URLSearchParams({
    client_id: required("MICROSOFT_CONNECTOR_CLIENT_ID"),
    response_type: "code",
    redirect_uri: microsoftRedirectUri(),
    response_mode: "query",
    scope: SCOPES.join(" "),
    state: signedState({ provider: "microsoft" }),
  })
  return `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/authorize?${params}`
}

export async function exchangeMicrosoftCode(code: string) {
  const response = await fetch(`https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: required("MICROSOFT_CONNECTOR_CLIENT_ID"),
      client_secret: required("MICROSOFT_CONNECTOR_CLIENT_SECRET"),
      code,
      redirect_uri: microsoftRedirectUri(),
      grant_type: "authorization_code",
      scope: SCOPES.join(" "),
    }),
  })
  if (!response.ok) throw new Error(`Microsoft OAuth retornou ${response.status}`)
  const token = await response.json() as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string; token_type?: string }
  const profileResponse = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName", { headers: { Authorization: `Bearer ${token.access_token}` } })
  if (!profileResponse.ok) throw new Error("Não foi possível identificar a conta Microsoft")
  const profile = await profileResponse.json() as { id: string; displayName?: string; mail?: string; userPrincipalName?: string }
  const credentials: OAuthCredentials = {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: new Date(Date.now() + (token.expires_in || 3600) * 1000).toISOString(),
    scope: token.scope,
    tokenType: token.token_type,
  }
  return prisma.connectorAccount.upsert({
    where: { provider_externalAccountId: { provider: "outlook", externalAccountId: profile.id } },
    update: {
      displayName: profile.displayName,
      email: profile.mail || profile.userPrincipalName,
      encryptedCredentials: encryptCredentials(credentials),
      tokenExpiresAt: new Date(credentials.expiresAt as string),
      status: "connected",
      errorMessage: null,
    },
    create: {
      provider: "outlook",
      externalAccountId: profile.id,
      displayName: profile.displayName,
      email: profile.mail || profile.userPrincipalName,
      encryptedCredentials: encryptCredentials(credentials),
      tokenExpiresAt: new Date(credentials.expiresAt as string),
    },
  })
}

export async function microsoftAccessToken(account: ConnectorAccount) {
  if (!account.encryptedCredentials) throw new Error("Conta Microsoft sem credenciais")
  const credentials = decryptCredentials<OAuthCredentials>(account.encryptedCredentials)
  if (credentials.expiresAt && new Date(credentials.expiresAt).getTime() > Date.now() + 60_000) return credentials.accessToken
  if (!credentials.refreshToken) throw new Error("Conta Microsoft sem refresh token; reconecte a conta")
  const response = await fetch(`https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: required("MICROSOFT_CONNECTOR_CLIENT_ID"),
      client_secret: required("MICROSOFT_CONNECTOR_CLIENT_SECRET"),
      refresh_token: credentials.refreshToken,
      grant_type: "refresh_token",
      scope: SCOPES.join(" "),
    }),
  })
  if (!response.ok) throw new Error(`Renovação Microsoft retornou ${response.status}`)
  const refreshed = await response.json() as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string; token_type?: string }
  const updated: OAuthCredentials = {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token || credentials.refreshToken,
    expiresAt: new Date(Date.now() + (refreshed.expires_in || 3600) * 1000).toISOString(),
    scope: refreshed.scope || credentials.scope,
    tokenType: refreshed.token_type || credentials.tokenType,
  }
  await prisma.connectorAccount.update({ where: { id: account.id }, data: { encryptedCredentials: encryptCredentials(updated), tokenExpiresAt: new Date(updated.expiresAt as string) } })
  return updated.accessToken
}

export async function configureOutlookSubscription(account: ConnectorAccount) {
  const publicUrl = required("APP_PUBLIC_URL")
  const token = await microsoftAccessToken(account)
  const previous = account.config && typeof account.config === "object" && !Array.isArray(account.config) ? account.config as Record<string, unknown> : {}
  const clientState = typeof previous.clientState === "string" ? previous.clientState : randomUUID()
  const expiration = new Date(Date.now() + 2.5 * 24 * 60 * 60 * 1000)
  const existingId = typeof previous.subscriptionId === "string" ? previous.subscriptionId : null
  let response = await fetch(existingId ? `https://graph.microsoft.com/v1.0/subscriptions/${encodeURIComponent(existingId)}` : "https://graph.microsoft.com/v1.0/subscriptions", {
    method: existingId ? "PATCH" : "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(existingId ? { expirationDateTime: expiration.toISOString() } : {
      changeType: "created",
      notificationUrl: `${publicUrl}/api/connectors/outlook/webhook`,
      resource: "/me/mailFolders('inbox')/messages",
      expirationDateTime: expiration.toISOString(),
      clientState,
    }),
  })
  if (existingId && response.status === 404) {
    response = await fetch("https://graph.microsoft.com/v1.0/subscriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ changeType: "created", notificationUrl: `${publicUrl}/api/connectors/outlook/webhook`, resource: "/me/mailFolders('inbox')/messages", expirationDateTime: expiration.toISOString(), clientState }),
    })
  }
  if (!response.ok) throw new Error(`Microsoft subscription retornou ${response.status}`)
  const subscription = await response.json() as { id: string; expirationDateTime: string }
  return prisma.connectorAccount.update({
    where: { id: account.id },
    data: {
      config: { subscriptionId: subscription.id, clientState },
      subscriptionExpiresAt: new Date(subscription.expirationDateTime),
      lastSyncedAt: new Date(),
      errorMessage: null,
    },
  })
}

function plainText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
}

export async function syncOutlookMessage(account: ConnectorAccount, messageId: string) {
  const token = await microsoftAccessToken(account)
  const select = "id,conversationId,subject,body,bodyPreview,from,receivedDateTime,hasAttachments,internetMessageId"
  const response = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}?$select=${select}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) throw new Error(`Microsoft Graph message retornou ${response.status}`)
  const message = await response.json() as {
    id: string
    conversationId?: string
    internetMessageId?: string
    subject?: string
    body?: { contentType?: string; content?: string }
    bodyPreview?: string
    receivedDateTime?: string
    hasAttachments?: boolean
    from?: { emailAddress?: { name?: string; address?: string } }
  }
  const attachments = []
  if (message.hasAttachments) {
    const attachmentResponse = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(message.id)}/attachments?$select=id,name,contentType,size,isInline,contentBytes`, { headers: { Authorization: `Bearer ${token}` } })
    if (attachmentResponse.ok) {
      const result = await attachmentResponse.json() as { value?: Array<{ id: string; name?: string; contentType?: string; isInline?: boolean; contentBytes?: string }> }
      for (const attachment of result.value || []) {
        if (!attachment.isInline && attachment.contentBytes) attachments.push({ bytes: Buffer.from(attachment.contentBytes, "base64"), name: attachment.name || "anexo", mimeType: attachment.contentType || "application/octet-stream", sourceExternalId: attachment.id })
      }
    }
  }
  await processConnectorDelivery({
    accountId: account.id,
    signatureVerified: true,
    payload: message as unknown as Prisma.InputJsonValue,
    normalized: {
      provider: "outlook",
      externalId: message.internetMessageId || message.id,
      accountExternalId: account.externalAccountId,
      threadExternalId: message.conversationId,
      sourceType: "email",
      sourceExternalId: message.internetMessageId || message.id,
      senderName: message.from?.emailAddress?.name,
      senderEmail: message.from?.emailAddress?.address,
      receivedAt: message.receivedDateTime || new Date(),
      rawContent: [`Assunto: ${message.subject || "(sem assunto)"}`, message.body?.contentType === "html" ? plainText(message.body.content || "") : message.body?.content || message.bodyPreview || ""].join("\n\n"),
      fileName: attachments[0]?.name,
      fileType: attachments[0]?.mimeType,
      attachments,
    },
  })
  await prisma.connectorAccount.update({ where: { id: account.id }, data: { lastSyncedAt: new Date(), errorMessage: null } })
  return { processed: 1 }
}

export function outlookClientState(account: ConnectorAccount) {
  const config = account.config && typeof account.config === "object" && !Array.isArray(account.config)
    ? account.config as Record<string, unknown>
    : {}
  return typeof config.clientState === "string" ? config.clientState : null
}
