import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { profileMetrics } from "@/lib/profile-metrics"
import { currentActor } from "@/lib/auth/current-actor"

const profileUpdate = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  role: z.string().trim().min(2).max(80).optional(),
  email: z.string().trim().email().nullable().optional(),
  bio: z.string().trim().max(500).nullable().optional(),
  avatarUrl: z.string().trim().url().nullable().optional(),
  language: z.enum(["pt-BR", "en-US"]).optional(),
  timezone: z.enum(["America/Sao_Paulo", "America/New_York", "Europe/Lisbon", "UTC"]).optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
  accentColor: z.enum(["cobalt", "emerald", "violet"]).optional(),
  density: z.enum(["comfortable", "compact"]).optional(),
  emailNotifications: z.boolean().optional(),
  deadlineNotifications: z.boolean().optional(),
  reviewNotifications: z.boolean().optional(),
  weeklyDigest: z.boolean().optional(),
  telemetryEnabled: z.boolean().optional(),
  dataRetentionDays: z.union([z.literal(90), z.literal(180), z.literal(365), z.literal(730)]).optional(),
})

export async function GET() {
  try {
    const actor = await currentActor()
    const [profile, metrics] = await Promise.all([
      prisma.userProfile.findUnique({ where: { id: actor.userProfileId } }),
      profileMetrics(prisma, actor.userProfileId, actor.workspaceId),
    ])
    return NextResponse.json({ profile, metrics })
  } catch (error) {
    console.error("Erro ao carregar perfil:", error)
    return NextResponse.json({ error: "Não foi possível carregar o perfil" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = await currentActor()
    const parsed = profileUpdate.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: "Dados do perfil inválidos", details: parsed.error.flatten() }, { status: 400 })
    const profile = await prisma.userProfile.update({ where: { id: actor.userProfileId }, data: parsed.data })
    return NextResponse.json(profile)
  } catch (error) {
    console.error("Erro ao salvar perfil:", error)
    return NextResponse.json({ error: "Não foi possível salvar o perfil" }, { status: 500 })
  }
}
