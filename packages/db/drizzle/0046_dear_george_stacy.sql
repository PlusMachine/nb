ALTER TABLE "brew_batches" DROP CONSTRAINT "brew_batches_recipe_id_recipes_id_fk";
--> statement-breakpoint
ALTER TABLE "brew_batches" ALTER COLUMN "recipe_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "brew_batches" ADD CONSTRAINT "brew_batches_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE set null ON UPDATE no action;