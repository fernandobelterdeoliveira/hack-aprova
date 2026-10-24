import assert from "node:assert/strict"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"

process.loadEnvFile?.(".env.local")

const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:3001"
const token = process.env.MCP_TEST_TOKEN || process.env.MCP_LOCAL_TOKEN
assert.ok(token, "Defina MCP_TEST_TOKEN ou MCP_LOCAL_TOKEN para executar o teste MCP.")

const request = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "lexiloop-mcp-test", version: "1.0.0" },
  },
}

const headers = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }
const unauthorized = await fetch(`${baseUrl}/mcp`, { method: "POST", headers, body: JSON.stringify(request) })
assert.equal(unauthorized.status, 401)
assert.match(unauthorized.headers.get("www-authenticate") || "", /oauth-protected-resource/)

const authorized = await fetch(`${baseUrl}/mcp`, {
  method: "POST",
  headers: { ...headers, Authorization: `Bearer ${token}` },
  body: JSON.stringify(request),
})
const body = await authorized.text()
assert.equal(authorized.status, 200, body)
assert.match(body, /LexiLoop/)

const client = new Client({ name: "lexiloop-mcp-test", version: "1.0.0" })
const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
})
await client.connect(transport)
const tools = await client.listTools()
assert.deepEqual(
  new Set(tools.tools.map((tool) => tool.name)),
  new Set(["get_profile", "search_cases", "get_case_state", "get_case_timeline", "get_case_facts", "get_information_gaps", "get_case_tasks", "get_case_documents"]),
)
const search = await client.callTool({ name: "search_cases", arguments: { limit: 1 } })
assert.equal(search.isError, undefined)
assert.ok(search.structuredContent && Array.isArray(search.structuredContent.cases))
await client.close()

console.log("MCP test passed: OAuth challenge, authenticated initialization, tool discovery and scoped case search.")
