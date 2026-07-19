ALTER TABLE "emails" ADD COLUMN "message_id" string;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "thread_id" uuid;