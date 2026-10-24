CREATE TABLE "StoredObject" (
  "id" TEXT NOT NULL,
  "storageProvider" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "sourceProvider" TEXT NOT NULL,
  "sourceExternalId" TEXT,
  "inboxItemId" TEXT,
  "connectorAccountId" TEXT,
  "connectorDeliveryId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoredObject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OutboundMessage" (
  "id" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "connectorAccountId" TEXT NOT NULL,
  "caseId" TEXT,
  "inboxItemId" TEXT,
  "recipient" TEXT NOT NULL,
  "subject" TEXT,
  "content" TEXT NOT NULL,
  "riskLevel" TEXT NOT NULL DEFAULT 'low',
  "messageKind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending_review',
  "idempotencyKey" TEXT NOT NULL,
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "externalId" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OutboundMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StoredObject_storageKey_key" ON "StoredObject"("storageKey");
CREATE INDEX "StoredObject_inboxItemId_idx" ON "StoredObject"("inboxItemId");
CREATE INDEX "StoredObject_connectorDeliveryId_idx" ON "StoredObject"("connectorDeliveryId");
CREATE INDEX "StoredObject_sha256_idx" ON "StoredObject"("sha256");
CREATE UNIQUE INDEX "OutboundMessage_idempotencyKey_key" ON "OutboundMessage"("idempotencyKey");
CREATE INDEX "OutboundMessage_status_createdAt_idx" ON "OutboundMessage"("status", "createdAt");
CREATE INDEX "OutboundMessage_connectorAccountId_createdAt_idx" ON "OutboundMessage"("connectorAccountId", "createdAt");
CREATE INDEX "OutboundMessage_caseId_createdAt_idx" ON "OutboundMessage"("caseId", "createdAt");

ALTER TABLE "StoredObject" ADD CONSTRAINT "StoredObject_inboxItemId_fkey" FOREIGN KEY ("inboxItemId") REFERENCES "InboxItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StoredObject" ADD CONSTRAINT "StoredObject_connectorAccountId_fkey" FOREIGN KEY ("connectorAccountId") REFERENCES "ConnectorAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StoredObject" ADD CONSTRAINT "StoredObject_connectorDeliveryId_fkey" FOREIGN KEY ("connectorDeliveryId") REFERENCES "ConnectorDelivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_connectorAccountId_fkey" FOREIGN KEY ("connectorAccountId") REFERENCES "ConnectorAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_inboxItemId_fkey" FOREIGN KEY ("inboxItemId") REFERENCES "InboxItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
