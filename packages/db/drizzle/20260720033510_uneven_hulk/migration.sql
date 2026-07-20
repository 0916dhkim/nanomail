-- Backfill any null thread_id with a generated UUID so each legacy row
-- becomes its own thread (matching the COALESCE(thread_id, id) behavior
-- the app was using as a fallback).
UPDATE "emails" SET "thread_id" = gen_random_uuid() WHERE "thread_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "emails" ALTER COLUMN "thread_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "emails" ALTER COLUMN "thread_id" SET DEFAULT gen_random_uuid();
