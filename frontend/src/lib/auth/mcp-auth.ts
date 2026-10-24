import "server-only"

import { createHash, timingSafeEqual } from "node:crypto"
import { createRemoteJWKSet, jwtVerify } from "jose"
import { actorFromIdentity, LOCAL_USER_ID, LOCAL_WORKSPACE_ID, type CurrentActor } from "@/lib/auth/current-actor"

export const MCP_SCOPES = ["profile.read", "cases.read"] as const

export type MCPPrincipal = CurrentActor & { scopes: Set<string> }

export class MCPAuthenticationError extends Error {
  constructor(message: string, public readonly status = 401) {
    super(message)
  }
}

function bearer(request: Request) {
  const value = request.headers.get("authorization") || ""
  return value.startsWith("Bearer ") ? value.slice(7).trim() : ""
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

function issuer() {
  const domain = process.env.AUTH0_DOMAIN?.replace(/^https?:\/\//, "").replace(/\/$/, "")
  return domain ? `https://${domain}/` : ""
}

export function protectedResourceUrl(request: Request) {
  const origin = new URL(request.url).origin
  return `${origin}/.well-known/oauth-protected-resource`
}

export function unauthorizedMCP(request: Request, message = "Autenticação necessária.") {
  return Response.json(
    { error: "unauthorized", error_description: message },
    {
      status: 401,
      headers: {
        "WWW-Authenticate": `Bearer resource_metadata="${protectedResourceUrl(request)}", scope="cases.read profile.read"`,
      },
    },
  )
}

export async function authenticateMCP(request: Request): Promise<MCPPrincipal> {
  const token = bearer(request)
  if (!token) throw new MCPAuthenticationError("Token de acesso ausente.")

  const auth0Issuer = issuer()
  const audience = process.env.AUTH0_MCP_AUDIENCE || process.env.MCP_PUBLIC_URL
  if (auth0Issuer && audience) {
    const jwks = createRemoteJWKSet(new URL(`${auth0Issuer}.well-known/jwks.json`))
    const { payload } = await jwtVerify(token, jwks, { issuer: auth0Issuer, audience })
    if (!payload.sub) throw new MCPAuthenticationError("Token sem identidade.")
    const scope = typeof payload.scope === "string" ? payload.scope.split(/\s+/) : []
    const actor = await actorFromIdentity({
      sub: payload.sub,
      name: typeof payload.name === "string" ? payload.name : null,
      email: typeof payload.email === "string" ? payload.email : null,
    })
    return { ...actor, scopes: new Set(scope) }
  }

  const localToken = process.env.MCP_LOCAL_TOKEN
  if (!localToken) throw new MCPAuthenticationError("MCP não configurado.", 503)
  if (!safeEqual(token, localToken)) throw new MCPAuthenticationError("Token inválido.")
  return {
    userProfileId: LOCAL_USER_ID,
    workspaceId: LOCAL_WORKSPACE_ID,
    role: "owner",
    authSubject: null,
    scopes: new Set(MCP_SCOPES),
  }
}

export function requireMCPScope(principal: MCPPrincipal, scope: string) {
  if (!principal.scopes.has(scope)) throw new MCPAuthenticationError(`Escopo necessário: ${scope}`, 403)
}

export function fingerprintMCPInput(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}
