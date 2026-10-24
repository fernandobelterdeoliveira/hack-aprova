import { z } from "zod"

export const decisionProviderSchema = z.enum(["deterministic", "jev", "jev-mock", "openai"])
export const messageTypeSchema = z.enum([
  "client_update",
  "document",
  "medical_update",
  "settlement_update",
  "deadline",
  "billing",
  "legal_strategy",
  "unknown",
])
export const riskLevelSchema = z.enum(["low", "medium", "high", "critical"])
export const associationStatusSchema = z.enum(["AUTO_SUGGEST", "NEEDS_REVIEW", "AMBIGUOUS", "NO_MATCH"])

export type DecisionProviderName = z.infer<typeof decisionProviderSchema>
export type MessageType = z.infer<typeof messageTypeSchema>
export type RiskLevel = z.infer<typeof riskLevelSchema>
export type AssociationStatus = z.infer<typeof associationStatusSchema>

export type AssociationSignalKind =
  | "case_number"
  | "email"
  | "phone"
  | "document"
  | "name"
  | "prior_relationship"
  | "known_sender"
  | "context"
  | "entity"
  | "temporal"
  | "semantic"

export type AssociationSignal = {
  kind: AssociationSignalKind
  detail: string
  contribution: number
  normalizedWeight: number
  source: "deterministic" | "contextual" | "semantic"
}

export type CandidateCase = {
  caseId: string
  caseNumber: string
  clientName: string
  caseType: string
  score: number
  deterministicScore: number
  contextualScore: number
  semanticScore: number
  signals: AssociationSignal[]
}

export type DecisionInput = {
  inboxItemId: string
  text: string
  sender: {
    name?: string | null
    email?: string | null
    phone?: string | null
  }
  candidateCases: CandidateCase[]
  deterministicSignals: AssociationSignal[]
  sourceType: string
  fileName?: string | null
}

export const decisionOutputSchema = z.object({
  suggestedCaseId: z.string().nullable(),
  associationConfidence: z.number().min(0).max(1),
  associationStatus: associationStatusSchema,
  messageType: messageTypeSchema,
  riskLevel: riskLevelSchema,
  requiresDeepReasoning: z.boolean(),
  requiresHumanReview: z.boolean(),
  possibleDuplicate: z.boolean(),
  workflow: z.enum(["deterministic", "structured_decision", "case_intelligence"]),
  reasoningSignals: z.array(z.object({
    code: z.string(),
    detail: z.string(),
    contribution: z.number().optional(),
  })),
  provider: decisionProviderSchema,
  model: z.string(),
  modelVersion: z.string().nullable(),
  confidence: z.number().min(0).max(1),
})

export type DecisionOutput = z.infer<typeof decisionOutputSchema>

export type DecisionProviderResult = {
  decision: DecisionOutput
  latencyMs: number
  tokenUsage?: { inputTokens?: number; outputTokens?: number }
  rawOutput?: unknown
}

export interface DecisionProvider {
  readonly name: DecisionProviderName
  readonly model: string
  readonly modelVersion: string | null
  isConfigured(): boolean
  decide(input: DecisionInput): Promise<DecisionProviderResult>
}

export type AssociationThresholds = {
  autoSuggest: number
  needsReview: number
  ambiguousMargin: number
  noMatch: number
}

export const DEFAULT_ASSOCIATION_THRESHOLDS: AssociationThresholds = {
  autoSuggest: Number(process.env.ASSOCIATION_AUTO_SUGGEST || 0.85),
  needsReview: Number(process.env.ASSOCIATION_NEEDS_REVIEW || 0.6),
  ambiguousMargin: Number(process.env.ASSOCIATION_AMBIGUOUS_MARGIN || 0.12),
  noMatch: Number(process.env.ASSOCIATION_NO_MATCH || 0.35),
}
