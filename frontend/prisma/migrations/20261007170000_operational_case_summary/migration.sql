ALTER TABLE "CaseState"
ADD COLUMN "summarySourceRefs" JSONB,
ADD COLUMN "summaryWarnings" JSONB,
ADD COLUMN "summaryGeneratedBy" TEXT,
ADD COLUMN "summaryUpdatedAt" TIMESTAMP(3);

UPDATE "CaseState"
SET
  "summarySourceRefs" = jsonb_build_array(jsonb_build_object('sourceType', 'case_record', 'sourceId', "caseId", 'label', 'Cadastro inicial do caso')),
  "summaryWarnings" = '[]'::jsonb,
  "summaryGeneratedBy" = 'migration',
  "summaryUpdatedAt" = COALESCE("updatedAt", CURRENT_TIMESTAMP)
WHERE "summaryUpdatedAt" IS NULL;
