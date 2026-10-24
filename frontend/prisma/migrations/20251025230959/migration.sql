/*
  Warnings:

  - You are about to drop the column `updatedAt` on the `Case` table. All the data in the column will be lost.
  - You are about to drop the column `body` on the `Email` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Files` table. All the data in the column will be lost.
  - You are about to drop the column `path` on the `Files` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Files` table. All the data in the column will be lost.
  - Added the required column `assignedTo` to the `Case` table without a default value. This is not possible if the table is not empty.
  - Added the required column `caseType` to the `Case` table without a default value. This is not possible if the table is not empty.
  - Added the required column `description` to the `Case` table without a default value. This is not possible if the table is not empty.
  - Added the required column `nextAction` to the `Case` table without a default value. This is not possible if the table is not empty.
  - Added the required column `content` to the `Email` table without a default value. This is not possible if the table is not empty.
  - Added the required column `from` to the `Email` table without a default value. This is not possible if the table is not empty.
  - Added the required column `to` to the `Email` table without a default value. This is not possible if the table is not empty.
  - Added the required column `size` to the `Files` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `Files` table without a default value. This is not possible if the table is not empty.
  - Added the required column `uploadedBy` to the `Files` table without a default value. This is not possible if the table is not empty.
  - Added the required column `url` to the `Files` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Case" DROP COLUMN "updatedAt",
ADD COLUMN     "assignedTo" TEXT NOT NULL,
ADD COLUMN     "caseType" TEXT NOT NULL,
ADD COLUMN     "description" TEXT NOT NULL,
ADD COLUMN     "lastActivity" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "nextAction" TEXT NOT NULL,
ADD COLUMN     "priority" TEXT NOT NULL DEFAULT 'high';

-- AlterTable
ALTER TABLE "Email" DROP COLUMN "body",
ADD COLUMN     "content" TEXT NOT NULL,
ADD COLUMN     "from" TEXT NOT NULL,
ADD COLUMN     "to" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Files" DROP COLUMN "createdAt",
DROP COLUMN "path",
DROP COLUMN "updatedAt",
ADD COLUMN     "size" TEXT NOT NULL,
ADD COLUMN     "type" TEXT NOT NULL,
ADD COLUMN     "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "uploadedBy" TEXT NOT NULL,
ADD COLUMN     "url" TEXT NOT NULL;
