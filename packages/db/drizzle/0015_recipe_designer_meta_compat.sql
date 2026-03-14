ALTER TABLE "recipes"
  ADD COLUMN IF NOT EXISTS "boil_time_minutes" integer;
--> statement-breakpoint
ALTER TABLE "recipes"
  ALTER COLUMN "boil_time_minutes" SET DEFAULT 60;
--> statement-breakpoint
UPDATE "recipes"
SET "boil_time_minutes" = GREATEST(
  COALESCE((
    SELECT MAX(COALESCE(ri."time_offset", 60))
    FROM "recipe_ingredients" ri
    WHERE ri."recipe_id" = "recipes"."id"
      AND ri."type" = 'hop'
      AND ri."stage" = 'boil'
  ), 60),
  1
)
WHERE "boil_time_minutes" IS NULL;
--> statement-breakpoint
ALTER TABLE "recipes"
  ALTER COLUMN "boil_time_minutes" SET NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recipes'
      AND column_name = 'designer_meta'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recipes'
      AND column_name = 'process_meta'
  ) THEN
    ALTER TABLE "recipes" RENAME COLUMN "designer_meta" TO "process_meta";
  END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE "recipes"
  ADD COLUMN IF NOT EXISTS "process_meta" jsonb;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recipes'
      AND column_name = 'designer_meta'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'recipes'
      AND column_name = 'process_meta'
  ) THEN
    EXECUTE '
      UPDATE "recipes"
      SET "process_meta" = COALESCE("process_meta", "designer_meta")
      WHERE "designer_meta" IS NOT NULL
    ';
    ALTER TABLE "recipes" DROP COLUMN "designer_meta";
  END IF;
END
$$;
