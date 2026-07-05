ALTER TABLE "recipes" ADD COLUMN "rating_bayes" double precision;--> statement-breakpoint
CREATE INDEX "recipes_rating_bayes_idx" ON "recipes" USING btree ("rating_bayes");--> statement-breakpoint
-- Бэкфилл байесовского скора для уже оценённых рецептов (IMDb-формула,
-- m=3.8, C=10 — см. apps/web/features/recipes/rating-score.ts). Неоценённые
-- (rating_count = 0) остаются NULL → сортировка «По рейтингу» шлёт их в конец.
UPDATE "recipes"
SET "rating_bayes" = (10 * 3.8 + "rating_avg" * "rating_count") / (10 + "rating_count")
WHERE "rating_count" > 0 AND "rating_avg" IS NOT NULL;