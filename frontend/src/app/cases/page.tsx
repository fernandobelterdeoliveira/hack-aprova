"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AlertTriangle, ArrowUpRight, BriefcaseBusiness, CalendarDays, CircleAlert, FileSearch, ListFilter, Loader2, Plus, Search, UserRound } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Case } from "@/lib/types"

type CaseView = "all" | "in_progress" | "waiting" | "closed"
type OperationalFilter = "all" | "stale" | "gaps" | "risk" | "deadline" | "missing_document" | "review" | "contradiction" | "unassigned" | "unprocessed"
const statusOptions: Array<{ value: CaseView; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "in_progress", label: "Em andamento" },
  { value: "waiting", label: "Aguardando" },
  { value: "closed", label: "Encerrados" },
]

const operationalOptions: Array<{ value: OperationalFilter; label: string }> = [
  { value: "all", label: "Todos os casos" },
  { value: "stale", label: "Sem atualização" },
  { value: "gaps", label: "Com lacunas" },
  { value: "risk", label: "Alto risco" },
  { value: "deadline", label: "Com prazo" },
  { value: "missing_document", label: "Documento faltando" },
  { value: "review", label: "Aguardando revisão" },
  { value: "contradiction", label: "Com contradição" },
  { value: "unassigned", label: "Sem responsável" },
  { value: "unprocessed", label: "Entradas pendentes" },
]

const statusLabel: Record<string, string> = { open: "Aberto", active: "Ativo", pending: "Pendente", "on-hold": "Em espera", closed: "Encerrado" }
const priorityLabel: Record<string, string> = { urgent: "Urgente", high: "Alta", medium: "Média", low: "Baixa" }

const priorityClass: Record<string, string> = {
  urgent: "bg-rose-500",
  high: "bg-amber-500",
  medium: "bg-blue-500",
  low: "bg-slate-300",
}

export default function CasesPage() {
  const [cases, setCases] = useState<Case[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<CaseView>("all")
  const [sortBy, setSortBy] = useState<"activity" | "priority">("activity")
  const [operationalFilter, setOperationalFilter] = useState<OperationalFilter>("all")

  useEffect(() => {
    fetch("/api/cases")
      .then((response) => {
        if (!response.ok) throw new Error("Não foi possível carregar os casos")
        return response.json()
      })
      .then(setCases)
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Ocorreu um erro inesperado"))
      .finally(() => setLoading(false))
  }, [])

  const visibleCases = useMemo(() => {
    const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 }
    return cases
      .filter((item) => {
        const haystack = `${item.clientName} ${item.caseType} ${item.description}`.toLowerCase()
        const matchesStatus = status === "all"
          || (status === "in_progress" && ["open", "active"].includes(item.status))
          || (status === "waiting" && ["pending", "on-hold"].includes(item.status))
          || (status === "closed" && item.status === "closed")
        const operational = item.operational
        const matchesOperational = operationalFilter === "all"
          || (operationalFilter === "stale" && (operational?.staleDays || 0) >= 10)
          || (operationalFilter === "gaps" && operational?.hasGaps)
          || (operationalFilter === "risk" && operational?.highRisk)
          || (operationalFilter === "deadline" && operational?.hasDeadline)
          || (operationalFilter === "missing_document" && operational?.missingDocument)
          || (operationalFilter === "review" && operational?.awaitingReview)
          || (operationalFilter === "contradiction" && operational?.hasContradiction)
          || (operationalFilter === "unassigned" && operational?.unassigned)
          || (operationalFilter === "unprocessed" && (operational?.unprocessedEntries || 0) > 0)
        return haystack.includes(query.toLowerCase()) && matchesStatus && matchesOperational
      })
      .sort((a, b) => sortBy === "priority"
        ? priorityOrder[b.priority] - priorityOrder[a.priority]
        : new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime())
  }, [cases, operationalFilter, query, sortBy, status])

  const operationalCounts = useMemo(() => ({
    all: cases.length,
    stale: cases.filter((item) => (item.operational?.staleDays || 0) >= 10).length,
    gaps: cases.filter((item) => item.operational?.hasGaps).length,
    risk: cases.filter((item) => item.operational?.highRisk).length,
    deadline: cases.filter((item) => item.operational?.hasDeadline).length,
    missing_document: cases.filter((item) => item.operational?.missingDocument).length,
    review: cases.filter((item) => item.operational?.awaitingReview).length,
    contradiction: cases.filter((item) => item.operational?.hasContradiction).length,
    unassigned: cases.filter((item) => item.operational?.unassigned).length,
    unprocessed: cases.filter((item) => (item.operational?.unprocessedEntries || 0) > 0).length,
  }), [cases])

  if (loading) return <div className="grid min-h-[60vh] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-[#3157d5]" /></div>
  if (error) return <div className="surface-card grid min-h-[360px] place-items-center text-center"><div><CircleAlert className="mx-auto mb-3 h-8 w-8 text-rose-600" /><p className="font-semibold">Não foi possível carregar os casos</p><p className="mt-1 text-sm text-slate-500">{error}</p></div></div>

  return (
    <div className="space-y-7">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="page-title">Casos</h1>
        </div>
        <Button asChild className="action-primary h-10 rounded-lg px-4"><Link href="/cases/new"><Plus className="mr-2 h-4 w-4" />Novo caso</Link></Button>
      </div>

      <section>
        <div className="mb-3 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" /><h2 className="text-sm font-semibold">Casos que podem estar se perdendo</h2></div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <OperationalIndicator value={operationalCounts.stale} label="sem atualização há 10+ dias" active={operationalFilter === "stale"} onClick={() => setOperationalFilter(operationalFilter === "stale" ? "all" : "stale")} />
          <OperationalIndicator value={operationalCounts.gaps} label="com informação faltante" active={operationalFilter === "gaps"} onClick={() => setOperationalFilter(operationalFilter === "gaps" ? "all" : "gaps")} />
          <OperationalIndicator value={operationalCounts.risk} label="com risco alto" active={operationalFilter === "risk"} onClick={() => setOperationalFilter(operationalFilter === "risk" ? "all" : "risk")} />
          <OperationalIndicator value={operationalCounts.review} label="aguardando revisão" active={operationalFilter === "review"} onClick={() => setOperationalFilter(operationalFilter === "review" ? "all" : "review")} />
          <OperationalIndicator value={operationalCounts.contradiction} label="com contradições" active={operationalFilter === "contradiction"} onClick={() => setOperationalFilter(operationalFilter === "contradiction" ? "all" : "contradiction")} />
        </div>
      </section>

      <div className="surface-card p-3 md:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Buscar casos" className="h-10 border-slate-200 bg-slate-50/60 pl-10 shadow-none" />
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1 sm:grid-cols-4">
            {statusOptions.map((option) => (
              <button key={option.value} onClick={() => setStatus(option.value)} className={`whitespace-nowrap rounded-md px-3 py-2 text-xs font-semibold transition ${status === option.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {option.label}<span className="ml-1.5 opacity-55">{option.value === "all" ? cases.length : cases.filter((item) => option.value === "in_progress" ? ["open", "active"].includes(item.status) : option.value === "waiting" ? ["pending", "on-hold"].includes(item.status) : item.status === "closed").length}</span>
              </button>
            ))}
          </div>
          <Select value={operationalFilter} onValueChange={(value: OperationalFilter) => setOperationalFilter(value)}>
            <SelectTrigger className="h-10 w-full border-slate-200 shadow-none xl:w-[210px]"><FileSearch className="mr-2 h-4 w-4" /><SelectValue /></SelectTrigger>
            <SelectContent>{operationalOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label} ({operationalCounts[option.value]})</SelectItem>)}</SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(value: "activity" | "priority") => setSortBy(value)}>
            <SelectTrigger className="h-10 w-full border-slate-200 shadow-none xl:w-[190px]"><ListFilter className="mr-2 h-4 w-4" /><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="activity">Mais recentes primeiro</SelectItem><SelectItem value="priority">Maior prioridade</SelectItem></SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-500">{visibleCases.length} {visibleCases.length === 1 ? "caso" : "casos"}</p><p className="hidden text-[11px] text-slate-400 md:block">Ordenado por {sortBy === "activity" ? "última atividade" : "prioridade"}</p></div>

      {visibleCases.length === 0 ? (
        <div className="surface-card grid min-h-[320px] place-items-center text-center"><div><BriefcaseBusiness className="mx-auto mb-3 h-8 w-8 text-slate-300" /><p className="font-semibold">Nenhum caso encontrado</p><p className="mt-1 text-sm text-slate-400">Altere a pesquisa ou o filtro de status.</p></div></div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {visibleCases.map((item) => <CaseCard key={item.id} item={item} />)}
        </div>
      )}
    </div>
  )
}

function OperationalIndicator({ value, label, active, onClick }: { value: number; label: string; active: boolean; onClick: () => void }) {
  return <button onClick={onClick} className={`rounded-xl border p-4 text-left transition ${active ? "border-primary bg-accent" : "border-border bg-card hover:border-primary/40"}`}><p className="text-2xl font-semibold">{value}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{label}</p></button>
}

function CaseCard({ item }: { item: Case }) {
  return (
    <Link href={`/cases/${item.id}`} className="surface-card group relative overflow-hidden p-5 transition duration-200 hover:-translate-y-0.5 hover:border-[#c8ced8] hover:shadow-[0_8px_24px_rgba(24,32,51,.08)]">
      <span className={`absolute inset-y-0 left-0 w-1 ${priorityClass[item.priority] ?? priorityClass.medium}`} />
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3.5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#edf1ff] text-sm font-bold text-[#3157d5]">{item.clientName.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div>
          <div className="min-w-0"><h2 className="truncate font-semibold tracking-tight text-slate-900">{item.clientName}</h2><p className="mt-1 text-xs text-slate-500">{item.caseType}</p></div>
        </div>
        <Badge variant="outline" className="rounded-md border-slate-200 bg-slate-50 text-[10px] font-semibold text-slate-500">{statusLabel[item.status] || item.status}</Badge>
      </div>

      <p className="mt-5 line-clamp-2 min-h-10 text-sm leading-5 text-slate-500">{item.description}</p>

      <div className="mt-5 rounded-xl border border-slate-100 bg-[#f8faf7] p-3.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Próxima ação</p>
        <div className="mt-1.5 flex items-center justify-between gap-3"><p className="truncate text-sm font-medium text-slate-800">{item.nextAction || "Revisar e atualizar o estado do caso"}</p><ArrowUpRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-[#3157d5]" /></div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5" />{item.assignedTo}</span>
        <span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />Atualizado em {new Date(item.lastActivity).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</span>
        <span className="ml-auto"><span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${priorityClass[item.priority]}`} />{priorityLabel[item.priority] || item.priority}</span>
      </div>
      {item.operational && <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3 text-[10px] text-muted-foreground">{item.operational.gapCount > 0 && <span className="inline-flex items-center gap-1"><FileSearch className="h-3 w-3" />{item.operational.gapCount} lacuna(s)</span>}{item.operational.taskCount > 0 && <span>{item.operational.taskCount} tarefa(s)</span>}{item.operational.hasContradiction && <span className="font-semibold text-rose-700">Contradição</span>}{item.operational.awaitingReview && <span className="font-semibold text-amber-700">Aguardando revisão</span>}</div>}
    </Link>
  )
}
