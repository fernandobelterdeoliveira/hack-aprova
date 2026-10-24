import { NextResponse } from "next/server"
import { auth0, auth0Configured } from "@/lib/auth/auth0"

export async function proxy(request: Request) {
  const pathname = new URL(request.url).pathname
  if (pathname.startsWith("/review/") || pathname.startsWith("/api/forms/review/")) return NextResponse.next()
  if (!auth0Configured || !auth0) {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_LOCAL_AUTH !== "true") {
      return NextResponse.json({ error: "Autenticação não configurada" }, { status: 503 })
    }
    return NextResponse.next()
  }
  return auth0.middleware(request)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
}
