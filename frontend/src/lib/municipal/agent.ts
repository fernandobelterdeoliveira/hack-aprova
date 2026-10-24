import { categories, propose, type Rule, type Source } from "./domain"
import { z } from "zod"
const resultSchema = z.object({ mode: z.string(), model: z.string().optional(), proposals: z.array(z.object({ category: z.enum(categories), value: z.string().min(1).max(8000), excerpt: z.string().min(1).max(8000) })).max(24) })
export async function proposeWithAgent(rules: Rule[], source: Source): Promise<Rule[]> {
 try {
  const response = await fetch(`${process.env.PYTHON_BACKEND_URL || "http://127.0.0.1:8000"}/api/municipal/propose`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: source.content }), signal: AbortSignal.timeout(25000) })
  if (response.ok) {
   const result = resultSchema.parse(await response.json())
   if (result.mode !== "local") {
    source.analysisMode = `${result.mode}:${result.model || "configured"}`
    return rules.map(rule => {
     const candidate = result.proposals.find(p => p.category === rule.category && source.content.includes(p.excerpt))
     if (!candidate) return rule
     if (rule.status === "approved" && rule.value === candidate.value) return rule
     const revision = { version: rule.version + 1, approvalCode: crypto.randomUUID().slice(0,8).toUpperCase(), status: "proposed" as const }
     return rule.status === "approved" ? { ...rule, ...revision, conflict: { value: candidate.value, excerpt: candidate.excerpt, sourceId: source.id } } : { ...rule, ...revision, value: candidate.value, excerpt: candidate.excerpt, sourceId: source.id, conflict: undefined }
    })
   }
  }
 } catch { /* Preserve operation when the optional model is unavailable. */ }
 source.analysisMode = "local:keyword-excerpts-v1"
 return propose(rules, source)
}
