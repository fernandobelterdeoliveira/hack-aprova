"use client"

import {useEffect,useState} from "react"
import Link from "next/link"
import {AlertTriangle,FileText,Loader2} from "lucide-react"
import type {Rule,Source} from "@/lib/municipal/domain"
import type {FormDefinition} from "@/lib/municipal/forms"

type ProcessRules={municipality:string;department:string;rules:Rule[];sources:Source[]}
type Version={id:string;number:number;status:string;definition:FormDefinition}
type TicketRules={currentVersionId:string|null;approvedVersionId:string|null;versions:Version[]}
export function MunicipalRulesPanel({processId,ticketId}:{processId:string;ticketId?:string}){
 const [result,setResult]=useState<{process:ProcessRules;ticket:TicketRules|null}|null>(null),[error,setError]=useState("")
 useEffect(()=>{const controller=new AbortController();setResult(null);setError("");void(async()=>{try{
  const responses=await Promise.all([fetch(`/api/municipal/${processId}`,{signal:controller.signal,cache:"no-store"}),...(ticketId?[fetch(`/api/tickets/${ticketId}`,{signal:controller.signal,cache:"no-store"})]:[])])
  if(responses.some(response=>!response.ok))throw new Error("Não foi possível consultar as regras do município.")
  const [process,ticket]=await Promise.all(responses.map(response=>response.json()));if(!controller.signal.aborted)setResult({process,ticket:ticket||null})
 }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Falha ao carregar as regras.")}})();return()=>controller.abort()},[processId,ticketId])
 if(error)return <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>
 if(!result)return <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Consultando regras e fontes…</p>
 const {process,ticket}=result,approved=ticket?.versions.find(version=>version.id===ticket.approvedVersionId),current=ticket?.versions.find(version=>version.id===ticket.currentVersionId),display=approved||current
 return <div className="space-y-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-medium">{process.municipality}</p><p className="mt-1 text-xs text-muted-foreground">{process.department} · {process.rules.length} dimensões de regras</p></div><div className="flex flex-wrap gap-3 text-xs font-medium text-primary">{ticketId&&<Link href={`/communications?ticket=${ticketId}${display?`&form=${display.id}`:""}`}>Abrir Ticket e formulário →</Link>}<Link href={`/municipal?process=${processId}`}>Revisar regras e fontes →</Link></div></div>
 {display&&<p className="rounded-lg bg-secondary p-3 text-sm">{approved?`Exibindo as regras do formulário aprovado v${approved.number}.`:`Exibindo a proposta do formulário v${display.number}; a aprovação profissional ainda está pendente.`}</p>}
 {approved&&current?.id!==approved.id&&<p className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>Existe um rascunho mais recente com alterações pendentes. A versão aprovada permanece como referência.</p>}
 <div className="grid gap-4 lg:grid-cols-2">{process.rules.map(rule=>{
  const section=display?.definition.sections.find(section=>section.id===rule.id||section.evidence.some(proof=>proof.ruleId===rule.id)),text=section?.text||rule.value,proof=section?.evidence.at(-1),source=process.sources.find(source=>source.id===(proof?.sourceId||rule.sourceId)),confirmed=Boolean(approved&&section)||rule.status==="approved"
  return <article key={rule.id} className="rounded-xl border border-border p-4"><div className="flex items-start justify-between gap-3"><h3 className="text-sm font-semibold">{rule.title}</h3><span className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold ${rule.conflict?"bg-amber-50 text-amber-900":confirmed?"bg-emerald-50 text-emerald-800":"bg-secondary text-muted-foreground"}`}>{rule.conflict?"Esclarecimento pendente":confirmed?"Validada":"Proposta"}</span></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6">{text||"Informação ainda não recebida. Colete a resposta pelo Ticket."}</p>{rule.conflict&&<p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">Nova informação a esclarecer: {rule.conflict.value}</p>}<div className="mt-4 border-t border-border pt-3"><p className="flex items-center gap-2 text-xs text-muted-foreground"><FileText className="h-3.5 w-3.5"/>{source?.name|| (proof?"Solicitação registrada no Ticket":"Aguardando fonte")}</p>{(proof?.excerpt||rule.excerpt)&&<details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer">Ver evidência de origem</summary><p className="mt-2 whitespace-pre-wrap leading-5">{proof?.excerpt||rule.excerpt}</p></details>}</div></article>
 })}</div></div>
}
