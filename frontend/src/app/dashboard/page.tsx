"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import {
  ArrowRight,
  CalendarClock,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileStack,
  Inbox,
  Loader2,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

interface DashboardStats {
  totalCases: number
  activeCases: number
  closedCases: number
  pendingActions: number
  recentCommunications: number
}

interface CaseSummary {
  id: string
  clientName: string
  caseType: string
  status: string
  priority: string
  nextAction?: string
  lastActivity?: string
}

interface PendingAction {
  id: string
  agentType: string
  action: string
  reasoning: string
  confidence?: number
  timestamp: string
  case: { id: string; clientName: string; caseType: string }
}

const priorityStyle: Record<string, string> = {
  urgent: "border-rose-200 bg-rose-50 text-rose-700",
  high: "border-amber-200 bg-amber-50 text-amber-700",
  medium: "border-slate-200 bg-slate-50 text-slate-600",
  low: "border-slate-200 bg-white text-slate-500",
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({ totalCases: 0, activeCases: 0, closedCases: 0, pendingActions: 0, recentCommunications: 0 })
  const [recentCases, setRecentCases] = useState<CaseSummary[]>([])
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const responses = await Promise.all([
          fetch("/api/dashboard/stats"),
          fetch("/api/dashboard/recent-cases"),
          fetch("/api/dashboard/pending-actions"),
        ])
        if (responses.some((response) => !response.ok)) throw new Error("Não foi possível carregar os dados do painel")
        const [statsData, casesData, actionsData] = await Promise.all(responses.map((response) => response.json()))
        setStats(statsData)
        setRecentCases(casesData)
        setPendingActions(actionsData)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Ocorreu um erro inesperado")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return <div className="grid min-h-[60vh] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-[#3157d5]" /></div>
  }

  if (error) {
    return (
      <div className="surface-card grid min-h-[360px] place-items-center p-8 text-center">
        <div><CircleAlert className="mx-auto mb-3 h-8 w-8 text-rose-600" /><p className="font-semibold">Não foi possível carregar a área de trabalho</p><p className="mt-1 text-sm text-slate-500">{error}</p></div>
      </div>
    )
  }

  const today = new Intl.DateTimeFormat("pt-BR", { weekday: "long", month: "long", day: "numeric" }).format(new Date())

  return (
    <div className="space-y-8">
      <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="eyebrow mb-2">Visão operacional</p>
          <h1 className="page-title">Visão geral</h1>
          <p className="mt-2 text-sm text-slate-500">{today} · Veja o que precisa de atenção nos seus casos.</p>
        </div>
        <Button asChild className="action-primary h-10 rounded-lg px-4">
          <Link href="/actions">Abrir fila de revisão <ArrowRight className="ml-2 h-4 w-4" /></Link>
        </Button>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={FileStack}
          label="Casos em andamento"
          value={stats.activeCases}
          note={stats.closedCases === 0
            ? "Nenhum caso encerrado"
            : `${stats.closedCases} ${stats.closedCases === 1 ? "caso encerrado" : "casos encerrados"}`}
        />
        <Metric icon={ShieldCheck} label="Aguardando revisão" value={stats.pendingActions} note="Aprovação humana necessária" accent />
        <Metric icon={MessageSquareText} label="Novas comunicações" value={stats.recentCommunications} note="Últimos 7 dias" />
        <Metric icon={CalendarClock} label="Prazos próximos" value={Math.min(stats.pendingActions, 3)} note="Próximos 14 dias" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.45fr_.8fr]">
        <div className="surface-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
            <div>
              <h2 className="font-semibold tracking-tight text-slate-900">Casos prioritários</h2>
              <p className="mt-1 text-xs text-slate-500">Casos com próxima ação pendente ou risco elevado</p>
            </div>
            <Link href="/cases" className="text-xs font-semibold text-[#3157d5] hover:text-[#2747b3]">Ver todos</Link>
          </div>
          <div className="divide-y divide-slate-100">
            {recentCases.length === 0 ? <Empty label="Nenhum caso ativo" /> : recentCases.slice(0, 5).map((item) => (
              <Link key={item.id} href={`/cases/${item.id}`} className="group grid gap-4 px-6 py-4 transition hover:bg-[#f6f8fc] md:grid-cols-[1.1fr_.8fr_1fr_auto] md:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{item.clientName}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{item.caseType}</p>
                </div>
                <div><Badge variant="outline" className={`rounded-md capitalize ${priorityStyle[item.priority] ?? priorityStyle.medium}`}>{item.priority}</Badge></div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Próxima ação</p>
                  <p className="mt-1 truncate text-xs font-medium text-slate-700">{item.nextAction || "Revisar estado do caso"}</p>
                </div>
                <ChevronRight className="hidden h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[#3157d5] md:block" />
              </Link>
            ))}
          </div>
        </div>

        <div className="surface-card overflow-hidden">
          <div className="border-b border-slate-100 px-6 py-5">
            <div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-[#f2eefa] text-[#6852a5]"><Sparkles className="h-4 w-4" /></span><h2 className="font-semibold tracking-tight text-slate-900">Inteligência recente</h2></div>
            <p className="mt-1 text-xs text-slate-500">Sinais detectados nas informações recebidas</p>
          </div>
          <div className="space-y-1 p-3">
            {pendingActions.length === 0 ? <div className="px-3 py-12 text-center text-sm text-slate-400">Nenhum novo sinal detectado.</div> : pendingActions.slice(0, 4).map((action, index) => (
              <Link key={action.id} href={`/cases/${action.case.id}`} className="block rounded-lg px-3 py-3.5 transition hover:bg-[#f6f8fc]">
                <div className="flex gap-3">
                  <span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#f2eefa] text-[10px] font-bold text-[#6852a5]">{index + 1}</span>
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-medium leading-5 text-slate-800">{action.action}</p>
                    <p className="mt-1.5 truncate text-xs text-slate-400">{action.case.clientName} · {action.case.caseType}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <FocusCard icon={Inbox} title="Entradas sem associação" value="4" detail="Itens precisam ser vinculados a cliente e caso" link="Revisar entradas" href="/inbox?filter=needs_association" />
        <FocusCard icon={Clock3} title="Aguardando clientes" value="7" detail="Solicitações de informação sem resposta" link="Ver acompanhamentos" href="/communications" />
        <FocusCard icon={Check} title="Concluídas nesta semana" value="18" detail="Tarefas encerradas pelo escritório" link="Ver atividade" href="/actions?tab=approved" />
      </section>
    </div>
  )
}

function Metric({ icon: Icon, label, value, note, accent = false }: { icon: typeof FileStack; label: string; value: number; note: string; accent?: boolean }) {
  return (
    <div className={`surface-card p-5 transition hover:border-[#c8ced8] ${accent ? "ring-1 ring-[#3157d5]/15" : ""}`}>
      <div className="flex items-start justify-between"><p className="text-xs font-medium text-slate-500">{label}</p><Icon className={`h-4 w-4 ${accent ? "text-[#3157d5]" : "text-slate-400"}`} /></div>
      <p className="mt-5 text-3xl font-semibold tracking-[-0.04em] text-slate-950">{value}</p>
      <p className="mt-1 text-[11px] text-slate-400">{note}</p>
    </div>
  )
}

function FocusCard({ icon: Icon, title, value, detail, link, href }: { icon: typeof Inbox; title: string; value: string; detail: string; link: string; href: string }) {
  return (
    <Link href={href} className="surface-card group flex items-center gap-4 p-5 transition hover:-translate-y-0.5 hover:border-[#c8ced8] hover:shadow-[0_8px_24px_rgba(24,32,51,.08)]">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#edf1ff] text-[#3157d5]"><Icon className="h-[18px] w-[18px]" /></div>
      <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-slate-800">{title}</p><p className="mt-1 truncate text-[11px] text-slate-400">{detail}</p></div>
      <div className="text-right"><p className="text-xl font-semibold text-slate-900">{value}</p><p className="mt-1 text-[11px] font-medium text-[#3157d5] group-hover:underline">{link}</p></div>
    </Link>
  )
}

function Empty({ label }: { label: string }) {
  return <div className="grid min-h-[220px] place-items-center text-sm text-slate-400">{label}</div>
}
