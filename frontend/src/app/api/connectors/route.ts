import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { googleConfigured } from "@/lib/connectors/google"
import { microsoftConfigured } from "@/lib/connectors/microsoft"
import { currentActor } from "@/lib/auth/current-actor"

export async function GET() {
  const actor = await currentActor()
  const accounts = await prisma.connectorAccount.findMany({
    where: { workspaceId: actor.workspaceId },
    select: {
      id: true,
      provider: true,
      displayName: true,
      email: true,
      status: true,
      lastSyncedAt: true,
      subscriptionExpiresAt: true,
      errorMessage: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  })
  return NextResponse.json({
    providers: [
      {
        id: "whatsapp",
        name: "WhatsApp Business",
        configured: Boolean(process.env.WHATSAPP_VERIFY_TOKEN && process.env.WHATSAPP_APP_SECRET && process.env.WHATSAPP_ACCESS_TOKEN),
        connectUrl: null,
        webhookUrl: `${process.env.APP_PUBLIC_URL || process.env.APP_BASE_URL || "http://localhost:3001"}/api/connectors/whatsapp/webhook`,
      },
      {
        id: "gmail",
        name: "Gmail",
        configured: googleConfigured(),
        automationReady: Boolean(process.env.GOOGLE_GMAIL_PUBSUB_TOPIC && process.env.GOOGLE_PUBSUB_OIDC_AUDIENCE && process.env.GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL),
        connectUrl: "/api/connectors/google/start",
      },
      {
        id: "google_drive",
        name: "Google Drive",
        configured: googleConfigured(),
        automationReady: Boolean(process.env.APP_PUBLIC_URL),
        connectUrl: "/api/connectors/google/start",
      },
      {
        id: "outlook",
        name: "Outlook",
        configured: microsoftConfigured(),
        automationReady: Boolean(process.env.APP_PUBLIC_URL),
        connectUrl: "/api/connectors/microsoft/start",
      },
    ],
    accounts,
    autoApplyEnabled: false,
    automaticReceiptEnabled: process.env.CONNECTOR_AUTO_ACK_ENABLED === "true",
    storageProvider: process.env.OBJECT_STORAGE_PROVIDER === "s3" ? "s3" : "local",
  })
}
