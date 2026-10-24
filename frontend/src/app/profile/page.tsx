"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { ArrowLeft, Award, Bot, BrainCircuit, BriefcaseBusiness, Camera, CheckCircle2, Download, Flame, Gauge, Loader2, Mail, Pencil, Settings, Sparkles, Trophy } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type Profile = {
  name: string
  role: string
  email?: string | null
  bio?: string | null
  avatarUrl?: string | null
  createdAt: string
}

type Metrics = {
  headline: { totalTokens: number; peakTokens: number; longestTaskMs: number; longestStreak: number; currentStreak: number }
  tokenActivity: Array<{ key: string; label: string; tokens: number }>
  insights: { fastMode: number; mostUsedWorkflow: { name: string; percentage: number } | null; workflowsExplored: number; automationRuns: number }
  personalActivity: { reviews: number; appliedChanges: number; rejectedChanges: number; deadlineReviews: number }
  workspaceActivity: { cases: number; activeCases: number; processedEntries: number; completedTasks: number; communications: number }
  highlights: Array<{ id: string; title: string; description: string; achieved: boolean; progress: number; target: number }>
}

function compact(value: number) {
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value)
}

function duration(milliseconds: number) {
  if (!milliseconds) return "—"
  if (milliseconds < 1_000) return `${milliseconds} ms`
  if (milliseconds < 60_000) return `${(milliseconds / 1_000).toFixed(1).replace(".0", "")} s`
  const hours = Math.floor(milliseconds / 3_600_000)
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000)
  return hours ? `${hours} h ${minutes} min` : `${minutes} min`
}

export default function ProfilePage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarFailed, setAvatarFailed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      const response = await fetch("/api/profile", { cache: "no-store" })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Não foi possível carregar o perfil")
      setProfile(body.profile)
      setAvatarFailed(false)
      setMetrics(body.metrics)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar o perfil")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function changeAvatar(file?: File) {
    if (!file) return
    setAvatarUploading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append("avatar", file)
      const response = await fetch("/api/profile/avatar", { method: "POST", body: form })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Não foi possível trocar a foto")
      setProfile(body)
      setAvatarFailed(false)
      window.dispatchEvent(new Event("profile-updated"))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível trocar a foto")
    } finally {
      setAvatarUploading(false)
    }
  }

  if (loading) return <div className="grid min-h-[60vh] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
  if (!profile || !metrics) return <div className="surface-card p-8 text-center text-rose-700">{error || "Perfil indisponível"}</div>

  const initials = profile.name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()
  return (
    <div className="mx-auto max-w-[1240px] space-y-7">
      <Button
        variant="ghost"
        className="-ml-3 w-fit text-muted-foreground hover:text-foreground"
        onClick={() => window.history.length > 1 ? router.back() : router.push("/dashboard")}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Voltar
      </Button>
      <section className="overflow-hidden rounded-2xl border border-[#25272c] bg-[#0e0f12] text-white shadow-[0_18px_50px_rgba(14,15,18,.14)]">
        <div className="flex flex-col justify-between gap-6 p-6 sm:flex-row sm:items-center sm:p-8">
            <div className="flex min-w-0 items-center gap-4">
              <div className="group relative h-20 w-20 shrink-0">
                <div className="relative grid h-20 w-20 overflow-hidden rounded-2xl bg-primary text-2xl font-semibold text-primary-foreground">
                  {profile.avatarUrl && !avatarFailed ? <Image key={profile.avatarUrl} src={profile.avatarUrl} alt={`Foto de ${profile.name}`} fill unoptimized onError={() => setAvatarFailed(true)} className="object-cover" /> : <span className="grid place-items-center">{initials}</span>}
                </div>
                <label className="absolute -bottom-2 -right-2 grid h-8 w-8 cursor-pointer place-items-center rounded-full border-2 border-[#0e0f12] bg-white text-slate-900 shadow transition hover:scale-105" title="Trocar foto" aria-label="Trocar foto de perfil">
                  {avatarUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={avatarUploading} onChange={(event) => { void changeAvatar(event.target.files?.[0]); event.currentTarget.value = "" }} />
                </label>
              </div>
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">{profile.name}</h1><Badge className="border-white/10 bg-white/10 text-white hover:bg-white/10">Perfil local</Badge></div><p className="mt-1.5 text-sm text-white/55">{profile.role}</p>{profile.email && <p className="mt-2 flex items-center gap-2 text-xs text-white/40"><Mail className="h-3.5 w-3.5" />{profile.email}</p>}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <EditProfile profile={profile} onSaved={(updated) => setProfile(updated)} />
              <Button variant="outline" asChild className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"><Link href="/settings"><Settings className="mr-2 h-4 w-4" />Configurações</Link></Button>
            </div>
        </div>
        {profile.bio && <div className="border-t border-white/10 px-6 py-4 text-sm leading-6 text-white/55 sm:px-8">{profile.bio}</div>}
      </section>
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Tokens" value={compact(metrics.headline.totalTokens)} icon={Sparkles} />
        <Metric label="Pico diário" value={compact(metrics.headline.peakTokens)} icon={Gauge} />
        <Metric label="Execução mais longa" value={duration(metrics.headline.longestTaskMs)} icon={BrainCircuit} />
        <Metric label="Maior sequência pessoal" value={`${metrics.headline.longestStreak} dias`} icon={Trophy} />
        <Metric label="Sequência atual" value={`${metrics.headline.currentStreak} dias`} icon={Flame} accent />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.4fr_.8fr]">
        <TokenActivity values={metrics.tokenActivity} />
        <Card className="surface-card">
          <CardHeader><CardTitle className="text-lg">Insights</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <Insight label="Automação determinística" value={metrics.insights.fastMode ? `${metrics.insights.fastMode}% das execuções` : "Não usada"} />
            <Insight label="Fluxo mais usado" value={metrics.insights.mostUsedWorkflow ? `${metrics.insights.mostUsedWorkflow.name} · ${metrics.insights.mostUsedWorkflow.percentage}%` : "Sem dados"} />
            <Insight label="Fluxos explorados" value={String(metrics.insights.workflowsExplored)} />
            <Insight label="Execuções registradas" value={String(metrics.insights.automationRuns)} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card className="surface-card">
          <CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-lg">Destaques</CardTitle><Badge variant="secondary">{metrics.highlights.filter((item) => item.achieved).length}/{metrics.highlights.length}</Badge></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {metrics.highlights.map((item) => <Highlight key={item.id} item={item} />)}
          </CardContent>
        </Card>
        <Card className="surface-card">
          <CardHeader><CardTitle className="text-lg">Sua atividade de revisão</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <Activity label="Decisões tomadas" value={metrics.personalActivity.reviews} icon={BriefcaseBusiness} />
            <Activity label="Mudanças aplicadas" value={metrics.personalActivity.appliedChanges} icon={CheckCircle2} />
            <Activity label="Sugestões rejeitadas" value={metrics.personalActivity.rejectedChanges} icon={Bot} />
            <Activity label="Prazos revisados" value={metrics.personalActivity.deadlineReviews} icon={Award} />
          </CardContent>
        </Card>
      </section>

      <section className="surface-card grid gap-px overflow-hidden bg-slate-200 sm:grid-cols-3">
        <WorkspaceMetric label="Casos no espaço de trabalho" value={metrics.workspaceActivity.cases} />
        <WorkspaceMetric label="Entradas processadas" value={metrics.workspaceActivity.processedEntries} />
        <WorkspaceMetric label="Comunicações registradas" value={metrics.workspaceActivity.communications} />
      </section>

      <div className="flex justify-end"><Button variant="outline" asChild><a href="/api/profile/export" download><Download className="mr-2 h-4 w-4" />Exportar minha atividade</a></Button></div>
    </div>
  )
}

function Metric({ label, value, icon: Icon, accent = false }: { label: string; value: string; icon: typeof Sparkles; accent?: boolean }) {
  return <div className={`surface-card p-5 ${accent ? "ring-1 ring-primary/25" : ""}`}><div className="flex items-center justify-between"><Icon className={`h-4 w-4 ${accent ? "text-primary" : "text-muted-foreground"}`} /><span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span></div><p className="mt-5 text-2xl font-semibold tracking-tight text-foreground">{value}</p></div>
}

function TokenActivity({ values }: { values: Metrics["tokenActivity"] }) {
  const max = Math.max(1, ...values.map((item) => item.tokens))
  const hasUsage = values.some((item) => item.tokens > 0)
  return <Card className="surface-card"><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle className="text-lg">Atividade de tokens</CardTitle><Badge variant="outline">Instalação local</Badge></div></CardHeader><CardContent>{hasUsage ? <div className="flex h-52 items-end gap-2 border-b border-border pt-6">{values.map((item) => <div key={item.key} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2"><span className="text-[9px] text-muted-foreground">{item.tokens ? compact(item.tokens) : ""}</span><div className="w-full max-w-10 rounded-t-md bg-primary transition-all" style={{ height: `${Math.max(item.tokens ? 8 : 2, (item.tokens / max) * 150)}px`, opacity: item.tokens ? 1 : 0.14 }} /><span className="text-[10px] capitalize text-muted-foreground">{item.label}</span></div>)}</div> : <div className="grid h-52 place-items-center rounded-xl border border-dashed border-border bg-muted/60 text-center"><div><Sparkles className="mx-auto h-6 w-6 text-muted-foreground" /><p className="mt-3 text-sm font-medium text-foreground">Nenhum consumo de tokens registrado</p><p className="mt-1 text-xs text-muted-foreground">Execuções determinísticas não geram consumo artificial.</p></div></div>}</CardContent></Card>
}

function Insight({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-200 p-4"><p className="text-xs text-slate-400">{label}</p><p className="mt-2 truncate text-sm font-semibold text-slate-800" title={value}>{value}</p></div>
}

function Highlight({ item }: { item: Metrics["highlights"][number] }) {
  const percentage = Math.round((item.progress / item.target) * 100)
  return <div className={`rounded-xl border p-4 ${item.achieved ? "border-[var(--brand-border)] bg-[var(--brand-soft)]" : "border-border bg-muted/60"}`}><div className="flex items-start gap-3"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${item.achieved ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}><Trophy className="h-4 w-4" /></span><div><p className="text-sm font-semibold text-foreground">{item.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p></div></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${percentage}%` }} /></div><p className="mt-1.5 text-right text-[10px] text-muted-foreground">{item.progress}/{item.target}</p></div>
}

function Activity({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Award }) {
  return <div className="rounded-xl bg-muted p-4"><Icon className="h-4 w-4 text-primary" /><p className="mt-4 text-2xl font-semibold text-foreground">{value}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></div>
}

function WorkspaceMetric({ label, value }: { label: string; value: number }) {
  return <div className="bg-card p-5"><p className="text-2xl font-semibold text-foreground">{value}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></div>
}

function EditProfile({ profile, onSaved }: { profile: Profile; onSaved: (profile: Profile) => void }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: profile.name, role: profile.role, email: profile.email || "", bio: profile.bio || "" })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const changed = useMemo(() => form.name !== profile.name || form.role !== profile.role || form.email !== (profile.email || "") || form.bio !== (profile.bio || ""), [form, profile])

  async function save() {
    setSaving(true); setError(null)
    try {
      const response = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, email: form.email || null, bio: form.bio || null }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Não foi possível salvar")
      onSaved(body); setOpen(false)
      window.dispatchEvent(new Event("profile-updated"))
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar") } finally { setSaving(false) }
  }

  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button className="action-primary"><Pencil className="mr-2 h-4 w-4" />Editar perfil</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Editar perfil</DialogTitle><DialogDescription>Essas informações identificam o operador atual dentro do sistema.</DialogDescription></DialogHeader><div className="grid gap-4 py-3"><div className="grid gap-2"><Label>Nome</Label><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div><div className="grid gap-2"><Label>Função</Label><Input value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} /></div><div className="grid gap-2"><Label>E-mail</Label><Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></div><div className="grid gap-2"><Label>Sobre</Label><Textarea rows={4} value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} /></div>{error && <p className="text-sm text-rose-600">{error}</p>}</div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button className="action-primary" disabled={!changed || saving || form.name.trim().length < 2 || form.role.trim().length < 2} onClick={save}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar</Button></DialogFooter></DialogContent></Dialog>
}
