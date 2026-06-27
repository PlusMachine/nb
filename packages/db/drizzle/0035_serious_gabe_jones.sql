CREATE TABLE "device_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" uuid,
	"name" text NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "device_profiles" ADD CONSTRAINT "device_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_profiles" ADD CONSTRAINT "device_profiles_device_id_brew_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."brew_devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_profiles_user_id_idx" ON "device_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "device_profiles_device_id_idx" ON "device_profiles" USING btree ("device_id");