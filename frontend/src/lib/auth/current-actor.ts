import "server-only"

import { prisma } from "@/lib/prisma"
import { auth0, auth0Configured } from "@/lib/auth/auth0"

export const LOCAL_USER_ID = "current-user"
export const LOCAL_WORKSPACE_ID = "default-workspace"

export type CurrentActor = {
  userProfileId: string
  workspaceId: string
  role: string
  authSubject: string | null
}

export class AuthenticationRequiredError extends Error {}

async function ensureLocalActor(): Promise<CurrentActor> {
  await prisma.workspace.upsert({
    where: { id: LOCAL_WORKSPACE_ID },
    update: {},
    create: { id: LOCAL_WORKSPACE_ID, name: "LexiLoop", slug: "lexiloop" },
  })
  await prisma.userProfile.upsert({
    where: { id: LOCAL_USER_ID },
    update: {},
    create: { id: LOCAL_USER_ID, name: "Usuário LexiLoop", role: "Administrador" },
  })
  await prisma.workspaceMember.upsert({
    where: { workspaceId_userProfileId: { workspaceId: LOCAL_WORKSPACE_ID, userProfileId: LOCAL_USER_ID } },
    update: {},
    create: { workspaceId: LOCAL_WORKSPACE_ID, userProfileId: LOCAL_USER_ID, role: "owner" },
  })
  return { userProfileId: LOCAL_USER_ID, workspaceId: LOCAL_WORKSPACE_ID, role: "owner", authSubject: null }
}

export async function actorFromIdentity(input: { sub: string; name?: string | null; email?: string | null }): Promise<CurrentActor> {
  const existing = await prisma.userProfile.findUnique({
    where: { authSubject: input.sub },
    include: { memberships: { orderBy: { createdAt: "asc" }, take: 1 } },
  })
  if (existing?.memberships[0]) {
    return {
      userProfileId: existing.id,
      workspaceId: existing.memberships[0].workspaceId,
      role: existing.memberships[0].role,
      authSubject: input.sub,
    }
  }

  return prisma.$transaction(async (tx) => {
    const local = await tx.userProfile.findUnique({ where: { id: LOCAL_USER_ID } })
    const mayClaimLocal = local && !local.authSubject
    const profile = mayClaimLocal
      ? await tx.userProfile.update({
          where: { id: LOCAL_USER_ID },
          data: { authSubject: input.sub, name: input.name || local.name, email: input.email || local.email },
        })
      : await tx.userProfile.create({
          data: {
            id: `auth0-${crypto.randomUUID()}`,
            authSubject: input.sub,
            name: input.name || input.email || "Usuário LexiLoop",
            email: input.email,
            role: "Administrador",
          },
        })

    const workspaceId = mayClaimLocal ? LOCAL_WORKSPACE_ID : `workspace-${crypto.randomUUID()}`
    await tx.workspace.upsert({
      where: { id: workspaceId },
      update: {},
      create: { id: workspaceId, name: input.name ? `Escritório de ${input.name}` : "Meu escritório", slug: `ws-${crypto.randomUUID()}` },
    })
    const membership = await tx.workspaceMember.upsert({
      where: { workspaceId_userProfileId: { workspaceId, userProfileId: profile.id } },
      update: {},
      create: { workspaceId, userProfileId: profile.id, role: "owner" },
    })
    return { userProfileId: profile.id, workspaceId, role: membership.role, authSubject: input.sub }
  })
}

export async function currentActor(): Promise<CurrentActor> {
  if (!auth0Configured || !auth0) {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_LOCAL_AUTH !== "true") {
      throw new AuthenticationRequiredError("Autenticação não configurada. O acesso local é bloqueado em produção.")
    }
    return ensureLocalActor()
  }
  const session = await auth0.getSession()
  if (!session?.user?.sub) throw new AuthenticationRequiredError("Faça login para continuar.")
  return actorFromIdentity({ sub: session.user.sub, name: session.user.name, email: session.user.email })
}
