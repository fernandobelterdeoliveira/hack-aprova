import { NextRequest, NextResponse } from "next/server"
import { verifyState } from "@/lib/connectors/crypto"
import { configureOutlookSubscription, exchangeMicrosoftCode } from "@/lib/connectors/microsoft"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  const settings = new URL("/communications", process.env.APP_BASE_URL || request.nextUrl.origin)
  settings.searchParams.set("section", "connectors")
  try {
    const code = request.nextUrl.searchParams.get("code")
    const state = request.nextUrl.searchParams.get("state")
    if (!code || !state) throw new Error("Resposta OAuth Microsoft incompleta")
    verifyState<{ provider: string }>(state)
    const account = await exchangeMicrosoftCode(code)
    try {
      await configureOutlookSubscription(account)
    } catch (error) {
      await prisma.connectorAccount.update({
        where: { id: account.id },
        data: { status: "degraded", errorMessage: error instanceof Error ? error.message : "Falha ao configurar assinatura" },
      })
    }
    settings.searchParams.set("connected", "microsoft")
  } catch (error) {
    settings.searchParams.set("connectorError", error instanceof Error ? error.message : "Falha OAuth Microsoft")
  }
  return NextResponse.redirect(settings)
}
