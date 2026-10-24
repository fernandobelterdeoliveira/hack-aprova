import {readFile,writeFile} from "node:fs/promises"
import assert from "node:assert/strict"
const links=JSON.parse(await readFile("../artifacts/ticket-demo-links.json","utf-8")),version=await fetch("http://127.0.0.1:9338/json/version").then(r=>r.json()),socket=new WebSocket(version.webSocketDebuggerUrl)
await new Promise((resolve,reject)=>{socket.addEventListener("open",resolve,{once:true});socket.addEventListener("error",reject,{once:true})})
let serial=0;const pending=new Map(),errors=[]
socket.addEventListener("message",event=>{const msg=JSON.parse(String(event.data));if(msg.id){const item=pending.get(msg.id);if(item){pending.delete(msg.id);clearTimeout(item.timer);if(msg.error)item.reject(new Error(msg.error.message));else item.resolve(msg.result)}}else if(msg.method==="Runtime.exceptionThrown")errors.push(msg.params.exceptionDetails.exception?.description||msg.params.exceptionDetails.text)})
function call(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(new Error("CDP timeout: "+method))},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}))})}
async function evaluate(session,expression){const result=await call("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true},session);if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value}
async function wait(session,expression){for(let i=0;i<150;i++){if(await evaluate(session,expression))return;await new Promise(r=>setTimeout(r,100))}throw new Error("UI condition was not reached: "+expression)}
async function page(name,width,height,url,condition,form=false){const {targetId}=await call("Target.createTarget",{url:"about:blank"}),{sessionId}=await call("Target.attachToTarget",{targetId,flatten:true});try{
 await call("Page.enable",{},sessionId);await call("Runtime.enable",{},sessionId);await call("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<500},sessionId);await call("Page.navigate",{url},sessionId);await wait(sessionId,condition)
 if(name.startsWith("ticket")){assert.equal(await evaluate(sessionId,'document.body.innerText.includes("Outros canais")'),false);assert.equal(await evaluate(sessionId,'document.documentElement.scrollWidth > window.innerWidth+2'),false)}
 if(form){await evaluate(sessionId,'Array.from(document.querySelectorAll("button")).find(button=>button.textContent.includes("Usar dados fictícios de teste")).click()');await wait(sessionId,'document.querySelector("#form-field-tipo_pessoa")?.value === "fisica"');assert.ok(await evaluate(sessionId,'Boolean(document.querySelector("#form-field-cpf"))'));await evaluate(sessionId,'{const select=document.querySelector("#form-field-tipo_pessoa");select.value="juridica";select.dispatchEvent(new Event("change",{bubbles:true}));}');await wait(sessionId,'Boolean(document.querySelector("#form-field-cnpj")) && !document.querySelector("#form-field-cpf")')}
 if(name.startsWith("municipio")||name==="inbox-municipal.png"){
  assert.equal(await evaluate(sessionId,'Array.from(document.querySelectorAll("nav a")).some(link=>link.getAttribute("href")==="/actions" || link.getAttribute("href")==="/municipal")'),false)
  assert.ok(await evaluate(sessionId,'Array.from(document.querySelectorAll("nav a")).some(link=>link.getAttribute("href")==="/cases" && link.textContent.includes("Municípios"))'))
  assert.equal(await evaluate(sessionId,'/fisioterapia|Sarah Johnson|João Silva/.test(document.body.innerText)'),false)
 }
 await new Promise(resolve=>setTimeout(resolve,450))
 const screenshot=await call("Page.captureScreenshot",{format:"png",captureBeyondViewport:false,fromSurface:true},sessionId);await writeFile("../artifacts/"+name,Buffer.from(screenshot.data,"base64"));console.log(JSON.stringify({screenshot:name,width,height,passed:true}))
 }finally{await call("Target.closeTarget",{targetId})}}
try{
 await page("ticket-desktop.png",1440,1050,links.ticket,'Boolean(document.querySelector("textarea")) && document.body.innerText.includes("Ver formulário v")')
 await page("ticket-mobile.png",390,844,links.ticket,'Boolean(document.querySelector("textarea")) && document.body.innerText.includes("Ver formulário v")')
 await page("ticket-form.png",1440,1050,links.form,'Boolean(document.querySelector("[role=dialog] #form-field-tipo_pessoa"))',true)
 await page("municipality-review.png",1200,1050,links.municipality,'Boolean(document.querySelector("#form-field-tipo_pessoa")) && document.body.innerText.includes("Análise da prefeitura")')
 await page("municipal-showcase.png",1440,1050,"http://127.0.0.1:3001/municipal",'document.body?.innerText.includes("Prefeitura de Serra Clara") && document.body?.innerText.includes("Prefeitura de Santa Aurora")')
 await page("municipios.png",1440,1050,"http://127.0.0.1:3001/cases",'document.querySelector("h1")?.textContent === "Municípios" && document.body.innerText.includes("TESTAR · Alvará")')
 await page("municipio-detalhe.png",1440,1050,"http://127.0.0.1:3001/cases/municipal-case-validacao-referencia#regras",'document.body?.innerText.includes("Exceção solicitada para revisão")')
 await page("inbox-municipal.png",1440,1050,"http://127.0.0.1:3001/inbox",'document.body?.innerText.includes("Prefeitura de")')
 assert.deepEqual(errors,[]);console.log("PASS: desktop/mobile chat layout, no Other Channels, public review, fillable modal and person-type conditional fields. No messages or approvals submitted.")
}finally{await call("Browser.close").catch(()=>{});socket.close()}
