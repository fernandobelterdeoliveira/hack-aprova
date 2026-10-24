"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { useTheme } from "next-themes"
import { AlertTriangle, Bell, Check, CheckCircle2, Coins, Database, Download, FileArchive, Gauge, HardDrive, Loader2, MonitorCog, Palette, Plug, Save } from "lucide-react"
import { TicketConnectors } from "@/components/ticket-connectors"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"

type ConnectorStatus = { automaticReceiptEnabled: boolean; storageProvider: string }
type Preferences = {
  language: "pt-BR" | "en-US"
  timezone: "America/Sao_Paulo" | "America/New_York" | "Europe/Lisbon" | "UTC"
  theme: "light" | "dark" | "system"
  accentColor: "cobalt" | "emerald" | "violet"
  density: "comfortable" | "compact"
  emailNotifications: boolean
  deadlineNotifications: boolean
  reviewNotifications: boolean
  weeklyDigest: boolean
  telemetryEnabled: boolean
  dataRetentionDays: 90 | 180 | 365 | 730
}
type Usage = { headline: { totalTokens: number; currentMonthTokens: number; monthlyTokenLimit: number; remainingTokens: number; remainingTokenPercentage: number }; workspaceActivity: { cases: number; communications: number; storedFiles: number; storedBytes: number }; insights: { automationRuns: number } }

const sections = [
  { id: "connectors", label: "Conectores", icon: Plug },
  { id: "system", label: "Sistema", icon: MonitorCog },
  { id: "appearance", label: "Aparência", icon: Palette },
  { id: "notifications", label: "Notificações", icon: Bell },
  { id: "usage", label: "Uso", icon: Gauge },
  { id: "data", label: "Dados", icon: Database },
  { id: "billing", label: "Faturamento", icon: Coins },
  { id: "files", label: "Arquivos", icon: FileArchive },
] as const

type SectionId = typeof sections[number]["id"]

function applyThemePreview(theme: Preferences["theme"]) {
  const resolved = theme === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : theme
  document.documentElement.classList.remove("light", "dark")
  document.documentElement.classList.add(resolved)
  document.documentElement.style.colorScheme = resolved
}

export default function SettingsPage() {
  const { setTheme } = useTheme()
  const [section, setSection] = useState<SectionId>("system")
  const [status, setStatus] = useState<ConnectorStatus>({ automaticReceiptEnabled: false, storageProvider: "local" })
  const [preferences, setPreferences] = useState<Preferences | null>(null)
  const [original, setOriginal] = useState<Preferences | null>(null)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const savedPreferences = useRef<Preferences | null>(null)

  const load = useCallback(async () => {
    const [connectorsResponse, profileResponse] = await Promise.all([fetch("/api/connectors", { cache: "no-store" }), fetch("/api/profile", { cache: "no-store" })])
    const [connectors, profileData] = await Promise.all([connectorsResponse.json(), profileResponse.json()])
    if (!connectorsResponse.ok) throw new Error(connectors.error || "Não foi possível carregar os conectores")
    if (!profileResponse.ok) throw new Error(profileData.error || "Não foi possível carregar as preferências")
    setStatus({ automaticReceiptEnabled: connectors.automaticReceiptEnabled, storageProvider: connectors.storageProvider })
    const next: Preferences = profileData.profile
    setPreferences(next); setOriginal(next); savedPreferences.current = next; setUsage(profileData.metrics); setLoading(false)
    document.documentElement.dataset.accent = next.accentColor
    document.documentElement.dataset.density = next.density
  }, [])

  useEffect(() => { load().catch((cause) => { setError(cause instanceof Error ? cause.message : "Falha ao carregar configurações"); setLoading(false) }) }, [load])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const requestedSection = params.get("section")
    if (requestedSection && sections.some((item) => item.id === requestedSection)) setSection(requestedSection as SectionId)
    const connected = params.get("connected")
    const connectorError = params.get("connectorError")
    if (connected || connectorError || requestedSection === "plugins") setSection("connectors")
  }, [])

  useEffect(() => {
    function restoreSavedAppearance() {
      const saved = savedPreferences.current
      if (!saved) return
      applyThemePreview(saved.theme)
      document.documentElement.dataset.accent = saved.accentColor
      document.documentElement.dataset.density = saved.density
    }
    window.addEventListener("beforeunload", restoreSavedAppearance)
    return () => {
      window.removeEventListener("beforeunload", restoreSavedAppearance)
      restoreSavedAppearance()
    }
  }, [])

  function update<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setPreferences((current) => current ? { ...current, [key]: value } : current)
    setMessage(null)
    if (key === "theme") {
      applyThemePreview(value as Preferences["theme"])
    }
    if (key === "accentColor") {
      document.documentElement.dataset.accent = String(value)
    }
    if (key === "density") {
      document.documentElement.dataset.density = String(value)
    }
  }

  async function save() {
    if (!preferences) return
    setSaving(true); setError(null); setMessage(null)
    try {
      const response = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(preferences) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Não foi possível salvar")
      setOriginal(preferences)
      savedPreferences.current = preferences
      setTheme(preferences.theme)
      localStorage.setItem("theme", preferences.theme)
      localStorage.setItem("lexiloop-accent", preferences.accentColor)
      localStorage.setItem("lexiloop-density", preferences.density)
      setMessage("Configurações salvas")
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar") } finally { setSaving(false) }
  }

  const changed = Boolean(preferences && original && JSON.stringify(preferences) !== JSON.stringify(original))
  if (loading) return <div className="grid min-h-[60vh] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
  if (!preferences) return <div className="surface-card p-8 text-center text-rose-700">{error || "Configurações indisponíveis"}</div>

  return (
    <div className="mx-auto max-w-[1240px] space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><h1 className="page-title">Configurações</h1><div className="flex items-center gap-3">{message && <span className="flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />{message}</span>}<Button className="action-primary" disabled={!changed || saving} onClick={save}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Salvar alterações</Button></div></div>
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-2 lg:h-fit lg:flex-col">
          {sections.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => setSection(item.id)} className={`flex h-10 shrink-0 items-center gap-3 rounded-lg px-3 text-sm font-medium transition ${section === item.id ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}><Icon className="h-4 w-4" />{item.label}</button> })}
        </nav>

        <div className="min-w-0">
          {section === "connectors" && <TicketConnectors />}
          {section === "system" && <SystemSettings value={preferences} update={update} />}
          {section === "appearance" && <AppearanceSettings value={preferences} update={update} />}
          {section === "notifications" && <NotificationSettings value={preferences} update={update} />}
          {section === "usage" && <UsageSettings usage={usage} />}
          {section === "data" && <DataSettings value={preferences} update={update} />}
          {section === "billing" && <BillingSettings />}
          {section === "files" && <FileSettings status={status} usage={usage} value={preferences} update={update} />}
        </div>
      </div>
    </div>
  )
}

type Update = <K extends keyof Preferences>(key: K, value: Preferences[K]) => void

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <Card className="surface-card"><CardHeader><CardTitle className="text-xl">{title}</CardTitle></CardHeader><CardContent className="space-y-6">{children}</CardContent></Card>
}

function SystemSettings({ value, update }: { value: Preferences; update: Update }) {
  return <Section title="Sistema"><SettingRow title="Idioma principal"><Select value={value.language} onValueChange={(next: Preferences["language"]) => update("language", next)}><SelectTrigger className="w-full sm:w-64"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pt-BR">Português (Brasil)</SelectItem><SelectItem value="en-US">English (US)</SelectItem></SelectContent></Select></SettingRow><SettingRow title="Fuso horário"><Select value={value.timezone} onValueChange={(next: Preferences["timezone"]) => update("timezone", next)}><SelectTrigger className="w-full sm:w-64"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="America/Sao_Paulo">Brasília</SelectItem><SelectItem value="America/New_York">Nova York</SelectItem><SelectItem value="Europe/Lisbon">Lisboa</SelectItem><SelectItem value="UTC">UTC</SelectItem></SelectContent></Select></SettingRow><SettingRow title="Densidade da interface"><Select value={value.density} onValueChange={(next: Preferences["density"]) => update("density", next)}><SelectTrigger className="w-full sm:w-64"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="comfortable">Confortável</SelectItem><SelectItem value="compact">Compacta</SelectItem></SelectContent></Select></SettingRow></Section>
}

function AppearanceSettings({ value, update }: { value: Preferences; update: Update }) {
  const themePreview = { light: "#ffffff", dark: "#17181c", system: "linear-gradient(110deg,#ffffff 50%,#17181c 50%)" }
  const accentPreview = { cobalt: "#3157d5", emerald: "#10a37f", violet: "#7656c8" }
  return <Section title="Aparência"><div><Label className="mb-3 block">Tema</Label><div className="grid gap-3 sm:grid-cols-3">{(["light", "dark", "system"] as const).map((theme) => <button key={theme} onClick={() => update("theme", theme)} className={`rounded-xl border p-4 text-left transition ${value.theme === theme ? "border-primary ring-2 ring-primary/15" : "border-border hover:border-input"}`}><div className="mb-3 h-20 rounded-lg border border-border" style={{ background: themePreview[theme] }} /><p className="flex items-center justify-between text-sm font-semibold capitalize">{theme === "light" ? "Claro" : theme === "dark" ? "Escuro" : "Sistema"}{value.theme === theme && <Check className="h-4 w-4 text-primary" />}</p></button>)}</div></div><div><Label className="mb-3 block">Cor de destaque</Label><div className="flex gap-3">{(["cobalt", "emerald", "violet"] as const).map((accent) => <button key={accent} aria-label={`Cor ${accent}`} onClick={() => update("accentColor", accent)} style={{ backgroundColor: accentPreview[accent] }} className={`grid h-12 w-12 place-items-center rounded-full border-4 border-card shadow ring-2 ${value.accentColor === accent ? "ring-foreground" : "ring-border"}`}>{value.accentColor === accent && <Check className="h-5 w-5 text-white" />}</button>)}</div></div></Section>
}

function NotificationSettings({ value, update }: { value: Preferences; update: Update }) {
  return <Section title="Notificações"><Toggle title="Notificações por e-mail" checked={value.emailNotifications} onCheckedChange={(next) => update("emailNotifications", next)} /><Toggle title="Alertas de prazo" checked={value.deadlineNotifications} onCheckedChange={(next) => update("deadlineNotifications", next)} /><Toggle title="Fila de revisão" checked={value.reviewNotifications} onCheckedChange={(next) => update("reviewNotifications", next)} /><Toggle title="Resumo semanal" checked={value.weeklyDigest} onCheckedChange={(next) => update("weeklyDigest", next)} /></Section>
}

function UsageSettings({ usage }: { usage: Usage | null }) {
  const remaining = usage?.headline.remainingTokenPercentage ?? 100
  const cards = [{ label: "Execuções de IA", value: formatNumber(usage?.insights.automationRuns || 0) }, { label: "Casos", value: formatNumber(usage?.workspaceActivity.cases || 0) }, { label: "Comunicações", value: formatNumber(usage?.workspaceActivity.communications || 0) }]
  return <Section title="Uso"><div className="rounded-xl border border-border p-5"><div className="flex items-end justify-between gap-4"><div><p className="text-xs text-muted-foreground">Tokens disponíveis neste mês</p><p className="mt-3 text-3xl font-semibold text-foreground">{remaining}%</p></div><p className="text-right text-xs leading-5 text-muted-foreground">{formatNumber(usage?.headline.currentMonthTokens || 0)} usados<br />de {formatNumber(usage?.headline.monthlyTokenLimit || 1_000_000)}</p></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${remaining}%` }} /></div></div><div className="mt-3 grid gap-3 sm:grid-cols-3">{cards.map((item) => <div key={item.label} className="rounded-xl border border-border p-5"><p className="text-xs text-muted-foreground">{item.label}</p><p className="mt-3 text-2xl font-semibold text-foreground">{item.value}</p></div>)}</div></Section>
}

function DataSettings({ value, update }: { value: Preferences; update: Update }) {
  return <Section title="Dados e privacidade"><SettingRow title="Retenção dos dados operacionais"><Select value={String(value.dataRetentionDays)} onValueChange={(next) => update("dataRetentionDays", Number(next) as Preferences["dataRetentionDays"])}><SelectTrigger className="w-full sm:w-64"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="90">90 dias</SelectItem><SelectItem value="180">180 dias</SelectItem><SelectItem value="365">1 ano</SelectItem><SelectItem value="730">2 anos</SelectItem></SelectContent></Select></SettingRow><Toggle title="Telemetria de produto" checked={value.telemetryEnabled} onCheckedChange={(next) => update("telemetryEnabled", next)} /><div className="rounded-xl border border-slate-200 p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><p className="font-medium">Exportar dados da conta</p><p className="mt-1 text-xs text-slate-500">Baixa perfil, preferências e métricas em JSON.</p></div><Button variant="outline" asChild><a href="/api/profile/export" download><Download className="mr-2 h-4 w-4" />Exportar</a></Button></div></div></Section>
}

function BillingSettings() {
  return <Section title="Faturamento"><div className="rounded-xl border border-slate-200 p-5"><div className="flex items-start justify-between gap-4"><div><p className="font-semibold">Faturamento não configurado</p><p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">Nenhum provedor de cobrança está conectado. O sistema não gera cobranças nem faturas automaticamente.</p></div><Badge variant="secondary">Local</Badge></div><Button className="mt-5" variant="outline" disabled>Gerenciar faturamento</Button></div></Section>
}

function FileSettings({ status, usage, value, update }: { status: ConnectorStatus; usage: Usage | null; value: Preferences; update: Update }) {
  return <Section title="Arquivos e armazenamento"><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-border p-5"><HardDrive className="h-5 w-5 text-primary" /><p className="mt-4 text-2xl font-semibold">{formatBytes(usage?.workspaceActivity.storedBytes || 0)}</p><p className="mt-1 text-xs text-muted-foreground">Armazenamento utilizado</p></div><div className="rounded-xl border border-border p-5"><FileArchive className="h-5 w-5 text-primary" /><p className="mt-4 text-2xl font-semibold">{usage?.workspaceActivity.storedFiles || 0}</p><p className="mt-1 text-xs text-muted-foreground">Arquivos preservados</p></div></div><div className="rounded-xl border border-border p-4"><p className="font-medium">Destino atual: {status.storageProvider === "s3" ? "S3 privado" : "armazenamento local privado"}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Arquivos originais permanecem vinculados à origem para auditoria.</p></div><SettingRow title="Retenção dos arquivos"><Select value={String(value.dataRetentionDays)} onValueChange={(next) => update("dataRetentionDays", Number(next) as Preferences["dataRetentionDays"])}><SelectTrigger className="w-full sm:w-64"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="90">90 dias</SelectItem><SelectItem value="180">180 dias</SelectItem><SelectItem value="365">1 ano</SelectItem><SelectItem value="730">2 anos</SelectItem></SelectContent></Select></SettingRow><div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><p>Excluir arquivos continua sendo uma ação manual. A preferência de retenção não remove evidências automaticamente.</p></div></Section>
}

function SettingRow({ title, children }: { title: string; children: ReactNode }) { return <div className="flex flex-col justify-between gap-3 border-b border-slate-100 pb-5 last:border-0 last:pb-0 sm:flex-row sm:items-center"><p className="text-sm font-medium text-slate-800">{title}</p>{children}</div> }
function Toggle({ title, checked, onCheckedChange }: { title: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) { return <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-5 last:border-0 last:pb-0"><p className="text-sm font-medium text-slate-800">{title}</p><Switch checked={checked} onCheckedChange={onCheckedChange} /></div> }
function formatNumber(value: number) { return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value) }
function formatBytes(value: number) { if (!value) return "0 B"; const units = ["B", "KB", "MB", "GB", "TB"]; const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1); return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}` }
