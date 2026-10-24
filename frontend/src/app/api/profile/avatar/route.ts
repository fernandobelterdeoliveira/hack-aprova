import { mkdir, readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { currentActor } from "@/lib/auth/current-actor"

const MAX_AVATAR_BYTES = 5 * 1024 * 1024
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"])

function avatarPath(userProfileId: string) {
  const safeId = createHash("sha256").update(userProfileId).digest("hex")
  return path.join(process.cwd(), "data", "profile", `${safeId}-avatar`)
}

function detectedMime(bytes: Buffer) {
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg"
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png"
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp"
  return null
}

export async function GET() {
  try {
    const actor = await currentActor()
    const bytes = await readFile(avatarPath(actor.userProfileId))
    const mimeType = detectedMime(bytes)
    if (!mimeType) return NextResponse.json({ error: "Foto de perfil inválida" }, { status: 415 })
    return new NextResponse(new Uint8Array(bytes), {
      headers: { "Content-Type": mimeType, "Cache-Control": "private, no-cache", "X-Content-Type-Options": "nosniff" },
    })
  } catch {
    return NextResponse.json({ error: "Foto de perfil não encontrada" }, { status: 404 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await currentActor()
    const form = await request.formData()
    const file = form.get("avatar")
    if (!(file instanceof File)) return NextResponse.json({ error: "Selecione uma imagem" }, { status: 400 })
    if (!allowedTypes.has(file.type)) return NextResponse.json({ error: "Use uma imagem JPG, PNG ou WebP" }, { status: 415 })
    if (file.size > MAX_AVATAR_BYTES) return NextResponse.json({ error: "A imagem deve ter no máximo 5 MB" }, { status: 413 })

    const bytes = Buffer.from(await file.arrayBuffer())
    if (!detectedMime(bytes)) return NextResponse.json({ error: "O arquivo não é uma imagem válida" }, { status: 415 })
    await mkdir(path.dirname(avatarPath(actor.userProfileId)), { recursive: true })
    await writeFile(avatarPath(actor.userProfileId), bytes)

    await prisma.userProfile.upsert({
      where: { id: actor.userProfileId },
      update: { avatarUrl: `/api/profile/avatar?v=${Date.now()}` },
      create: { id: actor.userProfileId, name: "Usuário", role: "Membro", avatarUrl: `/api/profile/avatar?v=${Date.now()}` },
    })
    const profile = await prisma.userProfile.findUniqueOrThrow({ where: { id: actor.userProfileId } })
    return NextResponse.json(profile)
  } catch (error) {
    console.error("Erro ao salvar foto de perfil:", error)
    return NextResponse.json({ error: "Não foi possível salvar a foto" }, { status: 500 })
  }
}
