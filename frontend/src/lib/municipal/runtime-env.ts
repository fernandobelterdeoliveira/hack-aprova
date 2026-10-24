import {readFile,writeFile} from "node:fs/promises"
import path from "node:path"
const keys=new Set(["WHATSAPP_ACCESS_TOKEN","WHATSAPP_PHONE_NUMBER_ID","WHATSAPP_APP_SECRET","WHATSAPP_VERIFY_TOKEN","WHATSAPP_GRAPH_VERSION","WHATSAPP_PUBLIC_URL","TICKET_PUBLIC_BASE_URL","APP_PUBLIC_URL","APP_BASE_URL","GOOGLE_CONNECTOR_CLIENT_ID","GOOGLE_CONNECTOR_CLIENT_SECRET","MICROSOFT_CONNECTOR_CLIENT_ID","MICROSOFT_CONNECTOR_CLIENT_SECRET","CONNECTOR_ENCRYPTION_KEY"])
export async function refreshTicketRuntime(){
 const text=await readFile(path.join(process.cwd(),".env.local"),"utf-8").catch(()=>"")
 for(const line of text.split(String.fromCharCode(10))){const index=line.indexOf("=");if(index<0)continue;const key=line.slice(0,index).trim();if(!keys.has(key))continue;let value=line.slice(index+1).trim();try{if(value.startsWith('"'))value=JSON.parse(value);else if(value.startsWith("'"))value=value.slice(1,-1);else value=value.split(" #")[0].trim();if(typeof value==="string")process.env[key]=value}catch{}}
}
export async function saveTicketPublicUrl(url:string){
 const file=path.join(process.cwd(),".env.local"),text=await readFile(file,"utf-8").catch(()=>""),entry=`TICKET_PUBLIC_BASE_URL=${JSON.stringify(url)}`,pattern=/^TICKET_PUBLIC_BASE_URL=.*$/m
 await writeFile(file,pattern.test(text)?text.replace(pattern,()=>entry):text.trimEnd()+String.fromCharCode(10)+entry+String.fromCharCode(10),"utf-8");process.env.TICKET_PUBLIC_BASE_URL=url
}
