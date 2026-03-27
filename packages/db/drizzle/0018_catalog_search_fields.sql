ALTER TABLE "ingredient_catalog_items"
  ADD COLUMN IF NOT EXISTS "display_name_ru" varchar(180),
  ADD COLUMN IF NOT EXISTS "display_name_en" varchar(180),
  ADD COLUMN IF NOT EXISTS "search_aliases_norm" jsonb DEFAULT '[]'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS "search_text_norm" text DEFAULT '' NOT NULL,
  ADD COLUMN IF NOT EXISTS "catalog_source_dataset" varchar(160),
  ADD COLUMN IF NOT EXISTS "catalog_source_key" varchar(191);

UPDATE "ingredient_catalog_items"
SET
  "display_name_ru" = COALESCE(
    NULLIF("display_name_ru", ''),
    NULLIF("properties"->>'displayNameRu', ''),
    "display_name"
  ),
  "display_name_en" = COALESCE(
    NULLIF("display_name_en", ''),
    NULLIF("properties"->>'displayNameEn', ''),
    NULLIF("properties"->>'nameEn', ''),
    "display_name"
  ),
  "search_aliases_norm" = CASE
    WHEN jsonb_typeof("aliases") = 'array' THEN "aliases"
    ELSE '[]'::jsonb
  END,
  "search_text_norm" = trim(regexp_replace(concat_ws(
    ' ',
    COALESCE("normalized_name", ''),
    lower(COALESCE("display_name_ru", "display_name")),
    lower(COALESCE("display_name_en", "display_name")),
    lower(COALESCE("brand_name", '')),
    lower(COALESCE("manufacturer", '')),
    lower(COALESCE("country", ''))
  ), '\s+', ' ', 'g')),
  "catalog_source_dataset" = COALESCE(
    NULLIF("catalog_source_dataset", ''),
    CASE COALESCE(NULLIF("properties"->>'seedDataset', ''), '')
      WHEN 'malt_products_superset_ru_bilingual_v5' THEN 'malt_products_superset_ru_bilingual'
      WHEN 'hop_varieties_for_site_ru_bilingual_v2_rf_expanded' THEN 'hop_varieties_for_site_ru_bilingual'
      WHEN 'beer_yeasts_all_ru_bilingual_multisource_v3_expanded' THEN 'beer_yeasts_all_ru_bilingual_multisource'
      WHEN 'beer_fermentables_non_malt_multisource_ru_first_v3' THEN 'beer_fermentables_non_malt_multisource_ru_first'
      WHEN 'brewing_consumables_superset_ru_v2' THEN 'brewing_consumables_superset_ru'
      ELSE NULLIF("properties"->>'seedDataset', '')
    END
  ),
  "catalog_source_key" = COALESCE(
    NULLIF("catalog_source_key", ''),
    NULLIF("properties"->>'seedSourceId', '')
  );

ALTER TABLE "ingredient_catalog_items"
  ALTER COLUMN "display_name_ru" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "ingredient_catalog_items_source_uidx"
  ON "ingredient_catalog_items" ("catalog_source_dataset", "catalog_source_key");

CREATE INDEX IF NOT EXISTS "ingredient_catalog_items_display_name_ru_trgm_idx"
  ON "ingredient_catalog_items" USING gin ("display_name_ru" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "ingredient_catalog_items_display_name_en_trgm_idx"
  ON "ingredient_catalog_items" USING gin ("display_name_en" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "ingredient_catalog_items_search_text_norm_trgm_idx"
  ON "ingredient_catalog_items" USING gin ("search_text_norm" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "ingredient_catalog_items_search_aliases_norm_idx"
  ON "ingredient_catalog_items" USING gin ("search_aliases_norm");
