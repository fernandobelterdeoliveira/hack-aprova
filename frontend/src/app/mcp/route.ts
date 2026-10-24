import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { authenticateMCP, MCPAuthenticationError, unauthorizedMCP } from "@/lib/auth/mcp-auth"
import { createLexiLoopMCPServer } from "@/lib/mcp/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function handler(request: Request) {
  try {
    const principal = await authenticateMCP(request)
    const transport = new WebStandardStreamableHTTPServerTransport()
    const server = createLexiLoopMCPServer(principal)
    await server.connect(transport)
    return transport.handleRequest(request)
  } catch (error) {
    if (error instanceof MCPAuthenticationError) {
      if (error.status === 401) return unauthorizedMCP(request, error.message)
      return Response.json({ error: error.message }, { status: error.status })
    }
    console.error("MCP request failed", error)
    return Response.json({ error: "Não foi possível processar a solicitação MCP." }, { status: 500 })
  }
}

export const GET = handler
export const POST = handler
export const DELETE = handler
