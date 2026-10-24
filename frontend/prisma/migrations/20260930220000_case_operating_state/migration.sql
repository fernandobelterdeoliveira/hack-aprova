-- Move the product from request-oriented analysis to persistent case state.
CREATE TABLE "CaseState" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "healthScore" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastComputedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CaseState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CaseEvent" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "confidence" DOUBLE PRECISION,
    "metadata" JSONB,
    CONSTRAINT "CaseEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CaseFact" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "sourcePage" INTEGER,
    "sourceExcerpt" TEXT,
    "confidence" DOUBLE PRECISION,
    "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    CONSTRAINT "CaseFact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InformationGap" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "suggestedQuestion" TEXT,
    "sourceEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "InformationGap_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CaseState_caseId_key" ON "CaseState"("caseId");
CREATE INDEX "CaseEvent_caseId_occurredAt_idx" ON "CaseEvent"("caseId", "occurredAt");
CREATE INDEX "CaseFact_caseId_fieldName_idx" ON "CaseFact"("caseId", "fieldName");
CREATE INDEX "InformationGap_caseId_status_idx" ON "InformationGap"("caseId", "status");

ALTER TABLE "CaseState" ADD CONSTRAINT "CaseState_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaseEvent" ADD CONSTRAINT "CaseEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaseFact" ADD CONSTRAINT "CaseFact_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InformationGap" ADD CONSTRAINT "InformationGap_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
