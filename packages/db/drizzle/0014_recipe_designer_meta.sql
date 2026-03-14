ALTER TABLE "recipes"
  ADD COLUMN "boil_time_minutes" integer NOT NULL DEFAULT 60;
--> statement-breakpoint
ALTER TABLE "recipes"
  ADD COLUMN "process_meta" jsonb;
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
);
