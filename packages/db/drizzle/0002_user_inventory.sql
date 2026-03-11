DO $$ BEGIN
 CREATE TYPE "user_custom_ingredient_visibility" AS ENUM('private', 'shared');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "user_custom_ingredients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "type" "ingredient_type" NOT NULL,
  "display_name" varchar(180) NOT NULL,
  "normalized_name" varchar(220) NOT NULL,
  "properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "visibility" "user_custom_ingredient_visibility" DEFAULT 'private' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "user_custom_ingredients" DROP CONSTRAINT IF EXISTS "user_custom_ingredients_user_id_fkey";
ALTER TABLE "user_custom_ingredients" ADD CONSTRAINT "user_custom_ingredients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;

CREATE UNIQUE INDEX IF NOT EXISTS "user_custom_ingredients_user_type_name_uidx" ON "user_custom_ingredients" ("user_id", "type", "normalized_name");
CREATE INDEX IF NOT EXISTS "user_custom_ingredients_user_id_idx" ON "user_custom_ingredients" ("user_id");

CREATE TABLE IF NOT EXISTS "user_ingredients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "ingredient_catalog_item_id" uuid,
  "user_custom_ingredient_id" uuid,
  "quantity" integer NOT NULL,
  "unit" varchar(32) NOT NULL,
  "purchased_at" timestamp with time zone,
  "freshness_date" timestamp with time zone,
  "notes" text,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_ingredients_source_xor_chk" CHECK ((("ingredient_catalog_item_id" IS NOT NULL) <> ("user_custom_ingredient_id" IS NOT NULL))),
  CONSTRAINT "user_ingredients_quantity_positive_chk" CHECK ("quantity" > 0)
);
ALTER TABLE "user_ingredients" DROP CONSTRAINT IF EXISTS "user_ingredients_user_id_fkey";
ALTER TABLE "user_ingredients" ADD CONSTRAINT "user_ingredients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
ALTER TABLE "user_ingredients" DROP CONSTRAINT IF EXISTS "user_ingredients_ingredient_catalog_item_id_fkey";
ALTER TABLE "user_ingredients" ADD CONSTRAINT "user_ingredients_ingredient_catalog_item_id_fkey" FOREIGN KEY ("ingredient_catalog_item_id") REFERENCES "ingredient_catalog_items"("id") ON DELETE set null;
ALTER TABLE "user_ingredients" DROP CONSTRAINT IF EXISTS "user_ingredients_user_custom_ingredient_id_fkey";
ALTER TABLE "user_ingredients" ADD CONSTRAINT "user_ingredients_user_custom_ingredient_id_fkey" FOREIGN KEY ("user_custom_ingredient_id") REFERENCES "user_custom_ingredients"("id") ON DELETE set null;

CREATE INDEX IF NOT EXISTS "user_ingredients_user_id_idx" ON "user_ingredients" ("user_id");
CREATE INDEX IF NOT EXISTS "user_ingredients_user_archived_at_idx" ON "user_ingredients" ("user_id", "archived_at");
CREATE INDEX IF NOT EXISTS "user_ingredients_catalog_item_idx" ON "user_ingredients" ("ingredient_catalog_item_id");
CREATE INDEX IF NOT EXISTS "user_ingredients_custom_item_idx" ON "user_ingredients" ("user_custom_ingredient_id");
