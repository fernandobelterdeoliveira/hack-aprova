import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { currentActor } from "@/lib/auth/current-actor";
import { buildCaseOperationalView } from "@/lib/case-operational-view";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const actor = await currentActor();

        const lawCase = await buildCaseOperationalView(prisma, id, actor.workspaceId);

        if (!lawCase) {
            return NextResponse.json(
                { error: "Caso não encontrado" },
                { status: 404 }
            );
        }

        return NextResponse.json({ ...lawCase.case, ...lawCase });
    } catch (error) {
        console.error("Error fetching case:", error);
        return NextResponse.json(
            { error: "Não foi possível carregar o caso" },
            { status: 500 }
        );
    }
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const actor = await currentActor();
        const body = await request.json();
        const { status } = body;

        if (!status) {
            return NextResponse.json(
                { error: "Status is required" },
                { status: 400 }
            );
        }

        // Validate status value
        const validStatuses = ['open', 'pending', 'closed', 'on-hold', 'active'];
        if (!validStatuses.includes(status)) {
            return NextResponse.json(
                { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
                { status: 400 }
            );
        }

        const existing = await prisma.case.findFirst({ where: { id, workspaceId: actor.workspaceId }, select: { id: true } });
        if (!existing) return NextResponse.json({ error: "Caso não encontrado" }, { status: 404 });
        await prisma.case.update({
            where: { id: existing.id },
            data: {
                status,
                lastActivity: new Date()
            },
        });
        const view = await buildCaseOperationalView(prisma, id, actor.workspaceId);
        return NextResponse.json(view ? { ...view.case, ...view } : null);
    } catch (error) {
        console.error("Error updating case:", error);
        return NextResponse.json(
            { error: "Não foi possível atualizar o caso" },
            { status: 500 }
        );
    }
}
