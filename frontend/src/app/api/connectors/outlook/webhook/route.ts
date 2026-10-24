import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { outlookClientState, syncOutlookMessage } from "@/lib/connectors/microsoft"

export async function POST(request: NextRequest) {
  const validationToken = request.nextUrl.searchParams.get("validationToken")
  if (validationToken) return new NextResponse(validationToken, { status: 200, headers: { "Content-Type": "text/plain" } })
  try {
    const payload = await request.json() as { value?: Array<{ subscriptionId?: string; clientState?: string; resource?: string; resourceData?: { id?: string } }> }
    let processed = 0
    for (const notification of payload.value || []) {
      const accounts = await prisma.connectorAccount.findMany({ where: { provider: "outlook", status: { in: ["connected", "degraded"] } } })
      const account = accounts.find((candidate) => {
        const config = candidate.config && typeof candidate.config === "object" && !Array.isArray(candidate.config) ? candidate.config as Record<string, unknown> : {}
        return config.subscriptionId === notification.subscriptionId && outlookClientState(candidate) === notification.clientState
      })
      if (!account) continue
      const messageId = notification.resourceData?.id || notification.resource?.split("/").at(-1)
      if (!messageId) continue
      await syncOutlookMessage(account, messageId)
      processed += 1
    }
    return NextResponse.json({ received: true, processed })
  } catch (error) {
    return NextResponse.json({ error: "Falha ao processar notificação Outlook", details: error instanceof Error ? error.message : "Erro desconhecido" }, { status: 500 })
  }
}
