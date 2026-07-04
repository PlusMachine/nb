ALTER TABLE "users" ADD COLUMN "consent_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "consent_version" varchar(32);