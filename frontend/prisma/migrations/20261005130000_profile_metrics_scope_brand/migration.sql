ALTER TABLE "UserProfile" ALTER COLUMN "accentColor" SET DEFAULT 'emerald';

UPDATE "UserProfile"
SET "accentColor" = 'emerald', "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'current-user' AND "accentColor" = 'cobalt';
