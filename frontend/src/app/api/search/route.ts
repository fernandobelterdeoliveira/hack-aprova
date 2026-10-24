import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { currentActor } from "@/lib/auth/current-actor"

export async function GET(request: NextRequest) {
  const actor = await currentActor()
  const query = request.nextUrl.searchParams.get("q")?.trim() || ""
  if (query.length < 2) return NextResponse.json({ cases: [], inbox: [], files: [] })

  const contains = { contains: query, mode: "insensitive" as const }
  const [cases, inbox, files] = await Promise.all([
    prisma.case.findMany({
      where: { workspaceId: actor.workspaceId, OR: [{ clientName: contains }, { caseNumber: contains }, { caseType: contains }, { description: contains }] },
      select: { id: true, clientName: true, caseNumber: true, caseType: true, status: true },
      orderBy: { lastActivity: "desc" },
      take: 6,
    }),
    prisma.inboxItem.findMany({
      where: { workspaceId: actor.workspaceId, OR: [{ senderName: contains }, { senderEmail: contains }, { senderPhone: contains }, { rawContent: contains }, { fileName: contains }] },
      select: { id: true, senderName: true, senderEmail: true, rawContent: true, sourceType: true, reviewStatus: true },
      orderBy: { receivedAt: "desc" },
      take: 6,
    }),
    prisma.files.findMany({
      where: { name: contains, case: { workspaceId: actor.workspaceId } },
      select: { id: true, name: true, type: true, case: { select: { id: true, clientName: true, caseNumber: true } } },
      orderBy: { uploadedAt: "desc" },
      take: 6,
    }),
  ])

  return NextResponse.json({ cases, inbox, files })
}
