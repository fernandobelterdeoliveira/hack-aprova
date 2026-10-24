import type { Prisma, PrismaClient } from "@prisma/client"
import { contentFingerprint } from "@/lib/ingestion-hash"

export type IntelligenceEvidence = {
  sourceId: string
  sourceType: string
  documentId?: string | null
  page?: number | null
  excerpt: string
}

export type IntelligenceProposal = {
  type: "FACT" | "EVENT" | "TASK" | "GAP" | "GAP_RESOLUTION" | "DEADLINE"
  confidence: number
  riskLevel: "low" | "medium" | "high" | "critical"
  payload: Record<string, unknown>
  evidence: IntelligenceEvidence
}

export type CaseIntelligenceResult = {
  proposals: IntelligenceProposal[]
  requiresHumanReview: boolean
  uncertainty: string[]
  provider: "openai" | "deterministic"
  model: string
  modelVersion: string | null
  latencyMs: number
  tokenUsage?: { inputTokens: number; outputTokens: number }
  rawOutput?: unknown
}

type ToolCall = { type: "function_call"; call_id: string; name: string; arguments: string }
type ResponseItem = ToolCall | Record<string, unknown>

const evidenceProperties = {
  sourceId: { type: "string" },
  sourceType: { type: "string" },
  documentId: { type: ["string", "null"] },
  page: { type: ["integer", "null"] },
  excerpt: { type: "string" },
  confidence: { type: "number", minimum: 0, maximum: 1 },
}

function tool(name: string, description: string, properties: Record<string, unknown>, required: string[]) {
  return {
    type: "function",
    name,
    description,
    strict: true,
    parameters: { type: "object", properties, required, additionalProperties: false },
  }
}

const tools = [
  ...["get_case_state", "get_case_timeline", "get_case_facts", "get_information_gaps", "get_case_tasks", "get_case_documents"]
    .map((name) => tool(name, `Consultar ${name.replaceAll("_", " ")} sem alterar o caso.`, { caseId: { type: "string" } }, ["caseId"])),
  tool("read_document", "Ler metadados e conteúdo disponível de um documento do caso.", {
    documentId: { type: "string" },
    page: { type: ["integer", "null"] },
  }, ["documentId", "page"]),
  tool("search_case_content", "Pesquisar conteúdo já registrado no caso.", {
    caseId: { type: "string" },
    query: { type: "string" },
  }, ["caseId", "query"]),
  tool("get_source_evidence", "Recuperar uma fonte pelo identificador.", {
    sourceId: { type: "string" },
  }, ["sourceId"]),
  tool("propose_event", "Propor evento com evidência; não aplica a alteração.", {
    title: { type: "string" },
    description: { type: "string" },
    eventType: { type: "string" },
    occurredAt: { type: "string" },
    ...evidenceProperties,
  }, ["title", "description", "eventType", "occurredAt", ...Object.keys(evidenceProperties)]),
  tool("propose_fact", "Propor fato atômico com evidência; não aplica a alteração.", {
    fieldName: { type: "string" },
    value: {},
    conflict: { type: "boolean" },
    ...evidenceProperties,
  }, ["fieldName", "value", "conflict", ...Object.keys(evidenceProperties)]),
  tool("propose_task", "Propor tarefa; não executa a tarefa.", {
    title: { type: "string" },
    description: { type: "string" },
    priority: { type: "string", enum: ["low", "medium", "high"] },
    category: { type: "string" },
    ...evidenceProperties,
  }, ["title", "description", "priority", "category", ...Object.keys(evidenceProperties)]),
  tool("propose_information_gap", "Propor uma lacuna de informação.", {
    title: { type: "string" },
    description: { type: "string" },
    suggestedQuestion: { type: "string" },
    ...evidenceProperties,
  }, ["title", "description", "suggestedQuestion", ...Object.keys(evidenceProperties)]),
  tool("propose_gap_resolution", "Propor resolução de uma lacuna existente.", {
    gapId: { type: "string" },
    resolution: { type: "string" },
    ...evidenceProperties,
  }, ["gapId", "resolution", ...Object.keys(evidenceProperties)]),
  tool("propose_deadline", "Propor possível prazo, sempre com alto risco.", {
    title: { type: "string" },
    description: { type: "string" },
    rawDate: { type: "string" },
    ...evidenceProperties,
  }, ["title", "description", "rawDate", ...Object.keys(evidenceProperties)]),
  tool("request_human_review", "Solicitar revisão humana e explicar a incerteza.", {
    reason: { type: "string" },
    riskLevel: { type: "string", enum: ["medium", "high", "critical"] },
  }, ["reason", "riskLevel"]),
]

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function evidence(args: Record<string, unknown>): IntelligenceEvidence {
  return {
    sourceId: String(args.sourceId || ""),
    sourceType: String(args.sourceType || ""),
    documentId: args.documentId ? String(args.documentId) : null,
    page: typeof args.page === "number" ? args.page : null,
    excerpt: String(args.excerpt || ""),
  }
}

class CaseIntelligenceToolkit {
  readonly proposals: IntelligenceProposal[] = []
  readonly uncertainty: string[] = []
  requiresHumanReview = false

  constructor(
    private readonly db: PrismaClient,
    private readonly caseId: string,
  ) {}

  private assertCase(caseId: unknown) {
    if (caseId !== this.caseId) throw new Error("A ferramenta tentou acessar outro caso")
  }

  async execute(name: string, rawArgs: unknown) {
    const args = record(rawArgs)
    if (name.startsWith("get_case_") || name === "search_case_content") this.assertCase(args.caseId)
    if (name === "get_case_state") return this.db.caseState.findUnique({ where: { caseId: this.caseId } })
    if (name === "get_case_timeline") return this.db.caseEvent.findMany({ where: { caseId: this.caseId }, orderBy: { occurredAt: "desc" }, take: 100 })
    if (name === "get_case_facts") return this.db.caseFact.findMany({ where: { caseId: this.caseId, archivedAt: null }, orderBy: { extractedAt: "desc" } })
    if (name === "get_information_gaps") return this.db.informationGap.findMany({ where: { caseId: this.caseId, status: "open" } })
    if (name === "get_case_tasks") return this.db.aITask.findMany({ where: { caseId: this.caseId, status: { notIn: ["completed", "dismissed"] } } })
    if (name === "get_case_documents") return this.db.files.findMany({ where: { caseId: this.caseId }, orderBy: { uploadedAt: "desc" } })
    if (name === "read_document") {
      return this.db.files.findFirst({ where: { id: String(args.documentId), caseId: this.caseId } })
    }
    if (name === "search_case_content") {
      const query = String(args.query || "")
      const [events, facts, emails, texts] = await Promise.all([
        this.db.caseEvent.findMany({ where: { caseId: this.caseId, OR: [{ title: { contains: query, mode: "insensitive" } }, { description: { contains: query, mode: "insensitive" } }] }, take: 20 }),
        this.db.caseFact.findMany({ where: { caseId: this.caseId, archivedAt: null, OR: [{ fieldName: { contains: query, mode: "insensitive" } }, { sourceExcerpt: { contains: query, mode: "insensitive" } }] }, take: 20 }),
        this.db.email.findMany({ where: { caseId: this.caseId, OR: [{ subject: { contains: query, mode: "insensitive" } }, { content: { contains: query, mode: "insensitive" } }] }, take: 20 }),
        this.db.textMessage.findMany({ where: { caseId: this.caseId, text: { contains: query, mode: "insensitive" } }, take: 20 }),
      ])
      return { events, facts, emails, texts }
    }
    if (name === "get_source_evidence") {
      const sourceId = String(args.sourceId)
      const inbox = await this.db.inboxItem.findUnique({ where: { id: sourceId } })
      if (inbox) return { sourceType: inbox.sourceType, sourceId: inbox.id, excerpt: inbox.rawContent }
      const file = await this.db.files.findUnique({ where: { id: sourceId } })
      return file ? { sourceType: "document", sourceId: file.id, documentId: file.id, name: file.name, url: file.url } : null
    }
    if (name === "request_human_review") {
      this.requiresHumanReview = true
      this.uncertainty.push(String(args.reason || "Revisão humana solicitada"))
      return { accepted: true }
    }

    const base = {
      confidence: Number(args.confidence),
      evidence: evidence(args),
    }
    let proposal: IntelligenceProposal
    if (name === "propose_event") {
      proposal = { ...base, type: "EVENT", riskLevel: "medium", payload: { title: args.title, description: args.description, eventType: args.eventType, occurredAt: args.occurredAt } }
    } else if (name === "propose_fact") {
      proposal = { ...base, type: "FACT", riskLevel: args.conflict ? "high" : "medium", payload: { fieldName: args.fieldName, value: args.value, conflict: args.conflict } }
    } else if (name === "propose_task") {
      proposal = { ...base, type: "TASK", riskLevel: "medium", payload: { title: args.title, description: args.description, priority: args.priority, category: args.category } }
    } else if (name === "propose_information_gap") {
      proposal = { ...base, type: "GAP", riskLevel: "medium", payload: { title: args.title, description: args.description, suggestedQuestion: args.suggestedQuestion } }
    } else if (name === "propose_gap_resolution") {
      proposal = { ...base, type: "GAP_RESOLUTION", riskLevel: "medium", payload: { gapId: args.gapId, resolution: args.resolution } }
    } else if (name === "propose_deadline") {
      proposal = { ...base, type: "DEADLINE", riskLevel: "high", payload: { title: args.title, description: args.description, rawDate: args.rawDate, priority: "high", category: "deadline" } }
    } else {
      throw new Error(`Ferramenta não permitida: ${name}`)
    }
    this.proposals.push(proposal)
    return { proposed: true, fingerprint: contentFingerprint(proposal) }
  }
}

export class CaseIntelligenceAgent {
  constructor(private readonly db: PrismaClient) {}

  isConfigured() {
    return Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_CASE_INTELLIGENCE_MODEL)
  }

  async analyze(input: {
    caseId: string
    inboxItemId: string
    objective: string
    sourceType: string
    text: string
    signal?: AbortSignal
  }): Promise<CaseIntelligenceResult> {
    if (!this.isConfigured()) return this.deterministicFallback(input)
    const started = performance.now()
    const toolkit = new CaseIntelligenceToolkit(this.db, input.caseId)
    const model = process.env.OPENAI_CASE_INTELLIGENCE_MODEL as string
    const conversation: ResponseItem[] = [{
      role: "user",
      content: [
        `Objetivo: ${input.objective}`,
        `caseId permitido: ${input.caseId}`,
        `Fonte atual: ${input.sourceType} / ${input.inboxItemId}`,
        `Conteúdo original: ${input.text}`,
      ].join("\n"),
    }]
    const responses: unknown[] = []
    let inputTokens = 0
    let outputTokens = 0

    for (let iteration = 0; iteration < 8; iteration += 1) {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          store: false,
          instructions: [
            "Você é o Case Intelligence Agent de um sistema jurídico centrado no caso.",
            "Investigue somente o necessário usando as ferramentas permitidas.",
            "Nunca altere o caso e nunca invente fatos.",
            "Toda proposta exige trecho exato e sourceId da evidência.",
            "Prazos, conflitos e consequências processuais exigem revisão humana.",
            "Não revele chain-of-thought; use ferramentas e conclusões estruturadas.",
          ].join(" "),
          input: conversation,
          tools,
          parallel_tool_calls: false,
        }),
        signal: input.signal,
      })
      if (!response.ok) throw new Error(`OpenAI Responses retornou ${response.status}`)
      const payload = await response.json() as {
        output?: ResponseItem[]
        usage?: { input_tokens?: number; output_tokens?: number }
      }
      responses.push(payload)
      inputTokens += payload.usage?.input_tokens || 0
      outputTokens += payload.usage?.output_tokens || 0
      const output = payload.output || []
      conversation.push(...output)
      const calls = output.filter((item): item is ToolCall => item.type === "function_call")
      if (!calls.length) break
      for (const call of calls) {
        const result = await toolkit.execute(call.name, JSON.parse(call.arguments))
        conversation.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result) })
      }
    }

    return {
      proposals: toolkit.proposals,
      requiresHumanReview: toolkit.requiresHumanReview || toolkit.proposals.some((proposal) => proposal.riskLevel !== "low"),
      uncertainty: toolkit.uncertainty,
      provider: "openai",
      model,
      modelVersion: process.env.OPENAI_CASE_INTELLIGENCE_MODEL_VERSION || model,
      latencyMs: Math.round(performance.now() - started),
      tokenUsage: { inputTokens, outputTokens },
      rawOutput: responses,
    }
  }

  private async deterministicFallback(input: {
    inboxItemId: string
    sourceType: string
    text: string
  }): Promise<CaseIntelligenceResult> {
    const started = performance.now()
    const text = input.text.trim()
    const conflict = /na verdade|corrigindo|contradiz|incorreto|não foi|nao foi/i.test(text)
    const proposals: IntelligenceProposal[] = conflict ? [{
      type: "FACT",
      confidence: 0.55,
      riskLevel: "high",
      payload: {
        fieldName: "possible_conflicting_information",
        value: { text },
        conflict: true,
        title: "Possível informação conflitante",
        description: "A mensagem contém linguagem de correção ou contradição e exige comparação humana com as fontes anteriores.",
      },
      evidence: { sourceId: input.inboxItemId, sourceType: input.sourceType, excerpt: text.slice(0, 500) },
    }] : []
    return {
      proposals,
      requiresHumanReview: true,
      uncertainty: ["OpenAI não configurada; foi usado o fallback determinístico limitado"],
      provider: "deterministic",
      model: "case-intelligence-fallback",
      modelVersion: "1",
      latencyMs: Math.round(performance.now() - started),
    }
  }
}

export function proposalPayload(proposal: IntelligenceProposal): Prisma.InputJsonValue {
  return {
    ...proposal.payload,
    evidence: {
      source: proposal.evidence.sourceType,
      sourceId: proposal.evidence.sourceId,
      documentId: proposal.evidence.documentId || null,
      page: proposal.evidence.page || null,
      excerpt: proposal.evidence.excerpt,
    },
  } as Prisma.InputJsonValue
}
