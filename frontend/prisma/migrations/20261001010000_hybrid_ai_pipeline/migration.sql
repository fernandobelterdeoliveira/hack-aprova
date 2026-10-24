-- Hybrid AI routing, provenance, audit and provider-independent embeddings.
ALTER TABLE "InboxItem"
  ADD COLUMN "semanticFingerprint" TEXT,
  ADD COLUMN "riskLevel" TEXT,
  ADD COLUMN "requiresDeepReasoning" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "requiresHumanReview" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "decisionProvider" TEXT;

ALTER TABLE "ProposedCaseChange"
  ADD COLUMN "sourceId" TEXT,
  ADD COLUMN "sourceType" TEXT,
  ADD COLUMN "documentId" TEXT,
  ADD COLUMN "sourcePage" INTEGER,
  ADD COLUMN "sourceExcerpt" TEXT,
  ADD COLUMN "provider" TEXT,
  ADD COLUMN "model" TEXT,
  ADD COLUMN "modelVersion" TEXT,
  ADD COLUMN "promptVersion" TEXT,
  ADD COLUMN "extractorVersion" TEXT,
  ADD COLUMN "policyDecision" TEXT,
  ADD COLUMN "aiExecutionId" TEXT;

CREATE TABLE "AIExecution" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "modelVersion" TEXT,
  "promptVersion" TEXT,
  "workflowVersion" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "outputHash" TEXT,
  "input" JSONB,
  "output" JSONB,
  "latencyMs" INTEGER,
  "tokenUsage" JSONB,
  "estimatedCost" DECIMAL(12,8),
  "status" TEXT NOT NULL DEFAULT 'started',
  "error" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "caseId" TEXT,
  "inboxItemId" TEXT,
  CONSTRAINT "AIExecution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmbeddingRecord" (
  "id" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "contentPreview" TEXT,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "modelVersion" TEXT,
  "dimensions" INTEGER NOT NULL,
  "vector" JSONB NOT NULL,
  "caseId" TEXT,
  "inboxItemId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmbeddingRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProposedCaseChange_aiExecutionId_idx" ON "ProposedCaseChange"("aiExecutionId");
CREATE INDEX "AIExecution_inboxItemId_startedAt_idx" ON "AIExecution"("inboxItemId", "startedAt");
CREATE INDEX "AIExecution_caseId_startedAt_idx" ON "AIExecution"("caseId", "startedAt");
CREATE INDEX "AIExecution_provider_model_startedAt_idx" ON "AIExecution"("provider", "model", "startedAt");
CREATE UNIQUE INDEX "EmbeddingRecord_entityType_entityId_provider_model_contentHash_key"
  ON "EmbeddingRecord"("entityType", "entityId", "provider", "model", "contentHash");
CREATE INDEX "EmbeddingRecord_caseId_entityType_idx" ON "EmbeddingRecord"("caseId", "entityType");
CREATE INDEX "EmbeddingRecord_inboxItemId_idx" ON "EmbeddingRecord"("inboxItemId");

ALTER TABLE "ProposedCaseChange" ADD CONSTRAINT "ProposedCaseChange_aiExecutionId_fkey"
  FOREIGN KEY ("aiExecutionId") REFERENCES "AIExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AIExecution" ADD CONSTRAINT "AIExecution_caseId_fkey"
  FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AIExecution" ADD CONSTRAINT "AIExecution_inboxItemId_fkey"
  FOREIGN KEY ("inboxItemId") REFERENCES "InboxItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmbeddingRecord" ADD CONSTRAINT "EmbeddingRecord_caseId_fkey"
  FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmbeddingRecord" ADD CONSTRAINT "EmbeddingRecord_inboxItemId_fkey"
  FOREIGN KEY ("inboxItemId") REFERENCES "InboxItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
