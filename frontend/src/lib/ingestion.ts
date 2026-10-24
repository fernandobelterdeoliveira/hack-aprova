import type { InboxItem, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { extractStructuredChanges } from "@/lib/structured-extraction"
import { contentFingerprint } from "@/lib/ingestion-hash"
import { buildAssociationCandidates } from "@/lib/ai/association"
import { routeDecision } from "@/lib/ai/decision-router"
import { CaseIntelligenceAgent, proposalPayload } from "@/lib/ai/case-intelligence"
import { evaluatePolicy } from "@/lib/ai/policy-engine"

type ProposedChangeInput = {
  type: "FACT" | "EVENT" | "TASK" | "GAP" | "GAP_RESOLUTION" | "DEADLINE"
  payload: Prisma.InputJsonValue
  confidence: number
  riskLevel: "low" | "medium" | "high" | "critical"
  provider?: string
  model?: string
  modelVersion?: string | null
  promptVersion?: string
  extractorVersion?: string
  aiExecutionId?: string
}

const LOCAL_MODEL = "deterministic-rules"
const LOCAL_PROMPT_VERSION = "rules-v1"
const LOCAL_EXTRACTOR_VERSION = "1.0.0"
const LOCAL_PROCESSING_VERSION = "ingestion-v2"

function normalize(value?: string | null) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}


function buildChanges(item: InboxItem, classification: string): ProposedChangeInput[] {
  const content = item.rawContent.trim()
  const normalized = normalize(content)
  const excerpt = content.slice(0, 500)
  const treatmentStarted = /comecei|iniciei|started|begin|primeira sessao/.test(normalized)
    && /fisioterapia|physical therapy|tratamento/.test(normalized)
  const changes: ProposedChangeInput[] = [{
    type: "EVENT",
    confidence: 0.88,
    riskLevel: "medium",
    payload: {
      eventType: classification,
      title: treatmentStarted ? "Início de fisioterapia" : classification === "medical_update" ? "Atualização de tratamento médico" : classification === "document" ? "Documento recebido" : "Informação recebida do cliente",
      description: excerpt,
      occurredAt: item.receivedAt.toISOString(),
      sourceType: item.sourceType,
      sourceId: item.id,
      evidence: { source: item.sourceType, sourceId: item.id, excerpt },
    },
  }]

  const money = content.match(/(?:R\$|\$)\s?([0-9][0-9.,]*)/)
  if (money) {
    changes.push({
      type: "FACT",
      confidence: 0.82,
      riskLevel: "medium",
      payload: {
        fieldName: "mentioned_amount",
        value: { raw: money[0], currency: money[0].includes("R$") ? "BRL" : "USD" },
        sourceType: item.sourceType,
        sourceId: item.id,
        sourceExcerpt: excerpt,
        evidence: { source: item.sourceType, sourceId: item.id, excerpt },
      },
    })
  }

  const providerNamed = /clinica|clinic|hospital|dr\.?\s|dra\.?\s|doctor|provider/.test(normalized)

  if (treatmentStarted && !providerNamed) {
    changes.push({
      type: "GAP",
      confidence: 0.9,
      riskLevel: "medium",
      payload: {
        title: "Prestador do tratamento não identificado",
        description: "O cliente informou que iniciou o tratamento, mas não identificou a clínica ou o profissional.",
        priority: "high",
        suggestedQuestion: "Qual é o nome e o contato da clínica ou do profissional?",
        sourceEventId: item.id,
        evidence: { source: item.sourceType, sourceId: item.id, excerpt },
      },
    })
    changes.push({
      type: "TASK",
      confidence: 0.9,
      riskLevel: "low",
      payload: {
        title: "Solicitar dados do prestador do tratamento",
        description: "Pedir ao cliente o nome da clínica, os dados de contato e a data do primeiro atendimento.",
        priority: "high",
        category: "follow-up",
        reasoning: "Informações necessárias para solicitar os registros e manter a linha do tempo do tratamento completa.",
        evidence: { source: item.sourceType, sourceId: item.id, excerpt },
      },
    })
  }

  const dateMatch = content.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/)
  if (dateMatch && /deadline|hearing|court|prazo|audiencia/.test(normalized)) {
    changes.push({
      type: "DEADLINE",
      confidence: 0.78,
      riskLevel: "high",
      payload: {
        title: "Revisar possível prazo jurídico",
        description: `Possível prazo mencionado na fonte: ${dateMatch[0]}`,
        rawDate: dateMatch[0],
        priority: "high",
        category: "deadline",
        reasoning: "Datas com consequências jurídicas exigem validação do advogado antes de entrar no calendário oficial.",
        evidence: { source: item.sourceType, sourceId: item.id, excerpt },
      },
    })
  }

  return changes
}

type ProcessingContext = {
  workspaceId?: string
  signal?: AbortSignal
  onProgress?: (progress: number, message: string) => Promise<void>
}

function assertNotCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("Processamento cancelado")
}

export async function processInboxItem(itemId: string, context: ProcessingContext = {}) {
  const progress = async (value: number, message: string) => {
    assertNotCancelled(context.signal)
    await context.onProgress?.(value, message)
  }
  const item = await prisma.inboxItem.findFirst({ where: { id: itemId, ...(context.workspaceId ? { workspaceId: context.workspaceId } : {}) } })
  if (!item) throw new Error("Item da caixa de entrada não encontrado")

  await prisma.inboxItem.update({ where: { id: itemId }, data: { processingStatus: "processing", errorMessage: null } })

  try {
    await progress(10, "Identificando possíveis casos")
    const association = await buildAssociationCandidates(prisma, item)
    await progress(25, "Classificando entrada e avaliando risco")
    const routed = await routeDecision(prisma, {
      inboxItemId: item.id,
      text: item.rawContent,
      sender: { name: item.senderName, email: item.senderEmail, phone: item.senderPhone },
      candidateCases: association.candidates,
      deterministicSignals: association.candidates[0]?.signals || [],
      sourceType: item.sourceType,
      fileName: item.fileName,
    })
    const decision = routed.decision
    const best = association.candidates.find((candidate) => candidate.caseId === decision.suggestedCaseId)
      || association.candidates[0]
    const classification = decision.messageType
    let extractionError: string | null = null
    await progress(40, "Extraindo informações estruturadas")
    const remoteExtraction = await extractStructuredChanges(item, { signal: context.signal }).catch((error) => {
      assertNotCancelled(context.signal)
      extractionError = error instanceof Error ? error.message : "O extrator estruturado falhou"
      return null
    })
    const localChanges = buildChanges(item, classification).map((change) => ({
      ...change,
      provider: "deterministic",
      model: LOCAL_MODEL,
      modelVersion: LOCAL_EXTRACTOR_VERSION,
      promptVersion: LOCAL_PROMPT_VERSION,
      extractorVersion: LOCAL_EXTRACTOR_VERSION,
    }))
    const remoteChanges: ProposedChangeInput[] = remoteExtraction
      ? remoteExtraction.changes.map((change) => ({
          ...change,
          payload: change.payload as Prisma.InputJsonValue,
          provider: "python-extractor",
          model: remoteExtraction.model,
          modelVersion: remoteExtraction.model,
          promptVersion: remoteExtraction.promptVersion,
          extractorVersion: remoteExtraction.extractorVersion,
        }))
      : []
    const remoteTypes = new Set(remoteChanges.map((change) => change.type))
    let changes: ProposedChangeInput[] = remoteExtraction
      ? [...remoteChanges, ...localChanges.filter((change) => !remoteTypes.has(change.type))]
      : localChanges

    if (decision.requiresDeepReasoning && decision.suggestedCaseId) {
      await progress(60, "Executando análise aprofundada do caso")
      const intelligence = await new CaseIntelligenceAgent(prisma).analyze({
        caseId: decision.suggestedCaseId,
        inboxItemId: item.id,
        objective: "Analise as novas informações recebidas e determine o que mudou neste caso.",
        sourceType: item.sourceType,
        text: item.rawContent,
        signal: context.signal,
      })
      const intelligenceExecution = await prisma.aIExecution.create({
        data: {
          provider: intelligence.provider,
          model: intelligence.model,
          modelVersion: intelligence.modelVersion,
          promptVersion: "case-intelligence-v1",
          workflowVersion: "case-intelligence-tools-v1",
          inputHash: contentFingerprint({ caseId: decision.suggestedCaseId, inboxItemId: item.id, text: item.rawContent }),
          outputHash: contentFingerprint(intelligence.proposals),
          input: { objective: "determine_case_changes", inboxItemId: item.id },
          output: {
            proposals: intelligence.proposals as Prisma.InputJsonValue,
            uncertainty: intelligence.uncertainty,
            requiresHumanReview: intelligence.requiresHumanReview,
          },
          latencyMs: intelligence.latencyMs,
          tokenUsage: intelligence.tokenUsage as Prisma.InputJsonValue | undefined,
          status: "completed",
          completedAt: new Date(),
          caseId: decision.suggestedCaseId,
          inboxItemId: item.id,
        },
      })
      changes = [
        ...changes,
        ...intelligence.proposals.map((proposal): ProposedChangeInput => ({
          type: proposal.type,
          payload: proposalPayload(proposal),
          confidence: proposal.confidence,
          riskLevel: proposal.riskLevel,
          provider: intelligence.provider,
          model: intelligence.model,
          modelVersion: intelligence.modelVersion,
          promptVersion: "case-intelligence-v1",
          extractorVersion: "case-intelligence-tools-v1",
          aiExecutionId: intelligenceExecution.id,
        })),
      ]
    }

    const uniqueChanges = [...new Map(changes.map((change) => [
      contentFingerprint({ type: change.type, payload: change.payload }),
      change,
    ])).values()]
    await progress(78, "Registrando interpretação e políticas")
    const processingRun = await prisma.inboxProcessingRun.create({
      data: {
        inboxItemId: item.id,
        model: remoteExtraction?.model || LOCAL_MODEL,
        promptVersion: remoteExtraction?.promptVersion || LOCAL_PROMPT_VERSION,
        extractorVersion: remoteExtraction?.extractorVersion || LOCAL_EXTRACTOR_VERSION,
        processingVersion: remoteExtraction?.processingVersion || LOCAL_PROCESSING_VERSION,
        status: "completed",
        completedAt: remoteExtraction ? new Date(remoteExtraction.processedAt) : new Date(),
        output: {
          changes: uniqueChanges as Prisma.InputJsonValue,
          fallbackUsed: remoteExtraction?.fallbackUsed ?? true,
          fallbackReason: extractionError,
          routingExecutionId: routed.executionId,
          routingFallbackUsed: routed.fallbackUsed,
        },
      },
    })

    await prisma.$transaction(async (transaction) => {
      await transaction.proposedCaseChange.updateMany({
        where: { inboxItemId: item.id, status: "pending" },
        data: { status: "superseded" },
      })
      if (decision.suggestedCaseId && best?.caseId) {
        await transaction.proposedCaseChange.createMany({
          data: uniqueChanges.map((change) => {
            const payload = payloadRecord(change.payload as Prisma.JsonValue)
            const evidence = payloadRecord((payload.evidence || {}) as Prisma.JsonValue)
            const policy = evaluatePolicy({
              changeType: change.type,
              declaredRisk: change.riskLevel,
              sourceId: textValue(evidence.sourceId),
              sourceType: textValue(evidence.source),
              excerpt: textValue(evidence.excerpt),
              title: textValue(payload.title),
              description: textValue(payload.description),
            })
            return {
            inboxItemId: item.id,
            processingRunId: processingRun.id,
            caseId: best.caseId,
            type: change.type,
            payload: change.payload,
            fingerprint: contentFingerprint({ type: change.type, payload: change.payload }),
            confidence: Math.min(change.confidence, Math.max(decision.associationConfidence, 0.5)),
            riskLevel: policy.riskLevel,
            requiresReview: policy.requiresHumanReview,
            sourceId: textValue(evidence.sourceId) || null,
            sourceType: textValue(evidence.source) || null,
            documentId: textValue(evidence.documentId) || null,
            sourcePage: typeof evidence.page === "number" ? evidence.page : null,
            sourceExcerpt: textValue(evidence.excerpt) || null,
            provider: change.provider || decision.provider,
            model: change.model || decision.model,
            modelVersion: change.modelVersion,
            promptVersion: change.promptVersion,
            extractorVersion: change.extractorVersion,
            policyDecision: policy.decision,
            aiExecutionId: change.aiExecutionId || routed.executionId,
          }}),
        })
      }
      await transaction.inboxItem.update({
        where: { id: item.id },
        data: {
          detectedCaseId: decision.suggestedCaseId,
          associationConfidence: decision.associationConfidence,
          semanticFingerprint: association.semanticFingerprint,
          associationSignals: {
            autoAssociated: false,
            status: decision.associationStatus,
            thresholds: {
              AUTO_SUGGEST: Number(process.env.ASSOCIATION_AUTO_SUGGEST || 0.85),
              NEEDS_REVIEW: Number(process.env.ASSOCIATION_NEEDS_REVIEW || 0.6),
              AMBIGUOUS_MARGIN: Number(process.env.ASSOCIATION_AMBIGUOUS_MARGIN || 0.12),
              NO_MATCH: Number(process.env.ASSOCIATION_NO_MATCH || 0.35),
            },
            embeddingProvider: association.embeddingProvider,
            candidates: association.candidates.slice(0, 3),
            routingSignals: decision.reasoningSignals,
          },
          classification,
          riskLevel: decision.riskLevel,
          requiresDeepReasoning: decision.requiresDeepReasoning,
          requiresHumanReview: true,
          decisionProvider: decision.provider,
          processingStatus: "completed",
          reviewStatus: decision.associationStatus === "AUTO_SUGGEST" ? "ready" : "needs_association",
        },
      })
    })

    await progress(95, "Preparando entrada para revisão humana")

    return prisma.inboxItem.findUnique({
      where: { id: item.id },
      include: {
        detectedCase: { select: { id: true, caseNumber: true, clientName: true, caseType: true } },
        proposedChanges: { orderBy: { createdAt: "asc" } },
        processingRuns: { orderBy: { startedAt: "desc" }, take: 1 },
        aiExecutions: { orderBy: { startedAt: "desc" }, take: 10 },
      },
    })
  } catch (error) {
    await prisma.inboxItem.update({
      where: { id: item.id },
      data: { processingStatus: "failed", errorMessage: error instanceof Error ? error.message : "Erro de processamento desconhecido" },
    })
    throw error
  }
}

function payloadRecord(value: Prisma.JsonValue) {
  if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("Dados da alteração proposta são inválidos")
  return value as Record<string, Prisma.JsonValue>
}

function textValue(value: Prisma.JsonValue | undefined, fallback = "") {
  return typeof value === "string" ? value : fallback
}

export async function applyInboxItem(itemId: string, caseId: string, changeIds?: string[], decidedBy = "current-user") {
  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT "id" FROM "InboxItem" WHERE "id" = ${itemId} FOR UPDATE`
    const item = await transaction.inboxItem.findUnique({
      where: { id: itemId },
      include: { proposedChanges: { where: { status: "pending" } } },
    })
    if (!item) throw new Error("Item da caixa de entrada não encontrado")
    const outgoing: Array<{ticketId:string;messageId:string}> = []

    const selected = item.proposedChanges.filter((change) => !changeIds || changeIds.includes(change.id))
    const now = new Date()
    for (const change of selected) {
      const payload = payloadRecord(change.payload)
      const evidence = payload.evidence && !Array.isArray(payload.evidence) && typeof payload.evidence === "object"
        ? payload.evidence as Record<string, Prisma.JsonValue>
        : {}
      const policy = evaluatePolicy({
        changeType: change.type,
        declaredRisk: change.riskLevel,
        sourceId: change.sourceId || textValue(evidence.sourceId),
        sourceType: change.sourceType || textValue(evidence.source),
        excerpt: change.sourceExcerpt || textValue(evidence.excerpt),
        title: textValue(payload.title),
        description: textValue(payload.description),
      })
      if (!policy.canApplyAfterReview) {
        throw new Error(`Alteração ${change.id} bloqueada pela política: ${policy.reasons.join("; ")}`)
      }
      const deduplicationKey = contentFingerprint({ caseId, type: change.type, fingerprint: change.fingerprint })
      const fresh=await transaction.proposedCaseChange.findUniqueOrThrow({where:{id:change.id}})
      if(fresh.status!=="pending")continue
      if(payload.municipalAction === "send_message") {
        const target=await transaction.case.findUniqueOrThrow({where:{id:caseId}})
        const message=await transaction.municipalTicketMessage.findFirst({where:{id:textValue(payload.messageId),ticketId:textValue(payload.ticketId),workspaceId:item.workspaceId,ticket:{processId:target.municipalProcessId||"unlinked"}}})
        if(!message)throw new Error("A mensagem sugerida não pertence ao município selecionado.")
        const ticket=await transaction.municipalTicket.findUniqueOrThrow({where:{id:message.ticketId}})
        if(message.formVersionId&&message.formVersionId!==ticket.currentVersionId)throw new Error("Este formulário foi substituído. Revise a versão atual no Ticket.")
        if(message.deliveryStatus==="awaiting_approval"){
          await transaction.municipalTicketMessage.update({where:{id:message.id},data:{deliveryStatus:ticket.connectorAccountId?"pending":"internal",metadata:{...payloadRecord(message.metadata),approvedBy:decidedBy,approvedAt:now.toISOString()}}})
        }
        if(message.deliveryStatus==="awaiting_approval"||message.deliveryStatus==="pending")outgoing.push({ticketId:ticket.id,messageId:message.id})
      } else if (change.type === "EVENT") {
        await transaction.caseEvent.upsert({ where: { deduplicationKey }, update: {}, create: {
          caseId,
          eventType: textValue(payload.eventType, "update"),
          title: textValue(payload.title, "Atualização do caso"),
          description: textValue(payload.description) || null,
          occurredAt: new Date(textValue(payload.occurredAt, item.receivedAt.toISOString())),
          sourceType: change.sourceType || textValue(payload.sourceType, textValue(evidence.source, item.sourceType)),
          sourceId: change.sourceId || textValue(payload.sourceId, textValue(evidence.sourceId, item.id)),
          confidence: change.confidence,
          metadata: { inboxItemId: item.id },
          deduplicationKey,
        } })
      } else if (change.type === "FACT") {
        await transaction.caseFact.upsert({ where: { deduplicationKey }, update: {}, create: {
          caseId,
          fieldName: textValue(payload.fieldName, "extracted_fact"),
          value: (payload.value ?? {}) as Prisma.InputJsonValue,
          sourceType: change.sourceType || textValue(payload.sourceType, textValue(evidence.source, item.sourceType)),
          sourceId: change.sourceId || textValue(payload.sourceId, textValue(evidence.sourceId, item.id)),
          sourcePage: change.sourcePage ?? (typeof evidence.page === "number" ? evidence.page : null),
          sourceExcerpt: change.sourceExcerpt || textValue(payload.sourceExcerpt, textValue(evidence.excerpt)) || null,
          confidence: change.confidence,
          deduplicationKey,
        } })
      } else if (change.type === "GAP") {
        await transaction.informationGap.upsert({ where: { deduplicationKey }, update: {}, create: {
          caseId,
          title: textValue(payload.title, "Informação ausente"),
          description: textValue(payload.description) || null,
          priority: textValue(payload.priority, "medium"),
          suggestedQuestion: textValue(payload.suggestedQuestion) || null,
          sourceEventId: item.id,
          deduplicationKey,
        } })
      } else if (change.type === "GAP_RESOLUTION") {
        const gapId = textValue(payload.gapId)
        const gap = await transaction.informationGap.findFirst({ where: { id: gapId, caseId } })
        if (!gap) throw new Error("A lacuna indicada não pertence ao caso selecionado")
        await transaction.informationGap.update({
          where: { id: gap.id },
          data: { status: "resolved", resolvedAt: now, description: textValue(payload.resolution, gap.description || "") },
        })
      } else {
        await transaction.aITask.upsert({ where: { deduplicationKey }, update: {}, create: {
          caseId,
          title: textValue(payload.title, change.type === "DEADLINE" ? "Revisar prazo jurídico" : "Revisar ação sugerida"),
          description: textValue(payload.description),
          priority: textValue(payload.priority, change.type === "DEADLINE" ? "high" : "medium"),
          category: textValue(payload.category, change.type === "DEADLINE" ? "deadline" : "follow-up"),
          createdBy: "ingestion_reconciliation",
          reasoning: textValue(payload.reasoning) || null,
          relatedTo: change.id,
          deduplicationKey,
        } })
      }
      await transaction.proposedCaseChange.update({
        where: { id: change.id },
        data: { caseId, status: "applied", decidedBy, decidedAt: now, appliedAt: now },
      })
    }

    const selectedIds = new Set(selected.map((change) => change.id))
    const rejectedIds = item.proposedChanges.filter((change) => !selectedIds.has(change.id)).map((change) => change.id)
    if (rejectedIds.length) {
      await transaction.proposedCaseChange.updateMany({
        where: { id: { in: rejectedIds } },
        data: { status: "rejected", decidedBy, decidedAt: now },
      })
    }
    await transaction.inboxItem.update({
      where: { id: item.id },
      data: { detectedCaseId: caseId, reviewStatus: "approved" },
    })
    await transaction.case.update({ where: { id: caseId }, data: { lastActivity: now } })
    return { applied: selected.length, rejected: rejectedIds.length, outgoing }
  })
}
