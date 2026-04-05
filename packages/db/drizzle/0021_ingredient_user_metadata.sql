CREATE TABLE IF NOT EXISTS "user_ingredient_preferences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "ingredient_catalog_item_id" text,
  "user_custom_ingredient_id" uuid,
  "is_favorite" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_ingredient_preferences_source_linkage_chk" CHECK ((("ingredient_catalog_item_id" IS NOT NULL) <> ("user_custom_ingredient_id" IS NOT NULL)))
);
ALTER TABLE "user_ingredient_preferences" DROP CONSTRAINT IF EXISTS "user_ingredient_preferences_user_id_fkey";
ALTER TABLE "user_ingredient_preferences" ADD CONSTRAINT "user_ingredient_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
ALTER TABLE "user_ingredient_preferences" DROP CONSTRAINT IF EXISTS "user_ingredient_preferences_ingredient_catalog_item_id_fkey";
ALTER TABLE "user_ingredient_preferences" ADD CONSTRAINT "user_ingredient_preferences_ingredient_catalog_item_id_fkey" FOREIGN KEY ("ingredient_catalog_item_id") REFERENCES "ingredients"("id") ON DELETE cascade;
ALTER TABLE "user_ingredient_preferences" DROP CONSTRAINT IF EXISTS "user_ingredient_preferences_user_custom_ingredient_id_fkey";
ALTER TABLE "user_ingredient_preferences" ADD CONSTRAINT "user_ingredient_preferences_user_custom_ingredient_id_fkey" FOREIGN KEY ("user_custom_ingredient_id") REFERENCES "user_custom_ingredients"("id") ON DELETE cascade;

CREATE INDEX IF NOT EXISTS "user_ingredient_preferences_user_id_idx" ON "user_ingredient_preferences" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "user_ingredient_preferences_user_catalog_item_uidx" ON "user_ingredient_preferences" ("user_id", "ingredient_catalog_item_id");
CREATE UNIQUE INDEX IF NOT EXISTS "user_ingredient_preferences_user_custom_item_uidx" ON "user_ingredient_preferences" ("user_id", "user_custom_ingredient_id");

CREATE TABLE IF NOT EXISTS "user_ingredient_purchase_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "ingredient_catalog_item_id" text,
  "user_custom_ingredient_id" uuid,
  "url" text NOT NULL,
  "normalized_url" text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_ingredient_purchase_links_source_linkage_chk" CHECK ((("ingredient_catalog_item_id" IS NOT NULL) <> ("user_custom_ingredient_id" IS NOT NULL)))
);
ALTER TABLE "user_ingredient_purchase_links" DROP CONSTRAINT IF EXISTS "user_ingredient_purchase_links_user_id_fkey";
ALTER TABLE "user_ingredient_purchase_links" ADD CONSTRAINT "user_ingredient_purchase_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
ALTER TABLE "user_ingredient_purchase_links" DROP CONSTRAINT IF EXISTS "user_ingredient_purchase_links_ingredient_catalog_item_id_fkey";
ALTER TABLE "user_ingredient_purchase_links" ADD CONSTRAINT "user_ingredient_purchase_links_ingredient_catalog_item_id_fkey" FOREIGN KEY ("ingredient_catalog_item_id") REFERENCES "ingredients"("id") ON DELETE cascade;
ALTER TABLE "user_ingredient_purchase_links" DROP CONSTRAINT IF EXISTS "user_ingredient_purchase_links_user_custom_ingredient_id_fkey";
ALTER TABLE "user_ingredient_purchase_links" ADD CONSTRAINT "user_ingredient_purchase_links_user_custom_ingredient_id_fkey" FOREIGN KEY ("user_custom_ingredient_id") REFERENCES "user_custom_ingredients"("id") ON DELETE cascade;

CREATE INDEX IF NOT EXISTS "user_ingredient_purchase_links_user_id_idx" ON "user_ingredient_purchase_links" ("user_id");
CREATE INDEX IF NOT EXISTS "user_ingredient_purchase_links_catalog_position_idx" ON "user_ingredient_purchase_links" ("user_id", "ingredient_catalog_item_id", "position");
CREATE INDEX IF NOT EXISTS "user_ingredient_purchase_links_custom_position_idx" ON "user_ingredient_purchase_links" ("user_id", "user_custom_ingredient_id", "position");
CREATE UNIQUE INDEX IF NOT EXISTS "user_ingredient_purchase_links_user_catalog_url_uidx" ON "user_ingredient_purchase_links" ("user_id", "ingredient_catalog_item_id", "normalized_url");
CREATE UNIQUE INDEX IF NOT EXISTS "user_ingredient_purchase_links_user_custom_url_uidx" ON "user_ingredient_purchase_links" ("user_id", "user_custom_ingredient_id", "normalized_url");
