CREATE TABLE IF NOT EXISTS "recipe_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"stars" integer NOT NULL,
	"body" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_ratings_stars_chk" CHECK ("stars" between 1 and 5),
	CONSTRAINT "recipe_ratings_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "recipe_ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "recipe_ratings_recipe_user_uidx" ON "recipe_ratings" USING btree ("recipe_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipe_ratings_recipe_id_idx" ON "recipe_ratings" USING btree ("recipe_id");--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "rating_avg" double precision;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "rating_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipes_rating_avg_idx" ON "recipes" USING btree ("rating_avg");
