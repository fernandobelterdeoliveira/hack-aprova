import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { configureDriveWatch, configureGmailWatch } from "@/lib/connectors/google"
import { configureOutlookSubscription } from "@/lib/connectors/microsoft"

export async function POST(request: NextRequest) {
  const secret = process.env.CONNECTOR_CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Cron não autorizado" }, { status: 401 })
  const renewBefore = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const accounts = await prisma.connectorAccount.findMany({
    where: {
      provider: { in: ["gmail", "google_drive", "outlook"] },
      status: { in: ["connected", "degraded"] },
      OR: [{ subscriptionExpiresAt: null }, { subscriptionExpiresAt: { lte: renewBefore } }],
    },
  })
  const results = []
  for (const account of accounts) {
    try {
      if (account.provider === "gmail") await configureGmailWatch(account)
      else if (account.provider === "google_drive") await configureDriveWatch(account)
      else await configureOutlookSubscription(account)
      results.push({ accountId: account.id, provider: account.provider, status: "renewed" })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha desconhecida"
      await prisma.connectorAccount.update({ where: { id: account.id }, data: { status: "degraded", errorMessage: message } })
      results.push({ accountId: account.id, provider: account.provider, status: "failed", error: message })
    }
  }
  return NextResponse.json({ checked: accounts.length, results })
}
