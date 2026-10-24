import { z } from "zod"
import {
  associationStatusSchema,
  decisionOutputSchema,
  messageTypeSchema,
  riskLevelSchema,
  type DecisionInput,
  type DecisionOutput,
  type DecisionProvider,
  type DecisionProviderResult,
  type MessageType,
  type RiskLevel,
} from "@/lib/ai/decision-types"
import { associationStatus } from "@/lib/ai/association"

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

export function classifyMessage(input: DecisionInput): MessageType {
  const content = normalized(input.text)
  if (input.fileName) return "document"
  if (/fisioterapia|physical therapy|tratamento|ressonancia|hospital|medic/.test(content)) return "medical_update"
  if (/aceitar.*acordo|accept.*settlement|fechar.*acordo/.test(content)) return "legal_strategy"
  if (/offer|settlement|acordo|proposta|seguradora/.test(content)) return "settlement_update"
  if (/deadline|hearing|court|prazo|audiencia|tribunal|intimacao/.test(content)) return "deadline"
  if (/invoice|bill|cobranca|fatura|recibo/.test(content)) return "billing"
  if (/estrategia|strategy|processar|ajuizar|peticao|recurso|contradiz|conflit/.test(content)) return "legal_strategy"
  return "client_update"
}

function classifyRisk(messageType: MessageType, text: string): RiskLevel {
  const content = normalized(text)
  if (/aceitar.*acordo|protocolar|peticionar|assumir obrigacao|decisao juridica definitiva/.test(content)) return "critical"
  if (messageType === "deadline" || messageType === "legal_strategy" || /conflit|contradiz|corrig|correc|na verdade/.test(content)) return "high"
  if (["medical_update", "settlement_update", "billing"].includes(messageType)) return "medium"
  return "low"
}

export class DeterministicDecisionProvider implements DecisionProvider {
  readonly name = "deterministic" as const
  readonly model = "legal-routing-rules"
  readonly modelVersion = "2.0.0"

  isConfigured() {
    return true
  }

  async decide(input: DecisionInput): Promise<DecisionProviderResult> {
    const started = performance.now()
    const best = input.candidateCases[0]
    const status = associationStatus(input.candidateCases)
    const messageType = classifyMessage(input)
    const riskLevel = classifyRisk(messageType, input.text)
    const requiresDeepReasoning = riskLevel === "critical"
      || messageType === "legal_strategy"
      || /conflit|contradiz|corrig|correc|na verdade|inconsisten|investig/.test(normalized(input.text))
    const requiresHumanReview = riskLevel !== "low" || status !== "AUTO_SUGGEST"
    const decision: DecisionOutput = {
      suggestedCaseId: status === "NO_MATCH" ? null : best?.caseId || null,
      associationConfidence: best?.score || 0,
      associationStatus: status,
      messageType,
      riskLevel,
      requiresDeepReasoning,
      requiresHumanReview,
      possibleDuplicate: false,
      workflow: requiresDeepReasoning ? "case_intelligence" : "deterministic",
      reasoningSignals: [
        ...(best?.signals || []).map((signal) => ({
          code: signal.kind,
          detail: signal.detail,
          contribution: signal.contribution,
        })),
        { code: "risk_policy", detail: `Risco classificado como ${riskLevel}` },
      ],
      provider: this.name,
      model: this.model,
      modelVersion: this.modelVersion,
      confidence: Math.max(best?.score || 0.5, riskLevel === "critical" ? 0.95 : 0.7),
    }
    return { decision, latencyMs: Math.round(performance.now() - started), rawOutput: decision }
  }
}

const jevChoiceSchema = z.object({
  type: z.literal("choice"),
  choice: z.string(),
  confidence: z.number(),
  probabilities: z.record(z.string(), z.number()),
})
const jevNoulSchema = z.object({ type: z.literal("noul"), noul: z.number() })
const jevScoreSchema = z.object({
  type: z.literal("score"),
  score: z.number(),
  confidence: z.number(),
  legend: z.record(z.string(), z.unknown()),
  probabilities: z.record(z.string(), z.number()),
})
const jevResponseSchema = z.object({
  model: z.string(),
  answers: z.record(z.string(), z.union([jevChoiceSchema, jevNoulSchema, jevScoreSchema])),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }),
})

export class JevDecisionProvider implements DecisionProvider {
  readonly name = "jev" as const
  readonly model = process.env.JEV_MODEL || "jev-latest"
  readonly modelVersion = null

  isConfigured() {
    return Boolean(process.env.JEV_API_KEY)
  }

  async decide(input: DecisionInput): Promise<DecisionProviderResult> {
    if (!this.isConfigured()) throw new Error("JEV_API_KEY não configurada")
    const started = performance.now()
    const candidateCriteria = Object.fromEntries(
      input.candidateCases.slice(0, 8).map((candidate) => [
        candidate.caseId,
        `${candidate.caseNumber} — ${candidate.clientName} — ${candidate.caseType}`,
      ]),
    )
    candidateCriteria.NO_MATCH = "Nenhum caso candidato é suficientemente compatível"
    const response = await fetch(`${(process.env.JEV_BASE_URL || "https://api.typesafe.ai").replace(/\/$/, "")}/v1/systemone`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.JEV_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        state: input,
        questions: {
          case_association: {
            type: "choice",
            instructions: "Qual caso melhor corresponde à entrada considerando identidade e contexto? Identificadores fortes prevalecem sobre semântica.",
            criteria: candidateCriteria,
          },
          message_type: {
            type: "choice",
            instructions: "Classifique o tipo principal da entrada.",
            criteria: Object.fromEntries(messageTypeSchema.options.map((value) => [value, null])),
          },
          risk: {
            type: "score",
            instructions: "Avalie o risco jurídico e operacional.",
            criteria: ["baixo", "médio", "alto", "crítico"],
          },
          deep_reasoning: { type: "noul", instructions: "Esta entrada exige investigação ou raciocínio complexo sobre o caso?" },
          human_review: { type: "noul", instructions: "A decisão exige revisão humana antes de alterar o estado oficial?" },
        },
      }),
    })
    if (!response.ok) throw new Error(`Jev retornou ${response.status}`)
    const raw = jevResponseSchema.parse(await response.json())
    const caseAnswer = jevChoiceSchema.parse(raw.answers.case_association)
    const typeAnswer = jevChoiceSchema.parse(raw.answers.message_type)
    const riskAnswer = jevScoreSchema.parse(raw.answers.risk)
    const deepAnswer = jevNoulSchema.parse(raw.answers.deep_reasoning)
    const reviewAnswer = jevNoulSchema.parse(raw.answers.human_review)
    const selectedCandidate = input.candidateCases.find((candidate) => candidate.caseId === caseAnswer.choice)
    const riskLevels: RiskLevel[] = ["low", "medium", "high", "critical"]
    const riskLevel = riskLevels[Math.max(0, Math.min(3, Math.round(riskAnswer.score)))]
    const deterministicStatus = associationStatus(input.candidateCases)
    const safeCaseId = caseAnswer.choice === "NO_MATCH" ? null : selectedCandidate?.caseId || null
    const decision = decisionOutputSchema.parse({
      suggestedCaseId: safeCaseId,
      associationConfidence: safeCaseId ? Math.min(caseAnswer.confidence, selectedCandidate?.score || 0) : 0,
      associationStatus: safeCaseId ? deterministicStatus : "NO_MATCH",
      messageType: messageTypeSchema.catch("unknown").parse(typeAnswer.choice),
      riskLevel,
      requiresDeepReasoning: deepAnswer.noul >= 0.55,
      requiresHumanReview: reviewAnswer.noul >= 0.5 || riskLevel !== "low",
      possibleDuplicate: false,
      workflow: deepAnswer.noul >= 0.55 ? "case_intelligence" : "structured_decision",
      reasoningSignals: [
        { code: "jev_case", detail: `Jev selecionou ${caseAnswer.choice} com confiança ${Math.round(caseAnswer.confidence * 100)}%` },
        { code: "jev_risk", detail: `Score de risco: ${riskAnswer.score.toFixed(2)}` },
      ],
      provider: this.name,
      model: raw.model,
      modelVersion: raw.model,
      confidence: Math.min(caseAnswer.confidence, typeAnswer.confidence, riskAnswer.confidence),
    })
    return {
      decision,
      latencyMs: Math.round(performance.now() - started),
      tokenUsage: { inputTokens: raw.usage.input_tokens, outputTokens: raw.usage.output_tokens },
      rawOutput: raw,
    }
  }
}

export class MockJevDecisionProvider implements DecisionProvider {
  readonly name = "jev-mock" as const
  readonly model = "jev-contract-mock"
  readonly modelVersion = "1"

  isConfigured() {
    return true
  }

  async decide(input: DecisionInput): Promise<DecisionProviderResult> {
    const result = await new DeterministicDecisionProvider().decide(input)
    return {
      ...result,
      decision: {
        ...result.decision,
        provider: this.name,
        model: this.model,
        modelVersion: this.modelVersion,
        workflow: "structured_decision",
        reasoningSignals: [
          ...result.decision.reasoningSignals,
          { code: "mock_provider", detail: "Mock local do contrato Jev; nenhuma chamada externa foi realizada" },
        ],
      },
    }
  }
}

const openAIDecisionSchema = {
  type: "object",
  properties: {
    suggestedCaseId: { type: ["string", "null"] },
    associationConfidence: { type: "number", minimum: 0, maximum: 1 },
    associationStatus: { type: "string", enum: associationStatusSchema.options },
    messageType: { type: "string", enum: messageTypeSchema.options },
    riskLevel: { type: "string", enum: riskLevelSchema.options },
    requiresDeepReasoning: { type: "boolean" },
    requiresHumanReview: { type: "boolean" },
    possibleDuplicate: { type: "boolean" },
    workflow: { type: "string", enum: ["deterministic", "structured_decision", "case_intelligence"] },
    reasoningSignals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          code: { type: "string" },
          detail: { type: "string" },
          contribution: { type: ["number", "null"] },
        },
        required: ["code", "detail", "contribution"],
        additionalProperties: false,
      },
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: [
    "suggestedCaseId", "associationConfidence", "associationStatus", "messageType", "riskLevel",
    "requiresDeepReasoning", "requiresHumanReview", "possibleDuplicate", "workflow", "reasoningSignals", "confidence",
  ],
  additionalProperties: false,
}

function responseText(payload: { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }) {
  return payload.output?.flatMap((item) => item.content || []).find((content) => content.type === "output_text")?.text || ""
}

export class OpenAIDecisionProvider implements DecisionProvider {
  readonly name = "openai" as const
  readonly model = process.env.OPENAI_DECISION_MODEL || ""
  readonly modelVersion = process.env.OPENAI_DECISION_MODEL_VERSION || null

  isConfigured() {
    return Boolean(process.env.OPENAI_API_KEY && this.model)
  }

  async decide(input: DecisionInput): Promise<DecisionProviderResult> {
    if (!this.isConfigured()) throw new Error("OPENAI_API_KEY ou OPENAI_DECISION_MODEL não configurado")
    const started = performance.now()
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        store: false,
        instructions: "Classifique e roteie uma entrada jurídica. Retorne somente o objeto estruturado. Identificadores fortes prevalecem sobre semântica. A IA apenas propõe; riscos alto e crítico exigem revisão humana.",
        input: JSON.stringify(input),
        text: { format: { type: "json_schema", name: "legal_intake_decision", strict: true, schema: openAIDecisionSchema } },
      }),
    })
    if (!response.ok) throw new Error(`OpenAI Responses retornou ${response.status}`)
    const raw = await response.json() as {
      model?: string
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>
      usage?: { input_tokens?: number; output_tokens?: number }
    }
    const parsed = decisionOutputSchema.omit({ provider: true, model: true, modelVersion: true }).parse(JSON.parse(responseText(raw)))
    const decision = decisionOutputSchema.parse({
      ...parsed,
      provider: this.name,
      model: raw.model || this.model,
      modelVersion: this.modelVersion || raw.model || null,
    })
    return {
      decision,
      latencyMs: Math.round(performance.now() - started),
      tokenUsage: { inputTokens: raw.usage?.input_tokens || 0, outputTokens: raw.usage?.output_tokens || 0 },
      rawOutput: raw,
    }
  }
}
