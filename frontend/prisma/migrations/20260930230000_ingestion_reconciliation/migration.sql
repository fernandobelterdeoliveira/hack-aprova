ALTER TABLE "Case" ADD COLUMN "clientEmail" TEXT;

CREATE TABLE "InboxItem" (
    "id" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceExternalId" TEXT,
    "senderName" TEXT,
    "senderEmail" TEXT,
    "senderPhone" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "rawContent" TEXT NOT NULL,
    "fileName" TEXT,
    "fileType" TEXT,
    "fileUrl" TEXT,
    "detectedCaseId" TEXT,
    "associationConfidence" DOUBLE PRECISION,
    "associationSignals" JSONB,
    "classification" TEXT,
    "processingStatus" TEXT NOT NULL DEFAULT 'pending',
    "reviewStatus" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InboxItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProposedCaseChange" (
    "id" TEXT NOT NULL,
    "inboxItemId" TEXT NOT NULL,
    "caseId" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "riskLevel" TEXT NOT NULL DEFAULT 'medium',
    "requiresReview" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProposedCaseChange_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InboxItem_sourceType_sourceExternalId_key" ON "InboxItem"("sourceType", "sourceExternalId");
CREATE INDEX "InboxItem_reviewStatus_receivedAt_idx" ON "InboxItem"("reviewStatus", "receivedAt");
CREATE INDEX "InboxItem_detectedCaseId_idx" ON "InboxItem"("detectedCaseId");
CREATE INDEX "ProposedCaseChange_inboxItemId_status_idx" ON "ProposedCaseChange"("inboxItemId", "status");
CREATE INDEX "ProposedCaseChange_caseId_status_idx" ON "ProposedCaseChange"("caseId", "status");

ALTER TABLE "InboxItem" ADD CONSTRAINT "InboxItem_detectedCaseId_fkey" FOREIGN KEY ("detectedCaseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProposedCaseChange" ADD CONSTRAINT "ProposedCaseChange_inboxItemId_fkey" FOREIGN KEY ("inboxItemId") REFERENCES "InboxItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProposedCaseChange" ADD CONSTRAINT "ProposedCaseChange_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;
