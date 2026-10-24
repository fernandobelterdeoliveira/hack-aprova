CREATE TABLE "BackgroundJob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "progressMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "timeoutMs" INTEGER NOT NULL DEFAULT 300000,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "cancelRequestedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "deadLetteredAt" TIMESTAMP(3),
    "deduplicationKey" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "caseId" TEXT,
    "inboxItemId" TEXT,
    CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BackgroundJob_deduplicationKey_key" ON "BackgroundJob"("deduplicationKey");
CREATE INDEX "BackgroundJob_status_availableAt_priority_idx" ON "BackgroundJob"("status", "availableAt", "priority");
CREATE INDEX "BackgroundJob_workspaceId_status_createdAt_idx" ON "BackgroundJob"("workspaceId", "status", "createdAt");
CREATE INDEX "BackgroundJob_inboxItemId_createdAt_idx" ON "BackgroundJob"("inboxItemId", "createdAt");
CREATE INDEX "BackgroundJob_caseId_createdAt_idx" ON "BackgroundJob"("caseId", "createdAt");
ALTER TABLE "BackgroundJob" ADD CONSTRAINT "BackgroundJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BackgroundJob" ADD CONSTRAINT "BackgroundJob_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BackgroundJob" ADD CONSTRAINT "BackgroundJob_inboxItemId_fkey" FOREIGN KEY ("inboxItemId") REFERENCES "InboxItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
