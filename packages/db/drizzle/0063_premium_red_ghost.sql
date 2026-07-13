ALTER TABLE "brew_batches" ADD COLUMN "brew_number" integer;--> statement-breakpoint
UPDATE "brew_batches" AS "bb" SET "brew_number" = "ranked"."rn"
FROM (
	SELECT "id", row_number() OVER (PARTITION BY "user_id", "recipe_id" ORDER BY "created_at", "id") AS "rn"
	FROM "brew_batches"
) AS "ranked"
WHERE "bb"."id" = "ranked"."id";--> statement-breakpoint
ALTER TABLE "brew_batches" ALTER COLUMN "brew_number" SET NOT NULL;
