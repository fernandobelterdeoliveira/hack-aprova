import { NextRequest, NextResponse } from "next/server"
import { googleAuthorizationUrl, googleConfigured } from "@/lib/connectors/google"

export async function GET(request: NextRequest) {
  if (!googleConfigured()) {
    const settings = new URL("/communications", request.nextUrl.origin)
    settings.searchParams.set("section", "connectors")
    return NextResponse.redirect(settings)
  }
  try {
    return NextResponse.redirect(googleAuthorizationUrl())
  } catch (error) {
    const settings = new URL("/communications", request.nextUrl.origin)
    settings.searchParams.set("section", "connectors")
    console.error("Não foi possível iniciar o login Google:", error)
    return NextResponse.redirect(settings)
  }
}
