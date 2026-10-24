import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentActor } from "@/lib/auth/current-actor";
import { z } from "zod";

const createTaskSchema = z.object({
  title: z.string().trim().min(2, "Informe o título da tarefa."),
  description: z.string().trim().min(2, "Informe o que precisa ser feito."),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  category: z.enum(["document", "communication", "research", "deadline", "follow-up"]).default("follow-up"),
  estimatedTime: z.string().trim().optional(),
  reasoning: z.string().trim().optional(),
  dueDate: z.string().date().optional(),
});

// GET all tasks for a case
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const actor = await currentActor();
    const lawCase = await prisma.case.findFirst({ where: { id, workspaceId: actor.workspaceId }, select: { id: true } });
    if (!lawCase) return NextResponse.json({ error: "Caso não encontrado" }, { status: 404 });

    const tasks = await prisma.aITask.findMany({
      where: { caseId: id },
      orderBy: [
        { status: "asc" }, // pending first
        { priority: "desc" }, // high priority first
        { createdAt: "desc" },
      ],
    });

    return NextResponse.json(tasks);
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return NextResponse.json(
      { error: "Não foi possível carregar as tarefas" },
      { status: 500 }
    );
  }
}

// POST create a new task manually
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const actor = await currentActor();
    const lawCase = await prisma.case.findFirst({ where: { id, workspaceId: actor.workspaceId }, select: { id: true } });
    if (!lawCase) return NextResponse.json({ error: "Caso não encontrado" }, { status: 404 });
    const parsed = createTaskSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Dados inválidos" }, { status: 400 });
    const body = parsed.data;

    const task = await prisma.aITask.create({
      data: {
        caseId: id,
        title: body.title,
        description: body.description,
        priority: body.priority || "medium",
        category: body.category || "follow-up",
        estimatedTime: body.estimatedTime,
        reasoning: body.reasoning,
        createdBy: actor.userProfileId,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
      },
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error("Error creating task:", error);
    return NextResponse.json(
      { error: "Não foi possível criar a tarefa" },
      { status: 500 }
    );
  }
}
