ALTER TABLE "recipes" ADD COLUMN "clone_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Backfill: счётчик считает копии, снятые ДРУГИМИ пивоварами (копии своих рецептов
-- не считаются) — те же правила, что и у инкремента в cloneRecipeFromPublic.
UPDATE "recipes" AS src
SET "clone_count" = agg."copies"
FROM (
  SELECT copy."cloned_from_recipe_id" AS "source_id", count(*)::int AS "copies"
  FROM "recipes" AS copy
  JOIN "recipes" AS source ON source."id" = copy."cloned_from_recipe_id"
  WHERE copy."cloned_from_recipe_id" IS NOT NULL
    AND copy."author_id" <> source."author_id"
  GROUP BY copy."cloned_from_recipe_id"
) AS agg
WHERE src."id" = agg."source_id";
