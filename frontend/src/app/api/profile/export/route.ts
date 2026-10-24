import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { profileMetrics } from "@/lib/profile-metrics"
import { currentActor } from "@/lib/auth/current-actor"

export async function GET() {
  try {
    const actor = await currentActor()
    const [profile, metrics] = await Promise.all([
      prisma.userProfile.findUnique({ where: { id: actor.userProfileId } }),
      profileMetrics(prisma, actor.userProfileId, actor.workspaceId),
    ])
    return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), profile, metrics }, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="perfil-e-atividade-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    })
  } catch (error) {
    console.error("Erro ao exportar dados do perfil:", error)
    return NextResponse.json({ error: "Não foi possível exportar os dados" }, { status: 500 })
  }
}
