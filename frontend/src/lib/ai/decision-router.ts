import type { Prisma, PrismaClient } from "@prisma/client"
import { contentFingerprint } from "@/lib/ingestion-hash"
import type { DecisionInput, DecisionOutput, DecisionProvider, DecisionProviderResult } from "@/lib/ai/decision-types"
import {
  DeterministicDecisionProvider,
  JevDecisionProvider,
  MockJevDecisionProvider,
  OpenAIDecisionProvider,
} from "@/lib/ai/decision-providers"

const WORKFLOW_VERSION = "hybrid-routing-v1"

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function selectedProvider(): DecisionProvider {
  const configured = process.env.AI_DECISION_PROVIDER || "deterministic"
  if (configured === "jev") {
    const jev = new JevDecisionProvider()
    return jev.isConfigured() ? jev : new MockJevDecisionProvider()
  }
  if (configured === "openai") return new OpenAIDecisionProvider()
  return new DeterministicDecisionProvider()
}

async function auditedDecision(
  db: PrismaClient,
  provider: DecisionProvider,
  input: DecisionInput,
): Promise<{ result: DecisionProviderResult; executionId: string }> {
  const inputHash = contentFingerprint(input)
  const execution = await db.aIExecution.create({
    data: {
      provider: provider.name,
      model: provider.model || "not-configured",
      modelVersion: provider.modelVersion,
      workflowVersion: WORKFLOW_VERSION,
      inputHash,
      input: jsonValue(input),
      status: "started",
      inboxItemId: input.inboxItemId,
      caseId: input.candidateCases[0]?.caseId,
    },
  })
  try {
    const result = await provider.decide(input)
    await db.aIExecution.update({
      where: { id: execution.id },
      data: {
        provider: result.decision.provider,
        model: result.decision.model,
        modelVersion: result.decision.modelVersion,
        outputHash: contentFingerprint(result.decision),
        output: jsonValue({ decision: result.decision, rawOutput: result.rawOutput }),
        latencyMs: result.latencyMs,
        tokenUsage: result.tokenUsage ? jsonValue(result.tokenUsage) : undefined,
        status: "completed",
        completedAt: new Date(),
      },
    })
    return { result, executionId: execution.id }
  } catch (error) {
    await db.aIExecution.update({
      where: { id: execution.id },
      data: {
        status: "failed",
        error: error instanceof Error ? error.message : "Falha desconhecida do provider",
        completedAt: new Date(),
      },
    })
    throw error
  }
}

export async function routeDecision(
  db: PrismaClient,
  input: DecisionInput,
): Promise<{ decision: DecisionOutput; executionId: string; fallbackUsed: boolean }> {
  const primary = selectedProvider()
  try {
    const { result, executionId } = await auditedDecision(db, primary, input)
    return { decision: result.decision, executionId, fallbackUsed: false }
  } catch {
    if (primary.name === "deterministic") throw new Error("O provider determinístico falhou")
    const fallback = await auditedDecision(db, new DeterministicDecisionProvider(), input)
    return {
      decision: {
        ...fallback.result.decision,
        reasoningSignals: [
          ...fallback.result.decision.reasoningSignals,
          { code: "provider_fallback", detail: `Fallback aplicado após falha de ${primary.name}` },
        ],
      },
      executionId: fallback.executionId,
      fallbackUsed: true,
    }
  }
}

export async function benchmarkDecisionProviders(db: PrismaClient, input: DecisionInput) {
  const providers: DecisionProvider[] = [
    new DeterministicDecisionProvider(),
    new MockJevDecisionProvider(),
    new JevDecisionProvider(),
    new OpenAIDecisionProvider(),
  ]
  const results = []
  for (const provider of providers) {
    if (!provider.isConfigured()) {
      results.push({ provider: provider.name, status: "not_configured" })
      continue
    }
    try {
      const run = await auditedDecision(db, provider, input)
      results.push({ provider: provider.name, status: "completed", ...run.result })
    } catch (error) {
      results.push({ provider: provider.name, status: "failed", error: error instanceof Error ? error.message : "unknown" })
    }
  }
  return results
}
