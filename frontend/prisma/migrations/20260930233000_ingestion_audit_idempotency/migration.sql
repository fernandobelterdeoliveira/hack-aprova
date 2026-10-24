ALTER TABLE "InboxItem" ADD COLUMN "contentHash" TEXT;
ALTER TABLE "ProposedCaseChange" ADD COLUMN "fingerprint" TEXT;
ALTER TABLE "ProposedCaseChange" ADD COLUMN "processingRunId" TEXT;
ALTER TABLE "CaseEvent" ADD COLUMN "deduplicationKey" TEXT;
ALTER TABLE "CaseFact" ADD COLUMN "deduplicationKey" TEXT;
ALTER TABLE "InformationGap" ADD COLUMN "deduplicationKey" TEXT;
ALTER TABLE "AITask" ADD COLUMN "deduplicationKey" TEXT;

CREATE TABLE "InboxProcessingRun" (
    "id" TEXT NOT NULL,
    "inboxItemId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "extractorVersion" TEXT NOT NULL,
    "processingVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "output" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "InboxProcessingRun_pkey" PRIMARY KEY ("id")
);

UPDATE "InboxItem" SET "contentHash" = md5("sourceType" || ':' || "id") WHERE "contentHash" IS NULL;
UPDATE "ProposedCaseChange" SET "fingerprint" = md5("type" || ':' || "id") WHERE "fingerprint" IS NULL;

INSERT INTO "InboxProcessingRun" (
    "id", "inboxItemId", "model", "promptVersion", "extractorVersion",
    "processingVersion", "status", "startedAt", "completedAt"
)
SELECT
    'legacy_' || "id", "id", 'legacy', 'legacy', 'legacy', 'legacy',
    'completed', "createdAt", "updatedAt"
FROM "InboxItem";

UPDATE "ProposedCaseChange"
SET "processingRunId" = 'legacy_' || "inboxItemId"
WHERE "processingRunId" IS NULL;

ALTER TABLE "InboxItem" ALTER COLUMN "contentHash" SET NOT NULL;
ALTER TABLE "ProposedCaseChange" ALTER COLUMN "fingerprint" SET NOT NULL;
ALTER TABLE "ProposedCaseChange" ALTER COLUMN "processingRunId" SET NOT NULL;

CREATE UNIQUE INDEX "InboxItem_sourceType_contentHash_key" ON "InboxItem"("sourceType", "contentHash");
CREATE UNIQUE INDEX "ProposedCaseChange_processingRunId_fingerprint_key" ON "ProposedCaseChange"("processingRunId", "fingerprint");
CREATE UNIQUE INDEX "CaseEvent_deduplicationKey_key" ON "CaseEvent"("deduplicationKey");
CREATE UNIQUE INDEX "CaseFact_deduplicationKey_key" ON "CaseFact"("deduplicationKey");
CREATE UNIQUE INDEX "InformationGap_deduplicationKey_key" ON "InformationGap"("deduplicationKey");
CREATE UNIQUE INDEX "AITask_deduplicationKey_key" ON "AITask"("deduplicationKey");
CREATE INDEX "InboxProcessingRun_inboxItemId_startedAt_idx" ON "InboxProcessingRun"("inboxItemId", "startedAt");

ALTER TABLE "InboxProcessingRun" ADD CONSTRAINT "InboxProcessingRun_inboxItemId_fkey" FOREIGN KEY ("inboxItemId") REFERENCES "InboxItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProposedCaseChange" ADD CONSTRAINT "ProposedCaseChange_processingRunId_fkey" FOREIGN KEY ("processingRunId") REFERENCES "InboxProcessingRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
