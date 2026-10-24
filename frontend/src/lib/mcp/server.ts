import "server-only"

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { fingerprintMCPInput, requireMCPScope, type MCPPrincipal } from "@/lib/auth/mcp-auth"

type ToolResult = Record<string, unknown>

function result(value: ToolResult) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    structuredContent: value,
  }
}

async function audited(
  principal: MCPPrincipal,
  toolName: string,
  requiredScope: string,
  input: unknown,
  run: () => Promise<ToolResult>,
) {
  const startedAt = Date.now()
  let status = "completed"
  let error: string | undefined
  try {
    requireMCPScope(principal, requiredScope)
    return result(await run())
  } catch (cause) {
    status = "failed"
    error = cause instanceof Error ? cause.message : "Falha desconhecida"
    throw cause
  } finally {
    await prisma.mCPToolExecution.create({
      data: {
        workspaceId: principal.workspaceId,
        userProfileId: principal.userProfileId,
        toolName,
        requiredScope,
        inputHash: fingerprintMCPInput(input),
        status,
        latencyMs: Date.now() - startedAt,
        error,
      },
    })
  }
}

async function caseInWorkspace(caseId: string, workspaceId: string) {
  const lawCase = await prisma.case.findFirst({ where: { id: caseId, workspaceId } })
  if (!lawCase) throw new Error("Caso não encontrado neste escritório.")
  return lawCase
}

const readSecurity = [{ type: "oauth2", scopes: ["cases.read"] }]

export function createLexiLoopMCPServer(principal: MCPPrincipal) {
  const server = new McpServer({ name: "LexiLoop", version: "1.0.0" })

  server.registerTool(
    "get_profile",
    {
      title: "Ver perfil LexiLoop",
      description: "Retorna o perfil autenticado e o escritório ativo.",
      inputSchema: {},
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["profile.read"] }] },
    },
    async () => audited(principal, "get_profile", "profile.read", {}, async () => {
      const profile = await prisma.userProfile.findUnique({
        where: { id: principal.userProfileId },
        select: { id: true, name: true, role: true, email: true, language: true, timezone: true },
      })
      const workspace = await prisma.workspace.findUnique({
        where: { id: principal.workspaceId },
        select: { id: true, name: true, slug: true },
      })
      return { profile, workspace }
    }),
  )

  server.registerTool(
    "search_cases",
    {
      title: "Buscar casos",
      description: "Busca casos somente dentro do escritório autenticado.",
      inputSchema: { query: z.string().trim().max(200).optional(), status: z.string().trim().max(40).optional(), limit: z.number().int().min(1).max(50).default(20) },
      _meta: { securitySchemes: readSecurity },
    },
    async (input) => audited(principal, "search_cases", "cases.read", input, async () => {
      const query = input.query || ""
      const cases = await prisma.case.findMany({
        where: {
          workspaceId: principal.workspaceId,
          ...(input.status ? { status: input.status } : {}),
          ...(query ? { OR: [
            { caseNumber: { contains: query, mode: "insensitive" } },
            { clientName: { contains: query, mode: "insensitive" } },
            { caseType: { contains: query, mode: "insensitive" } },
          ] } : {}),
        },
        select: { id: true, caseNumber: true, clientName: true, caseType: true, status: true, priority: true, lastActivity: true, nextAction: true },
        orderBy: { lastActivity: "desc" },
        take: input.limit,
      })
      return { cases, count: cases.length }
    }),
  )

  const caseIdInput = { caseId: z.string().min(1) }
  const registerCaseTool = (
    name: string,
    title: string,
    description: string,
    load: (caseId: string) => Promise<unknown>,
  ) => server.registerTool(name, { title, description, inputSchema: caseIdInput, _meta: { securitySchemes: readSecurity } }, async (input) =>
    audited(principal, name, "cases.read", input, async () => {
      await caseInWorkspace(input.caseId, principal.workspaceId)
      return { caseId: input.caseId, data: await load(input.caseId) }
    }),
  )

  registerCaseTool("get_case_state", "Ver estado do caso", "Retorna o resumo operacional persistente do caso.", (caseId) =>
    prisma.caseState.findUnique({ where: { caseId } }),
  )
  registerCaseTool("get_case_timeline", "Ver linha do tempo", "Retorna os eventos do caso em ordem cronológica decrescente.", (caseId) =>
    prisma.caseEvent.findMany({ where: { caseId }, orderBy: { occurredAt: "desc" }, take: 100 }),
  )
  registerCaseTool("get_case_facts", "Ver fatos", "Retorna fatos do caso com proveniência.", (caseId) =>
    prisma.caseFact.findMany({ where: { caseId, archivedAt: null }, orderBy: { extractedAt: "desc" } }),
  )
  registerCaseTool("get_information_gaps", "Ver lacunas", "Retorna informações que ainda faltam no caso.", (caseId) =>
    prisma.informationGap.findMany({ where: { caseId, status: "open" }, orderBy: { createdAt: "desc" } }),
  )
  registerCaseTool("get_case_tasks", "Ver tarefas", "Retorna tarefas pendentes e em andamento.", (caseId) =>
    prisma.aITask.findMany({ where: { caseId, status: { notIn: ["completed", "dismissed"] } }, orderBy: { createdAt: "desc" } }),
  )
  registerCaseTool("get_case_documents", "Ver documentos", "Lista documentos do caso sem expor credenciais de conectores.", (caseId) =>
    prisma.files.findMany({ where: { caseId }, select: { id: true, name: true, type: true, size: true, uploadedAt: true, uploadedBy: true }, orderBy: { uploadedAt: "desc" } }),
  )

  return server
}
