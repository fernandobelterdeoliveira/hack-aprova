import type { AITask, Prisma } from "@prisma/client"

import { prisma } from "@/lib/prisma"

type AnalysisTask = { title?: string; description?: string; priority?: string; category?: string; estimatedTime?: string; reasoning?: string }
type AnalysisResult = { agent_type?: string; response?: string; analysis?: { tasks?: AnalysisTask[] }; [key: string]: unknown }

function sanitize(value: unknown): unknown {
  if (typeof value === "string") return value.replace(/\u0000/g, "")
  if (Array.isArray(value)) return value.map(sanitize)
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitize(item)]))
  return value
}

export async function processCaseAnalysis(input: {
  workspaceId: string
  caseId: string
  userRequest: string
  fileUrls: string[]
  signal?: AbortSignal
  onProgress?: (progress: number, message: string) => Promise<void>
}) {
  const lawCase = await prisma.case.findFirst({ where: { id: input.caseId, workspaceId: input.workspaceId }, select: { id: true } })
  if (!lawCase) throw new Error("Caso não encontrado")
  await input.onProgress?.(15, "Enviando documentos para análise")
  const backend = process.env.PYTHON_BACKEND_URL || "http://localhost:8000"
  const response = await fetch(`${backend}/api/orchestrator/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_request: input.userRequest, file_urls: input.fileUrls, case_id: input.caseId }),
    signal: input.signal,
  })
  if (!response.ok) {
    const upstream = await response.json().catch(() => null) as { detail?: string } | null
    throw new Error(upstream?.detail || `Serviço de análise retornou ${response.status}`)
  }
  await input.onProgress?.(70, "Registrando resultado da análise")
  const result = sanitize(await response.json()) as AnalysisResult
  const created = await prisma.$transaction(async (tx) => {
    const reasonChain = await tx.reasonChain.create({ data: {
      caseId: input.caseId,
      agentType: result.agent_type || "orchestrator",
      action: "Análise de IA do caso",
      reasoning: String(result.response || JSON.stringify(result)),
      status: "pending",
      impact: "high",
      confidence: 0.85,
      data: result as Prisma.InputJsonValue,
    } })
    const tasks: AITask[] = []
    for (const task of result.analysis?.tasks || []) {
      tasks.push(await tx.aITask.create({ data: {
        caseId: input.caseId,
        title: String(task.title || "Revisar tarefa sugerida"),
        description: String(task.description || ""),
        priority: task.priority || "medium",
        category: task.category || "follow-up",
        estimatedTime: task.estimatedTime || null,
        reasoning: task.reasoning || null,
        createdBy: result.agent_type || "orchestrator",
        relatedTo: reasonChain.id,
        status: "pending",
      } }))
    }
    await tx.case.update({ where: { id: input.caseId }, data: { lastActivity: new Date() } })
    return { reasonChainId: reasonChain.id, tasksCreated: tasks.length }
  })
  await input.onProgress?.(95, "Análise pronta para revisão")
  return { ...created, analysis: result }
}
