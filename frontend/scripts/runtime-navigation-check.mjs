import {readFile,writeFile} from "node:fs/promises"
import assert from "node:assert/strict"
import {PrismaClient} from "@prisma/client"
const version=await fetch("http://127.0.0.1:9338/json/version").then(r=>r.json()),socket=new WebSocket(version.webSocketDebuggerUrl)
await new Promise((resolve,reject)=>{socket.addEventListener("open",resolve,{once:true});socket.addEventListener("error",reject,{once:true})})
let serial=0;const pending=new Map(),errors=[],consoleErrors=[]
socket.addEventListener("message",event=>{const msg=JSON.parse(String(event.data));if(msg.id){const item=pending.get(msg.id);if(item){pending.delete(msg.id);clearTimeout(item.timer);if(msg.error)item.reject(new Error(msg.error.message));else item.resolve(msg.result)}}else if(msg.method==="Runtime.consoleAPICalled"&&msg.params.type==="error")consoleErrors.push(msg.params.args.map(arg=>arg.value||arg.description||"").join(" "));else if(msg.method==="Runtime.exceptionThrown")errors.push(msg.params.exceptionDetails.exception?.description||msg.params.exceptionDetails.text)})
function call(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(new Error("CDP timeout: "+method))},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}))})}
async function evaluate(session,expression){const result=await call("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true},session);if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value}
async function wait(session,expression){for(let i=0;i<150;i++){if(await evaluate(session,expression))return;await new Promise(r=>setTimeout(r,100))}throw new Error("UI condition was not reached: "+expression)}
async function page(name,width,height,url,condition,inspect){const {targetId}=await call("Target.createTarget",{url:"about:blank"}),{sessionId}=await call("Target.attachToTarget",{targetId,flatten:true});try{
 await call("Page.enable",{},sessionId);await call("Runtime.enable",{},sessionId);await call("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<500},sessionId);await call("Page.navigate",{url},sessionId);await wait(sessionId,condition)
 if(name.startsWith("ticket")){assert.equal(await evaluate(sessionId,'document.body.innerText.includes("Outros canais")'),false);assert.equal(await evaluate(sessionId,'document.documentElement.scrollWidth > window.innerWidth+2'),false)}
 if(name.startsWith("municipio")||name==="inbox-municipal.png"){
  assert.equal(await evaluate(sessionId,'Array.from(document.querySelectorAll("nav a")).some(link=>link.getAttribute("href")==="/actions" || link.getAttribute("href")==="/municipal")'),false)
  assert.ok(await evaluate(sessionId,'Array.from(document.querySelectorAll("nav a")).some(link=>link.getAttribute("href")==="/cases" && link.textContent.includes("Municípios"))'))
  assert.equal(await evaluate(sessionId,'/fisioterapia|Sarah Johnson|João Silva/.test(document.body.innerText)'),false)
 }
 if(inspect)await inspect(sessionId)
 await new Promise(resolve=>setTimeout(resolve,450))
 const screenshot=await call("Page.captureScreenshot",{format:"png",captureBeyondViewport:false,fromSurface:true},sessionId);await writeFile("../artifacts/"+name,Buffer.from(screenshot.data,"base64"));console.log(JSON.stringify({screenshot:name,width,height,passed:true}))
 }finally{await call("Target.closeTarget",{targetId})}}



const base="http://127.0.0.1:3001",db=new PrismaClient(),links=JSON.parse(await readFile("../artifacts/municipal-validation.json","utf-8")),tag=`EMPTY-FORM-${crypto.randomUUID()}`
let fixture
async function api(path,data){const response=await fetch(base+path,{method:data?"POST":"GET",headers:{Origin:base,"Content-Type":"application/json"},...(data?{body:JSON.stringify(data)}:{})}),body=await response.json();assert.ok(response.ok,JSON.stringify(body));return body}
try{
 fixture=await api("/api/municipal",{municipality:`Prefeitura fictícia ${tag}`,department:"Setor de teste",name:tag,owner:"Regressão do formulário vazio",templateKey:"alvara"})
 const list=await api(`/api/tickets?process=${fixture.id}`),ticket=list.tickets.find(ticket=>ticket.processId===fixture.id)
 assert.equal((await api(`/api/tickets/${ticket.id}`)).versions.length,0)
 const emptyUrl=base+"/communications?ticket="+ticket.id,loaded=`document.querySelector(".ticket-panel > section > header h2")?.textContent.includes(${JSON.stringify(tag)})`
 await page("runtime-navigation.png",1440,1050,emptyUrl,loaded,async session=>{
  const click=expression=>evaluate(session,`${expression}.click()`)
  assert.equal(await evaluate(session,'document.querySelector("h1").textContent'),"Formulários")
  assert.equal(await evaluate(session,`document.querySelector('nav a[href="/inbox"]').textContent`),"Ticket")
  assert.equal(await evaluate(session,`document.querySelector('nav a[href="/communications"]').textContent`),"Formulários")
  assert.equal(await evaluate(session,'Array.from(document.querySelectorAll("button")).some(button=>button.textContent.includes("Ver formulário v"))'),false)
  await call("Page.navigate",{url:emptyUrl+"&form=not-generated"},session)
  await wait(session,`Boolean(document.querySelector('[role="dialog"]')) && document.body.textContent.includes("A geração ainda não produziu uma versão.")`)
  assert.equal(await evaluate(session,`Array.from(document.querySelector('[role="dialog"]').querySelectorAll("button")).some(button=>button.textContent.includes("Aprovar versão final")||button.textContent.includes("Testar preenchimento"))`),false)
  await click(`document.querySelector('[role="dialog"] [data-slot="dialog-close"]')`);await wait(session,`!document.querySelector('[role="dialog"]')`)
  await click(`document.querySelector('nav a[href="/inbox"]')`);await wait(session,'Boolean(document.querySelector("[data-inbox-card]"))')
  await click('document.querySelector("[data-inbox-card]")');await wait(session,'Boolean(document.querySelector("[data-inbox-detail]"))')
  await click(`document.querySelector('nav a[href="/cases"]')`);await wait(session,'document.querySelector("h1")?.textContent==="Municípios"')
  await click(`document.querySelector('a[href="/cases/municipal-case-validacao-referencia"]')`);await wait(session,'Boolean(document.querySelector("#tab-regras"))')
  await click('document.querySelector("#tab-regras")');await wait(session,'Boolean(document.querySelector("#regras")) && document.body.innerText.includes("Exceção solicitada para revisão")')
  await call("Page.navigate",{url:links.reference.form},session)
  await wait(session,`Boolean(document.querySelector('[role="dialog"] #form-field-tipo_pessoa'))`)
  await click(`document.querySelector('[role="dialog"] [data-slot="dialog-close"]')`)
  await click(`document.querySelector('nav a[href="/dashboard"]')`);await wait(session,'document.querySelector("h1")?.textContent==="Visão geral"')
  await call("Page.navigate",{url:emptyUrl},session);await wait(session,loaded)
  assert.equal((await api(`/api/tickets/${ticket.id}`)).versions.length,0)
  console.log(JSON.stringify({runtimeErrors:errors,consoleErrors,emptyTicket:true,emptyDialog:true,existingForm:true,clientNavigation:true}));assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[])
 })
}catch(error){console.error(JSON.stringify({runtimeErrors:errors,consoleErrors}));throw error}
finally{
 await call("Browser.close").catch(()=>{})
 if(fixture){const ticket=await db.municipalTicket.findUnique({where:{processId:fixture.id}});if(ticket){const jobs={type:"MUNICIPAL_TICKET",payload:{path:["ticketId"],equals:ticket.id}};assert.equal(await db.backgroundJob.count({where:{...jobs,status:{in:["queued","running"]}}}),0);await db.backgroundJob.deleteMany({where:jobs})}await db.municipalProcess.deleteMany({where:{id:fixture.id,municipality:`Prefeitura fictícia ${tag}`}})}
 await db.$disconnect()
}
