CREATE TABLE "device_recipe_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"slot" integer NOT NULL,
	"recipe_id" uuid,
	"recipe_name" text NOT NULL,
	"pushed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "device_recipe_slots" ADD CONSTRAINT "device_recipe_slots_device_id_brew_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."brew_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_recipe_slots" ADD CONSTRAINT "device_recipe_slots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_recipe_slots" ADD CONSTRAINT "device_recipe_slots_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "device_recipe_slots_device_slot_uidx" ON "device_recipe_slots" USING btree ("device_id","slot");--> statement-breakpoint
CREATE INDEX "device_recipe_slots_device_id_idx" ON "device_recipe_slots" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "device_recipe_slots_recipe_id_idx" ON "device_recipe_slots" USING btree ("recipe_id");