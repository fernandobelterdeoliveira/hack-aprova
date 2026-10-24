import type { DecisionOutput } from "@/lib/ai/decision-types"

export type BenchmarkLabel = {
  expectedCaseId: string | null
  expectedMessageType: string
  humanOverride?: boolean
}

export type BenchmarkObservation = {
  provider: string
  decision: DecisionOutput
  label: BenchmarkLabel
  latencyMs: number
  estimatedCost?: number | null
}

function percentile(values: number[], quantile: number) {
  if (!values.length) return 0
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * quantile))]
}

export function calculateBenchmarkMetrics(observations: BenchmarkObservation[]) {
  const grouped = Map.groupBy(observations, (observation) => observation.provider)
  return [...grouped.entries()].map(([provider, rows]) => {
    const truePositive = rows.filter((row) => row.label.expectedCaseId && row.decision.suggestedCaseId === row.label.expectedCaseId).length
    const falsePositive = rows.filter((row) => !row.label.expectedCaseId && row.decision.suggestedCaseId).length
    const falseNegative = rows.filter((row) => row.label.expectedCaseId && !row.decision.suggestedCaseId).length
    const associationCorrect = rows.filter((row) => row.decision.suggestedCaseId === row.label.expectedCaseId).length
    const classificationCorrect = rows.filter((row) => row.decision.messageType === row.label.expectedMessageType).length
    const calibrationError = rows.reduce((sum, row) => {
      const correct = row.decision.suggestedCaseId === row.label.expectedCaseId ? 1 : 0
      return sum + Math.abs(row.decision.associationConfidence - correct)
    }, 0) / Math.max(rows.length, 1)
    const totalCost = rows.reduce((sum, row) => sum + (row.estimatedCost || 0), 0)
    return {
      provider,
      sampleSize: rows.length,
      caseAssociationAccuracy: associationCorrect / Math.max(rows.length, 1),
      classificationAccuracy: classificationCorrect / Math.max(rows.length, 1),
      falsePositiveRate: falsePositive / Math.max(falsePositive + truePositive, 1),
      falseNegativeRate: falseNegative / Math.max(falseNegative + truePositive, 1),
      humanOverrideRate: rows.filter((row) => row.label.humanOverride).length / Math.max(rows.length, 1),
      confidenceCalibration: 1 - calibrationError,
      latencyP50: percentile(rows.map((row) => row.latencyMs), 0.5),
      latencyP95: percentile(rows.map((row) => row.latencyMs), 0.95),
      costPer1000Items: rows.length ? (totalCost / rows.length) * 1000 : null,
    }
  })
}
