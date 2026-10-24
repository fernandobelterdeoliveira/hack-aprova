"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  CircleAlert,
  FileText,
  Inbox,
  Loader2,
  Mail,
  MessageSquareText,
  Paperclip,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/hooks/use-toast"

type ProposedChange = {
  id: string
  type: "FACT" | "EVENT" | "TASK" | "GAP" | "GAP_RESOLUTION" | "DEADLINE"
  payload: Record<string, unknown>
  confidence: number
  riskLevel: string
  requiresReview: boolean
  policyDecision?: string | null
  sourceId?: string | null
  sourceType?: string | null
  documentId?: string | null
  sourcePage?: number | null
  sourceExcerpt?: string | null
  provider?: string | null
  model?: string | null
  status: string
}

type InboxItem = {
  id: string
  sourceType: string
  senderName?: string | null
  senderEmail?: string | null
  senderPhone?: string | null
  receivedAt: string
  rawContent: string
  fileName?: string | null
  classification?: string | null
  riskLevel?: string | null
  requiresDeepReasoning?: boolean
  requiresHumanReview?: boolean
  decisionProvider?: string | null
  processingStatus: string
  reviewStatus: string
  associationConfidence?: number | null
  associationSignals?: {
    autoAssociated?: boolean
    manuallyAssigned?: boolean
    status?: string
    embeddingProvider?: string
    candidates?: Array<{ caseId: string; caseNumber: string; clientName: string; caseType: string; score: number; signals: Array<{ detail: string; contribution: number }> }>
  } | null
  detectedCase?: { id: string; caseNumber: string; clientName: string; caseType: string; municipalProcess?:{id:string;name:string;ticket:{id:string}|null}|null } | null
  proposedChanges: ProposedChange[]
  processingRuns?: Array<{
    model: string
    promptVersion: string
    extractorVersion: string
    processingVersion: string
    completedAt?: string | null
  }>
  aiExecutions?: Array<{
    id: string
    provider: string
    model: string
    workflowVersion: string
    status: string
    latencyMs?: number | null
  }>
  backgroundJobs?: Array<{
    id: string
    status: string
    progress: number
    progressMessage?: string | null
    lastError?: string | null
  }>
}

type CaseOption = {
  id: string
  caseNumber?: string
  clientName: string
  caseType: string
}

const typeStyle: Record<string, string> = {
  EVENT: "border-border bg-muted text-foreground",
  FACT: "border-border bg-muted text-foreground",
  TASK: "border-border bg-muted text-foreground",
  GAP: "border-border bg-muted text-foreground",
  GAP_RESOLUTION: "border-border bg-muted text-foreground",
  DEADLINE: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300",
}

const filterLabel: Record<string, string> = { pending: "Revisar", needs_association: "Associar", approved: "Concluídas", rejected: "Descartadas", all: "Todas" }
const reviewLabel: Record<string, string> = { pending: "Pendente", ready: "Pronta", needs_association: "Precisa de associação", approved: "Aprovada", rejected: "Rejeitada" }
const changeTypeLabel: Record<string, string> = { EVENT: "EVENTO", FACT: "FATO", TASK: "TAREFA", GAP: "LACUNA", GAP_RESOLUTION: "LACUNA RESOLVIDA", DEADLINE: "PRAZO" }
const riskLabel: Record<string, string> = { low: "Baixo", medium: "Médio", high: "Alto", critical: "Crítico" }
const classificationLabel: Record<string, string> = {
  municipal_rules: "Regras do processo municipal",
  municipal_changes: "Solicitação de ajuste no formulário",
  client_update: "Atualização do cliente",
  document: "Documento",
  medical_update: "Atualização médica",
  settlement_update: "Proposta ou acordo",
  deadline: "Possível prazo",
  billing: "Cobrança",
  legal_strategy: "Estratégia jurídica",
  unknown: "Não classificada",
}

export default function InboxPage() {
  const [items, setItems] = useState<InboxItem[]>([])
  const [cases, setCases] = useState<CaseOption[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState("pending")
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [selectedChanges, setSelectedChanges] = useState<string[]>([])
  const [targetCaseId, setTargetCaseId] = useState("")
  const [query, setQuery] = useState("")
  const [mobileView, setMobileView] = useState<"list" | "detail">("list")

  const load = useCallback(async () => {
    try {
      setError(null)
      const [inboxResponse, casesResponse] = await Promise.all([fetch("/api/inbox"), fetch("/api/cases")])
      if (!inboxResponse.ok || !casesResponse.ok) throw new Error("Não foi possível carregar a fila de ingestão")
      const [inboxData, casesData] = await Promise.all([inboxResponse.json(), casesResponse.json()])
      setItems(inboxData)
      setCases(casesData)
      const requestedId = new URLSearchParams(window.location.search).get("item")
      setSelectedId((current) => requestedId && inboxData.some((item: InboxItem) => item.id === requestedId) ? requestedId : current || inboxData[0]?.id || null)
      if (requestedId) setMobileView("detail")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ocorreu um erro inesperado")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!items.some((item) => item.backgroundJobs?.some((job) => ["queued", "running"].includes(job.status)))) return
    const interval = window.setInterval(() => { void load() }, 2000)
    return () => window.clearInterval(interval)
  }, [items, load])

  useEffect(() => {
    const requestedFilter = new URLSearchParams(window.location.search).get("filter")
    if (requestedFilter && ["pending", "needs_association", "approved", "rejected", "all"].includes(requestedFilter)) {
      setFilter(requestedFilter)
      setSelectedId(null)
    }
  }, [])

  const visibleItems = useMemo(() => items.filter((item) => {
    const matchesStatus = filter === "all"
      || (filter === "pending" && ["ready", "needs_association", "pending"].includes(item.reviewStatus))
      || item.reviewStatus === filter
    const normalized = query.trim().toLocaleLowerCase("pt-BR")
    const haystack = [item.senderName, item.senderEmail, item.senderPhone, item.rawContent, item.fileName, item.detectedCase?.clientName, item.detectedCase?.caseNumber].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR")
    return matchesStatus && (!normalized || haystack.includes(normalized))
  }), [filter, items, query])

  const selected = visibleItems.find((item) => item.id === selectedId) || visibleItems[0]
  const selectedJob = selected?.backgroundJobs?.[0]

  useEffect(() => {
    if (!selected) return
    setTargetCaseId(selected.detectedCase?.id || "")
    setSelectedChanges(selected.proposedChanges.filter((change) => change.status === "pending").map((change) => change.id))
  }, [selected])

  async function review(action: "approve" | "reject" | "reassign") {
    if (!selected || (action !== "reject" && !targetCaseId)) return
    setWorking(true)
    setError(null)
    try {
      const response = await fetch(`/api/inbox/${selected.id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, caseId: targetCaseId || undefined, changeIds: selectedChanges }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.details || data.error || "Não foi possível salvar a revisão")
      if (action === "approve") {
        toast({
          title: "Alterações aprovadas",
          description: `${data.applied ?? selectedChanges.length} ${Number(data.applied ?? selectedChanges.length) === 1 ? "item foi adicionado" : "itens foram adicionados"} ao caso.`,
        })
      } else if (action === "reject") {
        toast({ title: "Sugestões descartadas", description: "Nenhuma alteração desta entrada foi adicionada ao caso." })
      } else {
        toast({ title: "Caso alterado", description: "A entrada foi associada ao caso selecionado." })
      }
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar a revisão")
    } finally {
      setWorking(false)
    }
  }

  if (loading) return <div className="grid min-h-[60vh] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>

  const pendingCount = items.filter((item) => ["ready", "needs_association", "pending"].includes(item.reviewStatus)).length

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <h1 className="page-title">Fila</h1>
          {pendingCount > 0 && <Badge className="border-0 bg-accent text-accent-foreground shadow-none">{pendingCount} para revisar</Badge>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={load} aria-label="Atualizar fila"><RefreshCw className="h-4 w-4" /></Button>
          <NewItemDialog open={newOpen} onOpenChange={setNewOpen} onCreated={async () => { setNewOpen(false); await load() }} />
        </div>
      </div>

      {error && <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><CircleAlert className="h-4 w-4" />{error}</div>}

      <div className="grid min-h-[620px] overflow-hidden rounded-2xl border border-border bg-card shadow-sm xl:h-[calc(100vh-132px)] xl:grid-cols-[380px_minmax(0,1fr)]">
        <aside className={`${mobileView === "detail" ? "hidden" : "flex"} min-h-0 flex-col xl:flex xl:border-r xl:border-border`}>
          <div className="border-b border-border p-3">
            <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar" className="h-10 bg-muted/60 pl-9 shadow-none" /></div>
            <div className="mt-2 grid grid-cols-5 gap-1">
            {["all", "pending", "needs_association", "approved", "rejected"].map((value) => <button key={value} onClick={() => { setFilter(value); setSelectedId(null) }} className={`min-w-0 rounded-lg px-1 py-2 text-[11px] font-semibold transition sm:text-xs ${filter === value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>{filterLabel[value]}</button>)}
            </div>
          </div>
          <div className="scrollbar-hidden min-h-0 flex-1 divide-y divide-border overflow-y-auto overscroll-contain">
            {visibleItems.length ? visibleItems.map((item) => <InboxRow key={item.id} item={item} active={selected?.id === item.id} onClick={() => { setSelectedId(item.id); setMobileView("detail") }} />) : <div className="grid min-h-[360px] place-items-center p-8 text-center"><div><Check className="mx-auto mb-3 h-7 w-7 text-primary" /><p className="text-sm font-semibold text-foreground">Nada por aqui</p><p className="mt-1 text-xs text-muted-foreground">Altere a busca ou escolha outra fila.</p></div></div>}
          </div>
        </aside>

        <main className={`${mobileView === "list" ? "hidden" : "block"} scrollbar-hidden min-w-0 overflow-y-auto overscroll-contain scroll-smooth bg-background xl:block`}>
          {selected ? (
            <div>
              <header className="sticky top-0 z-20 border-b border-border bg-card/95 px-4 py-4 backdrop-blur md:px-6">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                  <div className="flex min-w-0 gap-3">
                    <button onClick={() => setMobileView("list")} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground xl:hidden" aria-label="Voltar para a lista"><ArrowLeft className="h-4 w-4" /></button>
                    <SourceIcon source={selected.sourceType} />
                    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-foreground">{selected.senderName || selected.senderEmail || selected.senderPhone || "Remetente desconhecido"}</h2><Badge variant="outline" className="rounded-md capitalize">{selected.sourceType}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{new Date(selected.receivedAt).toLocaleString("pt-BR")} · {classificationLabel[selected.classification || "unknown"] || "Não classificada"}</p></div>
                  </div>
                  <ReviewBadge status={selected.reviewStatus} />
                </div>
              </header>

              <div className="grid gap-5 p-3 sm:p-5 lg:p-6 2xl:grid-cols-[minmax(0,1fr)_300px]">
                <div className="space-y-5">
                  {selectedJob && ["queued", "running", "failed", "dead_letter", "cancelled"].includes(selectedJob.status) && <section className="rounded-xl border border-border bg-card p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-foreground">{selectedJob.status === "queued" ? "Aguardando processamento" : selectedJob.status === "running" ? "Processando entrada" : selectedJob.status === "dead_letter" ? "Processamento interrompido" : selectedJob.status === "cancelled" ? "Processamento cancelado" : "Falha no processamento"}</p><p className="mt-1 text-xs text-muted-foreground">{selectedJob.progressMessage || selectedJob.lastError}</p></div>{selectedJob.status === "running" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}</div><div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full transition-all ${["failed", "dead_letter"].includes(selectedJob.status) ? "bg-destructive" : "bg-primary"}`} style={{ width: `${selectedJob.progress}%` }} /></div><p className="mt-2 text-right text-[10px] text-muted-foreground">{selectedJob.progress}%</p></section>}
                  <section className="flex items-start gap-3 rounded-xl border border-border bg-muted/45 px-4 py-3">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <p className="text-sm leading-6 text-muted-foreground">
                      A análise encontrou <strong className="font-semibold text-foreground">{selected.proposedChanges.length} {selected.proposedChanges.length === 1 ? "sugestão" : "sugestões"}</strong> para esta {String(classificationLabel[selected.classification || "unknown"] || "entrada").toLocaleLowerCase("pt-BR")}. Nível de atenção: <strong className="font-semibold text-foreground">{String(riskLabel[selected.riskLevel || ""] || "não definido").toLocaleLowerCase("pt-BR")}</strong>{selected.requiresDeepReasoning ? ". Foi utilizada análise especializada." : "."}
                    </p>
                  </section>

                  <section className="rounded-xl border border-border bg-card p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">O que chegou</p>
                    <p className="mt-3 whitespace-pre-wrap text-[15px] leading-7 text-foreground">{selected.rawContent}</p>
                    {selected.fileName && <div className="mt-4 flex items-center gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground"><Paperclip className="h-4 w-4" />{selected.fileName}</div>}
                  </section>

                  <section>
                    <div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold text-foreground">O que será registrado</h3><p className="mt-1 text-xs text-muted-foreground">Desmarque qualquer sugestão que não deva entrar no caso.</p></div><Badge variant="outline">{selectedChanges.length} selecionadas</Badge></div>
                    <div className="space-y-3">
                      {[...selected.proposedChanges].sort((a, b) => changeOrder(a.type) - changeOrder(b.type)).map((change) => <ChangeCard key={change.id} change={change} selected={selectedChanges.includes(change.id)} disabled={change.status !== "pending"} onToggle={() => setSelectedChanges((current) => current.includes(change.id) ? current.filter((id) => id !== change.id) : [...current, change.id])} />)}
                    </div>
                  </section>
                </div>

                <aside className="space-y-4">
                  {selected.processingStatus === "completed" && ["ready", "needs_association", "pending"].includes(selected.reviewStatus) ? <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
                    <p className="text-sm font-semibold text-foreground">Sua decisão</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">Apenas os itens selecionados serão adicionados ao caso.</p>
                    <div className="mt-4 space-y-2">
                      <Button className="action-primary w-full" onClick={() => review("approve")} disabled={working || !targetCaseId || selectedChanges.length === 0}>{working ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Aprovando...</> : <><ShieldCheck className="mr-2 h-4 w-4" />Aprovar selecionadas</>}</Button>
                      <Button variant="outline" className="w-full text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40" onClick={() => review("reject")} disabled={working}><X className="mr-2 h-4 w-4" />Descartar sugestões</Button>
                    </div>
                    {error && <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"><CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</div>}
                    {!targetCaseId && <p className="mt-3 text-xs font-medium text-amber-700 dark:text-amber-300">Escolha um caso antes de aprovar.</p>}
                    {selectedChanges.length === 0 && targetCaseId && <p className="mt-3 text-xs font-medium text-amber-700 dark:text-amber-300">Selecione ao menos uma sugestão.</p>}
                  </section> : selected.processingStatus !== "completed" ? <section className="rounded-xl border border-border bg-card p-5"><p className="text-sm font-semibold text-foreground">Análise em andamento</p><p className="mt-1 text-xs leading-5 text-muted-foreground">As opções de aprovação serão liberadas quando o worker concluir o processamento.</p></section> : <section className="rounded-xl border border-border bg-card p-5"><p className="text-sm font-semibold text-foreground">Revisão concluída</p><p className="mt-1 text-xs text-muted-foreground">Esta entrada foi {selected.reviewStatus === "approved" ? "aprovada e registrada no caso" : "descartada"}.</p></section>}

                  <section className="rounded-xl border border-border bg-card p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Caso relacionado</p>
                    {selected.detectedCase ? <div className="mt-3"><p className="text-sm font-semibold text-foreground">{selected.detectedCase.clientName}</p><p className="mt-1 text-xs text-muted-foreground">#{selected.detectedCase.caseNumber} · {selected.detectedCase.caseType}</p><div className="mt-3 flex flex-wrap gap-3 text-xs font-medium text-emerald-700"><Link href={`/cases/${selected.detectedCase.id}`}>Abrir caso →</Link>{selected.detectedCase.municipalProcess?.ticket&&<Link href={`/communications?ticket=${selected.detectedCase.municipalProcess.ticket.id}`}>Ticket e formulário →</Link>}</div><div className="mt-4"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Confiança da associação</p><p className="mt-1 text-2xl font-semibold text-foreground">{selected.associationConfidence===null||selected.associationConfidence===undefined?"Vínculo manual":`${Math.round(selected.associationConfidence*100)}%`}</p></div></div> : <div className="mt-3 flex gap-2 text-sm text-amber-700 dark:text-amber-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Escolha o caso correto antes de aprovar.</div>}
                    <div className="mt-4 border-t border-border pt-4">
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Alterar caso</Label>
                      <Select value={targetCaseId} onValueChange={setTargetCaseId}><SelectTrigger className="mt-2 h-9 text-xs"><SelectValue placeholder="Selecione um caso" /></SelectTrigger><SelectContent>{cases.map((item) => <SelectItem key={item.id} value={item.id}>{item.clientName} · {item.caseType}</SelectItem>)}</SelectContent></Select>
                      {targetCaseId && targetCaseId !== selected.detectedCase?.id && <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => review("reassign")} disabled={working}>Confirmar outro caso</Button>}
                    </div>
                  </section>

                  <section className="rounded-xl border border-border bg-card p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Por que este caso</p>
                    <div className="mt-3 space-y-2">{selected.associationSignals?.candidates?.[0]?.signals?.length ? selected.associationSignals.candidates[0].signals.map((signal, index) => <div key={index} className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />{signal.detail}</div>) : <p className="text-xs leading-5 text-muted-foreground">Nenhum sinal forte foi encontrado. Confirme o caso manualmente.</p>}</div>
                  </section>
                </aside>
              </div>
            </div>
          ) : <div className="grid min-h-[650px] place-items-center text-center"><div><Inbox className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" /><p className="font-semibold text-foreground">Selecione uma entrada</p></div></div>}
        </main>
      </div>
    </div>
  )
}

function InboxRow({ item, active, onClick }: { item: InboxItem; active: boolean; onClick: () => void }) {
  return <button onClick={onClick} className={`relative w-full p-4 text-left transition ${active ? "bg-accent before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r before:bg-primary" : "hover:bg-muted/60"}`}><div className="flex items-start gap-3"><SourceIcon source={item.sourceType} small /><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold text-foreground">{item.senderName || item.senderEmail || "Remetente desconhecido"}</p><span className="shrink-0 text-xs text-muted-foreground">{new Date(item.receivedAt).toLocaleDateString("pt-BR", { month: "short", day: "numeric" })}</span></div><p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.rawContent}</p><div className="mt-2 flex items-center gap-2"><ReviewBadge status={item.reviewStatus} />{item.proposedChanges.length > 0 && <span className="ml-auto text-xs text-muted-foreground">{item.proposedChanges.length} {item.proposedChanges.length === 1 ? "sugestão" : "sugestões"}</span>}</div></div><ChevronRight className="mt-1 h-4 w-4 text-muted-foreground/50" /></div></button>
}

function ChangeCard({ change, selected, disabled, onToggle }: { change: ProposedChange; selected: boolean; disabled: boolean; onToggle: () => void }) {
  const payload = change.payload
  const evidence = payload.evidence && typeof payload.evidence === "object" && !Array.isArray(payload.evidence)
    ? payload.evidence as Record<string, unknown>
    : null
  const rawTitle = String(payload.title || payload.fieldName || change.type)
  const detail = String(payload.description || payload.sourceExcerpt || payload.suggestedQuestion || payload.reasoning || "")
  const title = change.type === "EVENT" && /comecei\s+(?:a\s+)?fisioterapia/i.test(detail)
    ? "Início de fisioterapia"
    : rawTitle
  const sourceExcerpt = change.sourceExcerpt || (evidence ? String(evidence.excerpt || "") : "")
  const validationIndicator = change.riskLevel === "high" || change.riskLevel === "critical"
    ? { className: "bg-rose-500", label: "Muita atenção" }
    : change.riskLevel === "medium" || change.requiresReview
      ? { className: "bg-amber-400", label: "Atenção média" }
      : { className: "bg-emerald-500", label: "Informação validada" }
  return (
    <article className={`w-full rounded-xl border bg-card text-left transition ${selected ? "border-primary/50 bg-accent/35 ring-2 ring-primary/10" : "border-border"} ${disabled ? "opacity-60" : ""}`}>
      <button type="button" onClick={onToggle} disabled={disabled} className="flex w-full items-start gap-3 p-4 text-left">
        <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border text-transparent"}`}><Check className="h-3 w-3" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className={`rounded-md text-xs ${typeStyle[change.type]}`}>{changeTypeLabel[change.type] || change.type}</Badge>{(change.riskLevel === "high" || change.riskLevel === "critical") && <Badge variant="destructive" className="text-xs">Revisão do advogado</Badge>}</div>
          <p className="mt-2 text-sm font-semibold text-foreground">{title}</p>
          {detail && <p className="mt-2 line-clamp-3 text-sm leading-5 text-muted-foreground">{detail}</p>}
        </div>
      </button>
      <div className="border-t border-border px-4 py-3 sm:ml-8">
        {sourceExcerpt && <div className="rounded-lg bg-muted px-3 py-2"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Fonte</p><p className="mt-1 line-clamp-2 text-xs italic leading-5 text-foreground">“{sourceExcerpt}”</p><p className="mt-1 text-[11px] text-muted-foreground">{change.sourceType || String(evidence?.source || "entrada atual")}{change.sourcePage ? ` · página ${change.sourcePage}` : ""}</p></div>}
        <div className="mt-3 flex justify-end"><span className={`h-3 w-3 rounded-full ${validationIndicator.className}`} title={validationIndicator.label} aria-label={validationIndicator.label} /></div>
      </div>
    </article>
  )
}

function changeOrder(type: ProposedChange["type"]) {
  return ({ EVENT: 0, FACT: 1, GAP_RESOLUTION: 2, GAP: 3, TASK: 4, DEADLINE: 5 } as Record<ProposedChange["type"], number>)[type]
}

function SourceIcon({ source, small = false }: { source: string; small?: boolean }) {
  const Icon = source === "email" ? Mail : source === "whatsapp" ? MessageSquareText : source === "audio" ? Phone : source === "upload" ? Upload : FileText
  return <span className={`grid shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground ${small ? "h-8 w-8" : "h-10 w-10"}`}><Icon className={small ? "h-3.5 w-3.5" : "h-4 w-4"} /></span>
}

function ReviewBadge({ status }: { status: string }) {
  const style = status === "approved" ? "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900" : status === "rejected" ? "bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900" : status === "needs_association" ? "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900" : "bg-accent text-accent-foreground border-primary/15"
  return <Badge variant="outline" className={`rounded-md ${style}`}>{reviewLabel[status] || status}</Badge>
}

function NewItemDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: () => void }) {
  const [sourceType, setSourceType] = useState("whatsapp")
  const [senderName, setSenderName] = useState("")
  const [senderEmail, setSenderEmail] = useState("")
  const [senderPhone, setSenderPhone] = useState("")
  const [rawContent, setRawContent] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch("/api/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceType, senderName: senderName || undefined, senderEmail: senderEmail || undefined, senderPhone: senderPhone || undefined, rawContent }) })
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || "Não foi possível processar a entrada") }
      setRawContent(""); setSenderName(""); setSenderEmail(""); setSenderPhone("")
      await onCreated()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível processar a entrada")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild><Button className="action-primary"><Plus className="mr-2 h-4 w-4" />Registrar entrada</Button></DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader><DialogTitle>Nova entrada manual</DialogTitle><DialogDescription>Registre uma informação recebida fora dos conectores. Ela será salva e processada pela mesma fila de associação e revisão.</DialogDescription></DialogHeader>
        <div className="grid gap-4 py-3">
          <div className="grid gap-2"><Label>Origem</Label><Select value={sourceType} onValueChange={setSourceType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="whatsapp">WhatsApp</SelectItem><SelectItem value="email">E-mail</SelectItem><SelectItem value="manual">Mensagem copiada</SelectItem><SelectItem value="document">Documento</SelectItem><SelectItem value="audio">Transcrição de áudio</SelectItem><SelectItem value="upload">Envio de arquivo</SelectItem></SelectContent></Select></div>
          <div className="grid gap-3 sm:grid-cols-2"><div className="grid gap-2"><Label>Nome do remetente</Label><Input value={senderName} onChange={(event) => setSenderName(event.target.value)} placeholder="João Silva" /></div><div className="grid gap-2"><Label>E-mail</Label><Input type="email" value={senderEmail} onChange={(event) => setSenderEmail(event.target.value)} placeholder="joao@email.com" /></div></div>
          <div className="grid gap-2"><Label>Telefone</Label><Input value={senderPhone} onChange={(event) => setSenderPhone(event.target.value)} placeholder="+55 11 99999-9999" /></div>
          <div className="grid gap-2"><Label>Conteúdo</Label><Textarea rows={6} value={rawContent} onChange={(event) => setRawContent(event.target.value)} placeholder="Comecei a fisioterapia hoje, mas não lembro o nome completo da clínica..." /></div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={submit} disabled={submitting || !rawContent.trim()} className="action-primary">{submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Registrar e processar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
