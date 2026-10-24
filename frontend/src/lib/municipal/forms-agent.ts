import { definitionSchema, localDefinition, localCorrection, definitionIssues, type FormDefinition, type GenerationContext } from "./forms"
export async function resolveForm(context:GenerationContext,previous?:FormDefinition,request?:{id:string;content:string}){
 const fallback=()=>previous&&request?localCorrection(previous,request.content,request.id):localDefinition(context)
 try{
  const response=await fetch(`${process.env.PYTHON_BACKEND_URL||"http://127.0.0.1:8000"}/api/municipal/form`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({context,previous:previous||null,request:request||null}),signal:AbortSignal.timeout(26000)})
  if(response.ok){const result=await response.json();if(result.mode!=="local"){
   const definition=definitionSchema.parse(result.definition)
   if(JSON.stringify(definition.context)!==JSON.stringify({processId:context.id,municipality:context.municipality,department:context.department,owner:context.owner}))throw new Error("Contexto de geração incompatível")
   const sources=new Map(context.sources.map(source=>[source.id,source.content]));if(request)sources.set(request.id,request.content)
   for(const item of [...definition.fields,...definition.sections])for(const proof of item.evidence){const source=sources.get(proof.sourceId);if(!source||!(proof.excerpt.trim()&&proof.excerpt.split("\n").filter(line=>line.trim()).every(line=>source.includes(line))))throw new Error("Proposta sem evidência verificável")}
   if(!Array.isArray(result.blockers)||!result.blockers.every((v:unknown)=>typeof v==="string"))throw new Error("Pendências inválidas")
   return{definition,blockers:[...result.blockers,...definitionIssues(definition)],mode:`gemini:${result.model||"configured"}`}
  }}
 }catch{const local=fallback();local.definition.warnings.push("A IA não respondeu com uma proposta verificável; aplicado o modo local, com revisão obrigatória.");return local}
 return fallback()
}
