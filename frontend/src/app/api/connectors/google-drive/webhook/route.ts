import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { syncGoogleDrive } from "@/lib/connectors/google"

export async function POST(request: NextRequest) {
  const channelId = request.headers.get("x-goog-channel-id")
  const channelToken = request.headers.get("x-goog-channel-token")
  if (!channelId || !channelToken) return NextResponse.json({ error: "Cabeçalhos Google Drive ausentes" }, { status: 401 })
  const accounts = await prisma.connectorAccount.findMany({ where: { provider: "google_drive", status: { in: ["connected", "degraded"] } } })
  const account = accounts.find((candidate) => {
    const config = candidate.config && typeof candidate.config === "object" && !Array.isArray(candidate.config) ? candidate.config as Record<string, unknown> : {}
    return config.channelId === channelId && config.channelToken === channelToken
  })
  if (!account) return NextResponse.json({ error: "Canal Google Drive não reconhecido" }, { status: 401 })
  try {
    const result = await syncGoogleDrive(account)
    return NextResponse.json({ received: true, ...result })
  } catch (error) {
    return NextResponse.json({ error: "Falha ao sincronizar Google Drive", details: error instanceof Error ? error.message : "Erro desconhecido" }, { status: 500 })
  }
}
