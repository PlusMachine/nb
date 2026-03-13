DO $$
BEGIN
  CREATE TYPE "system_currency" AS ENUM ('RUB', 'USD', 'EUR');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "system_currency_rates" (
  "currency" "system_currency" PRIMARY KEY,
  "rub_minor_per_unit" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

INSERT INTO "system_currency_rates" ("currency", "rub_minor_per_unit")
VALUES
  ('RUB', 100),
  ('USD', 7900),
  ('EUR', 9170)
ON CONFLICT ("currency") DO NOTHING;

ALTER TABLE "user_ingredients"
  ADD COLUMN IF NOT EXISTS "ingredient_family_id" uuid REFERENCES "ingredient_families"("id") ON DELETE set null,
  ADD COLUMN IF NOT EXISTS "ingredient_category" "ingredient_category",
  ADD COLUMN IF NOT EXISTS "ingredient_subtype" varchar(80),
  ADD COLUMN IF NOT EXISTS "ingredient_display_name_snapshot" varchar(180),
  ADD COLUMN IF NOT EXISTS "ingredient_default_display_unit_snapshot" varchar(32),
  ADD COLUMN IF NOT EXISTS "ingredient_measurement_dimension" "inventory_unit_dimension",
  ADD COLUMN IF NOT EXISTS "purchase_price_minor" integer,
  ADD COLUMN IF NOT EXISTS "purchase_currency" "system_currency",
  ADD COLUMN IF NOT EXISTS "purchase_quantity" double precision,
  ADD COLUMN IF NOT EXISTS "purchase_quantity_unit" varchar(32),
  ADD COLUMN IF NOT EXISTS "purchase_quantity_normalized" double precision,
  ADD COLUMN IF NOT EXISTS "purchase_quantity_normalized_unit" varchar(32),
  ADD COLUMN IF NOT EXISTS "normalized_unit_cost_minor_rub" integer;

ALTER TABLE "recipe_ingredients"
  ADD COLUMN IF NOT EXISTS "ingredient_family_id" uuid REFERENCES "ingredient_families"("id") ON DELETE set null,
  ADD COLUMN IF NOT EXISTS "ingredient_category" "ingredient_category",
  ADD COLUMN IF NOT EXISTS "ingredient_subtype" varchar(80),
  ADD COLUMN IF NOT EXISTS "ingredient_display_name_snapshot" varchar(180),
  ADD COLUMN IF NOT EXISTS "ingredient_default_display_unit_snapshot" varchar(32),
  ADD COLUMN IF NOT EXISTS "ingredient_measurement_dimension" "inventory_unit_dimension";

CREATE INDEX IF NOT EXISTS "user_ingredients_family_idx" ON "user_ingredients" ("ingredient_family_id");
CREATE INDEX IF NOT EXISTS "user_ingredients_category_idx" ON "user_ingredients" ("ingredient_category");
CREATE INDEX IF NOT EXISTS "recipe_ingredients_family_idx" ON "recipe_ingredients" ("ingredient_family_id");
CREATE INDEX IF NOT EXISTS "recipe_ingredients_category_idx" ON "recipe_ingredients" ("ingredient_category");

UPDATE "user_ingredients" AS ui
SET
  "ingredient_family_id" = ci."family_id",
  "ingredient_category" = ci."category",
  "ingredient_subtype" = ci."subtype",
  "ingredient_display_name_snapshot" = COALESCE(ui."ingredient_display_name_snapshot", ci."display_name"),
  "ingredient_default_display_unit_snapshot" = COALESCE(ui."ingredient_default_display_unit_snapshot", ci."default_display_unit"),
  "ingredient_measurement_dimension" = COALESCE(ui."ingredient_measurement_dimension", ci."measurement_dimension")
FROM "ingredient_catalog_items" AS ci
WHERE ui."ingredient_catalog_item_id" = ci."id";

UPDATE "user_ingredients" AS ui
SET
  "ingredient_family_id" = NULL,
  "ingredient_category" = COALESCE(
    ui."ingredient_category",
    CASE
      WHEN NULLIF(uci."properties"->>'taxonomyCategory', '') IN ('fermentable', 'hop', 'yeast', 'water_prep', 'misc')
        THEN (uci."properties"->>'taxonomyCategory')::"ingredient_category"
      WHEN uci."type" IN ('fermentable', 'sugar') THEN 'fermentable'::"ingredient_category"
      WHEN uci."type" = 'hop' THEN 'hop'::"ingredient_category"
      WHEN uci."type" = 'yeast' THEN 'yeast'::"ingredient_category"
      ELSE 'misc'::"ingredient_category"
    END
  ),
  "ingredient_subtype" = COALESCE(
    ui."ingredient_subtype",
    NULLIF(uci."properties"->>'taxonomySubtype', '')
  ),
  "ingredient_display_name_snapshot" = COALESCE(ui."ingredient_display_name_snapshot", uci."display_name"),
  "ingredient_default_display_unit_snapshot" = COALESCE(
    ui."ingredient_default_display_unit_snapshot",
    NULLIF(uci."properties"->>'defaultDisplayUnit', '')
  ),
  "ingredient_measurement_dimension" = COALESCE(
    ui."ingredient_measurement_dimension",
    CASE
      WHEN NULLIF(uci."properties"->>'measurementDimension', '') IN ('weight', 'volume', 'count')
        THEN (uci."properties"->>'measurementDimension')::"inventory_unit_dimension"
      WHEN NULLIF(uci."properties"->>'defaultDisplayUnit', '') IN ('g', 'kg', 'oz', 'lb')
        THEN 'weight'::"inventory_unit_dimension"
      WHEN NULLIF(uci."properties"->>'defaultDisplayUnit', '') IN ('ml', 'l', 'gal')
        THEN 'volume'::"inventory_unit_dimension"
      WHEN NULLIF(uci."properties"->>'defaultDisplayUnit', '') IN ('item', 'pack')
        THEN 'count'::"inventory_unit_dimension"
      ELSE NULL
    END
  )
FROM "user_custom_ingredients" AS uci
WHERE ui."user_custom_ingredient_id" = uci."id";

UPDATE "recipe_ingredients" AS ri
SET
  "ingredient_family_id" = ci."family_id",
  "ingredient_category" = COALESCE(ri."ingredient_category", ci."category"),
  "ingredient_subtype" = COALESCE(ri."ingredient_subtype", ci."subtype"),
  "ingredient_display_name_snapshot" = COALESCE(ri."ingredient_display_name_snapshot", ci."display_name"),
  "ingredient_default_display_unit_snapshot" = COALESCE(ri."ingredient_default_display_unit_snapshot", ci."default_display_unit"),
  "ingredient_measurement_dimension" = COALESCE(ri."ingredient_measurement_dimension", ci."measurement_dimension")
FROM "ingredient_catalog_items" AS ci
WHERE ri."ingredient_catalog_item_id" = ci."id";

UPDATE "recipe_ingredients" AS ri
SET
  "ingredient_family_id" = NULL,
  "ingredient_category" = COALESCE(
    ri."ingredient_category",
    CASE
      WHEN NULLIF(uci."properties"->>'taxonomyCategory', '') IN ('fermentable', 'hop', 'yeast', 'water_prep', 'misc')
        THEN (uci."properties"->>'taxonomyCategory')::"ingredient_category"
      WHEN uci."type" IN ('fermentable', 'sugar') THEN 'fermentable'::"ingredient_category"
      WHEN uci."type" = 'hop' THEN 'hop'::"ingredient_category"
      WHEN uci."type" = 'yeast' THEN 'yeast'::"ingredient_category"
      ELSE 'misc'::"ingredient_category"
    END
  ),
  "ingredient_subtype" = COALESCE(
    ri."ingredient_subtype",
    NULLIF(uci."properties"->>'taxonomySubtype', '')
  ),
  "ingredient_display_name_snapshot" = COALESCE(ri."ingredient_display_name_snapshot", uci."display_name"),
  "ingredient_default_display_unit_snapshot" = COALESCE(
    ri."ingredient_default_display_unit_snapshot",
    NULLIF(uci."properties"->>'defaultDisplayUnit', '')
  ),
  "ingredient_measurement_dimension" = COALESCE(
    ri."ingredient_measurement_dimension",
    CASE
      WHEN NULLIF(uci."properties"->>'measurementDimension', '') IN ('weight', 'volume', 'count')
        THEN (uci."properties"->>'measurementDimension')::"inventory_unit_dimension"
      WHEN NULLIF(uci."properties"->>'defaultDisplayUnit', '') IN ('g', 'kg', 'oz', 'lb')
        THEN 'weight'::"inventory_unit_dimension"
      WHEN NULLIF(uci."properties"->>'defaultDisplayUnit', '') IN ('ml', 'l', 'gal')
        THEN 'volume'::"inventory_unit_dimension"
      WHEN NULLIF(uci."properties"->>'defaultDisplayUnit', '') IN ('item', 'pack')
        THEN 'count'::"inventory_unit_dimension"
      ELSE NULL
    END
  )
FROM "user_custom_ingredients" AS uci
WHERE ri."user_custom_ingredient_id" = uci."id";

UPDATE "recipe_ingredients" AS ri
SET
  "ingredient_family_id" = COALESCE(
    ri."ingredient_family_id",
    CASE
      WHEN NULLIF(ri."step_meta"#>>'{ingredientLinkage,familyId}', '') ~ '^[0-9a-fA-F-]{36}$'
        THEN (ri."step_meta"#>>'{ingredientLinkage,familyId}')::uuid
      ELSE NULL
    END
  ),
  "ingredient_category" = COALESCE(
    ri."ingredient_category",
    CASE
      WHEN NULLIF(ri."step_meta"#>>'{ingredientLinkage,category}', '') IN ('fermentable', 'hop', 'yeast', 'water_prep', 'misc')
        THEN (ri."step_meta"#>>'{ingredientLinkage,category}')::"ingredient_category"
      WHEN ri."type" IN ('fermentable', 'sugar') THEN 'fermentable'::"ingredient_category"
      WHEN ri."type" = 'hop' THEN 'hop'::"ingredient_category"
      WHEN ri."type" = 'yeast' THEN 'yeast'::"ingredient_category"
      ELSE 'misc'::"ingredient_category"
    END
  ),
  "ingredient_subtype" = COALESCE(
    ri."ingredient_subtype",
    NULLIF(ri."step_meta"#>>'{ingredientLinkage,subtype}', '')
  ),
  "ingredient_display_name_snapshot" = COALESCE(
    ri."ingredient_display_name_snapshot",
    NULLIF(ri."step_meta"#>>'{ingredientLinkage,displayName}', '')
  ),
  "ingredient_default_display_unit_snapshot" = COALESCE(
    ri."ingredient_default_display_unit_snapshot",
    NULLIF(ri."step_meta"#>>'{ingredientLinkage,defaultDisplayUnit}', '')
  ),
  "ingredient_measurement_dimension" = COALESCE(
    ri."ingredient_measurement_dimension",
    CASE
      WHEN NULLIF(ri."step_meta"#>>'{ingredientLinkage,measurementDimension}', '') IN ('weight', 'volume', 'count')
        THEN (ri."step_meta"#>>'{ingredientLinkage,measurementDimension}')::"inventory_unit_dimension"
      ELSE NULL
    END
  )
WHERE ri."ingredient_category" IS NULL
   OR ri."ingredient_display_name_snapshot" IS NULL
   OR ri."ingredient_default_display_unit_snapshot" IS NULL
   OR ri."ingredient_measurement_dimension" IS NULL
   OR ri."ingredient_family_id" IS NULL;

UPDATE "recipe_ingredients"
SET "step_meta" = CASE
  WHEN "step_meta" IS NULL OR NOT ("step_meta" ? 'ingredientLinkage') THEN "step_meta"
  WHEN ("step_meta" - 'ingredientLinkage') = '{}'::jsonb THEN NULL
  ELSE ("step_meta" - 'ingredientLinkage')
END;

ALTER TABLE "user_ingredients"
  ALTER COLUMN "ingredient_category" SET NOT NULL;

ALTER TABLE "recipe_ingredients"
  ALTER COLUMN "ingredient_category" SET NOT NULL;
