import { NextRequest, NextResponse } from "next/server"
import { verifyState } from "@/lib/connectors/crypto"
import { configureDriveWatch, configureGmailWatch, exchangeGoogleCode } from "@/lib/connectors/google"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  const settings = new URL("/communications", process.env.APP_BASE_URL || request.nextUrl.origin)
  settings.searchParams.set("section", "connectors")
  try {
    const code = request.nextUrl.searchParams.get("code")
    const state = request.nextUrl.searchParams.get("state")
    if (!code || !state) throw new Error("Resposta OAuth Google incompleta")
    verifyState<{ provider: string }>(state)
    const accounts = await exchangeGoogleCode(code)
    for (const account of accounts) {
      try {
        if (account.provider === "gmail" && process.env.GOOGLE_GMAIL_PUBSUB_TOPIC) await configureGmailWatch(account)
        if (account.provider === "google_drive" && process.env.APP_PUBLIC_URL) await configureDriveWatch(account)
      } catch (error) {
        await prisma.connectorAccount.update({
          where: { id: account.id },
          data: { status: "degraded", errorMessage: error instanceof Error ? error.message : "Falha ao configurar assinatura" },
        })
      }
    }
    settings.searchParams.set("connected", "google")
  } catch (error) {
    settings.searchParams.set("connectorError", error instanceof Error ? error.message : "Falha OAuth Google")
  }
  return NextResponse.redirect(settings)
}
