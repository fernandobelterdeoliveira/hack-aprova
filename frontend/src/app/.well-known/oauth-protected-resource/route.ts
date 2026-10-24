function issuer() {
  const domain = process.env.AUTH0_DOMAIN?.replace(/^https?:\/\//, "").replace(/\/$/, "")
  return domain ? `https://${domain}/` : ""
}

export async function GET(request: Request) {
  const authorizationServer = issuer()
  const resource = process.env.MCP_PUBLIC_URL?.replace(/\/$/, "") || `${new URL(request.url).origin}/mcp`
  if (!authorizationServer) {
    return Response.json({ error: "OAuth do MCP ainda não configurado." }, { status: 503 })
  }
  return Response.json({
    resource,
    authorization_servers: [authorizationServer],
    scopes_supported: ["profile.read", "cases.read"],
    bearer_methods_supported: ["header"],
    resource_documentation: `${new URL(request.url).origin}/docs/mcp`,
  })
}
