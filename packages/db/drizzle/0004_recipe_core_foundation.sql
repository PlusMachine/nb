CREATE TYPE "public"."recipe_status" AS ENUM('draft', 'private', 'published');--> statement-breakpoint
CREATE TYPE "public"."recipe_visibility" AS ENUM('private', 'public');--> statement-breakpoint
CREATE TYPE "public"."recipe_ingredient_stage" AS ENUM('mash', 'boil', 'whirlpool', 'fermentation', 'packaging', 'other');--> statement-breakpoint

CREATE TABLE "recipes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "author_id" uuid NOT NULL,
  "status" "recipe_status" DEFAULT 'draft' NOT NULL,
  "visibility" "recipe_visibility" DEFAULT 'private' NOT NULL,
  "title" varchar(180) NOT NULL,
  "slug" varchar(220),
  "style_id" varchar(64),
  "batch_size_entered_quantity" double precision NOT NULL,
  "batch_size_entered_unit" varchar(32) NOT NULL,
  "batch_size_normalized_quantity" double precision NOT NULL,
  "batch_size_normalized_unit" varchar(32) NOT NULL,
  "efficiency" double precision,
  "og" double precision,
  "fg" double precision,
  "abv" double precision,
  "ibu" double precision,
  "color" double precision,
  "description" text,
  "author_notes" text,
  "hero_image_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "recipe_ingredients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "recipe_id" uuid NOT NULL,
  "ingredient_catalog_item_id" uuid,
  "user_custom_ingredient_id" uuid,
  "type" "ingredient_type" NOT NULL,
  "amount_entered_quantity" double precision NOT NULL,
  "amount_entered_unit" varchar(32) NOT NULL,
  "amount_normalized_quantity" double precision NOT NULL,
  "amount_normalized_unit" varchar(32) NOT NULL,
  "stage" "recipe_ingredient_stage" DEFAULT 'other' NOT NULL,
  "time_offset" integer,
  "step_meta" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "recipe_ingredients_source_linkage_chk" CHECK (((ingredient_catalog_item_id is not null and user_custom_ingredient_id is null) or (ingredient_catalog_item_id is null and user_custom_ingredient_id is not null)))
);--> statement-breakpoint

ALTER TABLE "recipes" ADD CONSTRAINT "recipes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_ingredient_catalog_item_id_ingredient_catalog_items_id_fk" FOREIGN KEY ("ingredient_catalog_item_id") REFERENCES "public"."ingredient_catalog_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_user_custom_ingredient_id_user_custom_ingredients_id_fk" FOREIGN KEY ("user_custom_ingredient_id") REFERENCES "public"."user_custom_ingredients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "recipes_author_id_idx" ON "recipes" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "recipes_status_idx" ON "recipes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "recipes_visibility_idx" ON "recipes" USING btree ("visibility");--> statement-breakpoint
CREATE UNIQUE INDEX "recipes_slug_uidx" ON "recipes" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "recipe_ingredients_recipe_id_idx" ON "recipe_ingredients" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "recipe_ingredients_catalog_item_idx" ON "recipe_ingredients" USING btree ("ingredient_catalog_item_id");--> statement-breakpoint
CREATE INDEX "recipe_ingredients_custom_item_idx" ON "recipe_ingredients" USING btree ("user_custom_ingredient_id");
