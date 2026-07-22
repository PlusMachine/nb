CREATE TABLE "shopping_line_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"line_key" text NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopping_manual_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(180) NOT NULL,
	"quantity" double precision,
	"unit" varchar(32),
	"category" "ingredient_category",
	"ingredient_catalog_item_id" text,
	"user_custom_ingredient_id" uuid,
	"checked_at" timestamp with time zone,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shopping_manual_items_quantity_unit_pair_chk" CHECK (((quantity is null and unit is null) or (quantity is not null and unit is not null))),
	CONSTRAINT "shopping_manual_items_source_linkage_chk" CHECK ((ingredient_catalog_item_id is null or user_custom_ingredient_id is null))
);
--> statement-breakpoint
ALTER TABLE "shopping_line_checks" ADD CONSTRAINT "shopping_line_checks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_manual_items" ADD CONSTRAINT "shopping_manual_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_manual_items" ADD CONSTRAINT "shopping_manual_items_ingredient_catalog_item_id_ingredients_id_fk" FOREIGN KEY ("ingredient_catalog_item_id") REFERENCES "public"."ingredients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_manual_items" ADD CONSTRAINT "shopping_manual_items_user_custom_ingredient_id_user_custom_ingredients_id_fk" FOREIGN KEY ("user_custom_ingredient_id") REFERENCES "public"."user_custom_ingredients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shopping_line_checks_user_line_key_uidx" ON "shopping_line_checks" USING btree ("user_id","line_key");--> statement-breakpoint
CREATE INDEX "shopping_manual_items_user_id_idx" ON "shopping_manual_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shopping_manual_items_user_checked_at_idx" ON "shopping_manual_items" USING btree ("user_id","checked_at");