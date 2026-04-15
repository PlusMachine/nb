DO $$ BEGIN
 CREATE TYPE "equipment_brew_method" AS ENUM('biab_single_vessel', 'mash_sparge_two_vessel', 'three_vessel', 'extract_partial_boil');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "equipment_batch_target_type" AS ENUM('fermenter', 'packaged');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "equipment_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "name" varchar(180) NOT NULL,
  "brew_method" "equipment_brew_method" DEFAULT 'biab_single_vessel' NOT NULL,
  "batch_target_type" "equipment_batch_target_type" DEFAULT 'fermenter' NOT NULL,
  "target_batch_volume_l" double precision NOT NULL,
  "boil_time_min" integer DEFAULT 60 NOT NULL,
  "brewhouse_efficiency_pct" double precision DEFAULT 75 NOT NULL,
  "mash_efficiency_pct" double precision,
  "evaporation_rate_l_per_hr" double precision DEFAULT 3 NOT NULL,
  "trub_chiller_loss_l" double precision DEFAULT 0 NOT NULL,
  "fermenter_loss_l" double precision DEFAULT 0 NOT NULL,
  "mash_tun_deadspace_l" double precision DEFAULT 0 NOT NULL,
  "sparge_vessel_deadspace_l" double precision DEFAULT 0 NOT NULL,
  "grain_absorption_l_per_kg" double precision DEFAULT 0.75 NOT NULL,
  "cooling_shrinkage_pct" double precision DEFAULT 4 NOT NULL,
  "top_up_water_l" double precision DEFAULT 0 NOT NULL,
  "mash_thickness_l_per_kg" double precision DEFAULT 3 NOT NULL,
  "max_mash_volume_l" double precision,
  "max_kettle_volume_l" double precision,
  "hop_utilization_factor" double precision DEFAULT 1 NOT NULL,
  "altitude_m" double precision DEFAULT 0 NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "equipment_profiles"
 ADD CONSTRAINT "equipment_profiles_user_id_users_id_fk"
 FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "equipment_profiles_user_id_idx" ON "equipment_profiles" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "equipment_profiles_user_name_uidx" ON "equipment_profiles" ("user_id", "name");

CREATE TABLE IF NOT EXISTS "user_brewing_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "preferred_bitterness_formula" varchar(64) DEFAULT 'tinseth_whirlpool_v2' NOT NULL,
  "bitterness_settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "preferred_water_engine" varchar(64) DEFAULT 'balanced_default' NOT NULL,
  "preferred_mash_ph_model" varchar(64) DEFAULT 'hybrid_mash_ph_v1' NOT NULL,
  "water_settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "user_brewing_settings"
 ADD CONSTRAINT "user_brewing_settings_user_id_users_id_fk"
 FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "user_brewing_settings_user_id_uidx" ON "user_brewing_settings" ("user_id");

ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "calculation_meta" jsonb;
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "draft_state" jsonb;
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "import_meta" jsonb;
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "equipment_profile_id" uuid;
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "equipment_profile_snapshot" jsonb;
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "water_plan_meta" jsonb;
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "brew_plan_meta" jsonb;

DO $$ BEGIN
 ALTER TABLE "recipes"
 ADD CONSTRAINT "recipes_equipment_profile_id_equipment_profiles_id_fk"
 FOREIGN KEY ("equipment_profile_id") REFERENCES "public"."equipment_profiles"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "recipes_equipment_profile_id_idx" ON "recipes" ("equipment_profile_id");

ALTER TABLE "recipe_ingredients" ADD COLUMN IF NOT EXISTS "persistent_key" uuid;
UPDATE "recipe_ingredients" SET "persistent_key" = gen_random_uuid() WHERE "persistent_key" IS NULL;
ALTER TABLE "recipe_ingredients" ALTER COLUMN "persistent_key" SET DEFAULT gen_random_uuid();
ALTER TABLE "recipe_ingredients" ALTER COLUMN "persistent_key" SET NOT NULL;

ALTER TABLE "recipe_ingredients" ADD COLUMN IF NOT EXISTS "display_order" integer;
WITH ordered AS (
  SELECT "id", row_number() OVER (PARTITION BY "recipe_id" ORDER BY "created_at", "id") - 1 AS next_display_order
  FROM "recipe_ingredients"
  WHERE "display_order" IS NULL
)
UPDATE "recipe_ingredients" AS ri
SET "display_order" = ordered.next_display_order
FROM ordered
WHERE ri."id" = ordered."id";
ALTER TABLE "recipe_ingredients" ALTER COLUMN "display_order" SET DEFAULT 0;
ALTER TABLE "recipe_ingredients" ALTER COLUMN "display_order" SET NOT NULL;

ALTER TABLE "recipe_ingredients" ADD COLUMN IF NOT EXISTS "inventory_intent_mode" varchar(32);
ALTER TABLE "recipe_ingredients" ADD COLUMN IF NOT EXISTS "inventory_selection_meta" jsonb;
ALTER TABLE "recipe_ingredients" ADD COLUMN IF NOT EXISTS "external_import_meta" jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS "recipe_ingredients_recipe_persistent_key_uidx" ON "recipe_ingredients" ("recipe_id", "persistent_key");
CREATE INDEX IF NOT EXISTS "recipe_ingredients_recipe_display_order_idx" ON "recipe_ingredients" ("recipe_id", "display_order");

DO $$ BEGIN
 ALTER TABLE "user_ingredients"
 ADD CONSTRAINT "user_ingredients_source_linkage_chk"
 CHECK (((ingredient_catalog_item_id is not null and user_custom_ingredient_id is null) or (ingredient_catalog_item_id is null and user_custom_ingredient_id is not null))) NOT VALID;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
