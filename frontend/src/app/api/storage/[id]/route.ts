import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { readStoredObject, verifyStorageSignature } from "@/lib/connectors/storage"
import { currentActor } from "@/lib/auth/current-actor"

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const actor = await currentActor()
  if (!verifyStorageSignature(id, request.nextUrl.searchParams.get("expires"), request.nextUrl.searchParams.get("sig"))) {
    return NextResponse.json({ error: "Link inválido ou expirado" }, { status: 401 })
  }
  const object = await prisma.storedObject.findFirst({
    where: {
      id,
      OR: [
        { inboxItem: { workspaceId: actor.workspaceId } },
        { connectorAccount: { workspaceId: actor.workspaceId } },
        { connectorDelivery: { account: { workspaceId: actor.workspaceId } } },
      ],
    },
  })
  if (!object) return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 })
  const bytes = await readStoredObject(object.storageProvider, object.storageKey)
  const previewRequested = request.nextUrl.searchParams.get("preview") === "1"
  const canPreview = object.mimeType === "application/pdf" || object.mimeType.startsWith("image/")
  const disposition = previewRequested && canPreview ? "inline" : "attachment"
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": object.mimeType,
      "Content-Length": String(bytes.length),
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(object.originalName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
