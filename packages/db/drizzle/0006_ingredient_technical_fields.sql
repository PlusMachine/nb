DO $$ BEGIN
 CREATE TYPE "hop_form" AS ENUM('pellet', 'whole_cone', 'lupulin', 'cryo');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "yeast_type" AS ENUM('ale', 'lager', 'wine');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "yeast_form" AS ENUM('dry', 'liquid');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "ingredient_catalog_items"
  ADD COLUMN IF NOT EXISTS "fermentable_color_ebc" double precision,
  ADD COLUMN IF NOT EXISTS "fermentable_extract_yield_pct" double precision,
  ADD COLUMN IF NOT EXISTS "hop_alpha_acid_pct" double precision,
  ADD COLUMN IF NOT EXISTS "hop_form" "hop_form",
  ADD COLUMN IF NOT EXISTS "hop_season" varchar(32),
  ADD COLUMN IF NOT EXISTS "yeast_attenuation_pct" double precision,
  ADD COLUMN IF NOT EXISTS "yeast_type" "yeast_type",
  ADD COLUMN IF NOT EXISTS "yeast_form" "yeast_form",
  ADD COLUMN IF NOT EXISTS "yeast_min_fermentation_temp_c" double precision,
  ADD COLUMN IF NOT EXISTS "yeast_max_fermentation_temp_c" double precision;

ALTER TABLE "user_custom_ingredients"
  ADD COLUMN IF NOT EXISTS "manufacturer" varchar(140),
  ADD COLUMN IF NOT EXISTS "country" varchar(80),
  ADD COLUMN IF NOT EXISTS "fermentable_color_ebc" double precision,
  ADD COLUMN IF NOT EXISTS "fermentable_extract_yield_pct" double precision,
  ADD COLUMN IF NOT EXISTS "hop_alpha_acid_pct" double precision,
  ADD COLUMN IF NOT EXISTS "hop_form" "hop_form",
  ADD COLUMN IF NOT EXISTS "hop_season" varchar(32),
  ADD COLUMN IF NOT EXISTS "yeast_attenuation_pct" double precision,
  ADD COLUMN IF NOT EXISTS "yeast_type" "yeast_type",
  ADD COLUMN IF NOT EXISTS "yeast_form" "yeast_form",
  ADD COLUMN IF NOT EXISTS "yeast_min_fermentation_temp_c" double precision,
  ADD COLUMN IF NOT EXISTS "yeast_max_fermentation_temp_c" double precision;

UPDATE "ingredient_catalog_items"
SET
  "fermentable_color_ebc" = COALESCE("fermentable_color_ebc", NULLIF("properties"->>'colorEbc', '')::double precision),
  "fermentable_extract_yield_pct" = COALESCE("fermentable_extract_yield_pct", NULLIF(COALESCE("properties"->>'extractFgdbPct', "properties"->>'extractYieldPct'), '')::double precision),
  "hop_alpha_acid_pct" = COALESCE("hop_alpha_acid_pct", NULLIF(COALESCE("properties"->>'alphaAcidPercent', "properties"->>'alphaAcid'), '')::double precision),
  "hop_form" = COALESCE("hop_form", CASE COALESCE("properties"->>'hopForm', "properties"->>'form')
    WHEN 'pellet' THEN 'pellet'::"hop_form"
    WHEN 'whole_cone' THEN 'whole_cone'::"hop_form"
    WHEN 'leaf' THEN 'whole_cone'::"hop_form"
    WHEN 'cone' THEN 'whole_cone'::"hop_form"
    WHEN 'lupulin' THEN 'lupulin'::"hop_form"
    WHEN 'cryo' THEN 'cryo'::"hop_form"
    ELSE NULL
  END),
  "hop_season" = COALESCE("hop_season", NULLIF("properties"->>'season', '')),
  "yeast_attenuation_pct" = COALESCE("yeast_attenuation_pct", NULLIF("properties"->>'attenuationPercent', '')::double precision),
  "yeast_type" = COALESCE("yeast_type", CASE "properties"->>'yeastType'
    WHEN 'ale' THEN 'ale'::"yeast_type"
    WHEN 'lager' THEN 'lager'::"yeast_type"
    WHEN 'wine' THEN 'wine'::"yeast_type"
    ELSE NULL
  END),
  "yeast_form" = COALESCE("yeast_form", CASE COALESCE("properties"->>'yeastForm', "properties"->>'form')
    WHEN 'dry' THEN 'dry'::"yeast_form"
    WHEN 'liquid' THEN 'liquid'::"yeast_form"
    ELSE NULL
  END),
  "yeast_min_fermentation_temp_c" = COALESCE("yeast_min_fermentation_temp_c", NULLIF("properties"->>'minTemperatureC', '')::double precision),
  "yeast_max_fermentation_temp_c" = COALESCE("yeast_max_fermentation_temp_c", NULLIF("properties"->>'maxTemperatureC', '')::double precision);

UPDATE "user_custom_ingredients"
SET
  "fermentable_color_ebc" = COALESCE("fermentable_color_ebc", NULLIF("properties"->>'colorEbc', '')::double precision),
  "fermentable_extract_yield_pct" = COALESCE("fermentable_extract_yield_pct", NULLIF(COALESCE("properties"->>'extractFgdbPct', "properties"->>'extractYieldPct'), '')::double precision),
  "hop_alpha_acid_pct" = COALESCE("hop_alpha_acid_pct", NULLIF(COALESCE("properties"->>'alphaAcidPercent', "properties"->>'alphaAcid'), '')::double precision),
  "hop_form" = COALESCE("hop_form", CASE COALESCE("properties"->>'hopForm', "properties"->>'form')
    WHEN 'pellet' THEN 'pellet'::"hop_form"
    WHEN 'whole_cone' THEN 'whole_cone'::"hop_form"
    WHEN 'leaf' THEN 'whole_cone'::"hop_form"
    WHEN 'cone' THEN 'whole_cone'::"hop_form"
    WHEN 'lupulin' THEN 'lupulin'::"hop_form"
    WHEN 'cryo' THEN 'cryo'::"hop_form"
    ELSE NULL
  END),
  "hop_season" = COALESCE("hop_season", NULLIF("properties"->>'season', '')),
  "yeast_attenuation_pct" = COALESCE("yeast_attenuation_pct", NULLIF("properties"->>'attenuationPercent', '')::double precision),
  "yeast_type" = COALESCE("yeast_type", CASE "properties"->>'yeastType'
    WHEN 'ale' THEN 'ale'::"yeast_type"
    WHEN 'lager' THEN 'lager'::"yeast_type"
    WHEN 'wine' THEN 'wine'::"yeast_type"
    ELSE NULL
  END),
  "yeast_form" = COALESCE("yeast_form", CASE COALESCE("properties"->>'yeastForm', "properties"->>'form')
    WHEN 'dry' THEN 'dry'::"yeast_form"
    WHEN 'liquid' THEN 'liquid'::"yeast_form"
    ELSE NULL
  END),
  "yeast_min_fermentation_temp_c" = COALESCE("yeast_min_fermentation_temp_c", NULLIF("properties"->>'minTemperatureC', '')::double precision),
  "yeast_max_fermentation_temp_c" = COALESCE("yeast_max_fermentation_temp_c", NULLIF("properties"->>'maxTemperatureC', '')::double precision);
