-- AlterTable
ALTER TABLE "MunicipalProcess" ADD COLUMN     "contactEmail" TEXT;

-- CreateTable
CREATE TABLE "MunicipalTicket" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'information_received',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "currentVersionId" TEXT,
    "approvedVersionId" TEXT,
    "connectorAccountId" TEXT,
    "recipient" TEXT,
    "minutesSpent" INTEGER NOT NULL DEFAULT 0,
    "clarificationRounds" INTEGER NOT NULL DEFAULT 0,
    "baselineMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MunicipalTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MunicipalFormVersion" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "definition" JSONB NOT NULL,
    "contextSnapshot" JSONB NOT NULL,
    "changeSet" JSONB NOT NULL DEFAULT '[]',
    "blockers" JSONB NOT NULL DEFAULT '[]',
    "generatedBy" TEXT NOT NULL,
    "operationKey" TEXT NOT NULL,
    "requestMessageId" TEXT,
    "previousVersionId" TEXT,
    "municipalityDecision" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "testResults" JSONB NOT NULL DEFAULT '{}',
    "reviewTokenHash" TEXT,
    "reviewExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MunicipalFormVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MunicipalTicketMessage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "formVersionId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'text',
    "direction" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'internal',
    "externalKey" TEXT,
    "originalContent" TEXT,
    "inboxItemId" TEXT,
    "whatsappMessageId" TEXT,
    "storageId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "deliveryStatus" TEXT NOT NULL DEFAULT 'internal',
    "externalId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MunicipalTicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MunicipalTicket_processId_key" ON "MunicipalTicket"("processId");

-- CreateIndex
CREATE INDEX "MunicipalTicket_workspaceId_updatedAt_idx" ON "MunicipalTicket"("workspaceId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MunicipalFormVersion_operationKey_key" ON "MunicipalFormVersion"("operationKey");

-- CreateIndex
CREATE UNIQUE INDEX "MunicipalFormVersion_reviewTokenHash_key" ON "MunicipalFormVersion"("reviewTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "MunicipalFormVersion_ticketId_number_key" ON "MunicipalFormVersion"("ticketId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "MunicipalTicketMessage_externalKey_key" ON "MunicipalTicketMessage"("externalKey");

-- CreateIndex
CREATE INDEX "MunicipalTicketMessage_workspaceId_ticketId_createdAt_idx" ON "MunicipalTicketMessage"("workspaceId", "ticketId", "createdAt");

-- AddForeignKey
ALTER TABLE "MunicipalTicket" ADD CONSTRAINT "MunicipalTicket_processId_fkey" FOREIGN KEY ("processId") REFERENCES "MunicipalProcess"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MunicipalFormVersion" ADD CONSTRAINT "MunicipalFormVersion_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "MunicipalTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MunicipalTicketMessage" ADD CONSTRAINT "MunicipalTicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "MunicipalTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MunicipalTicketMessage" ADD CONSTRAINT "MunicipalTicketMessage_formVersionId_fkey" FOREIGN KEY ("formVersionId") REFERENCES "MunicipalFormVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
