CREATE TYPE "public"."master_image_status" AS ENUM('uploading', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."master_review_status" AS ENUM('draft', 'pending', 'rejected');--> statement-breakpoint
CREATE TABLE "master_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"item_id" uuid,
	"storage_key_original" text,
	"storage_key_large" text,
	"storage_key_medium" text,
	"storage_key_thumb" text,
	"width" integer,
	"height" integer,
	"mime_type" varchar(128) NOT NULL,
	"size_bytes" integer NOT NULL,
	"blur_data_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" "master_image_status" DEFAULT 'uploading' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "master_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"title" varchar(160) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price_note" varchar(80),
	"cover_image_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "master_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"slug" varchar(220),
	"display_name" varchar(120) NOT NULL,
	"city" varchar(120) NOT NULL,
	"specializations" text[] DEFAULT '{}' NOT NULL,
	"summary" varchar(200) DEFAULT '' NOT NULL,
	"about" text DEFAULT '' NOT NULL,
	"contact_telegram" varchar(200),
	"contact_phone" varchar(200),
	"contact_email" varchar(200),
	"contact_website" varchar(200),
	"craft_since" smallint,
	"review_status" "master_review_status" DEFAULT 'draft' NOT NULL,
	"is_listed" boolean DEFAULT true NOT NULL,
	"published_json" jsonb,
	"published_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"moderator_id" uuid,
	"moderation_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "master_images" ADD CONSTRAINT "master_images_profile_id_master_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."master_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_images" ADD CONSTRAINT "master_images_item_id_master_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."master_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_items" ADD CONSTRAINT "master_items_profile_id_master_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."master_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_profiles" ADD CONSTRAINT "master_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_profiles" ADD CONSTRAINT "master_profiles_moderator_id_users_id_fk" FOREIGN KEY ("moderator_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "master_images_profile_id_idx" ON "master_images" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "master_images_item_id_idx" ON "master_images" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "master_items_profile_id_sort_order_idx" ON "master_items" USING btree ("profile_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "master_profiles_user_id_uidx" ON "master_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "master_profiles_slug_uidx" ON "master_profiles" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "master_profiles_review_status_submitted_at_idx" ON "master_profiles" USING btree ("review_status","submitted_at");