import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { currentActor } from "@/lib/auth/current-actor"
import { readStoredObject } from "@/lib/connectors/storage"
export async function GET(_req: NextRequest, ctx: { params: Promise<{id:string}> }) {
 const actor = await currentActor(); const {id} = await ctx.params
 const stored = await prisma.storedObject.findFirst({ where: { id, connectorAccount: {workspaceId:actor.workspaceId} } })
 if (!stored) return new Response("Anexo não encontrado",{status:404})
 const bytes = await readStoredObject(stored.storageProvider,stored.storageKey)
 return new Response(new Uint8Array(bytes),{headers:{"Content-Type":stored.mimeType,"Content-Disposition":`attachment; filename*=UTF-8''${encodeURIComponent(stored.originalName)}`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}})
}
