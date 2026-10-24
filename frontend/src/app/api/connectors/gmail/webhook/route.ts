import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { syncGmail } from "@/lib/connectors/google"
import { verifyGooglePubSubOidc } from "@/lib/connectors/google-pubsub"

export async function POST(request: NextRequest) {
  try {
    if (!await verifyGooglePubSubOidc(request)) return NextResponse.json({ error: "Webhook Pub/Sub não autorizado" }, { status: 401 })
    const envelope = await request.json() as { message?: { data?: string; messageId?: string } }
    if (!envelope.message?.data) return NextResponse.json({ received: true, processed: 0 })
    const notification = JSON.parse(Buffer.from(envelope.message.data, "base64url").toString("utf8")) as { emailAddress?: string; historyId?: string }
    const account = await prisma.connectorAccount.findFirst({ where: { provider: "gmail", email: notification.emailAddress, status: { in: ["connected", "degraded"] } } })
    if (!account) return NextResponse.json({ error: "Conta Gmail não encontrada" }, { status: 404 })
    const result = await syncGmail(account, notification.historyId)
    return NextResponse.json({ received: true, ...result })
  } catch (error) {
    return NextResponse.json({ error: "Falha ao processar notificação Gmail", details: error instanceof Error ? error.message : "Erro desconhecido" }, { status: 500 })
  }
}
