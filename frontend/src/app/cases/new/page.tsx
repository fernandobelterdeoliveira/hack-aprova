"use client"

import { FormEvent, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Loader2, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type FormState = {
  clientName: string
  clientEmail: string
  clientPhone: string
  clientDob: string
  caseType: string
  caseNumber: string
  status: "open" | "active" | "pending" | "on-hold" | "closed"
  priority: "low" | "medium" | "high" | "urgent"
  assignedTo: string
  description: string
  nextAction: string
}

const initialForm: FormState = {
  clientName: "",
  clientEmail: "",
  clientPhone: "",
  clientDob: "",
  caseType: "",
  caseNumber: "",
  status: "open",
  priority: "medium",
  assignedTo: "Alex Reyes",
  description: "",
  nextAction: "Revisar informações iniciais e definir próximos passos",
}

export default function NovoCasoPage() {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(initialForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const response = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Não foi possível criar o caso")
      router.push(`/cases/${data.id}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível criar o caso")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-7">
      <div>
        <Button asChild variant="ghost" className="mb-4 -ml-3 text-slate-500">
          <Link href="/cases"><ArrowLeft className="mr-2 h-4 w-4" />Voltar para casos</Link>
        </Button>
        <p className="eyebrow mb-2">Novo cadastro</p>
        <h1 className="page-title">Criar novo caso</h1>
        <p className="mt-2 text-sm text-slate-500">Cadastre o cliente, os dados iniciais e a próxima ação do escritório.</p>
      </div>

      <form onSubmit={submit} className="surface-card space-y-7 p-6 md:p-8">
        <section className="space-y-4">
          <div><h2 className="font-semibold text-slate-900">Dados do cliente</h2><p className="mt-1 text-xs text-slate-500">Informações usadas para identificação e associação das novas entradas.</p></div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nome completo" required><Input value={form.clientName} onChange={(event) => update("clientName", event.target.value)} placeholder="João da Silva" required /></Field>
            <Field label="Data de nascimento" required><Input type="date" value={form.clientDob} onChange={(event) => update("clientDob", event.target.value)} required /></Field>
            <Field label="E-mail"><Input type="email" value={form.clientEmail} onChange={(event) => update("clientEmail", event.target.value)} placeholder="cliente@exemplo.com" /></Field>
            <Field label="Telefone"><Input value={form.clientPhone} onChange={(event) => update("clientPhone", event.target.value)} placeholder="+55 11 99999-9999" /></Field>
          </div>
        </section>

        <section className="space-y-4 border-t border-slate-100 pt-7">
          <div><h2 className="font-semibold text-slate-900">Dados do caso</h2><p className="mt-1 text-xs text-slate-500">O número pode ficar vazio para ser gerado automaticamente.</p></div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Tipo do caso" required><Input value={form.caseType} onChange={(event) => update("caseType", event.target.value)} placeholder="Acidente de trânsito" required /></Field>
            <Field label="Número do caso"><Input value={form.caseNumber} onChange={(event) => update("caseNumber", event.target.value)} placeholder="Gerado automaticamente" /></Field>
            <Field label="Status"><Select value={form.status} onValueChange={(value: FormState["status"]) => update("status", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="open">Aberto</SelectItem><SelectItem value="active">Ativo</SelectItem><SelectItem value="pending">Pendente</SelectItem><SelectItem value="on-hold">Em espera</SelectItem><SelectItem value="closed">Encerrado</SelectItem></SelectContent></Select></Field>
            <Field label="Prioridade"><Select value={form.priority} onValueChange={(value: FormState["priority"]) => update("priority", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Baixa</SelectItem><SelectItem value="medium">Média</SelectItem><SelectItem value="high">Alta</SelectItem><SelectItem value="urgent">Urgente</SelectItem></SelectContent></Select></Field>
            <Field label="Responsável" required><Input value={form.assignedTo} onChange={(event) => update("assignedTo", event.target.value)} required /></Field>
            <Field label="Próxima ação" required><Input value={form.nextAction} onChange={(event) => update("nextAction", event.target.value)} required /></Field>
          </div>
          <Field label="Resumo inicial" required><Textarea value={form.description} onChange={(event) => update("description", event.target.value)} rows={5} placeholder="Descreva o acontecimento, o objetivo do cliente e o que já sabemos." required /></Field>
        </section>

        {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:justify-end">
          <Button asChild type="button" variant="outline"><Link href="/cases">Cancelar</Link></Button>
          <Button type="submit" disabled={saving} className="action-primary">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {saving ? "Criando caso..." : "Criar caso"}
          </Button>
        </div>
      </form>
    </div>
  )
}

function Field({ label, required = false, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <div className="grid gap-2"><Label>{label}{required && <span className="ml-1 text-rose-600">*</span>}</Label>{children}</div>
}
