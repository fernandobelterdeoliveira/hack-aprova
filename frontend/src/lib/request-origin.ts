import type { NextRequest } from "next/server"
export function sameOrigin(request: NextRequest) {
 const origin = request.headers.get("origin")
 if (!origin) return true
 try {
  const url = new URL(origin)
  return ["http:","https:"].includes(url.protocol) && url.host === request.headers.get("host")
 } catch { return false }
}
