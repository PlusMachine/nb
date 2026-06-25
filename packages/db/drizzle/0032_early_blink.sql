CREATE TABLE IF NOT EXISTS "recipe_saves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_saves_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "recipe_saves_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "recipe_saves_recipe_user_uidx" ON "recipe_saves" USING btree ("recipe_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipe_saves_user_idx" ON "recipe_saves" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipe_saves_recipe_idx" ON "recipe_saves" USING btree ("recipe_id");--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "save_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipes_save_count_idx" ON "recipes" USING btree ("save_count");
