import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { currentActor } from "@/lib/auth/current-actor";

export async function GET() {
    try {
        const actor = await currentActor();
        const pendingActions = await prisma.reasonChain.findMany({
            where: { case: { workspaceId: actor.workspaceId }, status: "pending" },
            orderBy: { timestamp: 'desc' },
            take: 3,
            include: {
                case: {
                    select: {
                        id: true,
                        clientName: true,
                        caseType: true
                    }
                }
            }
        });

        return NextResponse.json(pendingActions);
    } catch (error) {
        console.error("Error fetching pending actions:", error);
        return NextResponse.json(
            { error: "Não foi possível carregar as ações pendentes" },
            { status: 500 }
        );
    }
}
