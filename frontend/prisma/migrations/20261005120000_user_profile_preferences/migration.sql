CREATE TABLE "UserProfile" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "email" TEXT,
  "bio" TEXT,
  "avatarUrl" TEXT,
  "language" TEXT NOT NULL DEFAULT 'pt-BR',
  "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  "theme" TEXT NOT NULL DEFAULT 'light',
  "accentColor" TEXT NOT NULL DEFAULT 'cobalt',
  "density" TEXT NOT NULL DEFAULT 'comfortable',
  "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
  "deadlineNotifications" BOOLEAN NOT NULL DEFAULT true,
  "reviewNotifications" BOOLEAN NOT NULL DEFAULT true,
  "weeklyDigest" BOOLEAN NOT NULL DEFAULT false,
  "telemetryEnabled" BOOLEAN NOT NULL DEFAULT false,
  "dataRetentionDays" INTEGER NOT NULL DEFAULT 365,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

INSERT INTO "UserProfile" (
  "id", "name", "role", "email", "updatedAt"
) VALUES (
  'current-user', 'Alex Reyes', 'Assistente jurídico', 'alex.reyes@escritorio.local', CURRENT_TIMESTAMP
);
