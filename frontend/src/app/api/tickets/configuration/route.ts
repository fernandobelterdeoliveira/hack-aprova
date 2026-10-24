import {NextRequest,NextResponse} from "next/server"
import {z} from "zod"
import {currentActor} from "@/lib/auth/current-actor"
import {sameOrigin} from "@/lib/request-origin"
import {saveTicketPublicUrl} from "@/lib/municipal/runtime-env"
export async function GET(){await currentActor();return NextResponse.json({publicUrl:process.env.TICKET_PUBLIC_BASE_URL||process.env.WHATSAPP_PUBLIC_URL||process.env.APP_PUBLIC_URL||""})}
export async function POST(request:NextRequest){if(!sameOrigin(request))return NextResponse.json({error:"Origem inválida."},{status:403});try{const actor=await currentActor();if(!["owner","admin"].includes(actor.role)||process.env.NODE_ENV!=="development")return NextResponse.json({error:"A configuração local exige administrador no ambiente de desenvolvimento."},{status:403});const data=z.object({publicUrl:z.url().refine(url=>url.startsWith("https://"),"Use um endereço HTTPS público.")}).parse(await request.json());const url=new URL(data.publicUrl);if(url.username||url.password||url.search||url.hash)throw new Error("Informe somente o endereço base, sem credenciais ou parâmetros.");await saveTicketPublicUrl(data.publicUrl.replace(/\/$/,""));return NextResponse.json({saved:true})}catch(e){return NextResponse.json({error:e instanceof z.ZodError?e.issues[0].message:e instanceof Error?e.message:"Não foi possível salvar."},{status:400})}}
