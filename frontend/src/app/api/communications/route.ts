import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { signedStoragePath } from "@/lib/connectors/storage";
import { currentActor } from "@/lib/auth/current-actor";

const createCommunicationInput = z.object({
    caseId: z.string().trim().min(1),
    type: z.enum(["email", "sms", "call"]),
    subject: z.string().trim().optional(),
    from: z.string().trim().min(1),
    to: z.string().trim().min(1),
    content: z.string().trim().min(1),
}).superRefine((value, context) => {
    if (value.type === "email" && !value.subject) {
        context.addIssue({ code: "custom", path: ["subject"], message: "Informe o assunto do e-mail" });
    }
});

export async function GET() {
    try {
        const actor = await currentActor();
        const caseScope = { workspaceId: actor.workspaceId };
        // Fetch all emails with case information
        const emails = await prisma.email.findMany({
            where: { case: caseScope },
            orderBy: { createdAt: 'desc' },
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

        // Fetch all text messages with case information
        const textMessages = await prisma.textMessage.findMany({
            where: { case: caseScope },
            orderBy: { createdAt: 'desc' },
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

        const phoneCalls = await prisma.phoneCall.findMany({
            where: { case: caseScope },
            orderBy: { createdAt: 'desc' },
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

        const receivedItems = await prisma.inboxItem.findMany({
            where: {
                workspaceId: actor.workspaceId,
                detectedCaseId: { not: null },
                sourceType: { in: ["email", "whatsapp", "document", "audio", "upload"] },
            },
            orderBy: { receivedAt: "desc" },
            include: {
                detectedCase: { select: { id: true, clientName: true, caseType: true } },
                storedObjects: { orderBy: { createdAt: "asc" } },
                connectorDelivery: { select: { payload: true } },
            },
            take: 200,
        });

        // Transform emails to communication format
        const emailCommunications = emails.map(email => ({
            id: email.id,
            caseId: email.caseId,
            caseName: `${email.case.clientName} - ${email.case.caseType}`,
            type: 'email' as const,
            subject: email.subject,
            from: email.from,
            to: email.to,
            date: email.createdAt.toISOString(),
            content: email.content,
            case: email.case
        }));

        // Transform text messages to communication format
        const textCommunications = textMessages.map(msg => ({
            id: msg.id,
            caseId: msg.caseId,
            caseName: `${msg.case.clientName} - ${msg.case.caseType}`,
            type: 'sms' as const,
            subject: `SMS: ${msg.from} → ${msg.to}`,
            from: msg.from,
            to: msg.to,
            date: msg.createdAt.toISOString(),
            content: msg.text,
            case: msg.case
        }));

        const callCommunications = phoneCalls.map(call => ({
            id: call.id,
            caseId: call.caseId,
            caseName: `${call.case.clientName} - ${call.case.caseType}`,
            type: 'call' as const,
            subject: "Ligação registrada",
            from: "Escritório",
            to: call.phoneNumber,
            date: call.createdAt.toISOString(),
            content: call.message,
            case: call.case
        }));

        const receivedCommunications = receivedItems.flatMap(item => {
            if (!item.detectedCase || !item.detectedCaseId) return [];
            const payload = item.connectorDelivery?.payload && typeof item.connectorDelivery.payload === "object" && !Array.isArray(item.connectorDelivery.payload)
                ? item.connectorDelivery.payload as Record<string, unknown>
                : {};
            const senderProfile = payload.senderProfile && typeof payload.senderProfile === "object" && !Array.isArray(payload.senderProfile)
                ? payload.senderProfile as Record<string, unknown>
                : {};
            const attachments = item.storedObjects.map(object => {
                const downloadUrl = signedStoragePath(object.id);
                return {
                    id: object.id,
                    name: object.originalName,
                    mimeType: object.mimeType,
                    sizeBytes: object.sizeBytes,
                    downloadUrl,
                    previewUrl: `${downloadUrl}&preview=1`,
                };
            });
            const type = item.sourceType === "email" ? "email" as const
                : item.sourceType === "whatsapp" ? "sms" as const
                : "document" as const;
            return [{
                id: `inbox-${item.id}`,
                caseId: item.detectedCaseId,
                caseName: `${item.detectedCase.clientName} - ${item.detectedCase.caseType}`,
                type,
                direction: "received" as const,
                subject: item.fileName || (type === "email" ? "E-mail recebido" : type === "sms" ? "Mensagem recebida" : "Arquivo recebido"),
                from: item.senderName || item.senderEmail || item.senderPhone || "Remetente não identificado",
                to: "Escritório",
                date: item.receivedAt.toISOString(),
                content: item.rawContent,
                avatarUrl: [senderProfile.picture_url, senderProfile.profile_picture_url, senderProfile.image_url].find((value): value is string => typeof value === "string") || null,
                attachments,
                case: item.detectedCase,
            }];
        });

        // Combine and sort by date
        const allCommunications = [...emailCommunications, ...textCommunications, ...callCommunications, ...receivedCommunications]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return NextResponse.json(allCommunications);
    } catch (error) {
        console.error("Error fetching communications:", error);
        return NextResponse.json(
            { error: "Não foi possível carregar as comunicações" },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const actor = await currentActor();
        const parsed = createCommunicationInput.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json(
                { error: "Dados da comunicação inválidos", details: parsed.error.flatten() },
                { status: 400 },
            );
        }

        const input = parsed.data;
        const caseRecord = await prisma.case.findFirst({
            where: { id: input.caseId, workspaceId: actor.workspaceId },
            select: { id: true, clientName: true, caseType: true },
        });
        if (!caseRecord) return NextResponse.json({ error: "Caso não encontrado" }, { status: 404 });

        const created = await prisma.$transaction(async (tx) => {
            if (input.type === "email") {
                return tx.email.create({ data: { caseId: input.caseId, from: input.from, to: input.to, subject: input.subject!, content: input.content } });
            }
            if (input.type === "sms") {
                return tx.textMessage.create({ data: { caseId: input.caseId, from: input.from, to: input.to, text: input.content } });
            }
            return tx.phoneCall.create({ data: { caseId: input.caseId, phoneNumber: input.to, message: input.content, status: "completed" } });
        });

        await prisma.case.update({ where: { id: input.caseId }, data: { lastActivity: new Date() } });

        return NextResponse.json({
            id: created.id,
            caseId: input.caseId,
            caseName: `${caseRecord.clientName} - ${caseRecord.caseType}`,
            type: input.type,
            subject: input.type === "email" ? input.subject : input.type === "sms" ? `SMS: ${input.from} → ${input.to}` : "Ligação registrada",
            from: input.from,
            to: input.to,
            date: created.createdAt.toISOString(),
            content: input.content,
            case: caseRecord,
        }, { status: 201 });
    } catch (error) {
        console.error("Erro ao registrar comunicação:", error);
        return NextResponse.json({ error: "Não foi possível registrar a comunicação" }, { status: 500 });
    }
}
