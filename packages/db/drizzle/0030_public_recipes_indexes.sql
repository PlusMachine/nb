CREATE INDEX IF NOT EXISTS "recipes_style_id_idx" ON "recipes" USING btree ("style_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipes_abv_idx" ON "recipes" USING btree ("abv");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipes_ibu_idx" ON "recipes" USING btree ("ibu");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipes_color_idx" ON "recipes" USING btree ("color");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipes_updated_at_idx" ON "recipes" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipes_title_idx" ON "recipes" USING btree ("title");
