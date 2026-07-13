ALTER TABLE "master_images" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "master_images" ADD COLUMN "hidden_reason" text;--> statement-breakpoint
ALTER TABLE "master_images" ADD COLUMN "hidden_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "master_items" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "master_items" ADD COLUMN "hidden_reason" text;--> statement-breakpoint
ALTER TABLE "master_items" ADD COLUMN "hidden_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "hidden_reason" text;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "hidden_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "system_events" ADD COLUMN "actor_user_id" uuid;--> statement-breakpoint
ALTER TABLE "system_events" ADD COLUMN "actor_email" varchar(320);--> statement-breakpoint
ALTER TABLE "system_events" ADD COLUMN "action" varchar(80) DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "system_events" ALTER COLUMN "action" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "system_events" ADD COLUMN "entity_type" varchar(40);--> statement-breakpoint
ALTER TABLE "system_events" ADD COLUMN "entity_id" varchar(64);--> statement-breakpoint
ALTER TABLE "system_events" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "system_events" ADD COLUMN "payload" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "blocked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "blocked_reason" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "blocked_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "anonymized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "master_images" ADD CONSTRAINT "master_images_hidden_by_user_id_users_id_fk" FOREIGN KEY ("hidden_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_items" ADD CONSTRAINT "master_items_hidden_by_user_id_users_id_fk" FOREIGN KEY ("hidden_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_hidden_by_user_id_users_id_fk" FOREIGN KEY ("hidden_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_events" ADD CONSTRAINT "system_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_blocked_by_user_id_users_id_fk" FOREIGN KEY ("blocked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "master_images_hidden_at_idx" ON "master_images" USING btree ("hidden_at");--> statement-breakpoint
CREATE INDEX "master_items_hidden_at_idx" ON "master_items" USING btree ("hidden_at");--> statement-breakpoint
CREATE INDEX "recipes_hidden_at_idx" ON "recipes" USING btree ("hidden_at");--> statement-breakpoint
CREATE INDEX "system_events_action_created_at_idx" ON "system_events" USING btree ("action","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "system_events_entity_idx" ON "system_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "system_events_created_at_idx" ON "system_events" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "users_blocked_at_idx" ON "users" USING btree ("blocked_at");--> statement-breakpoint
ALTER TABLE "system_events" DROP COLUMN "kind";--> statement-breakpoint
-- Догоняем 0044: из-за заниженного "when" в _journal.json та миграция молча не
-- применилась на части баз, и push_subscriptions там нет (features/notifications
-- падает на INSERT). Идемпотентно: где 0044 прошла — все четыре шага no-op.
CREATE TABLE IF NOT EXISTS "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_endpoint_uidx" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "push_subscriptions_user_id_idx" ON "push_subscriptions" USING btree ("user_id");