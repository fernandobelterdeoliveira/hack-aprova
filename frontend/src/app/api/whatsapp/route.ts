import { sameOrigin } from "@/lib/request-origin"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { currentActor } from "@/lib/auth/current-actor"
import { sendWithProvider } from "@/lib/connectors/outbound"
export const dynamic = "force-dynamic"
async function snapshot(workspaceId: string) {
 const [accounts, messages] = await Promise.all([
  prisma.connectorAccount.findMany({ where: { workspaceId, provider: "whatsapp" }, select: { id: true, displayName: true, externalAccountId: true, status: true, lastSyncedAt: true } }),
  prisma.whatsAppChatMessage.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: 500 }),
 ])
 const missing = ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN"].filter(key => !process.env[key])
 return { accounts, messages: messages.reverse(), configured: missing.length === 0, missing, updatedAt: new Date().toISOString() }
}
export async function GET(req: NextRequest) {
 const actor = await currentActor()
 if (process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN) {
  const existing = await prisma.connectorAccount.findUnique({ where: { provider_externalAccountId: { provider: "whatsapp", externalAccountId: process.env.WHATSAPP_PHONE_NUMBER_ID } } })
  if (!existing) await prisma.connectorAccount.create({ data: { provider: "whatsapp", externalAccountId: process.env.WHATSAPP_PHONE_NUMBER_ID, workspaceId: actor.workspaceId, displayName: "WhatsApp Business", status: "configured" } })
 }
 if (req.nextUrl.searchParams.get("stream") !== "1") return NextResponse.json(await snapshot(actor.workspaceId), { headers: { "Cache-Control": "no-store" } })
 const encoder = new TextEncoder(); let interval: ReturnType<typeof setInterval> | undefined; let timeout: ReturnType<typeof setTimeout> | undefined; let closed = false; let busy = false
 const stream = new ReadableStream({
  start(controller) {
   const close = () => { if (closed) return; closed = true; clearInterval(interval); clearTimeout(timeout); controller.close() }
   const tick = async () => {
    if (closed || busy) return; busy = true
    try { const data = await snapshot(actor.workspaceId); if (!closed) controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)) }
    catch { if (!closed) controller.enqueue(encoder.encode('event: sync-error\ndata: {"error":"Não foi possível sincronizar as mensagens."}\n\n')) }
    finally { busy = false }
   }
   void tick(); interval = setInterval(tick, 2000); timeout = setTimeout(close, 25000); req.signal.addEventListener("abort", close, { once: true })
  },
  cancel() { closed = true; clearInterval(interval); clearTimeout(timeout) },
 })
 return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } })
}
const input = z.object({ accountId: z.string().min(1), phone: z.string().regex(/^\d{10,15}$/), content: z.string().trim().min(1).max(4096), requestKey: z.string().uuid() })
export async function POST(req: NextRequest) {
 if (!sameOrigin(req)) return NextResponse.json({error:"Origem da solicitação inválida."},{status:403})
 try {
  const actor = await currentActor(); const data = input.parse(await req.json())
  const account = await prisma.connectorAccount.findFirst({ where: { id: data.accountId, workspaceId: actor.workspaceId, provider: "whatsapp" } })
  if (!account || !process.env.WHATSAPP_ACCESS_TOKEN) return NextResponse.json({ error: "Conecte uma conta WhatsApp Business antes de enviar." }, { status: 409 })
  const existing = await prisma.whatsAppChatMessage.findUnique({ where: { requestKey: data.requestKey } })
  if (existing) return existing.workspaceId === actor.workspaceId ? NextResponse.json(existing) : NextResponse.json({ error: "Solicitação inválida." }, { status: 409 })
  const lastInbound = await prisma.whatsAppChatMessage.findFirst({ where: { workspaceId: actor.workspaceId, accountId: account.id, phone: data.phone, direction: "received" }, orderBy: { createdAt: "desc" } })
  if (!lastInbound || Date.now() - lastInbound.createdAt.getTime() > 86400000) return NextResponse.json({ error: "Aguarde uma mensagem do contato para abrir a janela de atendimento. O envio de templates fora dessa janela ainda não está disponível nesta tela." }, { status: 409 })
  const message = await prisma.whatsAppChatMessage.create({ data: { workspaceId: actor.workspaceId, accountId: account.id, phone: data.phone, direction: "sent", content: data.content, requestKey: data.requestKey, status: "sending" } })
  const outbound = await prisma.outboundMessage.create({ data: { channel: "whatsapp", connectorAccountId: account.id, recipient: data.phone, content: data.content, riskLevel: "medium", messageKind: "human_chat", status: "approved", approvedBy: actor.userProfileId, approvedAt: new Date(), idempotencyKey: `chat:${data.requestKey}` } })
  try {
   const providerId = await sendWithProvider(account, data.phone, null, data.content)
   await prisma.outboundMessage.update({ where: { id: outbound.id }, data: { status: "sent", externalId: providerId, sentAt: new Date() } })
   return NextResponse.json(await prisma.whatsAppChatMessage.update({ where: { id: message.id }, data: { providerId, status: "sent" } }))
  } catch(e) {
   const errorMessage = e instanceof Error ? e.message : "Falha no envio"
   await Promise.all([prisma.whatsAppChatMessage.update({ where: { id: message.id }, data: { status: "failed", errorMessage } }), prisma.outboundMessage.update({ where: { id: outbound.id }, data: { status: "failed", errorMessage } })])
   return NextResponse.json({ error: errorMessage }, { status: 502 })
  }
 } catch(e) { return NextResponse.json({ error: e instanceof z.ZodError ? "Informe telefone e mensagem válidos." : "Não foi possível enviar a mensagem." }, { status: 400 }) }
}
