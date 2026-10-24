import type { Prisma, PrismaClient } from "@prisma/client"

type JsonRecord = Record<string, unknown>

export type SourceReference = {
  sourceId: string | null
  sourceType: string
  label: string
  documentId?: string | null
  page?: number | null
  excerpt?: string | null
  confidence?: number | null
}

function objectValue(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}
}

function displayValue(value: Prisma.JsonValue): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value)
  const record = objectValue(value)
  for (const key of ["display", "name", "raw", "text", "value", "date", "amount"]) {
    if (typeof record[key] === "string" || typeof record[key] === "number") return String(record[key])
  }
  return JSON.stringify(value)
}

function normalized(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

function sourceLabel(sourceType: string, sourceId: string | null, files: Map<string, { name: string }>, inbox: Map<string, { fileName: string | null; senderName: string | null }>) {
  if (sourceId && files.has(sourceId)) return files.get(sourceId)?.name || "Documento"
  if (sourceId && inbox.has(sourceId)) {
    const item = inbox.get(sourceId)
    return item?.fileName || (item?.senderName ? `Mensagem de ${item.senderName}` : "Entrada recebida")
  }
  const labels: Record<string, string> = { whatsapp: "WhatsApp", email: "E-mail", audio: "Áudio", document: "Documento", upload: "Arquivo enviado", manual: "Registro manual", case_record: "Cadastro do caso" }
  return labels[sourceType] || sourceType || "Fonte não identificada"
}

function factStatus(fact: { fieldName: string; value: Prisma.JsonValue; verifiedAt: Date | null; sourceType: string }) {
  const value = objectValue(fact.value)
  const explicit = String(value.status || "").toLowerCase()
  if (explicit === "confirmed" || explicit === "confirmado" || fact.verifiedAt) return "confirmed"
  if (explicit === "contradictory" || explicit === "contraditorio" || value.conflict === true || normalized(fact.fieldName).includes("conflict")) return "contradictory"
  if (explicit === "alleged" || explicit === "alegado" || value.alleged === true || ["whatsapp", "audio", "text", "client_report"].includes(fact.sourceType)) return "alleged"
  return "pending"
}

function documentCategory(name: string, type: string) {
  const value = normalized(`${name} ${type}`)
  if (/rg|cpf|identidade|cnh/.test(value)) return "Pessoais"
  if (/peticao|processo|sentenca|decisao|intimacao|certidao/.test(value)) return "Processuais"
  if (/contrato|acordo/.test(value)) return "Contratos"
  if (/recibo|comprovante|nota fiscal/.test(value)) return "Comprovantes"
  if (/laudo|relatorio medico|prontuario/.test(value)) return "Laudos"
  if (/matricula|cartorio|registro/.test(value)) return "Registros públicos"
  if (/foto|imagem|png|jpg|jpeg/.test(value)) return "Fotos"
  if (/audio|mp3|wav|m4a/.test(value)) return "Áudios"
  if (/email|whatsapp|mensagem/.test(value)) return "Comunicações"
  return "Outros"
}

function riskRank(value: string) {
  return ({ critical: 4, urgent: 4, high: 3, medium: 2, low: 1 } as Record<string, number>)[value] || 0
}

export async function buildCaseOperationalView(db: PrismaClient, caseId: string, workspaceId: string) {
  const lawCase = await db.case.findFirst({
    where: { id: caseId, workspaceId },
    include: {
      state: true,
      files: { orderBy: { uploadedAt: "desc" } },
      events: { orderBy: { occurredAt: "desc" } },
      facts: { where: { archivedAt: null }, orderBy: { extractedAt: "desc" } },
      dataChanges: { orderBy: { createdAt: "desc" }, take: 20 },
      informationGaps: { orderBy: { createdAt: "desc" } },
      aiTasks: { orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }] },
      emails: { orderBy: { createdAt: "desc" } },
      textMessages: { orderBy: { createdAt: "desc" } },
      phoneCalls: { orderBy: { createdAt: "desc" } },
      reasonChains: { orderBy: { timestamp: "desc" } },
      inboxItems: {
        orderBy: { receivedAt: "desc" },
        take: 50,
        include: { proposedChanges: { orderBy: { createdAt: "asc" } }, storedObjects: true },
      },
      proposedChanges: { orderBy: { createdAt: "desc" }, take: 100 },
    },
  })
  if (!lawCase) return null

  const fileMap = new Map(lawCase.files.map((file) => [file.id, file]))
  const inboxMap = new Map(lawCase.inboxItems.map((item) => [item.id, item]))
  const source = (sourceType: string, sourceId: string | null, page?: number | null, excerpt?: string | null, confidence?: number | null): SourceReference => ({
    sourceId,
    sourceType,
    label: sourceLabel(sourceType, sourceId, fileMap, inboxMap),
    documentId: sourceId && fileMap.has(sourceId) ? sourceId : null,
    page: page || null,
    excerpt: excerpt || null,
    confidence: confidence ?? null,
  })

  const facts = lawCase.facts.map((fact) => ({
    id: fact.id,
    dataId: `fact:${fact.id}`,
    removable: true,
    fieldName: fact.fieldName,
    label: fact.fieldName.replaceAll("_", " "),
    value: displayValue(fact.value),
    rawValue: fact.value,
    status: factStatus(fact),
    confidence: fact.confidence,
    humanVerified: Boolean(fact.verifiedAt),
    verifiedBy: fact.verifiedBy,
    verifiedAt: fact.verifiedAt,
    extractedAt: fact.extractedAt,
    source: source(fact.sourceType, fact.sourceId, fact.sourcePage, fact.sourceExcerpt, fact.confidence),
  }))

  const contradictionGroups = new Map<string, typeof facts>()
  for (const fact of facts) {
    const key = normalized(fact.fieldName)
    contradictionGroups.set(key, [...(contradictionGroups.get(key) || []), fact])
  }
  const contradictions = [...contradictionGroups.entries()].flatMap(([fieldName, group]) => {
    const distinct = new Set(group.map((fact) => normalized(fact.value)))
    const explicit = group.some((fact) => fact.status === "contradictory")
    if (distinct.size < 2 && !explicit) return []
    return [{
      id: `contradiction-${fieldName}`,
      title: `Informações divergentes sobre ${group[0].label}`,
      confidence: Math.max(...group.map((fact) => fact.confidence || 0)),
      values: group.map((fact) => ({ value: fact.value, source: fact.source })),
      action: "Revisar as fontes; o sistema não escolheu automaticamente qual informação está correta.",
    }]
  })

  const impacts = facts.filter((fact) => /impact|prejuizo|renda|emocional|medo|inseguranca|dano|famil|profission|impossibilidade/.test(normalized(`${fact.fieldName} ${fact.label}`)))
    .map((fact) => ({ ...fact, kind: fact.status === "confirmed" ? "confirmed" : "client_report" }))

  const duplicateKeys = new Map<string, number>()
  lawCase.files.forEach((file) => {
    const key = normalized(`${file.name}|${file.size}`)
    duplicateKeys.set(key, (duplicateKeys.get(key) || 0) + 1)
  })
  const documents = lawCase.files.map((file) => {
    const extracted = facts.filter((fact) => fact.source.sourceId === file.id || fact.source.documentId === file.id)
    return {
      ...file,
      category: documentCategory(file.name, file.type),
      processingStatus: extracted.length ? "processed" : "not_processed",
      extractedInformation: extracted,
      important: extracted.some((fact) => fact.status === "confirmed" || (fact.confidence || 0) >= 0.85),
      hasConflict: extracted.some((fact) => fact.status === "contradictory"),
      duplicate: (duplicateKeys.get(normalized(`${file.name}|${file.size}`)) || 0) > 1,
      pageCount: Math.max(0, ...extracted.map((fact) => fact.source.page || 0)) || null,
    }
  })

  const timeline = [
    ...lawCase.events.map((event) => ({ id: `event-${event.id}`, date: event.occurredAt, kind: "event", title: event.title, description: event.description, risk: objectValue(event.metadata).riskLevel || "medium", confidence: event.confidence, reviewStatus: "official", source: source(event.sourceType, event.sourceId, null, event.description, event.confidence) })),
    ...lawCase.files.map((file) => ({ id: `file-${file.id}`, date: file.uploadedAt, kind: "document", title: file.name, description: `Documento recebido · ${file.type}`, risk: "low", confidence: null, reviewStatus: "received", source: source("document", file.id) })),
    ...lawCase.emails.map((email) => ({ id: `email-${email.id}`, date: email.createdAt, kind: "email", title: email.subject, description: `${email.from} → ${email.to}`, risk: "low", confidence: null, reviewStatus: "recorded", source: source("email", email.id, null, email.content.slice(0, 240)) })),
    ...lawCase.textMessages.map((message) => ({ id: `text-${message.id}`, date: message.createdAt, kind: "message", title: "Mensagem registrada", description: message.text, risk: "low", confidence: null, reviewStatus: "recorded", source: source("text", message.id, null, message.text.slice(0, 240)) })),
    ...lawCase.phoneCalls.map((call) => ({ id: `call-${call.id}`, date: call.createdAt, kind: "call", title: `Chamada · ${call.status}`, description: call.message, risk: "low", confidence: null, reviewStatus: "recorded", source: source("call", call.id, null, call.message.slice(0, 240)) })),
    ...lawCase.aiTasks.filter((task) => task.completedAt).map((task) => ({ id: `task-${task.id}`, date: task.completedAt as Date, kind: "task", title: `Tarefa concluída: ${task.title}`, description: task.description, risk: task.priority, confidence: null, reviewStatus: "completed", source: source("task", task.id, null, task.reasoning) })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime())

  const pendingTasks = lawCase.aiTasks.filter((task) => !["completed", "dismissed"].includes(task.status))
  const openGaps = lawCase.informationGaps.filter((gap) => gap.status === "open")
  const pendingReview = lawCase.proposedChanges.filter((change) => change.status === "pending")
  const risks = [
    ...contradictions.map((item) => ({ id: item.id, level: "high", title: item.title, reason: "Duas ou mais fontes apresentam valores diferentes.", source: item.values[0]?.source })),
    ...openGaps.filter((gap) => gap.priority === "high").map((gap) => ({ id: `gap-${gap.id}`, level: "high", title: gap.title, reason: gap.description || "Informação importante ainda ausente.", source: source("information_gap", gap.sourceEventId) })),
    ...pendingTasks.filter((task) => task.category === "deadline" || task.priority === "high").map((task) => ({ id: `task-${task.id}`, level: task.category === "deadline" ? "high" : task.priority, title: task.title, reason: task.reasoning || task.description, source: source("task", task.relatedTo) })),
    ...pendingReview.filter((change) => ["high", "critical"].includes(change.riskLevel)).map((change) => ({ id: `change-${change.id}`, level: change.riskLevel, title: String(objectValue(change.payload).title || "Alteração aguardando revisão"), reason: change.policyDecision || "Revisão humana obrigatória", source: source(change.sourceType || "unknown", change.sourceId, change.sourcePage, change.sourceExcerpt, change.confidence) })),
  ].sort((a, b) => riskRank(b.level) - riskRank(a.level))
  const priorityRisks = risks
    .filter((risk) => riskRank(risk.level) >= 3)
    .filter((risk, index, list) => list.findIndex((candidate) => normalized(candidate.title) === normalized(risk.title)) === index)
    .slice(0, 3)

  const nextTask = [...pendingTasks].sort((a, b) => {
    const dueA = a.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER
    const dueB = b.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER
    return dueA - dueB || riskRank(b.priority) - riskRank(a.priority)
  })[0]
  const nextGap = openGaps.sort((a, b) => riskRank(b.priority) - riskRank(a.priority))[0]
  const nextBestAction = nextTask ? {
    title: nextTask.title, reason: nextTask.reasoning || nextTask.description, risk: nextTask.priority, status: nextTask.status, source: { type: "task", id: nextTask.id },
  } : nextGap ? {
    title: `Obter: ${nextGap.title}`, reason: nextGap.description || "Informação necessária para avançar o caso.", risk: nextGap.priority, status: "suggested", source: { type: "information_gap", id: nextGap.id },
  } : {
    title: lawCase.nextAction || "Revisar o caso e definir a próxima ação", reason: "Próxima ação registrada no caso.", risk: "medium", status: "suggested", source: { type: "case_record", id: lawCase.id },
  }

  const latestInbox = lawCase.inboxItems[0]
  const latestChanges = latestInbox?.proposedChanges || []
  const changes = {
    sourceInboxItemId: latestInbox?.id || null,
    receivedAt: latestInbox?.receivedAt || null,
    alreadyKnown: facts.filter((fact) => !latestInbox || fact.extractedAt < latestInbox.receivedAt).slice(0, 4),
    newInformation: latestChanges.filter((change) => ["FACT", "EVENT"].includes(change.type)).map((change) => ({ id: change.id, type: change.type, status: change.status, title: String(objectValue(change.payload).title || objectValue(change.payload).fieldName || "Nova informação"), source: source(change.sourceType || latestInbox?.sourceType || "unknown", change.sourceId, change.sourcePage, change.sourceExcerpt, change.confidence) })),
    altered: latestChanges.filter((change) => change.type === "FACT" && objectValue(change.payload).conflict === true),
    contradictions: contradictions.slice(0, 3),
    resolvedGaps: latestChanges.filter((change) => change.type === "GAP_RESOLUTION"),
    newGaps: latestChanges.filter((change) => change.type === "GAP"),
  }

  const summarySources = Array.isArray(lawCase.state?.summarySourceRefs) ? lawCase.state.summarySourceRefs : [{ sourceType: "case_record", sourceId: lawCase.id, label: "Cadastro do caso" }]
  const summaryWarnings = Array.isArray(lawCase.state?.summaryWarnings) ? lawCase.state.summaryWarnings : []
  if (facts.some((fact) => fact.status !== "confirmed") && !summaryWarnings.length) summaryWarnings.push("Existem informações ainda não verificadas no caso.")
  const evidenceSources = [...new Map([
    ...facts.map((fact) => fact.source),
    ...timeline.map((item) => item.source),
    ...documents.map((document) => source("document", document.id)),
  ].map((item) => [`${item.sourceType}:${item.sourceId || item.label}`, item])).values()]

  return {
    case: {
      id: lawCase.id, caseNumber: lawCase.caseNumber, clientName: lawCase.clientName, clientEmail: lawCase.clientEmail,
      clientPhone: lawCase.clientPhone, clientDob: lawCase.clientDob, caseType: lawCase.caseType, status: lawCase.status,
      priority: lawCase.priority, assignedTo: lawCase.assignedTo, createdAt: lawCase.createdAt, lastActivity: lawCase.lastActivity,
      description: lawCase.description, nextAction: lawCase.nextAction,
    },
    summary: {
      text: lawCase.state?.summary || lawCase.description,
      stage: lawCase.state?.stage || lawCase.status,
      healthScore: lawCase.state?.healthScore,
      updatedAt: lawCase.state?.summaryUpdatedAt || lawCase.state?.lastComputedAt || lawCase.lastActivity,
      generatedBy: lawCase.state?.summaryGeneratedBy || "case_record",
      sources: summarySources,
      warnings: summaryWarnings,
    },
    stats: { documents: documents.length, pendingTasks: pendingTasks.length, openGaps: openGaps.length, alerts: priorityRisks.length, pendingReviews: pendingReview.length },
    primaryData: {
      client: [
        { dataId: "case:clientName", removable: false, label: "Nome", value: lawCase.clientName, source: source("case_record", lawCase.id), status: "confirmed" },
        { dataId: "case:clientDob", removable: true, label: "Data de nascimento", value: lawCase.clientDob, source: source("case_record", lawCase.id), status: "pending" },
        { dataId: "case:clientPhone", removable: true, label: "Telefone", value: lawCase.clientPhone, source: source("case_record", lawCase.id), status: lawCase.clientPhone ? "pending" : "missing" },
        { dataId: "case:clientEmail", removable: true, label: "E-mail", value: lawCase.clientEmail, source: source("case_record", lawCase.id), status: lawCase.clientEmail ? "pending" : "missing" },
      ],
      extracted: facts,
    },
    dataChanges: lawCase.dataChanges,
    facts,
    impacts,
    timeline,
    risks: priorityRisks,
    contradictions,
    gaps: lawCase.informationGaps.map((gap) => ({ ...gap, source: source("information_gap", gap.sourceEventId), responsible: null })),
    documents,
    tasks: lawCase.aiTasks,
    nextBestAction,
    changes,
    intelligence: lawCase.reasonChains,
    evidenceSources,
    documentSummary: {
      analyzed: documents.filter((document) => document.processingStatus === "processed").length,
      total: documents.length,
      people: facts.filter((fact) => /person|party|client|witness|name|nome|parte|herdeir/.test(normalized(fact.fieldName))).length,
      dates: facts.filter((fact) => /date|data/.test(normalized(fact.fieldName))).length,
      values: facts.filter((fact) => /amount|value|valor/.test(normalized(fact.fieldName))).length,
      contradictions: contradictions.length,
      missingInformation: openGaps.length,
    },
    documentContext: {
      confirmedData: facts.filter((fact) => fact.status === "confirmed"),
      allegedData: facts.filter((fact) => fact.status === "alleged"),
      timeline,
      documents: documents.map(({ id, name, type, category, extractedInformation }) => ({ id, name, type, category, extractedInformation })),
      gaps: openGaps,
      sources: facts.map((fact) => fact.source),
    },
  }
}

export async function regenerateCaseSummary(db: PrismaClient, caseId: string, workspaceId: string, generatedBy: string) {
  const view = await buildCaseOperationalView(db, caseId, workspaceId)
  if (!view) return null
  const confirmed = view.facts.filter((fact) => fact.status === "confirmed").slice(0, 4)
  const alleged = view.facts.filter((fact) => fact.status === "alleged").slice(0, 2)
  const parts = [
    `${view.case.clientName} possui um caso de ${view.case.caseType.toLowerCase()}, atualmente ${view.case.status === "closed" ? "encerrado" : "em acompanhamento"}.`,
    view.case.description,
    confirmed.length ? `Dados confirmados: ${confirmed.map((fact) => `${fact.label}: ${fact.value}`).join("; ")}.` : "Ainda não há fatos marcados como confirmados.",
    alleged.length ? `Relatos ainda não verificados: ${alleged.map((fact) => `${fact.label}: ${fact.value}`).join("; ")}.` : "",
    view.gaps.filter((gap) => gap.status === "open").length ? `Ainda é necessário esclarecer ${view.gaps.filter((gap) => gap.status === "open").slice(0, 3).map((gap) => gap.title).join(", ")}.` : "",
    `Próxima ação operacional: ${view.nextBestAction.title}.`,
  ].filter(Boolean)
  const sources = [
    { sourceType: "case_record", sourceId: view.case.id, label: "Cadastro do caso" },
    ...confirmed.map((fact) => fact.source),
    ...alleged.map((fact) => fact.source),
  ]
  const warnings = alleged.length || view.facts.some((fact) => fact.status === "pending")
    ? ["O resumo contém informações não verificadas, identificadas separadamente dos fatos confirmados."]
    : []
  return db.caseState.upsert({
    where: { caseId },
    update: { summary: parts.join(" "), summarySourceRefs: sources as Prisma.InputJsonValue, summaryWarnings: warnings, summaryGeneratedBy: generatedBy, summaryUpdatedAt: new Date(), lastComputedAt: new Date(), version: { increment: 1 } },
    create: { caseId, stage: view.case.status, summary: parts.join(" "), summarySourceRefs: sources as Prisma.InputJsonValue, summaryWarnings: warnings, summaryGeneratedBy: generatedBy, summaryUpdatedAt: new Date(), healthScore: 70 },
  })
}

export async function searchCaseEvidence(db: PrismaClient, caseId: string, workspaceId: string, question: string) {
  const view = await buildCaseOperationalView(db, caseId, workspaceId)
  if (!view) return null
  const stop = new Set(["qual", "quais", "quando", "onde", "como", "cliente", "existe", "sobre", "ainda", "foram", "foi", "uma", "para", "com", "que", "dos", "das"])
  const tokens = normalized(question).split(/[^a-z0-9]+/).filter((token) => token.length > 2 && !stop.has(token))
  const candidates = [
    ...view.facts.map((fact) => ({ kind: "fact", title: fact.label, text: `${fact.label} ${fact.value} ${fact.source.excerpt || ""}`, source: fact.source, confidence: fact.confidence, status: fact.status })),
    ...view.timeline.map((item) => ({ kind: item.kind, title: item.title, text: `${item.title} ${item.description || ""}`, source: item.source, confidence: item.confidence, status: item.reviewStatus })),
    ...view.gaps.filter((gap) => gap.status === "open").map((gap) => ({ kind: "gap", title: gap.title, text: `${gap.title} ${gap.description || ""} ${gap.suggestedQuestion || ""}`, source: gap.source, confidence: null, status: gap.status })),
    ...view.documents.map((document) => ({ kind: "document", title: document.name, text: `${document.name} ${document.type} ${document.category}`, source: { sourceId: document.id, sourceType: "document", label: document.name, documentId: document.id }, confidence: null, status: document.processingStatus })),
  ]
  const minimumScore = Math.max(1, Math.ceil(tokens.length * 0.5))
  const matches = candidates.map((candidate) => ({
    ...candidate,
    score: tokens.reduce((score, token) => score + (normalized(candidate.text).includes(token) ? 1 : 0), 0),
  })).filter((candidate) => candidate.score >= minimumScore).sort((a, b) => b.score - a.score).slice(0, 8)
  return {
    question,
    answer: matches.length ? "Encontrei estas informações nas fontes do caso:" : "Não encontrei evidência suficiente.",
    matches,
  }
}
