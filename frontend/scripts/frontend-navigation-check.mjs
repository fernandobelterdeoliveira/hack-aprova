import {writeFile} from "node:fs/promises"
import assert from "node:assert/strict"
const version=await fetch("http://127.0.0.1:9338/json/version").then(r=>r.json()),socket=new WebSocket(version.webSocketDebuggerUrl)
await new Promise((resolve,reject)=>{socket.addEventListener("open",resolve,{once:true});socket.addEventListener("error",reject,{once:true})})
let serial=0;const pending=new Map(),errors=[]
socket.addEventListener("message",event=>{const msg=JSON.parse(String(event.data));if(msg.id){const item=pending.get(msg.id);if(item){pending.delete(msg.id);clearTimeout(item.timer);if(msg.error)item.reject(new Error(msg.error.message));else item.resolve(msg.result)}}else if(msg.method==="Runtime.exceptionThrown")errors.push(msg.params.exceptionDetails.exception?.description||msg.params.exceptionDetails.text)})
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

const base="http://127.0.0.1:3001",reference=base+"/cases/municipal-case-validacao-referencia"
const click=(session,expression)=>evaluate(session,`${expression}.click()`)
async function capture(session,name){const shot=await call("Page.captureScreenshot",{format:"png",captureBeyondViewport:false,fromSurface:true},session);await writeFile("../artifacts/"+name,Buffer.from(shot.data,"base64"))}
async function queueChecks(session){
 const count=await evaluate(session,'document.querySelectorAll("[data-inbox-card]").length');assert.ok(count>0)
 assert.equal(await evaluate(session,'new Set(Array.from(document.querySelectorAll("[data-inbox-card]")).map(card=>card.dataset.sector)).size'),count)
 assert.equal(await evaluate(session,'Array.from(document.querySelectorAll("[data-inbox-card]")).every(card=>getComputedStyle(card).borderLeftWidth==="4px" && card.dataset.priority)'),true)
 const department=await evaluate(session,'document.querySelector("[data-inbox-card]").dataset.sector')
 await evaluate(session,`{const select=document.querySelector('select[aria-label="Filtrar por setor"]');select.value=${JSON.stringify(department)};select.dispatchEvent(new Event("change",{bubbles:true}))}`)
 await wait(session,'document.querySelectorAll("[data-inbox-card]").length===1')
 await evaluate(session,`{const select=document.querySelector('select[aria-label="Filtrar por setor"]');select.value="all";select.dispatchEvent(new Event("change",{bubbles:true}))}`)
 await wait(session,`document.querySelectorAll("[data-inbox-card]").length===${count}`)
 await click(session,'document.querySelector("[data-inbox-card]")')
 await wait(session,'Boolean(document.querySelector("[data-inbox-detail]")) && document.body.textContent.includes("O que chegou")')
 assert.equal(await evaluate(session,'document.querySelectorAll("[data-inbox-card]").length'),0)
 await capture(session,"fila-detail.png")
 const dimensions=await evaluate(session,'Array.from(document.querySelectorAll("[data-inbox-detail], [data-inbox-detail] + div, [data-inbox-detail] + div > div")).map(element=>({width:element.clientWidth,scroll:element.scrollWidth,tag:element.tagName,classes:element.className,wideChildren:Array.from(element.querySelectorAll("*")).filter(child=>child.scrollWidth>child.clientWidth+2).slice(0,8).map(child=>({tag:child.tagName,classes:child.className,width:child.clientWidth,scroll:child.scrollWidth}))}))')
 if(dimensions.some(element=>element.scroll>element.width+2))console.log(JSON.stringify({overflow:dimensions}))
 assert.ok(dimensions.every(element=>element.scroll<=element.width+2))
 await capture(session,"fila-detail.png")
 await click(session,'Array.from(document.querySelectorAll("button")).find(button=>button.textContent.includes("Voltar aos cards"))')
 await wait(session,`document.querySelectorAll("[data-inbox-card]").length===${count}`)
 await click(session,'document.querySelector("[data-inbox-card]")');await wait(session,'Boolean(document.querySelector("[data-inbox-detail]"))')
 await evaluate(session,'history.back()');await wait(session,`document.querySelectorAll("[data-inbox-card]").length===${count}`)
 // Existing links from global search must open an approved item, even with the default pending filter.
 const approved=await evaluate(session,'fetch("/api/inbox").then(r=>r.json()).then(items=>items.find(item=>item.reviewStatus==="approved").id)')
 await call("Page.navigate",{url:base+"/inbox?item="+approved},session)
 await wait(session,`document.querySelector("[data-inbox-detail]")?.getAttribute("data-inbox-detail")===${JSON.stringify(approved)}`)
 await click(session,'Array.from(document.querySelectorAll("button")).find(button=>button.textContent.includes("Voltar aos cards"))')
 await wait(session,'Boolean(document.querySelector("[data-inbox-card]"))')
 await click(session,'Array.from(document.querySelectorAll("button")).find(button=>button.textContent==="Revisar")')
 await wait(session,`document.querySelectorAll("[data-inbox-card]").length===${count}`)
 assert.equal(await evaluate(session,'document.documentElement.scrollWidth>innerWidth+2'),false)
}
async function tabChecks(session){
 assert.equal(await evaluate(session,'document.querySelectorAll("#municipal-panel > section[id]").length'),1)
 assert.ok(await evaluate(session,'Boolean(document.querySelector("#resumo")) && !document.querySelector("#dados")'))
 for(const tab of ["dados","timeline","fatos","atencao","lacunas","documentos","tarefas","fontes","inteligencia","regras"]){
  await click(session,`document.querySelector("#tab-${tab}")`);await wait(session,`Boolean(document.querySelector("#${tab}"))`)
  assert.equal(await evaluate(session,'document.querySelectorAll("#municipal-panel > section[id]").length'),1)
  assert.equal(await evaluate(session,`document.querySelector('[role="tab"][aria-selected="true"]').id`),"tab-"+tab)
 }
 await wait(session,'document.body.innerText.includes("Exceção solicitada para revisão") && document.body.innerText.includes("formulário aprovado v7")')
 assert.deepEqual(await evaluate(session,`Array.from(document.querySelectorAll('[role="tab"]')).slice(-2).map(tab=>tab.textContent)`),["Inteligência","Regras"])
 await capture(session,"municipio-regras.png")
 await evaluate(session,'document.querySelector("#tab-regras").dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowLeft",bubbles:true}))')
 await wait(session,'Boolean(document.querySelector("#inteligencia"))');assert.equal(await evaluate(session,'document.activeElement.id'),"tab-inteligencia")
 await click(session,`document.querySelector('a[href="#documentos"]')`);await wait(session,'Boolean(document.querySelector("#documentos")) && location.hash==="#documentos"')
 await click(session,'document.querySelector("#tab-resumo")');await wait(session,'Boolean(document.querySelector("#resumo")) && !document.querySelector("#documentos")')
 assert.equal(await evaluate(session,'document.documentElement.scrollWidth>innerWidth+2'),false)
}
try{
 await page("dashboard-clean.png",1440,1050,base+"/dashboard",'document.querySelector("h1")?.textContent === "Visão geral" && document.body.innerText.includes("Municípios prioritários")',async session=>{assert.equal(await evaluate(session,'/Entradas sem associação|Aguardando clientes|Concluídas nesta semana/.test(document.body.innerText)'),false)})
 await page("fila-cards.png",1440,1050,base+"/inbox",'Boolean(document.querySelector("[data-inbox-card]"))',queueChecks)
 await page("municipio-tabs.png",1440,1050,reference,'Boolean(document.querySelector("#resumo"))',tabChecks)
 await page("fila-cards-mobile.png",390,844,base+"/inbox",'Boolean(document.querySelector("[data-inbox-card]"))',queueChecks)
 await page("municipio-tabs-mobile.png",390,844,reference,'Boolean(document.querySelector("#resumo"))',tabChecks)
 await page("municipio-rule-deep-link.png",1200,1050,reference+"#regras",'Boolean(document.querySelector("#regras")) && document.body.innerText.includes("Exceção solicitada para revisão")')
 assert.deepEqual(errors,[]);console.log("PASS: dashboard section removed; sector cards, priorities, filtering, back navigation and inbox deep links; exclusive municipality tabs, Rules, keyboard and metric navigation; desktop/mobile without overflow. No records modified.")
}finally{await call("Browser.close").catch(()=>{})}
