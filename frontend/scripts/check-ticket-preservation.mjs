import {readFile,writeFile} from "node:fs/promises"
import {PrismaClient} from "@prisma/client"
const prisma=new PrismaClient(),backup=(await readFile("../ticket-backup-path.txt","utf-8")).trim(),sql=await readFile(backup+"/database.sql","utf-8"),report=[]
try{for(const [table,model] of [["Case","case"],["Email","email"],["Files","files"],["TextMessage","textMessage"],["PhoneCall","phoneCall"],["UserProfile","userProfile"],["ConnectorAccount","connectorAccount"]]){
 const marker=`COPY public."${table}" (`,start=sql.indexOf(marker)
 if(start<0){report.push({table,checked:false});continue}
 const headerEnd=sql.indexOf(String.fromCharCode(10),start),header=sql.slice(start,headerEnd),columns=header.slice(header.indexOf("(")+1,header.lastIndexOf(")")).split(",").map(c=>c.trim().replaceAll('"',"")),idIndex=columns.indexOf("id"),lines=sql.slice(headerEnd+1).split(String.fromCharCode(10)),ids=[]
 for(const line of lines){if(line.trim()===String.fromCharCode(92)+".")break;if(line)ids.push(line.split(String.fromCharCode(9))[idIndex])}
 const current=new Set((await prisma[model].findMany({select:{id:true}})).map(r=>r.id));const missing=ids.filter(id=>!current.has(id));report.push({table,originalRecords:ids.length,currentRecords:current.size,missingOriginalRecords:missing.length})
 }
 await writeFile("../artifacts/data-preservation.json",JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(report.some(r=>r.missingOriginalRecords>0))throw new Error("Há registros originais ausentes; confira o relatório antes de finalizar.")
}finally{await prisma.$disconnect()}
