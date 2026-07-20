CREATE INDEX "emails_participant_received_idx" ON "emails" ("to","from","received_at","id");--> statement-breakpoint
CREATE INDEX "emails_thread_received_idx" ON "emails" ("thread_id","received_at","id");--> statement-breakpoint
CREATE INDEX "emails_message_id_idx" ON "emails" ("message_id");