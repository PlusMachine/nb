CREATE TYPE "public"."recipe_publication_state" AS ENUM('draft', 'private', 'published');--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "publication_state" "recipe_publication_state";--> statement-breakpoint
UPDATE "recipes"
SET "publication_state" = CASE
  WHEN "status" = 'published' AND "visibility" = 'public' THEN 'published'::"recipe_publication_state"
  WHEN "status" = 'private' THEN 'private'::"recipe_publication_state"
  WHEN "status" = 'published' THEN 'private'::"recipe_publication_state"
  ELSE 'draft'::"recipe_publication_state"
END;--> statement-breakpoint
ALTER TABLE "recipes" ALTER COLUMN "publication_state" SET DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE "recipes" ALTER COLUMN "publication_state" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "recipes_publication_state_idx" ON "recipes" USING btree ("publication_state");--> statement-breakpoint
DROP INDEX IF EXISTS "recipes_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "recipes_visibility_idx";--> statement-breakpoint
ALTER TABLE "recipes" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "recipes" DROP COLUMN "visibility";--> statement-breakpoint
DROP TYPE "public"."recipe_status";--> statement-breakpoint
DROP TYPE "public"."recipe_visibility";--> statement-breakpoint
