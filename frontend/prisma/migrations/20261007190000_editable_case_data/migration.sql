ALTER TABLE "Case" ALTER COLUMN "clientDob" DROP NOT NULL;

ALTER TABLE "CaseFact"
ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "archivedBy" TEXT,
ADD COLUMN "lastEditedAt" TIMESTAMP(3),
ADD COLUMN "lastEditedBy" TEXT;

CREATE INDEX "CaseFact_caseId_archivedAt_idx" ON "CaseFact"("caseId", "archivedAt");

CREATE TABLE "CaseDataChange" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "previousValue" JSONB,
    "newValue" JSONB,
    "changedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaseDataChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CaseDataChange_caseId_createdAt_idx" ON "CaseDataChange"("caseId", "createdAt");
CREATE INDEX "CaseDataChange_entityType_entityId_idx" ON "CaseDataChange"("entityType", "entityId");
ALTER TABLE "CaseDataChange" ADD CONSTRAINT "CaseDataChange_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
