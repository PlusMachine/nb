CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$ BEGIN
 CREATE TYPE "ingredient_type" AS ENUM('fermentable', 'hop', 'yeast', 'sugar', 'adjunct', 'fining', 'misc');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "ingredient_status" AS ENUM('draft', 'active', 'archived', 'merged');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "ingredient_visibility" AS ENUM('public', 'internal');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "proposed_ingredient_status" AS ENUM('pending', 'approved', 'rejected', 'merged');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "ingredient_catalog_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "type" "ingredient_type" NOT NULL,
  "subtype" varchar(80),
  "display_name" varchar(180) NOT NULL,
  "normalized_name" varchar(220) NOT NULL,
  "aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "manufacturer" varchar(140),
  "country" varchar(80),
  "description" text,
  "default_unit" varchar(32) NOT NULL,
  "properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" "ingredient_status" DEFAULT 'active' NOT NULL,
  "visibility" "ingredient_visibility" DEFAULT 'public' NOT NULL,
  "merged_into_id" uuid,
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "ingredient_catalog_items" DROP CONSTRAINT IF EXISTS "ingredient_catalog_items_merged_into_id_fkey";
ALTER TABLE "ingredient_catalog_items" ADD CONSTRAINT "ingredient_catalog_items_merged_into_id_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "ingredient_catalog_items"("id") ON DELETE set null;
ALTER TABLE "ingredient_catalog_items" DROP CONSTRAINT IF EXISTS "ingredient_catalog_items_created_by_fkey";
ALTER TABLE "ingredient_catalog_items" ADD CONSTRAINT "ingredient_catalog_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null;
ALTER TABLE "ingredient_catalog_items" DROP CONSTRAINT IF EXISTS "ingredient_catalog_items_updated_by_fkey";
ALTER TABLE "ingredient_catalog_items" ADD CONSTRAINT "ingredient_catalog_items_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE set null;

CREATE UNIQUE INDEX IF NOT EXISTS "ingredient_catalog_items_type_name_uidx" ON "ingredient_catalog_items" ("type", "normalized_name");
CREATE INDEX IF NOT EXISTS "ingredient_catalog_items_normalized_name_idx" ON "ingredient_catalog_items" ("normalized_name");
CREATE INDEX IF NOT EXISTS "ingredient_catalog_items_type_status_idx" ON "ingredient_catalog_items" ("type", "status");
CREATE INDEX IF NOT EXISTS "ingredient_catalog_items_status_idx" ON "ingredient_catalog_items" ("status");
CREATE INDEX IF NOT EXISTS "ingredient_catalog_items_merged_into_idx" ON "ingredient_catalog_items" ("merged_into_id");
CREATE INDEX IF NOT EXISTS "ingredient_catalog_items_display_name_trgm_idx" ON "ingredient_catalog_items" USING gin ("display_name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "ingredient_catalog_items_normalized_name_trgm_idx" ON "ingredient_catalog_items" USING gin ("normalized_name" gin_trgm_ops);

CREATE TABLE IF NOT EXISTS "proposed_ingredients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "submitted_by_user_id" uuid,
  "source_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "source_type" varchar(48) NOT NULL,
  "source_display_name" varchar(180) NOT NULL,
  "normalized_name" varchar(220) NOT NULL,
  "status" "proposed_ingredient_status" DEFAULT 'pending' NOT NULL,
  "target_ingredient_id" uuid,
  "moderator_id" uuid,
  "resolution_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "proposed_ingredients" DROP CONSTRAINT IF EXISTS "proposed_ingredients_submitted_by_user_id_fkey";
ALTER TABLE "proposed_ingredients" ADD CONSTRAINT "proposed_ingredients_submitted_by_user_id_fkey" FOREIGN KEY ("submitted_by_user_id") REFERENCES "users"("id") ON DELETE set null;
ALTER TABLE "proposed_ingredients" DROP CONSTRAINT IF EXISTS "proposed_ingredients_target_ingredient_id_fkey";
ALTER TABLE "proposed_ingredients" ADD CONSTRAINT "proposed_ingredients_target_ingredient_id_fkey" FOREIGN KEY ("target_ingredient_id") REFERENCES "ingredient_catalog_items"("id") ON DELETE set null;
ALTER TABLE "proposed_ingredients" DROP CONSTRAINT IF EXISTS "proposed_ingredients_moderator_id_fkey";
ALTER TABLE "proposed_ingredients" ADD CONSTRAINT "proposed_ingredients_moderator_id_fkey" FOREIGN KEY ("moderator_id") REFERENCES "users"("id") ON DELETE set null;

CREATE INDEX IF NOT EXISTS "proposed_ingredients_status_created_idx" ON "proposed_ingredients" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "proposed_ingredients_normalized_name_idx" ON "proposed_ingredients" ("normalized_name");
