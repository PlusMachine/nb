CREATE TYPE "public"."firmware_channel" AS ENUM('stable', 'beta');--> statement-breakpoint
CREATE TABLE "firmware_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" text DEFAULT 'brewforge' NOT NULL,
	"version" text NOT NULL,
	"channel" "firmware_channel" DEFAULT 'stable' NOT NULL,
	"protocol_schema" integer NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"file_sha256" text NOT NULL,
	"storage_path" text NOT NULL,
	"published_at" timestamp with time zone,
	"yanked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brew_devices" ADD COLUMN "update_notified_fw" text;--> statement-breakpoint
CREATE UNIQUE INDEX "firmware_releases_provider_version_uidx" ON "firmware_releases" USING btree ("provider_id","version");--> statement-breakpoint
CREATE INDEX "firmware_releases_channel_idx" ON "firmware_releases" USING btree ("provider_id","channel");