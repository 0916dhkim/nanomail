CREATE TABLE "emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"from" string NOT NULL,
	"to" string NOT NULL,
	"subject" string DEFAULT '' NOT NULL,
	"body_text" string,
	"body_html" string,
	"is_inbound" bool DEFAULT true NOT NULL,
	"is_read" bool DEFAULT false NOT NULL,
	"received_at" timestamptz DEFAULT now() NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"expires_at" timestamptz NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"email" string NOT NULL,
	"password_hash" string NOT NULL,
	"is_admin" bool DEFAULT false NOT NULL,
	"created_at" timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_key" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");