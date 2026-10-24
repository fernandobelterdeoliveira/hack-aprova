const randomUUID = () => crypto.randomUUID()
export const categories = ["eligibility", "documents", "conditions", "exceptions", "deadlines", "responsibility"] as const
export type Category = typeof categories[number]
export const labels: Record<Category, string> = { eligibility: "Quem pode solicitar", documents: "Documentos obrigatórios", conditions: "Condições e validações", exceptions: "Exceções e dispensas", deadlines: "Prazos", responsibility: "Responsáveis e aprovação" }
export type Rule = { id: string; category: Category; title: string; value: string; baseline: string; status: "proposed" | "approved" | "rejected"; sourceId: string; excerpt: string; approvedBy?: string; approvedAt?: string; approvalCode: string; version: number; conflict?: { value: string; sourceId: string; excerpt: string } }
export type Source = { id: string; name: string; content: string; type: string; createdAt: string; inboxId?: string; storageId?: string; analysisMode?: string }
export type Scenario = { id: string; ruleId: string; ruleVersion: number; title: string; input: string; expected: string; result: "pending" | "passed" | "failed"; actual?: string; checkedBy?: string; checkedAt?: string }
export type Audit = { at: string; actor: string; action: string; details: string }
const baseline: Record<Category, string> = { eligibility: "Pessoa física e jurídica podem solicitar.", documents: "Documento de identificação e comprovante de endereço.", conditions: "Conferência documental antes do encaminhamento.", exceptions: "Nenhuma dispensa cadastrada no modelo.", deadlines: "Prazo não definido no modelo; confirmar localmente.", responsibility: "Triagem pela secretaria e aprovação pelo responsável designado." }
export const templates = [
 { key: "alvara", name: "Alvará de funcionamento", department: "Desenvolvimento Econômico", baseline },
 { key: "obras", name: "Licença de obras", department: "Obras e Urbanismo", baseline: { ...baseline, documents: "Identificação, matrícula do imóvel, projeto e responsabilidade técnica.", conditions: "Análise técnica antes da emissão da licença." } },
 { key: "protocolo", name: "Processo administrativo", department: "Administração", baseline },
]
export function initialRules(templateKey: string): Rule[] {
 const template = templates.find(t => t.key === templateKey) || templates[2]
 return categories.map(category => ({ id: randomUUID(), category, title: labels[category], baseline: template.baseline[category], value: "", status: "proposed", sourceId: "", excerpt: "", approvalCode: randomUUID().slice(0, 8).toUpperCase(), version: 1 }))
}
export function gaps(rules: Rule[]) { return categories.filter(c => !rules.some(r => r.category === c && r.status === "approved" && r.value.trim())).map(c => ({ category: c, title: labels[c], question: `Para este processo, qual é a regra de ${labels[c].toLowerCase()}? Confirme a proposta ou descreva a particularidade do município.` })) }
export function completeness(rules: Rule[]) { return Math.round((categories.length - gaps(rules).length) / categories.length * 100) }
export function propose(rules: Rule[], source: Source): Rule[] {
 const hints: Record<Category, RegExp> = { eligibility: /solicita|pessoa física|pessoa jurídica|requerente/i, documents: /document|comprovante|cpf|cnpj|certidão|matrícula/i, conditions: /obrigat|deve|somente|condiç|exig|vistoria/i, exceptions: /dispens|excet|isen|baixo risco|exceç/i, deadlines: /prazo|dias|horas|meses/i, responsibility: /responsável|aprova|secretari|diretor|analista/i }
 const sentences = source.content.split(/\n|(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 8)
 return rules.map(rule => {
  const excerpts = sentences.filter(s => hints[rule.category].test(s)).slice(0, 3)
  if (!excerpts.length) return rule
  if (rule.status === "approved") {
   const incoming = excerpts.join(" ")
   if (incoming === rule.value || excerpts.every(e => rule.excerpt.includes(e))) return rule
   return { ...rule, status: "proposed", version: rule.version + 1, approvalCode: randomUUID().slice(0,8).toUpperCase(), conflict: { value: incoming, sourceId: source.id, excerpt: excerpts.join("\n") } }
  }
  return { ...rule, value: excerpts.join(" "), excerpt: excerpts.join("\n"), sourceId: source.id, status: "proposed", approvalCode: randomUUID().slice(0, 8).toUpperCase(), version: rule.version + 1 }
 })
}
export function generateScenarios(rules: Rule[]): Scenario[] {
 return rules.filter(r => r.status === "approved").flatMap(rule => [
 { id: randomUUID(), ruleId: rule.id, ruleVersion: rule.version, title: `${rule.title} · atende à regra`, input: `Pedido que atende a: ${rule.value}`, expected: `O formulário deve aplicar a regra aprovada: ${rule.value}`, result: "pending" as const },
 { id: randomUUID(), ruleId: rule.id, ruleVersion: rule.version, title: `${rule.title} · ausência ou exceção`, input: `Pedido sem o requisito ou com uma exceção relativa a: ${rule.value}`, expected: `Bloquear ou encaminhar para revisão conforme a regra; não presumir dispensa. Critério: ${rule.value}`, result: "pending" as const },
 ])
}
export function canPublish(rules: Rule[], scenarios: Scenario[]) {
 return completeness(rules) === 100 && rules.filter(r => r.status === "approved").every(r => scenarios.some(s => s.ruleId === r.id && s.ruleVersion === r.version)) && scenarios.length > 0 && scenarios.every(s => s.result === "passed" && rules.some(r => r.id === s.ruleId && r.version === s.ruleVersion && r.status === "approved"))
}
