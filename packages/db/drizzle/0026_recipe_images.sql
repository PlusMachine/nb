DO $$ BEGIN
 CREATE TYPE "recipe_image_status" AS ENUM('uploading', 'ready', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "recipe_images" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "recipe_id" uuid NOT NULL,
  "storage_key_original" text,
  "storage_key_large" text,
  "storage_key_medium" text,
  "storage_key_thumb" text,
  "width" integer,
  "height" integer,
  "mime_type" varchar(128) NOT NULL,
  "size_bytes" integer NOT NULL,
  "blur_data_url" text,
  "caption" text,
  "alt_text" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_cover" boolean DEFAULT false NOT NULL,
  "status" "recipe_image_status" DEFAULT 'uploading' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);

DO $$ BEGIN
 ALTER TABLE "recipe_images"
 ADD CONSTRAINT "recipe_images_recipe_id_recipes_id_fk"
 FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "recipe_images_recipe_id_idx" ON "recipe_images" ("recipe_id");
CREATE INDEX IF NOT EXISTS "recipe_images_recipe_sort_order_idx" ON "recipe_images" ("recipe_id", "sort_order");
CREATE INDEX IF NOT EXISTS "recipe_images_recipe_cover_idx" ON "recipe_images" ("recipe_id", "is_cover");
CREATE UNIQUE INDEX IF NOT EXISTS "recipe_images_recipe_cover_uidx"
  ON "recipe_images" ("recipe_id")
  WHERE "is_cover" = true AND "deleted_at" IS NULL;
