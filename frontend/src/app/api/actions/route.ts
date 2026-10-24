import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { currentActor } from "@/lib/auth/current-actor";

export async function GET() {
    try {
        const actor = await currentActor();
        const actions = await prisma.reasonChain.findMany({
            where: { case: { workspaceId: actor.workspaceId } },
            orderBy: { timestamp: 'desc' },
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

        // Transform to match the expected format
        const formattedActions = actions.map(action => ({
            id: action.id,
            caseId: action.caseId,
            caseName: `${action.case.clientName} - ${action.case.caseType}`,
            actionType: action.action,
            description: action.action, // Using action as description
            suggestedBy: action.agentType,
            status: action.status,
            createdAt: action.timestamp.toISOString(),
            reasoning: action.reasoning,
            impact: action.impact,
            confidence: action.confidence,
            case: action.case
        }));

        return NextResponse.json(formattedActions);
    } catch (error) {
        console.error("Error fetching actions:", error);
        return NextResponse.json(
            { error: "Não foi possível carregar as ações" },
            { status: 500 }
        );
    }
}
