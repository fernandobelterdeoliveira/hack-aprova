"use client"
import {useState} from "react"
import {TicketFormDialog,type TicketVersion} from "./ticket-form-dialog"
type Ticket={versions:TicketVersion[];currentVersionId:string|null;approvedVersionId:string|null}
export function SuggestedFormReview({ticketId,versionId}:{ticketId:string;versionId:string}){
 const [ticket,setTicket]=useState<Ticket|null>(null),[open,setOpen]=useState(false),[error,setError]=useState("")
 async function load(){const r=await fetch(`/api/tickets/${ticketId}`),body=await r.json();if(!r.ok)throw new Error(body.error);setTicket(body)}
 async function command(input:Record<string,unknown>){const r=await fetch(`/api/tickets/${ticketId}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)}),body=await r.json();if(!r.ok)throw new Error(body.error);await load();return body}
 return <><button className="mt-3 rounded-lg border px-3 py-2 text-xs font-medium" onClick={async()=>{try{setError("");await load();setOpen(true)}catch(e){setError(e instanceof Error?e.message:"Não foi possível abrir o formulário")}}}>Revisar formulário</button>{error&&<p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}{ticket&&<TicketFormDialog initialVersionId={versionId} open={open} close={()=>setOpen(false)} versions={ticket.versions} currentId={ticket.currentVersionId} approvedId={ticket.approvedVersionId} command={command}/>}</>
}
