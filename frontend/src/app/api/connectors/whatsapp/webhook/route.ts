import { NextRequest, NextResponse } from "next/server"
import { verifyHmacSha256 } from "@/lib/connectors/crypto"
import { processWhatsAppPayload } from "@/lib/connectors/whatsapp"

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode")
  const token = request.nextUrl.searchParams.get("hub.verify_token")
  const challenge = request.nextUrl.searchParams.get("hub.challenge")
  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } })
  }
  return NextResponse.json({ error: "Verificação do webhook recusada" }, { status: 403 })
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const appSecret = process.env.WHATSAPP_APP_SECRET
  if (!appSecret || !verifyHmacSha256(rawBody, request.headers.get("x-hub-signature-256"), appSecret)) {
    return NextResponse.json({ error: "Assinatura Meta inválida" }, { status: 401 })
  }
  try {
    const results = await processWhatsAppPayload(JSON.parse(rawBody))
    return NextResponse.json({ received: true, processed: results.length })
  } catch (error) {
    return NextResponse.json({ error: "Falha ao processar webhook do WhatsApp", details: error instanceof Error ? error.message : "Erro desconhecido" }, { status: 500 })
  }
}
