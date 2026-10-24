import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { currentActor } from "@/lib/auth/current-actor";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const actor = await currentActor();

        // Get file from database
        const file = await prisma.files.findFirst({
            where: { id, case: { workspaceId: actor.workspaceId } }
        });

        if (!file) {
            return NextResponse.json(
                { error: "Arquivo não encontrado" },
                { status: 404 }
            );
        }

        // For now, redirect to the S3 URL
        // In production, you should generate a presigned URL here
        // using AWS SDK with proper credentials
        
        // If the URL is already a presigned URL or public, redirect to it
        if (file.url) {
            return NextResponse.redirect(file.url);
        }

        return NextResponse.json(
            { error: "File URL not available" },
            { status: 404 }
        );
    } catch (error) {
        console.error("Error downloading file:", error);
        return NextResponse.json(
            { error: "Não foi possível baixar o arquivo" },
            { status: 500 }
        );
    }
}
