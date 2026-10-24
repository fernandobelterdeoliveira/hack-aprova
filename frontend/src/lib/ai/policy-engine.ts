import type { RiskLevel } from "@/lib/ai/decision-types"

export type PolicyDecision =
  | "AUTO_APPLY"
  | "STAFF_REVIEW"
  | "ATTORNEY_REVIEW"
  | "MANUAL_ONLY"
  | "BLOCKED_MISSING_PROVENANCE"

export type PolicyInput = {
  changeType: string
  declaredRisk: string
  sourceId?: string | null
  sourceType?: string | null
  excerpt?: string | null
  title?: string | null
  description?: string | null
}

export type PolicyResult = {
  riskLevel: RiskLevel
  decision: PolicyDecision
  requiresHumanReview: boolean
  canApplyAfterReview: boolean
  reasons: string[]
}

export const AUTO_APPLY_ENABLED = process.env.AI_AUTO_APPLY_ENABLED === "true"

function normalized(value?: string | null) {
  return (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

export function evaluatePolicy(input: PolicyInput): PolicyResult {
  const reasons: string[] = []
  const content = normalized(`${input.title || ""} ${input.description || ""}`)
  let riskLevel: RiskLevel = ["low", "medium", "high", "critical"].includes(input.declaredRisk)
    ? input.declaredRisk as RiskLevel
    : "medium"

  if (input.changeType === "DEADLINE" || /prazo|audiencia|intimacao|prescricao/.test(content)) {
    riskLevel = "high"
    reasons.push("Possível prazo ou consequência processual")
  }
  if (/aceitar.*acordo|protocolar|peticionar|assumir obrigacao|comunicacao juridica definitiva/.test(content)) {
    riskLevel = "critical"
    reasons.push("Ação jurídica crítica ou compromisso em nome do cliente")
  }
  if (!input.sourceId || !input.sourceType || !input.excerpt) {
    return {
      riskLevel,
      decision: "BLOCKED_MISSING_PROVENANCE",
      requiresHumanReview: true,
      canApplyAfterReview: false,
      reasons: [...reasons, "A proposta não possui fonte, tipo de origem e trecho rastreável"],
    }
  }
  if (riskLevel === "critical") {
    return {
      riskLevel,
      decision: "MANUAL_ONLY",
      requiresHumanReview: true,
      canApplyAfterReview: false,
      reasons: [...reasons, "Ação crítica exige fluxo manual e identidade autenticada de advogado"],
    }
  }
  if (riskLevel === "high") {
    return {
      riskLevel,
      decision: "ATTORNEY_REVIEW",
      requiresHumanReview: true,
      canApplyAfterReview: true,
      reasons: [...reasons, "Revisão obrigatória de advogado"],
    }
  }
  if (riskLevel === "medium") {
    return {
      riskLevel,
      decision: "STAFF_REVIEW",
      requiresHumanReview: true,
      canApplyAfterReview: true,
      reasons: [...reasons, "Revisão humana exigida pela política de risco médio"],
    }
  }
  return {
    riskLevel,
    decision: AUTO_APPLY_ENABLED ? "AUTO_APPLY" : "STAFF_REVIEW",
    requiresHumanReview: !AUTO_APPLY_ENABLED,
    canApplyAfterReview: true,
    reasons: [
      ...reasons,
      AUTO_APPLY_ENABLED
        ? "Auto-apply habilitado explicitamente para baixo risco"
        : "Auto-apply global está desabilitado",
    ],
  }
}
