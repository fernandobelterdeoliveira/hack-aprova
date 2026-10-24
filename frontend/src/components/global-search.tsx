"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { BriefcaseBusiness, FileText, Inbox, Loader2, Search, X } from "lucide-react"

type SearchResults = {
  cases: Array<{ id: string; clientName: string; caseNumber: string; caseType: string }>
  inbox: Array<{ id: string; senderName?: string | null; senderEmail?: string | null; rawContent: string; sourceType: string }>
  files: Array<{ id: string; name: string; type: string; case: { id: string; clientName: string; caseNumber: string } }>
}

const emptyResults: SearchResults = { cases: [], inbox: [], files: [] }

export function GlobalSearch() {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResults>(emptyResults)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", shortcut)
    return () => window.removeEventListener("keydown", shortcut)
  }, [])

  useEffect(() => {
    const normalized = query.trim()
    if (normalized.length < 2) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(normalized)}`, { signal: controller.signal })
        if (!response.ok) throw new Error("Falha na pesquisa")
        setResults(await response.json())
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setResults(emptyResults)
      } finally {
        setLoading(false)
      }
    }, 220)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [query])

  const hasResults = results.cases.length + results.inbox.length + results.files.length > 0

  return (
    <div className="relative min-w-0 flex-1 lg:max-w-xl" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
      <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        ref={inputRef}
        value={query}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); if (event.target.value.trim().length < 2) setResults(emptyResults) }}
        onFocus={() => setOpen(true)}
        aria-label="Pesquisar casos, clientes, documentos e mensagens"
        placeholder="Pesquisar..."
        className="h-10 w-full rounded-lg border border-border bg-muted/60 pl-10 pr-16 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:bg-card focus:ring-4 focus:ring-primary/10 sm:pr-24"
      />
      {query ? <button type="button" aria-label="Limpar pesquisa" onClick={() => { setQuery(""); setResults(emptyResults); inputRef.current?.focus() }} className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-3.5 w-3.5" /></button> : <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] text-slate-400 sm:block">Ctrl K</span>}

      {open && query.trim().length >= 2 && (
        <div className="absolute left-0 top-12 z-50 max-h-[min(70vh,520px)] w-[min(92vw,580px)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-900/15">
          {loading ? <div className="flex items-center justify-center gap-2 p-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Pesquisando...</div> : hasResults ? (
            <div className="space-y-2">
              <ResultGroup title="Casos" icon={BriefcaseBusiness}>{results.cases.map((item) => <ResultLink key={item.id} href={`/cases/${item.id}`} title={`${item.clientName} · #${item.caseNumber}`} detail={item.caseType} onOpen={() => setOpen(false)} />)}</ResultGroup>
              <ResultGroup title="Caixa de entrada" icon={Inbox}>{results.inbox.map((item) => <ResultLink key={item.id} href={`/inbox?item=${item.id}`} title={item.senderName || item.senderEmail || "Remetente desconhecido"} detail={item.rawContent} onOpen={() => setOpen(false)} />)}</ResultGroup>
              <ResultGroup title="Documentos" icon={FileText}>{results.files.map((item) => <ResultLink key={item.id} href={`/cases/${item.case.id}`} title={item.name} detail={`${item.case.clientName} · #${item.case.caseNumber}`} onOpen={() => setOpen(false)} />)}</ResultGroup>
            </div>
          ) : <div className="p-8 text-center"><Search className="mx-auto h-6 w-6 text-slate-300" /><p className="mt-2 text-sm font-medium text-slate-700">Nenhum resultado encontrado</p><p className="mt-1 text-xs text-slate-400">Tente nome, número do caso, documento ou mensagem.</p></div>}
        </div>
      )}
    </div>
  )
}

function ResultGroup({ title, icon: Icon, children }: { title: string; icon: typeof Search; children: ReactNode }) {
  if (!children || (Array.isArray(children) && children.length === 0)) return null
  return <section><p className="flex items-center gap-2 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><Icon className="h-3.5 w-3.5" />{title}</p><div>{children}</div></section>
}

function ResultLink({ href, title, detail, onOpen }: { href: string; title: string; detail: string; onOpen: () => void }) {
  return <a href={href} onClick={onOpen} className="block rounded-lg px-3 py-2.5 transition hover:bg-accent focus:bg-accent focus:outline-none"><p className="truncate text-sm font-semibold text-foreground">{title}</p><p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{detail}</p></a>
}
