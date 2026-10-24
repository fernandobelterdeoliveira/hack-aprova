"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Mail, Phone, Calendar, FileText, Search, Clock, AlertCircle, MessageSquare, Loader2, Plus, Eye, Download, Paperclip } from "lucide-react"
import Link from "next/link"

type CommunicationType = "email" | "sms" | "call" | "meeting" | "document"

interface Communication {
  id: string
  caseId: string
  caseName: string
  type: CommunicationType
  subject: string
  from: string
  to: string
  date: string
  content: string
  direction?: "received" | "sent"
  avatarUrl?: string | null
  attachments?: Array<{ id: string; name: string; mimeType: string; sizeBytes: number; downloadUrl: string; previewUrl: string }>
  case: {
    id: string
    clientName: string
    caseType: string
  }
}

interface CaseOption {
  id: string
  caseNumber: string
  clientName: string
  caseType: string
}

export default function LegacyCommunications() {
  const [communications, setCommunications] = useState<Communication[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterType, setFilterType] = useState<CommunicationType | "all">("all")

  useEffect(() => {
    async function fetchCommunications() {
      try {
        setLoading(true)
        const response = await fetch('/api/communications')
        
        if (!response.ok) {
          throw new Error('Não foi possível carregar as comunicações')
        }
        
        const data = await response.json()
        setCommunications(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ocorreu um erro')
      } finally {
        setLoading(false)
      }
    }

    fetchCommunications()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Clock className="h-12 w-12 text-muted-foreground mb-4 mx-auto animate-spin" />
          <p className="text-lg font-medium text-black">Carregando comunicações...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-destructive mb-4 mx-auto" />
          <p className="text-lg font-medium">Erro ao carregar comunicações</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    )
  }

  // Filter by search only first
  const searchFiltered = communications.filter((comm) => {
    const matchesSearch =
      comm.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      comm.from.toLowerCase().includes(searchQuery.toLowerCase()) ||
      comm.to.toLowerCase().includes(searchQuery.toLowerCase()) ||
      comm.caseName.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesSearch
  })

  // Calculate counts from search-filtered results
  const emailComms = searchFiltered.filter((c) => c.type === "email")
  const smsComms = searchFiltered.filter((c) => c.type === "sms")
  const callComms = searchFiltered.filter((c) => c.type === "call")
  const meetingComms = searchFiltered.filter((c) => c.type === "meeting")
  const documentComms = searchFiltered.filter((c) => c.type === "document")

  // Apply type filter for display
  const filteredComms = filterType === "all" 
    ? searchFiltered 
    : searchFiltered.filter((c) => c.type === filterType)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-black">Comunicações</h1>
        </div>
        <NewCommunicationDialog onCreated={(communication) => setCommunications((current) => [communication, ...current])} />
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar comunicações..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>
        </CardContent>
      </Card>

      {/* Communications Tabs */}
      <Tabs defaultValue="all" className="space-y-4">
        <TabsList className="max-w-full justify-start overflow-x-auto">
          <TabsTrigger className="shrink-0" value="all" onClick={() => setFilterType("all")}>
            Todas <Badge className="ml-2">{searchFiltered.length}</Badge>
          </TabsTrigger>
          <TabsTrigger className="shrink-0" value="email" onClick={() => setFilterType("email")}>
            E-mails <Badge className="ml-2">{emailComms.length}</Badge>
          </TabsTrigger>
          <TabsTrigger className="shrink-0" value="sms" onClick={() => setFilterType("sms")}>
            SMS <Badge className="ml-2">{smsComms.length}</Badge>
          </TabsTrigger>
          <TabsTrigger className="shrink-0" value="call" onClick={() => setFilterType("call")}>
            Chamadas <Badge className="ml-2">{callComms.length}</Badge>
          </TabsTrigger>
          <TabsTrigger className="shrink-0" value="meeting" onClick={() => setFilterType("meeting")}>
            Reuniões <Badge className="ml-2">{meetingComms.length}</Badge>
          </TabsTrigger>
          <TabsTrigger className="shrink-0" value="document" onClick={() => setFilterType("document")}>
            Documentos <Badge className="ml-2">{documentComms.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          <CommunicationsList communications={filteredComms} />
        </TabsContent>

        <TabsContent value="email" className="space-y-4">
          <CommunicationsList communications={emailComms} />
        </TabsContent>

        <TabsContent value="sms" className="space-y-4">
          <CommunicationsList communications={smsComms} />
        </TabsContent>

        <TabsContent value="call" className="space-y-4">
          <CommunicationsList communications={callComms} />
        </TabsContent>

        <TabsContent value="meeting" className="space-y-4">
          <CommunicationsList communications={meetingComms} />
        </TabsContent>

        <TabsContent value="document" className="space-y-4">
          <CommunicationsList communications={documentComms} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function NewCommunicationDialog({ onCreated }: { onCreated: (communication: Communication) => void }) {
  const [open, setOpen] = useState(false)
  const [cases, setCases] = useState<CaseOption[]>([])
  const [caseId, setCaseId] = useState("")
  const [type, setType] = useState<"email" | "sms" | "call">("email")
  const [subject, setSubject] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [content, setContent] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || cases.length) return
    fetch("/api/cases")
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || "Não foi possível carregar os casos")
        setCases(body)
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Não foi possível carregar os casos"))
  }, [cases.length, open])

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch("/api/communications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId, type, subject: subject || undefined, from, to, content }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Não foi possível registrar a comunicação")
      onCreated(body)
      setOpen(false)
      setSubject("")
      setFrom("")
      setTo("")
      setContent("")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível registrar a comunicação")
    } finally {
      setSubmitting(false)
    }
  }

  const valid = caseId && from.trim() && to.trim() && content.trim() && (type !== "email" || subject.trim())

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="action-primary"><Plus className="mr-2 h-4 w-4" />Nova comunicação</Button></DialogTrigger>
      <DialogContent className="sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>Registrar comunicação</DialogTitle>
          <DialogDescription>Adicione ao histórico uma comunicação que já aconteceu. Este formulário não envia mensagens.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-3">
          <div className="grid gap-2">
            <Label>Caso</Label>
            <Select value={caseId} onValueChange={setCaseId}><SelectTrigger><SelectValue placeholder="Selecione um caso" /></SelectTrigger><SelectContent>{cases.map((item) => <SelectItem key={item.id} value={item.id}>#{item.caseNumber} · {item.clientName}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="grid gap-2">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={(value: "email" | "sms" | "call") => setType(value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="email">E-mail</SelectItem><SelectItem value="sms">SMS</SelectItem><SelectItem value="call">Ligação</SelectItem></SelectContent></Select>
          </div>
          {type === "email" && <div className="grid gap-2"><Label>Assunto</Label><Input value={subject} onChange={(event) => setSubject(event.target.value)} /></div>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2"><Label>De</Label><Input value={from} onChange={(event) => setFrom(event.target.value)} placeholder={type === "call" ? "Escritório" : "remetente@exemplo.com"} /></div>
            <div className="grid gap-2"><Label>Para</Label><Input value={to} onChange={(event) => setTo(event.target.value)} placeholder={type === "call" ? "+55 11 99999-9999" : "destinatario@exemplo.com"} /></div>
          </div>
          <div className="grid gap-2"><Label>{type === "call" ? "Resumo da ligação" : "Conteúdo"}</Label><Textarea rows={6} value={content} onChange={(event) => setContent(event.target.value)} /></div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button className="action-primary" disabled={!valid || submitting} onClick={submit}>{submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Registrar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CommunicationsList({ communications }: { communications: Communication[] }) {
  if (communications.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <p className="text-lg font-medium">Nenhuma comunicação encontrada</p>
          <p className="text-sm text-muted-foreground">Tente ajustar a pesquisa</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
      {communications.map((comm) => <CommunicationRow key={comm.id} communication={comm} />)}
    </div>
  )
}

function CommunicationRow({ communication: comm }: { communication: Communication }) {
  const [open, setOpen] = useState(false)
  const Icon = comm.type === "email" ? Mail : comm.type === "sms" ? MessageSquare : comm.type === "call" ? Phone : comm.type === "meeting" ? Calendar : FileText
  const typeLabel = comm.type === "email" ? "E-mail" : comm.type === "sms" ? "Mensagem" : comm.type === "call" ? "Ligação" : comm.type === "meeting" ? "Reunião" : "Documento"

  return <>
    <button type="button" onClick={() => setOpen(true)} className="flex w-full items-start gap-3 p-4 text-left transition hover:bg-muted/55 sm:p-5">
      {comm.avatarUrl ? <Avatar className="h-10 w-10"><AvatarImage src={comm.avatarUrl} alt={`Foto de ${comm.from}`} className="object-cover" /><AvatarFallback>{initials(comm.from)}</AvatarFallback></Avatar> : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold text-foreground">{comm.subject}</p><Badge variant="outline" className="text-[10px]">{comm.direction === "received" ? "Recebida" : "Registrada"}</Badge></div>
        <p className="mt-1 truncate text-xs text-muted-foreground">{comm.from} → {comm.to}</p>
        <p className="mt-2 line-clamp-2 text-sm leading-5 text-muted-foreground">{comm.content}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground"><span>{new Date(comm.date).toLocaleString("pt-BR")}</span><span>{comm.caseName}</span>{Boolean(comm.attachments?.length) && <span className="flex items-center gap-1"><Paperclip className="h-3 w-3" />{comm.attachments?.length} {comm.attachments?.length === 1 ? "anexo" : "anexos"}</span>}</div>
      </div>
      <span className="hidden shrink-0 items-center gap-1 text-xs font-semibold text-primary sm:flex"><Eye className="h-4 w-4" />Abrir</span>
    </button>

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[820px]">
        <DialogHeader>
          <div className="mb-2 flex flex-wrap items-center gap-2"><Badge variant="secondary">{typeLabel}</Badge><Badge variant="outline">{comm.direction === "received" ? "Recebida" : "Registrada"}</Badge></div>
          <DialogTitle>{comm.subject}</DialogTitle>
          <DialogDescription>{comm.from} → {comm.to} · {new Date(comm.date).toLocaleString("pt-BR")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm whitespace-pre-wrap leading-6 text-foreground">{comm.content}</div>
          {comm.attachments?.map((attachment) => <AttachmentPreview key={attachment.id} attachment={attachment} />)}
          <div className="flex items-center justify-between gap-3 border-t border-border pt-4"><p className="text-xs text-muted-foreground">Vinculada a {comm.caseName}</p><Button asChild variant="outline" size="sm"><Link href={`/cases/${comm.case.id}`}>Abrir caso</Link></Button></div>
        </div>
      </DialogContent>
    </Dialog>
  </>
}

function AttachmentPreview({ attachment }: { attachment: NonNullable<Communication["attachments"]>[number] }) {
  const isImage = attachment.mimeType.startsWith("image/")
  const isPdf = attachment.mimeType === "application/pdf"
  return <section className="overflow-hidden rounded-xl border border-border">
    <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/35 px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{attachment.name}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{formatFileSize(attachment.sizeBytes)}</p></div><Button asChild variant="outline" size="sm"><a href={attachment.downloadUrl}><Download className="mr-2 h-4 w-4" />Baixar</a></Button></div>
    {isImage && <div className="relative min-h-72 bg-slate-950/5"><Image src={attachment.previewUrl} alt={attachment.name} fill unoptimized className="object-contain" /></div>}
    {isPdf && <iframe title={attachment.name} src={attachment.previewUrl} className="h-[520px] w-full bg-white" />}
    {!isImage && !isPdf && <div className="grid min-h-32 place-items-center p-6 text-center"><div><FileText className="mx-auto h-7 w-7 text-muted-foreground" /><p className="mt-2 text-sm text-muted-foreground">Este formato está disponível para download.</p></div></div>}
  </section>
}

function formatFileSize(bytes: number) {
  if (!bytes) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "?"
}
