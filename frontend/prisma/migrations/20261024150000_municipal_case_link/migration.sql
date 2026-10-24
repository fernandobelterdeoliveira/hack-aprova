ALTER TABLE "Case" ADD COLUMN "municipalProcessId" TEXT;
CREATE UNIQUE INDEX "Case_municipalProcessId_key" ON "Case"("municipalProcessId");
ALTER TABLE "Case" ADD CONSTRAINT "Case_municipalProcessId_fkey" FOREIGN KEY ("municipalProcessId") REFERENCES "MunicipalProcess"("id") ON DELETE SET NULL ON UPDATE CASCADE;
