import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { completeness, gaps, type Rule, type Source, type Scenario, type Audit } from "./domain"
export const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
export function projection<T extends { rules: unknown; sources: unknown; scenarios: unknown; history: unknown }>(process: T) {
 const rules = process.rules as Rule[]
 return { ...process, rules, sources: process.sources as Source[], scenarios: process.scenarios as Scenario[], history: process.history as Audit[], completeness: completeness(rules), gaps: gaps(rules), differences: rules.filter(r => r.value && r.value.trim() !== r.baseline.trim()) }
}
export async function confirmFromWhatsApp(workspaceId: string, phone: string, content: string, sourceId: string) {
 const match = content.trim().match(/^(CONFIRMAR|CORRIGIR)\s+([A-F0-9]{8})(?:\s*:\s*([\s\S]+))?$/i)
 if (!match) return
 const processes = await prisma.municipalProcess.findMany({ where: { workspaceId, contactPhone: phone } })
 for (const process of processes) {
  const rules = process.rules as unknown as Rule[]
  const rule = rules.find(r => r.approvalCode === match[2].toUpperCase() && r.status === "proposed")
  if (!rule || !rule.value || !rule.sourceId || !rule.excerpt || rule.conflict) continue
  if (match[1].toUpperCase() === "CORRIGIR" && !match[3]?.trim()) continue
  const next = rules.map(r => r.id !== rule.id ? r : match[1].toUpperCase() === "CONFIRMAR" ? { ...r, status: "approved", approvedBy: `WhatsApp:${phone}`, approvedAt: new Date().toISOString() } : { ...r, value: match[3]?.trim() || r.value, excerpt: match[3]?.trim() || r.excerpt, sourceId, status: "proposed", version: r.version + 1, approvalCode: crypto.randomUUID().slice(0,8).toUpperCase() })
  const updated = await prisma.municipalProcess.updateMany({ where: { id: process.id, workspaceId, version: process.version }, data: { sources: json(match[1].toUpperCase() === "CORRIGIR" ? [...(process.sources as unknown as Source[]), { id: sourceId, name: `Correção por WhatsApp · ${phone}`, content: match[3]!.trim(), type: "whatsapp", createdAt: new Date().toISOString() }] : process.sources), rules: json(next), status: "collecting", version: { increment: 1 }, history: json([...(process.history as unknown as Audit[]), { at: new Date().toISOString(), actor: `WhatsApp:${phone}`, action: match[1].toLowerCase(), details: rule.title }]) } })
  if(updated.count){const ticket=await prisma.municipalTicket.findUnique({where:{processId:process.id}});if(ticket){const {enqueueTicket,ticketEvent}=await import("./tickets");await ticketEvent(ticket.id,`Regra atualizada por resposta autenticada do WhatsApp: ${rule.title}.`);await enqueueTicket(ticket.id,"generate",`WhatsApp:${phone}`,`process:${process.version+1}`)}}
 }
}
