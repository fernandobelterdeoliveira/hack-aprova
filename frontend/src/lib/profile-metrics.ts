import type { PrismaClient } from "@prisma/client"

type TokenUsage = { inputTokens?: number; outputTokens?: number; totalTokens?: number }

function tokenCount(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0
  const usage = value as TokenUsage
  if (typeof usage.totalTokens === "number") return usage.totalTokens
  return (typeof usage.inputTokens === "number" ? usage.inputTokens : 0)
    + (typeof usage.outputTokens === "number" ? usage.outputTokens : 0)
}

function dayKey(value: Date) {
  return value.toISOString().slice(0, 10)
}

function monthKey(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`
}

function calculateStreaks(dates: Date[]) {
  const uniqueDays = [...new Set(dates.map(dayKey))].sort()
  let longest = 0
  let running = 0
  let previous: Date | null = null
  for (const value of uniqueDays) {
    const current = new Date(`${value}T00:00:00.000Z`)
    running = previous && current.getTime() - previous.getTime() === 86_400_000 ? running + 1 : 1
    longest = Math.max(longest, running)
    previous = current
  }

  let current = 0
  const available = new Set(uniqueDays)
  const cursor = new Date()
  cursor.setUTCHours(0, 0, 0, 0)
  if (!available.has(dayKey(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1)
  while (available.has(dayKey(cursor))) {
    current += 1
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  return { longest, current }
}

const workflowNames: Record<string, string> = {
  "hybrid-routing-v1": "Triagem híbrida",
  "case-intelligence-tools-v1": "Inteligência de caso",
  "deterministic-routing-v1": "Triagem determinística",
}

function workflowName(value: string) {
  return workflowNames[value] || value.replaceAll("-", " ").replace(/\bv\d+\b/gi, "").trim()
}

export async function profileMetrics(prisma: PrismaClient, operatorId = "current-user", workspaceId = "default-workspace") {
  const [executions, inboxItems, reviewedChanges, cases, tasks, emails, texts, calls, storedObjects] = await Promise.all([
    prisma.aIExecution.findMany({ where: { OR: [{ case: { workspaceId } }, { inboxItem: { workspaceId } }] }, select: { tokenUsage: true, latencyMs: true, startedAt: true, workflowVersion: true, provider: true, status: true } }),
    prisma.inboxItem.findMany({ where: { workspaceId }, select: { createdAt: true, reviewStatus: true } }),
    prisma.proposedCaseChange.findMany({ where: { decidedAt: { not: null }, decidedBy: operatorId, case: { workspaceId } }, select: { decidedAt: true, status: true, type: true } }),
    prisma.case.findMany({ where: { workspaceId }, select: { createdAt: true, status: true } }),
    prisma.aITask.findMany({ where: { case: { workspaceId } }, select: { createdAt: true, completedAt: true, status: true, category: true } }),
    prisma.email.count({ where: { case: { workspaceId } } }),
    prisma.textMessage.count({ where: { case: { workspaceId } } }),
    prisma.phoneCall.count({ where: { case: { workspaceId } } }),
    prisma.storedObject.aggregate({ where: { OR: [{ inboxItem: { workspaceId } }, { connectorAccount: { workspaceId } }] }, _count: true, _sum: { sizeBytes: true } }),
  ])

  const totalTokens = executions.reduce((sum, execution) => sum + tokenCount(execution.tokenUsage), 0)
  const dailyTokens = new Map<string, number>()
  const monthlyTokens = new Map<string, number>()
  for (const execution of executions) {
    const tokens = tokenCount(execution.tokenUsage)
    dailyTokens.set(dayKey(execution.startedAt), (dailyTokens.get(dayKey(execution.startedAt)) || 0) + tokens)
    monthlyTokens.set(monthKey(execution.startedAt), (monthlyTokens.get(monthKey(execution.startedAt)) || 0) + tokens)
  }

  const months = Array.from({ length: 12 }, (_, index) => {
    const date = new Date()
    date.setUTCDate(1)
    date.setUTCHours(0, 0, 0, 0)
    date.setUTCMonth(date.getUTCMonth() - (11 - index))
    return {
      key: monthKey(date),
      label: new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }).format(date).replace(".", ""),
      tokens: monthlyTokens.get(monthKey(date)) || 0,
    }
  })

  const activityDates = reviewedChanges.flatMap((item) => item.decidedAt ? [item.decidedAt] : [])
  const streaks = calculateStreaks(activityDates)
  const completedTasks = tasks.filter((task) => task.status === "completed").length
  const appliedChanges = reviewedChanges.filter((change) => change.status === "applied").length
  const rejectedChanges = reviewedChanges.filter((change) => change.status === "rejected").length
  const deadlineReviews = reviewedChanges.filter((change) => change.type === "DEADLINE").length
  const deterministicRuns = executions.filter((execution) => execution.provider === "deterministic").length
  const workflowCounts = new Map<string, number>()
  executions.forEach((execution) => workflowCounts.set(execution.workflowVersion, (workflowCounts.get(execution.workflowVersion) || 0) + 1))
  const topWorkflow = [...workflowCounts.entries()].sort((a, b) => b[1] - a[1])[0]
  const configuredLimit = Number(process.env.MONTHLY_TOKEN_LIMIT || 1_000_000)
  const monthlyTokenLimit = Number.isFinite(configuredLimit) && configuredLimit > 0 ? Math.floor(configuredLimit) : 1_000_000
  const currentMonthTokens = monthlyTokens.get(monthKey(new Date())) || 0
  const remainingTokens = Math.max(0, monthlyTokenLimit - currentMonthTokens)
  const remainingTokenPercentage = Math.max(0, Math.min(100, Math.round((remainingTokens / monthlyTokenLimit) * 100)))

  return {
    headline: {
      totalTokens,
      currentMonthTokens,
      monthlyTokenLimit,
      remainingTokens,
      remainingTokenPercentage,
      peakTokens: Math.max(0, ...dailyTokens.values()),
      longestTaskMs: Math.max(0, ...executions.map((execution) => execution.latencyMs || 0)),
      longestStreak: streaks.longest,
      currentStreak: streaks.current,
    },
    tokenActivity: months,
    insights: {
      fastMode: executions.length ? Math.round((deterministicRuns / executions.length) * 100) : 0,
      mostUsedWorkflow: topWorkflow ? { name: workflowName(topWorkflow[0]), percentage: Math.round((topWorkflow[1] / executions.length) * 100) } : null,
      workflowsExplored: workflowCounts.size,
      automationRuns: executions.length,
    },
    personalActivity: {
      reviews: reviewedChanges.length,
      appliedChanges,
      rejectedChanges,
      deadlineReviews,
    },
    workspaceActivity: {
      cases: cases.length,
      activeCases: cases.filter((item) => item.status !== "closed").length,
      processedEntries: inboxItems.filter((item) => item.reviewStatus !== "pending").length,
      completedTasks,
      communications: emails + texts + calls,
      storedFiles: storedObjects._count,
      storedBytes: storedObjects._sum.sizeBytes || 0,
    },
    highlights: [
      { id: "first-review", title: "Primeira revisão", description: "Concluiu a primeira revisão humana", achieved: reviewedChanges.length > 0, progress: Math.min(reviewedChanges.length, 1), target: 1 },
      { id: "reviewer-25", title: "Revisor atento", description: "Tomou 25 decisões auditáveis", achieved: reviewedChanges.length >= 25, progress: Math.min(reviewedChanges.length, 25), target: 25 },
      { id: "deadline-guardian", title: "Guardião de prazos", description: "Revisou 5 possíveis prazos", achieved: deadlineReviews >= 5, progress: Math.min(deadlineReviews, 5), target: 5 },
      { id: "streak-7", title: "Consistência", description: "Revisou casos em 7 dias consecutivos", achieved: streaks.longest >= 7, progress: Math.min(streaks.longest, 7), target: 7 },
      { id: "applier-50", title: "Caso em movimento", description: "Aplicou 50 mudanças aprovadas", achieved: appliedChanges >= 50, progress: Math.min(appliedChanges, 50), target: 50 },
      { id: "reviewer-100", title: "Referência em revisão", description: "Tomou 100 decisões auditáveis", achieved: reviewedChanges.length >= 100, progress: Math.min(reviewedChanges.length, 100), target: 100 },
    ],
  }
}
