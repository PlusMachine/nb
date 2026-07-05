ALTER TABLE "recipes" ADD COLUMN "featured_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "recipes_featured_at_idx" ON "recipes" USING btree ("featured_at");