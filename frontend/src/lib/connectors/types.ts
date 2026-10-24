import type { Prisma } from "@prisma/client"
import type { InboxInput } from "@/lib/inbox-service"
import type { PreparedAttachment } from "@/lib/connectors/storage"

export type ConnectorProvider = "whatsapp" | "gmail" | "outlook" | "google_drive"

export type NormalizedConnectorItem = InboxInput & {
  provider: ConnectorProvider
  externalId: string
  accountExternalId?: string | null
  threadExternalId?: string | null
  metadata?: Prisma.InputJsonValue
  attachments?: PreparedAttachment[]
}

export type OAuthCredentials = {
  accessToken: string
  refreshToken?: string
  expiresAt?: string
  scope?: string
  tokenType?: string
}
