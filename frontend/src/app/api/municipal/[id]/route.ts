import { ensureTicket, enqueueTicket } from "@/lib/municipal/tickets"
import { sameOrigin } from "@/lib/request-origin"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { currentActor } from "@/lib/auth/current-actor"
import { canPublish, generateScenarios, type Rule, type Source, type Scenario, type Audit } from "@/lib/municipal/domain"
import { readStoredObject } from "@/lib/connectors/storage"
import { proposeWithAgent } from "@/lib/municipal/agent"
import { json, projection } from "@/lib/municipal/service"
type Context = { params: Promise<{ id: string }> }
export async function GET(_req: NextRequest, ctx: Context) {
 const actor = await currentActor(); const { id } = await ctx.params
 const process = await prisma.municipalProcess.findFirst({ where: { id, workspaceId: actor.workspaceId } })
 return process ? NextResponse.json(projection(process)) : NextResponse.json({ error: "Processo não encontrado." }, { status: 404 })
}
const command = z.object({ action: z.enum(["source", "edit-rule", "approve", "reject", "generate-tests", "test", "publish", "round", "minutes", "configure"]), version: z.number().int().positive(), ruleId: z.string().optional(), value: z.string().trim().max(8000).optional(), sourceId: z.string().optional(), excerpt: z.string().max(8000).optional(), name: z.string().max(200).optional(), content: z.string().max(100000).optional(), inboxId: z.string().optional(), messageId: z.string().optional(), scenarioId: z.string().optional(), result: z.enum(["passed", "failed"]).optional(), actual: z.string().max(4000).optional(), minutes: z.number().int().min(1).max(480).optional(), phone: z.string().regex(/^\d{10,15}$/).optional() })
export async function PATCH(req: NextRequest, ctx: Context) {
 if (!sameOrigin(req)) return NextResponse.json({error:"Origem da solicitação inválida."},{status:403})
 try {
  const actor = await currentActor(); const { id } = await ctx.params; const c = command.parse(await req.json())
  const process = await prisma.municipalProcess.findFirst({ where: { id, workspaceId: actor.workspaceId } })
  if (!process) return NextResponse.json({ error: "Processo não encontrado." }, { status: 404 })
  if (process.version !== c.version) return NextResponse.json({ error: "O processo foi atualizado. Recarregue antes de salvar." }, { status: 409 })
  let rules = process.rules as unknown as Rule[], sources = process.sources as unknown as Source[], scenarios = process.scenarios as unknown as Scenario[]
  const history = process.history as unknown as Audit[]
  let details: string = c.action; let status = process.status
  if (c.action === "source") {
   let content = c.content?.trim() || "", name = c.name || "Informação recebida", type = "manual", storageId: string | undefined
   if (c.inboxId) {
    const item = await prisma.inboxItem.findFirst({ where: { id: c.inboxId, workspaceId: actor.workspaceId } }); if (!item) throw new Error("Entrada não encontrada.")
    content = item.rawContent; name = item.fileName || item.senderName || name; type = item.sourceType
    if (sources.some(s => s.inboxId === item.id)) throw new Error("Esta entrada já foi associada ao processo.")
   }
   if (c.messageId) {
    const item = await prisma.whatsAppChatMessage.findFirst({ where: { id: c.messageId, workspaceId: actor.workspaceId, direction: "received" } }); if (!item) throw new Error("Mensagem não encontrada.")
    content = item.content; name = `WhatsApp · ${item.contactName || item.phone}`; type = "whatsapp"
    if (sources.some(s => s.id === item.id)) throw new Error("Esta mensagem já foi associada ao processo.")
    const attachments = item.attachments as unknown as Array<{id:string;name:string}>
    if (attachments[0]?.id) {
     const object = await prisma.storedObject.findFirst({ where: { id: attachments[0].id, connectorAccount: { workspaceId: actor.workspaceId } } })
     if (object) {
      const bytes = await readStoredObject(object.storageProvider, object.storageKey)
      const form = new FormData(); form.append("file", new Blob([new Uint8Array(bytes)], { type: object.mimeType }), object.originalName)
      const extraction = await fetch(`${globalThis.process.env.PYTHON_BACKEND_URL || "http://127.0.0.1:8000"}/api/municipal/extract`, { method: "POST", body: form, signal: AbortSignal.timeout(60000) })
      const extracted = await extraction.json(); if (!extraction.ok) throw new Error(extracted.detail || "Não foi possível extrair o anexo. Adicione uma transcrição conferida manualmente.")
      content += "\n\n" + extracted.content; storageId = object.id; name += ` · ${object.originalName}`
     }
    }
   }
   if (!content) throw new Error("Informe o conteúdo da fonte.")
   const source: Source = { id: c.messageId || crypto.randomUUID(), name, content, type, createdAt: new Date().toISOString(), inboxId: c.inboxId, storageId }
   sources = [...sources, source]; rules = await proposeWithAgent(rules, source); details = `Fonte adicionada: ${name}`; status = "collecting"
  }
  if (["edit-rule", "approve", "reject"].includes(c.action)) {
   const rule = rules.find(r => r.id === c.ruleId); if (!rule) throw new Error("Regra não encontrada.")
   if (c.action === "edit-rule") {
    if (!c.value || !c.sourceId || !c.excerpt) throw new Error("Preencha regra, fonte e trecho de evidência.")
    const source = sources.find(s => s.id === c.sourceId)
    if (!source || !source.content.includes(c.excerpt)) throw new Error("O trecho precisa existir exatamente na fonte selecionada.")
    rules = rules.map(r => r.id === rule.id ? { ...r, value: c.value!, sourceId: c.sourceId!, excerpt: c.excerpt!, status: "proposed", approvedBy: undefined, approvedAt: undefined, conflict: undefined, approvalCode: crypto.randomUUID().slice(0,8).toUpperCase(), version: r.version + 1 } : r)
   } else if (c.action === "approve") {
    const source = sources.find(s => s.id === rule.sourceId)
    if (rule.conflict) throw new Error("Nova evidência precisa ser conciliada na edição da regra antes da aprovação.")
    if (!rule.value || !source || !rule.excerpt || !rule.excerpt.split("\n").every(line => source.content.includes(line))) throw new Error("A regra precisa de valor e evidência verificável para ser aprovada.")
    rules = rules.map(r => r.id === rule.id ? { ...r, status: "approved", approvedBy: actor.userProfileId, approvedAt: new Date().toISOString() } : r)
   } else rules = rules.map(r => r.id === rule.id ? { ...r, status: "rejected" } : r)
   details = `${c.action}: ${rule.title}`; status = "collecting"
  }
  if (c.action === "generate-tests") { scenarios = generateScenarios(rules); if (!scenarios.length) throw new Error("Aprove pelo menos uma regra antes de gerar testes."); status = "validating"; details = "Cenários gerados para revisão e execução humana no formulário." }
  if (c.action === "test") {
   const test = scenarios.find(s => s.id === c.scenarioId)
   if (!test || !c.result || !c.actual?.trim()) throw new Error("Informe o resultado observado no formulário.")
   if (!rules.some(r => r.id === test.ruleId && r.version === test.ruleVersion && r.status === "approved")) throw new Error("Teste desatualizado. Gere os cenários novamente.")
   scenarios = scenarios.map(s => s.id === test.id ? { ...s, result: c.result!, actual: c.actual, checkedBy: actor.userProfileId, checkedAt: new Date().toISOString() } : s); details = `Teste ${test.title}: ${c.result}`
  }
  if (c.action === "publish") { if (!canPublish(rules, scenarios)) throw new Error("Confirme as seis dimensões da regra e execute todos os cenários da versão atual antes de liberar."); status = "ready"; details = "Dossiê liberado para configurar/publicar na Aprova. Esta ação não publica em sistema externo." }
  const result = await prisma.municipalProcess.updateMany({ where: { id, workspaceId: actor.workspaceId, version: c.version }, data: { rules: json(rules), sources: json(sources), scenarios: json(scenarios), status, version: { increment: 1 }, ...(c.action === "configure" && c.phone ? { contactPhone: c.phone } : {}), ...(c.action === "round" ? { clarificationRounds: { increment: 1 } } : {}), ...(c.action === "minutes" && c.minutes ? { minutesSpent: { increment: c.minutes } } : {}), history: json([...history, { at: new Date().toISOString(), actor: actor.userProfileId, action: c.action, details, ...( ["edit-rule", "approve", "reject", "source"].includes(c.action) ? { previousRules: process.rules, nextRules: rules } : {} ) }]) } })
  if (!result.count) return NextResponse.json({ error: "Atualização concorrente. Recarregue o processo." }, { status: 409 })
  const updated = await prisma.municipalProcess.findUniqueOrThrow({where:{id}})
  if(["source","approve","edit-rule","reject"].includes(c.action)){const ticket=await ensureTicket(actor.workspaceId,id);await enqueueTicket(ticket.id,"generate",actor.userProfileId,`process:${updated.version}`)}
  return NextResponse.json(projection(updated))
 } catch(e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Não foi possível salvar." }, { status: 400 }) }
}
