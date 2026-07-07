CREATE TYPE "public"."feedback_kind" AS ENUM('inaccuracy', 'improvement', 'bug', 'question');--> statement-breakpoint
CREATE TYPE "public"."feedback_status" AS ENUM('new', 'in_progress', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submitted_by_user_id" uuid,
	"kind" "feedback_kind" NOT NULL,
	"message" text NOT NULL,
	"contact_email" varchar(320),
	"page_url" text,
	"page_path" varchar(512),
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "feedback_status" DEFAULT 'new' NOT NULL,
	"moderator_id" uuid,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_moderator_id_users_id_fk" FOREIGN KEY ("moderator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_status_created_idx" ON "feedback" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "feedback_submitter_idx" ON "feedback" USING btree ("submitted_by_user_id");--> statement-breakpoint
CREATE INDEX "feedback_page_path_idx" ON "feedback" USING btree ("page_path");