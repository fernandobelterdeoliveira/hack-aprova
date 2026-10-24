import {categories, type Category, type Rule, type Source} from "./domain"
import {normalized} from "./forms"
export const collectionQuestions:Record<Category,string>={
 documents:"Quais documentos e dados são obrigatórios? Informe também quais são opcionais e para quem são exigidos.",
 eligibility:"Quem pode solicitar: pessoa física, pessoa jurídica ou ambas? Há alguma restrição?",
 conditions:"Quais conferências ou condições precisam ser atendidas antes da aprovação?",
 exceptions:"Existem exceções ou dispensas? Se não houver, confirme expressamente.",
 deadlines:"Qual é o prazo de análise? Informe a quantidade e se são dias úteis ou corridos; se não há prazo definido, confirme.",
 responsibility:"Qual setor faz a triagem e quem realiza a aprovação?",
}
export function collectionGaps(rules:Rule[],sources:Source[]){
 const order:Category[]=["documents","eligibility","conditions","exceptions","deadlines","responsibility"]
 return order.flatMap(category=>{
  const rule=rules.find(r=>r.category===category),source=sources.find(s=>s.id===rule?.sourceId)
  const valid=rule&&rule.status!=="rejected"&&!rule.conflict&&rule.value.trim()&&source&&rule.excerpt.trim()&&rule.excerpt.split("\n").filter(Boolean).every(line=>source.content.includes(line))
  return valid?[]:[{category,ruleVersion:rule?.version||1,reason:rule?.conflict?"contradiction_or_ambiguity":!rule?.value?"missing_information":"missing_evidence",question:rule?.conflict?`Esclareça a regra de ${rule.title.toLocaleLowerCase("pt-BR")}: a nova informação é ambígua ou diverge da fonte anterior. ${collectionQuestions[category]}`:collectionQuestions[category]}]
 })
}
export function interpretCollectionAnswer(category:Category,text:string):{value:string|null;question?:string}{
 const answer=text.trim(),value=normalized(answer)
 if(/\b(talvez|acho|depende|provavelmente|nao sei|a confirmar|verificar depois|conforme o caso|qualquer coisa)\b/.test(value)||answer.length<4)return{value:null,question:"Informe uma regra objetiva, com os requisitos e as exceções aplicáveis; não foi possível concluir com segurança."}
 const patterns:Record<Category,RegExp>={
  documents:/cpf|cnpj|comprovante|document|identidade|matricula|projeto|responsabilidade|\brg\b|\bart\b|\brrt\b|nome completo|e-mail|nenhum|nao ha/,
  eligibility:/fisica|juridica|empresa|cidada|proprietari|responsave|requerente/,
  conditions:/deve|obrigat|vistoria|analis|confer|valid|triagem|nao ha|nenhuma|nao se aplica/,
  exceptions:/dispens|excet|isen|nenhum|nao ha|nao se aplica|sem exce/,
  deadlines:/\d+\s*(?:dias?|horas?|meses|semanas?)|sem prazo|nao ha prazo|prazo nao definido/,
  responsibility:/secretar|diretor|coorden|analista|setor|responsave|geren|equipe/,
 }
 if(!categories.includes(category)||!patterns[category].test(value))return{value:null,question:collectionQuestions[category]}
 if(category==="eligibility"&&/\bnao\b/.test(value))return{value:null,question:"Liste somente os perfis que podem solicitar e confirme as restrições; não foi possível interpretar a negação com segurança."}
 if(category==="documents"&&(/opcionais|facultativos/.test(value)||/\bnao\b/.test(value)&&!/nao (?:e |precisa ser )?obrigatorio|nao ha documentos|nenhum documento/.test(value)))return{value:null,question:"Liste cada documento separadamente e indique obrigatório ou opcional, com a condição de pessoa física ou jurídica quando existir."}
 if(category==="deadlines"&&/\d+\s*dias?\b/.test(value)&&!/uteis|corridos/.test(value))return{value:null,question:"O prazo informado é em dias úteis ou corridos?"}
 // The question supplies the category, never an unmentioned municipality's rule.
 if(category==="documents")return{value:`Documentos e dados informados em resposta à pergunta de obrigatoriedade: ${answer}`}
 if(category==="eligibility")return{value:answer.replace(/empresas/gi,"pessoas jurídicas")}
 return{value:answer}
}
