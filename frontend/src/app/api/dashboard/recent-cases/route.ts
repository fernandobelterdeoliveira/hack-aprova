import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { currentActor } from "@/lib/auth/current-actor";

export async function GET() {
    try {
        const actor = await currentActor();
        const recentCases = await prisma.case.findMany({
            where: { workspaceId: actor.workspaceId, status: "active" },
            orderBy: { lastActivity: 'desc' },
            take: 3
        });

        return NextResponse.json(recentCases);
    } catch (error) {
        console.error("Error fetching recent cases:", error);
        return NextResponse.json(
            { error: "Não foi possível carregar os casos recentes" },
            { status: 500 }
        );
    }
}
