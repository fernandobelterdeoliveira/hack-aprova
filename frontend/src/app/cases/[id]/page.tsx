"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle, ArrowLeft, ArrowRight, BookOpenCheck, CheckCircle2, ChevronDown,
  CircleAlert, FileSearch, FileText, FolderOpen, History, Loader2, RefreshCw, Search,
  Pencil, Plus, ShieldAlert, Sparkles, Trash2, UserRound, UsersRound,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type Source = { sourceId: string | null; sourceType: string; label: string; documentId?: string | null; page?: number | null; excerpt?: string | null; confidence?: number | null }
type Fact = { id: string; dataId: string; removable: boolean; label: string; value: string; status: "confirmed" | "alleged" | "contradictory" | "pending"; confidence?: number | null; humanVerified: boolean; verifiedBy?: string | null; verifiedAt?: string | null; source: Source }
type EditableData = { dataId: string; removable: boolean; label: string; value: string; status: string; source: Source }
type TimelineItem = { id: string; date: string; kind: string; title: string; description?: string | null; risk: string; confidence?: number | null; reviewStatus: string; source: Source }
type Gap = { id: string; title: string; description?: string | null; priority: string; status: string; suggestedQuestion?: string | null; source: Source; responsible?: string | null }
type Task = { id: string; title: string; description: string; priority: string; category: string; status: string; dueDate?: string | null; reasoning?: string | null; createdBy: string }
type Document = { id: string; name: string; url: string; type: string; size: string; uploadedAt: string; uploadedBy: string; category: string; processingStatus: string; extractedInformation: Fact[]; important: boolean; hasConflict: boolean; duplicate: boolean; pageCount?: number | null }
type Risk = { id: string; level: string; title: string; reason: string; source?: Source }
type Contradiction = { id: string; title: string; confidence: number; values: Array<{ value: string; source: Source }>; action: string }
type SearchResult = { answer: string; matches: Array<{ kind: string; title: string; text: string; source: Source; confidence?: number | null; status: string }> }

interface OperationalCase {
  case: { municipalProcess?: {id:string;name:string;department:string;ticket:{id:string;status:string;currentVersionId:string|null}|null}|null; id: string; caseNumber: string; clientName: string; clientEmail?: string | null; clientPhone?: string | null; clientDob?: string | null; caseType: string; status: string; priority: string; assignedTo: string; createdAt: string; lastActivity: string; description: string; nextAction: string }
  summary: { text: string; stage: string; healthScore?: number | null; updatedAt: string; generatedBy: string; sources: Source[]; warnings: string[] }
  stats: { documents: number; pendingTasks: number; openGaps: number; alerts: number; pendingReviews: number }
  primaryData: { client: Array<{ dataId: string; removable: boolean; label: string; value?: string | null; status: string; source: Source }>; extracted: Fact[] }
  facts: Fact[]
  impacts: Array<Fact & { kind: string }>
  timeline: TimelineItem[]
  risks: Risk[]
  contradictions: Contradiction[]
  gaps: Gap[]
  documents: Document[]
  tasks: Task[]
  nextBestAction: { title: string; reason: string; risk: string; status: string; source: { type: string; id: string } }
  changes: { receivedAt?: string | null; alreadyKnown: Fact[]; newInformation: Array<{ id: string; title: string; status: string; source: Source }>; contradictions: Contradiction[]; resolvedGaps: unknown[]; newGaps: unknown[] }
  documentSummary: { analyzed: number; total: number; people: number; dates: number; values: number; contradictions: number; missingInformation: number }
  intelligence: Array<{ id: string; action: string; reasoning: string; impact: string; confidence?: number | null; timestamp: string }>
  evidenceSources: Source[]
}

const statusLabel: Record<string, string> = { open: "Aberto", active: "Ativo", pending: "Pendente", "on-hold": "Em espera", closed: "Encerrado" }
const riskLabel: Record<string, string> = { low: "Baixo", medium: "Médio", high: "Alto", critical: "Crítico", urgent: "Urgente" }
const factLabel: Record<string, string> = { confirmed: "Confirmado", alleged: "Alegação", contradictory: "Contraditório", pending: "Não verificado" }

export default function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params)
  const [data, setData] = useState<OperationalCase | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  const [question, setQuestion] = useState("")
  const [searching, setSearching] = useState(false)
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null)
  const [editingData, setEditingData] = useState<EditableData | null>(null)
  const [removingData, setRemovingData] = useState<EditableData | null>(null)
  const [editValue, setEditValue] = useState("")
  const [editStatus, setEditStatus] = useState("pending")
  const [dataActionError, setDataActionError] = useState<string | null>(null)
  const [savingData, setSavingData] = useState(false)
  const [taskDialogOpen, setTaskDialogOpen] = useState(false)
  const [taskTitle, setTaskTitle] = useState("")
  const [taskDescription, setTaskDescription] = useState("")
  const [taskPriority, setTaskPriority] = useState("medium")
  const [taskDueDate, setTaskDueDate] = useState("")
  const [taskSaving, setTaskSaving] = useState(false)
  const [taskError, setTaskError] = useState<string | null>(null)
  const [timelineExpanded, setTimelineExpanded] = useState(false)

  const fetchCase = useCallback(async () => {
    try {
      const response = await fetch(`/api/cases/${id}`, { cache: "no-store" })
      if (!response.ok) throw new Error(response.status === 404 ? "Caso não encontrado" : "Não foi possível carregar o caso")
      setData(await response.json())
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ocorreu um erro inesperado")
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { fetchCase() }, [fetchCase])

  async function updateStatus(status: string) {
    const response = await fetch(`/api/cases/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) })
    if (response.ok) setData(await response.json())
  }

  async function regenerateSummary() {
    setRegenerating(true)
    try {
      const response = await fetch(`/api/cases/${id}/summary`, { method: "POST" })
      if (!response.ok) throw new Error("Não foi possível atualizar o resumo")
      await fetchCase()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o resumo")
    } finally {
      setRegenerating(false)
    }
  }

  async function searchCase(event: React.FormEvent) {
    event.preventDefault()
    if (question.trim().length < 3) return
    setSearching(true)
    try {
      const response = await fetch(`/api/cases/${id}/search`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Não foi possível pesquisar")
      setSearchResult(result)
    } catch (cause) {
      setSearchResult({ answer: cause instanceof Error ? cause.message : "Não foi possível pesquisar", matches: [] })
    } finally {
      setSearching(false)
    }
  }

  async function createGapTask(gap: Gap) {
    const response = await fetch(`/api/cases/${id}/tasks`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: `Obter: ${gap.title}`, description: gap.suggestedQuestion || gap.description || "Obter a informação pendente.", priority: gap.priority, category: "document", reasoning: `Criada a partir da lacuna ${gap.id}.` }),
    })
    if (response.ok) await fetchCase()
  }

  function openDataEditor(item: EditableData) {
    setEditingData(item)
    setEditValue(item.value === "Não informado" ? "" : item.value)
    setEditStatus(["confirmed", "alleged", "contradictory", "pending"].includes(item.status) ? item.status : "pending")
    setDataActionError(null)
  }

  async function saveData() {
    if (!editingData || !editValue.trim()) return
    setSavingData(true)
    setDataActionError(null)
    try {
      const response = await fetch(`/api/cases/${id}/data/${encodeURIComponent(editingData.dataId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: editValue, ...(editingData.dataId.startsWith("fact:") ? { status: editStatus } : {}) }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar.")
      setData(result)
      setEditingData(null)
    } catch (cause) {
      setDataActionError(cause instanceof Error ? cause.message : "Não foi possível salvar.")
    } finally {
      setSavingData(false)
    }
  }

  async function removeData() {
    if (!removingData) return
    setSavingData(true)
    setDataActionError(null)
    try {
      const response = await fetch(`/api/cases/${id}/data/${encodeURIComponent(removingData.dataId)}`, { method: "DELETE" })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Não foi possível remover.")
      setData(result)
      setRemovingData(null)
    } catch (cause) {
      setDataActionError(cause instanceof Error ? cause.message : "Não foi possível remover.")
    } finally {
      setSavingData(false)
    }
  }

  async function createManualTask() {
    if (!taskTitle.trim() || !taskDescription.trim()) return
    setTaskSaving(true)
    setTaskError(null)
    try {
      const response = await fetch(`/api/cases/${id}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: taskTitle, description: taskDescription, priority: taskPriority, category: "follow-up", ...(taskDueDate ? { dueDate: taskDueDate } : {}), reasoning: "Criada manualmente na página do caso." }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Não foi possível criar a tarefa.")
      await fetchCase()
      setTaskDialogOpen(false)
      setTaskTitle("")
      setTaskDescription("")
      setTaskPriority("medium")
      setTaskDueDate("")
    } catch (cause) {
      setTaskError(cause instanceof Error ? cause.message : "Não foi possível criar a tarefa.")
    } finally {
      setTaskSaving(false)
    }
  }

  const activeTasks = useMemo(() => data?.tasks.filter((task) => !["completed", "dismissed"].includes(task.status)) || [], [data])
  if (loading) return <div className="grid min-h-[60vh] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
  if (error && !data) return <div className="surface-card grid min-h-[360px] place-items-center text-center"><div><CircleAlert className="mx-auto mb-3 h-8 w-8 text-rose-600" /><p className="font-semibold">Não foi possível abrir o caso</p><p className="mt-1 text-sm text-muted-foreground">{error}</p></div></div>
  if (!data) return null

  return (
    <div className="mx-auto max-w-[1500px] space-y-8 pb-12">
      <header className="border-b border-border pb-6">
        <Link href="/cases" className="mb-5 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Todos os municípios</Link>
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3"><h1 className="page-title">{data.case.clientName}</h1><Badge variant="outline">{data.case.caseNumber}</Badge></div>
            <p className="mt-2 text-sm text-muted-foreground">{data.case.caseType} · Responsável: <span className="font-medium text-foreground">{data.case.assignedTo}</span></p>
            <p className="mt-1 text-xs text-muted-foreground">Atualizado {relativeDate(data.case.lastActivity)}</p>
            {data.case.municipalProcess&&<div className="mt-3 flex flex-wrap gap-4 text-xs font-medium text-emerald-700"><Link href={`/municipal?process=${data.case.municipalProcess.id}`}>Regras e fontes municipais →</Link>{data.case.municipalProcess.ticket&&<Link href={`/communications?ticket=${data.case.municipalProcess.ticket.id}`}>Abrir Ticket e formulário →</Link>}</div>}
          </div>
          <Select value={data.case.status} onValueChange={updateStatus}><SelectTrigger className="w-full sm:w-[170px]"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(statusLabel).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
          <Metric value={data.stats.documents} label="documentos" icon={FolderOpen} href="#documentos" />
          <Metric value={data.stats.pendingTasks} label="tarefas pendentes" icon={CheckCircle2} href="#tarefas" />
          <Metric value={data.stats.openGaps} label="lacunas" icon={FileSearch} href="#lacunas" />
          <Metric value={data.stats.alerts} label="alertas" icon={ShieldAlert} href="#atencao" />
        </div>
      </header>

      <nav className="scrollbar-hidden sticky top-2 z-20 flex gap-1 overflow-x-auto rounded-xl border border-border bg-background/95 p-1.5 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur">
        {[['resumo','Resumo'],['dados','Dados'],['timeline','Timeline'],['fatos','Fatos'],['atencao','Atenção'],['lacunas','Lacunas'],['documentos','Documentos'],['tarefas','Tarefas'],['fontes','Fontes'],['inteligencia','Inteligência']].map(([anchor,label]) => <a key={anchor} href={`#${anchor}`} className="whitespace-nowrap rounded-lg px-3 py-2 transition-colors hover:bg-secondary hover:text-foreground">{label}</a>)}
      </nav>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="min-w-0 space-y-5">
          <Section id="resumo" eyebrow="Entendimento rápido" title="Resumo executivo" icon={BookOpenCheck} action={<Button variant="outline" size="sm" onClick={regenerateSummary} disabled={regenerating}>{regenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Regerar resumo</Button>}>
            <p className="max-w-4xl text-[15px] leading-7 text-foreground/85">{data.summary.text}</p>
            {data.summary.warnings.map((warning) => <div key={warning} className="mt-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950"><AlertTriangle className="h-4 w-4 shrink-0" />{warning}</div>)}
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground"><span>Atualizado {relativeDate(data.summary.updatedAt)}</span><span>{data.summary.sources.length} fonte(s) utilizada(s)</span></div>
            <div className="mt-3 flex flex-wrap gap-2">{data.summary.sources.slice(0, 5).map((item, index) => <SourceChip key={`${item.sourceId}-${index}`} source={item} />)}</div>
          </Section>

          <Section id="dados" eyebrow="Informações estruturadas" title="Dados principais" icon={UserRound}>
            <div className="grid gap-x-8 md:grid-cols-2">
              {data.primaryData.client.map((item) => <DataRow key={item.dataId} item={{ ...item, value: item.value || "Não informado" }} onEdit={openDataEditor} />)}
              {data.primaryData.extracted.map((fact) => <DataRow key={fact.id} item={fact} verified={fact.humanVerified ? `${fact.verifiedBy || "Revisor"}${fact.verifiedAt ? ` · ${formatDate(fact.verifiedAt)}` : ""}` : undefined} onEdit={openDataEditor} />)}
            </div>
          </Section>

          <Section id="timeline" eyebrow="Ordem dos acontecimentos" title="Linha do tempo" icon={History} action={data.timeline.length > 5 ? <Button variant="outline" size="sm" onClick={() => setTimelineExpanded((value) => !value)}>{timelineExpanded ? "Mostrar menos" : `Ver histórico completo (${data.timeline.length})`}</Button> : undefined}>
            {data.timeline.length ? <div className="relative ml-3 border-l border-border">{data.timeline.slice(0, timelineExpanded ? 30 : 5).map((item) => <TimelineRow key={item.id} item={item} />)}</div> : <Empty text="Nenhum acontecimento foi registrado neste caso." />}
          </Section>

          <Section id="fatos" eyebrow="Fato não é interpretação" title="Fatos principais" icon={CheckCircle2}>
            {data.facts.length ? <div className="divide-y divide-border">{data.facts.map((fact) => <FactRow key={fact.id} fact={fact} />)}</div> : <Empty text="Ainda não existem fatos estruturados e aprovados." />}
          </Section>

          <Section id="atencao" eyebrow="Revisão operacional" title="Pontos que exigem atenção" icon={ShieldAlert}>
            {data.risks.length ? <div className="space-y-3">{data.risks.map((risk) => <div key={risk.id} className="rounded-lg border border-border p-4"><div className="flex flex-wrap items-center gap-2"><RiskBadge value={risk.level} /><p className="font-medium">{risk.title}</p></div><p className="mt-2 text-sm leading-6 text-muted-foreground">{risk.reason}</p>{risk.source && <div className="mt-3"><SourceChip source={risk.source} /></div>}</div>)}</div> : <Empty text="Nenhum ponto crítico foi identificado nos registros atuais." />}
          </Section>

          {data.impacts.length > 0 && <Section eyebrow="Perspectiva do cliente" title="Como o cliente foi afetado" icon={UsersRound}>
            <div className="divide-y divide-border">{data.impacts.map((impact) => <div key={impact.id} className="py-4 first:pt-0"><div className="flex gap-2"><Badge variant="outline">{impact.kind === "confirmed" ? "Informação confirmada" : "Relato do cliente"}</Badge></div><p className="mt-2 text-sm">{impact.value}</p><div className="mt-3"><SourceChip source={impact.source} /></div></div>)}</div>
          </Section>}

          <Section eyebrow="Fontes divergentes" title="Contradições" icon={AlertTriangle}>
            {data.contradictions.length ? <div className="space-y-4">{data.contradictions.map((item) => <div key={item.id} className="rounded-lg border border-rose-200 bg-rose-50/40 p-4"><div className="flex items-center justify-between gap-3"><p className="font-semibold">{item.title}</p><Badge variant="outline">Revisar</Badge></div><div className="mt-4 grid gap-3 md:grid-cols-2">{item.values.map((value, index) => <div key={`${value.value}-${index}`} className="rounded-md bg-background p-3"><p className="text-sm font-medium">{value.value}</p><div className="mt-2"><SourceChip source={value.source} /></div></div>)}</div><p className="mt-3 text-xs text-muted-foreground">{item.action}</p></div>)}</div> : <Empty text="Nenhuma contradição explícita foi encontrada." />}
          </Section>

          <Section id="lacunas" eyebrow="O que ainda falta" title="Lacunas de informação" icon={FileSearch}>
            {data.gaps.filter((gap) => gap.status === "open").length ? <div className="divide-y divide-border">{data.gaps.filter((gap) => gap.status === "open").map((gap) => <div key={gap.id} className="py-5 first:pt-0"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><div className="flex items-center gap-2"><RiskBadge value={gap.priority} /><h3 className="font-semibold">{gap.title}</h3></div><p className="mt-2 text-sm leading-6 text-muted-foreground">{gap.description || "Informação necessária para completar o entendimento do caso."}</p>{gap.suggestedQuestion && <p className="mt-2 text-xs"><span className="font-semibold">Pergunta sugerida:</span> {gap.suggestedQuestion}</p>}</div><Button variant="outline" size="sm" onClick={() => createGapTask(gap)}>Criar tarefa</Button></div><div className="mt-3"><SourceChip source={gap.source} /></div></div>)}</div> : <Empty text="Nenhuma lacuna aberta." />}
          </Section>

          <Section id="documentos" eyebrow="Arquivos de origem preservados" title="Documentos" icon={FolderOpen} action={<Badge variant="outline">{data.documentSummary.analyzed} de {data.documentSummary.total} analisados</Badge>}>
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5"><MiniStat value={data.documentSummary.people} label="pessoas" /><MiniStat value={data.documentSummary.dates} label="datas" /><MiniStat value={data.documentSummary.values} label="valores" /><MiniStat value={data.documentSummary.contradictions} label="divergências" /><MiniStat value={data.documentSummary.missingInformation} label="lacunas" /></div>
            {data.documents.length ? <div className="divide-y divide-border">{data.documents.map((document) => <DocumentRow key={document.id} document={document} />)}</div> : <Empty text="Nenhum documento foi recebido." />}
          </Section>

          <Section eyebrow="Comparação com o estado anterior" title="O que mudou?" icon={RefreshCw}>
            {!data.changes.receivedAt ? <Empty text="Ainda não há uma entrada recente associada para comparar." /> : <div className="grid gap-4 md:grid-cols-2"><ChangeBlock title="Já sabíamos" items={data.changes.alreadyKnown.map((item) => `${item.label}: ${item.value}`)} /><ChangeBlock title="Novo" items={data.changes.newInformation.map((item) => item.title)} /><ChangeBlock title="Contradições" items={data.changes.contradictions.map((item) => item.title)} tone="danger" /><ChangeBlock title="Lacunas" items={[`${data.changes.resolvedGaps.length} resolvida(s)`, `${data.changes.newGaps.length} nova(s)`]} /></div>}
          </Section>

          <Section id="tarefas" eyebrow="Trabalho pendente" title="Tarefas" icon={CheckCircle2} action={<Button size="sm" onClick={() => { setTaskError(null); setTaskDialogOpen(true) }}><Plus className="mr-2 h-4 w-4" />Nova tarefa</Button>}>
            <p className="mb-4 text-xs leading-5 text-muted-foreground">A equipe pode criar tarefas aqui. A Inbox também pode sugerir tarefas, mas elas só entram no caso depois da aprovação humana.</p>
            {activeTasks.length ? <div className="divide-y divide-border">{activeTasks.map((task) => <div key={task.id} className="flex flex-col justify-between gap-3 py-4 first:pt-0 sm:flex-row"><div><div className="flex items-center gap-2"><RiskBadge value={task.priority} /><p className="font-medium">{task.title}</p></div><p className="mt-2 text-sm text-muted-foreground">{task.description}</p>{task.reasoning && <p className="mt-2 text-xs text-muted-foreground">Motivo: {task.reasoning}</p>}<p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{/ai|agent|extractor/i.test(task.createdBy) ? "Sugerida pela IA e aprovada" : "Criada pela equipe"}</p></div><div className="shrink-0 text-xs text-muted-foreground">{task.dueDate ? `Até ${formatDate(task.dueDate)}` : "Sem prazo definido"}</div></div>)}</div> : <Empty text="Nenhuma tarefa pendente." />}
          </Section>

          <Section id="fontes" eyebrow="Rastreabilidade" title="Evidências e fontes" icon={FileText}>
            {data.evidenceSources.length ? <div className="grid gap-3 md:grid-cols-2">{data.evidenceSources.map((source, index) => <div key={`${source.sourceType}-${source.sourceId}-${index}`} className="rounded-lg border border-border p-4"><div className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">{source.label}</p></div><p className="mt-2 text-xs text-muted-foreground">{source.sourceType}{source.page ? ` · página ${source.page}` : ""}{source.confidence != null ? ` · confiança ${Math.round(source.confidence * 100)}%` : ""}</p>{source.excerpt && <p className="mt-3 line-clamp-3 text-xs italic leading-5 text-muted-foreground">“{source.excerpt}”</p>}</div>)}</div> : <Empty text="Nenhuma fonte rastreável foi registrada." />}
          </Section>

          <Section id="inteligencia" eyebrow="Recomendações, não fatos" title="Inteligência do caso" icon={Sparkles}>
            {data.intelligence.length ? <div className="divide-y divide-border">{data.intelligence.map((item) => <div key={item.id} className="py-4 first:pt-0"><div className="flex flex-wrap items-center gap-2"><RiskBadge value={item.impact} /><p className="font-medium">{item.action}</p></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{item.reasoning}</p><p className="mt-2 text-xs text-muted-foreground">{formatDate(item.timestamp)}{item.confidence != null ? ` · ${Math.round(item.confidence * 100)}% de confiança` : ""}</p></div>)}</div> : <Empty text="Ainda não há recomendações registradas para este caso." />}
          </Section>
        </main>

        <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <section className="rounded-xl border border-primary/20 bg-accent p-5">
            <p className="eyebrow">Próxima melhor ação</p>
            <h2 className="mt-3 text-lg font-semibold leading-6">{data.nextBestAction.title}</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{data.nextBestAction.reason}</p>
            <div className="mt-4 flex items-center justify-between"><RiskBadge value={data.nextBestAction.risk} /><span className="text-xs text-muted-foreground">{data.nextBestAction.status === "suggested" ? "Sugerida" : data.nextBestAction.status}</span></div>
          </section>

          <section className="surface-card p-5">
            <div className="flex items-center gap-2"><Search className="h-4 w-4 text-primary" /><h2 className="font-semibold">Buscar dentro do caso</h2></div>
            <form onSubmit={searchCase} className="mt-4 flex gap-2"><Input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ex.: qual documento comprova a matrícula?" /><Button size="icon" disabled={searching || question.trim().length < 3} aria-label="Pesquisar">{searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}</Button></form>
            {searchResult && <div className="mt-4 border-t border-border pt-4"><p className="text-sm font-medium">{searchResult.answer}</p><div className="mt-3 space-y-3">{searchResult.matches.slice(0, 5).map((match, index) => <div key={`${match.kind}-${index}`} className="rounded-lg bg-secondary p-3"><p className="text-xs font-semibold">{match.title}</p><p className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">{match.text}</p><div className="mt-2"><SourceChip source={match.source} /></div></div>)}</div></div>}
          </section>

        </aside>
      </div>

      <Dialog open={taskDialogOpen} onOpenChange={(open) => { if (!taskSaving) setTaskDialogOpen(open) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova tarefa</DialogTitle><DialogDescription>Registre uma ação que a equipe precisa executar neste caso.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div><label htmlFor="task-title" className="mb-2 block text-sm font-medium">O que precisa ser feito?</label><Input id="task-title" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="Ex.: solicitar matrícula atualizada" autoFocus /></div>
            <div><label htmlFor="task-description" className="mb-2 block text-sm font-medium">Detalhes</label><Textarea id="task-description" value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} placeholder="Explique o resultado esperado para quem executar a tarefa." /></div>
            <div className="grid gap-4 sm:grid-cols-2"><div><label className="mb-2 block text-sm font-medium">Prioridade</label><Select value={taskPriority} onValueChange={setTaskPriority}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Baixa</SelectItem><SelectItem value="medium">Média</SelectItem><SelectItem value="high">Alta</SelectItem></SelectContent></Select></div><div><label htmlFor="task-due-date" className="mb-2 block text-sm font-medium">Prazo opcional</label><Input id="task-due-date" type="date" value={taskDueDate} onChange={(event) => setTaskDueDate(event.target.value)} /></div></div>
            {taskError && <p className="text-sm text-destructive">{taskError}</p>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setTaskDialogOpen(false)} disabled={taskSaving}>Cancelar</Button><Button onClick={createManualTask} disabled={taskSaving || !taskTitle.trim() || !taskDescription.trim()}>{taskSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Criar tarefa</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingData)} onOpenChange={(open) => { if (!open && !savingData) setEditingData(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar {editingData?.label}</DialogTitle>
            <DialogDescription>A alteração aparecerá imediatamente no caso e ficará registrada no histórico.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div><label htmlFor="case-data-value" className="mb-2 block text-sm font-medium">Valor</label><Input id="case-data-value" value={editValue} onChange={(event) => setEditValue(event.target.value)} autoFocus /></div>
            {editingData?.dataId.startsWith("fact:") && <div><label className="mb-2 block text-sm font-medium">Como esta informação deve aparecer?</label><Select value={editStatus} onValueChange={setEditStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="confirmed">Confirmada</SelectItem><SelectItem value="alleged">Alegação</SelectItem><SelectItem value="contradictory">Contraditória</SelectItem><SelectItem value="pending">Não verificada</SelectItem></SelectContent></Select></div>}
            {editingData && <div className="rounded-lg bg-secondary p-3"><p className="text-xs font-medium">Fonte preservada</p><div className="mt-2"><SourceChip source={editingData.source} /></div></div>}
            {dataActionError && <p className="text-sm text-destructive">{dataActionError}</p>}
          </div>
          <DialogFooter className="sm:justify-between">
            <div>{editingData?.removable && <Button variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => { setRemovingData(editingData); setEditingData(null); setDataActionError(null) }} disabled={savingData}><Trash2 className="mr-2 h-4 w-4" />Apagar informação</Button>}</div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row"><Button variant="outline" onClick={() => setEditingData(null)} disabled={savingData}>Cancelar</Button><Button onClick={saveData} disabled={savingData || !editValue.trim()}>{savingData && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar alteração</Button></div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(removingData)} onOpenChange={(open) => { if (!open && !savingData) setRemovingData(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Remover {removingData?.label}?</AlertDialogTitle><AlertDialogDescription>Essa informação deixará de aparecer no caso, mas o registro original será preservado no histórico de auditoria.</AlertDialogDescription></AlertDialogHeader>
          {dataActionError && <p className="text-sm text-destructive">{dataActionError}</p>}
          <AlertDialogFooter><AlertDialogCancel disabled={savingData}>Cancelar</AlertDialogCancel><AlertDialogAction onClick={(event) => { event.preventDefault(); void removeData() }} disabled={savingData} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{savingData && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Remover informação</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function Section({ id, eyebrow, title, icon: Icon, action, children }: { id?: string; eyebrow: string; title: string; icon: typeof AlertTriangle; action?: React.ReactNode; children: React.ReactNode }) {
  return <section id={id} className="surface-card scroll-mt-24 p-5 sm:p-6"><div className="mb-5 flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-end"><div><p className="eyebrow flex items-center gap-2"><Icon className="h-3.5 w-3.5" />{eyebrow}</p><h2 className="mt-2 text-xl font-semibold tracking-tight">{title}</h2></div>{action}</div>{children}</section>
}

function Metric({ value, label, icon: Icon, href }: { value: number; label: string; icon: typeof FolderOpen; href: string }) { return <a href={href} aria-label={`Ver ${value} ${label}`} className="group flex items-center gap-3 bg-card p-4 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"><Icon className="h-4 w-4 text-primary" /><div className="min-w-0 flex-1"><p className="text-xl font-semibold">{value}</p><p className="text-[11px] text-muted-foreground">{label}</p></div><ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-50 transition-transform group-hover:translate-x-0.5 group-hover:opacity-100" /></a> }
function MiniStat({ value, label }: { value: number; label: string }) { return <div className="rounded-lg bg-secondary p-3"><p className="text-lg font-semibold">{value}</p><p className="text-[10px] text-muted-foreground">{label}</p></div> }
function Empty({ text }: { text: string }) { return <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">{text}</div> }

function SourceChip({ source }: { source: Source }) {
  return <span title={source.excerpt || undefined} className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-[10px] text-muted-foreground"><FileText className="h-3 w-3 shrink-0" /><span className="truncate">{source.label}{source.page ? ` · pág. ${source.page}` : ""}</span></span>
}

function DataRow({ item, verified, onEdit }: { item: EditableData; verified?: string; onEdit: (item: EditableData) => void }) {
  return <div className="group border-b border-border py-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs text-muted-foreground">{item.label}</p><p className="mt-1 break-words text-sm font-medium">{item.value}</p>{verified && <p className="mt-2 text-[10px] text-emerald-700">Verificado por {verified}</p>}</div><Button variant="ghost" size="icon" onClick={() => onEdit(item)} aria-label={`Editar ${item.label}`} title={`Editar ${item.label}`} className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></Button></div></div>
}

function FactRow({ fact }: { fact: Fact }) {
  return <div className="py-4 first:pt-0"><div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start"><div><p className="text-xs text-muted-foreground">{fact.label}</p><p className="mt-1 text-sm font-medium">{fact.value}</p></div><FactBadge status={fact.status} /></div>{fact.source.excerpt && <blockquote className="mt-3 border-l-2 border-border pl-3 text-xs italic leading-5 text-muted-foreground">“{fact.source.excerpt}”</blockquote>}<div className="mt-3 flex flex-wrap items-center gap-2"><SourceChip source={fact.source} />{fact.confidence != null && <span className="text-[10px] text-muted-foreground">Confiança {Math.round(fact.confidence * 100)}%</span>}</div></div>
}

function TimelineRow({ item }: { item: TimelineItem }) {
  return <div className="relative pb-5 pl-7 last:pb-0"><span className="absolute -left-[4px] top-1.5 h-2 w-2 rounded-full bg-primary" /><div className="flex flex-col justify-between gap-1 sm:flex-row"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold">{item.title}</p>{riskRank(item.risk) >= 3 && <RiskBadge value={item.risk} />}</div>{item.description && <p className="mt-1 line-clamp-1 text-xs leading-5 text-muted-foreground">{item.description}</p>}<div className="mt-1.5"><SourceChip source={item.source} /></div></div><time className="shrink-0 text-xs text-muted-foreground">{formatDate(item.date)}</time></div></div>
}

function DocumentRow({ document }: { document: Document }) {
  return <details className="group py-4 first:pt-0"><summary className="flex cursor-pointer list-none items-start gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-secondary"><FileText className="h-4 w-4 text-primary" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold">{document.name}</p>{document.hasConflict && <Badge variant="destructive">Conflito</Badge>}{document.duplicate && <Badge variant="outline">Possível duplicado</Badge>}{document.important && <Badge variant="outline">Informação importante</Badge>}</div><p className="mt-1 text-xs text-muted-foreground">{document.category} · {document.type.toUpperCase()} · {document.size} · {formatDate(document.uploadedAt)}</p></div><ChevronDown className="h-4 w-4 text-muted-foreground transition group-open:rotate-180" /></summary><div className="ml-12 mt-4 rounded-lg bg-secondary p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold">Informações extraídas</p><Button asChild variant="outline" size="sm"><a href={document.url} target="_blank" rel="noreferrer">Abrir original</a></Button></div>{document.extractedInformation.length ? <div className="mt-3 space-y-2">{document.extractedInformation.map((fact) => <div key={fact.id} className="text-xs"><span className="font-semibold">{fact.label}:</span> {fact.value}{fact.source.page ? ` · pág. ${fact.source.page}` : ""}</div>)}</div> : <p className="mt-3 text-xs text-muted-foreground">Nenhuma informação estruturada foi extraída deste arquivo.</p>}</div></details>
}

function ChangeBlock({ title, items, tone }: { title: string; items: string[]; tone?: "danger" }) { return <div className={`rounded-lg border p-4 ${tone === "danger" ? "border-rose-200 bg-rose-50/40" : "border-border"}`}><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>{items.length ? <ul className="mt-3 space-y-2 text-sm">{items.slice(0, 5).map((item, index) => <li key={`${item}-${index}`} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />{item}</li>)}</ul> : <p className="mt-3 text-xs text-muted-foreground">Nada identificado.</p>}</div> }

function RiskBadge({ value }: { value: string }) { const tone = riskRank(value) >= 4 ? "bg-rose-100 text-rose-800" : riskRank(value) >= 3 ? "bg-amber-100 text-amber-900" : value === "medium" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-700"; return <span className={`inline-flex rounded-md px-2 py-1 text-[10px] font-semibold ${tone}`}>{riskLabel[value] || value}</span> }
function FactBadge({ status }: { status: string }) { const tone = status === "confirmed" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : status === "contradictory" ? "border-rose-200 bg-rose-50 text-rose-800" : status === "alleged" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-border bg-secondary text-muted-foreground"; return <span className={`inline-flex shrink-0 rounded-md border px-2 py-1 text-[10px] font-semibold ${tone}`}>{factLabel[status] || status}</span> }
function riskRank(value: string) { return ({ critical: 4, urgent: 4, high: 3, medium: 2, low: 1 } as Record<string, number>)[value] || 0 }
function formatDate(value: string) { return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) }
function relativeDate(value: string) { const diff = Date.now() - new Date(value).getTime(); const hours = Math.floor(diff / 3_600_000); if (hours < 1) return "há menos de uma hora"; if (hours < 24) return `há ${hours} hora${hours === 1 ? "" : "s"}`; const days = Math.floor(hours / 24); return `há ${days} dia${days === 1 ? "" : "s"}` }
