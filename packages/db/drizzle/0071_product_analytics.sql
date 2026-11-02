CREATE TABLE "product_activity_daily" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"section" varchar(32) NOT NULL,
	"source" varchar(16) NOT NULL,
	"device" varchar(16) NOT NULL,
	"views" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_activity_daily_positive_views" CHECK ("product_activity_daily"."views" > 0)
);
--> statement-breakpoint
CREATE TABLE "product_analytics_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"collection_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_analytics_config_singleton" CHECK ("product_analytics_config"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "product_activity_daily" ADD CONSTRAINT "product_activity_daily_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_activity_daily_bucket_uidx" ON "product_activity_daily" USING btree ("user_id","day","section","source","device");--> statement-breakpoint
CREATE INDEX "product_activity_daily_day_user_idx" ON "product_activity_daily" USING btree ("day","user_id");
--> statement-breakpoint
INSERT INTO "product_analytics_config" ("id") VALUES (1) ON CONFLICT DO NOTHING;
