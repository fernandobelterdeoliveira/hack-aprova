import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { currentActor } from "@/lib/auth/current-actor";

// PATCH update a task
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  try {
    const { id, taskId } = await params;
    const actor = await currentActor();
    const existing = await prisma.aITask.findFirst({ where: { id: taskId, caseId: id, case: { workspaceId: actor.workspaceId } }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });
    const body = await request.json();

    const updateData: Prisma.AITaskUpdateInput = {};
    
    if (body.status !== undefined) {
      updateData.status = body.status;
      if (body.status === "completed") {
        updateData.completedAt = new Date();
      }
    }
    
    if (body.priority !== undefined) updateData.priority = body.priority;
    if (body.dueDate !== undefined) updateData.dueDate = body.dueDate ? new Date(body.dueDate) : null;

    const task = await prisma.aITask.update({
      where: { id: taskId },
      data: updateData,
    });

    return NextResponse.json(task);
  } catch (error) {
    console.error("Error updating task:", error);
    return NextResponse.json(
      { error: "Não foi possível atualizar a tarefa" },
      { status: 500 }
    );
  }
}

// DELETE a task
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  try {
    const { id, taskId } = await params;
    const actor = await currentActor();
    const existing = await prisma.aITask.findFirst({ where: { id: taskId, caseId: id, case: { workspaceId: actor.workspaceId } }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });

    await prisma.aITask.delete({
      where: { id: taskId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting task:", error);
    return NextResponse.json(
      { error: "Não foi possível excluir a tarefa" },
      { status: 500 }
    );
  }
}
