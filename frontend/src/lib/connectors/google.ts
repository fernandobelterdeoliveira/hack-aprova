import { randomUUID } from "node:crypto"
import type { ConnectorAccount, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { decryptCredentials, encryptCredentials, signedState } from "@/lib/connectors/crypto"
import { processConnectorDelivery } from "@/lib/connectors/delivery"
import type { OAuthCredentials } from "@/lib/connectors/types"

const GOOGLE_AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth"
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token"
const GOOGLE_SCOPES = [
  "openid", "email", "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/drive.readonly",
]

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} não configurada`)
  return value
}

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CONNECTOR_CLIENT_ID && process.env.GOOGLE_CONNECTOR_CLIENT_SECRET && process.env.CONNECTOR_ENCRYPTION_KEY)
}

export function googleRedirectUri() {
  return process.env.GOOGLE_CONNECTOR_REDIRECT_URI || `${required("APP_BASE_URL")}/api/connectors/google/callback`
}

export function googleAuthorizationUrl() {
  const params = new URLSearchParams({
    client_id: required("GOOGLE_CONNECTOR_CLIENT_ID"),
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: GOOGLE_SCOPES.join(" "),
    state: signedState({ provider: "google" }),
  })
  return `${GOOGLE_AUTHORIZE}?${params}`
}

export async function exchangeGoogleCode(code: string) {
  const response = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: required("GOOGLE_CONNECTOR_CLIENT_ID"),
      client_secret: required("GOOGLE_CONNECTOR_CLIENT_SECRET"),
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
    }),
  })
  if (!response.ok) throw new Error(`Google OAuth retornou ${response.status}`)
  const token = await response.json() as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string; token_type?: string }
  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` } })
  if (!profileResponse.ok) throw new Error("Não foi possível identificar a conta Google")
  const profile = await profileResponse.json() as { sub: string; email: string; name?: string }
  const credentials: OAuthCredentials = {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: new Date(Date.now() + (token.expires_in || 3600) * 1000).toISOString(),
    scope: token.scope,
    tokenType: token.token_type,
  }
  const encryptedCredentials = encryptCredentials(credentials)
  const accounts = await Promise.all(["gmail", "google_drive"].map((provider) => prisma.connectorAccount.upsert({
    where: { provider_externalAccountId: { provider, externalAccountId: profile.sub } },
    update: {
      displayName: profile.name || profile.email,
      email: profile.email,
      encryptedCredentials,
      tokenExpiresAt: new Date(credentials.expiresAt as string),
      status: "connected",
      errorMessage: null,
    },
    create: {
      provider,
      externalAccountId: profile.sub,
      displayName: profile.name || profile.email,
      email: profile.email,
      encryptedCredentials,
      tokenExpiresAt: new Date(credentials.expiresAt as string),
    },
  })))
  return accounts
}

export async function googleAccessToken(account: ConnectorAccount) {
  if (!account.encryptedCredentials) throw new Error("Conta Google sem credenciais")
  const credentials = decryptCredentials<OAuthCredentials>(account.encryptedCredentials)
  if (credentials.expiresAt && new Date(credentials.expiresAt).getTime() > Date.now() + 60_000) return credentials.accessToken
  if (!credentials.refreshToken) throw new Error("Conta Google sem refresh token; reconecte a conta")
  const response = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: credentials.refreshToken,
      client_id: required("GOOGLE_CONNECTOR_CLIENT_ID"),
      client_secret: required("GOOGLE_CONNECTOR_CLIENT_SECRET"),
      grant_type: "refresh_token",
    }),
  })
  if (!response.ok) throw new Error(`Renovação Google retornou ${response.status}`)
  const refreshed = await response.json() as { access_token: string; expires_in?: number; scope?: string; token_type?: string }
  const updated: OAuthCredentials = {
    ...credentials,
    accessToken: refreshed.access_token,
    expiresAt: new Date(Date.now() + (refreshed.expires_in || 3600) * 1000).toISOString(),
    scope: refreshed.scope || credentials.scope,
    tokenType: refreshed.token_type || credentials.tokenType,
  }
  await prisma.connectorAccount.update({
    where: { id: account.id },
    data: { encryptedCredentials: encryptCredentials(updated), tokenExpiresAt: new Date(updated.expiresAt as string) },
  })
  return updated.accessToken
}

export async function configureGmailWatch(account: ConnectorAccount) {
  const topicName = required("GOOGLE_GMAIL_PUBSUB_TOPIC")
  const token = await googleAccessToken(account)
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/watch", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ topicName, labelIds: ["INBOX"], labelFilterBehavior: "INCLUDE" }),
  })
  if (!response.ok) throw new Error(`Gmail watch retornou ${response.status}`)
  const watch = await response.json() as { historyId: string; expiration: string }
  return prisma.connectorAccount.update({
    where: { id: account.id },
    data: { cursor: watch.historyId, subscriptionExpiresAt: new Date(Number(watch.expiration)), lastSyncedAt: new Date(), errorMessage: null },
  })
}

export async function configureDriveWatch(account: ConnectorAccount) {
  const publicUrl = required("APP_PUBLIC_URL")
  const token = await googleAccessToken(account)
  const previous = account.config && typeof account.config === "object" && !Array.isArray(account.config) ? account.config as Record<string, unknown> : {}
  if (typeof previous.channelId === "string" && typeof previous.resourceId === "string") {
    await fetch("https://www.googleapis.com/drive/v3/channels/stop", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: previous.channelId, resourceId: previous.resourceId }),
    }).catch(() => undefined)
  }
  const cursorResponse = await fetch("https://www.googleapis.com/drive/v3/changes/startPageToken", { headers: { Authorization: `Bearer ${token}` } })
  if (!cursorResponse.ok) throw new Error(`Drive startPageToken retornou ${cursorResponse.status}`)
  const cursor = (await cursorResponse.json() as { startPageToken: string }).startPageToken
  const channelId = randomUUID()
  const channelToken = randomUUID()
  const expiration = Date.now() + 6 * 24 * 60 * 60 * 1000
  const response = await fetch(`https://www.googleapis.com/drive/v3/changes/watch?pageToken=${encodeURIComponent(cursor)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ id: channelId, type: "web_hook", address: `${publicUrl}/api/connectors/google-drive/webhook`, token: channelToken, expiration }),
  })
  if (!response.ok) throw new Error(`Drive watch retornou ${response.status}`)
  const channel = await response.json() as { resourceId?: string; expiration?: string }
  return prisma.connectorAccount.update({
    where: { id: account.id },
    data: {
      cursor,
      config: { channelId, channelToken, resourceId: channel.resourceId || null },
      subscriptionExpiresAt: new Date(Number(channel.expiration || expiration)),
      lastSyncedAt: new Date(),
      errorMessage: null,
    },
  })
}

type GmailPart = { mimeType?: string; filename?: string; body?: { data?: string; attachmentId?: string; size?: number }; parts?: GmailPart[] }
function decodeBase64Url(value?: string) {
  return value ? Buffer.from(value, "base64url").toString("utf8") : ""
}
function gmailText(part?: GmailPart): string {
  if (!part) return ""
  if (part.mimeType === "text/plain" && part.body?.data) return decodeBase64Url(part.body.data)
  return (part.parts || []).map(gmailText).filter(Boolean).join("\n") || decodeBase64Url(part.body?.data)
}
function attachmentParts(part?: GmailPart): GmailPart[] {
  if (!part) return []
  return [...(part.filename ? [part] : []), ...(part.parts || []).flatMap(attachmentParts)]
}

async function gmailAttachments(token: string, messageId: string, payload?: GmailPart) {
  const attachments = []
  for (const part of attachmentParts(payload)) {
    let data = part.body?.data
    if (!data && part.body?.attachmentId) {
      const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(part.body.attachmentId)}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!response.ok) throw new Error(`Gmail attachment retornou ${response.status}`)
      data = (await response.json() as { data?: string }).data
    }
    if (data) attachments.push({ bytes: Buffer.from(data, "base64url"), name: part.filename || "anexo", mimeType: part.mimeType || "application/octet-stream", sourceExternalId: part.body?.attachmentId })
  }
  return attachments
}

export async function syncGmail(account: ConnectorAccount, announcedHistoryId?: string) {
  const token = await googleAccessToken(account)
  if (!account.cursor) return configureGmailWatch(account).then(() => ({ processed: 0 }))
  const historyUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/history")
  historyUrl.searchParams.set("startHistoryId", account.cursor)
  historyUrl.searchParams.set("historyTypes", "messageAdded")
  historyUrl.searchParams.set("labelId", "INBOX")
  const response = await fetch(historyUrl, { headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) throw new Error(`Gmail history retornou ${response.status}`)
  const history = await response.json() as { historyId?: string; history?: Array<{ messagesAdded?: Array<{ message: { id: string } }> }> }
  const ids = [...new Set((history.history || []).flatMap((entry) => entry.messagesAdded || []).map((entry) => entry.message.id))]
  let processed = 0
  for (const id of ids) {
    const messageResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`, { headers: { Authorization: `Bearer ${token}` } })
    if (!messageResponse.ok) continue
    const message = await messageResponse.json() as { id: string; threadId?: string; internalDate?: string; snippet?: string; payload?: GmailPart & { headers?: Array<{ name: string; value: string }> } }
    const headers = Object.fromEntries((message.payload?.headers || []).map((header) => [header.name.toLowerCase(), header.value]))
    const from = headers.from || ""
    const email = from.match(/<([^>]+)>/)?.[1] || (from.includes("@") ? from.trim() : undefined)
    const name = from.replace(/<[^>]+>/, "").replaceAll('"', "").trim() || undefined
    const attachments = await gmailAttachments(token, message.id, message.payload)
    const attachment = attachments[0]
    await processConnectorDelivery({
      accountId: account.id,
      signatureVerified: true,
      payload: message as unknown as Prisma.InputJsonValue,
      normalized: {
        provider: "gmail",
        externalId: message.id,
        accountExternalId: account.externalAccountId,
        threadExternalId: message.threadId,
        sourceType: attachment ? "document" : "email",
        sourceExternalId: message.id,
        senderName: name,
        senderEmail: email,
        receivedAt: message.internalDate ? new Date(Number(message.internalDate)) : new Date(),
        rawContent: [`Assunto: ${headers.subject || "(sem assunto)"}`, gmailText(message.payload) || message.snippet || ""].join("\n\n"),
        fileName: attachment?.name,
        fileType: attachment?.mimeType,
        attachments,
      },
    })
    processed += 1
  }
  await prisma.connectorAccount.update({
    where: { id: account.id },
    data: { cursor: history.historyId || announcedHistoryId || account.cursor, lastSyncedAt: new Date(), errorMessage: null },
  })
  return { processed }
}

export async function syncGoogleDrive(account: ConnectorAccount) {
  if (!account.cursor) return configureDriveWatch(account).then(() => ({ processed: 0 }))
  const token = await googleAccessToken(account)
  let pageToken: string | null = account.cursor
  let finalCursor = account.cursor
  let processed = 0
  do {
    const url = new URL("https://www.googleapis.com/drive/v3/changes")
    url.searchParams.set("pageToken", pageToken)
    url.searchParams.set("spaces", "drive")
    url.searchParams.set("includeRemoved", "true")
    url.searchParams.set("fields", "nextPageToken,newStartPageToken,changes(fileId,removed,time,file(id,name,mimeType,modifiedTime,createdTime,description,webViewLink,owners(displayName,emailAddress),trashed,capabilities(canDownload)))")
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!response.ok) throw new Error(`Drive changes retornou ${response.status}`)
    const result = await response.json() as {
      nextPageToken?: string
      newStartPageToken?: string
      changes?: Array<{ fileId: string; removed?: boolean; time?: string; file?: { id: string; name: string; mimeType: string; modifiedTime?: string; createdTime?: string; description?: string; webViewLink?: string; trashed?: boolean; capabilities?: { canDownload?: boolean }; owners?: Array<{ displayName?: string; emailAddress?: string }> } }>
    }
    for (const change of result.changes || []) {
      if (change.removed || !change.file || change.file.trashed) continue
      const file = change.file
      const owner = file.owners?.[0]
      const attachments = []
      if (file.capabilities?.canDownload !== false) {
        const googleNative = file.mimeType.startsWith("application/vnd.google-apps.")
        const downloadUrl = googleNative
          ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/export?mimeType=application%2Fpdf`
          : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`
        const download = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${token}` } })
        if (download.ok) {
          const mimeType = googleNative ? "application/pdf" : (download.headers.get("content-type") || file.mimeType)
          attachments.push({ bytes: Buffer.from(await download.arrayBuffer()), name: googleNative ? `${file.name}.pdf` : file.name, mimeType, sourceExternalId: file.id, metadata: { webViewLink: file.webViewLink || null } })
        }
      }
      await processConnectorDelivery({
        accountId: account.id,
        signatureVerified: true,
        payload: change as unknown as Prisma.InputJsonValue,
        normalized: {
          provider: "google_drive",
          externalId: `${file.id}:${file.modifiedTime || change.time || "unknown"}`,
          accountExternalId: account.externalAccountId,
          sourceType: "document",
          sourceExternalId: `${file.id}:${file.modifiedTime || change.time || "unknown"}`,
          senderName: owner?.displayName,
          senderEmail: owner?.emailAddress,
          receivedAt: file.modifiedTime || change.time || new Date(),
          rawContent: [`Arquivo recebido do Google Drive: ${file.name}`, file.description || "", `Tipo: ${file.mimeType}`].filter(Boolean).join("\n"),
          fileName: file.name,
          fileType: file.mimeType,
          fileUrl: file.webViewLink,
          attachments,
        },
      })
      processed += 1
    }
    finalCursor = result.newStartPageToken || finalCursor
    pageToken = result.nextPageToken || null
  } while (pageToken)
  await prisma.connectorAccount.update({ where: { id: account.id }, data: { cursor: finalCursor, lastSyncedAt: new Date(), errorMessage: null } })
  return { processed }
}
