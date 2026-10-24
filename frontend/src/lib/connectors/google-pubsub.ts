import type { NextRequest } from "next/server"

type TokenClaims = { aud?: string; email?: string; email_verified?: string | boolean; exp?: string; iss?: string }
const cache = new Map<string, { claims: TokenClaims; expiresAt: number }>()

export async function verifyGooglePubSubOidc(request: NextRequest) {
  const authorization = request.headers.get("authorization")
  if (!authorization?.startsWith("Bearer ")) return false
  const audience = process.env.GOOGLE_PUBSUB_OIDC_AUDIENCE
  const serviceAccountEmail = process.env.GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL
  if (!audience || !serviceAccountEmail) throw new Error("GOOGLE_PUBSUB_OIDC_AUDIENCE e GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL são obrigatórios")
  const token = authorization.slice(7)
  let claims = cache.get(token)?.claims
  if (!claims || (cache.get(token)?.expiresAt || 0) <= Date.now()) {
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`, { cache: "no-store" })
    if (!response.ok) return false
    claims = await response.json() as TokenClaims
    const expiresAt = Number(claims.exp || 0) * 1000
    cache.set(token, { claims, expiresAt: Math.min(expiresAt, Date.now() + 5 * 60 * 1000) })
  }
  return claims.aud === audience
    && claims.email === serviceAccountEmail
    && (claims.email_verified === true || claims.email_verified === "true")
    && Number(claims.exp || 0) * 1000 > Date.now()
    && ["accounts.google.com", "https://accounts.google.com"].includes(claims.iss || "")
}
