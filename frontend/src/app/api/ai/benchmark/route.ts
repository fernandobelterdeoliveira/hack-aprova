import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { buildAssociationCandidates } from "@/lib/ai/association"
import { benchmarkDecisionProviders } from "@/lib/ai/decision-router"
import { calculateBenchmarkMetrics, type BenchmarkObservation } from "@/lib/ai/benchmark"
import { DeterministicDecisionProvider } from "@/lib/ai/decision-providers"
import type { CandidateCase, DecisionInput } from "@/lib/ai/decision-types"
import { currentActor } from "@/lib/auth/current-actor"

const requestSchema = z.object({
  samples: z.array(z.object({
    inboxItemId: z.string(),
    expectedCaseId: z.string().nullable(),
    expectedMessageType: z.string(),
    humanOverride: z.boolean().optional(),
  })).min(1).max(100),
})

function candidatesForMode(candidates: CandidateCase[], mode: "current" | "embeddings" | "hybrid") {
  return candidates.map((candidate) => {
    if (mode === "hybrid") return candidate
    const score = mode === "embeddings" ? candidate.semanticScore : candidate.deterministicScore
    return {
      ...candidate,
      score,
      signals: candidate.signals.filter((signal) => mode === "embeddings"
        ? signal.source === "semantic"
        : signal.source === "deterministic"),
    }
  }).sort((left, right) => right.score - left.score)
}

export async function POST(request: NextRequest) {
  const actor = await currentActor()
  const parsed = requestSchema.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: "Dataset de benchmark inválido" }, { status: 400 })
  const observations: BenchmarkObservation[] = []
  const unavailable = new Set<string>()

  for (const sample of parsed.data.samples) {
    const item = await prisma.inboxItem.findFirst({ where: { id: sample.inboxItemId, workspaceId: actor.workspaceId } })
    if (!item) return NextResponse.json({ error: `Entrada ${sample.inboxItemId} não encontrada` }, { status: 404 })
    const association = await buildAssociationCandidates(prisma, item)
    const input: DecisionInput = {
      inboxItemId: item.id,
      text: item.rawContent,
      sender: { name: item.senderName, email: item.senderEmail, phone: item.senderPhone },
      candidateCases: association.candidates,
      deterministicSignals: association.candidates[0]?.signals || [],
      sourceType: item.sourceType,
      fileName: item.fileName,
    }

    const deterministic = new DeterministicDecisionProvider()
    for (const [provider, mode] of [
      ["associador_atual", "current"],
      ["embeddings", "embeddings"],
      ["hibrida", "hybrid"],
    ] as const) {
      const modeCandidates = candidatesForMode(input.candidateCases, mode)
      const result = await deterministic.decide({
        ...input,
        candidateCases: modeCandidates,
        deterministicSignals: modeCandidates[0]?.signals || [],
      })
      observations.push({
        provider,
        decision: result.decision,
        latencyMs: result.latencyMs,
        label: sample,
      })
    }

    const results = await benchmarkDecisionProviders(prisma, input)
    for (const result of results) {
      if (result.provider === "deterministic") continue
      if (result.status !== "completed" || !("decision" in result)) {
        unavailable.add(result.provider)
        continue
      }
      observations.push({
        provider: result.provider === "jev-mock" ? "jev_mock" : result.provider,
        decision: result.decision,
        latencyMs: result.latencyMs,
        label: sample,
      })
    }
  }

  return NextResponse.json({
    metrics: calculateBenchmarkMetrics(observations),
    unavailableProviders: [...unavailable],
    note: "Custos permanecem nulos até que preços versionados sejam configurados; o benchmark não presume preços externos.",
  })
}
