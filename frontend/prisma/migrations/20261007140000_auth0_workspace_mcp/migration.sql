CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

INSERT INTO "Workspace" ("id", "name", "slug", "createdAt", "updatedAt")
VALUES ('default-workspace', 'LexiLoop', 'lexiloop', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

ALTER TABLE "UserProfile" ADD COLUMN "authSubject" TEXT;
CREATE UNIQUE INDEX "UserProfile_authSubject_key" ON "UserProfile"("authSubject");

CREATE TABLE "WorkspaceMember" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userProfileId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);

INSERT INTO "WorkspaceMember" ("id", "workspaceId", "userProfileId", "role", "createdAt", "updatedAt")
SELECT 'default-workspace-current-user', 'default-workspace', "id", 'owner', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "UserProfile" WHERE "id" = 'current-user';

CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_userProfileId_key" ON "WorkspaceMember"("workspaceId", "userProfileId");
CREATE INDEX "WorkspaceMember_userProfileId_idx" ON "WorkspaceMember"("userProfileId");

ALTER TABLE "Case" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'default-workspace';
ALTER TABLE "InboxItem" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'default-workspace';
ALTER TABLE "ConnectorAccount" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'default-workspace';
ALTER TABLE "ConnectorAccount" ADD COLUMN "userProfileId" TEXT;

CREATE INDEX "Case_workspaceId_lastActivity_idx" ON "Case"("workspaceId", "lastActivity");
CREATE INDEX "InboxItem_workspaceId_receivedAt_idx" ON "InboxItem"("workspaceId", "receivedAt");
DROP INDEX "InboxItem_sourceType_sourceExternalId_key";
DROP INDEX "InboxItem_sourceType_contentHash_key";
CREATE UNIQUE INDEX "InboxItem_workspaceId_sourceType_sourceExternalId_key" ON "InboxItem"("workspaceId", "sourceType", "sourceExternalId");
CREATE UNIQUE INDEX "InboxItem_workspaceId_sourceType_contentHash_key" ON "InboxItem"("workspaceId", "sourceType", "contentHash");
CREATE INDEX "ConnectorAccount_workspaceId_provider_status_idx" ON "ConnectorAccount"("workspaceId", "provider", "status");

CREATE TABLE "MCPToolExecution" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userProfileId" TEXT,
    "toolName" TEXT NOT NULL,
    "requiredScope" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MCPToolExecution_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MCPToolExecution_workspaceId_createdAt_idx" ON "MCPToolExecution"("workspaceId", "createdAt");
CREATE INDEX "MCPToolExecution_userProfileId_createdAt_idx" ON "MCPToolExecution"("userProfileId", "createdAt");
CREATE INDEX "MCPToolExecution_toolName_createdAt_idx" ON "MCPToolExecution"("toolName", "createdAt");

ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userProfileId_fkey" FOREIGN KEY ("userProfileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Case" ADD CONSTRAINT "Case_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InboxItem" ADD CONSTRAINT "InboxItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConnectorAccount" ADD CONSTRAINT "ConnectorAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConnectorAccount" ADD CONSTRAINT "ConnectorAccount_userProfileId_fkey" FOREIGN KEY ("userProfileId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MCPToolExecution" ADD CONSTRAINT "MCPToolExecution_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MCPToolExecution" ADD CONSTRAINT "MCPToolExecution_userProfileId_fkey" FOREIGN KEY ("userProfileId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
