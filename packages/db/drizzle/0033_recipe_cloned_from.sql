ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "cloned_from_recipe_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recipes" ADD CONSTRAINT "recipes_cloned_from_recipe_id_recipes_id_fk" FOREIGN KEY ("cloned_from_recipe_id") REFERENCES "public"."recipes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipes_cloned_from_idx" ON "recipes" USING btree ("cloned_from_recipe_id");
