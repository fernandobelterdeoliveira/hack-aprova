-- AlterTable
ALTER TABLE "ReasonChain" ADD COLUMN     "impact" TEXT NOT NULL DEFAULT 'medium',
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'pending';
