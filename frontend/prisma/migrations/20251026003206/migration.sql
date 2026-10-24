-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "clientPhone" TEXT;

-- CreateTable
CREATE TABLE "PhoneCall" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "phoneNumber" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "callSid" TEXT,
    "status" TEXT NOT NULL DEFAULT 'initiated',
    "duration" INTEGER,
    "statusBeforeCall" TEXT,
    "statusAfterCall" TEXT,

    CONSTRAINT "PhoneCall_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PhoneCall" ADD CONSTRAINT "PhoneCall_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
