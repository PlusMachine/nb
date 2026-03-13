ALTER TABLE "ingredient_catalog_items"
  ADD COLUMN IF NOT EXISTS "technical_data" jsonb DEFAULT '{}'::jsonb NOT NULL;

UPDATE "ingredient_catalog_items"
SET "technical_data" = CASE
  WHEN "category" = 'fermentable'::"ingredient_category" THEN jsonb_strip_nulls(jsonb_build_object(
    'category', 'fermentable',
    'subtype', "subtype",
    'colorEbc', COALESCE("fermentable_color_ebc", NULLIF("properties"->>'colorEbc', '')::double precision),
    'extractYieldPct', COALESCE("fermentable_extract_yield_pct", NULLIF(COALESCE("properties"->>'extractFgdbPct', "properties"->>'extractYieldPct'), '')::double precision),
    'proteinPct', NULLIF("properties"->>'proteinPct', '')::double precision,
    'moisturePct', NULLIF("properties"->>'moisturePct', '')::double precision,
    'maxUsagePercent', NULLIF("properties"->>'maxUsagePercent', '')::double precision,
    'diastaticPowerLintner', NULLIF("properties"->>'diastaticPowerLintner', '')::double precision,
    'usageFlags', CASE
      WHEN jsonb_typeof("properties"->'usageFlags') = 'array' THEN "properties"->'usageFlags'
      ELSE NULL
    END
  ))
  WHEN "category" = 'hop'::"ingredient_category" THEN jsonb_strip_nulls(jsonb_build_object(
    'category', 'hop',
    'subtype', "subtype",
    'alphaAcidPct', COALESCE("hop_alpha_acid_pct", NULLIF(COALESCE("properties"->>'alphaAcidPercent', "properties"->>'alphaAcid'), '')::double precision),
    'betaAcidPct', NULLIF(COALESCE("properties"->>'betaAcidPercent', "properties"->>'betaAcid'), '')::double precision,
    'totalOilMlPer100g', NULLIF(COALESCE("properties"->>'totalOilMlPer100g', "properties"->>'totalOil'), '')::double precision,
    'notes', NULLIF("properties"->>'hopNotes', ''),
    'harvestYear', COALESCE("harvest_year", CASE WHEN "hop_season" ~ '^[0-9]{4}$' THEN "hop_season"::integer ELSE NULL END)
  ))
  WHEN "category" = 'yeast'::"ingredient_category" THEN jsonb_strip_nulls(jsonb_build_object(
    'category', 'yeast',
    'subtype', "subtype",
    'form', COALESCE("properties"->>'technicalYeastForm', "properties"->>'yeastForm', "properties"->>'form', "yeast_form"::text),
    'attenuationPct', COALESCE("yeast_attenuation_pct", NULLIF("properties"->>'attenuationPercent', '')::double precision),
    'tempMinC', COALESCE("yeast_min_fermentation_temp_c", NULLIF("properties"->>'minTemperatureC', '')::double precision),
    'tempMaxC', COALESCE("yeast_max_fermentation_temp_c", NULLIF("properties"->>'maxTemperatureC', '')::double precision),
    'flocculation', NULLIF("properties"->>'flocculation', ''),
    'alcoholTolerancePct', NULLIF("properties"->>'alcoholTolerancePct', '')::double precision,
    'packageSize', NULLIF("properties"->>'packageSize', '')::double precision,
    'packageUnit', NULLIF("properties"->>'packageUnit', ''),
    'phenolic', CASE WHEN "properties" ? 'phenolic' THEN ("properties"->>'phenolic')::boolean ELSE NULL END,
    'diastaticus', CASE WHEN "properties" ? 'diastaticus' THEN ("properties"->>'diastaticus')::boolean ELSE NULL END
  ))
  WHEN "category" = 'water_prep'::"ingredient_category" THEN jsonb_strip_nulls(jsonb_build_object(
    'category', 'water_prep',
    'subtype', "subtype",
    'compound', NULLIF("properties"->>'compound', ''),
    'acidType', NULLIF("properties"->>'acidType', ''),
    'strengthPct', NULLIF(COALESCE("properties"->>'strengthPct', "properties"->>'strength'), '')::double precision,
    'purityPct', NULLIF("properties"->>'purityPct', '')::double precision,
    'physicalForm', NULLIF("properties"->>'physicalForm', '')
  ))
  WHEN "category" = 'misc'::"ingredient_category" THEN jsonb_strip_nulls(jsonb_build_object(
    'category', 'misc',
    'subtype', "subtype",
    'usagePhase', NULLIF(COALESCE("properties"->>'usagePhase', "properties"->>'stage'), ''),
    'doseHint', NULLIF("properties"->>'doseHint', '')
  ))
  ELSE '{}'::jsonb
END;
