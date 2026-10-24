import { PrismaClient } from "@prisma/client"
import { createHash } from "node:crypto"

process.loadEnvFile?.(".env.local")
const prisma = new PrismaClient()
const caseNumber = "LL-2026-HERDEIROS"
const hash = (value) => createHash("sha256").update(value).digest("hex")

try {
  const existing = await prisma.case.findUnique({ where: { caseNumber } })
  if (existing) {
    console.log(`Caso de teste já existe: ${existing.id}`)
    process.exitCode = 0
  } else {
    const lawCase = await prisma.case.create({
      data: {
        workspaceId: "default-workspace",
        caseNumber,
        clientName: "João Silva",
        clientEmail: "joao.silva@example.test",
        clientPhone: "+55 11 99999-1842",
        clientDob: "1984-06-12",
        caseType: "Disputa sucessória por imóvel",
        status: "active",
        priority: "high",
        assignedTo: "Dra. Ana Martins",
        description: "Disputa entre herdeiros sobre a posse e a divisão de um terreno pertencente ao espólio de Maria Silva.",
        nextAction: "Reunir a documentação faltante e revisar a titularidade do imóvel.",
        state: { create: { stage: "evidence_collection", summary: "João e Marcos divergem sobre o uso e a divisão de um terreno do espólio de Maria Silva. Há relatos e documentos iniciais, mas ainda faltam a matrícula atualizada, o inventário e prova do acordo familiar alegado.", healthScore: 48, summarySourceRefs: [{ sourceType: "case_record", sourceId: caseNumber, label: "Cadastro do caso" }], summaryWarnings: ["A promessa de área específica é uma alegação do cliente ainda não comprovada."], summaryGeneratedBy: "seed", summaryUpdatedAt: new Date() } },
      },
    })

    const files = {}
    for (const item of [
      ["fence", "foto_cerca_12-03.jpg", "image", "2.4 MB"],
      ["registry", "matricula_imovel_2019.pdf", "pdf", "1.1 MB"],
      ["death", "certidao_obito_maria_silva.pdf", "pdf", "640 KB"],
      ["identity", "documento_pessoal_joao.pdf", "pdf", "410 KB"],
      ["audio", "audio_relato_joao_05-10.m4a", "audio", "3.8 MB"],
      ["divergent", "declaracao_vizinho_data_divergente.pdf", "pdf", "520 KB"],
    ]) {
      files[item[0]] = await prisma.files.create({ data: { caseId: lawCase.id, name: item[1], type: item[2], size: item[3], uploadedBy: "Fixture operacional", url: `https://example.test/${item[1]}` } })
    }

    const firstMessage = await prisma.inboxItem.create({ data: {
      workspaceId: "default-workspace", sourceType: "whatsapp", sourceExternalId: `fixture-${lawCase.id}-1`, senderName: "João Silva", senderPhone: "+55 11 99999-1842", receivedAt: new Date("2026-03-12T14:00:00Z"),
      rawContent: "Marcos entrou no terreno no dia 12 de março e mudou a cerca. Minha mãe tinha prometido aquela parte para mim.", contentHash: hash(`${lawCase.id}-message-1`), detectedCaseId: lawCase.id, associationConfidence: 0.99, classification: "case_update", riskLevel: "high", processingStatus: "completed", reviewStatus: "approved",
    } })
    const laterMessage = await prisma.inboxItem.create({ data: {
      workspaceId: "default-workspace", sourceType: "whatsapp", sourceExternalId: `fixture-${lawCase.id}-2`, senderName: "João Silva", senderPhone: "+55 11 99999-1842", receivedAt: new Date("2026-10-05T18:20:00Z"),
      rawContent: "Tivemos outra discussão hoje. Estou inseguro e com medo de voltar ao imóvel.", contentHash: hash(`${lawCase.id}-message-2`), detectedCaseId: lawCase.id, associationConfidence: 0.99, classification: "conflict_update", riskLevel: "high", processingStatus: "completed", reviewStatus: "approved",
    } })

    const facts = [
      ["registered_owner", { display: "Espólio de Maria Silva", status: "confirmed" }, "document", files.registry.id, 1, "Proprietário registrado: Espólio de Maria Silva", 0.98, true],
      ["heirs_count", { display: "3 herdeiros", status: "confirmed" }, "document", files.death.id, 1, "A falecida deixou três filhos", 0.96, true],
      ["marcos_occupation", { display: "Marcos passou a ocupar parte do terreno", status: "alleged", alleged: true }, "whatsapp", firstMessage.id, null, firstMessage.rawContent, 0.86, false],
      ["fence_change", { display: "Cerca alterada em 12/03/2026", status: "confirmed" }, "document", files.fence.id, null, "Fotografia registra cerca recém-alterada", 0.9, true],
      ["family_agreement", { display: "A mãe teria prometido uma área a João", status: "alleged", alleged: true }, "audio", files.audio.id, null, "Minha mãe dizia que aquela parte ficaria para mim", 0.78, false],
      ["property_entry_date", { display: "12/03/2026", status: "contradictory", conflict: true }, "whatsapp", firstMessage.id, null, "Marcos entrou no terreno no dia 12 de março", 0.9, false],
      ["property_entry_date", { display: "13/03/2026", status: "contradictory", conflict: true }, "document", files.divergent.id, 1, "Declaro que a entrada ocorreu em 13 de março de 2026", 0.91, false],
      ["client_impact_insecurity", { display: "Cliente relata insegurança e medo de retornar ao imóvel", status: "alleged", alleged: true }, "whatsapp", laterMessage.id, null, laterMessage.rawContent, 0.94, false],
      ["property_registry_number", { display: "12.345", status: "confirmed" }, "document", files.registry.id, 1, "Matrícula nº 12.345", 0.99, true],
      ["property_area", { display: "18.500 m²", status: "confirmed" }, "document", files.registry.id, 1, "Área total: 18.500 m²", 0.97, true],
    ]
    for (const [fieldName, value, sourceType, sourceId, sourcePage, sourceExcerpt, confidence, verified] of facts) {
      await prisma.caseFact.create({ data: { caseId: lawCase.id, fieldName, value, sourceType, sourceId, sourcePage, sourceExcerpt, confidence, verifiedAt: verified ? new Date("2026-10-06T12:00:00Z") : null, verifiedBy: verified ? "Dra. Ana Martins" : null, deduplicationKey: hash(`${lawCase.id}-${fieldName}-${sourceId}-${sourceExcerpt}`) } })
    }

    for (const event of [
      ["client_report", "Entrada no terreno relatada", "Cliente informa que Marcos entrou no terreno.", "2026-03-12T14:00:00Z", "whatsapp", firstMessage.id, 0.9],
      ["evidence_received", "Fotos da cerca recebidas", "Fotografias foram adicionadas ao caso.", "2026-03-18T10:00:00Z", "document", files.fence.id, 1],
      ["document_received", "Matrícula do imóvel adicionada", "Matrícula antiga, emitida em 2019.", "2026-03-20T11:30:00Z", "document", files.registry.id, 1],
      ["client_report", "Nova discussão relatada", laterMessage.rawContent, "2026-10-05T18:20:00Z", "whatsapp", laterMessage.id, 0.94],
    ]) await prisma.caseEvent.create({ data: { caseId: lawCase.id, eventType: event[0], title: event[1], description: event[2], occurredAt: new Date(event[3]), sourceType: event[4], sourceId: event[5], confidence: event[6], deduplicationKey: hash(`${lawCase.id}-${event[1]}`) } })

    for (const gap of [
      ["Documento do acordo familiar", "Ainda não existe documento que comprove a divisão prometida.", "high", "João possui mensagem, carta ou testemunha do acordo?"],
      ["Matrícula atualizada do imóvel", "A matrícula disponível foi emitida há mais de cinco anos.", "high", "Solicitar certidão de matrícula atualizada ao cartório."],
      ["Documentação do inventário", "O caso não possui cópia integral do inventário.", "high", "Qual é o número do inventário e onde ele tramita?"],
    ]) await prisma.informationGap.create({ data: { caseId: lawCase.id, title: gap[0], description: gap[1], priority: gap[2], suggestedQuestion: gap[3], sourceEventId: firstMessage.id, deduplicationKey: hash(`${lawCase.id}-${gap[0]}`) } })

    await prisma.aITask.create({ data: { caseId: lawCase.id, title: "Solicitar matrícula atualizada", description: "Obter certidão atualizada para confirmar a titularidade e eventuais averbações.", priority: "high", category: "document", status: "pending", createdBy: "fixture", reasoning: "A matrícula disponível é antiga e há disputa atual sobre o imóvel.", deduplicationKey: hash(`${lawCase.id}-task-registry`) } })
    await prisma.reasonChain.create({ data: { caseId: lawCase.id, agentType: "case_intelligence", action: "Revisar divergência de datas", reasoning: "A mensagem do cliente indica 12/03, enquanto a declaração do vizinho indica 13/03. Nenhuma fonte foi escolhida automaticamente como correta.", status: "pending", impact: "high", confidence: 0.92 } })
    await prisma.textMessage.create({ data: { caseId: lawCase.id, from: "João Silva", to: "Escritório", text: laterMessage.rawContent, createdAt: laterMessage.receivedAt } })
    console.log(`Caso operacional criado: ${lawCase.id}`)
  }
} finally {
  await prisma.$disconnect()
}
