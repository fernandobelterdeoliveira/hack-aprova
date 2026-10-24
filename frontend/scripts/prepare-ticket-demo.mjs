import {writeFile,mkdir} from "node:fs/promises"
const base="http://127.0.0.1:3001"
async function api(path,options={}){const r=await fetch(base+path,options),body=await r.json();if(!r.ok)throw new Error(body.error);return body}
const processes=(await api("/api/municipal")).processes
const process=processes.find(p=>p.municipality==="DEMONSTRAÇÃO — Município Horizonte")
if(!process)throw new Error("Execute seed-municipal-demo.mjs para preparar o exemplo fictício.")
const list=await api(`/api/tickets?process=${process.id}`),summary=list.tickets.find(t=>t.processId===process.id)
let ticket=await api(`/api/tickets/${summary.id}`)
if(!ticket.currentVersionId)await api(`/api/tickets/${ticket.id}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"generate",requestKey:crypto.randomUUID()})})
for(let i=0;i<60;i++){ticket=await api(`/api/tickets/${summary.id}`);if(ticket.versions.length)break;if(ticket.jobs.some(j=>j.status==="dead_letter"))throw new Error(JSON.stringify(ticket.jobs));await new Promise(r=>setTimeout(r,500))}
const version=ticket.versions.find(v=>v.id===ticket.currentVersionId)
if(!version)throw new Error("A demonstração ainda não gerou uma versão.")
const message=ticket.messages.find(m=>m.formVersionId===version.id&&m.kind==="form")
if(!message)throw new Error("A demonstração precisa de informações adicionais: "+JSON.stringify(version.blockers))
const links={ticket:`${base}/communications?ticket=${ticket.id}`,form:`${base}/communications?ticket=${ticket.id}&form=${version.id}`,municipality:message.metadata.reviewUrl,version:version.number,status:version.status}
await mkdir("../artifacts",{recursive:true});await writeFile("../artifacts/ticket-demo-links.json",JSON.stringify(links,null,2));await writeFile("../artifacts/demo-form-definition.json",JSON.stringify(version.definition,null,2))
console.log(JSON.stringify({ticket:links.ticket,version:version.number,fields:version.definition.fields.length,status:version.status}))
