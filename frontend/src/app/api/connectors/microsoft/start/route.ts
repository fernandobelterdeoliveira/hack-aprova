import { NextRequest, NextResponse } from "next/server"
import { microsoftAuthorizationUrl, microsoftConfigured } from "@/lib/connectors/microsoft"

export async function GET(request: NextRequest) {
  if (!microsoftConfigured()) {
    const settings = new URL("/settings", request.nextUrl.origin)
    settings.searchParams.set("section", "connectors")
    return NextResponse.redirect(settings)
  }
  try {
    return NextResponse.redirect(microsoftAuthorizationUrl())
  } catch (error) {
    const settings = new URL("/settings", request.nextUrl.origin)
    settings.searchParams.set("section", "connectors")
    console.error("Não foi possível iniciar o login Microsoft:", error)
    return NextResponse.redirect(settings)
  }
}
