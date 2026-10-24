-- CreateTable
CREATE TABLE "MunicipalProcess" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "municipality" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "contactPhone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'collecting',
    "targetDate" TIMESTAMP(3),
    "rules" JSONB NOT NULL DEFAULT '[]',
    "sources" JSONB NOT NULL DEFAULT '[]',
    "scenarios" JSONB NOT NULL DEFAULT '[]',
    "history" JSONB NOT NULL DEFAULT '[]',
    "minutesSpent" INTEGER NOT NULL DEFAULT 0,
    "clarificationRounds" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MunicipalProcess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppChatMessage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "contactName" TEXT,
    "direction" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "providerId" TEXT,
    "requestKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'received',
    "errorMessage" TEXT,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MunicipalProcess_workspaceId_municipality_department_idx" ON "MunicipalProcess"("workspaceId", "municipality", "department");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppChatMessage_providerId_key" ON "WhatsAppChatMessage"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppChatMessage_requestKey_key" ON "WhatsAppChatMessage"("requestKey");

-- CreateIndex
CREATE INDEX "WhatsAppChatMessage_workspaceId_phone_createdAt_idx" ON "WhatsAppChatMessage"("workspaceId", "phone", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppChatMessage_accountId_createdAt_idx" ON "WhatsAppChatMessage"("accountId", "createdAt");
