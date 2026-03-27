DO $$
BEGIN
  ALTER TYPE "ingredient_type" ADD VALUE IF NOT EXISTS 'malt';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "ingredient_type" ADD VALUE IF NOT EXISTS 'consumable';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "ingredient_type" ADD VALUE IF NOT EXISTS 'water_treatment';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "ingredient_category" ADD VALUE IF NOT EXISTS 'consumable';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "ingredient_category" ADD VALUE IF NOT EXISTS 'water_treatment';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ingredients" (
  "id" text PRIMARY KEY NOT NULL,
  "type" text NOT NULL,
  "name_ru" text,
  "name_en" text,
  "display_mode_ru" text DEFAULT 'auto' NOT NULL,
  "display_name_override_ru" text,
  "secondary_name_override_ru" text,
  "hide_secondary_name_ru" boolean DEFAULT false NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "country_code" text,
  "country_name" text,
  "brand" text,
  "producer" text,
  "product_code" text,
  "group_name" text,
  "category" text,
  "subcategory" text,
  "item_kind" text,
  "present_on_birrf" boolean,
  "inventory_enabled" boolean DEFAULT true NOT NULL,
  "attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "quantity_defaults" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "ingredient_aliases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ingredient_id" text NOT NULL REFERENCES "ingredients"("id") ON DELETE cascade,
  "locale" text NOT NULL,
  "alias" text NOT NULL,
  "alias_normalized" text NOT NULL,
  "source" text DEFAULT 'seed' NOT NULL,
  "is_enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "ingredient_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ingredient_id" text NOT NULL REFERENCES "ingredients"("id") ON DELETE cascade,
  "kind" text,
  "label" text,
  "url" text,
  "source_basis" text,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "ingredient_package_variants" (
  "id" text PRIMARY KEY NOT NULL,
  "ingredient_id" text NOT NULL REFERENCES "ingredients"("id") ON DELETE cascade,
  "brand" text,
  "product_name_ru" text,
  "country_name_ru" text,
  "package_amount" double precision,
  "package_unit" text,
  "stock_content_amount" double precision,
  "stock_content_unit" text,
  "source_group" text,
  "source_url" text,
  "is_default_for_stock" boolean DEFAULT false NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ingredients_type_idx" ON "ingredients" ("type");
CREATE INDEX IF NOT EXISTS "ingredients_is_active_idx" ON "ingredients" ("is_active");
CREATE INDEX IF NOT EXISTS "ingredients_category_idx" ON "ingredients" ("category");
CREATE INDEX IF NOT EXISTS "ingredients_item_kind_idx" ON "ingredients" ("item_kind");
CREATE INDEX IF NOT EXISTS "ingredients_brand_idx" ON "ingredients" ("brand");
CREATE INDEX IF NOT EXISTS "ingredients_producer_idx" ON "ingredients" ("producer");
CREATE INDEX IF NOT EXISTS "ingredients_product_code_idx" ON "ingredients" ("product_code");

CREATE INDEX IF NOT EXISTS "ingredient_aliases_ingredient_id_idx" ON "ingredient_aliases" ("ingredient_id");
CREATE INDEX IF NOT EXISTS "ingredient_aliases_alias_normalized_idx" ON "ingredient_aliases" ("alias_normalized");
CREATE UNIQUE INDEX IF NOT EXISTS "ingredient_aliases_unique_uidx" ON "ingredient_aliases" ("ingredient_id", "locale", "alias_normalized");

CREATE INDEX IF NOT EXISTS "ingredient_sources_ingredient_id_idx" ON "ingredient_sources" ("ingredient_id");
CREATE INDEX IF NOT EXISTS "ingredient_sources_ingredient_position_idx" ON "ingredient_sources" ("ingredient_id", "position");

CREATE INDEX IF NOT EXISTS "ingredient_package_variants_ingredient_id_idx" ON "ingredient_package_variants" ("ingredient_id");
CREATE INDEX IF NOT EXISTS "ingredient_package_variants_default_idx" ON "ingredient_package_variants" ("ingredient_id", "is_default_for_stock");
CREATE INDEX IF NOT EXISTS "ingredient_package_variants_position_idx" ON "ingredient_package_variants" ("ingredient_id", "position");

ALTER TABLE "proposed_ingredients" DROP CONSTRAINT IF EXISTS "proposed_ingredients_target_ingredient_id_fkey";
ALTER TABLE "proposed_ingredients" ALTER COLUMN "target_ingredient_id" TYPE text USING "target_ingredient_id"::text;
UPDATE "proposed_ingredients" SET "target_ingredient_id" = NULL;
ALTER TABLE "proposed_ingredients"
  ADD CONSTRAINT "proposed_ingredients_target_ingredient_id_fkey"
  FOREIGN KEY ("target_ingredient_id") REFERENCES "ingredients"("id") ON DELETE set null;

ALTER TABLE "user_ingredients" DROP CONSTRAINT IF EXISTS "user_ingredients_ingredient_catalog_item_id_fkey";
ALTER TABLE "user_ingredients" ALTER COLUMN "ingredient_catalog_item_id" TYPE text USING "ingredient_catalog_item_id"::text;
ALTER TABLE "user_ingredients" ADD COLUMN IF NOT EXISTS "package_variant_id" text;
UPDATE "user_ingredients" SET "ingredient_catalog_item_id" = NULL;
ALTER TABLE "user_ingredients" DROP CONSTRAINT IF EXISTS "user_ingredients_package_variant_id_fkey";
ALTER TABLE "user_ingredients"
  ADD CONSTRAINT "user_ingredients_ingredient_catalog_item_id_fkey"
  FOREIGN KEY ("ingredient_catalog_item_id") REFERENCES "ingredients"("id") ON DELETE set null;
ALTER TABLE "user_ingredients"
  ADD CONSTRAINT "user_ingredients_package_variant_id_fkey"
  FOREIGN KEY ("package_variant_id") REFERENCES "ingredient_package_variants"("id") ON DELETE set null;
CREATE INDEX IF NOT EXISTS "user_ingredients_package_variant_idx" ON "user_ingredients" ("package_variant_id");

ALTER TABLE "recipe_ingredients" DROP CONSTRAINT IF EXISTS "recipe_ingredients_ingredient_catalog_item_id_ingredient_catalog_items_id_fk";
ALTER TABLE "recipe_ingredients" ALTER COLUMN "ingredient_catalog_item_id" TYPE text USING "ingredient_catalog_item_id"::text;
UPDATE "recipe_ingredients" SET "ingredient_catalog_item_id" = NULL;
ALTER TABLE "recipe_ingredients"
  ADD CONSTRAINT "recipe_ingredients_ingredient_catalog_item_id_ingredients_id_fk"
  FOREIGN KEY ("ingredient_catalog_item_id") REFERENCES "ingredients"("id") ON DELETE set null;
