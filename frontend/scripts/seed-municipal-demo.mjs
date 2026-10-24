const base="http://127.0.0.1:3001"
async function api(route, options={}) { const r=await fetch(base+route,options);const body=await r.json();if(!r.ok)throw new Error(body.error);return body }
const municipality="DEMONSTRAÇÃO — Município Horizonte"
const list=await api("/api/municipal");let process=list.processes.find(p=>p.municipality===municipality)
if(!process){
 process=await api("/api/municipal",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({municipality,department:"Desenvolvimento Econômico",name:"DEMO · Alvará de funcionamento",templateKey:"alvara",owner:"Equipe de demonstração"})})
 const content=["Pessoas físicas e jurídicas podem solicitar o serviço.","Os documentos obrigatórios são CPF ou CNPJ e comprovante de endereço.","A vistoria deve ocorrer antes da aprovação.","Atividades de baixo risco têm dispensa de vistoria.","O prazo de análise é de 10 dias úteis.","A secretaria é responsável pela triagem e o diretor aprova o pedido."].join(String.fromCharCode(10))
 process=await api(`/api/municipal/${process.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"source",version:process.version,name:"Relato fictício para demonstração — não é norma municipal",content})})
}
console.log(JSON.stringify({id:process.id,url:`${base}/municipal?process=${process.id}`,demonstration:true}))
