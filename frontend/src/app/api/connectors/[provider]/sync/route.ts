import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { configureDriveWatch, configureGmailWatch, syncGmail, syncGoogleDrive } from "@/lib/connectors/google"
import { configureOutlookSubscription } from "@/lib/connectors/microsoft"

export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params
  const body = await request.json().catch(() => ({})) as { accountId?: string }
  const account = await prisma.connectorAccount.findFirst({ where: { id: body.accountId, provider } })
  if (!account) return NextResponse.json({ error: "Conta do conector não encontrada" }, { status: 404 })
  try {
    if (provider === "gmail") return NextResponse.json(account.cursor ? await syncGmail(account) : await configureGmailWatch(account))
    if (provider === "google_drive") return NextResponse.json(account.cursor ? await syncGoogleDrive(account) : await configureDriveWatch(account))
    if (provider === "outlook") return NextResponse.json(await configureOutlookSubscription(account))
    return NextResponse.json({ error: "Este conector não possui sincronização manual" }, { status: 400 })
  } catch (error) {
    await prisma.connectorAccount.update({ where: { id: account.id }, data: { status: "degraded", errorMessage: error instanceof Error ? error.message : "Falha de sincronização" } })
    return NextResponse.json({ error: "Falha ao sincronizar conector", details: error instanceof Error ? error.message : "Erro desconhecido" }, { status: 502 })
  }
}
