import { z } from "zod"
import type { Rule, Source } from "./domain"
const conditionSchema=z.object({field:z.string(),operator:z.enum(["equals","not_equals","in","greater_than","less_than","present"]),value:z.union([z.string(),z.number(),z.boolean(),z.array(z.string())]).optional()}).strict()
const evidenceSchema=z.object({sourceId:z.string().min(1),excerpt:z.string().min(1),ruleId:z.string().optional()}).strict()
export const fieldSchema=z.object({id:z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),label:z.string().trim().min(1).max(150),type:z.enum(["text","textarea","email","number","date","select","checkbox","file","cpf","cnpj"]),help:z.string().max(2000).default(""),required:z.boolean().default(false),options:z.array(z.object({value:z.string(),label:z.string()})).max(100).optional(),visibleWhen:z.array(conditionSchema).max(8).optional(),requiredWhen:z.array(conditionSchema).max(8).optional(),validation:z.object({min:z.number().optional(),max:z.number().optional(),minLength:z.number().int().nonnegative().optional(),maxLength:z.number().int().positive().max(10000).optional(),maxFileMB:z.number().positive().max(25).optional(),fileTypes:z.array(z.string()).optional()}).strict().optional(),evidence:z.array(evidenceSchema).min(1)}).strict()
export const definitionSchema=z.object({schemaVersion:z.literal(1),title:z.string().min(1).max(200),description:z.string().max(4000),context:z.object({processId:z.string(),municipality:z.string(),department:z.string(),owner:z.string()}).strict(),fields:z.array(fieldSchema).max(100),sections:z.array(z.object({id:z.string(),title:z.string(),text:z.string(),evidence:z.array(evidenceSchema).min(1)})).max(30),warnings:z.array(z.string()).default([])}).strict()
export type FormField=z.infer<typeof fieldSchema>
export type FormDefinition=z.infer<typeof definitionSchema>
export type FormValues=Record<string,unknown>
export type FormCondition=z.infer<typeof conditionSchema>
export const normalized=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim()
export function conditionsMatch(conditions:FormCondition[]|undefined,values:FormValues){return !conditions?.length||conditions.every(c=>{const v=values[c.field];switch(c.operator){case"equals":return String(v)===String(c.value);case"not_equals":return v!==undefined&&String(v)!==String(c.value);case"in":return Array.isArray(c.value)&&c.value.includes(String(v));case"greater_than":return v!==""&&Number(v)>Number(c.value);case"less_than":return v!==""&&Number(v)<Number(c.value);case"present":return v!==undefined&&v!==""&&v!==null&&v!==false}})}
export function isVisible(field:FormField,values:FormValues){return conditionsMatch(field.visibleWhen,values)}
export function isRequired(field:FormField,values:FormValues){return field.required||Boolean(field.requiredWhen?.length&&conditionsMatch(field.requiredWhen,values))}
function validDocument(value:string,kind:"cpf"|"cnpj"){
 const n=value.toUpperCase().replace(/[.\/\-\s]/g,"");if(new Set(n).size<2)return false
 if(kind==="cpf"){if(!/^\d{11}$/.test(n))return false;for(let length=9;length<=10;length++){let sum=0;for(let i=0;i<length;i++)sum+=Number(n[i])*(length+1-i);const check=(sum*10)%11;if((check===10?0:check)!==Number(n[length]))return false}return true}
 if(!/^[A-Z0-9]{12}\d{2}$/.test(n))return false;for(let length=12;length<=13;length++){let sum=0,weight=length-7;for(let i=0;i<length;i++){sum+=(n.charCodeAt(i)-48)*weight;if(--weight<2)weight=9}const remainder=sum%11;if((remainder<2?0:11-remainder)!==Number(n[length]))return false}return true
}
export function validateValues(definition:FormDefinition,values:FormValues){
 const errors:Record<string,string>={}
 if(!definition.fields.length)errors._form="O formulário ainda não possui campos gerados para preenchimento."
 for(const f of definition.fields){
  if(!isVisible(f,values))continue
  const value=values[f.id],empty=value===undefined||value===null||value===""||Array.isArray(value)&&value.length===0||f.type==="checkbox"&&value===false
  if(empty){if(isRequired(f,values))errors[f.id]="Preenchimento obrigatório.";continue}
  const text=String(value),v=f.validation
  if(f.type==="checkbox"&&typeof value!=="boolean")errors[f.id]="Use uma opção de confirmação válida."
  if(f.type==="email"&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))errors[f.id]="Informe um e-mail válido."
  if(f.type==="select"&&!f.options?.some(o=>o.value===text))errors[f.id]="Selecione uma opção válida."
  if(f.type==="number"){const n=Number(value);if(!Number.isFinite(n)||typeof value==="boolean")errors[f.id]="Informe um número válido.";else if(v?.min!==undefined&&n<v.min)errors[f.id]=`O valor mínimo é ${v.min}.`;else if(v?.max!==undefined&&n>v.max)errors[f.id]=`O valor máximo é ${v.max}.`}
  if(f.type==="date"&&(!/^\d{4}-\d{2}-\d{2}$/.test(text)||Number.isNaN(Date.parse(text))||new Date(text).toISOString().slice(0,10)!==text))errors[f.id]="Informe uma data válida."
  if((f.type==="cpf"||f.type==="cnpj")&&!validDocument(text,f.type))errors[f.id]=`Informe um ${f.type.toUpperCase()} válido.`
  if(["text","textarea","email"].includes(f.type)){if(typeof value!=="string")errors[f.id]="Informe um texto válido.";else if(v?.minLength!==undefined&&text.trim().length<v.minLength)errors[f.id]=`Use pelo menos ${v.minLength} caracteres.`;else if(v?.maxLength!==undefined&&text.length>v.maxLength)errors[f.id]=`Use no máximo ${v.maxLength} caracteres.`}
  if(f.type==="file"){
   if(!Array.isArray(value)||value.some(item=>!item||typeof item!=="object"||typeof item.name!=="string"||typeof item.size!=="number"||item.size<=0))errors[f.id]="Selecione um arquivo válido."
   else if(value.some(item=>item.size>(v?.maxFileMB||10)*1024*1024))errors[f.id]=`Arquivo acima de ${v?.maxFileMB||10} MB.`
   else if(v?.fileTypes?.length&&value.some(item=>!v.fileTypes!.includes(item.type)&&!v.fileTypes!.some(t=>t.startsWith(".")&&item.name.toLowerCase().endsWith(t))))errors[f.id]="Formato de arquivo não permitido."
  }
 }
 return {valid:Object.keys(errors).length===0,errors}
}
export function definitionIssues(def:FormDefinition){
 const issues:string[]=[],ids=new Set(def.fields.map(f=>f.id));if(!def.fields.length)issues.push("Não há campos com origem identificada para gerar o formulário.")
 if(ids.size!==def.fields.length)issues.push("Há identificadores de campo repetidos.")
 const graph=new Map<string,string[]>()
 for(const f of def.fields){if(f.type==="select"&&!f.options?.length)issues.push(`${f.label}: faltam opções.`);if(f.validation?.min!==undefined&&f.validation.max!==undefined&&f.validation.min>f.validation.max)issues.push(`${f.label}: limites numéricos incompatíveis.`);if((f.validation?.minLength||0)>(f.validation?.maxLength||Infinity))issues.push(`${f.label}: limites de texto incompatíveis.`)
 const deps=[...(f.visibleWhen||[]),...(f.requiredWhen||[])];graph.set(f.id,deps.map(c=>c.field));for(const c of deps){if(!ids.has(c.field)||c.field===f.id)issues.push(`${f.label}: condição aponta para campo inexistente ou para si mesmo.`);const target=def.fields.find(t=>t.id===c.field);if(target?.type==="select"&&c.operator==="equals"&&!target.options?.some(o=>o.value===String(c.value)))issues.push(`${f.label}: condição usa opção não cadastrada.`)}}
 const visited=new Map<string,number>()
 function cycle(id:string):boolean{if(visited.get(id)===1)return true;if(visited.get(id)===2)return false;visited.set(id,1);if((graph.get(id)||[]).some(child=>cycle(child)))return true;visited.set(id,2);return false}
 if(def.fields.some(f=>cycle(f.id)))issues.push("As condições contêm dependência circular.")
 return [...new Set(issues)]
}
export function sampleValue(f:FormField):unknown{switch(f.type){case"file":return[{name:"documento-teste.pdf",size:1024,type:"application/pdf"}];case"checkbox":return true;case"email":return"teste@example.invalid";case"cpf":return"52998224725";case"cnpj":return"11222333000181";case"date":return"2026-01-01";case"number":return f.validation?.min??Math.min(0,f.validation?.max??0);case"select":return f.options?.[0]?.value||"";default:return"Teste".padEnd(Math.max(5,f.validation?.minLength||0),"x").slice(0,f.validation?.maxLength||10000)}}
export function generatedTests(def:FormDefinition){
 const tests:Array<{name:string;passed:boolean;detail:string}>=definitionIssues(def).map(detail=>({name:"Estrutura",passed:false,detail}))
 for(const field of def.fields){const values:FormValues=Object.fromEntries(def.fields.map(f=>[f.id,sampleValue(f)]));for(const c of [...(field.visibleWhen||[]),...(field.requiredWhen||[])]){if(c.operator==="equals")values[c.field]=c.value;if(c.operator==="in"&&Array.isArray(c.value))values[c.field]=c.value[0]}
 const valid=validateValues(def,values);tests.push({name:`${field.label}: valor válido`,passed:!valid.errors[field.id],detail:valid.errors[field.id]||"Validador aceitou o exemplo de teste."})
 if(isVisible(field,values)&&isRequired(field,values)){delete values[field.id];const result=validateValues(def,values);tests.push({name:`${field.label}: obrigatoriedade`,passed:Boolean(result.errors[field.id]),detail:"Ausência deve bloquear o envio."})}
 }
 return {passed:tests.length>0&&tests.every(t=>t.passed),tests,ranAt:new Date().toISOString()}
}
export type GenerationContext={id:string;municipality:string;department:string;owner:string;name:string;rules:Rule[];sources:Source[]}
export function localDefinition(context:GenerationContext){
 const rules=context.rules.filter(r=>r.value&&r.sourceId&&r.excerpt&&!r.conflict&&r.status!=="rejected"),blockers:string[]=[]
 const doc=rules.find(r=>r.category==="documents"),eligibility=rules.find(r=>r.category==="eligibility")
 const fields:FormField[]=[]
 const proof=(rule:Rule)=>[{sourceId:rule.sourceId,ruleId:rule.id,excerpt:rule.excerpt}]
 const add=(id:string,label:string,type:FormField["type"],rule:Rule,required=false,extra:Partial<FormField>={})=>fields.push({id,label,type,required,help:"",evidence:proof(rule),...extra})
 const who=normalized(eligibility?.value||""),docs=normalized(doc?.value||"")
 if(eligibility&&/fisica/.test(who)&&/juridica/.test(who))add("tipo_pessoa","Tipo de pessoa","select",eligibility,true,{options:[{value:"fisica",label:"Pessoa física"},{value:"juridica",label:"Pessoa jurídica"}]})
 const both=fields.some(f=>f.id==="tipo_pessoa"),required=/obrigatori|necessari|exig|apresentar/.test(docs)
 if(doc){
  if(/\bcpf\b/.test(docs))add("cpf","CPF","cpf",doc,!both&&required,both?{visibleWhen:[{field:"tipo_pessoa",operator:"equals",value:"fisica"}],requiredWhen:required?[{field:"tipo_pessoa",operator:"equals",value:"fisica"}]:[],evidence:[...proof(doc),...(eligibility?proof(eligibility):[])]}:{})
  if(/\bcnpj\b/.test(docs))add("cnpj","CNPJ","cnpj",doc,!both&&required,both?{visibleWhen:[{field:"tipo_pessoa",operator:"equals",value:"juridica"}],requiredWhen:required?[{field:"tipo_pessoa",operator:"equals",value:"juridica"}]:[],evidence:[...proof(doc),...(eligibility?proof(eligibility):[])]}:{})
  for(const [pattern,id,label] of [[/comprovante de endere[cç]o/,"comprovante_endereco","Comprovante de endereço"],[/identifica[cç]ao|identidade|\brg\b/,"documento_identificacao","Documento de identificação"],[/matricula/,"matricula_imovel","Matrícula do imóvel"],[/projeto/,"projeto","Projeto"],[/responsabilidade tecnica|\bart\b|\brrt\b/,"responsabilidade_tecnica","Responsabilidade técnica"]] as const)if(pattern.test(docs))add(id,label,"file",doc,required)
 }
 const all=rules.map(r=>normalized(r.value)).join(" ")
 const named=rules.find(r=>/nome completo/.test(normalized(r.value)));if(named)add("nome_completo","Nome completo","text",named,/obrigatori/.test(normalized(named.value)))
 const email=rules.find(r=>/e-mail|email/.test(normalized(r.value)));if(email)add("email","E-mail","email",email,/obrigatori/.test(normalized(email.value)))
 if(!doc)blockers.push("Quais campos e documentos compõem este formulário? Envie a lista com obrigatoriedade e exceções.")
 for(const category of ["eligibility","conditions","exceptions","deadlines","responsibility"] as const)if(!rules.some(r=>r.category===category))blockers.push(`Falta informar a regra de ${category==="eligibility"?"quem pode solicitar":category==="conditions"?"condições":category==="exceptions"?"exceções e dispensas":category==="deadlines"?"prazos":"responsáveis"}. Se não se aplicar, confirme expressamente.`)
 if(context.rules.some(r=>r.conflict))blockers.push("Há evidências divergentes no processo. Concilie as regras antes do envio.")
 if(doc&&/\bse\b|somente|exceto|dispens|quando/.test(docs))blockers.push("Os documentos possuem condição ou exceção: confirme a condição exata para cada documento antes do envio.")
 const list=docs.match(/(?:\bsao\b|obrigatorios:|necessarios:)\s*(.+?)(?:\.|$)/)?.[1]
 if(list){const parts=list.split(/,|;|\s+e\s+|\s+ou\s+/).map(part=>part.trim()).filter(Boolean);if(parts.some(part=>!/cpf|cnpj|comprovante de endere|identifica|identidade|\brg\b|matricula|projeto|responsabilidade tecnica|\bart\b|\brrt\b|nome completo|e-mail|email/.test(part)))blockers.push("Há documentos ou campos ainda não mapeados. Confirme o nome, o tipo e a obrigatoriedade de cada item antes do envio.")}
 const conditions=normalized(rules.find(r=>r.category==="conditions")?.value||"")
 if(/\bse\b|quando|somente|\bidade\b|valor minimo|valor maximo/.test(conditions))blockers.push("Confirme os campos, os valores e as exceções das condições para que possam ser executadas no formulário.")
 if(/cpf\s+ou\s+cnpj/.test(docs)&&!both)blockers.push("Confirme como o solicitante deve escolher entre CPF e CNPJ.")
 const definition:FormDefinition={schemaVersion:1,title:context.name,description:`${context.municipality} · ${context.department}`,context:{processId:context.id,municipality:context.municipality,department:context.department,owner:context.owner},fields,sections:rules.map(r=>({id:r.id,title:r.title,text:r.value,evidence:proof(r)})),warnings:rules.some(r=>r.status!=="approved")?["Há informações extraídas ainda não aprovadas individualmente. A prefeitura e o profissional devem conferir suas fontes."]:[]}
 void all
 return{definition,blockers:[...blockers,...definitionIssues(definition)],mode:"local:evidence-rules-v1"}
}
export type FormChange={path:string;before:unknown;after:unknown;sourceId:string;excerpt:string}
export function diffDefinitions(before:FormDefinition,after:FormDefinition,sourceId:string,excerpt:string):FormChange[]{const changes:FormChange[]=[];for(const part of ["fields","sections"] as const){const old=new Map(before[part].map(v=>[v.id,v]));const next=new Map(after[part].map(v=>[v.id,v]));for(const id of new Set([...old.keys(),...next.keys()]))if(JSON.stringify(old.get(id))!==JSON.stringify(next.get(id)))changes.push({path:`${part}.${id}`,before:old.get(id)||null,after:next.get(id)||null,sourceId,excerpt})}return changes}
export function localCorrection(original:FormDefinition,text:string,sourceId:string){
 const definition=structuredClone(original),blockers:string[]=[]
 const evidence={sourceId,excerpt:text}
 const locate=(name:string)=>definition.fields.find(f=>normalized(f.label)===normalized(name.replace(/^["“]|["”]$/g,""))||f.id===name)
 const commands=text.split(/\n|;/).map(t=>t.trim().replace(/[.!]$/,"" )).filter(Boolean)
 for(const command of commands){let match:RegExpMatchArray|null
  if((match=command.match(/^(?:tornar|deixar|definir)\s+(?:o\s+campo\s+|campo\s+)?["“]?(.+?)["”]?\s+(obrigat[oó]rio|opcional)$/i))||(match=command.match(/^(?:o\s+campo\s+|campo\s+)?["“]?(.+?)["”]?\s+(?:deve\s+ser|ser[aá])\s+(obrigat[oó]rio|opcional)$/i))){const f=locate(match[1]);if(!f){blockers.push(`Qual é o campo "${match[1]}"?`);continue}f.required=normalized(match[2])==="obrigatorio";f.requiredWhen=[];f.evidence=[...f.evidence,evidence];continue}
  if((match=command.match(/^(?:alterar|mudar)\s+(?:o\s+)?r[oó]tulo\s+(?:de\s+)?["“](.+?)["”]\s+para\s+["“](.+?)["”]$/i))){const f=locate(match[1]);if(!f){blockers.push(`Não foi encontrado o campo "${match[1]}".`);continue}f.label=match[2];f.evidence=[...f.evidence,evidence];continue}
  if((match=command.match(/^adicionar\s+(?:o\s+)?campo\s+["“](.+?)["”]\s+(?:do\s+)?tipo\s+(texto|e-mail|email|n[uú]mero|data|arquivo|cpf|cnpj)(?:\s+(obrigat[oó]rio|opcional))?$/i))){const types:Record<string,FormField["type"]>={texto:"text","e-mail":"email",email:"email",numero:"number",data:"date",arquivo:"file",cpf:"cpf",cnpj:"cnpj"};const id=normalized(match[1]).replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"").slice(0,50);if(!/^[a-z]/.test(id)||definition.fields.some(f=>f.id===id)){blockers.push(`O campo "${match[1]}" já existe ou precisa de um nome mais claro.`);continue}definition.fields.push({id,label:match[1],type:types[normalized(match[2])],required:normalized(match[3]||"")==="obrigatorio",help:"",evidence:[evidence]});continue}
  if((match=command.match(/^remover\s+(?:o\s+)?campo\s+["“]?(.+?)["”]?$/i))){const f=locate(match[1]);if(!f){blockers.push(`Não foi encontrado o campo "${match[1]}".`);continue}definition.fields=definition.fields.filter(item=>item.id!==f.id);continue}
  if((match=command.match(/^(?:alterar|mudar|definir)\s+(?:o\s+)?prazo(?:\s+de\s+an[aá]lise)?\s+para\s+(\d+)\s+dias(\s+[uú]teis|\s+corridos)?$/i))){if(!match[2]){blockers.push("O prazo informado é em dias úteis ou corridos?");continue}const section=definition.sections.find(s=>/prazo/i.test(s.title));if(!section){blockers.push("Qual etapa do processo deve receber esse prazo?");continue}section.text=`Prazo de análise: ${match[1]} dias${match[2]}.`;section.evidence=[...section.evidence,evidence];continue}
  if((match=command.match(/^(?:mostrar|exigir)\s+(?:o\s+)?campo\s+["“](.+?)["”]\s+(?:somente\s+)?quando\s+["“](.+?)["”]\s+for\s+["“](.+?)["”]$/i))){const field=locate(match[1]),other=locate(match[2]);const value=other?.options?.find(o=>normalized(o.label)===normalized(match![3])||o.value===match![3])?.value||match[3];if(!field||!other){blockers.push("Confirme os campos utilizados na condição solicitada.");continue}const condition={field:other.id,operator:"equals" as const,value};if(/^mostrar/i.test(command))field.visibleWhen=[condition];else{field.required=false;field.requiredWhen=[condition]}field.evidence=[...field.evidence,evidence];continue}
  blockers.push(`Esclareça o ajuste: "${command}". Informe campo, mudança e condição, quando houver.`)
 }
 return{definition,blockers:[...blockers,...definitionIssues(definition)],changes:diffDefinitions(original,definition,sourceId,text),mode:"local:explicit-corrections-v1"}
}

export function exampleValues(def:FormDefinition):FormValues { return Object.fromEntries(def.fields.map(f=>[f.id,sampleValue(f)])) }
