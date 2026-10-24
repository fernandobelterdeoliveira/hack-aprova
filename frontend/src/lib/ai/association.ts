import type { InboxItem, Prisma, PrismaClient } from "@prisma/client"
import { contentFingerprint } from "@/lib/ingestion-hash"
import { configuredEmbeddingProvider, cosineSimilarity, LocalEmbeddingProvider } from "@/lib/ai/embeddings"
import {
  DEFAULT_ASSOCIATION_THRESHOLDS,
  type AssociationSignal,
  type AssociationStatus,
  type CandidateCase,
} from "@/lib/ai/decision-types"

const stopWords = new Set([
  "about", "after", "before", "case", "client", "from", "have", "that", "this", "with", "your",
  "para", "como", "depois", "esse", "esta", "mais", "sobre", "cliente", "caso", "hoje",
])

function normalize(value?: string | null) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function digits(value?: string | null) {
  return (value || "").replace(/\D/g, "")
}

function tokens(value: string) {
  return new Set(
    normalize(value)
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 4 && !stopWords.has(token)),
  )
}

function addSignal(
  signals: AssociationSignal[],
  kind: AssociationSignal["kind"],
  detail: string,
  contribution: number,
  source: AssociationSignal["source"],
) {
  signals.push({ kind, detail, contribution, normalizedWeight: contribution / 100, source })
}

function caseSemanticText(lawCase: {
  caseNumber: string
  clientName: string
  caseType: string
  description: string
  nextAction: string
  state: { summary: string } | null
  events: Array<{ title: string; description: string | null }>
  emails: Array<{ subject: string; content: string; from: string; to: string }>
  textMessages: Array<{ text: string }>
  files: Array<{ name: string; type: string }>
}) {
  return [
    lawCase.caseNumber,
    lawCase.clientName,
    lawCase.caseType,
    lawCase.description,
    lawCase.nextAction,
    lawCase.state?.summary,
    ...lawCase.events.map((event) => `${event.title} ${event.description || ""}`),
    ...lawCase.emails.map((email) => `${email.subject} ${email.content}`),
    ...lawCase.textMessages.map((message) => message.text),
    ...lawCase.files.map((file) => `${file.name} ${file.type}`),
  ].filter(Boolean).join("\n").slice(0, 16_000)
}

export async function buildAssociationCandidates(
  db: PrismaClient,
  item: InboxItem,
): Promise<{ candidates: CandidateCase[]; semanticFingerprint: string; embeddingProvider: string }> {
  const cases = await db.case.findMany({
    include: {
      state: { select: { summary: true } },
      events: { select: { title: true, description: true }, orderBy: { occurredAt: "desc" }, take: 20 },
      emails: { select: { subject: true, content: true, from: true, to: true }, orderBy: { createdAt: "desc" }, take: 20 },
      textMessages: { select: { text: true }, orderBy: { createdAt: "desc" }, take: 20 },
      files: { select: { name: true, type: true }, orderBy: { uploadedAt: "desc" }, take: 20 },
    },
  })

  const itemText = `${item.senderName || ""} ${item.rawContent}`
  const itemTokens = tokens(itemText)
  const senderEmail = normalize(item.senderEmail)
  const senderPhone = digits(item.senderPhone)
  const semanticTexts = [itemText, ...cases.map(caseSemanticText)]
  let provider = configuredEmbeddingProvider()
  let embedded
  try {
    embedded = await provider.embed(semanticTexts)
  } catch {
    // Semantic matching must never make ingestion unavailable. Identity and
    // deterministic signals remain authoritative when an external API fails.
    provider = new LocalEmbeddingProvider()
    embedded = await provider.embed(semanticTexts)
  }
  const itemVector = embedded.vectors[0]
  const semanticFingerprint = contentFingerprint({ provider: embedded.provider, model: embedded.model, vector: itemVector })

  await db.embeddingRecord.upsert({
    where: {
      entityType_entityId_provider_model_contentHash: {
        entityType: "inbox_item",
        entityId: item.id,
        provider: embedded.provider,
        model: embedded.model,
        contentHash: item.contentHash,
      },
    },
    update: { vector: itemVector as Prisma.InputJsonValue, dimensions: itemVector.length },
    create: {
      entityType: "inbox_item",
      entityId: item.id,
      contentHash: item.contentHash,
      contentPreview: item.rawContent.slice(0, 500),
      provider: embedded.provider,
      model: embedded.model,
      modelVersion: embedded.modelVersion,
      dimensions: itemVector.length,
      vector: itemVector as Prisma.InputJsonValue,
      inboxItemId: item.id,
    },
  })

  const ranked = await Promise.all(cases.map(async (lawCase, index) => {
    const signals: AssociationSignal[] = []
    const normalizedContent = normalize(item.rawContent)
    const normalizedCaseNumber = normalize(lawCase.caseNumber)
    if (normalizedCaseNumber && normalizedContent.includes(normalizedCaseNumber)) {
      addSignal(signals, "case_number", `Número do caso ${lawCase.caseNumber}`, 60, "deterministic")
    }
    if (senderEmail && normalize(lawCase.clientEmail) === senderEmail) {
      addSignal(signals, "email", "E-mail corresponde ao cadastro do cliente", 40, "deterministic")
    } else if (senderEmail && lawCase.emails.some((email) => normalize(email.from) === senderEmail || normalize(email.to) === senderEmail)) {
      addSignal(signals, "prior_relationship", "Remetente encontrado em comunicações anteriores", 22, "deterministic")
    }
    if (senderPhone && digits(lawCase.clientPhone) === senderPhone) {
      addSignal(signals, "phone", "Telefone corresponde ao cadastro do cliente", 30, "deterministic")
    }
    const clientName = normalize(lawCase.clientName)
    if (clientName && (normalize(item.senderName) === clientName || normalize(itemText).includes(clientName))) {
      addSignal(signals, "name", `Nome do cliente: ${lawCase.clientName}`, 20, "deterministic")
    }

    const contextTokens = tokens(`${lawCase.caseType} ${lawCase.description} ${lawCase.state?.summary || ""}`)
    const common = [...itemTokens].filter((token) => contextTokens.has(token))
    if (common.length) {
      addSignal(signals, "context", `Contexto em comum: ${common.slice(0, 5).join(", ")}`, Math.min(15, common.length * 3), "contextual")
    }

    const semanticScore = Math.max(0, cosineSimilarity(itemVector, embedded.vectors[index + 1]))
    if (semanticScore >= 0.2) {
      addSignal(signals, "semantic", `Similaridade semântica: ${Math.round(semanticScore * 100)}%`, Math.round(semanticScore * 15), "semantic")
    }

    const deterministicScore = signals.filter((signal) => signal.source === "deterministic").reduce((sum, signal) => sum + signal.contribution, 0)
    const contextualScore = signals.filter((signal) => signal.source === "contextual").reduce((sum, signal) => sum + signal.contribution, 0)
    const semanticContribution = signals.filter((signal) => signal.source === "semantic").reduce((sum, signal) => sum + signal.contribution, 0)
    const score = Math.min(0.99, (deterministicScore + contextualScore + semanticContribution) / 100)
    const semanticText = semanticTexts[index + 1]
    const caseContentHash = contentFingerprint(semanticText)

    await db.embeddingRecord.upsert({
      where: {
        entityType_entityId_provider_model_contentHash: {
          entityType: "case_state",
          entityId: lawCase.id,
          provider: embedded.provider,
          model: embedded.model,
          contentHash: caseContentHash,
        },
      },
      update: {},
      create: {
        entityType: "case_state",
        entityId: lawCase.id,
        contentHash: caseContentHash,
        contentPreview: semanticText.slice(0, 500),
        provider: embedded.provider,
        model: embedded.model,
        modelVersion: embedded.modelVersion,
        dimensions: embedded.vectors[index + 1].length,
        vector: embedded.vectors[index + 1] as Prisma.InputJsonValue,
        caseId: lawCase.id,
      },
    })

    return {
      caseId: lawCase.id,
      caseNumber: lawCase.caseNumber,
      clientName: lawCase.clientName,
      caseType: lawCase.caseType,
      score,
      deterministicScore: deterministicScore / 100,
      contextualScore: contextualScore / 100,
      semanticScore,
      signals,
    }
  }))

  return {
    candidates: ranked.sort((left, right) => right.score - left.score),
    semanticFingerprint,
    embeddingProvider: embedded.provider,
  }
}

export function associationStatus(candidates: CandidateCase[]): AssociationStatus {
  const best = candidates[0]
  const runnerUp = candidates[1]
  if (!best || best.score < DEFAULT_ASSOCIATION_THRESHOLDS.noMatch) return "NO_MATCH"
  if (best.score - (runnerUp?.score || 0) < DEFAULT_ASSOCIATION_THRESHOLDS.ambiguousMargin) return "AMBIGUOUS"
  if (best.score >= DEFAULT_ASSOCIATION_THRESHOLDS.autoSuggest) return "AUTO_SUGGEST"
  if (best.score >= DEFAULT_ASSOCIATION_THRESHOLDS.needsReview) return "NEEDS_REVIEW"
  return "NO_MATCH"
}
