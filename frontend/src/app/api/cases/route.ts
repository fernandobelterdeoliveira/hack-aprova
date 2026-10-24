import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { currentActor } from "@/lib/auth/current-actor";

const createCaseInput = z.object({
    clientName: z.string().trim().min(2),
    clientEmail: z.string().trim().email().optional().or(z.literal("")),
    clientPhone: z.string().trim().optional(),
    clientDob: z.string().trim().min(1),
    caseType: z.string().trim().min(2),
    caseNumber: z.string().trim().min(3).optional().or(z.literal("")),
    status: z.enum(["open", "active", "pending", "on-hold", "closed"]).default("open"),
    priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
    assignedTo: z.string().trim().min(2),
    description: z.string().trim().min(5),
    nextAction: z.string().trim().min(3),
});

function generatedCaseNumber() {
    const year = new Date().getFullYear();
    const suffix = randomUUID().slice(0, 6).toUpperCase();
    return `LL-${year}-${suffix}`;
}

export async function GET() {
    try {
        const actor = await currentActor();
        const cases = await prisma.case.findMany({
            where: { workspaceId: actor.workspaceId },
            orderBy: { lastActivity: 'desc' },
            include: {
                emails: {
                    select: { id: true }
                },
                files: {
                    select: { id: true }
                },
                reasonChains: {
                    select: { id: true }
                },
                informationGaps: { where: { status: "open" }, select: { id: true, title: true, priority: true } },
                aiTasks: { where: { status: { notIn: ["completed", "dismissed"] } }, select: { id: true, category: true, priority: true, dueDate: true } },
                proposedChanges: { where: { status: "pending" }, select: { id: true, riskLevel: true } },
                inboxItems: { where: { OR: [{ processingStatus: { not: "completed" } }, { reviewStatus: { in: ["pending", "ready", "needs_association"] } }] }, select: { id: true } },
                facts: { where: { archivedAt: null }, select: { fieldName: true, value: true } },
            }
        });

        return NextResponse.json(cases.map((item) => {
            const fields = new Map<string, Set<string>>();
            item.facts.forEach((fact) => fields.set(fact.fieldName, new Set([...(fields.get(fact.fieldName) || []), JSON.stringify(fact.value)])));
            const hasContradiction = [...fields.values()].some((values) => values.size > 1);
            const staleDays = Math.floor((Date.now() - item.lastActivity.getTime()) / 86_400_000);
            return {
                ...item,
                operational: {
                    staleDays,
                    hasGaps: item.informationGaps.length > 0,
                    highRisk: ["urgent", "high"].includes(item.priority) || item.proposedChanges.some((change) => ["high", "critical"].includes(change.riskLevel)),
                    hasDeadline: item.aiTasks.some((task) => task.category === "deadline"),
                    missingDocument: item.informationGaps.some((gap) => /documento|matrícula|certidão|comprovante|laudo/i.test(gap.title)),
                    awaitingReview: item.proposedChanges.length > 0,
                    hasContradiction,
                    unassigned: !item.assignedTo.trim(),
                    unprocessedEntries: item.inboxItems.length,
                    gapCount: item.informationGaps.length,
                    taskCount: item.aiTasks.length,
                    documentCount: item.files.length,
                },
            };
        }));
    } catch (error) {
        console.error("Error fetching cases:", error);
        return NextResponse.json(
            { error: "Não foi possível carregar os casos" },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const actor = await currentActor();
        const parsed = createCaseInput.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json(
                { error: "Dados do caso inválidos", details: parsed.error.flatten() },
                { status: 400 },
            );
        }

        const input = parsed.data;
        const created = await prisma.case.create({
            data: {
                workspaceId: actor.workspaceId,
                clientName: input.clientName,
                clientEmail: input.clientEmail || null,
                clientPhone: input.clientPhone || null,
                clientDob: input.clientDob,
                caseType: input.caseType,
                caseNumber: input.caseNumber || generatedCaseNumber(),
                status: input.status,
                priority: input.priority,
                assignedTo: input.assignedTo,
                description: input.description,
                nextAction: input.nextAction,
                state: {
                    create: {
                        stage: input.status,
                        summary: input.description,
                        healthScore: 70,
                    },
                },
            },
            include: { state: true },
        });

        return NextResponse.json(created, { status: 201 });
    } catch (error) {
        console.error("Erro ao criar caso:", error);
        const duplicate = error instanceof Error && error.message.includes("Unique constraint");
        return NextResponse.json(
            { error: duplicate ? "Já existe um caso com este número" : "Não foi possível criar o caso" },
            { status: duplicate ? 409 : 500 },
        );
    }
}
