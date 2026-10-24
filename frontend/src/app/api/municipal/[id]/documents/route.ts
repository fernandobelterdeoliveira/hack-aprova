import { ensureTicket, enqueueTicket } from "@/lib/municipal/tickets"
import { sameOrigin } from "@/lib/request-origin"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { currentActor } from "@/lib/auth/current-actor"
import { persistAttachment, readStoredObject } from "@/lib/connectors/storage"
import { type Source, type Rule, type Audit } from "@/lib/municipal/domain"
import { proposeWithAgent } from "@/lib/municipal/agent"
import { json } from "@/lib/municipal/service"
type Context = { params: Promise<{ id: string }> }
export async function POST(req: NextRequest, ctx: Context) {
 if (!sameOrigin(req)) return NextResponse.json({error:"Origem da solicitação inválida."},{status:403})
 try {
  const actor = await currentActor(); const {id} = await ctx.params
  const process = await prisma.municipalProcess.findFirst({ where: { id, workspaceId: actor.workspaceId } }); if (!process) return NextResponse.json({ error: "Processo não encontrado." }, { status: 404 })
  const form = await req.formData(); const file = form.get("file"); const version = Number(form.get("version"))
  if (!(file instanceof File) || file.size > 10*1024*1024 || !file.size) throw new Error("Envie um arquivo de até 10 MB.")
  if (version !== process.version) return NextResponse.json({ error: "Recarregue o processo antes de enviar." }, { status: 409 })
  const data = new FormData(); data.append("file", file)
  const response = await fetch(`${globalThis.process.env.PYTHON_BACKEND_URL || "http://127.0.0.1:8000"}/api/municipal/extract`, { method: "POST", body: data, signal: AbortSignal.timeout(60000) })
  const body = await response.json(); if (!response.ok) throw new Error(body.detail || "Não foi possível ler o documento.")
  const stored = await persistAttachment({ bytes: Buffer.from(await file.arrayBuffer()), name: file.name, mimeType: file.type || "application/octet-stream", sourceProvider: "municipal" })
  const source: Source = { id: crypto.randomUUID(), name: file.name, content: body.content, type: "document", createdAt: new Date().toISOString(), storageId: stored.id }
  const rules = await proposeWithAgent(process.rules as unknown as Rule[], source)
  const result = await prisma.municipalProcess.updateMany({ where: { id, workspaceId: actor.workspaceId, version }, data: { sources: json([...(process.sources as unknown as Source[]),source]), rules: json(rules), status: "collecting", version: { increment: 1 }, history: json([...(process.history as unknown as Audit[]), { at: new Date().toISOString(), actor: actor.userProfileId, action: "document", details: `Documento recebido: ${file.name} · ${body.extractor}` }]) } })
  if (!result.count) return NextResponse.json({ error: "O processo mudou durante o envio. Recarregue antes de reenviar." }, { status: 409 })
  const ticket=await ensureTicket(actor.workspaceId,id);await enqueueTicket(ticket.id,"generate",actor.userProfileId,`process:${version+1}`)
  return NextResponse.json({ received: true })
 } catch(e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao ler documento." }, { status: 400 }) }
}
export async function GET(req: NextRequest, ctx: Context) {
 const actor = await currentActor(); const {id} = await ctx.params
 const process = await prisma.municipalProcess.findFirst({ where: { id, workspaceId: actor.workspaceId } })
 const source = (process?.sources as unknown as Source[] | undefined)?.find(s => s.id === req.nextUrl.searchParams.get("source"))
 if (!source?.storageId) return new Response("Arquivo não encontrado", { status: 404 })
 const stored = await prisma.storedObject.findUnique({ where: {id:source.storageId} }); if (!stored) return new Response("Arquivo não encontrado", { status:404 })
 const bytes = await readStoredObject(stored.storageProvider,stored.storageKey)
 return new Response(new Uint8Array(bytes), {headers:{"Content-Type":stored.mimeType,"Content-Disposition":`attachment; filename*=UTF-8''${encodeURIComponent(stored.originalName)}`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}})
}
