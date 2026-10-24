import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { currentActor } from "@/lib/auth/current-actor";

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const actor = await currentActor();
        const body = await request.json();
        const { phoneNumber, message, statusUpdate } = body;

        if (!phoneNumber || !message) {
            return NextResponse.json(
                { error: "phoneNumber and message are required" },
                { status: 400 }
            );
        }

        // Authorize the case before revealing provider configuration or
        // making any external request.
        const authorizedCase = await prisma.case.findFirst({
            where: { id, workspaceId: actor.workspaceId },
            select: { id: true },
        });
        if (!authorizedCase) {
            return NextResponse.json({ error: "Caso não encontrado" }, { status: 404 });
        }

        const twilioApiUrl = process.env.TWILIO_API_URL;
        if (!twilioApiUrl) {
            return NextResponse.json(
                { error: "O serviço de chamadas não está configurado" },
                { status: 503 }
            );
        }

        // Read the current state, but only mutate it after the provider accepts
        // the call. A delivery failure must not silently change the case.
        const currentCase = await prisma.case.findFirst({
            where: { id, workspaceId: actor.workspaceId },
            select: { status: true }
        });
        if (!currentCase) {
            return NextResponse.json({ error: "Caso não encontrado" }, { status: 404 });
        }
        const statusBeforeCall = currentCase?.status;

        // Make the Twilio API call
        let twilioData;
        try {
            const twilioResponse = await fetch(`${twilioApiUrl}/make-call`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    phoneNumber,
                    message,
                }),
            });

            if (!twilioResponse.ok) {
                const responseText = await twilioResponse.text();
                console.error("Twilio API error response:", responseText);
                throw new Error(`Não foi possível iniciar a chamada: ${twilioResponse.status} ${twilioResponse.statusText}`);
            }

            const responseText = await twilioResponse.text();
            console.log("Twilio API response:", responseText);
            
            try {
                twilioData = JSON.parse(responseText);
            } catch {
                console.error("Failed to parse Twilio response as JSON:", responseText);
                throw new Error(`Invalid response from Twilio API: ${responseText.substring(0, 100)}`);
            }
        } catch (fetchError) {
            throw fetchError;
        }

        await prisma.$transaction([
            prisma.phoneCall.create({
                data: {
                    caseId: id,
                    phoneNumber,
                    message,
                    callSid: twilioData.callSid,
                    status: "initiated",
                    statusBeforeCall,
                    statusAfterCall: statusUpdate || statusBeforeCall
                }
            }),
            prisma.case.update({
                where: { id },
                data: {
                    ...(statusUpdate ? { status: statusUpdate } : {}),
                    lastActivity: new Date()
                }
            })
        ]);

        // Get updated case data
        const updatedCase = await prisma.case.findFirst({
            where: { id, workspaceId: actor.workspaceId },
            include: {
                emails: {
                    orderBy: { createdAt: 'desc' }
                },
                files: {
                    orderBy: { uploadedAt: 'desc' }
                },
                textMessages: {
                    orderBy: { createdAt: 'desc' }
                },
                phoneCalls: {
                    orderBy: { createdAt: 'desc' }
                },
                reasonChains: {
                    orderBy: { timestamp: 'desc' }
                }
            }
        });

        return NextResponse.json({
            success: true,
            callSid: twilioData.callSid,
            message: "Call initiated successfully",
            case: updatedCase
        });
    } catch (error) {
        console.error("Error making call:", error);
        return NextResponse.json(
            { 
                error: "Não foi possível iniciar a chamada", 
                details: error instanceof Error ? error.message : "Erro desconhecido"
            },
            { status: 500 }
        );
    }
}
