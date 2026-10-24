import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { currentActor } from "@/lib/auth/current-actor";

export async function GET() {
    try {
        const actor = await currentActor();
        const caseScope = { workspaceId: actor.workspaceId };
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // Every case that has not been closed is still considered in progress.
        // Run the dashboard counters from one consistent database snapshot.
        const [
            totalCases,
            activeCases,
            closedCases,
            pendingActions,
            recentEmails,
            recentTextMessages,
            recentPhoneCalls
        ] = await prisma.$transaction([
            prisma.case.count({ where: caseScope }),
            prisma.case.count({ where: { ...caseScope, status: { not: "closed" } } }),
            prisma.case.count({ where: { ...caseScope, status: "closed" } }),
            prisma.reasonChain.count({ where: { case: caseScope, status: "pending" } }),
            prisma.email.count({ where: { case: caseScope, createdAt: { gte: sevenDaysAgo } } }),
            prisma.textMessage.count({ where: { case: caseScope, createdAt: { gte: sevenDaysAgo } } }),
            prisma.phoneCall.count({ where: { case: caseScope, createdAt: { gte: sevenDaysAgo } } })
        ]);

        const recentCommunications = recentEmails + recentTextMessages + recentPhoneCalls;

        return NextResponse.json({
            totalCases,
            activeCases,
            closedCases,
            pendingActions,
            recentCommunications
        });
    } catch (error) {
        console.error("Error fetching dashboard stats:", error);
        return NextResponse.json(
            { error: "Não foi possível carregar os indicadores do painel" },
            { status: 500 }
        );
    }
}
