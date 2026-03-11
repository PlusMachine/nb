DO $$ BEGIN
 CREATE TYPE "inventory_unit_dimension" AS ENUM('weight', 'volume', 'count');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_ingredients'
      AND column_name = 'quantity'
  ) THEN
    ALTER TABLE "user_ingredients" RENAME COLUMN "quantity" TO "entered_quantity";
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_ingredients'
      AND column_name = 'unit'
  ) THEN
    ALTER TABLE "user_ingredients" RENAME COLUMN "unit" TO "entered_unit";
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'user_ingredients'
  ) THEN
    ALTER TABLE "user_ingredients"
      ALTER COLUMN "entered_quantity" TYPE double precision USING "entered_quantity"::double precision;

    ALTER TABLE "user_ingredients"
      ADD COLUMN IF NOT EXISTS "normalized_quantity" double precision,
      ADD COLUMN IF NOT EXISTS "normalized_unit" varchar(32),
      ADD COLUMN IF NOT EXISTS "unit_dimension" "inventory_unit_dimension";

    UPDATE "user_ingredients"
    SET
      "normalized_quantity" = CASE
        WHEN "entered_unit" = 'kg' THEN round(("entered_quantity" * 1000)::numeric, 3)::double precision
        WHEN "entered_unit" = 'oz' THEN round(("entered_quantity" * 28.349523125)::numeric, 3)::double precision
        WHEN "entered_unit" = 'lb' THEN round(("entered_quantity" * 453.59237)::numeric, 3)::double precision
        WHEN "entered_unit" = 'l' THEN round(("entered_quantity" * 1000)::numeric, 3)::double precision
        WHEN "entered_unit" = 'gal' THEN round(("entered_quantity" * 3785.411784)::numeric, 3)::double precision
        ELSE "entered_quantity"
      END,
      "normalized_unit" = CASE
        WHEN "entered_unit" IN ('g', 'kg', 'oz', 'lb') THEN 'g'
        WHEN "entered_unit" IN ('ml', 'l', 'gal') THEN 'ml'
        ELSE "entered_unit"
      END,
      "unit_dimension" = CASE
        WHEN "entered_unit" IN ('g', 'kg', 'oz', 'lb') THEN 'weight'::"inventory_unit_dimension"
        WHEN "entered_unit" IN ('ml', 'l', 'gal') THEN 'volume'::"inventory_unit_dimension"
        ELSE 'count'::"inventory_unit_dimension"
      END
    WHERE "normalized_quantity" IS NULL
       OR "normalized_unit" IS NULL
       OR "unit_dimension" IS NULL;

    ALTER TABLE "user_ingredients"
      ALTER COLUMN "normalized_quantity" SET NOT NULL,
      ALTER COLUMN "normalized_unit" SET NOT NULL,
      ALTER COLUMN "unit_dimension" SET NOT NULL;

    ALTER TABLE "user_ingredients" DROP CONSTRAINT IF EXISTS "user_ingredients_quantity_positive_chk";
    ALTER TABLE "user_ingredients" DROP CONSTRAINT IF EXISTS "user_ingredients_entered_quantity_positive_chk";
    ALTER TABLE "user_ingredients" DROP CONSTRAINT IF EXISTS "user_ingredients_normalized_quantity_positive_chk";
    ALTER TABLE "user_ingredients"
      ADD CONSTRAINT "user_ingredients_entered_quantity_positive_chk" CHECK ("entered_quantity" > 0);
    ALTER TABLE "user_ingredients"
      ADD CONSTRAINT "user_ingredients_normalized_quantity_positive_chk" CHECK ("normalized_quantity" > 0);
  END IF;
END $$;
