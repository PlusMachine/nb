DO $$ BEGIN
 CREATE TYPE "ingredient_category" AS ENUM('fermentable', 'hop', 'yeast', 'water_prep', 'misc');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "ingredient_match_policy" AS ENUM('exact_only', 'family_compatible');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "ingredient_completeness_level" AS ENUM('minimum', 'recommended', 'full');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "ingredient_families" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "category" "ingredient_category" NOT NULL,
  "subtype" varchar(80),
  "canonical_name" varchar(180) NOT NULL,
  "normalized_canonical_name" varchar(220) NOT NULL,
  "display_name_ru" varchar(180),
  "display_name_en" varchar(180),
  "match_policy" "ingredient_match_policy" NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "ingredient_families_category_name_uidx" ON "ingredient_families" ("category", "normalized_canonical_name");
CREATE INDEX IF NOT EXISTS "ingredient_families_category_idx" ON "ingredient_families" ("category");
CREATE INDEX IF NOT EXISTS "ingredient_families_subtype_idx" ON "ingredient_families" ("subtype");

ALTER TABLE "ingredient_catalog_items"
  ADD COLUMN IF NOT EXISTS "category" "ingredient_category",
  ADD COLUMN IF NOT EXISTS "family_id" uuid,
  ADD COLUMN IF NOT EXISTS "brand_name" varchar(140),
  ADD COLUMN IF NOT EXISTS "harvest_year" integer,
  ADD COLUMN IF NOT EXISTS "default_display_unit" varchar(32),
  ADD COLUMN IF NOT EXISTS "allowed_units" jsonb DEFAULT '[]'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS "measurement_dimension" "inventory_unit_dimension",
  ADD COLUMN IF NOT EXISTS "completeness_level" "ingredient_completeness_level" DEFAULT 'minimum' NOT NULL;

WITH derived AS (
  SELECT
    item."id",
    item."type",
    item."display_name",
    item."normalized_name",
    item."subtype",
    item."manufacturer",
    item."country",
    item."description",
    item."default_unit",
    item."default_display_unit",
    item."allowed_units",
    item."measurement_dimension",
    item."completeness_level",
    item."hop_form",
    item."hop_season",
    item."yeast_type",
    item."yeast_form",
    item."fermentable_color_ebc",
    item."fermentable_extract_yield_pct",
    item."hop_alpha_acid_pct",
    item."yeast_attenuation_pct",
    item."properties",
    lower(item."display_name") AS "display_name_lc",
    lower(coalesce(item."properties"->>'stage', '')) AS "stage_lc",
    replace(coalesce(item."subtype", ''), '-', '_') AS "subtype_token",
    CASE
      WHEN item."type" = 'fermentable' THEN 'fermentable'::"ingredient_category"
      WHEN item."type" = 'hop' THEN 'hop'::"ingredient_category"
      WHEN item."type" = 'yeast' THEN 'yeast'::"ingredient_category"
      WHEN item."type" = 'sugar' THEN 'fermentable'::"ingredient_category"
      WHEN item."type" = 'fining' THEN 'misc'::"ingredient_category"
      WHEN item."type" = 'adjunct' THEN CASE
        WHEN lower(item."display_name") LIKE '%rice hull%' OR lower(item."display_name") LIKE '%star san%' OR lower(item."display_name") LIKE '%sanitizer%' THEN 'misc'::"ingredient_category"
        WHEN lower(item."display_name") LIKE '%cocoa%' OR lower(item."display_name") LIKE '%cacao%' OR lower(item."display_name") LIKE '%peanut%' OR lower(item."display_name") LIKE '%coconut%' THEN 'misc'::"ingredient_category"
        ELSE 'fermentable'::"ingredient_category"
      END
      ELSE CASE
        WHEN lower(coalesce(item."properties"->>'stage', '')) LIKE '%water-treatment%' THEN 'water_prep'::"ingredient_category"
        WHEN lower(item."display_name") LIKE '%gypsum%' OR lower(item."display_name") LIKE '%calcium chloride%' OR lower(item."display_name") LIKE '%epsom%' OR lower(item."display_name") LIKE '%acid%' OR lower(item."display_name") LIKE '%campden%' OR lower(item."display_name") LIKE '%metabisulfite%' THEN 'water_prep'::"ingredient_category"
        ELSE 'misc'::"ingredient_category"
      END
    END AS "derived_category"
  FROM "ingredient_catalog_items" item
)
UPDATE "ingredient_catalog_items" AS item
SET
  "category" = derived."derived_category",
  "subtype" = CASE
    WHEN derived."derived_category" = 'fermentable'::"ingredient_category" THEN CASE
      WHEN derived."subtype_token" IN ('base_malt', 'specialty_malt', 'roasted_malt', 'adjunct_grain', 'extract_dry', 'extract_liquid', 'sugar', 'syrup_honey', 'fruit_fermentable') THEN derived."subtype_token"
      WHEN derived."subtype_token" IN ('speciality_malt', 'crystal_malt') THEN 'specialty_malt'
      WHEN derived."subtype_token" IN ('roasted_grain', 'roast_malt') THEN 'roasted_malt'
      WHEN derived."subtype_token" IN ('adjunct', 'adjuncts') THEN 'adjunct_grain'
      WHEN derived."subtype_token" IN ('dry_extract', 'dry_malt_extract') THEN 'extract_dry'
      WHEN derived."subtype_token" IN ('liquid_extract', 'liquid_malt_extract') THEN 'extract_liquid'
      WHEN derived."subtype_token" IN ('syrup', 'honey') THEN 'syrup_honey'
      WHEN derived."type" = 'sugar' OR derived."display_name_lc" LIKE '%dextrose%' OR derived."display_name_lc" LIKE '%sucrose%' OR derived."display_name_lc" LIKE '%lactose%' OR derived."display_name_lc" LIKE '%maltodextrin%' OR derived."display_name_lc" LIKE '%sugar%' THEN CASE
        WHEN derived."display_name_lc" LIKE '%honey%' OR derived."display_name_lc" LIKE '%syrup%' OR derived."display_name_lc" LIKE '%molasses%' OR derived."display_name_lc" LIKE '%maple%' THEN 'syrup_honey'
        ELSE 'sugar'
      END
      WHEN derived."display_name_lc" LIKE '%dme%' OR derived."display_name_lc" LIKE '%dry malt extract%' THEN 'extract_dry'
      WHEN derived."display_name_lc" LIKE '%lme%' OR derived."display_name_lc" LIKE '%liquid malt extract%' THEN 'extract_liquid'
      WHEN derived."display_name_lc" LIKE '%fruit%' OR derived."display_name_lc" LIKE '%berry%' OR derived."display_name_lc" LIKE '%cherry%' OR derived."display_name_lc" LIKE '%grape%' OR derived."display_name_lc" LIKE '%apricot%' OR derived."display_name_lc" LIKE '%puree%' THEN 'fruit_fermentable'
      WHEN derived."type" = 'adjunct' OR derived."display_name_lc" LIKE '%flaked%' OR derived."display_name_lc" LIKE '%torrified%' OR derived."display_name_lc" LIKE '%oats%' OR derived."display_name_lc" LIKE '%barley%' OR derived."display_name_lc" LIKE '%wheat%' OR derived."display_name_lc" LIKE '%rye%' OR derived."display_name_lc" LIKE '%maize%' OR derived."display_name_lc" LIKE '%corn%' THEN 'adjunct_grain'
      WHEN derived."display_name_lc" LIKE '%roasted%' OR derived."display_name_lc" LIKE '%chocolate%' OR derived."display_name_lc" LIKE '%black malt%' OR derived."display_name_lc" LIKE '%black patent%' OR derived."display_name_lc" LIKE '%roast barley%' THEN 'roasted_malt'
      WHEN derived."display_name_lc" LIKE '%cara%' OR derived."display_name_lc" LIKE '%crystal%' OR derived."display_name_lc" LIKE '%munich%' OR derived."display_name_lc" LIKE '%caramel%' OR derived."display_name_lc" LIKE '%melanoidin%' OR derived."display_name_lc" LIKE '%biscuit%' OR derived."display_name_lc" LIKE '%amber malt%' THEN 'specialty_malt'
      WHEN derived."display_name_lc" LIKE '%malt%' OR derived."display_name_lc" LIKE '%pilsner%' OR derived."display_name_lc" LIKE '%pale malt%' OR derived."display_name_lc" LIKE '%vienna%' OR derived."display_name_lc" LIKE '%maris otter%' OR derived."display_name_lc" LIKE '%2 row%' OR derived."display_name_lc" LIKE '%2-row%' THEN 'base_malt'
      ELSE NULL
    END
    WHEN derived."derived_category" = 'hop'::"ingredient_category" THEN CASE
      WHEN derived."subtype_token" IN ('pellet', 'whole_cone', 'cryo', 'lupulin', 'extract') THEN derived."subtype_token"
      WHEN derived."subtype_token" IN ('whole', 'wholecone', 'leaf', 'cone') THEN 'whole_cone'
      WHEN derived."hop_form" IS NOT NULL THEN derived."hop_form"::text
      ELSE NULL
    END
    WHEN derived."derived_category" = 'yeast'::"ingredient_category" THEN CASE
      WHEN derived."subtype_token" IN ('ale', 'lager', 'wheat', 'belgian', 'kveik', 'wild_bacteria', 'other') THEN derived."subtype_token"
      WHEN derived."display_name_lc" LIKE '%kveik%' THEN 'kveik'
      WHEN derived."display_name_lc" LIKE '%brett%' OR derived."display_name_lc" LIKE '%lacto%' OR derived."display_name_lc" LIKE '%pedio%' OR derived."display_name_lc" LIKE '%wild%' THEN 'wild_bacteria'
      WHEN derived."display_name_lc" LIKE '%belg%' OR derived."display_name_lc" LIKE '%saison%' OR derived."display_name_lc" LIKE '%abbey%' THEN 'belgian'
      WHEN derived."display_name_lc" LIKE '%wit%' OR derived."display_name_lc" LIKE '%weizen%' OR derived."display_name_lc" LIKE '%wheat%' THEN 'wheat'
      WHEN derived."yeast_type" = 'ale'::"yeast_type" OR derived."display_name_lc" LIKE '%ale%' THEN 'ale'
      WHEN derived."yeast_type" = 'lager'::"yeast_type" OR derived."display_name_lc" LIKE '%lager%' THEN 'lager'
      ELSE 'other'
    END
    WHEN derived."derived_category" = 'water_prep'::"ingredient_category" THEN CASE
      WHEN derived."subtype_token" IN ('salt', 'acid', 'base', 'nutrient_other') THEN derived."subtype_token"
      WHEN derived."display_name_lc" LIKE '%lactic%' OR derived."display_name_lc" LIKE '%phosphoric%' OR derived."display_name_lc" LIKE '%acid%' THEN 'acid'
      WHEN derived."display_name_lc" LIKE '%bicarbonate%' OR derived."display_name_lc" LIKE '%chalk%' OR derived."display_name_lc" LIKE '%carbonate%' OR derived."display_name_lc" LIKE '%lime%' THEN 'base'
      WHEN derived."display_name_lc" LIKE '%nutrient%' OR derived."display_name_lc" LIKE '%servomyces%' THEN 'nutrient_other'
      ELSE 'salt'
    END
    ELSE CASE
      WHEN derived."subtype_token" IN ('fining', 'antioxidant', 'nutrient', 'spice_herb', 'wood', 'flavoring', 'enzyme', 'process_aid', 'other') THEN derived."subtype_token"
      WHEN derived."type" = 'fining' THEN 'fining'
      WHEN derived."display_name_lc" LIKE '%metabisulfite%' OR derived."display_name_lc" LIKE '%campden%' OR derived."display_name_lc" LIKE '%antioxidant%' OR derived."display_name_lc" LIKE '%sulfite%' THEN 'antioxidant'
      WHEN derived."display_name_lc" LIKE '%nutrient%' OR derived."display_name_lc" LIKE '%servomyces%' THEN 'nutrient'
      WHEN derived."display_name_lc" LIKE '%spice%' OR derived."display_name_lc" LIKE '%pepper%' OR derived."display_name_lc" LIKE '%coriander%' OR derived."display_name_lc" LIKE '%orange peel%' OR derived."display_name_lc" LIKE '%cinnamon%' OR derived."display_name_lc" LIKE '%herb%' THEN 'spice_herb'
      WHEN derived."display_name_lc" LIKE '%oak%' OR derived."display_name_lc" LIKE '%wood%' OR derived."display_name_lc" LIKE '%chips%' OR derived."display_name_lc" LIKE '%spiral%' THEN 'wood'
      WHEN derived."display_name_lc" LIKE '%cocoa%' OR derived."display_name_lc" LIKE '%cacao%' OR derived."display_name_lc" LIKE '%peanut%' OR derived."display_name_lc" LIKE '%coconut%' OR derived."display_name_lc" LIKE '%vanilla%' OR derived."display_name_lc" LIKE '%coffee%' OR derived."display_name_lc" LIKE '%nib%' THEN 'flavoring'
      WHEN derived."display_name_lc" LIKE '%enzyme%' THEN 'enzyme'
      WHEN derived."display_name_lc" LIKE '%rice hull%' OR derived."display_name_lc" LIKE '%star san%' OR derived."display_name_lc" LIKE '%sanitizer%' OR derived."stage_lc" = 'sanitation' THEN 'process_aid'
      ELSE 'other'
    END
  END,
  "brand_name" = coalesce(item."brand_name", item."manufacturer"),
  "harvest_year" = coalesce(item."harvest_year", CASE WHEN item."hop_season" ~ '^[0-9]{4}$' THEN item."hop_season"::integer ELSE NULL END),
  "default_display_unit" = coalesce(item."default_display_unit", item."default_unit"),
  "measurement_dimension" = coalesce(
    item."measurement_dimension",
    CASE
      WHEN coalesce(item."default_display_unit", item."default_unit") IN ('g', 'kg', 'oz', 'lb') THEN 'weight'::"inventory_unit_dimension"
      WHEN coalesce(item."default_display_unit", item."default_unit") IN ('ml', 'l', 'gal') THEN 'volume'::"inventory_unit_dimension"
      ELSE 'count'::"inventory_unit_dimension"
    END
  ),
  "allowed_units" = CASE
    WHEN jsonb_typeof(item."allowed_units") = 'array' AND jsonb_array_length(item."allowed_units") > 0 THEN item."allowed_units"
    WHEN derived."derived_category" = 'fermentable'::"ingredient_category" THEN '["g","kg","oz","lb"]'::jsonb
    WHEN derived."derived_category" = 'hop'::"ingredient_category" THEN '["g","kg","oz","lb"]'::jsonb
    WHEN derived."derived_category" = 'yeast'::"ingredient_category" THEN CASE
      WHEN item."yeast_form" = 'liquid'::"yeast_form" THEN '["pack","ml"]'::jsonb
      ELSE '["pack","g"]'::jsonb
    END
    WHEN derived."derived_category" = 'water_prep'::"ingredient_category" THEN CASE
      WHEN derived."display_name_lc" LIKE '%lactic%' OR derived."display_name_lc" LIKE '%phosphoric%' OR derived."display_name_lc" LIKE '%acid%' THEN '["ml","l","gal"]'::jsonb
      ELSE '["g","kg","oz","lb"]'::jsonb
    END
    ELSE CASE
      WHEN coalesce(item."default_display_unit", item."default_unit") IN ('g', 'kg', 'oz', 'lb') THEN '["g","kg","oz","lb"]'::jsonb
      WHEN coalesce(item."default_display_unit", item."default_unit") IN ('ml', 'l', 'gal') THEN '["ml","l","gal"]'::jsonb
      ELSE '["item","pack"]'::jsonb
    END
  END,
  "completeness_level" = CASE
    WHEN derived."derived_category" = 'fermentable'::"ingredient_category" AND item."fermentable_color_ebc" IS NOT NULL AND item."fermentable_extract_yield_pct" IS NOT NULL THEN CASE
      WHEN (item."brand_name" IS NOT NULL OR item."manufacturer" IS NOT NULL) AND item."country" IS NOT NULL AND (item."description" IS NOT NULL OR jsonb_array_length(item."aliases") > 0) THEN 'full'::"ingredient_completeness_level"
      ELSE 'recommended'::"ingredient_completeness_level"
    END
    WHEN derived."derived_category" = 'hop'::"ingredient_category" AND item."hop_alpha_acid_pct" IS NOT NULL THEN CASE
      WHEN (item."brand_name" IS NOT NULL OR item."manufacturer" IS NOT NULL) AND item."country" IS NOT NULL AND item."hop_season" IS NOT NULL THEN 'full'::"ingredient_completeness_level"
      ELSE 'recommended'::"ingredient_completeness_level"
    END
    WHEN derived."derived_category" = 'yeast'::"ingredient_category" AND item."yeast_attenuation_pct" IS NOT NULL AND item."yeast_form" IS NOT NULL THEN CASE
      WHEN (item."brand_name" IS NOT NULL OR item."manufacturer" IS NOT NULL) AND item."country" IS NOT NULL AND (item."description" IS NOT NULL OR jsonb_array_length(item."aliases") > 0) THEN 'full'::"ingredient_completeness_level"
      ELSE 'recommended'::"ingredient_completeness_level"
    END
    WHEN derived."derived_category" = 'water_prep'::"ingredient_category" THEN CASE
      WHEN (derived."display_name_lc" LIKE '%acid%' AND item."properties" ? 'acidType')
        OR ((derived."display_name_lc" LIKE '%gypsum%' OR derived."display_name_lc" LIKE '%chloride%' OR derived."display_name_lc" LIKE '%salt%' OR derived."display_name_lc" LIKE '%epsom%' OR derived."display_name_lc" LIKE '%bicarbonate%' OR derived."display_name_lc" LIKE '%chalk%' OR derived."display_name_lc" LIKE '%carbonate%') AND item."properties" ? 'compound')
      THEN 'recommended'::"ingredient_completeness_level"
      ELSE 'minimum'::"ingredient_completeness_level"
    END
    WHEN item."description" IS NOT NULL OR jsonb_array_length(item."aliases") > 0 THEN 'recommended'::"ingredient_completeness_level"
    ELSE 'minimum'::"ingredient_completeness_level"
  END
FROM derived
WHERE item."id" = derived."id";

INSERT INTO "ingredient_families" (
  "category",
  "subtype",
  "canonical_name",
  "normalized_canonical_name",
  "display_name_ru",
  "display_name_en",
  "match_policy",
  "is_active",
  "created_at",
  "updated_at"
)
SELECT DISTINCT ON (item."category", item."normalized_name")
  item."category",
  item."subtype",
  item."display_name",
  item."normalized_name",
  NULL,
  item."display_name",
  CASE
    WHEN item."category" IN ('yeast'::"ingredient_category", 'misc'::"ingredient_category") THEN 'exact_only'::"ingredient_match_policy"
    ELSE 'family_compatible'::"ingredient_match_policy"
  END,
  true,
  now(),
  now()
FROM "ingredient_catalog_items" item
WHERE item."category" IS NOT NULL
ORDER BY item."category", item."normalized_name", item."updated_at" DESC, item."created_at" DESC
ON CONFLICT ("category", "normalized_canonical_name") DO UPDATE
SET
  "subtype" = coalesce("ingredient_families"."subtype", EXCLUDED."subtype"),
  "display_name_en" = coalesce("ingredient_families"."display_name_en", EXCLUDED."display_name_en"),
  "updated_at" = now();

UPDATE "ingredient_catalog_items" item
SET "family_id" = family."id"
FROM "ingredient_families" family
WHERE item."family_id" IS NULL
  AND item."category" = family."category"
  AND item."normalized_name" = family."normalized_canonical_name";

ALTER TABLE "ingredient_catalog_items" DROP CONSTRAINT IF EXISTS "ingredient_catalog_items_family_id_fkey";
ALTER TABLE "ingredient_catalog_items"
  ADD CONSTRAINT "ingredient_catalog_items_family_id_fkey"
  FOREIGN KEY ("family_id") REFERENCES "ingredient_families"("id") ON DELETE restrict;

ALTER TABLE "ingredient_catalog_items"
  ALTER COLUMN "category" SET NOT NULL,
  ALTER COLUMN "family_id" SET NOT NULL,
  ALTER COLUMN "default_display_unit" SET NOT NULL,
  ALTER COLUMN "allowed_units" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "allowed_units" SET NOT NULL,
  ALTER COLUMN "measurement_dimension" SET NOT NULL,
  ALTER COLUMN "completeness_level" SET DEFAULT 'minimum',
  ALTER COLUMN "completeness_level" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "ingredient_catalog_items_family_id_idx" ON "ingredient_catalog_items" ("family_id");
CREATE INDEX IF NOT EXISTS "ingredient_catalog_items_category_idx" ON "ingredient_catalog_items" ("category");
CREATE INDEX IF NOT EXISTS "ingredient_catalog_items_subtype_idx" ON "ingredient_catalog_items" ("subtype");
